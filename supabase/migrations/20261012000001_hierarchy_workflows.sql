-- TsheetGRT · SI Holdings — Hierarquia organizacional (2/3): fluxos de aprovação e encaminhamento
--
--   * Ausências: colaborador submete → gestor da equipa valida e encaminha → Manager decide.
--     Sem gestor de equipa (ou para o próprio gestor), o pedido segue diretamente para decisão.
--     Tipos marcados com requires_manager_approval = false ficam aprovados na validação.
--   * Oportunidades: pedido de aprovação explícito (approval_requests). Sem aprovação, a oportunidade
--     não avança para Proposta, Negociação ou Ganha. Quem pede nunca decide.
--   * Tarefas: acompanhamento (revisão) da conclusão; "exige acompanhamento do Manager" escala a
--     conclusão para quem supervisiona o gestor.
--   * Reuniões: só se convida quem está no âmbito, as chefias de quem organiza ou os envolvidos no
--     registo relacionado.
--   * Notificações: o gestor recebe a operação da equipa; o Manager recebe decisões e escalonamentos.
--   * Alertas de prazo: gerados a pedido (sem agendador), sem duplicados.
-- Todas as decisões bloqueiam a linha (FOR UPDATE) e validam o estado: duas decisões concorrentes
-- sobre o mesmo pedido não produzem estados inconsistentes (a segunda é recusada).

-- =============================================================================
-- 1. AUSÊNCIAS EM DOIS NÍVEIS
-- =============================================================================
ALTER TABLE public.absence_types
    ADD COLUMN requires_manager_approval BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE public.absence_requests
    ADD COLUMN validated_at TIMESTAMPTZ,
    ADD COLUMN validated_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    ADD COLUMN validation_comment TEXT
        CONSTRAINT absence_requests_validation_comment_length CHECK (length(validation_comment) <= 1000);

ALTER TABLE public.absence_requests
    DROP CONSTRAINT absence_requests_status_valid,
    ADD CONSTRAINT absence_requests_status_valid
        CHECK (status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED')),
    ADD CONSTRAINT absence_requests_validation_consistency CHECK ((validated_at IS NULL) = (validated_by IS NULL)),
    ADD CONSTRAINT absence_requests_no_self_validation CHECK (validated_by IS DISTINCT FROM employee_id);

CREATE INDEX idx_absence_requests_validated_by ON public.absence_requests(validated_by);

ALTER TABLE public.absence_events
    DROP CONSTRAINT absence_events_type_valid,
    ADD CONSTRAINT absence_events_type_valid CHECK (event_type IN (
        'ABSENCE_CREATED', 'ABSENCE_UPDATED', 'ABSENCE_SUBMITTED', 'ABSENCE_VALIDATED', 'ABSENCE_APPROVED', 'ABSENCE_REJECTED',
        'ABSENCE_CHANGES_REQUESTED', 'ABSENCE_CANCELLED', 'ABSENCE_ATTACHMENT_ADDED', 'ABSENCE_ATTACHMENT_REMOVED'
    ));

CREATE FUNCTION private.absence_status_label(p_status TEXT)
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
        ELSE p_status
    END;
$$;

-- Gestores da equipa que validam (abrangem o colaborador diretamente e não têm a decisão final).
CREATE FUNCTION private.absence_validators(p_employee_id UUID)
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
          AND private.profile_has_permission(ms.manager_id, 'TIMESHEET_ABSENCE_VALIDATE')
          AND NOT private.profile_has_permission(ms.manager_id, 'TIMESHEET_ABSENCE_APPROVE')
          AND private.scope_covers(ms.manager_id, p_employee_id)
    );
$$;

-- Quem decide: chefias com TIMESHEET_ABSENCE_APPROVE (dois níveis); sem nenhuma, a administração.
CREATE FUNCTION private.absence_deciders(p_employee_id UUID)
RETURNS UUID[]
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_deciders UUID[] := private.supervisors_with(p_employee_id, 'TIMESHEET_ABSENCE_APPROVE');
BEGIN
    IF cardinality(v_deciders) = 0 THEN
        v_deciders := private.active_admins(p_employee_id);
    END IF;
    RETURN v_deciders;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_absence_request(p_request_id UUID)
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
    v_next_status TEXT;
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
    WHERE employee_id = v_actor AND id <> p_request_id AND status IN ('SUBMITTED', 'PENDING_APPROVAL', 'APPROVED')
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

    v_next_status := CASE WHEN cardinality(private.absence_validators(v_actor)) > 0 THEN 'SUBMITTED' ELSE 'PENDING_APPROVAL' END;
    UPDATE public.absence_requests
    SET status = v_next_status, submitted_at = now(), validated_at = NULL, validated_by = NULL, validation_comment = NULL
    WHERE id = p_request_id;
    PERFORM private.log_absence_event(p_request_id, 'ABSENCE_SUBMITTED', 'status', 'Rascunho',
        private.absence_status_label(v_next_status),
        CASE WHEN v_next_status = 'PENDING_APPROVAL' THEN 'Sem gestor de equipa para validar: segue diretamente para decisão.' END);
END;
$$;

-- 1.º nível: o gestor da equipa valida e encaminha, ou devolve para correção. Não decide em definitivo,
-- exceto nos tipos que a empresa marcou como não exigindo a decisão do Manager.
CREATE FUNCTION public.validate_absence_request(p_request_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.absence_requests%ROWTYPE;
    v_requires_manager BOOLEAN;
    v_comment TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_ABSENCE_VALIDATE', 'Não tem permissão para validar pedidos de ausência.');
    IF p_decision IS NULL OR p_decision NOT IN ('VALIDATED', 'CHANGES_REQUESTED') THEN
        RAISE EXCEPTION 'Decisão inválida.';
    END IF;

    SELECT * INTO v_request FROM public.absence_requests WHERE id = p_request_id FOR UPDATE;
    IF FOUND AND v_request.employee_id = v_actor THEN
        RAISE EXCEPTION 'Não pode validar o seu próprio pedido de ausência.' USING ERRCODE = '42501';
    END IF;
    IF NOT FOUND OR NOT (public.has_permission('ADMIN_ACCESS') OR private.scope_covers(v_actor, v_request.employee_id)) THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'SUBMITTED' THEN
        RAISE EXCEPTION 'Só é possível validar pedidos a aguardar validação (estado atual: %).',
            lower(private.absence_status_label(v_request.status));
    END IF;

    IF p_decision = 'CHANGES_REQUESTED' THEN
        v_comment := private.required_text(p_comment, 5, 1000, 'Indique o que deve ser corrigido');
        UPDATE public.absence_requests SET status = 'DRAFT', submitted_at = NULL, decision_comment = v_comment WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CHANGES_REQUESTED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('DRAFT'), v_comment);
        RETURN;
    END IF;

    v_comment := private.optional_text(p_comment, 1000, 'O parecer');
    SELECT requires_manager_approval INTO v_requires_manager FROM public.absence_types WHERE id = v_request.absence_type_id;

    IF v_requires_manager THEN
        UPDATE public.absence_requests
        SET status = 'PENDING_APPROVAL', validated_at = now(), validated_by = v_actor, validation_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_VALIDATED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('PENDING_APPROVAL'), v_comment);
    ELSE
        UPDATE public.absence_requests
        SET status = 'APPROVED', validated_at = now(), validated_by = v_actor, validation_comment = v_comment,
            decided_at = now(), decided_by = v_actor, decision_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_APPROVED', 'status',
            private.absence_status_label('SUBMITTED'), private.absence_status_label('APPROVED'),
            'Aprovado na validação (este tipo não exige decisão do Manager)' || coalesce('. ' || v_comment, ''));
    END IF;
END;
$$;

-- 2.º nível: quem decide (TIMESHEET_ABSENCE_APPROVE) dentro da supervisão, ou a administração.
-- Um pedido a aguardar validação só pode ser decidido se já não houver gestor ativo para o validar.
CREATE OR REPLACE FUNCTION public.decide_absence_request(p_request_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
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
    IF NOT FOUND OR NOT (public.has_permission('ADMIN_ACCESS') OR private.supervises(v_actor, v_request.employee_id)) THEN
        RAISE EXCEPTION 'Pedido de ausência não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status = 'SUBMITTED' AND cardinality(private.absence_validators(v_request.employee_id)) > 0 THEN
        RAISE EXCEPTION 'O pedido aguarda a validação do gestor da equipa.';
    END IF;
    IF v_request.status NOT IN ('SUBMITTED', 'PENDING_APPROVAL') THEN
        RAISE EXCEPTION 'Apenas pedidos pendentes podem ser decididos.';
    END IF;

    v_comment := CASE WHEN p_decision = 'APPROVED'
        THEN private.optional_text(p_comment, 1000, 'O comentário')
        ELSE private.required_text(p_comment, 5, 1000,
            CASE p_decision WHEN 'REJECTED' THEN 'Indique o motivo da rejeição' ELSE 'Indique o que deve ser corrigido' END) END;

    IF p_decision = 'CHANGES_REQUESTED' THEN
        UPDATE public.absence_requests
        SET status = 'DRAFT', submitted_at = NULL, decision_comment = v_comment,
            validated_at = NULL, validated_by = NULL, validation_comment = NULL
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CHANGES_REQUESTED', 'status',
            private.absence_status_label(v_request.status), private.absence_status_label('DRAFT'), v_comment);
    ELSE
        UPDATE public.absence_requests
        SET status = p_decision, decided_at = now(), decided_by = v_actor, decision_comment = v_comment
        WHERE id = p_request_id;
        PERFORM private.log_absence_event(p_request_id,
            CASE p_decision WHEN 'APPROVED' THEN 'ABSENCE_APPROVED' ELSE 'ABSENCE_REJECTED' END,
            'status', private.absence_status_label(v_request.status), private.absence_status_label(p_decision), v_comment);
    END IF;
END;
$$;

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
    ELSIF v_request.status IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL') THEN
        v_reason := private.optional_text(p_reason, 1000, 'O motivo');
    ELSE
        RAISE EXCEPTION 'Este pedido já não pode ser cancelado.';
    END IF;
    UPDATE public.absence_requests SET status = 'CANCELLED', cancelled_at = now() WHERE id = p_request_id;
    PERFORM private.log_absence_event(p_request_id, 'ABSENCE_CANCELLED', 'status',
        private.absence_status_label(v_request.status), private.absence_status_label('CANCELLED'), v_reason);
END;
$$;

-- Destinatários por etapa: validação → gestor da equipa; decisão → Manager; resultado → colaborador
-- (e o gestor que validou). O Manager só recebe o que exige a sua decisão.
CREATE OR REPLACE FUNCTION private.notify_absence_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_request public.absence_requests%ROWTYPE;
    v_label TEXT;
    v_employee_name TEXT;
    v_team_link CONSTANT TEXT := '/timesheet/absences?tab=TEAM';
    v_own_link CONSTANT TEXT := '/timesheet/absences';
BEGIN
    SELECT * INTO v_request FROM public.absence_requests WHERE id = NEW.absence_request_id;
    SELECT full_name INTO v_employee_name FROM public.profiles WHERE id = v_request.employee_id;
    v_label := (SELECT name FROM public.absence_types WHERE id = v_request.absence_type_id)
        || ' · ' || private.absence_period_label(v_request.start_date, v_request.end_date);

    IF NEW.event_type = 'ABSENCE_SUBMITTED' AND v_request.status = 'SUBMITTED' THEN
        PERFORM private.notify(private.absence_validators(v_request.employee_id), NEW.actor_id,
            'ABSENCE_VALIDATION_REQUIRED', 'Pedido de ausência para validação', v_employee_name || ': ' || v_label, v_team_link);
    ELSIF (NEW.event_type = 'ABSENCE_SUBMITTED' AND v_request.status = 'PENDING_APPROVAL')
       OR (NEW.event_type = 'ABSENCE_VALIDATED' AND v_request.status = 'PENDING_APPROVAL') THEN
        PERFORM private.notify(private.absence_deciders(v_request.employee_id), NEW.actor_id,
            'ABSENCE_APPROVAL_REQUIRED', 'Pedido de ausência para decisão',
            v_employee_name || ': ' || v_label
            || CASE WHEN NEW.event_type = 'ABSENCE_VALIDATED' THEN ' (validado por ' || coalesce(NEW.actor_name, 'gestor') || ')' ELSE '' END,
            v_team_link);
        IF NEW.event_type = 'ABSENCE_VALIDATED' THEN
            PERFORM private.notify(ARRAY[v_request.employee_id], NEW.actor_id, 'ABSENCE_VALIDATED',
                'Pedido de ausência validado', v_label || ': aguarda a decisão do Manager.', v_own_link);
        END IF;
    ELSIF NEW.event_type IN ('ABSENCE_APPROVED', 'ABSENCE_REJECTED', 'ABSENCE_CHANGES_REQUESTED') THEN
        PERFORM private.notify(ARRAY[v_request.employee_id], NEW.actor_id,
            CASE NEW.event_type WHEN 'ABSENCE_APPROVED' THEN 'ABSENCE_APPROVED'
                                WHEN 'ABSENCE_REJECTED' THEN 'ABSENCE_REJECTED'
                                ELSE 'ABSENCE_CHANGES_REQUESTED' END,
            CASE NEW.event_type WHEN 'ABSENCE_APPROVED' THEN 'Ausência aprovada'
                                WHEN 'ABSENCE_REJECTED' THEN 'Ausência rejeitada'
                                ELSE 'Pedido de ausência devolvido para correção' END,
            v_label || CASE WHEN NEW.note IS NOT NULL THEN ': ' || NEW.note ELSE '' END, v_own_link);
        -- O gestor que validou acompanha a decisão final da sua equipa.
        IF NEW.event_type IN ('ABSENCE_APPROVED', 'ABSENCE_REJECTED') AND v_request.validated_by IS NOT NULL THEN
            PERFORM private.notify(ARRAY[v_request.validated_by], NEW.actor_id, 'ABSENCE_DECIDED',
                CASE NEW.event_type WHEN 'ABSENCE_APPROVED' THEN 'Ausência da equipa aprovada' ELSE 'Ausência da equipa rejeitada' END,
                v_employee_name || ': ' || v_label, v_team_link);
        END IF;
    ELSIF NEW.event_type = 'ABSENCE_CANCELLED' THEN
        PERFORM private.notify(
            CASE NEW.old_value
                WHEN private.absence_status_label('SUBMITTED') THEN private.absence_validators(v_request.employee_id)
                WHEN private.absence_status_label('PENDING_APPROVAL') THEN private.absence_deciders(v_request.employee_id)
                WHEN private.absence_status_label('APPROVED')
                    THEN private.operational_leads(v_request.employee_id) || v_request.decided_by
                ELSE ARRAY[]::UUID[]
            END,
            NEW.actor_id, 'ABSENCE_CANCELLED', 'Pedido de ausência cancelado', v_employee_name || ': ' || v_label, v_team_link);
    END IF;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 2. APROVAÇÃO DE OPORTUNIDADES
-- =============================================================================
-- NOT_REQUIRED: registada por quem tem poder de aprovação. NOT_SUBMITTED: ainda sem pedido.
ALTER TABLE public.opportunities
    ADD COLUMN approval_status VARCHAR(20) NOT NULL DEFAULT 'NOT_SUBMITTED'
        CONSTRAINT opportunities_approval_status_valid
        CHECK (approval_status IN ('NOT_REQUIRED', 'NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'));

CREATE INDEX idx_opportunities_approval_status ON public.opportunities(approval_status);

CREATE SEQUENCE public.approval_request_number_seq;

-- Pedido de aprovação explícito: quem pede, o quê, valor, estado, decisão, quem decidiu e quando.
-- O histórico do pedido fica em opportunity_events e a auditoria em audit_events.
CREATE TABLE public.approval_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(20) NOT NULL UNIQUE
        DEFAULT ('APR-' || lpad(nextval('public.approval_request_number_seq')::text, 5, '0')),
    request_type VARCHAR(30) NOT NULL DEFAULT 'OPPORTUNITY_APPROVAL'
        CONSTRAINT approval_requests_type_valid CHECK (request_type IN ('OPPORTUNITY_APPROVAL')),
    opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE RESTRICT,
    requested_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    title VARCHAR(300) NOT NULL,
    amount NUMERIC(14, 2) CONSTRAINT approval_requests_amount_positive CHECK (amount >= 0),
    currency CHAR(3) CONSTRAINT approval_requests_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    justification TEXT NOT NULL
        CONSTRAINT approval_requests_justification_length CHECK (length(btrim(justification)) BETWEEN 5 AND 2000),
    status VARCHAR(20) NOT NULL DEFAULT 'PENDING'
        CONSTRAINT approval_requests_status_valid CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCELLED')),
    decided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    decided_at TIMESTAMPTZ,
    decision_comment TEXT CONSTRAINT approval_requests_comment_length CHECK (length(decision_comment) <= 1000),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT approval_requests_target CHECK (request_type <> 'OPPORTUNITY_APPROVAL' OR opportunity_id IS NOT NULL),
    CONSTRAINT approval_requests_decision_consistency
        CHECK ((status IN ('APPROVED', 'REJECTED')) = (decided_by IS NOT NULL AND decided_at IS NOT NULL)),
    CONSTRAINT approval_requests_no_self_decision CHECK (decided_by IS DISTINCT FROM requested_by),
    CONSTRAINT approval_requests_rejection_reason
        CHECK (status <> 'REJECTED' OR length(btrim(coalesce(decision_comment, ''))) >= 5)
);

-- Um único pedido pendente por oportunidade.
CREATE UNIQUE INDEX approval_requests_one_pending ON public.approval_requests(opportunity_id) WHERE status = 'PENDING';
CREATE INDEX idx_approval_requests_status ON public.approval_requests(status, created_at);
CREATE INDEX idx_approval_requests_requested_by ON public.approval_requests(requested_by);
CREATE INDEX idx_approval_requests_decided_by ON public.approval_requests(decided_by);

CREATE TRIGGER trg_approval_requests_updated_at BEFORE UPDATE ON public.approval_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

ALTER TABLE public.opportunity_events
    DROP CONSTRAINT opportunity_events_type_valid,
    ADD CONSTRAINT opportunity_events_type_valid CHECK (event_type IN (
        'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED',
        'OPPORTUNITY_MEMBER_ADDED', 'OPPORTUNITY_MEMBER_REMOVED', 'OPPORTUNITY_COMMENT_ADDED',
        'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'OPPORTUNITY_CANCELLED', 'OPPORTUNITY_REOPENED',
        'OPPORTUNITY_ATTACHMENT_ADDED', 'OPPORTUNITY_ATTACHMENT_REMOVED',
        'OPPORTUNITY_APPROVAL_REQUESTED', 'OPPORTUNITY_APPROVED', 'OPPORTUNITY_APPROVAL_REJECTED', 'OPPORTUNITY_APPROVAL_CANCELLED'
    ));

CREATE FUNCTION private.approval_status_label(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_status
        WHEN 'NOT_REQUIRED' THEN 'Não exige aprovação'
        WHEN 'NOT_SUBMITTED' THEN 'Por pedir'
        WHEN 'PENDING' THEN 'Pendente'
        WHEN 'APPROVED' THEN 'Aprovada'
        WHEN 'REJECTED' THEN 'Rejeitada'
        WHEN 'CANCELLED' THEN 'Anulado'
        ELSE p_status
    END;
$$;

-- Regras da aprovação aplicadas a qualquer origem de escrita:
--   * a criação nunca equivale a aprovação (exceto se quem regista tem poder de aprovação);
--   * sem aprovação, a oportunidade não avança para Proposta, Negociação ou Ganha;
--   * os valores ficam fixos enquanto o pedido está pendente;
--   * fechar a oportunidade (perdida/cancelada) anula o pedido pendente.
CREATE FUNCTION private.guard_opportunity_approval()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        NEW.approval_status := CASE WHEN public.has_permission('TIMESHEET_OPPORTUNITY_APPROVE') THEN 'NOT_REQUIRED' ELSE 'NOT_SUBMITTED' END;
        RETURN NEW;
    END IF;

    IF NEW.status IS DISTINCT FROM OLD.status
       AND NEW.status IN ('PROPOSAL', 'NEGOTIATION', 'WON')
       AND NEW.approval_status NOT IN ('APPROVED', 'NOT_REQUIRED') THEN
        RAISE EXCEPTION 'A oportunidade precisa da aprovação do Manager antes de avançar para %.',
            private.opportunity_status_label(NEW.status);
    END IF;

    IF OLD.approval_status = 'PENDING' AND NEW.approval_status = 'PENDING'
       AND (NEW.initial_value, NEW.estimated_value, NEW.currency) IS DISTINCT FROM (OLD.initial_value, OLD.estimated_value, OLD.currency) THEN
        RAISE EXCEPTION 'Os valores não podem ser alterados enquanto o pedido de aprovação está pendente.';
    END IF;

    IF NEW.status IN ('LOST', 'CANCELLED') AND OLD.status NOT IN ('LOST', 'CANCELLED') AND OLD.approval_status = 'PENDING' THEN
        UPDATE public.approval_requests
        SET status = 'CANCELLED', decision_comment = 'Anulado: a oportunidade foi ' || lower(private.opportunity_status_label(NEW.status)) || '.'
        WHERE opportunity_id = NEW.id AND status = 'PENDING';
        NEW.approval_status := 'NOT_SUBMITTED';
        PERFORM private.log_opportunity_event(NEW.id, 'OPPORTUNITY_APPROVAL_CANCELLED', 'approval',
            private.approval_status_label('PENDING'), private.approval_status_label('CANCELLED'),
            'Pedido anulado porque a oportunidade foi fechada.');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_opportunities_approval_guard
    BEFORE INSERT OR UPDATE ON public.opportunities
    FOR EACH ROW EXECUTE FUNCTION private.guard_opportunity_approval();

CREATE FUNCTION public.request_opportunity_approval(p_opportunity_id UUID, p_justification TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_opportunity public.opportunities%ROWTYPE := private.lock_opportunity(p_opportunity_id);
    v_justification TEXT;
    v_request_id UUID;
    v_reference TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_UPDATE', 'Não tem permissão para pedir aprovações.');
    IF NOT private.manages_opportunity(v_opportunity) THEN
        RAISE EXCEPTION 'Só o responsável ou quem gere a oportunidade pode pedir a aprovação.' USING ERRCODE = '42501';
    END IF;
    IF v_opportunity.status NOT IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION') THEN
        RAISE EXCEPTION 'Só é possível pedir a aprovação de oportunidades em curso.';
    END IF;
    IF v_opportunity.approval_status = 'PENDING' THEN
        RAISE EXCEPTION 'Já existe um pedido de aprovação pendente para esta oportunidade.';
    ELSIF v_opportunity.approval_status IN ('APPROVED', 'NOT_REQUIRED') THEN
        RAISE EXCEPTION 'Esta oportunidade já está aprovada ou não exige aprovação.';
    END IF;
    v_justification := private.required_text(p_justification, 5, 2000, 'Explique o que deve ser aprovado');

    INSERT INTO public.approval_requests (request_type, opportunity_id, requested_by, title, amount, currency, justification)
    VALUES ('OPPORTUNITY_APPROVAL', p_opportunity_id, v_actor, left(v_opportunity.reference || ' — ' || v_opportunity.title, 300),
            v_opportunity.estimated_value, v_opportunity.currency, v_justification)
    RETURNING id, reference INTO v_request_id, v_reference;

    UPDATE public.opportunities SET approval_status = 'PENDING' WHERE id = p_opportunity_id;
    PERFORM private.log_opportunity_event(p_opportunity_id, 'OPPORTUNITY_APPROVAL_REQUESTED', 'approval',
        private.approval_status_label(v_opportunity.approval_status), private.approval_status_label('PENDING'),
        v_reference || ': ' || v_justification);
    RETURN v_request_id;
END;
$$;

-- Decisão do Manager (ou da administração). Nunca por quem pediu nem pelo responsável da oportunidade.
CREATE FUNCTION public.decide_opportunity_approval(p_request_id UUID, p_decision TEXT, p_comment TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.approval_requests%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
    v_comment TEXT;
BEGIN
    PERFORM private.require_permission('TIMESHEET_OPPORTUNITY_APPROVE', 'Não tem permissão para decidir pedidos de aprovação.');
    IF p_decision IS NULL OR p_decision NOT IN ('APPROVED', 'REJECTED') THEN
        RAISE EXCEPTION 'Decisão inválida.';
    END IF;

    SELECT * INTO v_request FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido de aprovação não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_opportunity FROM public.opportunities WHERE id = v_request.opportunity_id FOR UPDATE;

    IF v_request.requested_by = v_actor OR v_opportunity.owner_id = v_actor THEN
        RAISE EXCEPTION 'Não pode decidir um pedido seu nem de uma oportunidade de que é responsável.' USING ERRCODE = '42501';
    END IF;
    IF NOT (public.has_permission('ADMIN_ACCESS') OR private.supervises(v_actor, v_opportunity.owner_id)) THEN
        RAISE EXCEPTION 'Pedido de aprovação não encontrado ou fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Este pedido já foi decidido ou anulado.';
    END IF;

    v_comment := CASE WHEN p_decision = 'APPROVED'
        THEN private.optional_text(p_comment, 1000, 'O comentário')
        ELSE private.required_text(p_comment, 5, 1000, 'Indique o motivo da rejeição') END;

    UPDATE public.approval_requests
    SET status = p_decision, decided_by = v_actor, decided_at = now(), decision_comment = v_comment
    WHERE id = p_request_id;
    UPDATE public.opportunities SET approval_status = p_decision WHERE id = v_opportunity.id;
    PERFORM private.log_opportunity_event(v_opportunity.id,
        CASE p_decision WHEN 'APPROVED' THEN 'OPPORTUNITY_APPROVED' ELSE 'OPPORTUNITY_APPROVAL_REJECTED' END,
        'approval', private.approval_status_label('PENDING'), private.approval_status_label(p_decision),
        v_request.reference || coalesce(': ' || v_comment, ''));
END;
$$;

CREATE FUNCTION public.cancel_opportunity_approval(p_request_id UUID, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_request public.approval_requests%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
    v_reason TEXT := private.optional_text(p_reason, 1000, 'O motivo');
BEGIN
    SELECT * INTO v_request FROM public.approval_requests WHERE id = p_request_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido de aprovação não encontrado.' USING ERRCODE = '42501';
    END IF;
    v_opportunity := private.lock_opportunity(v_request.opportunity_id);
    IF NOT (v_request.requested_by = v_actor OR private.manages_opportunity(v_opportunity)) THEN
        RAISE EXCEPTION 'Pedido de aprovação não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_request.status <> 'PENDING' THEN
        RAISE EXCEPTION 'Este pedido já foi decidido ou anulado.';
    END IF;
    UPDATE public.approval_requests SET status = 'CANCELLED', decision_comment = v_reason WHERE id = p_request_id;
    UPDATE public.opportunities SET approval_status = 'NOT_SUBMITTED' WHERE id = v_opportunity.id;
    PERFORM private.log_opportunity_event(v_opportunity.id, 'OPPORTUNITY_APPROVAL_CANCELLED', 'approval',
        private.approval_status_label('PENDING'), private.approval_status_label('CANCELLED'),
        v_request.reference || coalesce(': ' || v_reason, ''));
END;
$$;

CREATE OR REPLACE FUNCTION private.notify_opportunity_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_opportunity public.opportunities%ROWTYPE;
    v_label TEXT;
    v_link TEXT;
    v_approvers UUID[];
    v_requester UUID;
BEGIN
    SELECT * INTO v_opportunity FROM public.opportunities WHERE id = NEW.opportunity_id;
    v_label := v_opportunity.reference || ' — ' || v_opportunity.title;
    v_link := '/timesheet/opportunities/' || v_opportunity.id;
    CASE NEW.event_type
        WHEN 'OPPORTUNITY_CREATED', 'OPPORTUNITY_OWNER_CHANGED' THEN
            PERFORM private.notify(ARRAY[v_opportunity.owner_id], NEW.actor_id, 'OPPORTUNITY_ASSIGNED',
                'Oportunidade atribuída', v_label, v_link);
        WHEN 'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'OPPORTUNITY_CANCELLED', 'OPPORTUNITY_REOPENED' THEN
            PERFORM private.notify(ARRAY[v_opportunity.owner_id, v_opportunity.created_by], NEW.actor_id,
                'OPPORTUNITY_UPDATED', 'Oportunidade ' || lower(private.opportunity_status_label(v_opportunity.status)),
                v_label || CASE WHEN NEW.note IS NOT NULL THEN ': ' || NEW.note ELSE '' END, v_link);
        WHEN 'OPPORTUNITY_COMMENT_ADDED' THEN
            PERFORM private.notify(ARRAY[v_opportunity.owner_id], NEW.actor_id, 'OPPORTUNITY_COMMENT',
                'Novo comentário numa oportunidade', v_label, v_link);
        WHEN 'OPPORTUNITY_APPROVAL_REQUESTED' THEN
            v_approvers := private.supervisors_with(v_opportunity.owner_id, 'TIMESHEET_OPPORTUNITY_APPROVE');
            IF cardinality(v_approvers) = 0 THEN
                v_approvers := private.active_admins(NEW.actor_id);
            END IF;
            PERFORM private.notify(v_approvers, NEW.actor_id, 'OPPORTUNITY_APPROVAL_REQUIRED',
                'Oportunidade para aprovação',
                v_label || CASE WHEN v_opportunity.estimated_value IS NULL THEN ''
                                ELSE ' · ' || to_char(v_opportunity.estimated_value, 'FM999G999G999G990D00') || ' ' || v_opportunity.currency END,
                v_link);
        WHEN 'OPPORTUNITY_APPROVED', 'OPPORTUNITY_APPROVAL_REJECTED' THEN
            SELECT requested_by INTO v_requester FROM public.approval_requests
            WHERE opportunity_id = v_opportunity.id ORDER BY created_at DESC LIMIT 1;
            PERFORM private.notify(ARRAY[v_requester, v_opportunity.owner_id], NEW.actor_id,
                CASE NEW.event_type WHEN 'OPPORTUNITY_APPROVED' THEN 'OPPORTUNITY_APPROVED' ELSE 'OPPORTUNITY_REJECTED' END,
                CASE NEW.event_type WHEN 'OPPORTUNITY_APPROVED' THEN 'Oportunidade aprovada' ELSE 'Oportunidade não aprovada' END,
                v_label || CASE WHEN NEW.note IS NOT NULL THEN ': ' || NEW.note ELSE '' END, v_link);
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. TAREFAS: ACOMPANHAMENTO E ESCALONAMENTO
-- =============================================================================
ALTER TABLE public.tasks
    -- Definido por quem cria: a conclusão é acompanhada (validada) por quem supervisiona o gestor.
    ADD COLUMN requires_manager_review BOOLEAN NOT NULL DEFAULT false,
    ADD COLUMN reviewed_at TIMESTAMPTZ,
    ADD COLUMN reviewed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    ADD COLUMN review_note TEXT CONSTRAINT tasks_review_note_length CHECK (length(review_note) <= 1000),
    ADD CONSTRAINT tasks_review_consistency CHECK (reviewed_at IS NULL OR status = 'COMPLETED');

CREATE INDEX idx_tasks_review_pending ON public.tasks(status, reviewed_at) WHERE status = 'COMPLETED';
CREATE INDEX idx_tasks_reviewed_by ON public.tasks(reviewed_by);

ALTER TABLE public.task_events
    DROP CONSTRAINT task_events_type_valid,
    ADD CONSTRAINT task_events_type_valid CHECK (event_type IN (
        'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_REASSIGNED', 'TASK_UNASSIGNED', 'TASK_STARTED', 'TASK_BLOCKED',
        'TASK_UNBLOCKED', 'TASK_UPDATED', 'TASK_PRIORITY_CHANGED', 'TASK_DEADLINE_CHANGED', 'TASK_COMMENT_ADDED',
        'TASK_COMPLETED', 'TASK_COMPLETED_LATE', 'TASK_REOPENED', 'TASK_CANCELLED',
        'TASK_ATTACHMENT_ADDED', 'TASK_ATTACHMENT_REMOVED', 'TASK_REVIEWED'
    ));

-- Uma tarefa reaberta volta a precisar de acompanhamento.
CREATE FUNCTION private.reset_task_review()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF NEW.status <> 'COMPLETED' THEN
        NEW.reviewed_at := NULL;
        NEW.reviewed_by := NULL;
        NEW.review_note := NULL;
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_tasks_review_reset
    BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION private.reset_task_review();

-- create_task ganha p_requires_manager_review. O criador e o responsável continuam a ser campos
-- distintos: uma tarefa que o Manager (ou o gestor) cria para si próprio fica com ele como responsável.
DROP FUNCTION public.create_task(TEXT, TEXT, TEXT, UUID, TIMESTAMPTZ, DATE, INTEGER, UUID, UUID, UUID, UUID);

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
    p_meeting_id UUID DEFAULT NULL,
    p_requires_manager_review BOOLEAN DEFAULT false
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
                              start_date, due_at, estimated_minutes, parent_task_id, opportunity_id, meeting_id,
                              requires_manager_review)
    VALUES (btrim(coalesce(p_title, '')), btrim(coalesce(p_description, '')), v_actor, p_assignee_id, v_department_id,
            p_priority, CASE WHEN p_assignee_id IS NULL THEN 'PLANNED' ELSE 'ASSIGNED' END,
            p_start_date, p_due_at, p_estimated_minutes, p_parent_task_id, p_opportunity_id, p_meeting_id,
            coalesce(p_requires_manager_review, false))
    RETURNING id, reference INTO v_task_id, v_reference;

    PERFORM private.log_task_event(v_task_id, 'TASK_CREATED', NULL, NULL, v_reference,
        CASE WHEN p_parent_task_id IS NOT NULL THEN 'Tarefa adicional de ' || v_parent.reference END);
    IF p_assignee_id IS NOT NULL THEN
        PERFORM private.log_task_event(v_task_id, 'TASK_ASSIGNED', 'assignee', 'Sem responsável', private.profile_label(p_assignee_id), NULL);
    END IF;
    RETURN v_task_id;
END;
$$;

-- Acompanhamento da conclusão: o gestor da tarefa valida; nas tarefas que exigem acompanhamento do
-- Manager, valida quem supervisiona (TEAM_SUPERVISE) ou a administração. Nunca o próprio responsável.
CREATE FUNCTION public.review_task(p_task_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := private.require_actor();
    v_task public.tasks%ROWTYPE := private.lock_task(p_task_id);
    v_note TEXT := private.optional_text(p_note, 1000, 'A nota');
BEGIN
    PERFORM private.require_permission('TIMESHEET_TASK_ASSIGN', 'Não tem permissão para acompanhar tarefas.');
    IF v_task.assignee_id = v_actor THEN
        RAISE EXCEPTION 'Não pode validar a conclusão de uma tarefa sua.' USING ERRCODE = '42501';
    END IF;
    IF v_task.requires_manager_review THEN
        IF NOT (public.has_permission('ADMIN_ACCESS')
                OR (public.has_permission('TEAM_SUPERVISE') AND private.supervises(v_actor, v_task.assignee_id))) THEN
            RAISE EXCEPTION 'Esta tarefa exige o acompanhamento do Manager.' USING ERRCODE = '42501';
        END IF;
    ELSIF NOT private.manages_task(v_task) THEN
        RAISE EXCEPTION 'Não pode acompanhar esta tarefa: está fora do seu âmbito.' USING ERRCODE = '42501';
    END IF;
    IF v_task.status <> 'COMPLETED' THEN
        RAISE EXCEPTION 'Só é possível validar tarefas concluídas.';
    END IF;
    IF v_task.reviewed_at IS NOT NULL THEN
        RAISE EXCEPTION 'A conclusão desta tarefa já foi validada.';
    END IF;
    UPDATE public.tasks SET reviewed_at = now(), reviewed_by = v_actor, review_note = v_note WHERE id = p_task_id;
    PERFORM private.log_task_event(p_task_id, 'TASK_REVIEWED', 'review', NULL, 'Conclusão validada', v_note);
END;
$$;

-- Destinatários: responsável e criador como até aqui; o gestor da equipa recebe a operação da equipa;
-- o Manager só recebe as conclusões que exigem o seu acompanhamento.
CREATE OR REPLACE FUNCTION private.notify_task_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE;
    v_label TEXT;
    v_link TEXT;
    v_leads UUID[] := ARRAY[]::UUID[];
    v_reviewers UUID[] := ARRAY[]::UUID[];
    v_assignee_name TEXT;
BEGIN
    SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;
    v_label := v_task.reference || ' — ' || v_task.title;
    v_link := '/timesheet/tasks/' || v_task.id;
    IF v_task.assignee_id IS NOT NULL THEN
        v_leads := private.operational_leads(v_task.assignee_id);
        SELECT full_name INTO v_assignee_name FROM public.profiles WHERE id = v_task.assignee_id;
    END IF;

    CASE NEW.event_type
        WHEN 'TASK_ASSIGNED', 'TASK_REASSIGNED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_ASSIGNED', 'Nova tarefa atribuída',
                v_label || CASE WHEN v_task.due_at IS NULL THEN '' ELSE ' · prazo ' || private.local_datetime_label(v_task.due_at) END,
                v_link);
            -- Trabalho atribuído por outra pessoa a alguém da equipa: o gestor da equipa fica a saber.
            PERFORM private.notify(ARRAY(SELECT unnest(v_leads) EXCEPT SELECT v_task.assignee_id), NEW.actor_id,
                'TEAM_TASK_ASSIGNED', 'Tarefa atribuída na sua equipa', v_label || ' · ' || coalesce(v_assignee_name, ''), v_link);
        WHEN 'TASK_BLOCKED' THEN
            PERFORM private.notify(ARRAY[v_task.created_by] || v_leads, NEW.actor_id, 'TASK_BLOCKED', 'Tarefa bloqueada',
                v_label || ': ' || coalesce(NEW.note, ''), v_link);
        WHEN 'TASK_COMPLETED', 'TASK_COMPLETED_LATE' THEN
            IF v_task.requires_manager_review AND v_task.assignee_id IS NOT NULL THEN
                v_reviewers := private.supervisors_with(v_task.assignee_id, 'TEAM_SUPERVISE');
                PERFORM private.notify(v_reviewers, NEW.actor_id, 'TASK_REVIEW_REQUIRED', 'Tarefa concluída para acompanhamento',
                    v_label || ' · ' || coalesce(v_assignee_name, '')
                    || CASE WHEN NEW.event_type = 'TASK_COMPLETED_LATE' THEN ' (concluída com atraso)' ELSE '' END, v_link);
            END IF;
            PERFORM private.notify(ARRAY(SELECT v_task.created_by EXCEPT SELECT unnest(v_reviewers)), NEW.actor_id, 'TASK_COMPLETED',
                CASE WHEN NEW.event_type = 'TASK_COMPLETED_LATE' THEN 'Tarefa concluída com atraso' ELSE 'Tarefa concluída' END,
                v_label, v_link);
            PERFORM private.notify(ARRAY(SELECT unnest(v_leads) EXCEPT SELECT v_task.created_by EXCEPT SELECT unnest(v_reviewers)),
                NEW.actor_id, 'TEAM_TASK_COMPLETED',
                CASE WHEN NEW.event_type = 'TASK_COMPLETED_LATE' THEN 'Tarefa da equipa concluída com atraso' ELSE 'Tarefa da equipa concluída' END,
                v_label || ' · ' || coalesce(v_assignee_name, ''), v_link);
        WHEN 'TASK_REOPENED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_REOPENED', 'Tarefa reaberta',
                v_label || ': ' || coalesce(NEW.note, ''), v_link);
        WHEN 'TASK_CANCELLED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_CANCELLED', 'Tarefa cancelada',
                v_label || ': ' || coalesce(NEW.note, ''), v_link);
        WHEN 'TASK_DEADLINE_CHANGED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_UPDATED', 'Prazo da tarefa alterado',
                v_label || ': ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—'), v_link);
        WHEN 'TASK_PRIORITY_CHANGED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_UPDATED', 'Prioridade da tarefa alterada',
                v_label || ': ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—'), v_link);
        WHEN 'TASK_COMMENT_ADDED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id, v_task.created_by], NEW.actor_id, 'TASK_COMMENT',
                'Novo comentário numa tarefa', v_label, v_link);
        WHEN 'TASK_REVIEWED' THEN
            PERFORM private.notify(ARRAY[v_task.assignee_id], NEW.actor_id, 'TASK_REVIEWED', 'Conclusão validada',
                v_label || CASE WHEN NEW.note IS NOT NULL THEN ': ' || NEW.note ELSE '' END, v_link);
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 4. REUNIÕES: PARTICIPANTES DENTRO DO ÂMBITO
-- =============================================================================
-- Pode ser convidado: alguém da equipa de quem organiza (dois níveis para o Manager), as chefias de quem
-- organiza, os envolvidos na tarefa ou oportunidade ligada, ou qualquer pessoa pela administração.
CREATE FUNCTION private.can_invite_to_meeting(p_profile_id UUID, p_meeting_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('ADMIN_ACCESS')
        OR private.manages_work_of(p_profile_id)
        OR private.supervises(p_profile_id, public.get_current_profile_id())
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

CREATE OR REPLACE FUNCTION private.set_meeting_participants(p_meeting_id UUID, p_organizer_id UUID, p_participant_ids UUID[], p_log BOOLEAN)
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
    v_outside TEXT;
BEGIN
    IF cardinality(v_participants) > 50 THEN
        RAISE EXCEPTION 'Uma reunião não pode ter mais de 50 participantes.';
    END IF;
    IF EXISTS (SELECT 1 FROM unnest(v_participants) AS participant WHERE NOT private.is_active_profile(participant)) THEN
        RAISE EXCEPTION 'Todos os participantes têm de ser utilizadores ativos.';
    END IF;
    -- Só os novos convidados são validados (quem já participa mantém-se).
    SELECT string_agg(p.full_name, ', ' ORDER BY p.full_name) INTO v_outside
    FROM unnest(v_participants) AS participant
    JOIN public.profiles p ON p.id = participant
    WHERE NOT EXISTS (SELECT 1 FROM public.meeting_participants mp WHERE mp.meeting_id = p_meeting_id AND mp.profile_id = participant)
      AND NOT private.can_invite_to_meeting(participant, p_meeting_id);
    IF v_outside IS NOT NULL THEN
        RAISE EXCEPTION 'Fora do seu âmbito: %. Convide a sua equipa, as suas chefias ou os envolvidos no registo relacionado.', v_outside
            USING ERRCODE = '42501';
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
            PERFORM private.notify(ARRAY[v_profile_id], public.get_current_profile_id(), 'MEETING_CANCELLED',
                'Retirado de uma reunião', v_title, NULL);
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
            PERFORM private.notify(ARRAY[v_profile_id], public.get_current_profile_id(), 'MEETING_INVITED',
                'Convite para reunião', v_title, '/timesheet/meetings/' || p_meeting_id);
        END IF;
    END LOOP;
END;
$$;

-- Reagendamento, cancelamento e mudança de local ou ligação notificam os participantes.
CREATE OR REPLACE FUNCTION private.notify_meeting_event()
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
    IF NOT (NEW.event_type IN ('MEETING_CREATED', 'MEETING_RESCHEDULED', 'MEETING_CANCELLED')
            OR (NEW.event_type = 'MEETING_UPDATED' AND NEW.field IN ('location', 'meeting_url'))) THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_meeting FROM public.meetings WHERE id = NEW.meeting_id;
    v_participants := ARRAY(SELECT profile_id FROM public.meeting_participants WHERE meeting_id = NEW.meeting_id)
        || v_meeting.organizer_id;
    v_when := private.local_datetime_label(v_meeting.starts_at);

    PERFORM private.notify(v_participants, NEW.actor_id,
        CASE NEW.event_type WHEN 'MEETING_CREATED' THEN 'MEETING_INVITED'
                            WHEN 'MEETING_CANCELLED' THEN 'MEETING_CANCELLED'
                            ELSE 'MEETING_UPDATED' END,
        CASE NEW.event_type WHEN 'MEETING_CREATED' THEN 'Convite para reunião'
                            WHEN 'MEETING_RESCHEDULED' THEN 'Reunião reagendada'
                            WHEN 'MEETING_CANCELLED' THEN 'Reunião cancelada'
                            ELSE CASE NEW.field WHEN 'location' THEN 'Local da reunião alterado' ELSE 'Ligação da reunião alterada' END END,
        v_meeting.title || ' · ' || v_when
        || CASE WHEN NEW.event_type = 'MEETING_CANCELLED' THEN ': ' || coalesce(NEW.note, '')
                WHEN NEW.event_type = 'MEETING_UPDATED' THEN ': ' || coalesce(NEW.new_value, 'removido')
                ELSE '' END,
        '/timesheet/meetings/' || v_meeting.id);
    RETURN NEW;
END;
$$;

-- =============================================================================
-- 5. ALERTAS DE PRAZO (a pedido, sem agendador; sem duplicados)
-- =============================================================================
-- Chamado pela aplicação ao carregar as notificações. Gera, para quem chama:
--   * prazos das próprias tarefas nas próximas 24 h e tarefas próprias em atraso;
--   * para o gestor da equipa, tarefas da equipa em atraso.
-- Um novo prazo gera um novo alerta (a chave inclui o prazo).
CREATE FUNCTION public.refresh_deadline_alerts()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := private.require_actor();
    v_created INTEGER := 0;
    v_rows INTEGER;
BEGIN
    INSERT INTO public.notifications (user_id, type, title, message, link, dedup_key)
    SELECT v_me, 'TASK_DUE_SOON', 'Prazo a terminar',
           t.reference || ' — ' || t.title || ' · prazo ' || private.local_datetime_label(t.due_at),
           '/timesheet/tasks/' || t.id, 'task-due-soon:' || t.id || ':' || extract(epoch FROM t.due_at)::BIGINT
    FROM public.tasks t
    WHERE t.assignee_id = v_me AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED')
      AND t.due_at >= now() AND t.due_at < now() + interval '24 hours'
    ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_created := v_created + v_rows;

    INSERT INTO public.notifications (user_id, type, title, message, link, dedup_key)
    SELECT v_me, 'TASK_OVERDUE', 'Tarefa em atraso',
           t.reference || ' — ' || t.title || ' · prazo ' || private.local_datetime_label(t.due_at),
           '/timesheet/tasks/' || t.id, 'task-overdue:' || t.id || ':' || extract(epoch FROM t.due_at)::BIGINT
    FROM public.tasks t
    WHERE t.assignee_id = v_me AND t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now()
    ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
    GET DIAGNOSTICS v_rows = ROW_COUNT;
    v_created := v_created + v_rows;

    IF public.has_permission('TEAM_READ') AND NOT public.has_permission('TEAM_SUPERVISE') THEN
        INSERT INTO public.notifications (user_id, type, title, message, link, dedup_key)
        SELECT v_me, 'TEAM_TASK_OVERDUE', 'Tarefa da equipa em atraso',
               t.reference || ' — ' || t.title || ' · ' || assignee.full_name || ' · prazo ' || private.local_datetime_label(t.due_at),
               '/timesheet/tasks/' || t.id, 'team-task-overdue:' || t.id || ':' || extract(epoch FROM t.due_at)::BIGINT
        FROM public.tasks t
        JOIN public.profiles assignee ON assignee.id = t.assignee_id
        WHERE t.status IN ('ASSIGNED', 'IN_PROGRESS', 'BLOCKED') AND t.due_at < now()
          AND t.assignee_id <> v_me AND private.scope_covers(v_me, t.assignee_id)
        ON CONFLICT (user_id, dedup_key) WHERE dedup_key IS NOT NULL DO NOTHING;
        GET DIAGNOSTICS v_rows = ROW_COUNT;
        v_created := v_created + v_rows;
    END IF;
    RETURN v_created;
END;
$$;
