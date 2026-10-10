-- TsheetGRT · SI Holdings — Hierarquia organizacional (1/3): perfil GESTOR, âmbito e notificações
--
-- Hierarquia funcional: ADMIN → MANAGER → GESTOR → COLABORADORES.
--
-- Representação (sem tabelas de equipa novas: reutiliza manager_scopes):
--   * GESTOR → colaboradores: âmbito por departamento (abrange os EMPLOYEE do departamento) e/ou por colaborador.
--   * MANAGER → GESTOR: âmbito explícito por colaborador (o gestor supervisionado).
--   * MANAGER → colaboradores sem gestor: âmbito por departamento ou por colaborador, como até aqui.
--   Um gestor pode ter vários departamentos; um Manager supervisiona apenas os gestores que lhe forem atribuídos.
--
-- Regras:
--   * private.scope_covers mantém-se como relação DIRETA (1.º nível).
--   * private.supervises acrescenta um nível: o Manager abrange também as equipas dos gestores que
--     supervisiona. is_manager_of_employee passa a usá-la, por isso as políticas RLS existentes refletem
--     a hierarquia sem serem reescritas. Um âmbito só conta enquanto o titular tiver TEAM_READ.
--   * As notificações operacionais vão para o gestor direto da equipa (private.operational_leads); o
--     Manager recebe pedidos de decisão e escalonamentos (private.supervisors_with).

-- =============================================================================
-- 1. PERFIL GESTOR E PERMISSÕES
-- =============================================================================
INSERT INTO public.roles (code, name, description) VALUES
    ('GESTOR', 'GESTOR', 'Gestão diária de uma equipa: tarefas, reuniões, validação de ausências e oportunidades; responde ao Manager')
ON CONFLICT (code) DO NOTHING;

UPDATE public.roles
SET description = 'Supervisão dos gestores e das equipas atribuídas, decisões superiores e relatórios gerais'
WHERE code = 'MANAGER';

INSERT INTO public.permissions (code, name, description, module) VALUES
    ('TEAM_SUPERVISE', 'Supervisionar Gestores', 'Visão consolidada dos gestores supervisionados e das suas equipas; recebe escalonamentos', 'team'),
    ('TEAM_JOB_DESCRIPTION_UPDATE', 'Atualizar Descrição de Função', 'Preencher e atualizar a descrição de função dos colaboradores do âmbito', 'team'),
    ('TIMESHEET_ABSENCE_VALIDATE', 'Validar Ausências', 'Validar e encaminhar ao Manager os pedidos de ausência da equipa direta', 'work'),
    ('TIMESHEET_OPPORTUNITY_APPROVE', 'Aprovar Oportunidades', 'Decidir os pedidos de aprovação de oportunidades do âmbito', 'work')
ON CONFLICT (code) DO NOTHING;

-- O GESTOR gere a equipa direta; não supervisiona gestores, não decide ausências nem aprova oportunidades.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY[
    'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
    'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT',
    'IT_TICKET_CREATE',
    'TEAM_READ', 'TEAM_TIMESHEET_READ', 'TEAM_TIMESHEET_REVIEW', 'TEAM_TIMESHEET_APPROVE', 'TEAM_TIMESHEET_REJECT',
    'REPORTS_READ',
    'TIMESHEET_TASK_READ', 'TIMESHEET_TASK_UPDATE', 'TIMESHEET_TASK_CREATE', 'TIMESHEET_TASK_ASSIGN', 'TIMESHEET_TASK_REOPEN',
    'TIMESHEET_CALENDAR_READ', 'TIMESHEET_MEETING_READ', 'TIMESHEET_MEETING_CREATE',
    'TIMESHEET_ABSENCE_CREATE', 'TIMESHEET_ABSENCE_READ', 'TIMESHEET_ABSENCE_VALIDATE',
    'TIMESHEET_OPPORTUNITY_READ', 'TIMESHEET_OPPORTUNITY_UPDATE', 'TIMESHEET_OPPORTUNITY_CREATE', 'TIMESHEET_OPPORTUNITY_MANAGE',
    'TIMESHEET_ATTACHMENT_CREATE', 'TIMESHEET_ATTACHMENT_DELETE'])
WHERE r.code = 'GESTOR'
ON CONFLICT (role_id, permission_id) DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (ARRAY['TEAM_SUPERVISE', 'TEAM_JOB_DESCRIPTION_UPDATE', 'TIMESHEET_OPPORTUNITY_APPROVE'])
WHERE r.code = 'MANAGER'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- O perfil ADMIN recebe sempre todas as permissões (regra do sistema).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- O colaborador comum e o IT recebem reuniões, mas não as agendam por iniciativa própria.
DELETE FROM public.role_permissions rp
USING public.roles r, public.permissions p
WHERE rp.role_id = r.id AND rp.permission_id = p.id
  AND r.code IN ('EMPLOYEE', 'IT') AND p.code = 'TIMESHEET_MEETING_CREATE';

SELECT private.write_audit_event('permission.changed', 'role_permissions', 'GESTOR',
    'Hierarquia organizacional: perfil GESTOR criado; MANAGER recebe TEAM_SUPERVISE, TEAM_JOB_DESCRIPTION_UPDATE e '
    || 'TIMESHEET_OPPORTUNITY_APPROVE; EMPLOYEE e IT deixam de ter TIMESHEET_MEETING_CREATE.');

-- =============================================================================
-- 2. DESCRIÇÃO DA FUNÇÃO (cargo ≠ descrição ≠ perfil técnico ≠ responsabilidade numa tarefa)
-- =============================================================================
ALTER TABLE public.profiles
    ADD COLUMN job_description TEXT
        CONSTRAINT profiles_job_description_length CHECK (length(job_description) <= 2000);

-- A descrição é um dado institucional: pela API direta, só com USERS_UPDATE (como o cargo).
-- Os gestores com TEAM_JOB_DESCRIPTION_UPDATE usam update_team_member_job_description.
CREATE OR REPLACE FUNCTION public.guard_profile_changes()
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

        IF (NEW.full_name, NEW.department_id, NEW.job_title, NEW.job_description)
           IS DISTINCT FROM (OLD.full_name, OLD.department_id, OLD.job_title, OLD.job_description)
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

CREATE OR REPLACE FUNCTION public.audit_profile_changes()
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

    IF NEW.job_description IS DISTINCT FROM OLD.job_description THEN
        PERFORM private.write_audit_event('user.job_description.updated', 'profiles', NEW.id::TEXT,
            'Descrição da função de ' || NEW.full_name || ' atualizada');
    END IF;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. ÂMBITO EM DOIS NÍVEIS
-- =============================================================================
-- O titular do âmbito só o exerce enquanto tiver TEAM_READ (âmbitos antigos de quem mudou de perfil
-- deixam de dar acesso). Um nível acima: o Manager abrange as equipas dos GESTORES que supervisiona.
CREATE FUNCTION private.supervises(p_manager_id UUID, p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_manager_id IS NOT NULL
       AND p_employee_id IS NOT NULL
       AND p_manager_id <> p_employee_id
       AND private.profile_has_permission(p_manager_id, 'TEAM_READ')
       AND (
           private.scope_covers(p_manager_id, p_employee_id)
           OR EXISTS (
               SELECT 1
               FROM public.manager_scopes ms
               JOIN public.user_roles ur ON ur.user_id = ms.employee_id
               JOIN public.roles r ON r.id = ur.role_id AND r.code = 'GESTOR'
               WHERE ms.manager_id = p_manager_id
                 AND ms.employee_id <> p_employee_id
                 AND private.scope_covers(ms.employee_id, p_employee_id)
           )
       );
$$;

CREATE OR REPLACE FUNCTION public.is_manager_of_employee(p_employee_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce(private.supervises(public.get_current_profile_id(), p_employee_id), false);
$$;

-- Gestores diretos da equipa que recebem as notificações operacionais: quem abrange o colaborador
-- diretamente e não supervisiona gestores (o Manager não recebe cada ação operacional).
CREATE FUNCTION private.operational_leads(p_employee_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ARRAY(
        SELECT DISTINCT ms.manager_id
        FROM public.manager_scopes ms
        WHERE ms.manager_id <> p_employee_id
          AND private.profile_has_permission(ms.manager_id, 'TEAM_READ')
          AND NOT private.profile_has_permission(ms.manager_id, 'TEAM_SUPERVISE')
          AND private.scope_covers(ms.manager_id, p_employee_id)
    );
$$;

-- Responsáveis acima do colaborador (dois níveis) com uma permissão de decisão ou supervisão.
CREATE FUNCTION private.supervisors_with(p_employee_id UUID, p_permission_code TEXT)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ARRAY(
        SELECT DISTINCT ms.manager_id
        FROM public.manager_scopes ms
        WHERE ms.manager_id <> p_employee_id
          AND private.profile_has_permission(ms.manager_id, p_permission_code)
          AND private.supervises(ms.manager_id, p_employee_id)
    );
$$;

-- Administradores ativos (último recurso quando ninguém na hierarquia pode decidir).
CREATE FUNCTION private.active_admins(p_except UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ARRAY(
        SELECT p.id FROM public.profiles p
        WHERE p.is_active AND private.is_admin_profile(p.id) AND p.id IS DISTINCT FROM p_except
    );
$$;

-- O âmbito pode ser atribuído a MANAGER e a GESTOR. Um GESTOR só tem colaboradores no âmbito:
-- nunca outro gestor, um Manager ou um administrador (evita ciclos e inversões da hierarquia).
CREATE OR REPLACE FUNCTION private.guard_manager_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_manager_role TEXT;
    v_target_role TEXT;
BEGIN
    SELECT r.code INTO v_manager_role
    FROM public.profiles p
    JOIN public.user_roles ur ON ur.user_id = p.id
    JOIN public.roles r ON r.id = ur.role_id
    WHERE p.id = NEW.manager_id AND p.is_active;

    IF v_manager_role IS NULL OR v_manager_role NOT IN ('MANAGER', 'GESTOR') THEN
        RAISE EXCEPTION 'O âmbito só pode ser atribuído a utilizadores ativos com o perfil MANAGER ou GESTOR.';
    END IF;

    IF NEW.department_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = NEW.department_id AND d.active) THEN
        RAISE EXCEPTION 'O departamento selecionado não existe ou está inativo.';
    END IF;

    IF NEW.employee_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.employee_id AND p.is_active) THEN
            RAISE EXCEPTION 'O colaborador selecionado não existe ou está inativo.';
        END IF;
        IF private.is_admin_profile(NEW.employee_id) THEN
            RAISE EXCEPTION 'Um administrador não pode fazer parte do âmbito de um gestor.';
        END IF;
        SELECT r.code INTO v_target_role
        FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id
        WHERE ur.user_id = NEW.employee_id;
        IF v_manager_role = 'GESTOR' AND v_target_role IN ('MANAGER', 'GESTOR') THEN
            RAISE EXCEPTION 'Um gestor só pode ter colaboradores na sua equipa (não outros gestores ou managers).';
        END IF;
    END IF;

    IF NEW.manager_id = public.get_current_profile_id() AND NOT public.has_permission('ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Não pode alterar o seu próprio âmbito de gestão.' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- Descrição da função pelo gestor do âmbito (permissão própria; não altera perfis técnicos nem cargos).
CREATE FUNCTION public.update_team_member_job_description(p_profile_id UUID, p_description TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_description TEXT := private.optional_text(p_description, 2000, 'A descrição da função');
BEGIN
    IF NOT (
        public.has_permission('USERS_UPDATE')
        OR (public.has_permission('TEAM_JOB_DESCRIPTION_UPDATE') AND public.is_manager_of_employee(p_profile_id))
    ) THEN
        RAISE EXCEPTION 'Colaborador não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF p_profile_id = v_actor AND NOT public.has_permission('USERS_UPDATE') THEN
        RAISE EXCEPTION 'A sua descrição de função é atualizada pela chefia ou pela administração.' USING ERRCODE = '42501';
    END IF;
    UPDATE public.profiles SET job_description = v_description WHERE id = p_profile_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Colaborador não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
END;
$$;

-- =============================================================================
-- 4. NOTIFICAÇÕES: CATEGORIA, LIGAÇÃO E DEDUPLICAÇÃO
-- =============================================================================
ALTER TABLE public.notifications
    ADD COLUMN category VARCHAR(20) NOT NULL DEFAULT 'INFO'
        CONSTRAINT notifications_category_valid CHECK (category IN ('INFO', 'COMPLETION', 'APPROVAL_REQUEST', 'DEADLINE', 'DECISION')),
    -- Caminho interno da aplicação (nunca um URL externo).
    ADD COLUMN link VARCHAR(300)
        CONSTRAINT notifications_link_internal CHECK (link ~ '^/[A-Za-z0-9/_?=&.-]*$'),
    -- Alertas gerados a pedido (prazos) não se repetem.
    ADD COLUMN dedup_key VARCHAR(200);

CREATE UNIQUE INDEX notifications_dedup_unique ON public.notifications (user_id, dedup_key) WHERE dedup_key IS NOT NULL;

CREATE FUNCTION private.notification_category(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_type IN ('APPROVAL_REQUIRED', 'ABSENCE_APPROVAL_REQUIRED', 'ABSENCE_VALIDATION_REQUIRED',
                        'OPPORTUNITY_APPROVAL_REQUIRED') THEN 'APPROVAL_REQUEST'
        WHEN p_type IN ('TASK_COMPLETED', 'TASK_REVIEW_REQUIRED', 'TEAM_TASK_COMPLETED') THEN 'COMPLETION'
        WHEN p_type IN ('TASK_DUE_SOON', 'TASK_OVERDUE', 'TEAM_TASK_OVERDUE') THEN 'DEADLINE'
        WHEN p_type IN ('TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'ABSENCE_APPROVED', 'ABSENCE_REJECTED',
                        'ABSENCE_CHANGES_REQUESTED', 'OPPORTUNITY_APPROVED', 'OPPORTUNITY_REJECTED', 'TASK_REVIEWED')
            THEN 'DECISION'
        ELSE 'INFO'
    END;
$$;

-- A categoria é sempre derivada do tipo no servidor (também nas notificações dos módulos anteriores).
CREATE FUNCTION private.set_notification_category()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.category := private.notification_category(NEW.type);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_notifications_category
    BEFORE INSERT ON public.notifications
    FOR EACH ROW EXECUTE FUNCTION private.set_notification_category();

UPDATE public.notifications SET category = private.notification_category(type) WHERE category = 'INFO';

-- Envio com ligação; nunca ao próprio autor nem a contas inativas.
CREATE FUNCTION private.notify(p_recipients UUID[], p_actor_id UUID, p_type TEXT, p_title TEXT, p_message TEXT, p_link TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.notifications (user_id, type, title, message, link)
    SELECT DISTINCT recipient, p_type, left(p_title, 200), p_message, p_link
    FROM unnest(coalesce(p_recipients, ARRAY[]::UUID[])) AS recipient
    WHERE recipient IS NOT NULL
      AND recipient IS DISTINCT FROM p_actor_id
      AND private.is_active_profile(recipient);
$$;

CREATE OR REPLACE FUNCTION private.notify_profiles(p_recipients UUID[], p_actor_id UUID, p_type TEXT, p_title TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT private.notify(p_recipients, p_actor_id, p_type, p_title, p_message, NULL);
$$;

-- =============================================================================
-- 5. PRIVILÉGIOS
-- =============================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.update_team_member_job_description(UUID, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.update_team_member_job_description(UUID, TEXT) TO authenticated;

-- Funções privadas avaliadas nas políticas RLS e em triggers SECURITY INVOKER durante pedidos da API.
GRANT EXECUTE ON FUNCTION private.can_edit_own_timesheet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_other_active_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_meeting_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_opportunity_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_department_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.local_today() TO authenticated;
