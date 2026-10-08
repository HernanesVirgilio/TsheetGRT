-- TsheetGRT · SI Holdings — Módulo IT (pedidos de suporte, ativos e intervenções)
--
-- Princípios (os mesmos do resto do sistema):
--   * Técnico de IT = utilizador ativo cujo perfil de acesso tem IT_TICKETS_MANAGE.
--   * Os pedidos só mudam de estado através de funções do servidor; não existe escrita direta
--     em it_tickets, it_ticket_comments, it_ticket_events ou it_interventions pela API.
--   * O histórico (it_ticket_events) é escrito apenas pelo servidor, com o ator da sessão.
--   * Auditoria (private.write_audit_event) e notificações (public.notifications) reutilizam a
--     infraestrutura existente.

-- =============================================================================
-- 1. PERMISSÕES
-- =============================================================================
INSERT INTO public.permissions (code, name, description, module) VALUES
    ('IT_TICKET_CREATE', 'Abrir Pedidos de Suporte', 'Abrir e acompanhar os próprios pedidos de suporte IT', 'it'),
    ('IT_TICKETS_READ', 'Consultar Pedidos de Suporte', 'Consultar a fila de pedidos de suporte IT', 'it'),
    ('IT_TICKETS_MANAGE', 'Tratar Pedidos de Suporte', 'Assumir, comentar, resolver, fechar e reabrir pedidos (técnico de IT)', 'it'),
    ('IT_TICKETS_ASSIGN', 'Atribuir Pedidos de Suporte', 'Atribuir pedidos a técnicos de IT', 'it'),
    ('IT_ASSETS_READ', 'Consultar Ativos de IT', 'Consultar o inventário de equipamentos e intervenções', 'it'),
    ('IT_ASSETS_MANAGE', 'Gerir Ativos de IT', 'Registar e atualizar equipamentos', 'it');

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (
    CASE r.code
        WHEN 'ADMIN' THEN ARRAY['IT_TICKET_CREATE', 'IT_TICKETS_READ', 'IT_TICKETS_MANAGE', 'IT_TICKETS_ASSIGN', 'IT_ASSETS_READ', 'IT_ASSETS_MANAGE']
        WHEN 'IT' THEN ARRAY['IT_TICKET_CREATE', 'IT_TICKETS_READ', 'IT_TICKETS_MANAGE', 'IT_TICKETS_ASSIGN', 'IT_ASSETS_READ', 'IT_ASSETS_MANAGE']
        WHEN 'MANAGER' THEN ARRAY['IT_TICKET_CREATE']
        WHEN 'EMPLOYEE' THEN ARRAY['IT_TICKET_CREATE']
    END
)
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 2. CONFIGURAÇÃO (prazos de resolução e alerta de espera)
-- =============================================================================
INSERT INTO public.system_settings (key, value, description) VALUES
    ('IT_SLA_HOURS_CRITICAL', '8', 'Prazo de resolução (horas) de pedidos IT com prioridade crítica'),
    ('IT_SLA_HOURS_HIGH', '24', 'Prazo de resolução (horas) de pedidos IT com prioridade alta'),
    ('IT_SLA_HOURS_MEDIUM', '72', 'Prazo de resolução (horas) de pedidos IT com prioridade média'),
    ('IT_SLA_HOURS_LOW', '120', 'Prazo de resolução (horas) de pedidos IT com prioridade baixa'),
    ('IT_WAITING_USER_ALERT_DAYS', '3', 'Dias a aguardar resposta do colaborador até o pedido requerer atenção')
ON CONFLICT (key) DO NOTHING;

-- Mantém as validações existentes e acrescenta as das novas chaves.
CREATE OR REPLACE FUNCTION public.validate_system_setting()
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
        WHEN 'IT_SLA_HOURS_CRITICAL', 'IT_SLA_HOURS_HIGH', 'IT_SLA_HOURS_MEDIUM', 'IT_SLA_HOURS_LOW' THEN
            IF NEW.value !~ '^[0-9]{1,4}$' OR NEW.value::INTEGER NOT BETWEEN 1 AND 2000 THEN
                RAISE EXCEPTION 'O prazo de resolução deve ser um número inteiro de horas entre 1 e 2000.';
            END IF;
        WHEN 'IT_WAITING_USER_ALERT_DAYS' THEN
            IF NEW.value !~ '^[0-9]{1,2}$' OR NEW.value::INTEGER NOT BETWEEN 1 AND 60 THEN
                RAISE EXCEPTION 'O alerta de espera deve ser um número inteiro de dias entre 1 e 60.';
            END IF;
        ELSE
            NULL;
    END CASE;

    RETURN NEW;
END;
$$;

-- =============================================================================
-- 3. TABELAS
-- =============================================================================
CREATE TABLE public.it_ticket_categories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(30) NOT NULL UNIQUE
        CONSTRAINT it_ticket_categories_code_format CHECK (code ~ '^[A-Z][A-Z_]{1,29}$'),
    name VARCHAR(100) NOT NULL
        CONSTRAINT it_ticket_categories_name_not_blank CHECK (length(btrim(name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    sort_order INTEGER NOT NULL DEFAULT 0,
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE SEQUENCE public.it_asset_tag_seq;

CREATE TABLE public.it_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    asset_tag VARCHAR(30) NOT NULL UNIQUE
        DEFAULT ('SI-IT-' || lpad(nextval('public.it_asset_tag_seq')::text, 4, '0'))
        CONSTRAINT it_assets_asset_tag_format CHECK (asset_tag ~ '^[A-Z0-9][A-Z0-9-]{2,29}$'),
    asset_type VARCHAR(20) NOT NULL
        CONSTRAINT it_assets_type_valid CHECK (asset_type IN ('COMPUTER', 'LAPTOP', 'MONITOR', 'PRINTER', 'PHONE', 'NETWORK', 'OTHER')),
    brand VARCHAR(100),
    model VARCHAR(150),
    serial_number VARCHAR(100) UNIQUE,
    status VARCHAR(20) NOT NULL DEFAULT 'IN_STOCK'
        CONSTRAINT it_assets_status_valid CHECK (status IN ('ACTIVE', 'IN_REPAIR', 'IN_STOCK', 'RETIRED', 'LOST')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    location VARCHAR(150),
    acquired_on DATE,
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Equipamento em stock ou abatido não está atribuído a ninguém.
    CONSTRAINT it_assets_assignment_status CHECK (assigned_to IS NULL OR status IN ('ACTIVE', 'IN_REPAIR', 'LOST'))
);

ALTER SEQUENCE public.it_asset_tag_seq OWNED BY public.it_assets.asset_tag;

CREATE SEQUENCE public.it_ticket_number_seq;

CREATE TABLE public.it_tickets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    reference VARCHAR(20) NOT NULL UNIQUE
        DEFAULT ('IT-' || lpad(nextval('public.it_ticket_number_seq')::text, 4, '0')),
    title VARCHAR(200) NOT NULL
        CONSTRAINT it_tickets_title_length CHECK (length(btrim(title)) >= 5),
    description TEXT NOT NULL
        CONSTRAINT it_tickets_description_length CHECK (length(btrim(description)) >= 10 AND length(description) <= 5000),
    requester_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    -- Departamento do solicitante no momento da abertura.
    requester_department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    category_id UUID NOT NULL REFERENCES public.it_ticket_categories(id) ON DELETE RESTRICT,
    priority VARCHAR(10) NOT NULL DEFAULT 'MEDIUM'
        CONSTRAINT it_tickets_priority_valid CHECK (priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
    status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
        CONSTRAINT it_tickets_status_valid CHECK (status IN ('OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED')),
    assigned_to UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    asset_id UUID REFERENCES public.it_assets(id) ON DELETE SET NULL,
    resolution_summary TEXT,
    due_at TIMESTAMPTZ NOT NULL,
    status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    resolved_at TIMESTAMPTZ,
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Só se fecha um pedido resolvido: RESOLVED e CLOSED têm sempre data e resumo de resolução.
    CONSTRAINT it_tickets_resolution_consistency CHECK ((status IN ('RESOLVED', 'CLOSED')) = (resolved_at IS NOT NULL)),
    CONSTRAINT it_tickets_closed_consistency CHECK ((status = 'CLOSED') = (closed_at IS NOT NULL)),
    CONSTRAINT it_tickets_resolution_summary CHECK (
        status NOT IN ('RESOLVED', 'CLOSED') OR length(btrim(coalesce(resolution_summary, ''))) > 0
    )
);

CREATE TABLE public.it_ticket_comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
    author_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    -- Nome no momento do comentário: o histórico é legível sem acesso ao perfil do autor.
    author_name VARCHAR(255) NOT NULL,
    body TEXT NOT NULL
        CONSTRAINT it_ticket_comments_body_length CHECK (length(btrim(body)) BETWEEN 1 AND 5000),
    -- Notas internas da equipa de IT (nunca visíveis ao solicitante).
    is_internal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.it_ticket_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID NOT NULL REFERENCES public.it_tickets(id) ON DELETE CASCADE,
    actor_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    actor_name VARCHAR(255),
    event_type VARCHAR(30) NOT NULL
        CONSTRAINT it_ticket_events_type_valid CHECK (event_type IN (
            'CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED',
            'ASSET_CHANGED', 'COMMENTED', 'RESOLVED', 'CLOSED', 'REOPENED', 'INTERVENTION_ADDED'
        )),
    old_value TEXT,
    new_value TEXT,
    note TEXT,
    is_internal BOOLEAN NOT NULL DEFAULT false,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.it_interventions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ticket_id UUID REFERENCES public.it_tickets(id) ON DELETE SET NULL,
    asset_id UUID REFERENCES public.it_assets(id) ON DELETE SET NULL,
    technician_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    technician_name VARCHAR(255) NOT NULL,
    performed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    problem_description TEXT NOT NULL
        CONSTRAINT it_interventions_problem_length CHECK (length(btrim(problem_description)) BETWEEN 5 AND 2000),
    work_performed TEXT NOT NULL
        CONSTRAINT it_interventions_work_length CHECK (length(btrim(work_performed)) BETWEEN 5 AND 4000),
    outcome VARCHAR(20) NOT NULL
        CONSTRAINT it_interventions_outcome_valid CHECK (outcome IN ('RESOLVED', 'PARTIALLY_RESOLVED', 'NOT_RESOLVED', 'ESCALATED')),
    notes TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT it_interventions_target CHECK (ticket_id IS NOT NULL OR asset_id IS NOT NULL)
);

CREATE INDEX idx_it_assets_assigned_to ON public.it_assets(assigned_to);
CREATE INDEX idx_it_assets_department_id ON public.it_assets(department_id);
CREATE INDEX idx_it_assets_status ON public.it_assets(status);
CREATE INDEX idx_it_tickets_requester_id ON public.it_tickets(requester_id);
CREATE INDEX idx_it_tickets_assigned_to ON public.it_tickets(assigned_to);
CREATE INDEX idx_it_tickets_status ON public.it_tickets(status);
CREATE INDEX idx_it_tickets_priority ON public.it_tickets(priority);
CREATE INDEX idx_it_tickets_category_id ON public.it_tickets(category_id);
CREATE INDEX idx_it_tickets_asset_id ON public.it_tickets(asset_id);
CREATE INDEX idx_it_tickets_requester_department_id ON public.it_tickets(requester_department_id);
CREATE INDEX idx_it_tickets_updated_at ON public.it_tickets(updated_at DESC);
CREATE INDEX idx_it_ticket_comments_ticket ON public.it_ticket_comments(ticket_id, created_at);
CREATE INDEX idx_it_ticket_comments_author_id ON public.it_ticket_comments(author_id);
CREATE INDEX idx_it_ticket_events_ticket ON public.it_ticket_events(ticket_id, created_at);
CREATE INDEX idx_it_ticket_events_created_at ON public.it_ticket_events(created_at DESC);
CREATE INDEX idx_it_ticket_events_actor_id ON public.it_ticket_events(actor_id);
CREATE INDEX idx_it_interventions_ticket_id ON public.it_interventions(ticket_id);
CREATE INDEX idx_it_interventions_asset_id ON public.it_interventions(asset_id);
CREATE INDEX idx_it_interventions_technician_id ON public.it_interventions(technician_id);
CREATE INDEX idx_it_interventions_performed_at ON public.it_interventions(performed_at DESC);

CREATE TRIGGER trg_it_ticket_categories_updated_at BEFORE UPDATE ON public.it_ticket_categories
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_it_assets_updated_at BEFORE UPDATE ON public.it_assets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_it_tickets_updated_at BEFORE UPDATE ON public.it_tickets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Categorias de referência (estrutura, não dados operacionais).
INSERT INTO public.it_ticket_categories (code, name, description, sort_order) VALUES
    ('HARDWARE', 'Hardware', 'Computadores, portáteis, monitores e periféricos', 10),
    ('SOFTWARE', 'Software', 'Instalação, licenças e erros de aplicações', 20),
    ('ACCESS', 'Acessos e contas', 'Palavras-passe, permissões e novas contas', 30),
    ('NETWORK', 'Rede e internet', 'Ligação à rede, Wi-Fi e VPN', 40),
    ('PRINTER', 'Impressoras', 'Impressão, digitalização e consumíveis', 50),
    ('EMAIL', 'E-mail', 'Correio eletrónico e calendário', 60),
    ('SYSTEM', 'Sistemas internos', 'Aplicações e sistemas corporativos', 70),
    ('SECURITY', 'Segurança', 'Incidentes e suspeitas de segurança', 80),
    ('OTHER', 'Outro', 'Pedidos que não se enquadram nas restantes categorias', 90);

-- =============================================================================
-- 4. FUNÇÕES INTERNAS
-- =============================================================================
CREATE FUNCTION private.is_it_technician(p_profile_id UUID)
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
        WHERE p.id = p_profile_id
          AND p.is_active
          AND perm.code = 'IT_TICKETS_MANAGE'
    );
$$;

-- Prazo de resolução a partir das definições do sistema.
CREATE FUNCTION private.it_ticket_due_at(p_priority TEXT, p_from TIMESTAMPTZ)
RETURNS TIMESTAMPTZ
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_hours INTEGER;
BEGIN
    SELECT value::INTEGER INTO v_hours FROM public.system_settings WHERE key = 'IT_SLA_HOURS_' || p_priority;
    IF v_hours IS NULL THEN
        RAISE EXCEPTION 'Prazo de resolução não configurado para a prioridade %.', p_priority;
    END IF;
    RETURN p_from + make_interval(hours => v_hours);
END;
$$;

CREATE FUNCTION private.it_priority_label(p_priority TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_priority
        WHEN 'LOW' THEN 'Baixa'
        WHEN 'MEDIUM' THEN 'Média'
        WHEN 'HIGH' THEN 'Alta'
        WHEN 'CRITICAL' THEN 'Crítica'
        ELSE p_priority
    END;
$$;

CREATE FUNCTION private.it_status_label(p_status TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SET search_path = ''
AS $$
    SELECT CASE p_status
        WHEN 'OPEN' THEN 'Aberto'
        WHEN 'IN_PROGRESS' THEN 'Em atendimento'
        WHEN 'WAITING_USER' THEN 'A aguardar colaborador'
        WHEN 'RESOLVED' THEN 'Resolvido'
        WHEN 'CLOSED' THEN 'Fechado'
        ELSE p_status
    END;
$$;

CREATE FUNCTION private.profile_name(p_profile_id UUID)
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT full_name::TEXT FROM public.profiles WHERE id = p_profile_id;
$$;

-- Regista um evento no histórico com o ator da sessão (nunca fornecido pelo cliente).
CREATE FUNCTION private.log_it_ticket_event(
    p_ticket_id UUID,
    p_event_type TEXT,
    p_old_value TEXT,
    p_new_value TEXT,
    p_note TEXT,
    p_is_internal BOOLEAN DEFAULT false
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_actor_id UUID := public.get_current_profile_id();
BEGIN
    INSERT INTO public.it_ticket_events (ticket_id, actor_id, actor_name, event_type, old_value, new_value, note, is_internal)
    VALUES (p_ticket_id, v_actor_id, private.profile_name(v_actor_id), p_event_type, p_old_value, p_new_value,
            nullif(btrim(coalesce(p_note, '')), ''), p_is_internal);
END;
$$;

-- Bloqueia o pedido para alteração por um técnico. Inexistente → mesma resposta que sem permissão.
CREATE FUNCTION private.lock_ticket_for_technician(p_ticket_id UUID)
RETURNS public.it_tickets
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ticket public.it_tickets%ROWTYPE;
BEGIN
    IF public.get_current_profile_id() IS NULL OR NOT public.has_permission('IT_TICKETS_MANAGE') THEN
        RAISE EXCEPTION 'Não tem permissão para tratar pedidos de suporte.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_ticket FROM public.it_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Pedido de suporte não encontrado.' USING ERRCODE = '42501';
    END IF;
    RETURN v_ticket;
END;
$$;

CREATE FUNCTION private.require_open_ticket(p_ticket public.it_tickets)
RETURNS VOID
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    IF p_ticket.status IN ('RESOLVED', 'CLOSED') THEN
        RAISE EXCEPTION 'O pedido % está %: reabra-o antes de o alterar.', p_ticket.reference, lower(private.it_status_label(p_ticket.status));
    END IF;
END;
$$;

-- =============================================================================
-- 5. FUNÇÕES DO FLUXO (API)
-- =============================================================================
CREATE FUNCTION public.create_it_ticket(
    p_title TEXT,
    p_description TEXT,
    p_category_id UUID,
    p_priority TEXT,
    p_asset_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_requester_id UUID := public.get_current_profile_id();
    v_ticket_id UUID;
    v_reference TEXT;
BEGIN
    IF v_requester_id IS NULL OR NOT public.has_permission('IT_TICKET_CREATE') THEN
        RAISE EXCEPTION 'Não tem permissão para abrir pedidos de suporte.' USING ERRCODE = '42501';
    END IF;

    IF p_priority IS NULL OR p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
        RAISE EXCEPTION 'Prioridade inválida.';
    END IF;

    IF NOT EXISTS (SELECT 1 FROM public.it_ticket_categories WHERE id = p_category_id AND active) THEN
        RAISE EXCEPTION 'Categoria inválida ou inativa.';
    END IF;

    -- O colaborador só associa equipamentos que lhe estão atribuídos; o IT associa qualquer um.
    IF p_asset_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.it_assets a
        WHERE a.id = p_asset_id
          AND (a.assigned_to = v_requester_id OR public.has_permission('IT_ASSETS_READ'))
    ) THEN
        RAISE EXCEPTION 'Equipamento não encontrado.' USING ERRCODE = '42501';
    END IF;

    INSERT INTO public.it_tickets (title, description, requester_id, requester_department_id, category_id, priority, asset_id, due_at)
    SELECT btrim(p_title), btrim(p_description), v_requester_id, p.department_id, p_category_id, p_priority, p_asset_id,
           private.it_ticket_due_at(p_priority, now())
    FROM public.profiles p
    WHERE p.id = v_requester_id
    RETURNING id, reference INTO v_ticket_id, v_reference;

    PERFORM private.log_it_ticket_event(v_ticket_id, 'CREATED', NULL, v_reference, NULL);
    RETURN v_ticket_id;
END;
$$;

-- Assumir: atribui ao próprio técnico e inicia o atendimento se ainda estiver aberto.
CREATE FUNCTION public.take_it_ticket(p_ticket_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_ticket public.it_tickets%ROWTYPE := private.lock_ticket_for_technician(p_ticket_id);
BEGIN
    PERFORM private.require_open_ticket(v_ticket);
    IF v_ticket.assigned_to = v_me AND v_ticket.status <> 'OPEN' THEN
        RAISE EXCEPTION 'Já é o técnico responsável por este pedido.';
    END IF;

    IF v_ticket.assigned_to IS DISTINCT FROM v_me THEN
        UPDATE public.it_tickets SET assigned_to = v_me WHERE id = p_ticket_id;
        PERFORM private.log_it_ticket_event(p_ticket_id, 'ASSIGNED',
            coalesce(private.profile_name(v_ticket.assigned_to), 'Sem técnico'), private.profile_name(v_me), NULL);
    END IF;

    IF v_ticket.status = 'OPEN' THEN
        UPDATE public.it_tickets SET status = 'IN_PROGRESS', status_changed_at = now() WHERE id = p_ticket_id;
        PERFORM private.log_it_ticket_event(p_ticket_id, 'STATUS_CHANGED',
            private.it_status_label('OPEN'), private.it_status_label('IN_PROGRESS'), NULL);
    END IF;
END;
$$;

CREATE FUNCTION public.assign_it_ticket(p_ticket_id UUID, p_technician_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ticket public.it_tickets%ROWTYPE;
BEGIN
    IF public.get_current_profile_id() IS NULL OR NOT public.has_permission('IT_TICKETS_ASSIGN') THEN
        RAISE EXCEPTION 'Não tem permissão para atribuir pedidos de suporte.' USING ERRCODE = '42501';
    END IF;
    v_ticket := private.lock_ticket_for_technician(p_ticket_id);
    PERFORM private.require_open_ticket(v_ticket);

    IF p_technician_id IS NULL OR NOT private.is_it_technician(p_technician_id) THEN
        RAISE EXCEPTION 'O responsável tem de ser um técnico de IT ativo.';
    END IF;
    IF v_ticket.assigned_to = p_technician_id THEN
        RAISE EXCEPTION 'O pedido já está atribuído a este técnico.';
    END IF;

    UPDATE public.it_tickets SET assigned_to = p_technician_id WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'ASSIGNED',
        coalesce(private.profile_name(v_ticket.assigned_to), 'Sem técnico'), private.profile_name(p_technician_id), NULL);
END;
$$;

-- Transições de atendimento: OPEN/WAITING_USER → IN_PROGRESS; OPEN/IN_PROGRESS → WAITING_USER (com nota).
CREATE FUNCTION public.change_it_ticket_status(p_ticket_id UUID, p_status TEXT, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_ticket public.it_tickets%ROWTYPE := private.lock_ticket_for_technician(p_ticket_id);
    v_note TEXT := nullif(btrim(coalesce(p_note, '')), '');
BEGIN
    IF p_status IS NULL OR p_status NOT IN ('IN_PROGRESS', 'WAITING_USER') THEN
        RAISE EXCEPTION 'Use as ações próprias para resolver, fechar ou reabrir o pedido.';
    END IF;
    PERFORM private.require_open_ticket(v_ticket);

    IF v_ticket.status = p_status THEN
        RAISE EXCEPTION 'O pedido já está no estado %.', lower(private.it_status_label(p_status));
    END IF;
    IF p_status = 'WAITING_USER' AND v_note IS NULL THEN
        RAISE EXCEPTION 'Indique a informação que o colaborador deve fornecer.';
    END IF;
    IF length(coalesce(v_note, '')) > 2000 THEN
        RAISE EXCEPTION 'A nota não pode exceder 2000 carateres.';
    END IF;

    -- Quem coloca o pedido em atendimento torna-se responsável, se ainda não houver.
    IF v_ticket.assigned_to IS NULL THEN
        UPDATE public.it_tickets SET assigned_to = v_me WHERE id = p_ticket_id;
        PERFORM private.log_it_ticket_event(p_ticket_id, 'ASSIGNED', 'Sem técnico', private.profile_name(v_me), NULL);
    END IF;

    UPDATE public.it_tickets SET status = p_status, status_changed_at = now() WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'STATUS_CHANGED',
        private.it_status_label(v_ticket.status), private.it_status_label(p_status), v_note);
END;
$$;

CREATE FUNCTION public.update_it_ticket_priority(p_ticket_id UUID, p_priority TEXT, p_reason TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ticket public.it_tickets%ROWTYPE := private.lock_ticket_for_technician(p_ticket_id);
    v_reason TEXT := nullif(btrim(coalesce(p_reason, '')), '');
BEGIN
    IF p_priority IS NULL OR p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
        RAISE EXCEPTION 'Prioridade inválida.';
    END IF;
    IF length(coalesce(v_reason, '')) > 1000 THEN
        RAISE EXCEPTION 'O motivo não pode exceder 1000 carateres.';
    END IF;
    PERFORM private.require_open_ticket(v_ticket);
    IF v_ticket.priority = p_priority THEN
        RAISE EXCEPTION 'O pedido já tem prioridade %.', lower(private.it_priority_label(p_priority));
    END IF;

    UPDATE public.it_tickets
    SET priority = p_priority, due_at = private.it_ticket_due_at(p_priority, v_ticket.created_at)
    WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'PRIORITY_CHANGED',
        private.it_priority_label(v_ticket.priority), private.it_priority_label(p_priority), v_reason);
END;
$$;

CREATE FUNCTION public.update_it_ticket_category(p_ticket_id UUID, p_category_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ticket public.it_tickets%ROWTYPE := private.lock_ticket_for_technician(p_ticket_id);
    v_old_name TEXT;
    v_new_name TEXT;
BEGIN
    PERFORM private.require_open_ticket(v_ticket);
    SELECT name INTO v_new_name FROM public.it_ticket_categories WHERE id = p_category_id AND active;
    IF v_new_name IS NULL THEN
        RAISE EXCEPTION 'Categoria inválida ou inativa.';
    END IF;
    IF v_ticket.category_id = p_category_id THEN
        RAISE EXCEPTION 'O pedido já está nesta categoria.';
    END IF;
    SELECT name INTO v_old_name FROM public.it_ticket_categories WHERE id = v_ticket.category_id;

    UPDATE public.it_tickets SET category_id = p_category_id WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'CATEGORY_CHANGED', v_old_name, v_new_name, NULL);
END;
$$;

-- Associa (ou remove, com NULL) o equipamento do pedido.
CREATE FUNCTION public.set_it_ticket_asset(p_ticket_id UUID, p_asset_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ticket public.it_tickets%ROWTYPE := private.lock_ticket_for_technician(p_ticket_id);
    v_old_tag TEXT;
    v_new_tag TEXT;
BEGIN
    PERFORM private.require_open_ticket(v_ticket);
    IF v_ticket.asset_id IS NOT DISTINCT FROM p_asset_id THEN
        RAISE EXCEPTION 'O pedido já tem este equipamento associado.';
    END IF;
    IF p_asset_id IS NOT NULL THEN
        SELECT asset_tag INTO v_new_tag FROM public.it_assets WHERE id = p_asset_id;
        IF v_new_tag IS NULL THEN
            RAISE EXCEPTION 'Equipamento não encontrado.';
        END IF;
    END IF;
    SELECT asset_tag INTO v_old_tag FROM public.it_assets WHERE id = v_ticket.asset_id;

    UPDATE public.it_tickets SET asset_id = p_asset_id WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'ASSET_CHANGED',
        coalesce(v_old_tag, 'Sem equipamento'), coalesce(v_new_tag, 'Sem equipamento'), NULL);
END;
$$;

CREATE FUNCTION public.resolve_it_ticket(p_ticket_id UUID, p_resolution TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_ticket public.it_tickets%ROWTYPE := private.lock_ticket_for_technician(p_ticket_id);
    v_resolution TEXT := btrim(coalesce(p_resolution, ''));
BEGIN
    PERFORM private.require_open_ticket(v_ticket);
    IF length(v_resolution) NOT BETWEEN 5 AND 2000 THEN
        RAISE EXCEPTION 'Descreva a resolução (entre 5 e 2000 carateres).';
    END IF;

    IF v_ticket.assigned_to IS NULL THEN
        UPDATE public.it_tickets SET assigned_to = v_me WHERE id = p_ticket_id;
        PERFORM private.log_it_ticket_event(p_ticket_id, 'ASSIGNED', 'Sem técnico', private.profile_name(v_me), NULL);
    END IF;

    UPDATE public.it_tickets
    SET status = 'RESOLVED', status_changed_at = now(), resolved_at = now(), resolution_summary = v_resolution
    WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'RESOLVED',
        private.it_status_label(v_ticket.status), private.it_status_label('RESOLVED'), v_resolution);
END;
$$;

-- Fechar: o solicitante confirma a resolução, ou o IT encerra um pedido resolvido.
CREATE FUNCTION public.close_it_ticket(p_ticket_id UUID, p_note TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_ticket public.it_tickets%ROWTYPE;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_ticket FROM public.it_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND OR NOT (v_ticket.requester_id = v_me OR public.has_permission('IT_TICKETS_MANAGE')) THEN
        RAISE EXCEPTION 'Pedido de suporte não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_ticket.status <> 'RESOLVED' THEN
        RAISE EXCEPTION 'Apenas pedidos resolvidos podem ser fechados (estado atual: %).', lower(private.it_status_label(v_ticket.status));
    END IF;
    IF length(btrim(coalesce(p_note, ''))) > 1000 THEN
        RAISE EXCEPTION 'A nota não pode exceder 1000 carateres.';
    END IF;

    UPDATE public.it_tickets SET status = 'CLOSED', status_changed_at = now(), closed_at = now() WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'CLOSED',
        private.it_status_label('RESOLVED'), private.it_status_label('CLOSED'), p_note);
END;
$$;

-- Reabrir com motivo: o solicitante reabre um pedido resolvido; o IT reabre resolvidos ou fechados.
CREATE FUNCTION public.reopen_it_ticket(p_ticket_id UUID, p_reason TEXT)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_ticket public.it_tickets%ROWTYPE;
    v_is_technician BOOLEAN := public.has_permission('IT_TICKETS_MANAGE');
    v_reason TEXT := btrim(coalesce(p_reason, ''));
    v_new_status TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_ticket FROM public.it_tickets WHERE id = p_ticket_id FOR UPDATE;
    IF NOT FOUND OR NOT (v_ticket.requester_id = v_me OR v_is_technician) THEN
        RAISE EXCEPTION 'Pedido de suporte não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF v_ticket.status = 'CLOSED' AND NOT v_is_technician THEN
        RAISE EXCEPTION 'Um pedido fechado só pode ser reaberto pela equipa de IT. Abra um novo pedido se o problema persistir.';
    END IF;
    IF v_ticket.status NOT IN ('RESOLVED', 'CLOSED') THEN
        RAISE EXCEPTION 'Apenas pedidos resolvidos ou fechados podem ser reabertos.';
    END IF;
    IF length(v_reason) NOT BETWEEN 5 AND 1000 THEN
        RAISE EXCEPTION 'Indique o motivo da reabertura (entre 5 e 1000 carateres).';
    END IF;

    v_new_status := CASE WHEN v_ticket.assigned_to IS NULL THEN 'OPEN' ELSE 'IN_PROGRESS' END;
    UPDATE public.it_tickets
    SET status = v_new_status, status_changed_at = now(), resolved_at = NULL, closed_at = NULL,
        resolution_summary = NULL, due_at = private.it_ticket_due_at(v_ticket.priority, now())
    WHERE id = p_ticket_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'REOPENED',
        private.it_status_label(v_ticket.status), private.it_status_label(v_new_status), v_reason);
END;
$$;

-- Comentários: o solicitante comenta os próprios pedidos (nunca notas internas); o IT comenta qualquer
-- pedido. Uma resposta do solicitante a um pedido em WAITING_USER devolve-o ao atendimento.
CREATE FUNCTION public.add_it_ticket_comment(p_ticket_id UUID, p_body TEXT, p_is_internal BOOLEAN DEFAULT false)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_ticket public.it_tickets%ROWTYPE;
    v_is_technician BOOLEAN := public.has_permission('IT_TICKETS_MANAGE');
    v_is_requester BOOLEAN;
    v_comment_id UUID;
    v_new_status TEXT;
BEGIN
    IF v_me IS NULL THEN
        RAISE EXCEPTION 'Sessão inválida.' USING ERRCODE = '42501';
    END IF;
    SELECT * INTO v_ticket FROM public.it_tickets WHERE id = p_ticket_id FOR UPDATE;
    v_is_requester := FOUND AND v_ticket.requester_id = v_me;
    IF NOT FOUND OR NOT (v_is_requester OR v_is_technician) THEN
        RAISE EXCEPTION 'Pedido de suporte não encontrado.' USING ERRCODE = '42501';
    END IF;
    IF coalesce(p_is_internal, false) AND NOT v_is_technician THEN
        RAISE EXCEPTION 'Apenas a equipa de IT pode registar notas internas.' USING ERRCODE = '42501';
    END IF;
    IF v_ticket.status = 'CLOSED' THEN
        RAISE EXCEPTION 'O pedido está fechado e já não aceita comentários.';
    END IF;

    INSERT INTO public.it_ticket_comments (ticket_id, author_id, author_name, body, is_internal)
    VALUES (p_ticket_id, v_me, private.profile_name(v_me), btrim(coalesce(p_body, '')), coalesce(p_is_internal, false))
    RETURNING id INTO v_comment_id;
    PERFORM private.log_it_ticket_event(p_ticket_id, 'COMMENTED', NULL, NULL, NULL, coalesce(p_is_internal, false));

    IF v_is_requester AND v_ticket.status = 'WAITING_USER' THEN
        v_new_status := CASE WHEN v_ticket.assigned_to IS NULL THEN 'OPEN' ELSE 'IN_PROGRESS' END;
        UPDATE public.it_tickets SET status = v_new_status, status_changed_at = now() WHERE id = p_ticket_id;
        PERFORM private.log_it_ticket_event(p_ticket_id, 'STATUS_CHANGED',
            private.it_status_label('WAITING_USER'), private.it_status_label(v_new_status), 'Resposta do colaborador');
    ELSE
        UPDATE public.it_tickets SET updated_at = now() WHERE id = p_ticket_id;
    END IF;

    RETURN v_comment_id;
END;
$$;

-- Intervenção técnica ligada a um pedido e/ou a um equipamento. O técnico é sempre o da sessão.
CREATE FUNCTION public.add_it_intervention(
    p_ticket_id UUID,
    p_asset_id UUID,
    p_performed_at TIMESTAMPTZ,
    p_problem_description TEXT,
    p_work_performed TEXT,
    p_outcome TEXT,
    p_notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_me UUID := public.get_current_profile_id();
    v_asset_id UUID := p_asset_id;
    v_reference TEXT;
    v_intervention_id UUID;
BEGIN
    IF v_me IS NULL OR NOT public.has_permission('IT_TICKETS_MANAGE') THEN
        RAISE EXCEPTION 'Não tem permissão para registar intervenções.' USING ERRCODE = '42501';
    END IF;
    IF p_ticket_id IS NULL AND p_asset_id IS NULL THEN
        RAISE EXCEPTION 'Indique o pedido e/ou o equipamento da intervenção.';
    END IF;
    IF p_ticket_id IS NOT NULL THEN
        SELECT reference, coalesce(v_asset_id, asset_id) INTO v_reference, v_asset_id FROM public.it_tickets WHERE id = p_ticket_id;
        IF v_reference IS NULL THEN
            RAISE EXCEPTION 'Pedido de suporte não encontrado.';
        END IF;
    END IF;
    IF p_asset_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM public.it_assets WHERE id = p_asset_id) THEN
        RAISE EXCEPTION 'Equipamento não encontrado.';
    END IF;
    IF p_performed_at IS NULL OR p_performed_at > now() + interval '5 minutes' THEN
        RAISE EXCEPTION 'A data da intervenção não pode ser futura.';
    END IF;

    INSERT INTO public.it_interventions (ticket_id, asset_id, technician_id, technician_name, performed_at,
                                         problem_description, work_performed, outcome, notes)
    VALUES (p_ticket_id, v_asset_id, v_me, private.profile_name(v_me), p_performed_at,
            btrim(coalesce(p_problem_description, '')), btrim(coalesce(p_work_performed, '')), p_outcome,
            btrim(coalesce(p_notes, '')))
    RETURNING id INTO v_intervention_id;

    IF p_ticket_id IS NOT NULL THEN
        PERFORM private.log_it_ticket_event(p_ticket_id, 'INTERVENTION_ADDED', NULL, p_outcome, NULL, true);
    END IF;
    PERFORM private.write_audit_event('it_intervention.created', 'it_interventions', v_intervention_id::TEXT,
        'Intervenção técnica registada' || coalesce(' no pedido ' || v_reference, '')
        || coalesce(' para o equipamento ' || (SELECT asset_tag FROM public.it_assets WHERE id = v_asset_id), ''));
    RETURN v_intervention_id;
END;
$$;

-- Técnicos ativos (nome, cargo e e-mail): para atribuição e para o colaborador saber quem o atende.
CREATE FUNCTION public.list_it_technicians()
RETURNS TABLE (profile_id UUID, full_name TEXT, job_title TEXT, email TEXT)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
    SELECT p.id, p.full_name::TEXT, p.job_title::TEXT, p.email::TEXT
    FROM public.profiles p
    WHERE public.get_current_profile_id() IS NOT NULL
      AND private.is_it_technician(p.id)
    ORDER BY p.full_name;
$$;

-- Indicadores do painel de IT, com as mesmas regras de prazo do servidor.
CREATE FUNCTION public.get_it_dashboard_summary()
RETURNS TABLE (
    open_count INTEGER,
    in_progress_count INTEGER,
    waiting_user_count INTEGER,
    resolved_count INTEGER,
    critical_count INTEGER,
    unassigned_count INTEGER,
    overdue_count INTEGER,
    waiting_too_long_count INTEGER,
    waiting_alert_days INTEGER
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_alert_days INTEGER;
BEGIN
    IF public.get_current_profile_id() IS NULL OR NOT public.has_permission('IT_TICKETS_READ') THEN
        RAISE EXCEPTION 'Não tem permissão para consultar os pedidos de suporte.' USING ERRCODE = '42501';
    END IF;
    SELECT value::INTEGER INTO v_alert_days FROM public.system_settings WHERE key = 'IT_WAITING_USER_ALERT_DAYS';

    RETURN QUERY
    SELECT
        count(*) FILTER (WHERE t.status = 'OPEN')::INTEGER,
        count(*) FILTER (WHERE t.status = 'IN_PROGRESS')::INTEGER,
        count(*) FILTER (WHERE t.status = 'WAITING_USER')::INTEGER,
        count(*) FILTER (WHERE t.status = 'RESOLVED')::INTEGER,
        count(*) FILTER (WHERE t.priority = 'CRITICAL' AND t.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_USER'))::INTEGER,
        count(*) FILTER (WHERE t.assigned_to IS NULL AND t.status IN ('OPEN', 'IN_PROGRESS', 'WAITING_USER'))::INTEGER,
        count(*) FILTER (WHERE t.status IN ('OPEN', 'IN_PROGRESS') AND t.due_at < now())::INTEGER,
        count(*) FILTER (WHERE t.status = 'WAITING_USER'
                         AND t.status_changed_at < now() - make_interval(days => coalesce(v_alert_days, 3)))::INTEGER,
        coalesce(v_alert_days, 3)
    FROM public.it_tickets t;
END;
$$;

-- =============================================================================
-- 6. EQUIPAMENTOS: VALIDAÇÃO E AUDITORIA
-- =============================================================================
CREATE FUNCTION private.guard_it_asset()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    NEW.asset_tag := upper(btrim(NEW.asset_tag));
    NEW.serial_number := nullif(btrim(coalesce(NEW.serial_number, '')), '');
    IF NEW.acquired_on IS NOT NULL AND NEW.acquired_on > current_date THEN
        RAISE EXCEPTION 'A data de aquisição não pode ser futura.';
    END IF;
    IF NEW.assigned_to IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.assigned_to IS DISTINCT FROM OLD.assigned_to)
       AND NOT EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = NEW.assigned_to AND p.is_active) THEN
        RAISE EXCEPTION 'O utilizador responsável não existe ou está inativo.';
    END IF;
    IF NEW.department_id IS NOT NULL
       AND (TG_OP = 'INSERT' OR NEW.department_id IS DISTINCT FROM OLD.department_id)
       AND NOT EXISTS (SELECT 1 FROM public.departments d WHERE d.id = NEW.department_id AND d.active) THEN
        RAISE EXCEPTION 'O departamento selecionado não existe ou está inativo.';
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.created_at <> OLD.created_at THEN
        RAISE EXCEPTION 'A data de registo do equipamento não pode ser alterada.';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_it_assets_guard
    BEFORE INSERT OR UPDATE ON public.it_assets
    FOR EACH ROW EXECUTE FUNCTION private.guard_it_asset();

CREATE FUNCTION private.audit_it_asset_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM private.write_audit_event('it_asset.created', 'it_assets', NEW.id::TEXT,
            'Equipamento registado: ' || NEW.asset_tag);
    ELSIF NEW.status <> OLD.status THEN
        PERFORM private.write_audit_event('it_asset.status_changed', 'it_assets', NEW.id::TEXT,
            'Equipamento ' || NEW.asset_tag || ' passou de ' || OLD.status || ' para ' || NEW.status);
    END IF;
    IF TG_OP = 'UPDATE' AND NEW.assigned_to IS DISTINCT FROM OLD.assigned_to THEN
        PERFORM private.write_audit_event('it_asset.assigned', 'it_assets', NEW.id::TEXT,
            'Equipamento ' || NEW.asset_tag || ' atribuído a ' || coalesce(private.profile_name(NEW.assigned_to), 'ninguém'));
    ELSIF TG_OP = 'UPDATE' AND NEW.status = OLD.status
          AND (NEW.asset_type, NEW.brand, NEW.model, NEW.serial_number, NEW.department_id, NEW.location, NEW.acquired_on, NEW.notes, NEW.asset_tag)
              IS DISTINCT FROM
              (OLD.asset_type, OLD.brand, OLD.model, OLD.serial_number, OLD.department_id, OLD.location, OLD.acquired_on, OLD.notes, OLD.asset_tag) THEN
        PERFORM private.write_audit_event('it_asset.updated', 'it_assets', NEW.id::TEXT,
            'Dados do equipamento ' || NEW.asset_tag || ' atualizados');
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_it_assets_audit
    AFTER INSERT OR UPDATE ON public.it_assets
    FOR EACH ROW EXECUTE FUNCTION private.audit_it_asset_changes();

-- =============================================================================
-- 7. HISTÓRICO → AUDITORIA E NOTIFICAÇÕES
-- =============================================================================
CREATE FUNCTION private.audit_it_ticket_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_reference TEXT;
BEGIN
    -- Comentários e intervenções ficam no histórico do pedido / na sua própria auditoria.
    IF NEW.event_type IN ('COMMENTED', 'INTERVENTION_ADDED') THEN
        RETURN NEW;
    END IF;
    SELECT reference INTO v_reference FROM public.it_tickets WHERE id = NEW.ticket_id;
    PERFORM private.write_audit_event('it_ticket.' || lower(NEW.event_type), 'it_tickets', NEW.ticket_id::TEXT,
        'Pedido ' || v_reference
        || CASE NEW.event_type
               WHEN 'CREATED' THEN ' criado'
               WHEN 'ASSIGNED' THEN ' atribuído a ' || coalesce(NEW.new_value, '—')
               WHEN 'STATUS_CHANGED' THEN ': estado ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—')
               WHEN 'PRIORITY_CHANGED' THEN ': prioridade ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—')
               WHEN 'CATEGORY_CHANGED' THEN ': categoria ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—')
               WHEN 'ASSET_CHANGED' THEN ': equipamento ' || coalesce(NEW.old_value, '—') || ' → ' || coalesce(NEW.new_value, '—')
               WHEN 'RESOLVED' THEN ' resolvido'
               WHEN 'CLOSED' THEN ' fechado'
               WHEN 'REOPENED' THEN ' reaberto. Motivo: ' || coalesce(NEW.note, '—')
               ELSE ''
           END);
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_it_ticket_events_audit
    AFTER INSERT ON public.it_ticket_events
    FOR EACH ROW EXECUTE FUNCTION private.audit_it_ticket_event();

CREATE FUNCTION private.notify_it_ticket_event()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    v_ticket public.it_tickets%ROWTYPE;
    v_label TEXT;
    v_actor_is_requester BOOLEAN;
BEGIN
    IF NEW.is_internal THEN
        RETURN NEW;
    END IF;
    SELECT * INTO v_ticket FROM public.it_tickets WHERE id = NEW.ticket_id;
    v_label := v_ticket.reference || ' — ' || v_ticket.title;
    v_actor_is_requester := NEW.actor_id IS NOT DISTINCT FROM v_ticket.requester_id;

    CASE NEW.event_type
        WHEN 'CREATED' THEN
            INSERT INTO public.notifications (user_id, type, title, message)
            SELECT p.id, 'IT_TICKET_CREATED', 'Novo pedido de suporte', v_label
            FROM public.profiles p
            WHERE private.is_it_technician(p.id) AND p.id <> v_ticket.requester_id;
        WHEN 'ASSIGNED' THEN
            IF v_ticket.assigned_to IS NOT NULL AND v_ticket.assigned_to IS DISTINCT FROM NEW.actor_id THEN
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.assigned_to, 'IT_TICKET_ASSIGNED', 'Pedido de suporte atribuído a si', v_label);
            END IF;
            IF NOT v_actor_is_requester THEN
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.requester_id, 'IT_TICKET_UPDATED', 'O seu pedido tem um técnico responsável',
                        v_label || ': atribuído a ' || coalesce(NEW.new_value, '—'));
            END IF;
        WHEN 'STATUS_CHANGED' THEN
            IF NEW.new_value = private.it_status_label('WAITING_USER') THEN
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.requester_id, 'IT_TICKET_WAITING_USER', 'O IT aguarda a sua resposta',
                        v_label || ': ' || coalesce(NEW.note, ''));
            ELSIF v_actor_is_requester AND v_ticket.assigned_to IS NOT NULL THEN
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.assigned_to, 'IT_TICKET_USER_REPLIED', 'O colaborador respondeu', v_label);
            END IF;
        WHEN 'PRIORITY_CHANGED' THEN
            INSERT INTO public.notifications (user_id, type, title, message)
            VALUES (v_ticket.requester_id, 'IT_TICKET_UPDATED', 'Prioridade do pedido alterada',
                    v_label || ': ' || NEW.old_value || ' → ' || NEW.new_value);
        WHEN 'COMMENTED' THEN
            IF v_actor_is_requester THEN
                -- Resposta a um pedido em espera: a notificação é a da mudança de estado (evita duplicados).
                IF v_ticket.assigned_to IS NOT NULL AND v_ticket.status <> 'WAITING_USER' THEN
                    INSERT INTO public.notifications (user_id, type, title, message)
                    VALUES (v_ticket.assigned_to, 'IT_TICKET_COMMENT', 'Novo comentário do colaborador', v_label);
                END IF;
            ELSE
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.requester_id, 'IT_TICKET_COMMENT', 'Nova mensagem da equipa de IT', v_label);
            END IF;
        WHEN 'RESOLVED' THEN
            INSERT INTO public.notifications (user_id, type, title, message)
            VALUES (v_ticket.requester_id, 'IT_TICKET_RESOLVED', 'Pedido de suporte resolvido',
                    v_label || '. Confirme a resolução ou reabra o pedido.');
        WHEN 'CLOSED' THEN
            IF v_actor_is_requester THEN
                IF v_ticket.assigned_to IS NOT NULL THEN
                    INSERT INTO public.notifications (user_id, type, title, message)
                    VALUES (v_ticket.assigned_to, 'IT_TICKET_CLOSED', 'Resolução confirmada pelo colaborador', v_label);
                END IF;
            ELSE
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.requester_id, 'IT_TICKET_CLOSED', 'Pedido de suporte fechado', v_label);
            END IF;
        WHEN 'REOPENED' THEN
            IF v_actor_is_requester THEN
                INSERT INTO public.notifications (user_id, type, title, message)
                SELECT p.id, 'IT_TICKET_REOPENED', 'Pedido de suporte reaberto', v_label || ': ' || coalesce(NEW.note, '')
                FROM public.profiles p
                WHERE (v_ticket.assigned_to IS NOT NULL AND p.id = v_ticket.assigned_to)
                   OR (v_ticket.assigned_to IS NULL AND private.is_it_technician(p.id));
            ELSE
                INSERT INTO public.notifications (user_id, type, title, message)
                VALUES (v_ticket.requester_id, 'IT_TICKET_REOPENED', 'O seu pedido foi reaberto', v_label || ': ' || coalesce(NEW.note, ''));
            END IF;
        ELSE
            NULL;
    END CASE;
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_it_ticket_events_notify
    AFTER INSERT ON public.it_ticket_events
    FOR EACH ROW EXECUTE FUNCTION private.notify_it_ticket_event();

-- =============================================================================
-- 8. RLS
-- =============================================================================
ALTER TABLE public.it_ticket_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_ticket_comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_ticket_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.it_interventions ENABLE ROW LEVEL SECURITY;

CREATE POLICY it_ticket_categories_select ON public.it_ticket_categories FOR SELECT TO authenticated
USING ((SELECT public.has_permission('SELF_ACCESS')));

-- O colaborador vê os equipamentos que lhe estão atribuídos; o IT vê o inventário.
CREATE POLICY it_assets_select ON public.it_assets FOR SELECT TO authenticated
USING (
    assigned_to = (SELECT public.get_current_profile_id())
    OR (SELECT public.has_permission('IT_ASSETS_READ'))
);

CREATE POLICY it_assets_insert ON public.it_assets FOR INSERT TO authenticated
WITH CHECK ((SELECT public.has_permission('IT_ASSETS_MANAGE')));

CREATE POLICY it_assets_update ON public.it_assets FOR UPDATE TO authenticated
USING ((SELECT public.has_permission('IT_ASSETS_MANAGE')))
WITH CHECK ((SELECT public.has_permission('IT_ASSETS_MANAGE')));

CREATE POLICY it_tickets_select ON public.it_tickets FOR SELECT TO authenticated
USING (
    requester_id = (SELECT public.get_current_profile_id())
    OR (SELECT public.has_permission('IT_TICKETS_READ'))
);

CREATE POLICY it_ticket_comments_select ON public.it_ticket_comments FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('IT_TICKETS_READ'))
    OR (
        NOT is_internal
        AND EXISTS (
            SELECT 1 FROM public.it_tickets t
            WHERE t.id = ticket_id AND t.requester_id = (SELECT public.get_current_profile_id())
        )
    )
);

CREATE POLICY it_ticket_events_select ON public.it_ticket_events FOR SELECT TO authenticated
USING (
    (SELECT public.has_permission('IT_TICKETS_READ'))
    OR (
        NOT is_internal
        AND EXISTS (
            SELECT 1 FROM public.it_tickets t
            WHERE t.id = ticket_id AND t.requester_id = (SELECT public.get_current_profile_id())
        )
    )
);

CREATE POLICY it_interventions_select ON public.it_interventions FOR SELECT TO authenticated
USING ((SELECT public.has_permission('IT_TICKETS_READ')) OR (SELECT public.has_permission('IT_ASSETS_READ')));

-- =============================================================================
-- 9. PRIVILÉGIOS
-- =============================================================================
REVOKE ALL ON public.it_ticket_categories, public.it_assets, public.it_tickets, public.it_ticket_comments,
    public.it_ticket_events, public.it_interventions FROM anon;
REVOKE ALL ON SEQUENCE public.it_asset_tag_seq, public.it_ticket_number_seq FROM anon;

-- Escrita apenas pelas funções do servidor (pedidos, comentários, histórico, intervenções, categorias).
REVOKE INSERT, UPDATE, DELETE ON public.it_ticket_categories, public.it_tickets, public.it_ticket_comments,
    public.it_ticket_events, public.it_interventions FROM authenticated;
-- Equipamentos: sem remoção (abate = estado RETIRED).
REVOKE DELETE ON public.it_assets FROM authenticated;

REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA public FROM PUBLIC, anon;
REVOKE EXECUTE ON ALL FUNCTIONS IN SCHEMA private FROM PUBLIC, anon, authenticated;

-- Reposição das funções privadas necessárias a pedidos da API (políticas e triggers SECURITY INVOKER).
GRANT EXECUTE ON FUNCTION private.can_edit_own_timesheet(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.is_admin_profile(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION private.assert_other_active_admin(UUID) TO authenticated;

-- Funções públicas do módulo IT: apenas utilizadores autenticados (validam permissões internamente).
GRANT EXECUTE ON FUNCTION public.create_it_ticket(TEXT, TEXT, UUID, TEXT, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.take_it_ticket(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_it_ticket(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.change_it_ticket_status(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_it_ticket_priority(UUID, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_it_ticket_category(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.set_it_ticket_asset(UUID, UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.resolve_it_ticket(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.close_it_ticket(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reopen_it_ticket(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_it_ticket_comment(UUID, TEXT, BOOLEAN) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_it_intervention(UUID, UUID, TIMESTAMPTZ, TEXT, TEXT, TEXT, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.list_it_technicians() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_it_dashboard_summary() TO authenticated;
