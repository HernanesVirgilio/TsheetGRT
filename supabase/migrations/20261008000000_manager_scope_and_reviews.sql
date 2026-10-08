-- TsheetGRT · SI Holdings — Módulo Manager
--
-- 1. Âmbito: o acesso global a timesheets passa a exigir ADMIN_ACCESS. Um gestor vê
--    apenas os colaboradores do seu manager_scope (REPORTS_READ deixa de dar acesso global).
-- 2. Transições de estado dos timesheets só através de funções do servidor:
--    submit_timesheet (colaborador), review_timesheet e approve_timesheets (gestor/admin).
--    Não existe UPDATE direto de timesheets nem INSERT direto de timesheet_approvals.
-- 3. manager_scopes: validação (só gestores, alvos ativos, sem autoatribuição) e auditoria.
-- 4. Notificações geradas no servidor a cada mudança de estado.
-- 5. Vista my_team_members e leitura da auditoria dos timesheets da equipa.

-- =============================================================================
-- 1. POLÍTICAS DE LEITURA POR ÂMBITO
-- =============================================================================
DROP POLICY profiles_select ON public.profiles;
CREATE POLICY profiles_select ON public.profiles FOR SELECT TO authenticated
USING (
    auth_user_id = (SELECT auth.uid())
    OR (SELECT public.has_permission('USERS_READ'))
    OR ((SELECT public.has_permission('TEAM_READ')) AND public.is_manager_of_employee(id))
);

DROP POLICY timesheets_select ON public.timesheets;
CREATE POLICY timesheets_select ON public.timesheets FOR SELECT TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    OR ((SELECT public.has_permission('TEAM_TIMESHEET_READ')) AND public.is_manager_of_employee(employee_id))
    OR (SELECT public.has_permission('ADMIN_ACCESS'))
);

DROP POLICY timesheet_entries_select ON public.timesheet_entries;
CREATE POLICY timesheet_entries_select ON public.timesheet_entries FOR SELECT TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    OR ((SELECT public.has_permission('TEAM_TIMESHEET_READ')) AND public.is_manager_of_employee(employee_id))
    OR (SELECT public.has_permission('ADMIN_ACCESS'))
);

DROP POLICY timesheet_approvals_select ON public.timesheet_approvals;
CREATE POLICY timesheet_approvals_select ON public.timesheet_approvals FOR SELECT TO authenticated
USING (
    approver_id = (SELECT public.get_current_profile_id())
    OR EXISTS (
        SELECT 1 FROM public.timesheets t
        WHERE t.id = timesheet_id
          AND (
              t.employee_id = (SELECT public.get_current_profile_id())
              OR ((SELECT public.has_permission('TEAM_TIMESHEET_READ')) AND public.is_manager_of_employee(t.employee_id))
          )
    )
    OR (SELECT public.has_permission('ADMIN_ACCESS'))
);

-- =============================================================================
-- 2. ESCRITA EM TIMESHEETS: APENAS PELAS FUNÇÕES DO SERVIDOR
-- =============================================================================
DROP POLICY timesheets_update_own ON public.timesheets;
DROP POLICY timesheets_update_review ON public.timesheets;
DROP POLICY timesheets_update_admin ON public.timesheets;
DROP POLICY timesheet_approvals_insert ON public.timesheet_approvals;

REVOKE UPDATE, DELETE ON public.timesheets FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.timesheet_approvals FROM authenticated;

-- Um novo timesheet nasce sempre em rascunho, sem dados de submissão ou decisão.
DROP POLICY timesheets_insert ON public.timesheets;
CREATE POLICY timesheets_insert ON public.timesheets FOR INSERT TO authenticated
WITH CHECK (
    employee_id = (SELECT public.get_current_profile_id())
    AND status = 'DRAFT'
    AND submitted_at IS NULL
    AND approved_at IS NULL AND approved_by IS NULL
    AND rejected_at IS NULL AND rejected_by IS NULL AND rejection_reason IS NULL
    AND (SELECT public.has_permission('SELF_TIMESHEET_CREATE'))
);

-- Apontamentos: apenas o próprio colaborador, com permissão, em timesheets editáveis.
DROP POLICY timesheet_entries_insert ON public.timesheet_entries;
DROP POLICY timesheet_entries_update ON public.timesheet_entries;
DROP POLICY timesheet_entries_delete ON public.timesheet_entries;

CREATE FUNCTION private.can_edit_own_timesheet(p_timesheet_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('SELF_TIMESHEET_UPDATE')
       AND EXISTS (
           SELECT 1 FROM public.timesheets t
           WHERE t.id = p_timesheet_id
             AND t.employee_id = public.get_current_profile_id()
             AND t.status IN ('DRAFT', 'REJECTED')
       );
$$;

CREATE POLICY timesheet_entries_insert ON public.timesheet_entries FOR INSERT TO authenticated
WITH CHECK (employee_id = (SELECT public.get_current_profile_id()) AND private.can_edit_own_timesheet(timesheet_id));

CREATE POLICY timesheet_entries_update ON public.timesheet_entries FOR UPDATE TO authenticated
USING (employee_id = (SELECT public.get_current_profile_id()) AND private.can_edit_own_timesheet(timesheet_id))
WITH CHECK (employee_id = (SELECT public.get_current_profile_id()) AND private.can_edit_own_timesheet(timesheet_id));

CREATE POLICY timesheet_entries_delete ON public.timesheet_entries FOR DELETE TO authenticated
USING (employee_id = (SELECT public.get_current_profile_id()) AND private.can_edit_own_timesheet(timesheet_id));

-- =============================================================================
-- 3. SUBMISSÃO (COLABORADOR)
-- =============================================================================
CREATE FUNCTION public.submit_timesheet(p_timesheet_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_profile_id UUID := public.get_current_profile_id();
    v_timesheet public.timesheets%ROWTYPE;
BEGIN
    IF v_profile_id IS NULL OR NOT public.has_permission('SELF_TIMESHEET_SUBMIT') THEN
        RAISE EXCEPTION 'Não tem permissão para submeter timesheets.' USING ERRCODE = '42501';
    END IF;

    SELECT * INTO v_timesheet FROM public.timesheets WHERE id = p_timesheet_id FOR UPDATE;
    IF NOT FOUND OR v_timesheet.employee_id <> v_profile_id THEN
        RAISE EXCEPTION 'Timesheet não encontrado.' USING ERRCODE = '42501';
    END IF;

    IF v_timesheet.status NOT IN ('DRAFT', 'REJECTED') THEN
        RAISE EXCEPTION 'Este timesheet já foi submetido ou decidido.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.timesheet_entries WHERE timesheet_id = p_timesheet_id) THEN
        RAISE EXCEPTION 'Não é possível submeter um timesheet sem registos de horas.';
    END IF;

    UPDATE public.timesheets
    SET status = 'SUBMITTED',
        submitted_at = now(),
        rejected_at = NULL,
        rejected_by = NULL,
        rejection_reason = NULL
    WHERE id = p_timesheet_id;
END;
$$;

-- =============================================================================
-- 4. DECISÃO (GESTOR / ADMIN)
-- =============================================================================
CREATE FUNCTION private.apply_timesheet_review(p_timesheet_id UUID, p_decision TEXT, p_comment TEXT)
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

    -- Fora do âmbito e inexistente têm a mesma resposta: não se revela a existência do registo.
    IF NOT FOUND OR NOT (public.has_permission('ADMIN_ACCESS') OR public.is_manager_of_employee(v_timesheet.employee_id)) THEN
        RAISE EXCEPTION 'Timesheet não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;

    IF v_timesheet.employee_id = v_reviewer_id THEN
        RAISE EXCEPTION 'Não pode aprovar ou rejeitar o seu próprio timesheet.';
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

CREATE FUNCTION public.review_timesheet(p_timesheet_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.apply_timesheet_review(p_timesheet_id, p_decision, p_comment);
END;
$$;

-- Aprovação em massa: cada timesheet é validado individualmente; as falhas não anulam
-- os restantes e são devolvidas ao cliente com o motivo.
CREATE FUNCTION public.approve_timesheets(p_timesheet_ids UUID[], p_comment TEXT DEFAULT NULL)
RETURNS TABLE (timesheet_id UUID, approved BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_id UUID;
    v_approved_count INTEGER := 0;
    v_failed_count INTEGER := 0;
    v_max_batch CONSTANT INTEGER := 100;
BEGIN
    IF p_timesheet_ids IS NULL OR cardinality(p_timesheet_ids) = 0 THEN
        RAISE EXCEPTION 'Selecione pelo menos um timesheet.';
    END IF;
    IF cardinality(p_timesheet_ids) > v_max_batch THEN
        RAISE EXCEPTION 'Não é possível aprovar mais de % timesheets de uma vez.', v_max_batch;
    END IF;

    FOR v_id IN SELECT DISTINCT unnest(p_timesheet_ids) LOOP
        BEGIN
            PERFORM private.apply_timesheet_review(v_id, 'APPROVED', p_comment);
            v_approved_count := v_approved_count + 1;
            timesheet_id := v_id; approved := true; message := 'Aprovado.';
        EXCEPTION WHEN OTHERS THEN
            v_failed_count := v_failed_count + 1;
            timesheet_id := v_id; approved := false; message := SQLERRM;
        END;
        RETURN NEXT;
    END LOOP;

    PERFORM private.write_audit_event('timesheet.bulk_approved', 'timesheets', NULL,
        'Aprovação em massa: ' || v_approved_count || ' aprovado(s), ' || v_failed_count || ' recusado(s).');
END;
$$;

-- =============================================================================
-- 5. AUDITORIA E NOTIFICAÇÕES DO CICLO DE VIDA
-- =============================================================================
CREATE OR REPLACE FUNCTION public.audit_timesheet_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_period TEXT := to_char(NEW.period_start, 'DD/MM/YYYY') || ' a ' || to_char(NEW.period_end, 'DD/MM/YYYY');
    v_employee_name TEXT;
BEGIN
    SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = NEW.employee_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('timesheet.created', 'timesheets', NEW.id::TEXT,
            'Timesheet de ' || v_employee_name || ' criado para o período ' || v_period);
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
            CASE NEW.status
                WHEN 'SUBMITTED' THEN 'Timesheet de ' || v_employee_name || ' (' || v_period || ') submetido para aprovação'
                WHEN 'APPROVED' THEN 'Timesheet de ' || v_employee_name || ' (' || v_period || ') aprovado'
                WHEN 'REJECTED' THEN 'Timesheet de ' || v_employee_name || ' (' || v_period || ') rejeitado. Motivo: ' || NEW.rejection_reason
                ELSE 'Timesheet de ' || v_employee_name || ' (' || v_period || ') passou de ' || OLD.status || ' para ' || NEW.status
            END);
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION private.notify_timesheet_status_change()
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
        -- Todos os gestores ativos cujo âmbito inclui o colaborador.
        INSERT INTO public.notifications (user_id, type, title, message)
        SELECT DISTINCT ms.manager_id, 'APPROVAL_REQUIRED', 'Timesheet para aprovação',
               v_employee.full_name || ' submeteu o timesheet de ' || v_period || '.'
        FROM public.manager_scopes ms
        JOIN public.profiles manager ON manager.id = ms.manager_id AND manager.is_active
        WHERE ms.manager_id <> NEW.employee_id
          AND (ms.employee_id = NEW.employee_id OR ms.department_id = v_employee.department_id);
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

CREATE TRIGGER trg_timesheets_notify
    AFTER UPDATE ON public.timesheets
    FOR EACH ROW EXECUTE FUNCTION private.notify_timesheet_status_change();

-- =============================================================================
-- 6. MANAGER_SCOPES: VALIDAÇÃO E AUDITORIA
-- =============================================================================
CREATE FUNCTION private.guard_manager_scope()
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

    IF NEW.employee_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.employee_id AND p.is_active) THEN
        RAISE EXCEPTION 'O colaborador selecionado não existe ou está inativo.';
    END IF;

    -- Ninguém altera o próprio âmbito, mesmo que tenha recebido USERS_UPDATE.
    IF NEW.manager_id = public.get_current_profile_id() AND NOT public.has_permission('ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Não pode alterar o seu próprio âmbito de gestão.' USING ERRCODE = '42501';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_manager_scopes_guard
    BEFORE INSERT OR UPDATE ON public.manager_scopes
    FOR EACH ROW EXECUTE FUNCTION private.guard_manager_scope();

CREATE FUNCTION private.guard_manager_scope_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    -- get_current_profile_id() é NULL para o SQL Editor e service_role, que não são bloqueados.
    IF OLD.manager_id = public.get_current_profile_id() AND NOT public.has_permission('ADMIN_ACCESS') THEN
        RAISE EXCEPTION 'Não pode alterar o seu próprio âmbito de gestão.' USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
END;
$$;

CREATE TRIGGER trg_manager_scopes_guard_delete
    BEFORE DELETE ON public.manager_scopes
    FOR EACH ROW EXECUTE FUNCTION private.guard_manager_scope_delete();

CREATE FUNCTION private.audit_manager_scope_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_scope public.manager_scopes%ROWTYPE;
    v_manager_name TEXT;
    v_target TEXT;
BEGIN
    v_scope := CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
    SELECT full_name INTO v_manager_name FROM public.profiles WHERE id = v_scope.manager_id;

    IF v_scope.department_id IS NOT NULL THEN
        SELECT 'departamento ' || name INTO v_target FROM public.departments WHERE id = v_scope.department_id;
    ELSE
        SELECT 'colaborador ' || full_name INTO v_target FROM public.profiles WHERE id = v_scope.employee_id;
    END IF;

    PERFORM private.write_audit_event(
        CASE TG_OP WHEN 'DELETE' THEN 'manager_scope.removed' ELSE 'manager_scope.assigned' END,
        'manager_scopes', v_scope.manager_id::TEXT,
        CASE TG_OP WHEN 'DELETE' THEN 'Âmbito removido de ' ELSE 'Âmbito atribuído a ' END
            || coalesce(v_manager_name, 'gestor') || ': ' || coalesce(v_target, 'alvo removido'));

    RETURN v_scope;
END;
$$;

CREATE TRIGGER trg_manager_scopes_audit
    AFTER INSERT OR DELETE ON public.manager_scopes
    FOR EACH ROW EXECUTE FUNCTION private.audit_manager_scope_changes();

-- Âmbitos geridos apenas por quem gere utilizadores; não existe UPDATE (remove-se e cria-se).
REVOKE UPDATE ON public.manager_scopes FROM authenticated;

-- =============================================================================
-- 7. EQUIPA E ATIVIDADE DO GESTOR
-- =============================================================================
-- security_invoker: a RLS de profiles continua a aplicar-se a quem consulta.
CREATE VIEW public.my_team_members
WITH (security_invoker = true) AS
SELECT p.*
FROM public.profiles p
WHERE p.id IS DISTINCT FROM public.get_current_profile_id()
  AND public.is_manager_of_employee(p.id);

REVOKE ALL ON public.my_team_members FROM anon;
GRANT SELECT ON public.my_team_members TO authenticated;

-- O gestor lê a auditoria dos timesheets da sua equipa (nunca a dos restantes nem a administrativa).
DROP POLICY audit_events_select ON public.audit_events;
CREATE POLICY audit_events_select ON public.audit_events FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('AUDIT_READ'))
    OR (
        entity_type = 'timesheets'
        AND (SELECT public.has_permission('TEAM_TIMESHEET_READ'))
        AND EXISTS (
            SELECT 1 FROM public.timesheets t
            WHERE t.id::TEXT = entity_id
              AND t.employee_id <> (SELECT public.get_current_profile_id())
              AND public.is_manager_of_employee(t.employee_id)
        )
    )
);

-- =============================================================================
-- 8. PRIVILÉGIOS DE EXECUÇÃO
-- =============================================================================
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.submit_timesheet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.review_timesheet(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.approve_timesheets(UUID[], TEXT) TO authenticated;

-- Usadas pelas políticas e pelos triggers de proteção durante pedidos da API.
GRANT EXECUTE ON FUNCTION private.can_edit_own_timesheet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_other_active_admin(UUID) TO authenticated;
