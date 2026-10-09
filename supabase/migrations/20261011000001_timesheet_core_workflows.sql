-- TsheetGRT · SI Holdings — Timesheet Core (2/3): fluxos do servidor
--
-- Todas as mudanças de estado de tarefas, reuniões, ausências, oportunidades e anexos passam por
-- estas funções (SECURITY DEFINER, search_path vazio). Cada uma valida: sessão ativa, permissão,
-- âmbito (manager_scopes), estado atual, transição permitida e, onde há edição concorrente,
-- a versão lida pelo cliente (updated_at). O histórico é escrito pelo servidor com o ator da sessão.

-- =============================================================================
-- 1. UTILITÁRIOS
-- =============================================================================
CREATE FUNCTION private.local_datetime_label(p_value TIMESTAMPTZ)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_value IS NULL THEN 'Sem prazo'
                ELSE to_char(p_value AT TIME ZONE 'Africa/Maputo', 'DD/MM/YYYY HH24:MI') END;
$$;

CREATE FUNCTION private.local_today()
RETURNS DATE
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
    SELECT (now() AT TIME ZONE 'Africa/Maputo')::date;
$$;

CREATE FUNCTION private.task_status_label(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_status
        WHEN 'PLANNED' THEN 'Planeada'
        WHEN 'ASSIGNED' THEN 'Atribuída'
        WHEN 'IN_PROGRESS' THEN 'Em curso'
        WHEN 'BLOCKED' THEN 'Bloqueada'
        WHEN 'COMPLETED' THEN 'Concluída'
        WHEN 'CANCELLED' THEN 'Cancelada'
        ELSE p_status
    END;
$$;

CREATE FUNCTION private.department_label(p_department_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((SELECT name::TEXT FROM public.departments WHERE id = p_department_id), 'Sem departamento');
$$;

-- Permissão de outro utilizador (destinatários de notificações); has_permission só vê a sessão.
CREATE FUNCTION private.profile_has_permission(p_profile_id UUID, p_permission_code TEXT)
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
        WHERE p.id = p_profile_id AND p.is_active AND perm.code = p_permission_code
    );
$$;

CREATE FUNCTION private.notify_profiles(p_recipients UUID[], p_actor_id UUID, p_type TEXT, p_title TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
    INSERT INTO public.notifications (user_id, type, title, message)
    SELECT DISTINCT recipient, p_type, left(p_title, 200), p_message
    FROM unnest(p_recipients) AS recipient
    WHERE recipient IS NOT NULL
      AND recipient IS DISTINCT FROM p_actor_id
      AND private.is_active_profile(recipient);
$$;

-- =============================================================================
-- 2. HISTÓRICO (append-only, ator da sessão)
-- =============================================================================
CREATE FUNCTION private.log_task_event(
    p_task_id UUID, p_event_type TEXT, p_field TEXT, p_old_value TEXT, p_new_value TEXT, p_note TEXT,
    p_after_closure BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
BEGIN
    INSERT INTO public.task_events (task_id, actor_id, actor_name, event_type, field, old_value, new_value, note, after_closure)
    VALUES (p_task_id, v_actor, (SELECT full_name FROM public.profiles WHERE id = v_actor), p_event_type, p_field,
            p_old_value, p_new_value, nullif(btrim(coalesce(p_note, '')), ''), p_after_closure);
END;
$$;

CREATE FUNCTION private.log_meeting_event(
    p_meeting_id UUID, p_event_type TEXT, p_field TEXT, p_old_value TEXT, p_new_value TEXT, p_note TEXT,
    p_after_closure BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
BEGIN
    INSERT INTO public.meeting_events (meeting_id, actor_id, actor_name, event_type, field, old_value, new_value, note, after_closure)
    VALUES (p_meeting_id, v_actor, (SELECT full_name FROM public.profiles WHERE id = v_actor), p_event_type, p_field,
            p_old_value, p_new_value, nullif(btrim(coalesce(p_note, '')), ''), p_after_closure);
END;
$$;

CREATE FUNCTION private.log_absence_event(
    p_request_id UUID, p_event_type TEXT, p_field TEXT, p_old_value TEXT, p_new_value TEXT, p_note TEXT
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
BEGIN
    INSERT INTO public.absence_events (absence_request_id, actor_id, actor_name, event_type, field, old_value, new_value, note)
    VALUES (p_request_id, v_actor, (SELECT full_name FROM public.profiles WHERE id = v_actor), p_event_type, p_field,
            p_old_value, p_new_value, nullif(btrim(coalesce(p_note, '')), ''));
END;
$$;

CREATE FUNCTION private.log_opportunity_event(
    p_opportunity_id UUID, p_event_type TEXT, p_field TEXT, p_old_value TEXT, p_new_value TEXT, p_note TEXT,
    p_after_closure BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
BEGIN
    INSERT INTO public.opportunity_events (opportunity_id, actor_id, actor_name, event_type, field, old_value, new_value, note, after_closure)
    VALUES (p_opportunity_id, v_actor, (SELECT full_name FROM public.profiles WHERE id = v_actor), p_event_type, p_field,
            p_old_value, p_new_value, nullif(btrim(coalesce(p_note, '')), ''), p_after_closure);
END;
$$;

-- =============================================================================
-- 3. TAREFAS
-- =============================================================================
-- Bloqueia a tarefa para alteração. Inexistente e sem acesso têm a mesma resposta.
CREATE FUNCTION private.lock_task(p_task_id UUID)
RETURNS public.tasks
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id FOR UPDATE;
    IF NOT FOUND OR NOT private.can_read_task(v_task) THEN
        RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
    END IF;
    RETURN v_task;
END;
$$;

-- Responsável válido: conta ativa e dentro do âmbito de quem atribui (ou o próprio, ou administração).
CREATE FUNCTION private.assert_task_assignee(p_assignee_id UUID)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT private.is_active_profile(p_assignee_id) OR NOT private.manages_work_of(p_assignee_id) THEN
        RAISE EXCEPTION 'O responsável tem de ser um utilizador ativo do seu âmbito de gestão.' USING ERRCODE = '42501';
    END IF;
END;
$$;

CREATE FUNCTION public.create_task(
    p_title TEXT,
    p_description TEXT DEFAULT '',
    p_priority TEXT DEFAULT 'MEDIUM',
    p_assignee_id UUID DEFAULT NULL,
    p_due_at TIMESTAMPTZ DEFAULT NULL,
    p_start_date DATE DEFAULT NULL,
    p_estimated_minutes INTEGER DEFAULT NULL,
    p_department_id UUID DEFAULT NULL,
    p_parent_task_id UUID DEFAULT NULL,
    p_opportunity_id UUID DEFAULT NULL,
    p_meeting_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_parent public.tasks%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
    v_meeting public.meetings%ROWTYPE;
    v_department_id UUID := p_department_id;
    v_task_id UUID;
    v_reference TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_CREATE', 'Não tem permissão para criar tarefas.');
    IF p_priority IS NULL OR p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
        RAISE EXCEPTION 'Prioridade inválida.';
    END IF;
    IF p_assignee_id IS NOT NULL THEN
        PERFORM private.require_permission('TIMESHEET_TASK_ASSIGN', 'Não tem permissão para atribuir tarefas.');
        PERFORM private.assert_task_assignee(p_assignee_id);
    END IF;
    IF p_due_at IS NOT NULL AND p_due_at <= now() THEN
        RAISE EXCEPTION 'O prazo tem de ser uma data futura.';
    END IF;
    IF p_start_date IS NOT NULL AND p_due_at IS NOT NULL AND p_start_date > (p_due_at AT TIME ZONE 'Africa/Maputo')::date THEN
        RAISE EXCEPTION 'A data de início não pode ser posterior ao prazo.';
    END IF;

    IF p_parent_task_id IS NOT NULL THEN
        SELECT * INTO v_parent FROM public.tasks WHERE id = p_parent_task_id;
        IF NOT FOUND OR NOT private.can_read_task(v_parent) THEN
            RAISE EXCEPTION 'Tarefa de origem não encontrada.' USING ERRCODE = '42501';
        END IF;
        IF v_parent.status = 'CANCELLED' THEN
            RAISE EXCEPTION 'Não é possível acrescentar trabalho a uma tarefa cancelada.';
        END IF;
    END IF;
    IF p_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_opportunity_id;
        IF NOT FOUND OR NOT private.can_read_opportunity(v_opportunity) THEN
            RAISE EXCEPTION 'Oportunidade não encontrada.' USING ERRCODE = '42501';
        END IF;
        IF v_opportunity.status = 'CANCELLED' THEN
            RAISE EXCEPTION 'A oportunidade está cancelada.';
        END IF;
    END IF;
    IF p_meeting_id IS NOT NULL THEN
        SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;
        IF NOT FOUND OR NOT private.can_read_meeting(v_meeting) THEN
            RAISE EXCEPTION 'Reunião não encontrada.' USING ERRCODE = '42501';
        END IF;
    END IF;

    IF v_department_id IS NOT NULL THEN
        IF NOT EXISTS (SELECT 1 FROM public.departments WHERE id = v_department_id AND active) THEN
            RAISE EXCEPTION 'O departamento selecionado não existe ou está inativo.';
        END IF;
    ELSE
        v_department_id := coalesce(
            (SELECT department_id FROM public.profiles WHERE id = p_assignee_id),
            v_parent.department_id,
            private.current_department_id()
        );
    END IF;

    INSERT INTO public.tasks (title, description, created_by, assignee_id, department_id, priority, status,
                              start_date, due_at, estimated_minutes, parent_task_id, opportunity_id, meeting_id)
    VALUES (btrim(coalesce(p_title, '')), btrim(coalesce(p_description, '')), v_actor, p_assignee_id, v_department_id,
            p_priority, CASE WHEN p_assignee_id IS NULL THEN 'PLANNED' ELSE 'ASSIGNED' END,
            p_start_date, p_due_at, p_estimated_minutes, p_parent_task_id, p_opportunity_id, p_meeting_id)
    RETURNING id, reference INTO v_task_id, v_reference;

    PERFORM private.log_task_event(v_task_id, 'TASK_CREATED', NULL, NULL, v_reference,
        CASE WHEN p_parent_task_id IS NOT NULL THEN 'Tarefa adicional de ' || v_parent.reference END);
    IF p_assignee_id IS NOT NULL THEN
        PERFORM private.log_task_event(v_task_id, 'TASK_ASSIGNED', 'assignee', 'Sem responsável', private.profile_label(p_assignee_id), NULL);
    END IF;
    RETURN v_task_id;
END;
$$;

-- Atribuir, reatribuir ou retirar o responsável (NULL: só antes de a tarefa começar).
CREATE FUNCTION public.assign_task(p_task_id UUID, p_assignee_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_after_closure BOOLEAN := v_task.status = 'COMPLETED';
    v_note TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_ASSIGN', 'Não tem permissão para atribuir tarefas.');
    IF NOT private.manages_task(v_task) THEN
        RAISE EXCEPTION 'Não pode atribuir esta tarefa: está fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A tarefa está cancelada.';
    END IF;
    v_note := CASE WHEN v_after_closure
        THEN private.required_text(p_note, 5, 1000, 'Indique o motivo da alteração de uma tarefa concluída')
        ELSE private.optional_text(p_note, 1000, 'A nota') END;

    IF p_assignee_id IS NULL THEN
        IF v_task.status <> 'ASSIGNED' THEN
            RAISE EXCEPTION 'Só é possível retirar o responsável de uma tarefa ainda não iniciada.';
        END IF;
        UPDATE public.tasks SET assignee_id = NULL, status = 'PLANNED' WHERE id = p_task_id;
        PERFORM private.log_task_event(p_task_id, 'TASK_UNASSIGNED', 'assignee', private.profile_label(v_task.assignee_id), 'Sem responsável', v_note);
        RETURN;
    END IF;

    PERFORM private.assert_task_assignee(p_assignee_id);
    IF p_assignee_id = v_task.assignee_id THEN
        RAISE EXCEPTION 'A tarefa já está atribuída a este colaborador.';
    END IF;

    UPDATE public.tasks
    SET assignee_id = p_assignee_id,
        status = CASE WHEN status = 'PLANNED' THEN 'ASSIGNED' ELSE status END
    WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id,
        CASE WHEN v_task.assignee_id IS NULL THEN 'TASK_ASSIGNED' ELSE 'TASK_REASSIGNED' END,
        'assignee', private.profile_label(v_task.assignee_id), private.profile_label(p_assignee_id), v_note, v_after_closure);
END;
$$;

-- Edição do planeamento. Os parâmetros são os novos valores completos (o formulário inteiro).
-- Em tarefas concluídas exige motivo e marca cada alteração como pós-encerramento.
CREATE FUNCTION public.update_task(
    p_task_id UUID,
    p_title TEXT,
    p_description TEXT,
    p_priority TEXT,
    p_due_at TIMESTAMPTZ,
    p_start_date DATE,
    p_estimated_minutes INTEGER,
    p_department_id UUID,
    p_reason TEXT DEFAULT NULL,
    p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_after_closure BOOLEAN := v_task.status = 'COMPLETED';
    v_reason TEXT;
    v_title TEXT := btrim(coalesce(p_title, ''));
    v_description TEXT := btrim(coalesce(p_description, ''));
    v_late_reason TEXT := v_task.late_reason;
    v_change RECORD;
    v_changes INTEGER := 0;
BEGIN
    IF NOT private.manages_task(v_task)
       OR NOT (public.has_permission('TIMESHEET_TASK_ASSIGN') OR public.has_permission('TIMESHEET_TASK_CREATE')) THEN
        RAISE EXCEPTION 'Não pode alterar esta tarefa.' USING ERRCODE = '42501';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_task.updated_at <> p_expected_updated_at THEN
        RAISE EXCEPTION 'A tarefa foi alterada por outra pessoa entretanto. Recarregue e tente novamente.';
    END IF;
    IF v_task.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A tarefa está cancelada e não pode ser alterada.';
    END IF;
    IF p_priority IS NULL OR p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
        RAISE EXCEPTION 'Prioridade inválida.';
    END IF;
    v_reason := CASE WHEN v_after_closure
        THEN private.required_text(p_reason, 5, 1000, 'Indique o motivo da alteração de uma tarefa concluída')
        ELSE private.optional_text(p_reason, 1000, 'O motivo') END;

    IF p_due_at IS DISTINCT FROM v_task.due_at AND NOT v_after_closure AND p_due_at IS NOT NULL AND p_due_at <= now() THEN
        RAISE EXCEPTION 'O novo prazo tem de ser uma data futura.';
    END IF;
    IF p_start_date IS NOT NULL AND p_due_at IS NOT NULL AND p_start_date > (p_due_at AT TIME ZONE 'Africa/Maputo')::date THEN
        RAISE EXCEPTION 'A data de início não pode ser posterior ao prazo.';
    END IF;
    IF p_department_id IS DISTINCT FROM v_task.department_id AND p_department_id IS NOT NULL
       AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = p_department_id AND active) THEN
        RAISE EXCEPTION 'O departamento selecionado não existe ou está inativo.';
    END IF;
    -- Uma tarefa concluída cujo novo prazo fica antes da conclusão passa a estar concluída com atraso:
    -- o motivo da alteração fica como justificação.
    IF v_after_closure AND p_due_at IS NOT NULL AND v_task.completed_at > p_due_at AND v_late_reason IS NULL THEN
        v_late_reason := v_reason;
    END IF;

    FOR v_change IN
        SELECT * FROM (VALUES
            ('TASK_UPDATED', 'title', v_task.title::TEXT, v_title),
            ('TASK_UPDATED', 'description', v_task.description, v_description),
            ('TASK_PRIORITY_CHANGED', 'priority', private.it_priority_label(v_task.priority), private.it_priority_label(p_priority)),
            ('TASK_DEADLINE_CHANGED', 'due_at', private.local_datetime_label(v_task.due_at), private.local_datetime_label(p_due_at)),
            ('TASK_UPDATED', 'start_date', to_char(v_task.start_date, 'DD/MM/YYYY'), to_char(p_start_date, 'DD/MM/YYYY')),
            ('TASK_UPDATED', 'estimated_minutes', v_task.estimated_minutes::TEXT, p_estimated_minutes::TEXT),
            ('TASK_UPDATED', 'department', private.department_label(v_task.department_id), private.department_label(p_department_id))
        ) AS changes(event_type, field, old_value, new_value)
        WHERE changes.old_value IS DISTINCT FROM changes.new_value
    LOOP
        v_changes := v_changes + 1;
        PERFORM private.log_task_event(p_task_id, v_change.event_type, v_change.field, v_change.old_value, v_change.new_value,
            v_reason, v_after_closure);
    END LOOP;

    IF v_changes = 0 THEN
        RAISE EXCEPTION 'Não existem alterações a guardar.';
    END IF;

    UPDATE public.tasks
    SET title = v_title, description = v_description, priority = p_priority, due_at = p_due_at,
        start_date = p_start_date, estimated_minutes = p_estimated_minutes, department_id = p_department_id,
        late_reason = v_late_reason
    WHERE id = p_task_id;
END;
$$;

CREATE FUNCTION public.start_task(p_task_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_UPDATE', 'Não tem permissão para executar tarefas.');
    IF v_task.assignee_id IS DISTINCT FROM public.get_current_profile_id() THEN
        RAISE EXCEPTION 'Só o responsável pode iniciar a tarefa.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status <> 'ASSIGNED' THEN
        RAISE EXCEPTION 'Só é possível iniciar uma tarefa atribuída (estado atual: %).', lower(private.task_status_label(v_task.status));
    END IF;
    UPDATE public.tasks SET status = 'IN_PROGRESS', started_at = coalesce(started_at, now()) WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id, 'TASK_STARTED', 'status',
        private.task_status_label('ASSIGNED'), private.task_status_label('IN_PROGRESS'), NULL);
END;
$$;

CREATE FUNCTION public.block_task(p_task_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_reason TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_UPDATE', 'Não tem permissão para executar tarefas.');
    IF NOT (v_task.assignee_id = public.get_current_profile_id() OR private.manages_task(v_task)) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a tarefa a pode bloquear.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status <> 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'Só é possível bloquear uma tarefa em curso.';
    END IF;
    v_reason := private.required_text(p_reason, 5, 1000, 'Descreva o bloqueio');
    UPDATE public.tasks SET status = 'BLOCKED', blocked_reason = v_reason WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id, 'TASK_BLOCKED', 'status',
        private.task_status_label('IN_PROGRESS'), private.task_status_label('BLOCKED'), v_reason);
END;
$$;

CREATE FUNCTION public.unblock_task(p_task_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_UPDATE', 'Não tem permissão para executar tarefas.');
    IF NOT (v_task.assignee_id = public.get_current_profile_id() OR private.manages_task(v_task)) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a tarefa a pode desbloquear.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status <> 'BLOCKED' THEN
        RAISE EXCEPTION 'A tarefa não está bloqueada.';
    END IF;
    UPDATE public.tasks SET status = 'IN_PROGRESS', blocked_reason = NULL WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id, 'TASK_UNBLOCKED', 'status',
        private.task_status_label('BLOCKED'), private.task_status_label('IN_PROGRESS'),
        private.optional_text(p_note, 1000, 'A nota'));
END;
$$;

-- Conclusão: depois do prazo exige o motivo do atraso, que fica permanentemente no histórico.
CREATE FUNCTION public.complete_task(p_task_id UUID, p_completion_note TEXT DEFAULT NULL, p_late_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_is_late BOOLEAN;
    v_late_reason TEXT;
    v_note TEXT := private.optional_text(p_completion_note, 2000, 'A nota de conclusão');
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_UPDATE', 'Não tem permissão para executar tarefas.');
    IF NOT (v_task.assignee_id = public.get_current_profile_id()
            OR (private.manages_task(v_task) AND public.has_permission('TIMESHEET_TASK_ASSIGN'))) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a tarefa a pode concluir.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status = 'ASSIGNED' THEN
        RAISE EXCEPTION 'Inicie a tarefa antes de a concluir.';
    ELSIF v_task.status = 'BLOCKED' THEN
        RAISE EXCEPTION 'A tarefa está bloqueada: desbloqueie-a antes de a concluir.';
    ELSIF v_task.status <> 'IN_PROGRESS' THEN
        RAISE EXCEPTION 'Só é possível concluir uma tarefa em curso (estado atual: %).', lower(private.task_status_label(v_task.status));
    END IF;

    v_is_late := v_task.due_at IS NOT NULL AND now() > v_task.due_at;
    IF v_is_late THEN
        v_late_reason := private.required_text(p_late_reason, 5, 1000,
            'A tarefa está a ser concluída depois do prazo. Indique o motivo do atraso');
    END IF;

    UPDATE public.tasks
    SET status = 'COMPLETED', completed_at = now(), completion_note = v_note, late_reason = v_late_reason
    WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id,
        CASE WHEN v_is_late THEN 'TASK_COMPLETED_LATE' ELSE 'TASK_COMPLETED' END,
        CASE WHEN v_is_late THEN 'late_reason' ELSE 'status' END,
        private.task_status_label('IN_PROGRESS'),
        CASE WHEN v_is_late THEN v_late_reason ELSE private.task_status_label('COMPLETED') END,
        v_note);
END;
$$;

CREATE FUNCTION public.reopen_task(p_task_id UUID, p_reason TEXT, p_new_due_at TIMESTAMPTZ DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_reason TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_REOPEN', 'Não tem permissão para reabrir tarefas.');
    IF NOT private.manages_task(v_task) THEN
        RAISE EXCEPTION 'Não pode reabrir esta tarefa: está fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Só é possível reabrir tarefas concluídas.';
    END IF;
    v_reason := private.required_text(p_reason, 5, 1000, 'Indique o motivo da reabertura');
    IF p_new_due_at IS NOT NULL AND p_new_due_at <= now() THEN
        RAISE EXCEPTION 'O novo prazo tem de ser uma data futura.';
    END IF;

    UPDATE public.tasks
    SET status = 'IN_PROGRESS', completed_at = NULL, completion_note = NULL, late_reason = NULL,
        due_at = coalesce(p_new_due_at, due_at)
    WHERE id = p_task_id;
    -- A conclusão anterior (e o motivo de atraso, se houve) permanece no histórico.
    PERFORM private.log_task_event(p_task_id, 'TASK_REOPENED', 'status',
        private.task_status_label('COMPLETED'), private.task_status_label('IN_PROGRESS'), v_reason, true);
    IF p_new_due_at IS NOT NULL AND p_new_due_at IS DISTINCT FROM v_task.due_at THEN
        PERFORM private.log_task_event(p_task_id, 'TASK_DEADLINE_CHANGED', 'due_at',
            private.local_datetime_label(v_task.due_at), private.local_datetime_label(p_new_due_at), v_reason);
    END IF;
END;
$$;

CREATE FUNCTION public.cancel_task(p_task_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_reason TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_ASSIGN', 'Não tem permissão para cancelar tarefas.');
    IF NOT private.manages_task(v_task) THEN
        RAISE EXCEPTION 'Não pode cancelar esta tarefa: está fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status IN ('COMPLETED', 'CANCELLED') THEN
        RAISE EXCEPTION 'Uma tarefa % não pode ser cancelada.', lower(private.task_status_label(v_task.status));
    END IF;
    v_reason := private.required_text(p_reason, 5, 1000, 'Indique o motivo do cancelamento');
    UPDATE public.tasks SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = v_reason WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id, 'TASK_CANCELLED', 'status',
        private.task_status_label(v_task.status), private.task_status_label('CANCELLED'), v_reason);
END;
$$;

CREATE FUNCTION public.add_task_comment(p_task_id UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_UPDATE', 'Não tem permissão para comentar tarefas.');
    IF v_task.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A tarefa está cancelada e não aceita comentários.';
    END IF;
    PERFORM private.log_task_event(p_task_id, 'TASK_COMMENT_ADDED', NULL, NULL, NULL,
        private.required_text(p_body, 1, 5000, 'Escreva o comentário'));
END;
$$;

CREATE FUNCTION private.notify_task_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE;
    v_label TEXT;
BEGIN
    SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;
    v_label := v_task.reference || ' — ' || v_task.title;

    CASE NEW.event_type
        WHEN 'TASK_ASSIGNED', 'TASK_REASSIGNED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_ASSIGNED', 'Nova tarefa atribuída',
                v_label || CASE WHEN v_task.due_at IS NULL THEN '' ELSE ' · prazo ' || private.local_datetime_label(v_task.due_at) END);
        WHEN 'TASK_BLOCKED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.created_by], NEW.actor_id, 'TASK_BLOCKED', 'Tarefa bloqueada',
                v_label || ': ' || coalesce(NEW.note, ''));
        WHEN 'TASK_COMPLETED', 'TASK_COMPLETED_LATE' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.created_by], NEW.actor_id, 'TASK_COMPLETED',
                CASE WHEN NEW.event_type = 'TASK_COMPLETED_LATE' THEN 'Tarefa concluída com atraso' ELSE 'Tarefa concluída' END,
                v_label);
        WHEN 'TASK_REOPENED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_REOPENED', 'Tarefa reaberta',
                v_label || ': ' || coalesce(NEW.note, ''));
        WHEN 'TASK_CANCELLED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_CANCELLED', 'Tarefa cancelada',
                v_label || ': ' || coalesce(NEW.note, ''));
        WHEN 'TASK_DEADLINE_CHANGED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_UPDATED', 'Prazo da tarefa alterado',
                v_label || ': ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—'));
        WHEN 'TASK_PRIORITY_CHANGED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_UPDATED', 'Prioridade da tarefa alterada',
                v_label || ': ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—'));
        WHEN 'TASK_COMMENT_ADDED' THEN
            PERFORM private.notify_profiles(ARRAY[v_task.assignee_id, v_task.created_by], NEW.actor_id, 'TASK_COMMENT',
                'Novo comentário numa tarefa', v_label);
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_events_notify
    AFTER INSERT ON public.task_events
    FOR EACH ROW EXECUTE FUNCTION private.notify_task_event();

CREATE FUNCTION private.audit_task_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reference TEXT;
BEGIN
    -- Comentários e anexos ficam no histórico da tarefa (os anexos têm auditoria própria).
    IF NEW.event_type IN ('TASK_COMMENT_ADDED', 'TASK_ATTACHMENT_ADDED', 'TASK_ATTACHMENT_REMOVED') THEN
        RETURN NEW;
    END IF;
    SELECT reference INTO v_reference FROM public.tasks WHERE id = NEW.task_id;
    PERFORM private.write_audit_event('task.' || lower(substr(NEW.event_type, 6)), 'tasks', NEW.task_id::TEXT,
        'Tarefa ' || v_reference
        || CASE WHEN NEW.field IS NOT NULL
                THEN ' (' || NEW.field || '): ' || coalesce(left(NEW.old_value, 200), '—') || ' → ' || coalesce(left(NEW.new_value, 200), '—')
                ELSE '' END
        || CASE WHEN NEW.after_closure THEN ' [após conclusão]' ELSE '' END
        || CASE WHEN NEW.note IS NOT NULL THEN '. Motivo: ' || left(NEW.note, 500) ELSE '' END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_task_events_audit
    AFTER INSERT ON public.task_events
    FOR EACH ROW EXECUTE FUNCTION private.audit_task_event();

-- =============================================================================
-- 4. REGISTO DE TEMPO
-- =============================================================================
-- Devolve o período do próprio colaborador que contém a data, criando-o segundo o ciclo da
-- empresa (TIMESHEET_PERIOD_TYPE) se ainda não existir. O registo é depois inserido pelo cliente
-- sob a RLS existente de timesheet_entries.
CREATE FUNCTION public.ensure_my_timesheet_period(p_work_date DATE)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_timesheet public.timesheets%ROWTYPE;
    v_period_type TEXT;
    v_start DATE;
    v_end DATE;
    v_timesheet_id UUID;
BEGIN
    PERFORM private.require_permission('SELF_TIMESHEET_UPDATE', 'Não tem permissão para registar tempo.');
    IF p_work_date IS NULL OR p_work_date > private.local_today() THEN
        RAISE EXCEPTION 'Não é possível registar tempo em datas futuras.';
    END IF;

    SELECT * INTO v_timesheet
    FROM public.timesheets
    WHERE employee_id = v_actor AND p_work_date BETWEEN period_start AND period_end
    ORDER BY period_start DESC
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
        IF v_timesheet.status NOT IN ('DRAFT', 'REJECTED') THEN
            RAISE EXCEPTION 'O período de % a % já foi submetido ou aprovado e não aceita novos registos.',
                to_char(v_timesheet.period_start, 'DD/MM/YYYY'), to_char(v_timesheet.period_end, 'DD/MM/YYYY');
        END IF;
        RETURN v_timesheet.id;
    END IF;

    PERFORM private.require_permission('SELF_TIMESHEET_CREATE', 'Não tem permissão para criar períodos de timesheet.');
    SELECT value INTO v_period_type FROM public.system_settings WHERE key = 'TIMESHEET_PERIOD_TYPE';
    CASE coalesce(v_period_type, 'MONTHLY')
        WHEN 'WEEKLY' THEN
            v_start := p_work_date - (extract(isodow FROM p_work_date)::INTEGER - 1);
            v_end := v_start + 6;
        WHEN 'BIWEEKLY' THEN
            IF extract(day FROM p_work_date) <= 15 THEN
                v_start := date_trunc('month', p_work_date)::date;
                v_end := v_start + 14;
            ELSE
                v_start := date_trunc('month', p_work_date)::date + 15;
                v_end := (date_trunc('month', p_work_date) + interval '1 month - 1 day')::date;
            END IF;
        ELSE
            v_start := date_trunc('month', p_work_date)::date;
            v_end := (date_trunc('month', p_work_date) + interval '1 month - 1 day')::date;
    END CASE;

    IF EXISTS (
        SELECT 1 FROM public.timesheets
        WHERE employee_id = v_actor AND period_start <= v_end AND period_end >= v_start
    ) THEN
        RAISE EXCEPTION 'Já existe um período que se sobrepõe a % – %. Registe o tempo a partir desse período.',
            to_char(v_start, 'DD/MM/YYYY'), to_char(v_end, 'DD/MM/YYYY');
    END IF;

    INSERT INTO public.timesheets (employee_id, period_start, period_end)
    VALUES (v_actor, v_start, v_end)
    RETURNING id INTO v_timesheet_id;
    RETURN v_timesheet_id;
END;
$$;

-- Tempo dedicado a uma tarefa/reunião/oportunidade visível a quem consulta, agregado por pessoa.
CREATE FUNCTION public.get_work_time_totals(p_entity_type TEXT, p_entity_id UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, total_minutes INTEGER, entry_count INTEGER)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE;
    v_meeting public.meetings%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    IF p_entity_type = 'TASK' THEN
        SELECT * INTO v_task FROM public.tasks WHERE id = p_entity_id;
        IF NOT FOUND OR NOT private.can_read_task(v_task) THEN
            RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
        END IF;
    ELSIF p_entity_type = 'MEETING' THEN
        SELECT * INTO v_meeting FROM public.meetings WHERE id = p_entity_id;
        IF NOT FOUND OR NOT private.can_read_meeting(v_meeting) THEN
            RAISE EXCEPTION 'Reunião não encontrada.' USING ERRCODE = '42501';
        END IF;
    ELSIF p_entity_type = 'OPPORTUNITY' THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_entity_id;
        IF NOT FOUND OR NOT private.can_read_opportunity(v_opportunity) THEN
            RAISE EXCEPTION 'Oportunidade não encontrada.' USING ERRCODE = '42501';
        END IF;
    ELSE
        RAISE EXCEPTION 'Tipo de registo inválido.';
    END IF;

    RETURN QUERY
    SELECT e.employee_id, p.full_name::TEXT, sum(e.total_minutes)::INTEGER, count(*)::INTEGER
    FROM public.timesheet_entries e
    JOIN public.profiles p ON p.id = e.employee_id
    WHERE (p_entity_type = 'TASK' AND e.task_id = p_entity_id)
       OR (p_entity_type = 'MEETING' AND e.meeting_id = p_entity_id)
       OR (p_entity_type = 'OPPORTUNITY' AND e.opportunity_id = p_entity_id)
    GROUP BY e.employee_id, p.full_name
    ORDER BY 3 DESC;
END;
$$;
