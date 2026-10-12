-- TsheetGRT · SI Holdings — Colaboração, disponibilidade e lembretes operacionais
--
-- 1. Reuniões entre colegas: qualquer colaborador organiza reuniões com colegas (mesmo departamento ou mesma
--    equipa), a equipa e as chefias, sem aprovação. Os convidados respondem (aceitar/recusar) e o organizador
--    é notificado. Um reagendamento volta a pedir resposta.
-- 2. Pedido de reunião a uma chefia: fluxo explícito de pedido → aceitar/recusar (com motivo). Só se pede
--    tempo a quem está configurado como chefia do requerente (manager_scopes); nunca se inventa hierarquia.
-- 3. Comunicar ausência: quem gere equipa regista indisponibilidade sem ficar preso a um pedido que teria de
--    aprovar. É um registo distinto (kind = NOTICE, estado COMMUNICATED), nunca uma ausência aprovada.
-- 4. Histórico do timesheet a partir dos registos guardados (auditoria + decisões), para a linha temporal.
-- 5. Lembretes por regra (a pedido, sem agendador, sem duplicados): aprovações pendentes há mais de N dias
--    (N configurável em APPROVAL_REMINDER_DAYS) e timesheets com o período terminado ainda por submeter.
--
-- Nenhum dado existente é alterado: as colunas novas têm valores por omissão neutros.

-- =============================================================================
-- 1. PERMISSÕES
-- =============================================================================
INSERT INTO public.permissions (code, name, description, module) VALUES
    ('TIMESHEET_ABSENCE_NOTIFY', 'Comunicar Ausências', 'Comunicar indisponibilidade sem pedido formal de aprovação', 'work')
ON CONFLICT (code) DO NOTHING;

-- Reuniões entre colegas não exigem aprovação: colaboradores e IT voltam a poder organizá-las.
-- Comunicar ausência: perfis que gerem equipa (podem não ter uma chefia configurada) e a administração.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (
    CASE r.code
        WHEN 'EMPLOYEE' THEN ARRAY['TIMESHEET_MEETING_CREATE']
        WHEN 'IT' THEN ARRAY['TIMESHEET_MEETING_CREATE']
        WHEN 'GESTOR' THEN ARRAY['TIMESHEET_ABSENCE_NOTIFY']
        WHEN 'MANAGER' THEN ARRAY['TIMESHEET_ABSENCE_NOTIFY']
        WHEN 'ADMIN' THEN ARRAY['TIMESHEET_ABSENCE_NOTIFY', 'TIMESHEET_MEETING_CREATE']
    END
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

SELECT private.write_audit_event('permission.changed', 'role_permissions', NULL,
    'Reuniões entre colegas: TIMESHEET_MEETING_CREATE atribuída a EMPLOYEE e IT; TIMESHEET_ABSENCE_NOTIFY atribuída a GESTOR, MANAGER e ADMIN.');

-- =============================================================================
-- 2. COLEGAS E CONVITES
-- =============================================================================
-- Colega: mesmo departamento ou abrangido pela mesma chefia direta (mesma equipa).
CREATE FUNCTION private.is_colleague(p_profile_id UUID, p_viewer_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_profile_id IS NOT NULL
       AND p_viewer_id IS NOT NULL
       AND p_profile_id <> p_viewer_id
       AND (
           EXISTS (
               SELECT 1 FROM public.profiles a
               JOIN public.profiles b ON b.department_id = a.department_id
               WHERE a.id = p_profile_id AND b.id = p_viewer_id AND a.department_id IS NOT NULL
           )
           OR EXISTS (
               SELECT 1 FROM (SELECT DISTINCT ms.manager_id FROM public.manager_scopes ms) AS lead
               WHERE private.profile_has_permission(lead.manager_id, 'TEAM_READ')
                 AND private.scope_covers(lead.manager_id, p_profile_id)
                 AND private.scope_covers(lead.manager_id, p_viewer_id)
           )
       );
$$;

-- Acrescenta os colegas às regras anteriores (equipa, chefias, envolvidos no registo ligado, administração).
CREATE OR REPLACE FUNCTION private.can_invite_to_meeting(p_profile_id UUID, p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('ADMIN_ACCESS')
        OR private.manages_work_of(p_profile_id)
        OR private.supervises(p_profile_id, public.get_current_profile_id())
        OR private.is_colleague(p_profile_id, public.get_current_profile_id())
        OR EXISTS (
            SELECT 1 FROM public.meetings m
            WHERE m.id = p_meeting_id
              AND (
                  m.organizer_id = p_profile_id
                  OR EXISTS (SELECT 1 FROM public.tasks t
                             WHERE t.id = m.task_id AND p_profile_id IN (t.assignee_id, t.created_by))
                  OR EXISTS (SELECT 1 FROM public.opportunities o
                             WHERE o.id = m.opportunity_id
                               AND (o.owner_id = p_profile_id OR private.is_opportunity_member(o.id, p_profile_id)))
              )
        );
$$;


-- =============================================================================
-- 3. RESPOSTAS AOS CONVITES E PEDIDOS DE REUNIÃO
-- =============================================================================
ALTER TABLE public.meeting_participants
    ADD COLUMN response VARCHAR(10) NOT NULL DEFAULT 'PENDING'
        CONSTRAINT meeting_participants_response_valid CHECK (response IN ('PENDING', 'ACCEPTED', 'DECLINED')),
    ADD COLUMN responded_at TIMESTAMPTZ,
    ADD COLUMN response_comment TEXT
        CONSTRAINT meeting_participants_response_comment_length CHECK (length(response_comment) <= 500),
    ADD CONSTRAINT meeting_participants_response_consistency CHECK ((response = 'PENDING') = (responded_at IS NULL));

-- Pedido de reunião a uma chefia (NULL = reunião normal, sem fluxo de aprovação).
ALTER TABLE public.meetings
    ADD COLUMN request_status VARCHAR(10)
        CONSTRAINT meetings_request_status_valid CHECK (request_status IN ('PENDING', 'ACCEPTED', 'REJECTED')),
    ADD COLUMN requested_with UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN request_decided_at TIMESTAMPTZ,
    ADD COLUMN request_decision_comment TEXT
        CONSTRAINT meetings_request_comment_length CHECK (length(request_decision_comment) <= 1000),
    ADD CONSTRAINT meetings_request_consistency CHECK ((request_status IS NULL) = (requested_with IS NULL)),
    ADD CONSTRAINT meetings_request_not_self CHECK (requested_with IS DISTINCT FROM organizer_id),
    ADD CONSTRAINT meetings_request_decision_consistency
        CHECK (coalesce(request_status IN ('ACCEPTED', 'REJECTED'), false) = (request_decided_at IS NOT NULL)),
    ADD CONSTRAINT meetings_request_rejection_reason
        CHECK (request_status IS DISTINCT FROM 'REJECTED' OR length(btrim(coalesce(request_decision_comment, ''))) > 0);

CREATE INDEX idx_meetings_requested_with ON public.meetings(requested_with) WHERE requested_with IS NOT NULL;

ALTER TABLE public.meeting_events
    DROP CONSTRAINT meeting_events_type_valid,
    ADD CONSTRAINT meeting_events_type_valid CHECK (event_type IN (
        'MEETING_CREATED', 'MEETING_UPDATED', 'MEETING_RESCHEDULED', 'MEETING_CONFIRMED', 'MEETING_COMPLETED',
        'MEETING_OUTCOME_UPDATED', 'MEETING_CANCELLED', 'MEETING_PARTICIPANT_ADDED', 'MEETING_PARTICIPANT_REMOVED',
        'MEETING_ATTACHMENT_ADDED', 'MEETING_ATTACHMENT_REMOVED',
        'MEETING_RESPONDED', 'MEETING_REQUESTED', 'MEETING_REQUEST_ACCEPTED', 'MEETING_REQUEST_REJECTED'
    ));

-- Um pedido pendente só sai desse estado pela decisão da chefia (ou pelo cancelamento de quem pediu):
-- o organizador não o confirma nem o conclui sozinho.
CREATE FUNCTION private.guard_meeting_request()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF OLD.request_status = 'PENDING' AND NEW.request_status = 'PENDING' AND NEW.status NOT IN ('PLANNED', 'CANCELLED') THEN
        RAISE EXCEPTION 'O pedido de reunião aguarda a resposta de quem foi convidado.';
    END IF;
    IF NEW.requested_with IS DISTINCT FROM OLD.requested_with THEN
        RAISE EXCEPTION 'A pessoa a quem a reunião foi pedida não pode ser alterada.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meetings_guard_request
    BEFORE UPDATE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION private.guard_meeting_request();

-- Reagendar volta a pedir resposta a quem já tinha respondido.
CREATE FUNCTION private.reset_meeting_responses()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    UPDATE public.meeting_participants
    SET response = 'PENDING', responded_at = NULL, response_comment = NULL
    WHERE meeting_id = NEW.meeting_id AND response <> 'PENDING';
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_meeting_events_reset_responses
    AFTER INSERT ON public.meeting_events
    FOR EACH ROW WHEN (NEW.event_type = 'MEETING_RESCHEDULED')
    EXECUTE FUNCTION private.reset_meeting_responses();

-- Resposta de um convidado. O organizador é notificado.
CREATE FUNCTION public.respond_to_meeting(p_meeting_id UUID, p_response TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_meeting public.meetings%ROWTYPE := private.lock_meeting(p_meeting_id);
    v_comment TEXT := private.optional_text(p_comment, 500, 'O comentário');
    v_current TEXT;
BEGIN
    IF p_response NOT IN ('ACCEPTED', 'DECLINED') THEN
        RAISE EXCEPTION 'Resposta inválida.';
    END IF;
    SELECT response INTO v_current FROM public.meeting_participants
    WHERE meeting_id = p_meeting_id AND profile_id = v_actor FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Só os convidados respondem ao convite.' USING ERRCODE = '42501';
    END IF;
    IF v_meeting.request_status = 'PENDING' THEN
        RAISE EXCEPTION 'Este é um pedido de reunião: aceite ou recuse o pedido.';
    END IF;
    IF v_meeting.status NOT IN ('PLANNED', 'CONFIRMED') OR v_meeting.ends_at <= now() THEN
        RAISE EXCEPTION 'A reunião já terminou ou foi cancelada.';
    END IF;
    IF v_current = p_response THEN
        RETURN;
    END IF;

    UPDATE public.meeting_participants
    SET response = p_response, responded_at = now(), response_comment = v_comment
    WHERE meeting_id = p_meeting_id AND profile_id = v_actor;

    PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_RESPONDED', 'response',
        CASE v_current WHEN 'ACCEPTED' THEN 'Aceite' WHEN 'DECLINED' THEN 'Recusado' ELSE 'Por responder' END,
        CASE p_response WHEN 'ACCEPTED' THEN 'Aceite' ELSE 'Recusado' END, v_comment);
    PERFORM private.notify(ARRAY[v_meeting.organizer_id], v_actor, 'MEETING_RESPONSE',
        CASE p_response WHEN 'ACCEPTED' THEN 'Convite aceite' ELSE 'Convite recusado' END,
        private.profile_label(v_actor) || ' · ' || v_meeting.title
        || CASE WHEN v_comment IS NOT NULL THEN ': ' || v_comment ELSE '' END,
        '/timesheet/meetings/' || p_meeting_id);
END;
$$;

-- Pedido de reunião a uma chefia configurada do requerente.
CREATE FUNCTION public.request_meeting(
    p_lead_id UUID,
    p_title TEXT,
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_agenda TEXT DEFAULT '',
    p_location TEXT DEFAULT NULL,
    p_meeting_url TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_meeting_id UUID;
    v_title TEXT := btrim(coalesce(p_title, ''));
BEGIN
    PERFORM private.require_permission('TIMESHEET_MEETING_READ', 'Não tem permissão para pedir reuniões.');
    IF p_lead_id IS NULL OR NOT private.is_active_profile(p_lead_id) OR NOT private.supervises(p_lead_id, v_actor) THEN
        RAISE EXCEPTION 'Escolha uma das suas chefias configuradas.' USING ERRCODE = '42501';
    END IF;
    IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'A reunião tem de terminar depois de começar.';
    END IF;
    IF p_ends_at - p_starts_at > interval '24 hours' THEN
        RAISE EXCEPTION 'Uma reunião não pode durar mais de 24 horas.';
    END IF;
    IF p_starts_at <= now() THEN
        RAISE EXCEPTION 'Proponha uma data futura.';
    END IF;
    IF length(v_title) < 3 OR length(v_title) > 200 THEN
        RAISE EXCEPTION 'O assunto deve ter entre 3 e 200 carateres.';
    END IF;
    IF length(coalesce(p_agenda, '')) > 5000 THEN
        RAISE EXCEPTION 'A agenda não pode exceder 5000 carateres.';
    END IF;
    -- Sem pedidos repetidos para a mesma pessoa e a mesma hora.
    IF EXISTS (
        SELECT 1 FROM public.meetings
        WHERE organizer_id = v_actor AND requested_with = p_lead_id AND request_status = 'PENDING'
          AND status = 'PLANNED' AND starts_at < p_ends_at AND ends_at > p_starts_at
    ) THEN
        RAISE EXCEPTION 'Já tem um pedido pendente para esta pessoa neste horário.';
    END IF;

    INSERT INTO public.meetings (title, description, objective, starts_at, ends_at, location, meeting_url,
                                 organizer_id, department_id, request_status, requested_with)
    VALUES (v_title, btrim(coalesce(p_agenda, '')), '', p_starts_at, p_ends_at,
            private.optional_text(p_location, 200, 'O local'), private.optional_text(p_meeting_url, 500, 'A ligação'),
            v_actor, private.current_department_id(), 'PENDING', p_lead_id)
    RETURNING id INTO v_meeting_id;

    INSERT INTO public.meeting_participants (meeting_id, profile_id) VALUES (v_meeting_id, p_lead_id);
    PERFORM private.log_meeting_event(v_meeting_id, 'MEETING_REQUESTED', 'requested_with', NULL,
        private.profile_label(p_lead_id), private.local_datetime_label(p_starts_at));
    PERFORM private.notify(ARRAY[p_lead_id], v_actor, 'MEETING_REQUEST', 'Pedido de reunião',
        private.profile_label(v_actor) || ': ' || v_title || ' · ' || private.local_datetime_label(p_starts_at),
        '/timesheet/meetings/' || v_meeting_id);
    RETURN v_meeting_id;
END;
$$;

-- Decisão de quem recebeu o pedido: aceitar (confirma a reunião) ou recusar (com motivo; a reunião é cancelada
-- e quem pediu pode propor outro horário). Uma segunda decisão é recusada (linha bloqueada).
CREATE FUNCTION public.decide_meeting_request(p_meeting_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_meeting public.meetings%ROWTYPE;
    v_comment TEXT;
BEGIN
    SELECT * INTO v_meeting FROM public.meetings WHERE id = p_meeting_id FOR UPDATE;
    IF NOT FOUND OR v_meeting.requested_with IS DISTINCT FROM v_actor THEN
        RAISE EXCEPTION 'Pedido de reunião não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_meeting.request_status <> 'PENDING' THEN
        RAISE EXCEPTION 'Este pedido já foi decidido.';
    END IF;
    IF v_meeting.status <> 'PLANNED' THEN
        RAISE EXCEPTION 'O pedido foi cancelado por quem o fez.';
    END IF;
    IF NOT private.is_meeting_participant(p_meeting_id, v_actor) THEN
        RAISE EXCEPTION 'Já não é participante deste pedido.';
    END IF;

    IF p_decision = 'ACCEPTED' THEN
        v_comment := private.optional_text(p_comment, 1000, 'O comentário');
        UPDATE public.meetings
        SET request_status = 'ACCEPTED', request_decided_at = now(), request_decision_comment = v_comment, status = 'CONFIRMED'
        WHERE id = p_meeting_id;
        UPDATE public.meeting_participants SET response = 'ACCEPTED', responded_at = now(), response_comment = v_comment
        WHERE meeting_id = p_meeting_id AND profile_id = v_actor;
        PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_REQUEST_ACCEPTED', 'request_status', 'Pendente', 'Aceite', v_comment);
        PERFORM private.notify(ARRAY[v_meeting.organizer_id], v_actor, 'MEETING_REQUEST_DECIDED', 'Pedido de reunião aceite',
            v_meeting.title || ' · ' || private.local_datetime_label(v_meeting.starts_at)
            || CASE WHEN v_comment IS NOT NULL THEN ': ' || v_comment ELSE '' END,
            '/timesheet/meetings/' || p_meeting_id);
    ELSIF p_decision = 'REJECTED' THEN
        v_comment := private.required_text(p_comment, 5, 1000, 'Indique o motivo da recusa');
        UPDATE public.meetings
        SET request_status = 'REJECTED', request_decided_at = now(), request_decision_comment = v_comment,
            status = 'CANCELLED', cancelled_at = now(), cancel_reason = 'Pedido recusado: ' || v_comment
        WHERE id = p_meeting_id;
        UPDATE public.meeting_participants SET response = 'DECLINED', responded_at = now(), response_comment = v_comment
        WHERE meeting_id = p_meeting_id AND profile_id = v_actor;
        PERFORM private.log_meeting_event(p_meeting_id, 'MEETING_REQUEST_REJECTED', 'request_status', 'Pendente', 'Recusado', v_comment);
        PERFORM private.notify(ARRAY[v_meeting.organizer_id], v_actor, 'MEETING_REQUEST_DECIDED', 'Pedido de reunião recusado',
            v_meeting.title || ': ' || v_comment, '/timesheet/meetings/' || p_meeting_id);
    ELSE
        RAISE EXCEPTION 'Decisão inválida.';
    END IF;
END;
$$;

-- Pessoas da reunião com a resposta de cada convidado.
DROP FUNCTION public.get_meeting_people(UUID);

CREATE FUNCTION public.get_meeting_people(p_meeting_id UUID)
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    job_title TEXT,
    is_organizer BOOLEAN,
    response TEXT,
    responded_at TIMESTAMPTZ,
    response_comment TEXT
)
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
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.id = v_meeting.organizer_id,
           CASE WHEN p.id = v_meeting.organizer_id THEN 'ACCEPTED' ELSE mp.response::TEXT END,
           mp.responded_at, mp.response_comment
    FROM public.profiles p
    LEFT JOIN public.meeting_participants mp ON mp.meeting_id = p_meeting_id AND mp.profile_id = p.id
    WHERE p.id = v_meeting.organizer_id OR mp.profile_id IS NOT NULL
    ORDER BY (p.id = v_meeting.organizer_id) DESC, p.full_name;
END;
$$;

-- Chefias configuradas de quem pede (para escolher a quem pedir uma reunião). Sem relação configurada,
-- a lista fica vazia: a interface explica que a atribuição é feita pela administração.
CREATE FUNCTION public.list_my_leads()
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, relation TEXT)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
BEGIN
    RETURN QUERY
    SELECT leads.manager_id, leads.full_name, p.job_title::TEXT, leads.relation
    FROM public.get_profile_leads(v_me) AS leads
    JOIN public.profiles p ON p.id = leads.manager_id
    WHERE leads.is_active
    ORDER BY leads.relation, leads.full_name;
END;
$$;

-- =============================================================================
-- 4. COMUNICAR AUSÊNCIA (indisponibilidade sem pedido formal)
-- =============================================================================
ALTER TABLE public.absence_requests
    ADD COLUMN kind VARCHAR(10) NOT NULL DEFAULT 'REQUEST'
        CONSTRAINT absence_requests_kind_valid CHECK (kind IN ('REQUEST', 'NOTICE'));

ALTER TABLE public.absence_requests
    DROP CONSTRAINT absence_requests_status_valid,
    ADD CONSTRAINT absence_requests_status_valid
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMMUNICATED')),
    -- Uma comunicação nunca passa por validação nem decisão e nunca se confunde com uma ausência aprovada.
    ADD CONSTRAINT absence_requests_notice_consistency CHECK (
        (kind = 'NOTICE' AND status IN ('COMMUNICATED', 'CANCELLED') AND validated_by IS NULL AND decided_by IS NULL)
        OR (kind = 'REQUEST' AND status <> 'COMMUNICATED')
    );

ALTER TABLE public.absence_events
    DROP CONSTRAINT absence_events_type_valid,
    ADD CONSTRAINT absence_events_type_valid CHECK (event_type IN (
        'ABSENCE_CREATED', 'ABSENCE_UPDATED', 'ABSENCE_SUBMITTED', 'ABSENCE_VALIDATED', 'ABSENCE_APPROVED', 'ABSENCE_REJECTED',
        'ABSENCE_CHANGES_REQUESTED', 'ABSENCE_CANCELLED', 'ABSENCE_ATTACHMENT_ADDED', 'ABSENCE_ATTACHMENT_REMOVED',
        'ABSENCE_COMMUNICATED'
    ));

CREATE OR REPLACE FUNCTION private.absence_status_label(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_status
        WHEN 'DRAFT' THEN 'Rascunho'
        WHEN 'SUBMITTED' THEN 'A aguardar validação'
        WHEN 'PENDING_APPROVAL' THEN 'A aguardar decisão'
        WHEN 'APPROVED' THEN 'Aprovado'
        WHEN 'REJECTED' THEN 'Rejeitado'
        WHEN 'CANCELLED' THEN 'Cancelado'
        WHEN 'COMMUNICATED' THEN 'Comunicada'
        ELSE p_status
    END;
$$;

-- Quem é informado: as chefias configuradas de quem comunica e a sua equipa direta.
CREATE FUNCTION private.absence_notice_recipients(p_profile_id UUID)
RETURNS UUID[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT ARRAY(
        SELECT DISTINCT ms.manager_id
        FROM public.manager_scopes ms
        WHERE ms.manager_id <> p_profile_id AND private.supervises(ms.manager_id, p_profile_id)
        UNION
        SELECT p.id
        FROM public.profiles p
        WHERE p.is_active AND p.id <> p_profile_id AND private.scope_covers(p_profile_id, p.id)
    );
$$;

CREATE FUNCTION public.communicate_absence(p_absence_type_id UUID, p_start_date DATE, p_end_date DATE, p_reason TEXT DEFAULT '')
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_type public.absence_types%ROWTYPE;
    v_overlap TEXT;
    v_request_id UUID;
    v_label TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ABSENCE_NOTIFY', 'Não tem permissão para comunicar ausências.');
    SELECT * INTO v_type FROM public.absence_types WHERE id = p_absence_type_id;
    IF NOT FOUND OR NOT v_type.active THEN
        RAISE EXCEPTION 'Tipo de ausência inválido.';
    END IF;
    IF p_start_date IS NULL OR p_end_date IS NULL OR p_end_date < p_start_date THEN
        RAISE EXCEPTION 'A data de fim não pode ser anterior à de início.';
    END IF;
    IF p_end_date - p_start_date > 366 THEN
        RAISE EXCEPTION 'O período não pode exceder um ano.';
    END IF;
    IF length(coalesce(p_reason, '')) > 2000 THEN
        RAISE EXCEPTION 'O motivo não pode exceder 2000 carateres.';
    END IF;

    SELECT reference INTO v_overlap
    FROM public.absence_requests
    WHERE employee_id = v_actor AND status IN ('SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'COMMUNICATED')
      AND start_date <= p_end_date AND end_date >= p_start_date
    LIMIT 1;
    IF v_overlap IS NOT NULL THEN
        RAISE EXCEPTION 'Já existe uma ausência registada para parte deste período (%).', v_overlap;
    END IF;

    INSERT INTO public.absence_requests (employee_id, absence_type_id, start_date, end_date, reason, status, kind, submitted_at)
    VALUES (v_actor, p_absence_type_id, p_start_date, p_end_date, btrim(coalesce(p_reason, '')), 'COMMUNICATED', 'NOTICE', now())
    RETURNING id INTO v_request_id;

    v_label := v_type.name || ' · ' || private.absence_period_label(p_start_date, p_end_date);
    PERFORM private.log_absence_event(v_request_id, 'ABSENCE_COMMUNICATED', 'status', NULL,
        private.absence_status_label('COMMUNICATED'), nullif(btrim(coalesce(p_reason, '')), ''));
    PERFORM private.notify(private.absence_notice_recipients(v_actor), v_actor, 'ABSENCE_COMMUNICATED',
        'Ausência comunicada', private.profile_label(v_actor) || ': ' || v_label, NULL);
    RETURN v_request_id;
END;
$$;

-- Acrescenta o cancelamento de uma comunicação (enquanto não terminou); as restantes regras mantêm-se.
CREATE OR REPLACE FUNCTION public.cancel_absence_request(p_request_id UUID, p_reason TEXT DEFAULT NULL)
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
    ELSIF v_request.status = 'COMMUNICATED' THEN
        IF v_request.end_date < private.local_today() THEN
            RAISE EXCEPTION 'Esta ausência já terminou.';
        END IF;
        v_reason := private.optional_text(p_reason, 1000, 'O motivo');
    ELSIF v_request.status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL') THEN
        v_reason := private.optional_text(p_reason, 1000, 'O motivo');
    ELSE
        RAISE EXCEPTION 'Este pedido já não pode ser cancelado.';
    END IF;
    UPDATE public.absence_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = p_request_id;
    PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CANCELLED', 'status',
        private.absence_status_label(v_request.status), private.absence_status_label('CANCELLED'), v_reason);
    IF v_request.status = 'COMMUNICATED' THEN
        PERFORM private.notify(private.absence_notice_recipients(v_actor), v_actor, 'ABSENCE_COMMUNICATED',
            'Ausência comunicada cancelada',
            private.profile_label(v_actor) || ': ' || private.absence_period_label(v_request.start_date, v_request.end_date), NULL);
    END IF;
END;
$$;


-- =============================================================================
-- 5. DISPONIBILIDADE: AS AUSÊNCIAS COMUNICADAS CONTAM COMO INDISPONIBILIDADE
-- =============================================================================
-- Calendário, resumo pessoal, carga da equipa e conflitos de agenda (mesmas definições, com COMMUNICATED).
-- Diretório de convidáveis: acrescenta os colegas (mesma regra de can_invite_to_meeting).

CREATE OR REPLACE FUNCTION public.get_calendar_items(p_from DATE, p_to DATE, p_scope TEXT DEFAULT 'ME')
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
    SELECT 'DEADLINE'::TEXT, t.id, t.title::TEXT, t.due_at, t.due_at, false, t.status::TEXT,
           t.assignee_id, assignee.full_name::TEXT, t.reference::TEXT,
           (t.due_at < now() AND t.status NOT IN ('COMPLETED', 'CANCELLED'))
    FROM public.tasks t
    LEFT JOIN public.profiles assignee ON assignee.id = t.assignee_id
    WHERE t.due_at >= v_from AND t.due_at < v_to AND t.status <> 'CANCELLED'
      AND (NOT v_mine OR t.assignee_id = v_me)
    UNION ALL
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
      AND (a.status IN ('APPROVED', 'COMMUNICATED') OR (a.status IN ('SUBMITTED', 'PENDING_APPROVAL') AND a.employee_id = v_me))
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

CREATE OR REPLACE FUNCTION public.get_my_work_summary()
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
            WHERE a.employee_id = v_me AND a.status IN ('APPROVED', 'COMMUNICATED') AND v_today BETWEEN a.start_date AND a.end_date LIMIT 1),
        (SELECT count(*) FROM public.absence_requests WHERE employee_id = v_me AND status IN ('SUBMITTED', 'PENDING_APPROVAL'))::INTEGER;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_team_work_overview()
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    job_title TEXT,
    job_description TEXT,
    department_name TEXT,
    role_code TEXT,
    lead_names TEXT,
    is_direct BOOLEAN,
    tasks_open INTEGER,
    tasks_in_progress INTEGER,
    tasks_blocked INTEGER,
    tasks_overdue INTEGER,
    tasks_due_next_7_days INTEGER,
    tasks_completed_30_days INTEGER,
    opportunities_active INTEGER,
    minutes_this_week INTEGER,
    last_activity_date DATE,
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
BEGIN
    PERFORM private.require_permission('TEAM_READ', 'Não tem permissão para consultar a equipa.');
    RETURN QUERY
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.job_description, d.name::TEXT, r.code::TEXT,
        (SELECT string_agg(lead.full_name, ', ' ORDER BY lead.full_name) FROM public.profiles lead
            WHERE lead.id = ANY (private.operational_leads(p.id)))::TEXT,
        private.scope_covers(v_me, p.id),
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED'))::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'IN_PROGRESS')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'BLOCKED')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now())::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
            AND t.due_at >= now() AND t.due_at < now() + interval '7 days')::INTEGER,
        (SELECT count(*) FROM public.tasks t WHERE t.assignee_id = p.id AND t.status = 'COMPLETED'
            AND t.completed_at >= now() - interval '30 days')::INTEGER,
        (SELECT count(*) FROM public.opportunities o WHERE o.owner_id = p.id
            AND o.status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'))::INTEGER,
        (SELECT coalesce(sum(e.total_minutes), 0) FROM public.timesheet_entries e
            WHERE e.employee_id = p.id AND e.work_date BETWEEN v_week_start AND v_today)::INTEGER,
        (SELECT max(e.work_date) FROM public.timesheet_entries e WHERE e.employee_id = p.id),
        (SELECT at.name::TEXT FROM public.absence_requests a JOIN public.absence_types at ON at.id = a.absence_type_id
            WHERE a.employee_id = p.id AND a.status IN ('APPROVED', 'COMMUNICATED') AND v_today BETWEEN a.start_date AND a.end_date LIMIT 1),
        (SELECT count(*) FROM public.absence_requests a WHERE a.employee_id = p.id
            AND a.status IN ('SUBMITTED', 'PENDING_APPROVAL'))::INTEGER
    FROM private.team_member_ids(v_me) AS member(id)
    JOIN public.profiles p ON p.id = member.id
    LEFT JOIN public.departments d ON d.id = p.department_id
    LEFT JOIN public.user_roles ur ON ur.user_id = p.id
    LEFT JOIN public.roles r ON r.id = ur.role_id
    ORDER BY (r.code = 'GESTOR') DESC, p.full_name
    LIMIT 500;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_schedule_conflicts(
    p_profile_ids UUID[],
    p_starts_at TIMESTAMPTZ,
    p_ends_at TIMESTAMPTZ,
    p_exclude_meeting_id UUID DEFAULT NULL,
    p_task_id UUID DEFAULT NULL,
    p_opportunity_id UUID DEFAULT NULL
)
RETURNS TABLE (
    profile_id UUID,
    full_name TEXT,
    conflict_type TEXT,
    meeting_id UUID,
    title TEXT,
    starts_at TIMESTAMPTZ,
    ends_at TIMESTAMPTZ
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_meeting public.meetings%ROWTYPE;
    v_people UUID[];
    v_first_day DATE := (p_starts_at AT TIME ZONE 'Africa/Maputo')::DATE;
    v_last_day DATE := (p_ends_at AT TIME ZONE 'Africa/Maputo')::DATE;
BEGIN
    PERFORM private.require_permission('TIMESHEET_MEETING_CREATE', 'Não tem permissão para organizar reuniões.');
    IF p_starts_at IS NULL OR p_ends_at IS NULL OR p_ends_at <= p_starts_at THEN
        RAISE EXCEPTION 'A reunião tem de terminar depois de começar.';
    END IF;
    IF p_ends_at - p_starts_at > interval '24 hours' THEN
        RAISE EXCEPTION 'Uma reunião não pode durar mais de 24 horas.';
    END IF;
    IF cardinality(coalesce(p_profile_ids, ARRAY[]::UUID[])) > 51 THEN
        RAISE EXCEPTION 'Uma reunião não pode ter mais de 50 participantes.';
    END IF;
    IF p_exclude_meeting_id IS NOT NULL THEN
        SELECT * INTO v_meeting FROM public.meetings WHERE id = p_exclude_meeting_id;
        IF NOT FOUND OR NOT private.manages_meeting(v_meeting) THEN
            RAISE EXCEPTION 'Reunião não encontrada.' USING ERRCODE = '42501';
        END IF;
    END IF;

    v_people := ARRAY(
        SELECT DISTINCT person
        FROM unnest(coalesce(p_profile_ids, ARRAY[]::UUID[])) AS person
        WHERE person IS NOT NULL
          AND private.is_active_profile(person)
          AND (
              person = v_me
              OR private.can_invite_to_meeting(person, p_exclude_meeting_id)
              OR (p_exclude_meeting_id IS NOT NULL AND private.is_meeting_participant(p_exclude_meeting_id, person))
              OR EXISTS (SELECT 1 FROM public.tasks t
                         WHERE t.id = p_task_id AND private.can_read_task(t) AND person IN (t.assignee_id, t.created_by))
              OR EXISTS (SELECT 1 FROM public.opportunities o
                         WHERE o.id = p_opportunity_id AND private.can_read_opportunity(o)
                           AND (o.owner_id = person OR private.is_opportunity_member(o.id, person)))
          )
    );

    RETURN QUERY
    SELECT conflicts.profile_id, conflicts.full_name, conflicts.conflict_type, conflicts.meeting_id,
           conflicts.title, conflicts.starts_at, conflicts.ends_at
    FROM (
        SELECT p.id AS profile_id, p.full_name::TEXT AS full_name, 'MEETING'::TEXT AS conflict_type,
               CASE WHEN private.can_read_meeting(m) THEN m.id END AS meeting_id,
               CASE WHEN private.can_read_meeting(m) THEN m.title::TEXT END AS title,
               m.starts_at, m.ends_at
        FROM unnest(v_people) AS person
        JOIN public.profiles p ON p.id = person
        JOIN public.meetings m
          ON m.organizer_id = person
          OR EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = m.id AND mp.profile_id = person)
        WHERE m.status IN ('PLANNED', 'CONFIRMED')
          AND m.id IS DISTINCT FROM p_exclude_meeting_id
          AND m.starts_at < p_ends_at
          AND m.ends_at > p_starts_at
        UNION ALL
        SELECT p.id, p.full_name::TEXT, 'ABSENCE'::TEXT, NULL::UUID, NULL::TEXT,
               (greatest(a.start_date, v_first_day)::TIMESTAMP AT TIME ZONE 'Africa/Maputo'),
               ((least(a.end_date, v_last_day) + 1)::TIMESTAMP AT TIME ZONE 'Africa/Maputo')
        FROM unnest(v_people) AS person
        JOIN public.profiles p ON p.id = person
        JOIN public.absence_requests a ON a.employee_id = person
        WHERE a.status IN ('APPROVED', 'COMMUNICATED')
          AND a.start_date <= v_last_day
          AND a.end_date >= v_first_day
    ) AS conflicts
    ORDER BY conflicts.full_name, conflicts.starts_at;
END;
$$;

CREATE OR REPLACE FUNCTION public.list_work_people(p_purpose TEXT DEFAULT 'PARTICIPANT')
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, department_name TEXT, job_description TEXT)
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
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, p.job_description
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND private.manages_work_of(p.id)
        ORDER BY (p.id = v_me) DESC, p.full_name;
    ELSIF p_purpose = 'MEETING' THEN
        PERFORM private.require_permission('TIMESHEET_MEETING_CREATE', 'Não tem permissão para organizar reuniões.');
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
          AND (public.has_permission('ADMIN_ACCESS') OR private.manages_work_of(p.id) OR private.supervises(p.id, v_me)
               OR private.is_colleague(p.id, v_me))
        ORDER BY p.full_name;
    ELSIF p_purpose IN ('PARTICIPANT', 'TEAM_LEAD') THEN
        IF NOT (public.has_permission('TIMESHEET_MEETING_CREATE') OR public.has_permission('TIMESHEET_OPPORTUNITY_UPDATE')) THEN
            RAISE EXCEPTION 'Não tem permissão para consultar o diretório.' USING ERRCODE = '42501';
        END IF;
        RETURN QUERY
        SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, d.name::TEXT, NULL::TEXT
        FROM public.profiles p
        LEFT JOIN public.departments d ON d.id = p.department_id
        WHERE p.is_active AND p.id <> v_me
          AND (p_purpose = 'PARTICIPANT' OR private.profile_has_permission(p.id, 'TEAM_READ'))
        ORDER BY p.full_name;
    ELSE
        RAISE EXCEPTION 'Finalidade inválida.';
    END IF;
END;
$$;

-- =============================================================================
-- 6. HISTÓRICO DO TIMESHEET (registos guardados, nunca reconstruídos)
-- =============================================================================
-- Criação, submissões e reaberturas vêm da auditoria; as decisões vêm de timesheet_approvals, com o
-- comentário de quem decidiu. Leitura: o próprio, quem o supervisiona com TEAM_TIMESHEET_READ e a administração.
CREATE FUNCTION public.get_timesheet_history(p_timesheet_id UUID)
RETURNS TABLE (event_id UUID, action TEXT, actor_name TEXT, comment TEXT, created_at TIMESTAMPTZ)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_timesheet public.timesheets%ROWTYPE;
BEGIN
    SELECT * INTO v_timesheet FROM public.timesheets WHERE id = p_timesheet_id;
    IF NOT FOUND OR NOT (
        v_timesheet.employee_id = v_me
        OR public.has_permission('ADMIN_ACCESS')
        OR (public.has_permission('TEAM_TIMESHEET_READ') AND public.is_manager_of_employee(v_timesheet.employee_id))
    ) THEN
        RAISE EXCEPTION 'Timesheet não encontrado.' USING ERRCODE = '42501';
    END IF;

    RETURN QUERY
    SELECT history.event_id, history.action, history.actor_name, history.comment, history.created_at
    FROM (
        SELECT ae.id AS event_id, ae.action::TEXT AS action, actor.full_name::TEXT AS actor_name, NULL::TEXT AS comment,
               ae.created_at AS created_at
        FROM public.audit_events ae
        LEFT JOIN public.profiles actor ON actor.id = ae.actor_user_id
        WHERE ae.entity_type = 'timesheets' AND ae.entity_id = p_timesheet_id::TEXT
          AND ae.action IN ('timesheet.created', 'timesheet.submitted', 'timesheet.reopened', 'timesheet.locked')
        UNION ALL
        SELECT ta.id, CASE ta.status WHEN 'APPROVED' THEN 'timesheet.approved' ELSE 'timesheet.rejected' END,
               approver.full_name::TEXT, ta.comment, ta.created_at
        FROM public.timesheet_approvals ta
        LEFT JOIN public.profiles approver ON approver.id = ta.approver_id
        WHERE ta.timesheet_id = p_timesheet_id AND ta.status IN ('APPROVED', 'REJECTED')
    ) AS history
    ORDER BY history.created_at, history.action;
END;
$$;

-- =============================================================================
-- 7. LEMBRETES POR REGRA (a pedido, sem duplicados)
-- =============================================================================
INSERT INTO public.system_settings (key, value, description) VALUES
    ('APPROVAL_REMINDER_DAYS', '3', 'Dias de espera até lembrar quem decide de uma aprovação pendente')
ON CONFLICT (key) DO NOTHING;

CREATE FUNCTION public.validate_operations_setting()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.key = 'APPROVAL_REMINDER_DAYS'
       AND (NEW.value !~ '^[0-9]{1,2}$' OR NEW.value::INTEGER NOT BETWEEN 1 AND 30) THEN
        RAISE EXCEPTION 'O lembrete de aprovação deve ser um número inteiro de dias entre 1 e 30.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_system_settings_validate_operations
    BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.validate_operations_setting();

-- Chamado pela aplicação ao carregar as notificações (tal como refresh_deadline_alerts). Gera, para quem chama:
--   * timesheets do âmbito submetidos há mais de N dias (quem pode decidir);
--   * ausências à espera da sua validação ou decisão há mais de N dias;
--   * os próprios timesheets em rascunho ou rejeitados cujo período já terminou.
-- A chave inclui o momento da submissão: uma nova submissão gera um novo lembrete, nunca uma repetição.
CREATE FUNCTION public.refresh_approval_reminders()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_days INTEGER := coalesce((SELECT value FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS'), '3')::INTEGER;
    v_limit TIMESTAMPTZ := now() - make_interval(days => v_days);
    v_created INTEGER := 0;
    v_rows INTEGER;
BEGIN
    IF public.has_permission('TEAM_TIMESHEET_REVIEW') THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, dedup_key)
        SELECT v_me, 'APPROVAL_REMINDER', 'Timesheet pendente há mais de ' || v_days || ' dias',
               employee.full_name || ' · ' || to_char(t.period_start, 'DD/MM/YYYY') || ' a ' || to_char(t.period_end, 'DD/MM/YYYY'),
               '/approvals/' || t.id, 'approval-reminder:timesheet:' || t.id || ':' || extract(epoch FROM t.submitted_at)::BIGINT
        FROM public.timesheets t
        JOIN public.profiles employee ON employee.id = t.employee_id
        WHERE t.status = 'SUBMITTED' AND t.submitted_at < v_limit AND t.employee_id <> v_me
          AND public.is_manager_of_employee(t.employee_id)
        ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_created := v_created + v_rows;
    END IF;

    IF public.has_permission('TIMESHEET_ABSENCE_VALIDATE') OR public.has_permission('TIMESHEET_ABSENCE_APPROVE') THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, dedup_key)
        SELECT v_me, 'APPROVAL_REMINDER', 'Ausência pendente há mais de ' || v_days || ' dias',
               employee.full_name || ' · ' || a.reference || ' · ' || private.absence_period_label(a.start_date, a.end_date),
               '/approvals?tab=absences',
               'approval-reminder:absence:' || a.id || ':' || a.status || ':' || extract(epoch FROM coalesce(a.validated_at, a.submitted_at))::BIGINT
        FROM public.absence_requests a
        JOIN public.profiles employee ON employee.id = a.employee_id
        WHERE a.employee_id <> v_me
          AND coalesce(a.validated_at, a.submitted_at) < v_limit
          AND (
              (a.status = 'SUBMITTED' AND v_me = ANY (private.absence_validators(a.employee_id)))
              OR (a.status = 'PENDING_APPROVAL' AND v_me = ANY (private.absence_deciders(a.employee_id)))
          )
        ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_created := v_created + v_rows;
    END IF;

    IF public.has_permission('SELF_TIMESHEET_SUBMIT') THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, dedup_key)
        SELECT v_me, 'TIMESHEET_SUBMISSION_REMINDER',
               CASE t.status WHEN 'REJECTED' THEN 'Timesheet por corrigir e submeter' ELSE 'Timesheet por submeter' END,
               'Período ' || to_char(t.period_start, 'DD/MM/YYYY') || ' a ' || to_char(t.period_end, 'DD/MM/YYYY') || ' terminado.',
               '/timesheets/' || t.id, 'timesheet-submission:' || t.id || ':' || t.status || ':' || extract(epoch FROM t.updated_at)::BIGINT
        FROM public.timesheets t
        WHERE t.employee_id = v_me AND t.status IN ('DRAFT', 'REJECTED') AND t.period_end < private.local_today()
          AND EXISTS (SELECT 1 FROM public.timesheet_entries e WHERE e.timesheet_id = t.id)
        ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_created := v_created + v_rows;
    END IF;
    RETURN v_created;
END;
$$;

-- =============================================================================
-- 8. CATEGORIAS DAS NOTIFICAÇÕES NOVAS
-- =============================================================================
CREATE OR REPLACE FUNCTION private.notification_category(p_type TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE
        WHEN p_type IN ('APPROVAL_REQUIRED', 'ABSENCE_APPROVAL_REQUIRED', 'ABSENCE_VALIDATION_REQUIRED',
                        'OPPORTUNITY_APPROVAL_REQUIRED', 'MEETING_REQUEST', 'APPROVAL_REMINDER') THEN 'APPROVAL_REQUEST'
        WHEN p_type IN ('TASK_COMPLETED', 'TASK_REVIEW_REQUIRED', 'TEAM_TASK_COMPLETED') THEN 'COMPLETION'
        WHEN p_type IN ('TASK_DUE_SOON', 'TASK_OVERDUE', 'TEAM_TASK_OVERDUE', 'TIMESHEET_SUBMISSION_REMINDER') THEN 'DEADLINE'
        WHEN p_type IN ('TIMESHEET_APPROVED', 'TIMESHEET_REJECTED', 'ABSENCE_APPROVED', 'ABSENCE_REJECTED',
                        'ABSENCE_CHANGES_REQUESTED', 'OPPORTUNITY_APPROVED', 'OPPORTUNITY_REJECTED', 'TASK_REVIEWED',
                        'MEETING_REQUEST_DECIDED')
            THEN 'DECISION'
        ELSE 'INFO'
    END;
$$;

-- =============================================================================
-- 9. PRIVILÉGIOS
-- =============================================================================
REVOKE EXECUTE ON FUNCTION
    private.is_colleague(UUID, UUID),
    private.guard_meeting_request(),
    private.reset_meeting_responses(),
    private.absence_notice_recipients(UUID)
FROM PUBLIC, anon, authenticated;

REVOKE EXECUTE ON FUNCTION
    public.respond_to_meeting(UUID, TEXT, TEXT),
    public.request_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT),
    public.decide_meeting_request(UUID, TEXT, TEXT),
    public.get_meeting_people(UUID),
    public.list_my_leads(),
    public.communicate_absence(UUID, DATE, DATE, TEXT),
    public.get_timesheet_history(UUID),
    public.refresh_approval_reminders()
FROM PUBLIC, anon;

REVOKE EXECUTE ON FUNCTION public.validate_operations_setting() FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.respond_to_meeting(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.request_meeting(UUID, TEXT, TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.decide_meeting_request(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_meeting_people(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_my_leads() TO authenticated;
GRANT EXECUTE ON FUNCTION public.communicate_absence(UUID, DATE, DATE, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_timesheet_history(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_approval_reminders() TO authenticated;
