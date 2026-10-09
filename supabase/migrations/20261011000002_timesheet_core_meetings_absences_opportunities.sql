-- TsheetGRT · SI Holdings — Timesheet Core (3/4): reuniões, ausências, oportunidades e empresas
--
-- Mesmos princípios dos fluxos de tarefas: funções do servidor com validação de sessão,
-- permissão, âmbito e estado; histórico append-only; notificações e auditoria por trigger.

-- =============================================================================
-- 1. REUNIÕES
-- =============================================================================
CREATE FUNCTION private.lock_meeting(p_meeting_id UUID)
RETURNS public.meetings
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id FOR UPDATE;
    IF NOT FOUND OR NOT private.can_read_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Reunião não encontrada.' USING ERRCODE = '42501';
    END IF;
    RETURN v_meeting;
END;
$$;

-- Substitui a lista de participantes. p_log = false na criação (o evento de criação já a regista).
CREATE FUNCTION private.set_meeting_participants(p_meeting_id UUID, p_organizer_id UUID, p_participant_ids UUID[], p_log BOOLEAN)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_participants UUID[] := ARRAY(
        SELECT DISTINCT participant FROM unnest(coalesce(p_participant_ids, ARRAY[]::UUID[])) AS participant
        WHERE participant IS NOT NULL AND participant <> p_organizer_id
    );
    v_profile_id UUID;
    v_title TEXT;
BEGIN
    IF cardinality(v_participants) > 50 THEN
        RAISE EXCEPTION 'Uma reunião não pode ter mais de 50 participantes.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_participants) AS participant WHERE NOT private.is_active_profile(participant)) THEN
        RAISE EXCEPTION 'Todos os participantes têm de ser utilizadores ativos.';
    END IF;
    SELECT title INTO v_title FROM public.meetings WHERE id = p_meeting_id;

    FOR v_profile_id IN
        SELECT profile_id FROM public.meeting_participants
        WHERE meeting_id = p_meeting_id AND NOT (profile_id = ANY (v_participants))
    LOOP
        DELETE FROM public.meeting_participants WHERE meeting_id = p_meeting_id AND profile_id = v_profile_id;
        IF p_log THEN
            PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_PARTICIPANT_REMOVED', 'participant',
                private.profile_label(v_profile_id), NULL, NULL);
        END IF;
    END LOOP;

    FOR v_profile_id IN
        SELECT participant FROM unnest(v_participants) AS participant
        WHERE NOT EXISTS (SELECT 1 FROM public.meeting_participants WHERE meeting_id = p_meeting_id AND profile_id = participant)
    LOOP
        INSERT INTO public.meeting_participants (meeting_id, profile_id) VALUES (p_meeting_id, v_profile_id);
        IF p_log THEN
            PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_PARTICIPANT_ADDED', 'participant',
                NULL, private.profile_label(v_profile_id), NULL);
            PERFORM private.notify_profiles(ARRAY[v_profile_id], public.get_current_profile_id(), 'MEETING_INVITED',
                'Convite para reunião', v_title);
        END IF;
    END LOOP;
END;
$$;

CREATE FUNCTION public.create_meeting(
    p_title TEXT,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_description TEXT DEFAULT '',
    p_objective TEXT DEFAULT '',
    p_location TEXT DEFAULT NULL,
    p_meeting_url TEXT DEFAULT NULL,
    p_participant_ids UUID[] DEFAULT ARRAY[]::UUID[],
    p_task_id UUID DEFAULT NULL,
    p_opportunity_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_task public.tasks%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
    v_meeting_id UUID;
BEGIN
    PERFORM private.require_permission('TIMESHEET_MEETING_CREATE', 'Não tem permissão para organizar reuniões.');
    IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'A reunião tem de terminar depois de começar.';
    END IF;
    IF p_task_id IS NOT NULL THEN
        SELECT * INTO v_task FROM public.tasks WHERE id = p_task_id;
        IF NOT FOUND OR NOT private.can_read_task(v_task) THEN
            RAISE EXCEPTION 'Tarefa não encontrada.' USING ERRCODE = '42501';
        END IF;
    END IF;
    IF p_opportunity_id IS NOT NULL THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_opportunity_id;
        IF NOT FOUND OR NOT private.can_read_opportunity(v_opportunity) THEN
            RAISE EXCEPTION 'Oportunidade não encontrada.' USING ERRCODE = '42501';
        END IF;
    END IF;

    INSERT INTO public.meetings (title, description, objective, starts_at, ends_at, location, meeting_url,
                                 organizer_id, department_id, task_id, opportunity_id)
    VALUES (btrim(coalesce(p_title, '')), btrim(coalesce(p_description, '')), btrim(coalesce(p_objective, '')),
            p_starts_at, p_ends_at, private.optional_text(p_location, 200, 'O local'),
            private.optional_text(p_meeting_url, 500, 'A ligação'), v_actor, private.current_department_id(),
            p_task_id, p_opportunity_id)
    RETURNING id INTO v_meeting_id;

    PERFORM private.set_meeting_participants(v_meeting_id, v_actor, p_participant_ids, false);
    PERFORM private.log_meeting_event(v_meeting_id, 'MEETING_CREATED', NULL, NULL,
        private.local_datetime_label(p_starts_at), NULL);
    RETURN v_meeting_id;
END;
$$;

CREATE FUNCTION public.update_meeting(
    p_meeting_id UUID,
    p_title TEXT,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_description TEXT,
    p_objective TEXT,
    p_location TEXT,
    p_meeting_url TEXT,
    p_participant_ids UUID[],
    p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE := private.lock_meeting(p_meeting_id);
    v_location TEXT := private.optional_text(p_location, 200, 'O local');
    v_url TEXT := private.optional_text(p_meeting_url, 500, 'A ligação');
    v_change RECORD;
BEGIN
    IF NOT private.manages_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Só quem organiza a reunião a pode alterar.' USING ERRCODE = '42501';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_meeting.updated_at <> p_expected_updated_at THEN
        RAISE EXCEPTION 'A reunião foi alterada por outra pessoa entretanto. Recarregue e tente novamente.';
    END IF;
    IF v_meeting.status NOT IN ('PLANNED', 'CONFIRMED') THEN
        RAISE EXCEPTION 'Uma reunião % não pode ser reagendada. Use o registo do resultado.',
            CASE v_meeting.status WHEN 'COMPLETED' THEN 'concluída' ELSE 'cancelada' END;
    END IF;
    IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'A reunião tem de terminar depois de começar.';
    END IF;

    IF p_starts_at <> v_meeting.starts_at OR p_ends_at <> v_meeting.ends_at THEN
        PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_RESCHEDULED', 'schedule',
            private.local_datetime_label(v_meeting.starts_at) || ' – ' || to_char(v_meeting.ends_at AT TIME ZONE 'Africa/Maputo', 'HH24:MI'),
            private.local_datetime_label(p_starts_at) || ' – ' || to_char(p_ends_at AT TIME ZONE 'Africa/Maputo', 'HH24:MI'), NULL);
    END IF;
    FOR v_change IN
        SELECT * FROM (VALUES
            ('title', v_meeting.title::TEXT, btrim(coalesce(p_title, ''))),
            ('description', v_meeting.description, btrim(coalesce(p_description, ''))),
            ('objective', v_meeting.objective, btrim(coalesce(p_objective, ''))),
            ('location', v_meeting.location::TEXT, v_location),
            ('meeting_url', v_meeting.meeting_url::TEXT, v_url)
        ) AS changes(field, old_value, new_value)
        WHERE changes.old_value IS DISTINCT FROM changes.new_value
    LOOP
        PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_UPDATED', v_change.field, v_change.old_value, v_change.new_value, NULL);
    END LOOP;

    UPDATE public.meetings
    SET title = btrim(coalesce(p_title, '')), starts_at = p_starts_at, ends_at = p_ends_at,
        description = btrim(coalesce(p_description, '')), objective = btrim(coalesce(p_objective, '')),
        location = v_location, meeting_url = v_url
    WHERE id = p_meeting_id;
    PERFORM private.set_meeting_participants(p_meeting_id, v_meeting.organizer_id, p_participant_ids, true);
END;
$$;

CREATE FUNCTION public.confirm_meeting(p_meeting_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE := private.lock_meeting(p_meeting_id);
BEGIN
    IF NOT private.manages_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Só quem organiza a reunião a pode confirmar.' USING ERRCODE = '42501';
    END IF;
    IF v_meeting.status <> 'PLANNED' THEN
        RAISE EXCEPTION 'Só é possível confirmar reuniões planeadas.';
    END IF;
    UPDATE public.meetings SET status = 'CONFIRMED' WHERE id = p_meeting_id;
    PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_CONFIRMED', 'status', 'Planeada', 'Confirmada', NULL);
END;
$$;

CREATE FUNCTION public.complete_meeting(p_meeting_id UUID, p_outcome TEXT, p_decisions TEXT DEFAULT NULL, p_next_steps TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE := private.lock_meeting(p_meeting_id);
    v_outcome TEXT;
BEGIN
    IF NOT private.manages_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Só quem organiza a reunião pode registar o resultado.' USING ERRCODE = '42501';
    END IF;
    IF v_meeting.status NOT IN ('PLANNED', 'CONFIRMED') THEN
        RAISE EXCEPTION 'A reunião já foi concluída ou cancelada.';
    END IF;
    IF v_meeting.starts_at > now() THEN
        RAISE EXCEPTION 'A reunião ainda não começou.';
    END IF;
    v_outcome := private.required_text(p_outcome, 5, 5000, 'Descreva o resultado da reunião');
    UPDATE public.meetings
    SET status = 'COMPLETED', completed_at = now(), outcome = v_outcome,
        decisions = private.optional_text(p_decisions, 5000, 'As decisões'),
        next_steps = private.optional_text(p_next_steps, 5000, 'Os próximos passos')
    WHERE id = p_meeting_id;
    PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_COMPLETED', 'status',
        CASE v_meeting.status WHEN 'PLANNED' THEN 'Planeada' ELSE 'Confirmada' END, 'Concluída', v_outcome);
END;
$$;

-- Corrigir o resultado depois de concluída: exige motivo e fica marcado como pós-encerramento.
CREATE FUNCTION public.update_meeting_outcome(p_meeting_id UUID, p_outcome TEXT, p_decisions TEXT, p_next_steps TEXT, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE := private.lock_meeting(p_meeting_id);
    v_reason TEXT;
    v_outcome TEXT;
    v_decisions TEXT := private.optional_text(p_decisions, 5000, 'As decisões');
    v_next_steps TEXT := private.optional_text(p_next_steps, 5000, 'Os próximos passos');
    v_change RECORD;
    v_changes INTEGER := 0;
BEGIN
    IF NOT private.manages_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Só quem organiza a reunião pode alterar o resultado.' USING ERRCODE = '42501';
    END IF;
    IF v_meeting.status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Só é possível corrigir o resultado de uma reunião concluída.';
    END IF;
    v_reason := private.required_text(p_reason, 5, 1000, 'Indique o motivo da alteração');
    v_outcome := private.required_text(p_outcome, 5, 5000, 'Descreva o resultado da reunião');
    FOR v_change IN
        SELECT * FROM (VALUES
            ('outcome', v_meeting.outcome, v_outcome),
            ('decisions', v_meeting.decisions, v_decisions),
            ('next_steps', v_meeting.next_steps, v_next_steps)
        ) AS changes(field, old_value, new_value)
        WHERE changes.old_value IS DISTINCT FROM changes.new_value
    LOOP
        v_changes := v_changes + 1;
        PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_OUTCOME_UPDATED', v_change.field,
            v_change.old_value, v_change.new_value, v_reason, true);
    END LOOP;
    IF v_changes = 0 THEN
        RAISE EXCEPTION 'Não existem alterações a guardar.';
    END IF;
    UPDATE public.meetings SET outcome = v_outcome, decisions = v_decisions, next_steps = v_next_steps WHERE id = p_meeting_id;
END;
$$;

CREATE FUNCTION public.cancel_meeting(p_meeting_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE := private.lock_meeting(p_meeting_id);
    v_reason TEXT;
BEGIN
    IF NOT private.manages_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Só quem organiza a reunião a pode cancelar.' USING ERRCODE = '42501';
    END IF;
    IF v_meeting.status NOT IN ('PLANNED', 'CONFIRMED') THEN
        RAISE EXCEPTION 'A reunião já foi concluída ou cancelada.';
    END IF;
    v_reason := private.required_text(p_reason, 5, 1000, 'Indique o motivo do cancelamento');
    UPDATE public.meetings SET status = 'CANCELLED', cancelled_at = now(), cancel_reason = v_reason WHERE id = p_meeting_id;
    PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_CANCELLED', 'status',
        CASE v_meeting.status WHEN 'PLANNED' THEN 'Planeada' ELSE 'Confirmada' END, 'Cancelada', v_reason);
END;
$$;

CREATE FUNCTION private.notify_meeting_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE;
    v_participants UUID[];
    v_when TEXT;
BEGIN
    IF NEW.event_type NOT IN ('MEETING_CREATED', 'MEETING_RESCHEDULED', 'MEETING_CANCELLED') THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_meeting FROM public.meetings WHERE id = NEW.meeting_id;
    v_participants := ARRAY(SELECT profile_id FROM public.meeting_participants WHERE meeting_id = NEW.meeting_id)
        || v_meeting.organizer_id;
    v_when := private.local_datetime_label(v_meeting.starts_at);

    PERFORM private.notify_profiles(v_participants, NEW.actor_id,
        CASE NEW.event_type WHEN 'MEETING_CREATED' THEN 'MEETING_INVITED'
                            WHEN 'MEETING_RESCHEDULED' THEN 'MEETING_UPDATED'
                            ELSE 'MEETING_CANCELLED' END,
        CASE NEW.event_type WHEN 'MEETING_CREATED' THEN 'Convite para reunião'
                            WHEN 'MEETING_RESCHEDULED' THEN 'Reunião reagendada'
                            ELSE 'Reunião cancelada' END,
        v_meeting.title || ' · ' || v_when
        || CASE WHEN NEW.event_type = 'MEETING_CANCELLED' THEN ': ' || coalesce(NEW.note, '') ELSE '' END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_events_notify
    AFTER INSERT ON public.meeting_events
    FOR EACH ROW EXECUTE FUNCTION private.notify_meeting_event();

CREATE FUNCTION private.audit_meeting_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_title TEXT;
BEGIN
    IF NEW.event_type IN ('MEETING_ATTACHMENT_ADDED', 'MEETING_ATTACHMENT_REMOVED') THEN
        RETURN NEW;
    END IF;
    SELECT title INTO v_title FROM public.meetings WHERE id = NEW.meeting_id;
    PERFORM private.write_audit_event('meeting.' || lower(substr(NEW.event_type, 9)), 'meetings', NEW.meeting_id::TEXT,
        'Reunião "' || v_title || '"'
        || CASE WHEN NEW.field IS NOT NULL
                THEN ' (' || NEW.field || '): ' || coalesce(left(NEW.old_value, 200), '—') || ' → ' || coalesce(left(NEW.new_value, 200), '—')
                ELSE '' END
        || CASE WHEN NEW.note IS NOT NULL THEN '. ' || left(NEW.note, 500) ELSE '' END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_events_audit
    AFTER INSERT ON public.meeting_events
    FOR EACH ROW EXECUTE FUNCTION private.audit_meeting_event();

-- =============================================================================
-- 2. AUSÊNCIAS
-- =============================================================================
CREATE FUNCTION private.absence_period_label(p_start DATE, p_end DATE)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE WHEN p_start = p_end THEN to_char(p_start, 'DD/MM/YYYY')
                ELSE to_char(p_start, 'DD/MM/YYYY') || ' a ' || to_char(p_end, 'DD/MM/YYYY') END;
$$;

-- Cria (p_request_id NULL) ou altera um pedido próprio em rascunho.
CREATE FUNCTION public.save_absence_request(
    p_request_id UUID,
    p_absence_type_id UUID,
    p_start_date DATE,
    p_end_date DATE,
    p_reason TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.absence_requests%ROWTYPE;
    v_reason TEXT := btrim(coalesce(p_reason, ''));
    v_request_id UUID;
    v_change RECORD;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ABSENCE_CREATE', 'Não tem permissão para pedir ausências.');
    IF NOT EXISTS (SELECT 1 FROM public.absence_types WHERE id = p_absence_type_id AND active) THEN
        RAISE EXCEPTION 'Tipo de ausência inválido ou inativo.';
    END IF;
    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'A data final não pode ser anterior à data inicial.';
    END IF;
    IF p_end_date - p_start_date > 366 THEN
        RAISE EXCEPTION 'Um pedido de ausência não pode exceder um ano.';
    END IF;
    IF length(v_reason) > 2000 THEN
        RAISE EXCEPTION 'O motivo não pode exceder 2000 carateres.';
    END IF;

    IF p_request_id IS NULL THEN
        INSERT INTO public.absence_requests (employee_id, absence_type_id, start_date, end_date, reason)
        VALUES (v_actor, p_absence_type_id, p_start_date, p_end_date, v_reason)
        RETURNING id INTO v_request_id;
        PERFORM private.log_absence_event(v_request_id, 'ABSENCE_CREATED', 'period', NULL,
            private.absence_period_label(p_start_date, p_end_date), NULL);
        RETURN v_request_id;
    END IF;

    SELECT * INTO v_request FROM public.absence_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_request.employee_id <> v_actor THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Só é possível alterar pedidos em rascunho.';
    END IF;

    FOR v_change IN
        SELECT * FROM (VALUES
            ('type', (SELECT name::TEXT FROM public.absence_types WHERE id = v_request.absence_type_id),
                     (SELECT name::TEXT FROM public.absence_types WHERE id = p_absence_type_id)),
            ('period', private.absence_period_label(v_request.start_date, v_request.end_date),
                       private.absence_period_label(p_start_date, p_end_date)),
            ('reason', v_request.reason, v_reason)
        ) AS changes(field, old_value, new_value)
        WHERE changes.old_value IS DISTINCT FROM changes.new_value
    LOOP
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_UPDATED', v_change.field, v_change.old_value, v_change.new_value, NULL);
    END LOOP;

    UPDATE public.absence_requests
    SET absence_type_id = p_absence_type_id, start_date = p_start_date, end_date = p_end_date, reason = v_reason
    WHERE id = p_request_id;
    RETURN p_request_id;
END;
$$;

CREATE FUNCTION public.submit_absence_request(p_request_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.absence_requests%ROWTYPE;
    v_type public.absence_types%ROWTYPE;
    v_overlap TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ABSENCE_CREATE', 'Não tem permissão para pedir ausências.');
    SELECT * INTO v_request FROM public.absence_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_request.employee_id <> v_actor THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'DRAFT' THEN
        RAISE EXCEPTION 'Este pedido já foi submetido ou decidido.';
    END IF;
    SELECT * INTO v_type FROM public.absence_types WHERE id = v_request.absence_type_id;
    IF NOT v_type.active THEN
        RAISE EXCEPTION 'O tipo de ausência "%" já não está disponível. Altere o pedido.', v_type.name;
    END IF;

    SELECT reference INTO v_overlap
    FROM public.absence_requests
    WHERE employee_id = v_actor AND id <> p_request_id AND status IN ('SUBMITTED', 'APPROVED')
      AND start_date <= v_request.end_date AND end_date >= v_request.start_date
    LIMIT 1;
    IF v_overlap IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe um pedido de ausência para parte deste período (%).', v_overlap;
    END IF;

    IF v_type.requires_attachment AND NOT EXISTS (
        SELECT 1 FROM public.attachments
        WHERE entity_type = 'ABSENCE' AND entity_id = p_request_id
          AND upload_confirmed_at IS NOT NULL AND deleted_at IS NULL
    ) THEN
        RAISE EXCEPTION 'Este tipo de ausência exige um comprovativo anexado.';
    END IF;

    UPDATE public.absence_requests SET status = 'SUBMITTED', submitted_at = now() WHERE id = p_request_id;
    PERFORM private.log_absence_event(p_request_id, 'ABSENCE_SUBMITTED', 'status', 'Rascunho', 'Submetido', NULL);
END;
$$;

-- Decisão do gestor (âmbito) ou da administração. CHANGES_REQUESTED devolve o pedido ao colaborador.
CREATE FUNCTION public.decide_absence_request(p_request_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.absence_requests%ROWTYPE;
    v_comment TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ABSENCE_APPROVE', 'Não tem permissão para decidir pedidos de ausência.');
    IF p_decision IS NULL OR p_decision NOT IN ('APPROVED', 'REJECTED', 'CHANGES_REQUESTED') THEN
        RAISE EXCEPTION 'Decisão inválida.';
    END IF;

    SELECT * INTO v_request FROM public.absence_requests WHERE id = p_request_id FOR UPDATE;
    IF FOUND AND v_request.employee_id = v_actor THEN
        RAISE EXCEPTION 'Não pode decidir o seu próprio pedido de ausência.' USING ERRCODE = '42501';
    END IF;
    IF NOT FOUND OR NOT (public.has_permission('ADMIN_ACCESS') OR public.is_manager_of_employee(v_request.employee_id)) THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Apenas pedidos submetidos podem ser decididos.';
    END IF;

    v_comment := CASE WHEN p_decision = 'APPROVED'
        THEN private.optional_text(p_comment, 1000, 'O comentário')
        ELSE private.required_text(p_comment, 5, 1000,
            CASE p_decision WHEN 'REJECTED' THEN 'Indique o motivo da rejeição' ELSE 'Indique o que deve ser corrigido' END) END;

    IF p_decision = 'CHANGES_REQUESTED' THEN
        UPDATE public.absence_requests
        SET status = 'DRAFT', submitted_at = NULL, decision_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CHANGES_REQUESTED', 'status', 'Submetido', 'Rascunho', v_comment);
    ELSE
        UPDATE public.absence_requests
        SET status = p_decision, decided_at = now(), decided_by = v_actor, decision_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id,
            CASE p_decision WHEN 'APPROVED' THEN 'ABSENCE_APPROVED' ELSE 'ABSENCE_REJECTED' END,
            'status', 'Submetido', CASE p_decision WHEN 'APPROVED' THEN 'Aprovado' ELSE 'Rejeitado' END, v_comment);
    END IF;
END;
$$;

-- O colaborador cancela rascunhos e pedidos pendentes; uma ausência aprovada só antes de começar.
CREATE FUNCTION public.cancel_absence_request(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.absence_requests%ROWTYPE;
    v_reason TEXT;
BEGIN
    SELECT * INTO v_request FROM public.absence_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND OR v_request.employee_id <> v_actor THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status = 'APPROVED' THEN
        IF v_request.start_date <= private.local_today() THEN
            RAISE EXCEPTION 'Uma ausência aprovada só pode ser cancelada antes de começar.';
        END IF;
        v_reason := private.required_text(p_reason, 5, 1000, 'Indique o motivo do cancelamento');
    ELSIF v_request.status IN ('DRAFT', 'SUBMITTED') THEN
        v_reason := private.optional_text(p_reason, 1000, 'O motivo');
    ELSE
        RAISE EXCEPTION 'Este pedido já não pode ser cancelado.';
    END IF;
    UPDATE public.absence_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = p_request_id;
    PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CANCELLED', 'status',
        CASE v_request.status WHEN 'DRAFT' THEN 'Rascunho' WHEN 'SUBMITTED' THEN 'Submetido' ELSE 'Aprovado' END,
        'Cancelado', v_reason);
END;
$$;

CREATE FUNCTION private.notify_absence_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_request public.absence_requests%ROWTYPE;
    v_label TEXT;
    v_employee_name TEXT;
    v_approvers UUID[];
BEGIN
    SELECT * INTO v_request FROM public.absence_requests WHERE id = NEW.absence_request_id;
    SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = v_request.employee_id;
    v_label := (SELECT name FROM public.absence_types WHERE id = v_request.absence_type_id)
        || ' · ' || private.absence_period_label(v_request.start_date, v_request.end_date);

    IF NEW.event_type = 'ABSENCE_SUBMITTED' OR (NEW.event_type = 'ABSENCE_CANCELLED' AND NEW.old_value IN ('Submetido', 'Aprovado')) THEN
        -- Gestores cujo âmbito abrange o colaborador; sem gestor, a administração.
        v_approvers := ARRAY(
            SELECT manager.id FROM public.profiles manager
            WHERE manager.is_active
              AND private.scope_covers(manager.id, v_request.employee_id)
              AND private.profile_has_permission(manager.id, 'TIMESHEET_ABSENCE_APPROVE')
        );
        IF cardinality(v_approvers) = 0 THEN
            v_approvers := ARRAY(
                SELECT p.id FROM public.profiles p
                WHERE p.is_active AND private.is_admin_profile(p.id) AND p.id <> v_request.employee_id
            );
        END IF;
        PERFORM private.notify_profiles(v_approvers, NEW.actor_id,
            CASE NEW.event_type WHEN 'ABSENCE_SUBMITTED' THEN 'ABSENCE_APPROVAL_REQUIRED' ELSE 'ABSENCE_CANCELLED' END,
            CASE NEW.event_type WHEN 'ABSENCE_SUBMITTED' THEN 'Pedido de ausência para aprovação' ELSE 'Pedido de ausência cancelado' END,
            v_employee_name || ': ' || v_label);
    ELSIF NEW.event_type IN ('ABSENCE_APPROVED', 'ABSENCE_REJECTED', 'ABSENCE_CHANGES_REQUESTED') THEN
        PERFORM private.notify_profiles(ARRAY[v_request.employee_id], NEW.actor_id,
            CASE NEW.event_type WHEN 'ABSENCE_APPROVED' THEN 'ABSENCE_APPROVED'
                                WHEN 'ABSENCE_REJECTED' THEN 'ABSENCE_REJECTED'
                                ELSE 'ABSENCE_CHANGES_REQUESTED' END,
            CASE NEW.event_type WHEN 'ABSENCE_APPROVED' THEN 'Ausência aprovada'
                                WHEN 'ABSENCE_REJECTED' THEN 'Ausência rejeitada'
                                ELSE 'Pedido de ausência devolvido para correção' END,
            v_label || CASE WHEN NEW.note IS NOT NULL THEN ': ' || NEW.note ELSE '' END);
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_absence_events_notify
    AFTER INSERT ON public.absence_events
    FOR EACH ROW EXECUTE FUNCTION private.notify_absence_event();

CREATE FUNCTION private.audit_absence_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reference TEXT;
BEGIN
    IF NEW.event_type IN ('ABSENCE_ATTACHMENT_ADDED', 'ABSENCE_ATTACHMENT_REMOVED') THEN
        RETURN NEW;
    END IF;
    SELECT reference INTO v_reference FROM public.absence_requests WHERE id = NEW.absence_request_id;
    PERFORM private.write_audit_event('absence.' || lower(substr(NEW.event_type, 9)), 'absence_requests',
        NEW.absence_request_id::TEXT,
        'Pedido de ausência ' || v_reference
        || CASE WHEN NEW.field IS NOT NULL
                THEN ' (' || NEW.field || '): ' || coalesce(left(NEW.old_value, 200), '—') || ' → ' || coalesce(left(NEW.new_value, 200), '—')
                ELSE '' END
        || CASE WHEN NEW.note IS NOT NULL THEN '. ' || left(NEW.note, 500) ELSE '' END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_absence_events_audit
    AFTER INSERT ON public.absence_events
    FOR EACH ROW EXECUTE FUNCTION private.audit_absence_event();

-- =============================================================================
-- 3. EMPRESAS (escrita direta sob RLS; ator e auditoria definidos no servidor)
-- =============================================================================
CREATE FUNCTION private.guard_company()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.name := btrim(NEW.name);
    NEW.nuit := nullif(btrim(coalesce(NEW.nuit, '')), '');
    NEW.email := nullif(lower(btrim(coalesce(NEW.email, ''))), '');
    NEW.website := nullif(btrim(coalesce(NEW.website, '')), '');
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := coalesce(public.get_current_profile_id(), NEW.created_by);
    ELSE
        NEW.created_by := OLD.created_by;
        NEW.created_at := OLD.created_at;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_guard
    BEFORE INSERT OR UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION private.guard_company();

CREATE FUNCTION private.audit_company_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('company.created', 'companies', NEW.id::TEXT, 'Empresa registada: ' || NEW.name);
    ELSIF NEW.status <> OLD.status THEN
        PERFORM private.write_audit_event('company.status_changed', 'companies', NEW.id::TEXT,
            'Empresa ' || NEW.name || ' passou a ' || CASE NEW.status WHEN 'ACTIVE' THEN 'ativa' ELSE 'inativa' END);
    ELSE
        PERFORM private.write_audit_event('company.updated', 'companies', NEW.id::TEXT, 'Dados da empresa ' || NEW.name || ' atualizados');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_companies_audit
    AFTER INSERT OR UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION private.audit_company_changes();

-- =============================================================================
-- 4. OPORTUNIDADES
-- =============================================================================
CREATE FUNCTION private.lock_opportunity(p_opportunity_id UUID)
RETURNS public.opportunities
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_opportunity_id FOR UPDATE;
    IF NOT FOUND OR NOT private.can_read_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Oportunidade não encontrada.' USING ERRCODE = '42501';
    END IF;
    RETURN v_opportunity;
END;
$$;

CREATE FUNCTION private.opportunity_status_label(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_status
        WHEN 'NEW' THEN 'Nova'
        WHEN 'QUALIFICATION' THEN 'Qualificação'
        WHEN 'PROPOSAL' THEN 'Proposta'
        WHEN 'NEGOTIATION' THEN 'Negociação'
        WHEN 'WON' THEN 'Ganha'
        WHEN 'LOST' THEN 'Perdida'
        WHEN 'CANCELLED' THEN 'Cancelada'
        ELSE p_status
    END;
$$;

CREATE FUNCTION public.create_opportunity(
    p_title TEXT,
    p_company_id UUID,
    p_owner_id UUID DEFAULT NULL,
    p_contact_name TEXT DEFAULT NULL,
    p_contact_phone TEXT DEFAULT NULL,
    p_contact_email TEXT DEFAULT NULL,
    p_description TEXT DEFAULT '',
    p_problem TEXT DEFAULT '',
    p_proposal TEXT DEFAULT '',
    p_initial_value NUMERIC DEFAULT NULL,
    p_estimated_value NUMERIC DEFAULT NULL,
    p_currency TEXT DEFAULT 'MZN',
    p_probability INTEGER DEFAULT NULL,
    p_expected_close_date DATE DEFAULT NULL,
    p_next_step TEXT DEFAULT NULL,
    p_next_step_date DATE DEFAULT NULL,
    p_notes TEXT DEFAULT ''
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_owner_id UUID;
    v_opportunity_id UUID;
    v_reference TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_CREATE', 'Não tem permissão para registar oportunidades.');
    v_owner_id := coalesce(p_owner_id, v_actor);
    IF NOT private.is_active_profile(v_owner_id) OR NOT private.manages_work_of(v_owner_id) THEN
        RAISE EXCEPTION 'O responsável tem de ser um utilizador ativo do seu âmbito de gestão.' USING ERRCODE = '42501';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Empresa inválida ou inativa.';
    END IF;

    INSERT INTO public.opportunities (title, company_id, owner_id, department_id, contact_name, contact_phone, contact_email,
                                      description, problem, proposal, initial_value, estimated_value, currency, probability,
                                      expected_close_date, next_step, next_step_date, notes, created_by)
    VALUES (btrim(coalesce(p_title, '')), p_company_id, v_owner_id,
            (SELECT department_id FROM public.profiles WHERE id = v_owner_id),
            private.optional_text(p_contact_name, 150, 'O nome do contacto'),
            private.optional_text(p_contact_phone, 30, 'O telefone'),
            private.optional_text(lower(p_contact_email), 255, 'O e-mail'),
            btrim(coalesce(p_description, '')), btrim(coalesce(p_problem, '')), btrim(coalesce(p_proposal, '')),
            p_initial_value, p_estimated_value, upper(coalesce(nullif(btrim(p_currency), ''), 'MZN')), p_probability,
            p_expected_close_date, private.optional_text(p_next_step, 300, 'O próximo passo'), p_next_step_date,
            btrim(coalesce(p_notes, '')), v_actor)
    RETURNING id, reference INTO v_opportunity_id, v_reference;

    PERFORM private.log_opportunity_event(v_opportunity_id, 'OPPORTUNITY_CREATED', NULL, NULL, v_reference, NULL);
    RETURN v_opportunity_id;
END;
$$;

-- Edição dos dados comerciais (não altera estado nem responsável). Em oportunidades fechadas exige motivo.
CREATE FUNCTION public.update_opportunity(
    p_opportunity_id UUID,
    p_title TEXT,
    p_company_id UUID,
    p_contact_name TEXT,
    p_contact_phone TEXT,
    p_contact_email TEXT,
    p_description TEXT,
    p_problem TEXT,
    p_proposal TEXT,
    p_initial_value NUMERIC,
    p_estimated_value NUMERIC,
    p_currency TEXT,
    p_probability INTEGER,
    p_expected_close_date DATE,
    p_next_step TEXT,
    p_next_step_date DATE,
    p_notes TEXT,
    p_reason TEXT DEFAULT NULL,
    p_expected_updated_at TIMESTAMPTZ DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
    v_after_closure BOOLEAN := v_opportunity.status IN ('WON', 'LOST', 'CANCELLED');
    v_reason TEXT;
    v_contact_name TEXT := private.optional_text(p_contact_name, 150, 'O nome do contacto');
    v_contact_phone TEXT := private.optional_text(p_contact_phone, 30, 'O telefone');
    v_contact_email TEXT := private.optional_text(lower(p_contact_email), 255, 'O e-mail');
    v_next_step TEXT := private.optional_text(p_next_step, 300, 'O próximo passo');
    v_currency TEXT := upper(coalesce(nullif(btrim(p_currency), ''), 'MZN'));
    v_change RECORD;
    v_changes INTEGER := 0;
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade a pode alterar.' USING ERRCODE = '42501';
    END IF;
    IF p_expected_updated_at IS NOT NULL AND v_opportunity.updated_at <> p_expected_updated_at THEN
        RAISE EXCEPTION 'A oportunidade foi alterada por outra pessoa entretanto. Recarregue e tente novamente.';
    END IF;
    v_reason := CASE WHEN v_after_closure
        THEN private.required_text(p_reason, 5, 1000, 'Indique o motivo da alteração de uma oportunidade fechada')
        ELSE private.optional_text(p_reason, 1000, 'O motivo') END;
    IF p_company_id <> v_opportunity.company_id
       AND NOT EXISTS (SELECT 1 FROM public.companies WHERE id = p_company_id AND status = 'ACTIVE') THEN
        RAISE EXCEPTION 'Empresa inválida ou inativa.';
    END IF;

    FOR v_change IN
        SELECT * FROM (VALUES
            ('title', v_opportunity.title::TEXT, btrim(coalesce(p_title, ''))),
            ('company', (SELECT name::TEXT FROM public.companies WHERE id = v_opportunity.company_id),
                        (SELECT name::TEXT FROM public.companies WHERE id = p_company_id)),
            ('contact_name', v_opportunity.contact_name::TEXT, v_contact_name),
            ('contact_phone', v_opportunity.contact_phone::TEXT, v_contact_phone),
            ('contact_email', v_opportunity.contact_email::TEXT, v_contact_email),
            ('description', v_opportunity.description, btrim(coalesce(p_description, ''))),
            ('problem', v_opportunity.problem, btrim(coalesce(p_problem, ''))),
            ('proposal', v_opportunity.proposal, btrim(coalesce(p_proposal, ''))),
            ('initial_value', v_opportunity.initial_value::TEXT, p_initial_value::NUMERIC(14, 2)::TEXT),
            ('estimated_value', v_opportunity.estimated_value::TEXT, p_estimated_value::NUMERIC(14, 2)::TEXT),
            ('currency', v_opportunity.currency::TEXT, v_currency),
            ('probability', v_opportunity.probability::TEXT, p_probability::TEXT),
            ('expected_close_date', to_char(v_opportunity.expected_close_date, 'DD/MM/YYYY'), to_char(p_expected_close_date, 'DD/MM/YYYY')),
            ('next_step', v_opportunity.next_step::TEXT, v_next_step),
            ('next_step_date', to_char(v_opportunity.next_step_date, 'DD/MM/YYYY'), to_char(p_next_step_date, 'DD/MM/YYYY')),
            ('notes', v_opportunity.notes, btrim(coalesce(p_notes, '')))
        ) AS changes(field, old_value, new_value)
        WHERE changes.old_value IS DISTINCT FROM changes.new_value
    LOOP
        v_changes := v_changes + 1;
        PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_UPDATED', v_change.field,
            v_change.old_value, v_change.new_value, v_reason, v_after_closure);
    END LOOP;
    IF v_changes = 0 THEN
        RAISE EXCEPTION 'Não existem alterações a guardar.';
    END IF;

    UPDATE public.opportunities
    SET title = btrim(coalesce(p_title, '')), company_id = p_company_id, contact_name = v_contact_name,
        contact_phone = v_contact_phone, contact_email = v_contact_email,
        description = btrim(coalesce(p_description, '')), problem = btrim(coalesce(p_problem, '')),
        proposal = btrim(coalesce(p_proposal, '')), initial_value = p_initial_value, estimated_value = p_estimated_value,
        currency = v_currency, probability = p_probability, expected_close_date = p_expected_close_date,
        next_step = v_next_step, next_step_date = p_next_step_date, notes = btrim(coalesce(p_notes, ''))
    WHERE id = p_opportunity_id;
END;
$$;

-- Ciclo comercial: NEW → QUALIFICATION → PROPOSAL → NEGOTIATION → WON | LOST.
-- Cancelar e reabrir (de WON/LOST/CANCELLED para QUALIFICATION) exigem TIMESHEET_OPPORTUNITY_MANAGE.
CREATE FUNCTION public.change_opportunity_status(p_opportunity_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
    v_active CONSTANT TEXT[] := ARRAY['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'];
    v_note TEXT;
    v_event TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade a pode alterar.' USING ERRCODE = '42501';
    END IF;
    IF p_status IS NULL OR p_status NOT IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED') THEN
        RAISE EXCEPTION 'Estado inválido.';
    END IF;
    IF p_status = v_opportunity.status THEN
        RAISE EXCEPTION 'A oportunidade já está nesse estado.';
    END IF;

    IF v_opportunity.status = ANY (v_active) AND p_status = ANY (v_active) THEN
        v_note := private.optional_text(p_note, 1000, 'A nota');
        UPDATE public.opportunities SET status = p_status WHERE id = p_opportunity_id;
        v_event := 'OPPORTUNITY_STAGE_CHANGED';
    ELSIF v_opportunity.status = ANY (v_active) AND p_status = 'WON' THEN
        v_note := private.optional_text(p_note, 1000, 'A nota');
        UPDATE public.opportunities SET status = 'WON', closed_at = now(), probability = 100 WHERE id = p_opportunity_id;
        v_event := 'OPPORTUNITY_WON';
    ELSIF v_opportunity.status = ANY (v_active) AND p_status = 'LOST' THEN
        v_note := private.required_text(p_note, 5, 1000, 'Indique o motivo da perda');
        UPDATE public.opportunities SET status = 'LOST', closed_at = now(), probability = 0, lost_reason = v_note
        WHERE id = p_opportunity_id;
        v_event := 'OPPORTUNITY_LOST';
    ELSIF v_opportunity.status = ANY (v_active) AND p_status = 'CANCELLED' THEN
        PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_MANAGE', 'Não tem permissão para cancelar oportunidades.');
        v_note := private.required_text(p_note, 5, 1000, 'Indique o motivo do cancelamento');
        UPDATE public.opportunities SET status = 'CANCELLED', closed_at = now() WHERE id = p_opportunity_id;
        v_event := 'OPPORTUNITY_CANCELLED';
    ELSIF NOT (v_opportunity.status = ANY (v_active)) AND p_status = 'QUALIFICATION' THEN
        PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_MANAGE', 'Não tem permissão para reabrir oportunidades.');
        v_note := private.required_text(p_note, 5, 1000, 'Indique o motivo da reabertura');
        UPDATE public.opportunities SET status = 'QUALIFICATION', closed_at = NULL, lost_reason = NULL WHERE id = p_opportunity_id;
        v_event := 'OPPORTUNITY_REOPENED';
    ELSE
        RAISE EXCEPTION 'Transição inválida: % → %.',
            private.opportunity_status_label(v_opportunity.status), private.opportunity_status_label(p_status);
    END IF;

    PERFORM private.log_opportunity_event(p_opportunity_id, v_event, 'status',
        private.opportunity_status_label(v_opportunity.status), private.opportunity_status_label(p_status), v_note);
END;
$$;

CREATE FUNCTION public.set_opportunity_owner(p_opportunity_id UUID, p_owner_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_MANAGE', 'Não tem permissão para alterar o responsável.');
    IF NOT (public.has_permission('ADMIN_ACCESS') OR v_opportunity.created_by = public.get_current_profile_id()
            OR public.is_manager_of_employee(v_opportunity.owner_id)) THEN
        RAISE EXCEPTION 'A oportunidade está fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF NOT private.is_active_profile(p_owner_id) OR NOT private.manages_work_of(p_owner_id) THEN
        RAISE EXCEPTION 'O responsável tem de ser um utilizador ativo do seu âmbito de gestão.' USING ERRCODE = '42501';
    END IF;
    IF p_owner_id = v_opportunity.owner_id THEN
        RAISE EXCEPTION 'Esse colaborador já é o responsável.';
    END IF;
    UPDATE public.opportunities
    SET owner_id = p_owner_id, department_id = (SELECT department_id FROM public.profiles WHERE id = p_owner_id)
    WHERE id = p_opportunity_id;
    DELETE FROM public.opportunity_members WHERE opportunity_id = p_opportunity_id AND profile_id = p_owner_id;
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_OWNER_CHANGED', 'owner',
        private.profile_label(v_opportunity.owner_id), private.profile_label(p_owner_id),
        private.optional_text(p_note, 1000, 'A nota'));
END;
$$;

CREATE FUNCTION public.add_opportunity_member(p_opportunity_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade pode acrescentar membros.' USING ERRCODE = '42501';
    END IF;
    IF v_opportunity.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A oportunidade está cancelada.';
    END IF;
    IF NOT private.is_active_profile(p_profile_id) THEN
        RAISE EXCEPTION 'O membro tem de ser um utilizador ativo.';
    END IF;
    IF p_profile_id = v_opportunity.owner_id OR private.is_opportunity_member(p_opportunity_id, p_profile_id) THEN
        RAISE EXCEPTION 'Este colaborador já trabalha nesta oportunidade.';
    END IF;
    INSERT INTO public.opportunity_members (opportunity_id, profile_id, added_by)
    VALUES (p_opportunity_id, p_profile_id, public.get_current_profile_id());
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_MEMBER_ADDED', 'member', NULL,
        private.profile_label(p_profile_id), NULL);
    PERFORM private.notify_profiles(ARRAY[p_profile_id], public.get_current_profile_id(), 'OPPORTUNITY_ASSIGNED',
        'Foi adicionado a uma oportunidade', v_opportunity.reference || ' — ' || v_opportunity.title);
END;
$$;

CREATE FUNCTION public.remove_opportunity_member(p_opportunity_id UUID, p_profile_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para alterar oportunidades.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade pode retirar membros.' USING ERRCODE = '42501';
    END IF;
    DELETE FROM public.opportunity_members WHERE opportunity_id = p_opportunity_id AND profile_id = p_profile_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Este colaborador não é membro da oportunidade.';
    END IF;
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_MEMBER_REMOVED', 'member',
        private.profile_label(p_profile_id), NULL, NULL);
END;
$$;

CREATE FUNCTION public.add_opportunity_comment(p_opportunity_id UUID, p_body TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para comentar oportunidades.');
    IF v_opportunity.status = 'CANCELLED' THEN
        RAISE EXCEPTION 'A oportunidade está cancelada e não aceita comentários.';
    END IF;
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_COMMENT_ADDED', NULL, NULL, NULL,
        private.required_text(p_body, 1, 5000, 'Escreva o comentário'));
END;
$$;

CREATE FUNCTION private.notify_opportunity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE;
    v_label TEXT;
BEGIN
    SELECT * INTO v_opportunity FROM public.opportunities WHERE id = NEW.opportunity_id;
    v_label := v_opportunity.reference || ' — ' || v_opportunity.title;
    CASE NEW.event_type
        WHEN 'OPPORTUNITY_CREATED', 'OPPORTUNITY_OWNER_CHANGED' THEN
            PERFORM private.notify_profiles(ARRAY[v_opportunity.owner_id], NEW.actor_id, 'OPPORTUNITY_ASSIGNED',
                'Oportunidade atribuída', v_label);
        WHEN 'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'OPPORTUNITY_CANCELLED', 'OPPORTUNITY_REOPENED' THEN
            PERFORM private.notify_profiles(ARRAY[v_opportunity.owner_id, v_opportunity.created_by], NEW.actor_id,
                'OPPORTUNITY_UPDATED', 'Oportunidade ' || lower(private.opportunity_status_label(v_opportunity.status)),
                v_label || CASE WHEN NEW.note IS NOT NULL THEN ': ' || NEW.note ELSE '' END);
        WHEN 'OPPORTUNITY_COMMENT_ADDED' THEN
            PERFORM private.notify_profiles(ARRAY[v_opportunity.owner_id], NEW.actor_id, 'OPPORTUNITY_COMMENT',
                'Novo comentário numa oportunidade', v_label);
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opportunity_events_notify
    AFTER INSERT ON public.opportunity_events
    FOR EACH ROW EXECUTE FUNCTION private.notify_opportunity_event();

CREATE FUNCTION private.audit_opportunity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reference TEXT;
BEGIN
    IF NEW.event_type IN ('OPPORTUNITY_COMMENT_ADDED', 'OPPORTUNITY_ATTACHMENT_ADDED', 'OPPORTUNITY_ATTACHMENT_REMOVED') THEN
        RETURN NEW;
    END IF;
    SELECT reference INTO v_reference FROM public.opportunities WHERE id = NEW.opportunity_id;
    PERFORM private.write_audit_event('opportunity.' || lower(substr(NEW.event_type, 13)), 'opportunities',
        NEW.opportunity_id::TEXT,
        'Oportunidade ' || v_reference
        || CASE WHEN NEW.field IS NOT NULL
                THEN ' (' || NEW.field || '): ' || coalesce(left(NEW.old_value, 200), '—') || ' → ' || coalesce(left(NEW.new_value, 200), '—')
                ELSE '' END
        || CASE WHEN NEW.after_closure THEN ' [após fecho]' ELSE '' END
        || CASE WHEN NEW.note IS NOT NULL THEN '. ' || left(NEW.note, 500) ELSE '' END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opportunity_events_audit
    AFTER INSERT ON public.opportunity_events
    FOR EACH ROW EXECUTE FUNCTION private.audit_opportunity_event();
