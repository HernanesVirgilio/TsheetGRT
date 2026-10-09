-- TsheetGRT · SI Holdings — Timesheet Core (1/3): esquema
--
-- O timesheet passa a estar ligado ao trabalho real:
--   tarefa / reunião / oportunidade → atividade com tempo (timesheet_entries) → período → aprovação.
--
-- Decisões:
--   * timesheet_entries continua a ser o único registo de tempo. Ganha contexto (kind, task_id,
--     meeting_id, opportunity_id) em vez de existir uma tabela de tempo paralela. A tabela
--     activities continua a ser o catálogo de tipos de atividade.
--   * Cada entidade tem o seu histórico append-only (task_events, meeting_events, absence_events,
--     opportunity_events). A auditoria de segurança continua em audit_events.
--   * O âmbito de gestão é o existente (manager_scopes / is_manager_of_employee). As permissões são
--     granulares para que um futuro perfil (ex.: GESTOR) as receba sem reconstruir o modelo.
--   * Nenhuma entidade operacional é apagada fisicamente: usam-se estados (CANCELLED, INACTIVE).

-- =============================================================================
-- 1. PERMISSÕES
-- =============================================================================
INSERT INTO public.permissions (code, name, description, module) VALUES
    ('TIMESHEET_TASK_READ', 'Consultar Tarefas', 'Ver as próprias tarefas (e, com TEAM_READ, as da equipa)', 'work'),
    ('TIMESHEET_TASK_UPDATE', 'Executar Tarefas', 'Iniciar, bloquear, concluir e comentar as tarefas atribuídas', 'work'),
    ('TIMESHEET_TASK_CREATE', 'Criar Tarefas', 'Planear tarefas e tarefas adicionais', 'work'),
    ('TIMESHEET_TASK_ASSIGN', 'Atribuir e Planear Tarefas', 'Atribuir, alterar prazos e prioridades e cancelar tarefas do âmbito', 'work'),
    ('TIMESHEET_TASK_REOPEN', 'Reabrir Tarefas', 'Reabrir tarefas concluídas do âmbito', 'work'),
    ('TIMESHEET_CALENDAR_READ', 'Consultar Calendário', 'Ver o calendário operacional', 'work'),
    ('TIMESHEET_CALENDAR_MANAGE', 'Gerir Eventos Internos', 'Criar e alterar eventos internos do calendário', 'work'),
    ('TIMESHEET_MEETING_READ', 'Consultar Reuniões', 'Ver as reuniões em que participa', 'work'),
    ('TIMESHEET_MEETING_CREATE', 'Organizar Reuniões', 'Criar e organizar reuniões', 'work'),
    ('TIMESHEET_ABSENCE_CREATE', 'Pedir Ausências', 'Criar e acompanhar os próprios pedidos de ausência', 'work'),
    ('TIMESHEET_ABSENCE_READ', 'Consultar Ausências da Equipa', 'Ver os pedidos de ausência dos colaboradores do âmbito', 'work'),
    ('TIMESHEET_ABSENCE_APPROVE', 'Aprovar Ausências', 'Aprovar, rejeitar ou devolver pedidos de ausência do âmbito', 'work'),
    ('TIMESHEET_OPPORTUNITY_READ', 'Consultar Oportunidades', 'Ver as oportunidades em que participa', 'work'),
    ('TIMESHEET_OPPORTUNITY_UPDATE', 'Trabalhar Oportunidades', 'Atualizar e comentar as oportunidades de que é responsável ou membro', 'work'),
    ('TIMESHEET_OPPORTUNITY_CREATE', 'Criar Oportunidades', 'Registar oportunidades e empresas', 'work'),
    ('TIMESHEET_OPPORTUNITY_MANAGE', 'Gerir Oportunidades', 'Alterar responsáveis, cancelar e reabrir oportunidades do âmbito', 'work'),
    ('TIMESHEET_ATTACHMENT_CREATE', 'Adicionar Anexos', 'Anexar documentos e imagens aos registos em que participa', 'work'),
    ('TIMESHEET_ATTACHMENT_DELETE', 'Remover Anexos de Terceiros', 'Remover anexos de registos do âmbito', 'work')
ON CONFLICT (code) DO NOTHING;

-- O IT não recebe acesso administrativo ao timesheet: apenas o uso pessoal (tarefas, agenda, ausências).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (
    CASE r.code
        WHEN 'EMPLOYEE' THEN ARRAY[
            'TIMESHEET_TASK_READ', 'TIMESHEET_TASK_UPDATE', 'TIMESHEET_CALENDAR_READ', 'TIMESHEET_MEETING_READ',
            'TIMESHEET_MEETING_CREATE', 'TIMESHEET_ABSENCE_CREATE', 'TIMESHEET_OPPORTUNITY_READ',
            'TIMESHEET_OPPORTUNITY_UPDATE', 'TIMESHEET_ATTACHMENT_CREATE']
        WHEN 'MANAGER' THEN ARRAY[
            'TIMESHEET_TASK_READ', 'TIMESHEET_TASK_UPDATE', 'TIMESHEET_TASK_CREATE', 'TIMESHEET_TASK_ASSIGN',
            'TIMESHEET_TASK_REOPEN', 'TIMESHEET_CALENDAR_READ', 'TIMESHEET_CALENDAR_MANAGE', 'TIMESHEET_MEETING_READ',
            'TIMESHEET_MEETING_CREATE', 'TIMESHEET_ABSENCE_CREATE', 'TIMESHEET_ABSENCE_READ', 'TIMESHEET_ABSENCE_APPROVE',
            'TIMESHEET_OPPORTUNITY_READ', 'TIMESHEET_OPPORTUNITY_UPDATE', 'TIMESHEET_OPPORTUNITY_CREATE',
            'TIMESHEET_OPPORTUNITY_MANAGE', 'TIMESHEET_ATTACHMENT_CREATE', 'TIMESHEET_ATTACHMENT_DELETE']
        WHEN 'IT' THEN ARRAY[
            'TIMESHEET_TASK_READ', 'TIMESHEET_TASK_UPDATE', 'TIMESHEET_CALENDAR_READ', 'TIMESHEET_MEETING_READ',
            'TIMESHEET_MEETING_CREATE', 'TIMESHEET_ABSENCE_CREATE', 'TIMESHEET_ATTACHMENT_CREATE']
    END
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- O perfil ADMIN recebe sempre todas as permissões (regra do sistema).
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN' AND p.module = 'work'
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 2. EMPRESAS E OPORTUNIDADES
-- =============================================================================
CREATE TABLE public.companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(200) NOT NULL
        CONSTRAINT companies_name_length CHECK (length(btrim(name)) >= 2),
    -- NUIT moçambicano: 9 dígitos.
    nuit VARCHAR(9) UNIQUE
        CONSTRAINT companies_nuit_format CHECK (nuit ~ '^[0-9]{9}$'),
    contact_name VARCHAR(150),
    phone VARCHAR(30),
    email VARCHAR(255)
        CONSTRAINT companies_email_format CHECK (email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    address TEXT,
    website VARCHAR(255)
        CONSTRAINT companies_website_format CHECK (website ~* '^https?://'),
    notes TEXT NOT NULL DEFAULT ''
        CONSTRAINT companies_notes_length CHECK (length(notes) <= 5000),
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT companies_status_valid CHECK (status IN ('ACTIVE', 'INACTIVE')),
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX companies_name_unique ON public.companies (lower(btrim(name)));

CREATE SEQUENCE public.opportunity_number_seq;

CREATE TABLE public.opportunities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(20) NOT NULL UNIQUE
        DEFAULT ('OP-' || lpad(nextval('public.opportunity_number_seq')::text, 4, '0')),
    title VARCHAR(200) NOT NULL
        CONSTRAINT opportunities_title_length CHECK (length(btrim(title)) >= 3),
    company_id UUID NOT NULL REFERENCES public.companies(id) ON DELETE RESTRICT,
    contact_name VARCHAR(150),
    contact_phone VARCHAR(30),
    contact_email VARCHAR(255)
        CONSTRAINT opportunities_contact_email_format CHECK (contact_email ~* '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    description TEXT NOT NULL DEFAULT '' CONSTRAINT opportunities_description_length CHECK (length(description) <= 5000),
    problem TEXT NOT NULL DEFAULT '' CONSTRAINT opportunities_problem_length CHECK (length(problem) <= 5000),
    proposal TEXT NOT NULL DEFAULT '' CONSTRAINT opportunities_proposal_length CHECK (length(proposal) <= 5000),
    initial_value NUMERIC(14, 2) CONSTRAINT opportunities_initial_value_positive CHECK (initial_value >= 0),
    estimated_value NUMERIC(14, 2) CONSTRAINT opportunities_estimated_value_positive CHECK (estimated_value >= 0),
    currency CHAR(3) NOT NULL DEFAULT 'MZN' CONSTRAINT opportunities_currency_format CHECK (currency ~ '^[A-Z]{3}$'),
    probability SMALLINT CONSTRAINT opportunities_probability_range CHECK (probability BETWEEN 0 AND 100),
    expected_close_date DATE,
    owner_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'NEW'
        CONSTRAINT opportunities_status_valid CHECK (status IN ('NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED')),
    next_step VARCHAR(300),
    next_step_date DATE,
    notes TEXT NOT NULL DEFAULT '' CONSTRAINT opportunities_notes_length CHECK (length(notes) <= 5000),
    lost_reason TEXT,
    closed_at TIMESTAMPTZ,
    created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT opportunities_closed_consistency CHECK ((status IN ('WON', 'LOST', 'CANCELLED')) = (closed_at IS NOT NULL)),
    CONSTRAINT opportunities_lost_reason CHECK (status <> 'LOST' OR length(btrim(coalesce(lost_reason, ''))) > 0)
);

-- Colaboradores que trabalham a oportunidade além do responsável.
CREATE TABLE public.opportunity_members (
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    added_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (opportunity_id, profile_id)
);

CREATE TABLE public.opportunity_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    opportunity_id UUID NOT NULL REFERENCES public.opportunities(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    event_type VARCHAR(40) NOT NULL
        CONSTRAINT opportunity_events_type_valid CHECK (event_type IN (
            'OPPORTUNITY_CREATED', 'OPPORTUNITY_UPDATED', 'OPPORTUNITY_STAGE_CHANGED', 'OPPORTUNITY_OWNER_CHANGED',
            'OPPORTUNITY_MEMBER_ADDED', 'OPPORTUNITY_MEMBER_REMOVED', 'OPPORTUNITY_COMMENT_ADDED',
            'OPPORTUNITY_WON', 'OPPORTUNITY_LOST', 'OPPORTUNITY_CANCELLED', 'OPPORTUNITY_REOPENED',
            'OPPORTUNITY_ATTACHMENT_ADDED', 'OPPORTUNITY_ATTACHMENT_REMOVED'
        )),
    field VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    note TEXT,
    after_closure BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 3. TAREFAS
-- =============================================================================
CREATE SEQUENCE public.task_number_seq;

CREATE TABLE public.tasks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(20) NOT NULL UNIQUE
        DEFAULT ('TAR-' || lpad(nextval('public.task_number_seq')::text, 5, '0')),
    title VARCHAR(200) NOT NULL
        CONSTRAINT tasks_title_length CHECK (length(btrim(title)) >= 3),
    description TEXT NOT NULL DEFAULT ''
        CONSTRAINT tasks_description_length CHECK (length(description) <= 5000),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    assignee_id UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CONSTRAINT tasks_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    -- Não existe estado "atrasada": o atraso calcula-se (due_at < now() e tarefa por concluir).
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
        CONSTRAINT tasks_status_valid CHECK (status IN ('PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED')),
    start_date DATE,
    due_at TIMESTAMPTZ,
    estimated_minutes INTEGER
        CONSTRAINT tasks_estimate_range CHECK (estimated_minutes BETWEEN 1 AND 100000),
    started_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    completion_note TEXT,
    late_reason TEXT,
    blocked_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    -- Tarefa adicional: nova unidade de trabalho relacionada com a original (nunca a substitui).
    parent_task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
    meeting_id UUID,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT tasks_planned_without_assignee CHECK (status <> 'PLANNED' OR assignee_id IS NULL),
    CONSTRAINT tasks_assignee_required CHECK (status IN ('PLANNED', 'CANCELLED') OR assignee_id IS NOT NULL),
    CONSTRAINT tasks_completed_consistency CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
    CONSTRAINT tasks_cancelled_consistency CHECK (
        (status = 'CANCELLED') = (cancelled_at IS NOT NULL)
        AND (status <> 'CANCELLED' OR length(btrim(coalesce(cancel_reason, ''))) > 0)
    ),
    CONSTRAINT tasks_blocked_reason CHECK (status <> 'BLOCKED' OR length(btrim(coalesce(blocked_reason, ''))) > 0),
    -- Conclusão depois do prazo exige justificação.
    CONSTRAINT tasks_late_reason CHECK (
        status <> 'COMPLETED' OR due_at IS NULL OR completed_at <= due_at
        OR length(btrim(coalesce(late_reason, ''))) > 0
    ),
    CONSTRAINT tasks_not_own_parent CHECK (parent_task_id IS DISTINCT FROM id)
);

CREATE TABLE public.task_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    event_type VARCHAR(40) NOT NULL
        CONSTRAINT task_events_type_valid CHECK (event_type IN (
            'TASK_CREATED', 'TASK_ASSIGNED', 'TASK_REASSIGNED', 'TASK_UNASSIGNED', 'TASK_STARTED', 'TASK_BLOCKED',
            'TASK_UNBLOCKED', 'TASK_UPDATED', 'TASK_PRIORITY_CHANGED', 'TASK_DEADLINE_CHANGED', 'TASK_COMMENT_ADDED',
            'TASK_COMPLETED', 'TASK_COMPLETED_LATE', 'TASK_REOPENED', 'TASK_CANCELLED',
            'TASK_ATTACHMENT_ADDED', 'TASK_ATTACHMENT_REMOVED'
        )),
    field VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    note TEXT,
    -- Alteração feita depois de a tarefa estar concluída (edição pós-encerramento).
    after_closure BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 4. REUNIÕES
-- =============================================================================
CREATE TABLE public.meetings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL
        CONSTRAINT meetings_title_length CHECK (length(btrim(title)) >= 3),
    description TEXT NOT NULL DEFAULT '' CONSTRAINT meetings_description_length CHECK (length(description) <= 5000),
    objective TEXT NOT NULL DEFAULT '' CONSTRAINT meetings_objective_length CHECK (length(objective) <= 2000),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    location VARCHAR(200),
    -- Só ligações http(s): evita esquemas como javascript: na interface.
    meeting_url VARCHAR(500)
        CONSTRAINT meetings_url_format CHECK (meeting_url ~* '^https?://'),
    organizer_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'PLANNED'
        CONSTRAINT meetings_status_valid CHECK (status IN ('PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED')),
    outcome TEXT CONSTRAINT meetings_outcome_length CHECK (length(outcome) <= 5000),
    decisions TEXT CONSTRAINT meetings_decisions_length CHECK (length(decisions) <= 5000),
    next_steps TEXT CONSTRAINT meetings_next_steps_length CHECK (length(next_steps) <= 5000),
    completed_at TIMESTAMPTZ,
    cancelled_at TIMESTAMPTZ,
    cancel_reason TEXT,
    task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
    opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT meetings_time_range CHECK (ends_at > starts_at AND ends_at - starts_at <= interval '24 hours'),
    CONSTRAINT meetings_completed_consistency CHECK ((status = 'COMPLETED') = (completed_at IS NOT NULL)),
    CONSTRAINT meetings_cancelled_consistency CHECK (
        (status = 'CANCELLED') = (cancelled_at IS NOT NULL)
        AND (status <> 'CANCELLED' OR length(btrim(coalesce(cancel_reason, ''))) > 0)
    )
);

ALTER TABLE public.tasks
    ADD CONSTRAINT tasks_meeting_id_fkey FOREIGN KEY (meeting_id) REFERENCES public.meetings(id) ON DELETE SET NULL;

CREATE TABLE public.meeting_participants (
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE CASCADE,
    profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (meeting_id, profile_id)
);

CREATE TABLE public.meeting_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    meeting_id UUID NOT NULL REFERENCES public.meetings(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    event_type VARCHAR(40) NOT NULL
        CONSTRAINT meeting_events_type_valid CHECK (event_type IN (
            'MEETING_CREATED', 'MEETING_UPDATED', 'MEETING_RESCHEDULED', 'MEETING_CONFIRMED', 'MEETING_COMPLETED',
            'MEETING_OUTCOME_UPDATED', 'MEETING_CANCELLED', 'MEETING_PARTICIPANT_ADDED', 'MEETING_PARTICIPANT_REMOVED',
            'MEETING_ATTACHMENT_ADDED', 'MEETING_ATTACHMENT_REMOVED'
        )),
    field VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    note TEXT,
    after_closure BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. AUSÊNCIAS
-- =============================================================================
-- Tipos configuráveis (não estão fixos no frontend).
CREATE TABLE public.absence_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) NOT NULL UNIQUE
        CONSTRAINT absence_types_code_format CHECK (code ~ '^[A-Z][A-Z_]{1,29}$'),
    name VARCHAR(100) NOT NULL
        CONSTRAINT absence_types_name_length CHECK (length(btrim(name)) >= 2),
    description TEXT NOT NULL DEFAULT '',
    -- Ex.: doença exige um documento comprovativo antes da submissão.
    requires_attachment BOOLEAN NOT NULL DEFAULT false,
    active BOOLEAN NOT NULL DEFAULT true,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO public.absence_types (code, name, description, requires_attachment, sort_order) VALUES
    ('VACATION', 'Férias', 'Período de férias', false, 10),
    ('SICK', 'Doença', 'Ausência por doença (exige comprovativo)', true, 20),
    ('LEAVE', 'Licença', 'Licenças previstas na lei ou no regulamento interno', false, 30),
    ('PERSONAL', 'Assuntos pessoais', 'Ausência por assuntos pessoais', false, 40),
    ('TRAINING', 'Formação', 'Participação em formação', false, 50),
    ('MISSION', 'Missão de serviço', 'Deslocação ou missão em serviço', false, 60),
    ('OTHER', 'Outro', 'Outros motivos', false, 90)
ON CONFLICT (code) DO NOTHING;

CREATE SEQUENCE public.absence_number_seq;

CREATE TABLE public.absence_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(20) NOT NULL UNIQUE
        DEFAULT ('AUS-' || lpad(nextval('public.absence_number_seq')::text, 5, '0')),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    absence_type_id UUID NOT NULL REFERENCES public.absence_types(id) ON DELETE RESTRICT,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT NOT NULL DEFAULT '' CONSTRAINT absence_requests_reason_length CHECK (length(reason) <= 2000),
    status VARCHAR(20) NOT NULL DEFAULT 'DRAFT'
        CONSTRAINT absence_requests_status_valid CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED')),
    submitted_at TIMESTAMPTZ,
    decided_at TIMESTAMPTZ,
    decided_by UUID REFERENCES public.profiles(id) ON DELETE RESTRICT,
    -- Motivo da rejeição ou do pedido de correção (devolução para rascunho).
    decision_comment TEXT,
    cancelled_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT absence_requests_period_valid CHECK (end_date >= start_date AND end_date - start_date <= 366),
    CONSTRAINT absence_requests_decision_consistency CHECK (
        (status IN ('APPROVED', 'REJECTED')) = (decided_at IS NOT NULL AND decided_by IS NOT NULL)
        OR (status = 'CANCELLED' AND decided_at IS NOT NULL)
    ),
    CONSTRAINT absence_requests_no_self_decision CHECK (decided_by IS DISTINCT FROM employee_id),
    CONSTRAINT absence_requests_rejection_reason CHECK (status <> 'REJECTED' OR length(btrim(coalesce(decision_comment, ''))) > 0),
    CONSTRAINT absence_requests_cancelled_consistency CHECK ((status = 'CANCELLED') = (cancelled_at IS NOT NULL)),
    CONSTRAINT absence_requests_submitted_consistency CHECK (status = 'DRAFT' OR submitted_at IS NOT NULL OR status = 'CANCELLED')
);

CREATE TABLE public.absence_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    absence_request_id UUID NOT NULL REFERENCES public.absence_requests(id) ON DELETE RESTRICT,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    event_type VARCHAR(40) NOT NULL
        CONSTRAINT absence_events_type_valid CHECK (event_type IN (
            'ABSENCE_CREATED', 'ABSENCE_UPDATED', 'ABSENCE_SUBMITTED', 'ABSENCE_APPROVED', 'ABSENCE_REJECTED',
            'ABSENCE_CHANGES_REQUESTED', 'ABSENCE_CANCELLED', 'ABSENCE_ATTACHMENT_ADDED', 'ABSENCE_ATTACHMENT_REMOVED'
        )),
    field VARCHAR(50),
    old_value TEXT,
    new_value TEXT,
    note TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 6. EVENTOS INTERNOS DO CALENDÁRIO
-- =============================================================================
CREATE TABLE public.calendar_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(200) NOT NULL
        CONSTRAINT calendar_events_title_length CHECK (length(btrim(title)) >= 3),
    description TEXT NOT NULL DEFAULT '' CONSTRAINT calendar_events_description_length CHECK (length(description) <= 5000),
    starts_at TIMESTAMPTZ NOT NULL,
    ends_at TIMESTAMPTZ NOT NULL,
    all_day BOOLEAN NOT NULL DEFAULT false,
    location VARCHAR(200),
    -- NULL = evento de toda a empresa; caso contrário, do departamento indicado.
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'ACTIVE'
        CONSTRAINT calendar_events_status_valid CHECK (status IN ('ACTIVE', 'CANCELLED')),
    created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT calendar_events_time_range CHECK (ends_at >= starts_at AND ends_at - starts_at <= interval '31 days')
);

-- =============================================================================
-- 7. ANEXOS (metadados; o ficheiro fica no Supabase Storage, bucket privado)
-- =============================================================================
CREATE TABLE public.attachments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    entity_type VARCHAR(20) NOT NULL
        CONSTRAINT attachments_entity_type_valid CHECK (entity_type IN ('TASK', 'ACTIVITY', 'MEETING', 'ABSENCE', 'OPPORTUNITY')),
    entity_id UUID NOT NULL,
    bucket_id VARCHAR(64) NOT NULL DEFAULT 'work-attachments',
    storage_path TEXT NOT NULL UNIQUE,
    file_name VARCHAR(255) NOT NULL
        CONSTRAINT attachments_file_name_length CHECK (length(btrim(file_name)) BETWEEN 1 AND 255),
    mime_type VARCHAR(150) NOT NULL,
    size_bytes BIGINT NOT NULL
        CONSTRAINT attachments_size_range CHECK (size_bytes BETWEEN 1 AND 10485760),
    uploaded_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Preenchido quando o ficheiro foi efetivamente carregado no Storage.
    upload_confirmed_at TIMESTAMPTZ,
    -- Remoção lógica: o ficheiro deixa de ser acessível mas o registo permanece para o histórico.
    deleted_at TIMESTAMPTZ,
    deleted_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    delete_reason TEXT,
    CONSTRAINT attachments_deleted_consistency CHECK ((deleted_at IS NULL) = (deleted_by IS NULL))
);

-- =============================================================================
-- 8. TEMPO COM CONTEXTO (extensão de timesheet_entries)
-- =============================================================================
-- GENERAL: registo sem contexto (inclui todos os registos anteriores a este módulo).
-- TASK / MEETING / OPPORTUNITY: tempo dedicado ao registo indicado.
-- UNPLANNED: atividade extraordinária, não planeada.
ALTER TABLE public.timesheet_entries
    ADD COLUMN kind VARCHAR(20) NOT NULL DEFAULT 'GENERAL'
        CONSTRAINT timesheet_entries_kind_valid CHECK (kind IN ('GENERAL', 'TASK', 'MEETING', 'OPPORTUNITY', 'UNPLANNED')),
    ADD COLUMN task_id UUID REFERENCES public.tasks(id) ON DELETE RESTRICT,
    ADD COLUMN meeting_id UUID REFERENCES public.meetings(id) ON DELETE RESTRICT,
    ADD COLUMN opportunity_id UUID REFERENCES public.opportunities(id) ON DELETE RESTRICT;

ALTER TABLE public.timesheet_entries
    ADD CONSTRAINT timesheet_entries_context CHECK (
        (kind = 'TASK') = (task_id IS NOT NULL)
        AND (kind = 'MEETING') = (meeting_id IS NOT NULL)
        AND (kind <> 'OPPORTUNITY' OR opportunity_id IS NOT NULL)
        AND (kind NOT IN ('GENERAL', 'UNPLANNED') OR opportunity_id IS NULL)
    ),
    ADD CONSTRAINT timesheet_entries_unplanned_description CHECK (kind <> 'UNPLANNED' OR length(btrim(description)) >= 5);

-- =============================================================================
-- 9. ÍNDICES
-- =============================================================================
CREATE INDEX idx_companies_status ON public.companies(status);
CREATE INDEX idx_companies_created_by ON public.companies(created_by);
CREATE INDEX idx_opportunities_company_id ON public.opportunities(company_id);
CREATE INDEX idx_opportunities_owner_id ON public.opportunities(owner_id);
CREATE INDEX idx_opportunities_department_id ON public.opportunities(department_id);
CREATE INDEX idx_opportunities_status ON public.opportunities(status);
CREATE INDEX idx_opportunities_created_by ON public.opportunities(created_by);
CREATE INDEX idx_opportunities_next_step_date ON public.opportunities(next_step_date);
CREATE INDEX idx_opportunities_updated_at ON public.opportunities(updated_at DESC);
CREATE INDEX idx_opportunity_members_profile_id ON public.opportunity_members(profile_id);
CREATE INDEX idx_opportunity_members_added_by ON public.opportunity_members(added_by);
CREATE INDEX idx_opportunity_events_opportunity ON public.opportunity_events(opportunity_id, created_at);
CREATE INDEX idx_opportunity_events_actor_id ON public.opportunity_events(actor_id);

CREATE INDEX idx_tasks_assignee_status ON public.tasks(assignee_id, status);
CREATE INDEX idx_tasks_created_by ON public.tasks(created_by);
CREATE INDEX idx_tasks_department_id ON public.tasks(department_id);
CREATE INDEX idx_tasks_status ON public.tasks(status);
CREATE INDEX idx_tasks_priority ON public.tasks(priority);
CREATE INDEX idx_tasks_due_at ON public.tasks(due_at);
CREATE INDEX idx_tasks_parent_task_id ON public.tasks(parent_task_id);
CREATE INDEX idx_tasks_opportunity_id ON public.tasks(opportunity_id);
CREATE INDEX idx_tasks_meeting_id ON public.tasks(meeting_id);
CREATE INDEX idx_tasks_updated_at ON public.tasks(updated_at DESC);
CREATE INDEX idx_task_events_task ON public.task_events(task_id, created_at);
CREATE INDEX idx_task_events_actor_id ON public.task_events(actor_id);

CREATE INDEX idx_meetings_starts_at ON public.meetings(starts_at);
CREATE INDEX idx_meetings_organizer_id ON public.meetings(organizer_id);
CREATE INDEX idx_meetings_department_id ON public.meetings(department_id);
CREATE INDEX idx_meetings_task_id ON public.meetings(task_id);
CREATE INDEX idx_meetings_opportunity_id ON public.meetings(opportunity_id);
CREATE INDEX idx_meetings_status ON public.meetings(status);
CREATE INDEX idx_meeting_participants_profile_id ON public.meeting_participants(profile_id);
CREATE INDEX idx_meeting_events_meeting ON public.meeting_events(meeting_id, created_at);
CREATE INDEX idx_meeting_events_actor_id ON public.meeting_events(actor_id);

CREATE INDEX idx_absence_requests_employee_period ON public.absence_requests(employee_id, start_date, end_date);
CREATE INDEX idx_absence_requests_status ON public.absence_requests(status);
CREATE INDEX idx_absence_requests_type ON public.absence_requests(absence_type_id);
CREATE INDEX idx_absence_requests_decided_by ON public.absence_requests(decided_by);
CREATE INDEX idx_absence_requests_period ON public.absence_requests(start_date, end_date);
CREATE INDEX idx_absence_events_request ON public.absence_events(absence_request_id, created_at);
CREATE INDEX idx_absence_events_actor_id ON public.absence_events(actor_id);

CREATE INDEX idx_calendar_events_period ON public.calendar_events(starts_at, ends_at);
CREATE INDEX idx_calendar_events_department_id ON public.calendar_events(department_id);
CREATE INDEX idx_calendar_events_created_by ON public.calendar_events(created_by);

CREATE INDEX idx_attachments_entity ON public.attachments(entity_type, entity_id);
CREATE INDEX idx_attachments_uploaded_by ON public.attachments(uploaded_by);
CREATE INDEX idx_attachments_deleted_by ON public.attachments(deleted_by);

CREATE INDEX idx_timesheet_entries_task_id ON public.timesheet_entries(task_id);
CREATE INDEX idx_timesheet_entries_meeting_id ON public.timesheet_entries(meeting_id);
CREATE INDEX idx_timesheet_entries_opportunity_id ON public.timesheet_entries(opportunity_id);
CREATE INDEX idx_timesheet_entries_employee_date ON public.timesheet_entries(employee_id, work_date);

-- =============================================================================
-- 10. TRIGGERS DE MANUTENÇÃO
-- =============================================================================
CREATE TRIGGER trg_companies_updated_at BEFORE UPDATE ON public.companies
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_opportunities_updated_at BEFORE UPDATE ON public.opportunities
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_tasks_updated_at BEFORE UPDATE ON public.tasks
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_meetings_updated_at BEFORE UPDATE ON public.meetings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_absence_types_updated_at BEFORE UPDATE ON public.absence_types
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_absence_requests_updated_at BEFORE UPDATE ON public.absence_requests
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_calendar_events_updated_at BEFORE UPDATE ON public.calendar_events
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- =============================================================================
-- 11. FUNÇÕES INTERNAS PARTILHADAS
-- =============================================================================
-- Ator da sessão (conta ativa) ou erro de autorização.
CREATE FUNCTION private.require_actor()
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor UUID := public.get_current_profile_id();
BEGIN
    IF v_actor IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;
    RETURN v_actor;
END;
$$;

CREATE FUNCTION private.require_permission(p_permission_code TEXT, p_message TEXT)
RETURNS VOID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF NOT public.has_permission(p_permission_code) THEN
        RAISE EXCEPTION '%', p_message USING ERRCODE = '42501';
    END IF;
END;
$$;

-- O trabalho de um colaborador pode ser gerido por quem chama: o próprio, um gestor cujo âmbito o
-- abrange, ou a administração. Reutiliza a regra única do âmbito (private.scope_covers).
CREATE FUNCTION private.manages_work_of(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_profile_id IS NOT NULL AND (
        p_profile_id = public.get_current_profile_id()
        OR public.has_permission('ADMIN_ACCESS')
        OR public.is_manager_of_employee(p_profile_id)
    );
$$;

CREATE FUNCTION private.is_active_profile(p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_profile_id AND is_active);
$$;

CREATE FUNCTION private.current_department_id()
RETURNS UUID
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT department_id FROM public.profiles WHERE id = public.get_current_profile_id();
$$;

-- Texto obrigatório com limites (motivos, justificações, comentários).
CREATE FUNCTION private.required_text(p_value TEXT, p_min INTEGER, p_max INTEGER, p_message TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_value TEXT := btrim(coalesce(p_value, ''));
BEGIN
    IF length(v_value) < p_min OR length(v_value) > p_max THEN
        RAISE EXCEPTION '% (entre % e % carateres).', p_message, p_min, p_max;
    END IF;
    RETURN v_value;
END;
$$;

CREATE FUNCTION private.optional_text(p_value TEXT, p_max INTEGER, p_label TEXT)
RETURNS TEXT
LANGUAGE plpgsql
IMMUTABLE
SET search_path = ''
AS $$
DECLARE
    v_value TEXT := nullif(btrim(coalesce(p_value, '')), '');
BEGIN
    IF length(coalesce(v_value, '')) > p_max THEN
        RAISE EXCEPTION '% não pode exceder % carateres.', p_label, p_max;
    END IF;
    RETURN v_value;
END;
$$;

-- Participação em reuniões e oportunidades (SECURITY DEFINER: usadas nas políticas RLS sem recursão).
CREATE FUNCTION private.is_meeting_participant(p_meeting_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.meeting_participants mp
        WHERE mp.meeting_id = p_meeting_id AND mp.profile_id = p_profile_id
    );
$$;

CREATE FUNCTION private.is_opportunity_member(p_opportunity_id UUID, p_profile_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.opportunity_members om
        WHERE om.opportunity_id = p_opportunity_id AND om.profile_id = p_profile_id
    );
$$;

-- Regras de leitura usadas pelas funções do servidor (as políticas RLS seguem a mesma regra).
CREATE FUNCTION private.can_read_task(p_task public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('TIMESHEET_TASK_READ') AND (
        p_task.assignee_id = public.get_current_profile_id()
        OR p_task.created_by = public.get_current_profile_id()
        OR (public.has_permission('TEAM_READ') AND p_task.assignee_id IS NOT NULL
            AND public.is_manager_of_employee(p_task.assignee_id))
        OR public.has_permission('ADMIN_ACCESS')
        OR (p_task.opportunity_id IS NOT NULL AND EXISTS (
            SELECT 1 FROM public.opportunities o
            WHERE o.id = p_task.opportunity_id AND o.owner_id = public.get_current_profile_id()
        ))
    );
$$;

-- Quem planeia/gere a tarefa: administração, quem a criou, ou o gestor do responsável.
CREATE FUNCTION private.manages_task(p_task public.tasks)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('ADMIN_ACCESS')
        OR p_task.created_by = public.get_current_profile_id()
        OR (p_task.assignee_id IS NOT NULL AND public.is_manager_of_employee(p_task.assignee_id));
$$;

CREATE FUNCTION private.can_read_meeting(p_meeting public.meetings)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('TIMESHEET_MEETING_READ') AND (
        p_meeting.organizer_id = public.get_current_profile_id()
        OR private.is_meeting_participant(p_meeting.id, public.get_current_profile_id())
        OR (public.has_permission('TEAM_READ') AND public.is_manager_of_employee(p_meeting.organizer_id))
        OR public.has_permission('ADMIN_ACCESS')
    );
$$;

CREATE FUNCTION private.manages_meeting(p_meeting public.meetings)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_meeting.organizer_id = public.get_current_profile_id()
        OR public.has_permission('ADMIN_ACCESS')
        OR public.is_manager_of_employee(p_meeting.organizer_id);
$$;

CREATE FUNCTION private.can_read_opportunity(p_opportunity public.opportunities)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT public.has_permission('TIMESHEET_OPPORTUNITY_READ') AND (
        p_opportunity.owner_id = public.get_current_profile_id()
        OR p_opportunity.created_by = public.get_current_profile_id()
        OR private.is_opportunity_member(p_opportunity.id, public.get_current_profile_id())
        OR (public.has_permission('TEAM_READ') AND public.is_manager_of_employee(p_opportunity.owner_id))
        OR public.has_permission('ADMIN_ACCESS')
    );
$$;

-- Editar a oportunidade: responsável, quem a criou, gestor do responsável ou administração.
-- Os membros comentam e registam tempo, mas não alteram os dados comerciais.
CREATE FUNCTION private.manages_opportunity(p_opportunity public.opportunities)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_opportunity.owner_id = public.get_current_profile_id()
        OR p_opportunity.created_by = public.get_current_profile_id()
        OR public.has_permission('ADMIN_ACCESS')
        OR public.is_manager_of_employee(p_opportunity.owner_id);
$$;

CREATE FUNCTION private.can_read_absence(p_request public.absence_requests)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p_request.employee_id = public.get_current_profile_id()
        OR (public.has_permission('TIMESHEET_ABSENCE_READ') AND public.is_manager_of_employee(p_request.employee_id))
        OR public.has_permission('ADMIN_ACCESS');
$$;

CREATE FUNCTION private.profile_label(p_profile_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT coalesce((SELECT full_name::TEXT FROM public.profiles WHERE id = p_profile_id), 'Sem responsável');
$$;

-- =============================================================================
-- 12. CONTEXTO DOS REGISTOS DE TEMPO
-- =============================================================================
-- O tempo só pode ser associado a trabalho em que o colaborador participa. A oportunidade é
-- derivada da tarefa/reunião, para que "tempo por oportunidade" seja sempre coerente.
CREATE FUNCTION private.validate_timesheet_entry_context()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_task public.tasks%ROWTYPE;
    v_meeting public.meetings%ROWTYPE;
    v_opportunity public.opportunities%ROWTYPE;
BEGIN
    IF TG_OP = 'UPDATE'
       AND NEW.kind = OLD.kind
       AND NEW.task_id IS NOT DISTINCT FROM OLD.task_id
       AND NEW.meeting_id IS NOT DISTINCT FROM OLD.meeting_id
       AND NEW.opportunity_id IS NOT DISTINCT FROM OLD.opportunity_id
       AND NEW.employee_id = OLD.employee_id THEN
        RETURN NEW;
    END IF;

    IF NEW.kind = 'TASK' THEN
        SELECT * INTO v_task FROM public.tasks WHERE id = NEW.task_id;
        IF NOT FOUND OR v_task.assignee_id IS DISTINCT FROM NEW.employee_id THEN
            RAISE EXCEPTION 'Só pode registar tempo em tarefas que lhe estão atribuídas.';
        END IF;
        IF v_task.status IN ('PLANNED', 'CANCELLED') THEN
            RAISE EXCEPTION 'Não é possível registar tempo numa tarefa %.',
                CASE v_task.status WHEN 'CANCELLED' THEN 'cancelada' ELSE 'por atribuir' END;
        END IF;
        NEW.opportunity_id := v_task.opportunity_id;
    ELSIF NEW.kind = 'MEETING' THEN
        SELECT * INTO v_meeting FROM public.meetings WHERE id = NEW.meeting_id;
        IF NOT FOUND OR NOT (v_meeting.organizer_id = NEW.employee_id OR private.is_meeting_participant(v_meeting.id, NEW.employee_id)) THEN
            RAISE EXCEPTION 'Só pode registar tempo em reuniões em que participa.';
        END IF;
        IF v_meeting.status = 'CANCELLED' THEN
            RAISE EXCEPTION 'Não é possível registar tempo numa reunião cancelada.';
        END IF;
        NEW.opportunity_id := v_meeting.opportunity_id;
    ELSIF NEW.kind = 'OPPORTUNITY' THEN
        SELECT * INTO v_opportunity FROM public.opportunities WHERE id = NEW.opportunity_id;
        IF NOT FOUND OR NOT (v_opportunity.owner_id = NEW.employee_id OR private.is_opportunity_member(v_opportunity.id, NEW.employee_id)) THEN
            RAISE EXCEPTION 'Só pode registar tempo em oportunidades de que é responsável ou membro.';
        END IF;
        IF v_opportunity.status = 'CANCELLED' THEN
            RAISE EXCEPTION 'Não é possível registar tempo numa oportunidade cancelada.';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

-- BEFORE INSERT: corre depois dos triggers existentes de validação e cálculo (ordem alfabética).
CREATE TRIGGER trg_timesheet_entries_zz_context
    BEFORE INSERT OR UPDATE ON public.timesheet_entries
    FOR EACH ROW EXECUTE FUNCTION private.validate_timesheet_entry_context();
