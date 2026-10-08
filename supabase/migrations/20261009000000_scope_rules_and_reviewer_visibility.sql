-- TsheetGRT · SI Holdings — Regras do âmbito de gestão e visibilidade de quem decide
--
-- 1. Âmbito por departamento: abrange apenas colaboradores com perfil EMPLOYEE desse departamento.
--    Âmbito explícito por colaborador: pode abranger outro gestor (regra explícita da administração).
--    Um ADMIN nunca faz parte do âmbito de um gestor, nem por atribuição explícita.
-- 2. O colaborador pode ver quem decidiu o seu timesheet (nome, cargo e e-mail institucional)
--    através de get_timesheet_decisions, sem acesso ao restante perfil do gestor.

-- =============================================================================
-- 1. REGRA ÚNICA DE ÂMBITO
-- =============================================================================
-- Usada pelas políticas RLS (via is_manager_of_employee) e pelas notificações.
CREATE FUNCTION private.scope_covers(p_manager_id UUID, p_employee_id UUID)
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
        JOIN public.user_roles ur ON ur.user_id = employee.id
        JOIN public.roles r ON r.id = ur.role_id
        WHERE ms.manager_id = p_manager_id
          AND employee.id <> p_manager_id
          AND r.code <> 'ADMIN'
          AND (
              ms.employee_id = employee.id
              OR (ms.department_id = employee.department_id AND r.code = 'EMPLOYEE')
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
    SELECT coalesce(private.scope_covers(public.get_current_profile_id(), p_employee_id), false);
$$;

-- Notificação de submissão: apenas os gestores cujo âmbito abrange o colaborador pela regra acima.
CREATE OR REPLACE FUNCTION private.notify_timesheet_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_employee public.profiles%ROWTYPE;
    v_period TEXT := to_char(NEW.period_start, 'DD/MM/YYYY') || ' a ' || to_char(NEW.period_end, 'DD/MM/YYYY');
BEGIN
    IF NEW.status = OLD.status THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_employee FROM public.profiles WHERE id = NEW.employee_id;

    IF NEW.status = 'SUBMITTED' THEN
        INSERT INTO public.notifications (user_id, type, title, message)
        SELECT manager.id, 'APPROVAL_REQUIRED', 'Timesheet para aprovação',
               v_employee.full_name || ' submeteu o timesheet de ' || v_period || '.'
        FROM public.profiles manager
        WHERE manager.is_active
          AND EXISTS (SELECT 1 FROM public.manager_scopes ms WHERE ms.manager_id = manager.id)
          AND private.scope_covers(manager.id, NEW.employee_id);
    ELSIF NEW.status = 'APPROVED' THEN
        INSERT INTO public.notifications (user_id, type, title, message)
        VALUES (NEW.employee_id, 'TIMESHEET_APPROVED', 'Timesheet aprovado',
                'O seu timesheet de ' || v_period || ' foi aprovado.');
    ELSIF NEW.status = 'REJECTED' THEN
        INSERT INTO public.notifications (user_id, type, title, message)
        VALUES (NEW.employee_id, 'TIMESHEET_REJECTED', 'Timesheet devolvido para correção',
                'O seu timesheet de ' || v_period || ' foi rejeitado. Motivo: ' || NEW.rejection_reason);
    END IF;

    RETURN NEW;
END;
$$;

-- Um ADMIN não pode ser atribuído explicitamente ao âmbito de um gestor.
CREATE OR REPLACE FUNCTION private.guard_manager_scope()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        JOIN public.roles r ON r.id = ur.role_id
        WHERE p.id = NEW.manager_id AND p.is_active AND r.code = 'MANAGER'
    ) THEN
        RAISE EXCEPTION 'O âmbito só pode ser atribuído a utilizadores ativos com o perfil MANAGER.';
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
    END IF;

    IF NEW.manager_id = public.get_current_profile_id() AND NOT public.has_permission('ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Não pode alterar o seu próprio âmbito de gestão.' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

-- O próprio timesheet deixou de estar no âmbito; a mensagem continua a explicar porque não pode ser decidido.
CREATE OR REPLACE FUNCTION private.apply_timesheet_review(p_timesheet_id UUID, p_decision TEXT, p_comment TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reviewer_id UUID := public.get_current_profile_id();
    v_timesheet public.timesheets%ROWTYPE;
    v_comment TEXT := nullif(btrim(coalesce(p_comment, '')), '');
BEGIN
    IF p_decision NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'Decisão inválida: %', p_decision;
    END IF;

    IF v_reviewer_id IS NULL
       OR NOT public.has_permission(CASE p_decision WHEN 'APPROVED' THEN 'TEAM_TIMESHEET_APPROVE' ELSE 'TEAM_TIMESHEET_REJECT' END) THEN
        RAISE EXCEPTION 'Não tem permissão para % timesheets.',
            CASE p_decision WHEN 'APPROVED' THEN 'aprovar' ELSE 'rejeitar' END
            USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_timesheet FROM public.timesheets WHERE id = p_timesheet_id FOR UPDATE;

    IF FOUND AND v_timesheet.employee_id = v_reviewer_id THEN
        RAISE EXCEPTION 'Não pode aprovar ou rejeitar o seu próprio timesheet.';
    END IF;

    -- Fora do âmbito e inexistente têm a mesma resposta: não se revela a existência do registo.
    IF NOT FOUND OR NOT (public.has_permission('ADMIN_ACCESS') OR public.is_manager_of_employee(v_timesheet.employee_id)) THEN
        RAISE EXCEPTION 'Timesheet não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;

    IF v_timesheet.status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Apenas timesheets submetidos podem ser decididos (estado atual: %).',
            CASE v_timesheet.status
                WHEN 'DRAFT' THEN 'rascunho'
                WHEN 'APPROVED' THEN 'aprovado'
                WHEN 'REJECTED' THEN 'rejeitado'
                WHEN 'LOCKED' THEN 'bloqueado'
                ELSE lower(v_timesheet.status)
            END;
    END IF;

    IF p_decision = 'REJECTED' AND v_comment IS NULL THEN
        RAISE EXCEPTION 'A rejeição exige um motivo.';
    END IF;

    IF length(coalesce(v_comment, '')) > 1000 THEN
        RAISE EXCEPTION 'O comentário não pode exceder 1000 carateres.';
    END IF;

    IF p_decision = 'APPROVED' THEN
        UPDATE public.timesheets
        SET status = 'APPROVED', approved_at = now(), approved_by = v_reviewer_id,
            rejected_at = NULL, rejected_by = NULL, rejection_reason = NULL
        WHERE id = p_timesheet_id;
    ELSE
        UPDATE public.timesheets
        SET status = 'REJECTED', rejected_at = now(), rejected_by = v_reviewer_id, rejection_reason = v_comment,
            approved_at = NULL, approved_by = NULL
        WHERE id = p_timesheet_id;
    END IF;

    INSERT INTO public.timesheet_approvals (timesheet_id, approver_id, status, comment)
    VALUES (p_timesheet_id, v_reviewer_id, p_decision, v_comment);
END;
$$;

-- =============================================================================
-- 2. QUEM DECIDIU (LEITURA LIMITADA)
-- =============================================================================
-- Devolve o histórico de decisões de um timesheet visível a quem consulta (mesma regra da
-- política timesheet_approvals_select), expondo do decisor apenas nome, cargo e e-mail institucional.
CREATE FUNCTION public.get_timesheet_decisions(p_timesheet_id UUID)
RETURNS TABLE (
    decision_id UUID,
    status TEXT,
    comment TEXT,
    created_at TIMESTAMPTZ,
    reviewer_name TEXT,
    reviewer_job_title TEXT,
    reviewer_email TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT a.id, a.status::TEXT, a.comment, a.created_at,
           reviewer.full_name::TEXT, reviewer.job_title::TEXT, reviewer.email::TEXT
    FROM public.timesheet_approvals a
    JOIN public.timesheets t ON t.id = a.timesheet_id
    LEFT JOIN public.profiles reviewer ON reviewer.id = a.approver_id
    WHERE a.timesheet_id = p_timesheet_id
      AND public.get_current_profile_id() IS NOT NULL
      AND (
          t.employee_id = public.get_current_profile_id()
          OR a.approver_id = public.get_current_profile_id()
          OR (public.has_permission('TEAM_TIMESHEET_READ') AND public.is_manager_of_employee(t.employee_id))
          OR public.has_permission('ADMIN_ACCESS')
      )
    ORDER BY a.created_at DESC;
$$;

-- =============================================================================
-- 3. PRIVILÉGIOS
-- =============================================================================
REVOKE EXECUTE ON FUNCTION private.scope_covers(UUID, UUID) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.get_timesheet_decisions(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_timesheet_decisions(UUID) TO authenticated;
