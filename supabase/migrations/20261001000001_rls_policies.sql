-- TsheetGRT · SI Holdings — Segurança: funções, triggers de proteção, auditoria e RLS
--
-- Princípios:
--   * Todas as funções usam search_path vazio e nomes totalmente qualificados.
--   * Os triggers de proteção são SECURITY INVOKER e só restringem pedidos da API
--     (current_user = 'authenticated'). Funções SECURITY DEFINER, service_role e o SQL Editor
--     correm com outro current_user e não passam por essas restrições.
--   * A auditoria é escrita exclusivamente por triggers e funções do servidor: o cliente não insere eventos.
--   * Funções internas vivem no schema "private", que não é exposto pela API (PostgREST).

CREATE SCHEMA private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated;

-- =============================================================================
-- 1. CONTEXTO DE SEGURANÇA
-- =============================================================================

-- Perfil ativo associado à sessão atual (NULL se não existir ou estiver desativado).
CREATE FUNCTION public.get_current_profile_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id
    FROM public.profiles p
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = true;
$$;

-- Permissões explícitas: não existe atalho implícito para ADMIN.
CREATE FUNCTION public.has_permission(p_permission_code TEXT)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        JOIN public.role_permissions rp ON rp.role_id = ur.role_id
        JOIN public.permissions perm ON perm.id = rp.permission_id
        WHERE p.auth_user_id = auth.uid()
          AND p.is_active = true
          AND perm.code = p_permission_code
    );
$$;

CREATE FUNCTION public.is_manager_of_employee(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.manager_scopes ms
        JOIN public.profiles employee ON employee.id = p_employee_id
        WHERE ms.manager_id = public.get_current_profile_id()
          AND (ms.employee_id = p_employee_id OR ms.department_id = employee.department_id)
    );
$$;

-- Permissões efetivas do utilizador autenticado (usado pelo frontend após o login).
CREATE FUNCTION public.get_my_permissions()
RETURNS SETOF TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT perm.code::TEXT
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    JOIN public.role_permissions rp ON rp.role_id = ur.role_id
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE p.auth_user_id = auth.uid()
      AND p.is_active = true
    ORDER BY perm.code;
$$;

CREATE FUNCTION private.is_admin_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1
        FROM public.user_roles ur
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = p_profile_id
          AND r.code = 'ADMIN'
    );
$$;

-- =============================================================================
-- 2. AUDITORIA
-- =============================================================================
CREATE FUNCTION private.write_audit_event(
    p_action TEXT,
    p_entity_type TEXT,
    p_entity_id TEXT,
    p_description TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_headers JSONB;
    v_ip_address TEXT;
BEGIN
    -- Cabeçalhos do pedido HTTP disponibilizados pelo PostgREST (NULL fora da API).
    v_headers := nullif(current_setting('request.headers', true), '')::JSONB;
    v_ip_address := nullif(btrim(split_part(coalesce(v_headers ->> 'x-forwarded-for', ''), ',', 1)), '');

    INSERT INTO public.audit_events (actor_user_id, action, entity_type, entity_id, description, ip_address, user_agent)
    VALUES (
        public.get_current_profile_id(),
        p_action,
        p_entity_type,
        p_entity_id,
        p_description,
        left(v_ip_address, 45),
        v_headers ->> 'user-agent'
    );
END;
$$;

-- Eventos de sessão registados pelo frontend. Só ações conhecidas são aceites e o
-- ator é sempre o utilizador autenticado, por isso não é possível forjar eventos.
CREATE FUNCTION public.log_auth_event(p_action TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile public.profiles%ROWTYPE;
BEGIN
    IF p_action NOT IN ('auth.login.success', 'auth.logout', 'auth.password.changed') THEN
        RAISE EXCEPTION 'Evento de autenticação inválido: %', p_action;
    END IF;

    SELECT * INTO v_profile
    FROM public.profiles
    WHERE auth_user_id = auth.uid()
      AND is_active = true;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    IF p_action = 'auth.login.success' THEN
        UPDATE public.profiles SET last_login_at = now() WHERE id = v_profile.id;
    ELSIF p_action = 'auth.password.changed' THEN
        UPDATE public.profiles SET must_change_password = false WHERE id = v_profile.id;
    END IF;

    PERFORM private.write_audit_event(
        p_action,
        'auth',
        v_profile.id::TEXT,
        CASE p_action
            WHEN 'auth.login.success' THEN 'Início de sessão: ' || v_profile.full_name
            WHEN 'auth.logout' THEN 'Sessão terminada: ' || v_profile.full_name
            ELSE 'Palavra-passe alterada: ' || v_profile.full_name
        END
    );
END;
$$;

-- =============================================================================
-- 3. PROTEÇÃO DO ÚLTIMO ADMINISTRADOR
-- =============================================================================
CREATE FUNCTION private.assert_other_active_admin(p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- Serializa operações concorrentes sobre administradores (evita que dois admins se desativem em simultâneo).
    PERFORM pg_advisory_xact_lock(hashtext('tsheetgrt.admin_guard'));

    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        JOIN public.roles r ON r.id = ur.role_id
        WHERE r.code = 'ADMIN'
          AND p.is_active = true
          AND p.auth_user_id IS NOT NULL
          AND p.id <> p_profile_id
    ) THEN
        RAISE EXCEPTION 'Operação recusada: tem de existir pelo menos um administrador ativo no sistema.';
    END IF;
END;
$$;

-- =============================================================================
-- 4. PROFILES — regras de alteração e auditoria
-- =============================================================================
CREATE FUNCTION public.guard_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        IF OLD.is_active AND private.is_admin_profile(OLD.id) THEN
            PERFORM private.assert_other_active_admin(OLD.id);
        END IF;
        RETURN OLD;
    END IF;

    IF current_user = 'authenticated' THEN
        IF NEW.department_id IS NOT NULL
           AND (TG_OP = 'INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id)
           AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = NEW.department_id AND d.active) THEN
            RAISE EXCEPTION 'O departamento selecionado não existe ou está inativo.';
        END IF;

        IF TG_OP = 'INSERT' THEN
            NEW.last_login_at := NULL;
            NEW.must_change_password := false;
            RETURN NEW;
        END IF;

        IF NEW.id <> OLD.id
           OR NEW.auth_user_id IS DISTINCT FROM OLD.auth_user_id
           OR NEW.email <> OLD.email
           OR NEW.employee_number <> OLD.employee_number
           OR NEW.created_at <> OLD.created_at
           OR NEW.last_login_at IS DISTINCT FROM OLD.last_login_at
           OR NEW.must_change_password <> OLD.must_change_password THEN
            RAISE EXCEPTION 'Este campo do perfil não pode ser alterado.' USING ERRCODE = '42501';
        END IF;

        IF (NEW.full_name, NEW.department_id, NEW.job_title) IS DISTINCT FROM (OLD.full_name, OLD.department_id, OLD.job_title)
           AND NOT public.has_permission('USERS_UPDATE') THEN
            RAISE EXCEPTION 'Não tem permissão para alterar os dados institucionais deste utilizador.' USING ERRCODE = '42501';
        END IF;

        IF (NEW.phone, NEW.avatar_url) IS DISTINCT FROM (OLD.phone, OLD.avatar_url)
           AND OLD.auth_user_id IS DISTINCT FROM auth.uid()
           AND NOT public.has_permission('USERS_UPDATE') THEN
            RAISE EXCEPTION 'Não tem permissão para alterar os contactos deste utilizador.' USING ERRCODE = '42501';
        END IF;

        IF NEW.is_active <> OLD.is_active THEN
            IF NOT public.has_permission('USERS_DISABLE') THEN
                RAISE EXCEPTION 'Não tem permissão para ativar ou desativar utilizadores.' USING ERRCODE = '42501';
            END IF;
            IF OLD.auth_user_id = auth.uid() THEN
                RAISE EXCEPTION 'Não pode alterar o estado da sua própria conta.';
            END IF;
        END IF;
    END IF;

    -- Aplica-se a qualquer origem (API, service_role, remoção da conta em auth.users).
    IF TG_OP = 'UPDATE'
       AND OLD.is_active
       AND OLD.auth_user_id IS NOT NULL
       AND (NOT NEW.is_active OR NEW.auth_user_id IS NULL)
       AND private.is_admin_profile(OLD.id) THEN
        PERFORM private.assert_other_active_admin(OLD.id);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.guard_profile_changes();

CREATE FUNCTION public.audit_profile_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('user.created', 'profiles', NEW.id::TEXT,
            'Utilizador criado: ' || NEW.full_name || ' (' || NEW.email || ')');
        RETURN NEW;
    END IF;

    IF NEW.is_active <> OLD.is_active THEN
        PERFORM private.write_audit_event(
            CASE WHEN NEW.is_active THEN 'user.enabled' ELSE 'user.disabled' END,
            'profiles', NEW.id::TEXT,
            'Utilizador ' || CASE WHEN NEW.is_active THEN 'ativado' ELSE 'desativado' END || ': ' || NEW.full_name);
    END IF;

    IF (NEW.full_name, NEW.phone, NEW.department_id, NEW.job_title, NEW.avatar_url)
       IS DISTINCT FROM (OLD.full_name, OLD.phone, OLD.department_id, OLD.job_title, OLD.avatar_url) THEN
        PERFORM private.write_audit_event('user.updated', 'profiles', NEW.id::TEXT,
            'Dados do utilizador atualizados: ' || NEW.full_name);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_profiles_audit
    AFTER INSERT OR UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.audit_profile_changes();

-- =============================================================================
-- 5. USER_ROLES — atribuição de perfis de acesso
-- =============================================================================
CREATE FUNCTION public.guard_user_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_old_role_code TEXT;
    v_new_role_code TEXT;
BEGIN
    IF TG_OP <> 'INSERT' THEN
        SELECT code INTO v_old_role_code FROM public.roles WHERE id = OLD.role_id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
        SELECT code INTO v_new_role_code FROM public.roles WHERE id = NEW.role_id;
    END IF;

    IF current_user = 'authenticated' THEN
        IF TG_OP = 'UPDATE' AND NEW.user_id <> OLD.user_id THEN
            RAISE EXCEPTION 'Não é possível transferir uma atribuição de perfil para outro utilizador.' USING ERRCODE = '42501';
        END IF;
        -- Impede escalada de privilégios por quem tenha recebido USERS_ASSIGN_ROLE sem ser administrador.
        IF v_new_role_code = 'ADMIN' AND NOT public.has_permission('ADMIN_ACCESS') THEN
            RAISE EXCEPTION 'Apenas administradores podem atribuir o perfil ADMIN.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_old_role_code = 'ADMIN'
       AND (TG_OP = 'DELETE' OR v_new_role_code <> 'ADMIN')
       AND EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = OLD.user_id AND p.is_active AND p.auth_user_id IS NOT NULL) THEN
        PERFORM private.assert_other_active_admin(OLD.user_id);
    END IF;

    IF TG_OP = 'DELETE' THEN
        RETURN OLD;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_guard
    BEFORE INSERT OR UPDATE OR DELETE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.guard_user_role_changes();

CREATE FUNCTION public.audit_user_role_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_user_name TEXT;
    v_new_role_code TEXT;
    v_old_role_code TEXT;
BEGIN
    SELECT full_name INTO v_user_name FROM public.profiles WHERE id = NEW.user_id;
    SELECT code INTO v_new_role_code FROM public.roles WHERE id = NEW.role_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('user.role.assigned', 'user_roles', NEW.user_id::TEXT,
            'Perfil de acesso ' || v_new_role_code || ' atribuído a ' || v_user_name);
    ELSIF NEW.role_id <> OLD.role_id THEN
        SELECT code INTO v_old_role_code FROM public.roles WHERE id = OLD.role_id;
        PERFORM private.write_audit_event('user.role.changed', 'user_roles', NEW.user_id::TEXT,
            'Perfil de acesso de ' || v_user_name || ' alterado de ' || v_old_role_code || ' para ' || v_new_role_code);
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_roles_audit
    AFTER INSERT OR UPDATE ON public.user_roles
    FOR EACH ROW EXECUTE FUNCTION public.audit_user_role_changes();

-- Criação atómica de perfil + perfil de acesso. SECURITY INVOKER: corre com as permissões
-- do utilizador autenticado, por isso as políticas RLS (USERS_CREATE, USERS_ASSIGN_ROLE) aplicam-se.
-- Chamado pela Edge Function admin-create-user depois de criar o convite em auth.users.
CREATE FUNCTION public.create_user_profile(
    p_auth_user_id UUID,
    p_full_name TEXT,
    p_email TEXT,
    p_role_code TEXT,
    p_department_id UUID,
    p_job_title TEXT DEFAULT NULL,
    p_phone TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_role_id UUID;
    v_profile_id UUID;
BEGIN
    IF p_department_id IS NULL THEN
        RAISE EXCEPTION 'O departamento é obrigatório.';
    END IF;

    SELECT id INTO v_role_id FROM public.roles WHERE code = p_role_code;
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Perfil de acesso inválido: %', p_role_code;
    END IF;

    INSERT INTO public.profiles (auth_user_id, full_name, email, department_id, job_title, phone)
    VALUES (
        p_auth_user_id,
        btrim(p_full_name),
        lower(btrim(p_email)),
        p_department_id,
        nullif(btrim(coalesce(p_job_title, '')), ''),
        nullif(btrim(coalesce(p_phone, '')), '')
    )
    RETURNING id INTO v_profile_id;

    INSERT INTO public.user_roles (user_id, role_id) VALUES (v_profile_id, v_role_id);

    RETURN v_profile_id;
END;
$$;

-- =============================================================================
-- 6. ROLES E PERMISSÕES
-- =============================================================================
-- Substitui o conjunto de permissões de um perfil numa única transação, com um único evento de auditoria.
CREATE FUNCTION public.set_role_permissions(p_role_code TEXT, p_permission_codes TEXT[])
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_role_id UUID;
    v_unknown_codes TEXT;
    v_added TEXT;
    v_removed TEXT;
BEGIN
    IF NOT public.has_permission('PERMISSIONS_MANAGE') THEN
        RAISE EXCEPTION 'Não tem permissão para gerir permissões.' USING ERRCODE = '42501';
    END IF;

    SELECT id INTO v_role_id FROM public.roles WHERE code = p_role_code;
    IF v_role_id IS NULL THEN
        RAISE EXCEPTION 'Perfil de acesso inválido: %', p_role_code;
    END IF;

    -- O perfil ADMIN mantém sempre todas as permissões: evita que o sistema fique sem quem o administre.
    IF p_role_code = 'ADMIN' THEN
        RAISE EXCEPTION 'As permissões do perfil ADMIN não podem ser alteradas.';
    END IF;

    IF 'ADMIN_ACCESS' = ANY (p_permission_codes) THEN
        RAISE EXCEPTION 'A permissão ADMIN_ACCESS é exclusiva do perfil ADMIN.';
    END IF;

    SELECT string_agg(requested.code, ', ') INTO v_unknown_codes
    FROM unnest(p_permission_codes) AS requested(code)
    WHERE NOT EXISTS (SELECT 1 FROM public.permissions perm WHERE perm.code = requested.code);

    IF v_unknown_codes IS NOT NULL THEN
        RAISE EXCEPTION 'Permissões desconhecidas: %', v_unknown_codes;
    END IF;

    SELECT string_agg(perm.code, ', ' ORDER BY perm.code) INTO v_removed
    FROM public.role_permissions rp
    JOIN public.permissions perm ON perm.id = rp.permission_id
    WHERE rp.role_id = v_role_id
      AND NOT (perm.code = ANY (p_permission_codes));

    SELECT string_agg(perm.code, ', ' ORDER BY perm.code) INTO v_added
    FROM public.permissions perm
    WHERE perm.code = ANY (p_permission_codes)
      AND NOT EXISTS (SELECT 1 FROM public.role_permissions rp WHERE rp.role_id = v_role_id AND rp.permission_id = perm.id);

    IF v_added IS NULL AND v_removed IS NULL THEN
        RETURN;
    END IF;

    DELETE FROM public.role_permissions rp
    USING public.permissions perm
    WHERE rp.role_id = v_role_id
      AND perm.id = rp.permission_id
      AND NOT (perm.code = ANY (p_permission_codes));

    INSERT INTO public.role_permissions (role_id, permission_id)
    SELECT v_role_id, perm.id
    FROM public.permissions perm
    WHERE perm.code = ANY (p_permission_codes)
    ON CONFLICT (role_id, permission_id) DO NOTHING;

    PERFORM private.write_audit_event('permission.changed', 'role_permissions', p_role_code,
        'Permissões do perfil ' || p_role_code || ' atualizadas. Adicionadas: ' || coalesce(v_added, 'nenhuma')
        || '. Removidas: ' || coalesce(v_removed, 'nenhuma') || '.');
END;
$$;

-- =============================================================================
-- 7. DEPARTAMENTOS
-- =============================================================================
CREATE FUNCTION public.guard_department_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF current_user = 'authenticated' AND NEW.code <> OLD.code THEN
        RAISE EXCEPTION 'O código do departamento não pode ser alterado.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_departments_guard
    BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.guard_department_changes();

CREATE FUNCTION public.audit_department_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('department.created', 'departments', NEW.id::TEXT,
            'Departamento criado: ' || NEW.name || ' (' || NEW.code || ')');
        RETURN NEW;
    END IF;

    IF NEW.active <> OLD.active THEN
        PERFORM private.write_audit_event(
            CASE WHEN NEW.active THEN 'department.enabled' ELSE 'department.disabled' END,
            'departments', NEW.id::TEXT,
            'Departamento ' || CASE WHEN NEW.active THEN 'ativado' ELSE 'desativado' END || ': ' || NEW.name);
    END IF;

    IF (NEW.name, NEW.description) IS DISTINCT FROM (OLD.name, OLD.description) THEN
        PERFORM private.write_audit_event('department.updated', 'departments', NEW.id::TEXT,
            'Departamento atualizado: ' || NEW.name || ' (' || NEW.code || ')');
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_departments_audit
    AFTER INSERT OR UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.audit_department_changes();

-- =============================================================================
-- 8. DEFINIÇÕES DO SISTEMA
-- =============================================================================
CREATE FUNCTION public.validate_system_setting()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.key <> OLD.key THEN
        RAISE EXCEPTION 'A chave de uma definição não pode ser alterada.';
    END IF;

    CASE NEW.key
        WHEN 'COMPANY_NAME' THEN
            IF length(btrim(NEW.value)) NOT BETWEEN 2 AND 150 THEN
                RAISE EXCEPTION 'O nome da empresa deve ter entre 2 e 150 carateres.';
            END IF;
            NEW.value := btrim(NEW.value);
        WHEN 'DEFAULT_TIMEZONE' THEN
            IF NOT EXISTS (SELECT 1 FROM pg_catalog.pg_timezone_names WHERE name = NEW.value) THEN
                RAISE EXCEPTION 'Fuso horário inválido: %', NEW.value;
            END IF;
        WHEN 'DEFAULT_LANGUAGE' THEN
            IF NEW.value <> 'pt-PT' THEN
                RAISE EXCEPTION 'Idioma não suportado: %', NEW.value;
            END IF;
        WHEN 'TIMESHEET_PERIOD_TYPE' THEN
            IF NEW.value NOT IN ('MONTHLY', 'BIWEEKLY', 'WEEKLY') THEN
                RAISE EXCEPTION 'Ciclo de apuração inválido: %', NEW.value;
            END IF;
        WHEN 'TIMESHEET_DAILY_TARGET_HOURS' THEN
            IF NEW.value !~ '^[0-9]{1,2}$' OR NEW.value::INTEGER NOT BETWEEN 1 AND 12 THEN
                RAISE EXCEPTION 'A meta diária deve ser um número inteiro entre 1 e 12 horas.';
            END IF;
        WHEN 'ALLOW_WEEKEND_ENTRIES' THEN
            IF NEW.value NOT IN ('true', 'false') THEN
                RAISE EXCEPTION 'Valor inválido para registo ao fim de semana: %', NEW.value;
            END IF;
        ELSE
            NULL;
    END CASE;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_settings_validate
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.validate_system_setting();

CREATE FUNCTION public.audit_system_setting_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NEW.value <> OLD.value THEN
        PERFORM private.write_audit_event('system.settings.changed', 'system_settings', NEW.key,
            'Definição ' || NEW.key || ' alterada de "' || OLD.value || '" para "' || NEW.value || '"');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_settings_audit
    AFTER UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.audit_system_setting_changes();

-- Atualiza várias definições numa única transação. SECURITY INVOKER: a política RLS
-- SYSTEM_SETTINGS_MANAGE aplica-se a cada UPDATE.
CREATE FUNCTION public.update_system_settings(p_settings JSONB)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $$
DECLARE
    v_setting RECORD;
BEGIN
    IF NOT public.has_permission('SYSTEM_SETTINGS_MANAGE') THEN
        RAISE EXCEPTION 'Não tem permissão para alterar as configurações do sistema.' USING ERRCODE = '42501';
    END IF;

    FOR v_setting IN SELECT key, value FROM jsonb_each_text(p_settings) LOOP
        UPDATE public.system_settings SET value = v_setting.value WHERE key = v_setting.key;
        IF NOT FOUND THEN
            RAISE EXCEPTION 'Definição desconhecida: %', v_setting.key;
        END IF;
    END LOOP;
END;
$$;

-- =============================================================================
-- 9. TIMESHEETS — auditoria de ciclo de vida
-- =============================================================================
CREATE FUNCTION public.audit_timesheet_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_period TEXT;
BEGIN
    v_period := to_char(NEW.period_start, 'DD/MM/YYYY') || ' a ' || to_char(NEW.period_end, 'DD/MM/YYYY');

    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('timesheet.created', 'timesheets', NEW.id::TEXT,
            'Timesheet criado para o período ' || v_period);
    ELSIF NEW.status <> OLD.status THEN
        PERFORM private.write_audit_event(
            CASE NEW.status
                WHEN 'SUBMITTED' THEN 'timesheet.submitted'
                WHEN 'APPROVED' THEN 'timesheet.approved'
                WHEN 'REJECTED' THEN 'timesheet.rejected'
                WHEN 'LOCKED' THEN 'timesheet.locked'
                ELSE 'timesheet.reopened'
            END,
            'timesheets', NEW.id::TEXT,
            'Timesheet do período ' || v_period || ' passou de ' || OLD.status || ' para ' || NEW.status);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_timesheets_audit
    AFTER INSERT OR UPDATE ON public.timesheets
    FOR EACH ROW EXECUTE FUNCTION public.audit_timesheet_changes();

-- =============================================================================
-- 10. PRIMEIRO ADMINISTRADOR
-- =============================================================================
-- Executar apenas no SQL Editor (role postgres), depois de convidar o utilizador em
-- Authentication > Users. Recusa a operação se já existir um administrador ativo.
CREATE FUNCTION public.bootstrap_first_admin(p_email TEXT, p_full_name TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_email TEXT := lower(btrim(p_email));
    v_auth_user_id UUID;
    v_profile_id UUID;
    v_admin_role_id UUID;
BEGIN
    IF EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        JOIN public.roles r ON r.id = ur.role_id
        WHERE r.code = 'ADMIN' AND p.is_active AND p.auth_user_id IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Já existe um administrador ativo. Utilize a área Admin para gerir utilizadores.';
    END IF;

    SELECT id INTO v_auth_user_id FROM auth.users WHERE lower(email) = v_email;
    IF v_auth_user_id IS NULL THEN
        RAISE EXCEPTION 'Não existe nenhuma conta em Authentication > Users com o e-mail %. Convide primeiro o utilizador.', v_email;
    END IF;

    SELECT id INTO v_admin_role_id FROM public.roles WHERE code = 'ADMIN';

    SELECT id INTO v_profile_id
    FROM public.profiles
    WHERE auth_user_id = v_auth_user_id OR email = v_email;

    IF v_profile_id IS NULL THEN
        INSERT INTO public.profiles (auth_user_id, full_name, email)
        VALUES (v_auth_user_id, btrim(p_full_name), v_email)
        RETURNING id INTO v_profile_id;
    ELSE
        UPDATE public.profiles
        SET auth_user_id = v_auth_user_id, is_active = true
        WHERE id = v_profile_id;
    END IF;

    INSERT INTO public.user_roles (user_id, role_id)
    VALUES (v_profile_id, v_admin_role_id)
    ON CONFLICT (user_id) DO UPDATE SET role_id = EXCLUDED.role_id;

    PERFORM private.write_audit_event('user.admin.bootstrap', 'profiles', v_profile_id::TEXT,
        'Primeiro administrador configurado: ' || v_email);

    RETURN v_profile_id;
END;
$$;

-- =============================================================================
-- 11. PRIVILÉGIOS DE EXECUÇÃO
-- =============================================================================
-- O Supabase concede EXECUTE a anon/authenticated por omissão; restringimos explicitamente.
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- Usadas pelos triggers de proteção (SECURITY INVOKER) durante pedidos da API.
GRANT EXECUTE ON FUNCTION private.is_admin_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_other_active_admin(UUID) TO authenticated;

-- Necessárias à avaliação das políticas RLS e ao frontend autenticado.
GRANT EXECUTE ON FUNCTION public.get_current_profile_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_permission(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_manager_of_employee(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_permissions() TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_auth_event(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_user_profile(UUID, TEXT, TEXT, TEXT, UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_role_permissions(TEXT, TEXT[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_system_settings(JSONB) TO authenticated;

-- O bootstrap só pode ser executado pelo SQL Editor (postgres).
REVOKE EXECUTE ON FUNCTION public.bootstrap_first_admin(TEXT, TEXT) FROM service_role;

-- =============================================================================
-- 12. PRIVILÉGIOS DE TABELA
-- =============================================================================
-- A aplicação nunca acede como anónimo.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;

-- Escritas só através de triggers/funções do servidor.
REVOKE INSERT, UPDATE, DELETE ON public.audit_events FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.roles, public.permissions, public.role_permissions FROM authenticated;

-- Notificações: o utilizador apenas pode marcar como lida.
REVOKE INSERT, UPDATE, DELETE ON public.notifications FROM authenticated;
GRANT UPDATE (read_at) ON public.notifications TO authenticated;

-- Desativação suave: nunca se apagam utilizadores, departamentos, atribuições ou definições pela API.
REVOKE DELETE ON public.profiles, public.departments, public.user_roles, public.system_settings FROM authenticated;
REVOKE INSERT, DELETE ON public.system_settings FROM authenticated;

-- =============================================================================
-- 13. ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- As chamadas às funções estão envolvidas em (SELECT ...) para serem avaliadas uma vez por consulta.

-- DEPARTMENTS -----------------------------------------------------------------
CREATE POLICY departments_select ON public.departments FOR SELECT TO authenticated
USING ((SELECT public.has_permission('DEPARTMENTS_READ')) OR (SELECT public.has_permission('SELF_ACCESS')));

CREATE POLICY departments_insert ON public.departments FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('DEPARTMENTS_MANAGE')));

CREATE POLICY departments_update ON public.departments FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('DEPARTMENTS_MANAGE')))
WITH CHECK ((SELECT public.has_permission('DEPARTMENTS_MANAGE')));

-- PROFILES --------------------------------------------------------------------
-- A própria linha é sempre legível (mesmo inativa) para o frontend poder explicar o bloqueio.
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.has_permission('USERS_READ'))
    OR public.is_manager_of_employee(id)
);

CREATE POLICY profiles_insert ON public.profiles FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('USERS_CREATE')));

-- O detalhe por coluna (contactos vs. dados institucionais vs. estado) é validado em trg_profiles_guard.
CREATE POLICY profiles_update ON public.profiles FOR UPDATE TO authenticated
USING (
    id = (SELECT public.get_current_profile_id())
    OR (SELECT public.has_permission('USERS_UPDATE'))
    OR (SELECT public.has_permission('USERS_DISABLE'))
)
WITH CHECK (
    id = (SELECT public.get_current_profile_id())
    OR (SELECT public.has_permission('USERS_UPDATE'))
    OR (SELECT public.has_permission('USERS_DISABLE'))
);

-- ROLES & PERMISSIONS ---------------------------------------------------------
CREATE POLICY roles_select ON public.roles FOR SELECT TO authenticated
USING ((SELECT public.has_permission('ROLES_READ')) OR (SELECT public.has_permission('SELF_ACCESS')));

CREATE POLICY permissions_select ON public.permissions FOR SELECT TO authenticated
USING ((SELECT public.has_permission('PERMISSIONS_READ')) OR (SELECT public.has_permission('ROLES_READ')));

CREATE POLICY role_permissions_select ON public.role_permissions FOR SELECT TO authenticated
USING ((SELECT public.has_permission('ROLES_READ')) OR (SELECT public.has_permission('PERMISSIONS_READ')));

CREATE POLICY user_roles_select ON public.user_roles FOR SELECT TO authenticated
USING (user_id = (SELECT public.get_current_profile_id()) OR (SELECT public.has_permission('USERS_READ')));

CREATE POLICY user_roles_insert ON public.user_roles FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('USERS_ASSIGN_ROLE')));

CREATE POLICY user_roles_update ON public.user_roles FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('USERS_ASSIGN_ROLE')))
WITH CHECK ((SELECT public.has_permission('USERS_ASSIGN_ROLE')));

-- MANAGER SCOPES --------------------------------------------------------------
CREATE POLICY manager_scopes_select ON public.manager_scopes FOR SELECT TO authenticated
USING (manager_id = (SELECT public.get_current_profile_id()) OR (SELECT public.has_permission('USERS_READ')));

CREATE POLICY manager_scopes_insert ON public.manager_scopes FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('USERS_UPDATE')));

CREATE POLICY manager_scopes_delete ON public.manager_scopes FOR DELETE TO authenticated
USING ((SELECT public.has_permission('USERS_UPDATE')));

-- ACTIVITIES ------------------------------------------------------------------
CREATE POLICY activities_select ON public.activities FOR SELECT TO authenticated
USING ((SELECT public.has_permission('SELF_ACCESS')));

CREATE POLICY activities_insert ON public.activities FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('ADMIN_ACCESS')));

CREATE POLICY activities_update ON public.activities FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('ADMIN_ACCESS')))
WITH CHECK ((SELECT public.has_permission('ADMIN_ACCESS')));

-- TIMESHEETS ------------------------------------------------------------------
CREATE POLICY timesheets_select ON public.timesheets FOR SELECT TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    OR ((SELECT public.has_permission('TEAM_TIMESHEET_READ')) AND public.is_manager_of_employee(employee_id))
    OR (SELECT public.has_permission('REPORTS_READ'))
);

CREATE POLICY timesheets_insert ON public.timesheets FOR INSERT TO authenticated
WITH CHECK (
    employee_id = (SELECT public.get_current_profile_id())
    AND status = 'DRAFT'
    AND (SELECT public.has_permission('SELF_TIMESHEET_CREATE'))
);

-- Colaborador: edita rascunhos/rejeitados e pode submetê-los; nunca aprova.
CREATE POLICY timesheets_update_own ON public.timesheets FOR UPDATE TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    AND status IN ('DRAFT', 'REJECTED')
    AND (SELECT public.has_permission('SELF_TIMESHEET_UPDATE'))
)
WITH CHECK (
    employee_id = (SELECT public.get_current_profile_id())
    AND status IN ('DRAFT', 'REJECTED', 'SUBMITTED')
    AND approved_by IS NULL
    AND approved_at IS NULL
);

-- Gestor: decide sobre timesheets submetidos da sua equipa, nunca sobre os seus.
CREATE POLICY timesheets_update_review ON public.timesheets FOR UPDATE TO authenticated
USING (
    status = 'SUBMITTED'
    AND employee_id <> (SELECT public.get_current_profile_id())
    AND (SELECT public.has_permission('TEAM_TIMESHEET_APPROVE'))
    AND public.is_manager_of_employee(employee_id)
)
WITH CHECK (
    status IN ('APPROVED', 'REJECTED')
    AND employee_id <> (SELECT public.get_current_profile_id())
    AND public.is_manager_of_employee(employee_id)
);

CREATE POLICY timesheets_update_admin ON public.timesheets FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('ADMIN_ACCESS')))
WITH CHECK ((SELECT public.has_permission('ADMIN_ACCESS')));

-- TIMESHEET ENTRIES -----------------------------------------------------------
CREATE POLICY timesheet_entries_select ON public.timesheet_entries FOR SELECT TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    OR ((SELECT public.has_permission('TEAM_TIMESHEET_READ')) AND public.is_manager_of_employee(employee_id))
    OR (SELECT public.has_permission('REPORTS_READ'))
);

CREATE POLICY timesheet_entries_insert ON public.timesheet_entries FOR INSERT TO authenticated
WITH CHECK (
    employee_id = (SELECT public.get_current_profile_id())
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = (SELECT public.get_current_profile_id())
          AND t.status IN ('DRAFT', 'REJECTED')
    )
);

CREATE POLICY timesheet_entries_update ON public.timesheet_entries FOR UPDATE TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = (SELECT public.get_current_profile_id())
          AND t.status IN ('DRAFT', 'REJECTED')
    )
)
WITH CHECK (
    employee_id = (SELECT public.get_current_profile_id())
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = (SELECT public.get_current_profile_id())
          AND t.status IN ('DRAFT', 'REJECTED')
    )
);

CREATE POLICY timesheet_entries_delete ON public.timesheet_entries FOR DELETE TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id = (SELECT public.get_current_profile_id())
          AND t.status IN ('DRAFT', 'REJECTED')
    )
);

-- TIMESHEET APPROVALS ---------------------------------------------------------
CREATE POLICY timesheet_approvals_select ON public.timesheet_approvals FOR SELECT TO authenticated
USING (
    approver_id = (SELECT public.get_current_profile_id())
    OR EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND (t.employee_id = (SELECT public.get_current_profile_id()) OR public.is_manager_of_employee(t.employee_id))
    )
    OR (SELECT public.has_permission('ADMIN_ACCESS'))
);

CREATE POLICY timesheet_approvals_insert ON public.timesheet_approvals FOR INSERT TO authenticated
WITH CHECK (
    approver_id = (SELECT public.get_current_profile_id())
    AND EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND t.employee_id <> (SELECT public.get_current_profile_id())
          AND (
              ((SELECT public.has_permission('TEAM_TIMESHEET_APPROVE')) AND public.is_manager_of_employee(t.employee_id))
              OR (SELECT public.has_permission('ADMIN_ACCESS'))
          )
    )
);

-- AUDIT EVENTS ----------------------------------------------------------------
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated
USING ((SELECT public.has_permission('AUDIT_READ')));

-- NOTIFICATIONS ---------------------------------------------------------------
CREATE POLICY notifications_select ON public.notifications FOR SELECT TO authenticated
USING (user_id = (SELECT public.get_current_profile_id()));

CREATE POLICY notifications_update ON public.notifications FOR UPDATE TO authenticated
USING (user_id = (SELECT public.get_current_profile_id()))
WITH CHECK (user_id = (SELECT public.get_current_profile_id()));

-- SYSTEM SETTINGS -------------------------------------------------------------
CREATE POLICY system_settings_select ON public.system_settings FOR SELECT TO authenticated
USING ((SELECT public.has_permission('SYSTEM_SETTINGS_READ')));

CREATE POLICY system_settings_update ON public.system_settings FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('SYSTEM_SETTINGS_MANAGE')))
WITH CHECK ((SELECT public.has_permission('SYSTEM_SETTINGS_MANAGE')));
