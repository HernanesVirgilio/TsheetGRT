-- TsheetGRT · SI Holdings — Timesheet Core (4/4): anexos, calendário, resumos, RLS e privilégios
--
-- Princípio: negação por omissão. Sem acesso anónimo; leitura autenticada limitada pela permissão
-- e pelo âmbito; escrita apenas pelas funções do servidor (exceto empresas, tipos de ausência e
-- eventos internos, que usam escrita direta sob RLS com triggers de proteção e auditoria).

-- =============================================================================
-- 1. ANEXOS
-- =============================================================================
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('work-attachments', 'work-attachments', false, 10485760, ARRAY[
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv',
    'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation'
])
ON CONFLICT (id) DO NOTHING;

-- Quem pode anexar a um registo: quem trabalha nele e enquanto o registo está aberto a alterações.
CREATE FUNCTION private.can_attach_to(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
    v_task public.tasks%ROWTYPE;
    v_meeting public.meetings%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
BEGIN
    IF v_actor IS NULL THEN
        RETURN false;
    END IF;
    CASE p_entity_type
        WHEN 'TASK' THEN
            SELECT * INTO v_task FROM public.tasks WHERE id = p_entity_id;
            RETURN FOUND AND v_task.status <> 'CANCELLED' AND private.can_read_task(v_task)
                AND (v_task.assignee_id = v_actor OR private.manages_task(v_task));
        WHEN 'ACTIVITY' THEN
            RETURN EXISTS (
                SELECT 1 FROM public.timesheet_entries e
                JOIN public.timesheets t ON t.id = e.timesheet_id
                WHERE e.id = p_entity_id AND e.employee_id = v_actor AND t.status IN ('DRAFT', 'REJECTED')
            );
        WHEN 'MEETING' THEN
            SELECT * INTO v_meeting FROM public.meetings WHERE id = p_entity_id;
            RETURN FOUND AND v_meeting.status <> 'CANCELLED' AND private.can_read_meeting(v_meeting)
                AND (private.manages_meeting(v_meeting) OR private.is_meeting_participant(v_meeting.id, v_actor));
        WHEN 'ABSENCE' THEN
            RETURN EXISTS (
                SELECT 1 FROM public.absence_requests
                WHERE id = p_entity_id AND employee_id = v_actor AND status IN ('DRAFT', 'SUBMITTED')
            );
        WHEN 'OPPORTUNITY' THEN
            SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_entity_id;
            RETURN FOUND AND v_opportunity.status <> 'CANCELLED' AND private.can_read_opportunity(v_opportunity)
                AND (private.manages_opportunity(v_opportunity) OR private.is_opportunity_member(v_opportunity.id, v_actor));
        ELSE
            RETURN false;
    END CASE;
END;
$$;

-- Remoção de anexos de terceiros: gestão do registo (âmbito) com TIMESHEET_ATTACHMENT_DELETE.
CREATE FUNCTION private.manages_attachment_entity(p_entity_type TEXT, p_entity_id UUID)
RETURNS BOOLEAN
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
    IF public.has_permission('ADMIN_ACCESS') THEN
        RETURN true;
    END IF;
    CASE p_entity_type
        WHEN 'TASK' THEN
            SELECT * INTO v_task FROM public.tasks WHERE id = p_entity_id;
            RETURN FOUND AND private.manages_task(v_task);
        WHEN 'MEETING' THEN
            SELECT * INTO v_meeting FROM public.meetings WHERE id = p_entity_id;
            RETURN FOUND AND private.manages_meeting(v_meeting);
        WHEN 'OPPORTUNITY' THEN
            SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_entity_id;
            RETURN FOUND AND private.manages_opportunity(v_opportunity);
        WHEN 'ABSENCE' THEN
            RETURN EXISTS (SELECT 1 FROM public.absence_requests WHERE id = p_entity_id
                           AND public.is_manager_of_employee(employee_id));
        WHEN 'ACTIVITY' THEN
            RETURN EXISTS (SELECT 1 FROM public.timesheet_entries WHERE id = p_entity_id
                           AND public.is_manager_of_employee(employee_id));
        ELSE
            RETURN false;
    END CASE;
END;
$$;

CREATE FUNCTION private.log_attachment_event(p_entity_type TEXT, p_entity_id UUID, p_added BOOLEAN, p_file_name TEXT, p_note TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    CASE p_entity_type
        WHEN 'TASK' THEN
            PERFORM private.log_task_event(p_entity_id, CASE WHEN p_added THEN 'TASK_ATTACHMENT_ADDED' ELSE 'TASK_ATTACHMENT_REMOVED' END,
                'attachment', CASE WHEN p_added THEN NULL ELSE p_file_name END, CASE WHEN p_added THEN p_file_name END, p_note);
        WHEN 'MEETING' THEN
            PERFORM private.log_meeting_event(p_entity_id, CASE WHEN p_added THEN 'MEETING_ATTACHMENT_ADDED' ELSE 'MEETING_ATTACHMENT_REMOVED' END,
                'attachment', CASE WHEN p_added THEN NULL ELSE p_file_name END, CASE WHEN p_added THEN p_file_name END, p_note);
        WHEN 'ABSENCE' THEN
            PERFORM private.log_absence_event(p_entity_id, CASE WHEN p_added THEN 'ABSENCE_ATTACHMENT_ADDED' ELSE 'ABSENCE_ATTACHMENT_REMOVED' END,
                'attachment', CASE WHEN p_added THEN NULL ELSE p_file_name END, CASE WHEN p_added THEN p_file_name END, p_note);
        WHEN 'OPPORTUNITY' THEN
            PERFORM private.log_opportunity_event(p_entity_id, CASE WHEN p_added THEN 'OPPORTUNITY_ATTACHMENT_ADDED' ELSE 'OPPORTUNITY_ATTACHMENT_REMOVED' END,
                'attachment', CASE WHEN p_added THEN NULL ELSE p_file_name END, CASE WHEN p_added THEN p_file_name END, p_note);
        ELSE
            NULL; -- Atividades (registos de tempo) não têm histórico próprio: ficam na auditoria.
    END CASE;
END;
$$;

-- 1.º passo do carregamento: valida e reserva o caminho. O ficheiro é depois enviado para o Storage
-- pelo cliente (a política de INSERT só aceita caminhos reservados pelo próprio) e confirmado.
CREATE FUNCTION public.register_attachment(
    p_entity_type TEXT,
    p_entity_id UUID,
    p_file_name TEXT,
    p_mime_type TEXT,
    p_size_bytes BIGINT
)
RETURNS TABLE (attachment_id UUID, storage_path TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_file_name TEXT := btrim(coalesce(p_file_name, ''));
    v_safe_name TEXT;
    v_attachment_id UUID := gen_random_uuid();
    v_path TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ATTACHMENT_CREATE', 'Não tem permissão para adicionar anexos.');
    IF NOT private.can_attach_to(p_entity_type, p_entity_id) THEN
        RAISE EXCEPTION 'Registo não encontrado ou fechado a novos anexos.' USING ERRCODE = '42501';
    END IF;
    IF length(v_file_name) NOT BETWEEN 1 AND 255 THEN
        RAISE EXCEPTION 'Nome de ficheiro inválido.';
    END IF;
    IF p_mime_type IS NULL OR NOT (p_mime_type = ANY (ARRAY[
        'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf', 'text/plain', 'text/csv',
        'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'application/vnd.openxmlformats-officedocument.presentationml.presentation'])) THEN
        RAISE EXCEPTION 'Tipo de ficheiro não permitido. Use imagens, PDF, documentos Office, texto ou CSV.';
    END IF;
    IF p_size_bytes IS NULL OR p_size_bytes < 1 OR p_size_bytes > 10485760 THEN
        RAISE EXCEPTION 'O ficheiro tem de ter no máximo 10 MB.';
    END IF;
    IF (SELECT count(*) FROM public.attachments
        WHERE entity_type = p_entity_type AND entity_id = p_entity_id AND deleted_at IS NULL) >= 20 THEN
        RAISE EXCEPTION 'Este registo já tem o número máximo de anexos (20).';
    END IF;

    -- O caminho nunca usa o nome original sem tratamento (evita separadores e carateres especiais).
    v_safe_name := regexp_replace(v_file_name, '[^A-Za-z0-9._-]+', '_', 'g');
    v_safe_name := regexp_replace(v_safe_name, '\.{2,}', '.', 'g');
    v_safe_name := left(regexp_replace(v_safe_name, '^[._-]+', ''), 120);
    IF v_safe_name = '' OR v_safe_name ~ '^[._-]+$' THEN
        v_safe_name := 'ficheiro';
    END IF;
    v_path := lower(p_entity_type) || '/' || p_entity_id || '/' || v_attachment_id || '/' || v_safe_name;

    INSERT INTO public.attachments (id, entity_type, entity_id, storage_path, file_name, mime_type, size_bytes, uploaded_by)
    VALUES (v_attachment_id, p_entity_type, p_entity_id, v_path, v_file_name, p_mime_type, p_size_bytes, v_actor);

    attachment_id := v_attachment_id;
    storage_path := v_path;
    RETURN NEXT;
END;
$$;

CREATE FUNCTION public.confirm_attachment(p_attachment_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_attachment public.attachments%ROWTYPE;
BEGIN
    SELECT * INTO v_attachment FROM public.attachments
    WHERE id = p_attachment_id AND uploaded_by = v_actor AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_attachment.upload_confirmed_at IS NOT NULL THEN
        RETURN;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM storage.objects WHERE bucket_id = v_attachment.bucket_id AND name = v_attachment.storage_path) THEN
        RAISE EXCEPTION 'O ficheiro ainda não foi carregado.';
    END IF;
    UPDATE public.attachments SET upload_confirmed_at = now() WHERE id = p_attachment_id;
    PERFORM private.log_attachment_event(v_attachment.entity_type, v_attachment.entity_id, true, v_attachment.file_name, NULL);
    PERFORM private.write_audit_event('attachment.added', 'attachments', p_attachment_id::TEXT,
        'Anexo "' || v_attachment.file_name || '" adicionado a ' || lower(v_attachment.entity_type) || ' ' || v_attachment.entity_id);
END;
$$;

-- Remoção lógica: o ficheiro deixa de estar acessível (política do Storage) mas o registo fica.
CREATE FUNCTION public.remove_attachment(p_attachment_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_attachment public.attachments%ROWTYPE;
    v_is_uploader BOOLEAN;
    v_reason TEXT;
BEGIN
    SELECT * INTO v_attachment FROM public.attachments WHERE id = p_attachment_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = '42501';
    END IF;
    v_is_uploader := v_attachment.uploaded_by = v_actor AND private.can_attach_to(v_attachment.entity_type, v_attachment.entity_id);
    IF NOT v_is_uploader AND NOT (
        public.has_permission('TIMESHEET_ATTACHMENT_DELETE')
        AND private.manages_attachment_entity(v_attachment.entity_type, v_attachment.entity_id)
    ) THEN
        RAISE EXCEPTION 'Anexo não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_attachment.deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'O anexo já foi removido.';
    END IF;
    v_reason := CASE WHEN v_is_uploader
        THEN private.optional_text(p_reason, 1000, 'O motivo')
        ELSE private.required_text(p_reason, 5, 1000, 'Indique o motivo da remoção') END;

    UPDATE public.attachments SET deleted_at = now(), deleted_by = v_actor, delete_reason = v_reason WHERE id = p_attachment_id;
    IF v_attachment.upload_confirmed_at IS NOT NULL THEN
        PERFORM private.log_attachment_event(v_attachment.entity_type, v_attachment.entity_id, false, v_attachment.file_name, v_reason);
        PERFORM private.write_audit_event('attachment.removed', 'attachments', p_attachment_id::TEXT,
            'Anexo "' || v_attachment.file_name || '" removido de ' || lower(v_attachment.entity_type) || ' '
            || v_attachment.entity_id || coalesce('. Motivo: ' || v_reason, ''));
    END IF;
END;
$$;

-- =============================================================================
-- 2. EVENTOS INTERNOS (escrita direta sob RLS)
-- =============================================================================
CREATE FUNCTION private.guard_calendar_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.created_by := coalesce(public.get_current_profile_id(), NEW.created_by);
        NEW.status := 'ACTIVE';
    ELSE
        NEW.created_by := OLD.created_by;
        NEW.created_at := OLD.created_at;
        IF OLD.status = 'CANCELLED' AND NEW.status = 'ACTIVE' THEN
            RAISE EXCEPTION 'Um evento cancelado não pode ser reativado. Crie um novo evento.';
        END IF;
    END IF;
    IF NEW.department_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id)
       AND NOT EXISTS (SELECT 1 FROM public.departments WHERE id = NEW.department_id AND active) THEN
        RAISE EXCEPTION 'O departamento selecionado não existe ou está inativo.';
    END IF;
    NEW.title := btrim(NEW.title);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calendar_events_guard
    BEFORE INSERT OR UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION private.guard_calendar_event();

CREATE FUNCTION private.audit_calendar_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.write_audit_event(
        CASE WHEN TG_OP = 'INSERT' THEN 'calendar_event.created'
             WHEN NEW.status = 'CANCELLED' AND OLD.status = 'ACTIVE' THEN 'calendar_event.cancelled'
             ELSE 'calendar_event.updated' END,
        'calendar_events', NEW.id::TEXT,
        'Evento interno "' || NEW.title || '" · ' || private.local_datetime_label(NEW.starts_at));
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_calendar_events_audit
    AFTER INSERT OR UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION private.audit_calendar_event();

-- Tipos de ausência: alterações auditadas (gestão pela administração).
CREATE FUNCTION private.audit_absence_type_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    PERFORM private.write_audit_event(
        CASE WHEN TG_OP = 'INSERT' THEN 'absence_type.created' ELSE 'absence_type.updated' END,
        'absence_types', NEW.id::TEXT, 'Tipo de ausência ' || NEW.name || CASE WHEN NEW.active THEN '' ELSE ' (inativo)' END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_absence_types_audit
    AFTER INSERT OR UPDATE ON public.absence_types
    FOR EACH ROW EXECUTE FUNCTION private.audit_absence_type_changes();

-- =============================================================================
-- 3. CALENDÁRIO OPERACIONAL
-- =============================================================================
-- SECURITY INVOKER: cada fonte é lida com a RLS de quem consulta. p_scope = 'ME' mostra o trabalho
-- do próprio; 'TEAM' mostra tudo o que a RLS deixa ver (equipa do âmbito / administração).
CREATE FUNCTION public.get_calendar_items(p_from DATE, p_to DATE, p_scope TEXT DEFAULT 'ME')
RETURNS TABLE (
    item_type TEXT,
    item_id UUID,
    title TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ,
    all_day BOOLEAN,
    status TEXT,
    person_id UUID,
    person_name TEXT,
    reference TEXT,
    is_overdue BOOLEAN
)
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_from TIMESTAMPTZ := (p_from::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_to TIMESTAMPTZ := ((p_to + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_mine BOOLEAN := coalesce(p_scope, 'ME') <> 'TEAM';
BEGIN
    IF v_me IS NULL OR NOT public.has_permission('TIMESHEET_CALENDAR_READ') THEN
        RAISE EXCEPTION 'Não tem permissão para consultar o calendário.' USING ERRCODE = '42501';
    END IF;
    IF p_from IS NULL OR p_to IS NULL OR p_to < p_from OR p_to - p_from > 62 THEN
        RAISE EXCEPTION 'Intervalo de datas inválido (máximo de 62 dias).';
    END IF;

    RETURN QUERY
    -- Prazos das tarefas.
    SELECT 'DEADLINE'::TEXT, t.id, t.title::TEXT, t.due_at, t.due_at, false, t.status::TEXT,
           t.assignee_id, assignee.full_name::TEXT, t.reference::TEXT,
           (t.due_at < now() AND t.status NOT IN ('COMPLETED', 'CANCELLED'))
    FROM public.tasks t
    LEFT JOIN public.profiles assignee ON assignee.id = t.assignee_id
    WHERE t.due_at >= v_from AND t.due_at < v_to AND t.status <> 'CANCELLED'
      AND (NOT v_mine OR t.assignee_id = v_me)
    UNION ALL
    -- Início planeado das tarefas.
    SELECT 'TASK'::TEXT, t.id, t.title::TEXT, (t.start_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           (t.start_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo', true, t.status::TEXT,
           t.assignee_id, assignee.full_name::TEXT, t.reference::TEXT, false
    FROM public.tasks t
    LEFT JOIN public.profiles assignee ON assignee.id = t.assignee_id
    WHERE t.start_date >= p_from AND t.start_date <= p_to AND t.status NOT IN ('COMPLETED', 'CANCELLED')
      AND (NOT v_mine OR t.assignee_id = v_me)
    UNION ALL
    SELECT 'MEETING'::TEXT, m.id, m.title::TEXT, m.starts_at, m.ends_at, false, m.status::TEXT,
           m.organizer_id, organizer.full_name::TEXT, NULL::TEXT, false
    FROM public.meetings m
    LEFT JOIN public.profiles organizer ON organizer.id = m.organizer_id
    WHERE m.starts_at < v_to AND m.ends_at >= v_from
      AND (NOT v_mine OR m.organizer_id = v_me OR EXISTS (
          SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.profile_id = v_me))
    UNION ALL
    SELECT 'ABSENCE'::TEXT, a.id, at.name::TEXT, (a.start_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           ((a.end_date + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo', true, a.status::TEXT,
           a.employee_id, employee.full_name::TEXT, a.reference::TEXT, false
    FROM public.absence_requests a
    JOIN public.absence_types at ON at.id = a.absence_type_id
    LEFT JOIN public.profiles employee ON employee.id = a.employee_id
    WHERE a.start_date <= p_to AND a.end_date >= p_from
      AND (a.status = 'APPROVED' OR (a.status = 'SUBMITTED' AND a.employee_id = v_me))
      AND (NOT v_mine OR a.employee_id = v_me)
    UNION ALL
    SELECT 'ACTIVITY'::TEXT, e.id,
           coalesce(task.title::TEXT, meeting.title::TEXT, opportunity.title::TEXT, activity.name::TEXT),
           ((e.work_date + e.start_time)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           ((e.work_date + e.end_time)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           false, e.kind::TEXT, e.employee_id, employee.full_name::TEXT, task.reference::TEXT, false
    FROM public.timesheet_entries e
    JOIN public.activities activity ON activity.id = e.activity_id
    LEFT JOIN public.tasks task ON task.id = e.task_id
    LEFT JOIN public.meetings meeting ON meeting.id = e.meeting_id
    LEFT JOIN public.opportunities opportunity ON opportunity.id = e.opportunity_id
    LEFT JOIN public.profiles employee ON employee.id = e.employee_id
    WHERE e.work_date >= p_from AND e.work_date <= p_to
      AND (NOT v_mine OR e.employee_id = v_me)
    UNION ALL
    SELECT 'INTERNAL_EVENT'::TEXT, ce.id, ce.title::TEXT, ce.starts_at, ce.ends_at, ce.all_day, ce.status::TEXT,
           ce.created_by, NULL::TEXT, NULL::TEXT, false
    FROM public.calendar_events ce
    WHERE ce.status = 'ACTIVE' AND ce.starts_at < v_to AND ce.ends_at >= v_from
    UNION ALL
    SELECT 'OPPORTUNITY_ACTIVITY'::TEXT, o.id, (o.title || ': ' || coalesce(o.next_step, 'próximo passo'))::TEXT,
           (o.next_step_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo', (o.next_step_date::TIMESTAMP) AT TIME ZONE 'Africa/Maputo',
           true, o.status::TEXT, o.owner_id, owner.full_name::TEXT, o.reference::TEXT,
           (o.next_step_date < private.local_today())
    FROM public.opportunities o
    LEFT JOIN public.profiles owner ON owner.id = o.owner_id
    WHERE o.next_step_date >= p_from AND o.next_step_date <= p_to
      AND o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION')
      AND (NOT v_mine OR o.owner_id = v_me OR EXISTS (
          SELECT 1 FROM public.opportunity_members om WHERE om.opportunity_id = o.id AND om.profile_id = v_me));
END;
$$;

-- =============================================================================
-- 4. RESUMOS OPERACIONAIS
-- =============================================================================
-- Apenas os dados do próprio (inclui a meta diária, que o colaborador não lê em system_settings).
CREATE FUNCTION public.get_my_work_summary()
RETURNS TABLE (
    tasks_assigned INTEGER,
    tasks_in_progress INTEGER,
    tasks_blocked INTEGER,
    tasks_overdue INTEGER,
    tasks_due_today INTEGER,
    tasks_due_next_7_days INTEGER,
    minutes_today INTEGER,
    minutes_this_week INTEGER,
    daily_target_minutes INTEGER,
    meetings_today INTEGER,
    absence_today TEXT,
    pending_absence_requests INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_today DATE := private.local_today();
    v_week_start DATE := v_today - (extract(isodow FROM v_today)::INTEGER - 1);
    v_day_start TIMESTAMPTZ := (v_today::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
    v_day_end TIMESTAMPTZ := ((v_today + 1)::TIMESTAMP) AT TIME ZONE 'Africa/Maputo';
BEGIN
    RETURN QUERY
    SELECT
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status = 'ASSIGNED')::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status = 'IN_PROGRESS')::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status = 'BLOCKED')::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND due_at >= now() AND due_at < v_day_end)::INTEGER,
        (SELECT count(*) FROM public.tasks WHERE assignee_id = v_me AND status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND due_at >= v_day_end AND due_at < v_day_end + interval '7 days')::INTEGER,
        (SELECT coalesce(sum(total_minutes), 0) FROM public.timesheet_entries WHERE employee_id = v_me AND work_date = v_today)::INTEGER,
        (SELECT coalesce(sum(total_minutes), 0) FROM public.timesheet_entries
            WHERE employee_id = v_me AND work_date BETWEEN v_week_start AND v_today)::INTEGER,
        (coalesce((SELECT value FROM public.system_settings WHERE key = 'TIMESHEET_DAILY_TARGET_HOURS'), '8')::INTEGER * 60),
        (SELECT count(*) FROM public.meetings m
            WHERE m.status IN ('PLANNED', 'CONFIRMED', 'COMPLETED') AND m.starts_at < v_day_end AND m.ends_at >= v_day_start
              AND (m.organizer_id = v_me OR private.is_meeting_participant(m.id, v_me)))::INTEGER,
        (SELECT t.name::TEXT FROM public.absence_requests a JOIN public.absence_types t ON t.id = a.absence_type_id
            WHERE a.employee_id = v_me AND a.status = 'APPROVED' AND v_today BETWEEN a.start_date AND a.end_date LIMIT 1),
        (SELECT count(*) FROM public.absence_requests WHERE employee_id = v_me AND status = 'SUBMITTED')::INTEGER;
END;
$$;

-- Carga de trabalho da equipa do âmbito (ou de toda a organização para a administração).
CREATE FUNCTION public.get_team_work_overview()
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    job_title TEXT,
    department_name TEXT,
    tasks_open INTEGER,
    tasks_in_progress INTEGER,
    tasks_blocked INTEGER,
    tasks_overdue INTEGER,
    tasks_due_next_7_days INTEGER,
    minutes_this_week INTEGER,
    absence_today TEXT,
    pending_absence_requests INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_today DATE := private.local_today();
    v_week_start DATE := v_today - (extract(isodow FROM v_today)::INTEGER - 1);
    v_is_admin BOOLEAN := public.has_permission('ADMIN_ACCESS');
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar a equipa.');
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED'))::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'IN_PROGRESS')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'BLOCKED')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND t.due_at >= now() AND t.due_at < now() + interval '7 days')::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e
            WHERE e.employee_id = p.id AND e.work_date BETWEEN v_week_start AND v_today)::INTEGER,
        (SELECT at.name::TEXT FROM public.absence_requests a JOIN public.absence_types at ON at.id = a.absence_type_id
            WHERE a.employee_id = p.id AND a.status = 'APPROVED' AND v_today BETWEEN a.start_date AND a.end_date LIMIT 1),
        (SELECT count(*) FROM public.absence_requests a WHERE a.employee_id = p.id AND a.status = 'SUBMITTED')::INTEGER
    FROM public.profiles p
    LEFT JOIN public.departments d ON d.id = p.department_id
    WHERE p.is_active AND p.id <> v_me
      AND (private.scope_covers(v_me, p.id) OR (v_is_admin AND NOT private.is_admin_profile(p.id)))
    ORDER BY p.full_name
    LIMIT 500;
END;
$$;

-- Diretório mínimo para escolher responsáveis/participantes: só nome, cargo e departamento.
-- Responsáveis possíveis = âmbito de quem atribui (ou todos os ativos para a administração);
-- participantes de reuniões = qualquer colaborador ativo.
CREATE FUNCTION public.list_work_people(p_purpose TEXT DEFAULT 'PARTICIPANT')
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, department_name TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
BEGIN
    IF p_purpose = 'ASSIGNEE' THEN
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND private.manages_work_of(p.id)
        ORDER BY p.full_name;
    ELSIF p_purpose = 'PARTICIPANT' THEN
        IF NOT (public.has_permission('TIMESHEET_MEETING_CREATE') OR public.has_permission('TIMESHEET_OPPORTUNITY_UPDATE')) THEN
            RAISE EXCEPTION 'Não tem permissão para consultar o diretório.' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
        ORDER BY p.full_name;
    ELSE
        RAISE EXCEPTION 'Finalidade inválida.';
    END IF;
END;
$$;

-- Nomes dos participantes de uma reunião visível (o colaborador não lê perfis de terceiros).
CREATE FUNCTION public.get_meeting_people(p_meeting_id UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, is_organizer BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_meeting public.meetings%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id;
    IF NOT FOUND OR NOT private.can_read_meeting(v_meeting) THEN
        RAISE EXCEPTION 'Reunião não encontrada.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.id = v_meeting.organizer_id
    FROM public.profiles p
    WHERE p.id = v_meeting.organizer_id
       OR p.id IN (SELECT mp.profile_id FROM public.meeting_participants mp WHERE mp.meeting_id = p_meeting_id)
    ORDER BY (p.id = v_meeting.organizer_id) DESC, p.full_name;
END;
$$;

-- Responsável e membros de uma oportunidade visível.
CREATE FUNCTION public.get_opportunity_people(p_opportunity_id UUID)
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, is_owner BOOLEAN)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE;
BEGIN
    PERFORM private.require_actor();
    SELECT * INTO v_opportunity FROM public.opportunities WHERE id = p_opportunity_id;
    IF NOT FOUND OR NOT private.can_read_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Oportunidade não encontrada.' USING ERRCODE = '42501';
    END IF;
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.id = v_opportunity.owner_id
    FROM public.profiles p
    WHERE p.id = v_opportunity.owner_id
       OR p.id IN (SELECT om.profile_id FROM public.opportunity_members om WHERE om.opportunity_id = p_opportunity_id)
    ORDER BY (p.id = v_opportunity.owner_id) DESC, p.full_name;
END;
$$;

-- =============================================================================
-- 5. RLS
-- =============================================================================
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.opportunity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meetings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_types ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.absence_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.calendar_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;

-- Empresas: diretório comercial para quem trabalha oportunidades; escrita por quem as cria/gere.
CREATE POLICY companies_select ON public.companies FOR SELECT TO authenticated
USING ((SELECT public.has_permission('TIMESHEET_OPPORTUNITY_READ')));
CREATE POLICY companies_insert ON public.companies FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('TIMESHEET_OPPORTUNITY_CREATE')));
CREATE POLICY companies_update ON public.companies FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('TIMESHEET_OPPORTUNITY_CREATE')) OR (SELECT public.has_permission('TIMESHEET_OPPORTUNITY_MANAGE')))
WITH CHECK ((SELECT public.has_permission('TIMESHEET_OPPORTUNITY_CREATE')) OR (SELECT public.has_permission('TIMESHEET_OPPORTUNITY_MANAGE')));

CREATE POLICY opportunities_select ON public.opportunities FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('TIMESHEET_OPPORTUNITY_READ')) AND (
        owner_id = (SELECT public.get_current_profile_id())
        OR created_by = (SELECT public.get_current_profile_id())
        OR private.is_opportunity_member(id, (SELECT public.get_current_profile_id()))
        OR ((SELECT public.has_permission('TEAM_READ')) AND public.is_manager_of_employee(owner_id))
        OR (SELECT public.has_permission('ADMIN_ACCESS'))
    )
);
-- Filhos: visíveis quando a oportunidade é visível (a subconsulta aplica a RLS de opportunities).
CREATE POLICY opportunity_members_select ON public.opportunity_members FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id));
CREATE POLICY opportunity_events_select ON public.opportunity_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = opportunity_id));

CREATE POLICY tasks_select ON public.tasks FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('TIMESHEET_TASK_READ')) AND (
        assignee_id = (SELECT public.get_current_profile_id())
        OR created_by = (SELECT public.get_current_profile_id())
        OR ((SELECT public.has_permission('TEAM_READ')) AND assignee_id IS NOT NULL AND public.is_manager_of_employee(assignee_id))
        OR (SELECT public.has_permission('ADMIN_ACCESS'))
        OR (opportunity_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.opportunities o
            WHERE o.id = opportunity_id AND o.owner_id = (SELECT public.get_current_profile_id())
        ))
    )
);
CREATE POLICY task_events_select ON public.task_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = task_id));

CREATE POLICY meetings_select ON public.meetings FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('TIMESHEET_MEETING_READ')) AND (
        organizer_id = (SELECT public.get_current_profile_id())
        OR private.is_meeting_participant(id, (SELECT public.get_current_profile_id()))
        OR ((SELECT public.has_permission('TEAM_READ')) AND public.is_manager_of_employee(organizer_id))
        OR (SELECT public.has_permission('ADMIN_ACCESS'))
    )
);
CREATE POLICY meeting_participants_select ON public.meeting_participants FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id));
CREATE POLICY meeting_events_select ON public.meeting_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = meeting_id));

-- Tipos de ausência: leitura por quem pede ausências; gestão pela administração.
CREATE POLICY absence_types_select ON public.absence_types FOR SELECT TO authenticated
USING ((SELECT public.has_permission('TIMESHEET_ABSENCE_CREATE')) OR (SELECT public.has_permission('TIMESHEET_ABSENCE_READ')));
CREATE POLICY absence_types_insert ON public.absence_types FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('ADMIN_ACCESS')));
CREATE POLICY absence_types_update ON public.absence_types FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('ADMIN_ACCESS')))
WITH CHECK ((SELECT public.has_permission('ADMIN_ACCESS')));

CREATE POLICY absence_requests_select ON public.absence_requests FOR SELECT TO authenticated
USING (
    employee_id = (SELECT public.get_current_profile_id())
    OR ((SELECT public.has_permission('TIMESHEET_ABSENCE_READ')) AND public.is_manager_of_employee(employee_id))
    OR (SELECT public.has_permission('ADMIN_ACCESS'))
);
CREATE POLICY absence_events_select ON public.absence_events FOR SELECT TO authenticated
USING (EXISTS (SELECT 1 FROM public.absence_requests a WHERE a.id = absence_request_id));

-- Eventos internos: toda a empresa ou o departamento de quem consulta.
CREATE POLICY calendar_events_select ON public.calendar_events FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('TIMESHEET_CALENDAR_READ')) AND (
        department_id IS NULL
        OR department_id = (SELECT private.current_department_id())
        OR created_by = (SELECT public.get_current_profile_id())
        OR (SELECT public.has_permission('ADMIN_ACCESS'))
    )
);
CREATE POLICY calendar_events_insert ON public.calendar_events FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('TIMESHEET_CALENDAR_MANAGE')));
CREATE POLICY calendar_events_update ON public.calendar_events FOR UPDATE TO authenticated
USING (
    (SELECT public.has_permission('TIMESHEET_CALENDAR_MANAGE'))
    AND (created_by = (SELECT public.get_current_profile_id()) OR (SELECT public.has_permission('ADMIN_ACCESS')))
)
WITH CHECK ((SELECT public.has_permission('TIMESHEET_CALENDAR_MANAGE')));

-- Anexos: visíveis quando o registo a que pertencem é visível (subconsultas sob a RLS desse registo).
-- Um carregamento por confirmar só é visível a quem o reservou; os removidos deixam de ser visíveis.
CREATE POLICY attachments_select ON public.attachments FOR SELECT TO authenticated
USING (
    deleted_at IS NULL
    AND (upload_confirmed_at IS NOT NULL OR uploaded_by = (SELECT public.get_current_profile_id()))
    AND CASE entity_type
        WHEN 'TASK' THEN EXISTS (SELECT 1 FROM public.tasks t WHERE t.id = entity_id)
        WHEN 'ACTIVITY' THEN EXISTS (SELECT 1 FROM public.timesheet_entries e WHERE e.id = entity_id)
        WHEN 'MEETING' THEN EXISTS (SELECT 1 FROM public.meetings m WHERE m.id = entity_id)
        WHEN 'ABSENCE' THEN EXISTS (SELECT 1 FROM public.absence_requests a WHERE a.id = entity_id)
        WHEN 'OPPORTUNITY' THEN EXISTS (SELECT 1 FROM public.opportunities o WHERE o.id = entity_id)
        ELSE false
    END
);

-- Storage: bucket privado. Leitura (URLs assinados) só de ficheiros com metadados visíveis;
-- carregamento só para caminhos reservados pelo próprio através de register_attachment.
-- Não existem políticas de UPDATE/DELETE: os ficheiros não são substituídos nem apagados pela API.
CREATE POLICY work_attachments_select ON storage.objects FOR SELECT TO authenticated
USING (
    bucket_id = 'work-attachments'
    AND EXISTS (SELECT 1 FROM public.attachments a WHERE a.storage_path = name)
);
CREATE POLICY work_attachments_insert ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
    bucket_id = 'work-attachments'
    AND EXISTS (
        SELECT 1 FROM public.attachments a
        WHERE a.storage_path = name
          AND a.uploaded_by = (SELECT public.get_current_profile_id())
          AND a.upload_confirmed_at IS NULL
          AND a.deleted_at IS NULL
    )
);

-- =============================================================================
-- 6. PRIVILÉGIOS
-- =============================================================================
REVOKE ALL ON public.companies, public.opportunities, public.opportunity_members, public.opportunity_events,
    public.tasks, public.task_events, public.meetings, public.meeting_participants, public.meeting_events,
    public.absence_types, public.absence_requests, public.absence_events, public.calendar_events,
    public.attachments FROM anon;
REVOKE ALL ON SEQUENCE public.opportunity_number_seq, public.task_number_seq, public.absence_number_seq FROM anon;

-- Escrita exclusivamente pelas funções do servidor.
REVOKE INSERT, UPDATE, DELETE ON public.opportunities, public.opportunity_members, public.opportunity_events,
    public.tasks, public.task_events, public.meetings, public.meeting_participants, public.meeting_events,
    public.absence_requests, public.absence_events, public.attachments FROM authenticated;
-- Escrita direta sob RLS, mas sem remoção física (usa-se o estado).
REVOKE DELETE ON public.companies, public.absence_types, public.calendar_events FROM authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- Funções privadas avaliadas nas políticas RLS e triggers SECURITY INVOKER durante pedidos da API.
GRANT EXECUTE ON FUNCTION private.can_edit_own_timesheet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_other_active_admin(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_meeting_participant(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_opportunity_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.current_department_id() TO authenticated;
GRANT EXECUTE ON FUNCTION private.local_today() TO authenticated;

GRANT EXECUTE ON FUNCTION public.create_task(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, DATE, INTEGER, UUID, UUID, UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_task(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_task(UUID, TEXT, TEXT, TEXT, TIMESTAMPTZ, DATE, INTEGER, UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.start_task(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.block_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.unblock_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_task(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_task(UUID, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_task(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_task_comment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ensure_my_timesheet_period(DATE) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_work_time_totals(TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_meeting(TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, UUID[], UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT, UUID[], TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_meeting(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.complete_meeting(UUID, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_meeting_outcome(UUID, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_meeting(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.save_absence_request(UUID, UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.submit_absence_request(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_absence_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_absence_request(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_opportunity(TEXT, UUID, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, DATE, TEXT, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_opportunity(UUID, TEXT, UUID, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, NUMERIC, NUMERIC, TEXT, INTEGER, DATE, TEXT, DATE, TEXT, TEXT, TIMESTAMPTZ) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_opportunity_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_opportunity_owner(UUID, UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_opportunity_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_opportunity_member(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_opportunity_comment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.register_attachment(TEXT, UUID, TEXT, TEXT, BIGINT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.confirm_attachment(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.remove_attachment(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_calendar_items(DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_my_work_summary() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_team_work_overview() TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_work_people(TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_people(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_opportunity_people(UUID) TO authenticated;
