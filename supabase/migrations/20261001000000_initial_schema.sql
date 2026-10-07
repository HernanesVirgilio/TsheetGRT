-- TsheetGRT · SI Holdings — Esquema inicial
-- Fonte única de verdade do schema: os ficheiros em supabase/migrations, executados por ordem.

-- =============================================================================
-- 1. DEPARTAMENTOS
-- =============================================================================
CREATE TABLE public.departments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(20) NOT NULL UNIQUE
        CONSTRAINT departments_code_format CHECK (code ~ '^[A-Z0-9][A-Z0-9_-]{1,19}$'),
    name VARCHAR(150) NOT NULL
        CONSTRAINT departments_name_not_blank CHECK (length(btrim(name)) > 0),
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 2. PERFIS (ligados a auth.users)
-- =============================================================================
CREATE SEQUENCE public.employee_number_seq;

CREATE TABLE public.profiles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    -- SET NULL preserva o histórico (timesheets, auditoria) se a conta de autenticação for removida.
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL,
    employee_number VARCHAR(50) NOT NULL UNIQUE
        DEFAULT ('SIH-' || lpad(nextval('public.employee_number_seq')::text, 4, '0')),
    full_name VARCHAR(255) NOT NULL
        CONSTRAINT profiles_full_name_not_blank CHECK (length(btrim(full_name)) >= 2),
    email VARCHAR(255) NOT NULL UNIQUE
        CONSTRAINT profiles_email_normalized CHECK (email = lower(btrim(email)) AND email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
    phone VARCHAR(50),
    department_id UUID REFERENCES public.departments(id) ON DELETE RESTRICT,
    job_title VARCHAR(150),
    avatar_url TEXT,
    is_active BOOLEAN NOT NULL DEFAULT true,
    must_change_password BOOLEAN NOT NULL DEFAULT false,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER SEQUENCE public.employee_number_seq OWNED BY public.profiles.employee_number;

-- =============================================================================
-- 3. ROLES, PERMISSÕES E ATRIBUIÇÕES
-- =============================================================================
CREATE TABLE public.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(100) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(100) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    module VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.role_permissions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT role_permissions_unique UNIQUE (role_id, permission_id)
);

-- Cada utilizador tem exatamente um perfil de acesso (a aplicação trabalha com um role por utilizador).
CREATE TABLE public.user_roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE RESTRICT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Âmbito de gestão: que colaboradores/departamentos um gestor supervisiona.
CREATE TABLE public.manager_scopes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT manager_scopes_single_target CHECK (num_nonnulls(employee_id, department_id) = 1),
    CONSTRAINT manager_scopes_not_self CHECK (employee_id IS DISTINCT FROM manager_id)
);

CREATE UNIQUE INDEX manager_scopes_employee_unique
    ON public.manager_scopes(manager_id, employee_id) WHERE employee_id IS NOT NULL;
CREATE UNIQUE INDEX manager_scopes_department_unique
    ON public.manager_scopes(manager_id, department_id) WHERE department_id IS NOT NULL;

-- =============================================================================
-- 4. ATIVIDADES E TIMESHEETS
-- =============================================================================
CREATE TABLE public.activities (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(150) NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    active BOOLEAN NOT NULL DEFAULT true,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.timesheets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'DRAFT'
        CONSTRAINT timesheets_status_valid CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED')),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT timesheets_period_valid CHECK (period_end >= period_start),
    CONSTRAINT timesheets_period_unique UNIQUE (employee_id, period_start, period_end),
    CONSTRAINT timesheets_rejection_has_reason
        CHECK (status <> 'REJECTED' OR length(btrim(coalesce(rejection_reason, ''))) > 0),
    CONSTRAINT timesheets_no_self_approval CHECK (approved_by IS DISTINCT FROM employee_id)
);

CREATE TABLE public.timesheet_entries (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timesheet_id UUID NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    work_date DATE NOT NULL,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER NOT NULL DEFAULT 0
        CONSTRAINT timesheet_entries_break_non_negative CHECK (break_minutes >= 0),
    total_minutes INTEGER NOT NULL
        CONSTRAINT timesheet_entries_total_positive CHECK (total_minutes > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT timesheet_entries_time_range CHECK (end_time > start_time)
);

CREATE TABLE public.timesheet_approvals (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    timesheet_id UUID NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL
        CONSTRAINT timesheet_approvals_status_valid CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    comment TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 5. AUDITORIA, NOTIFICAÇÕES E DEFINIÇÕES
-- =============================================================================
-- Imutável: não existem políticas de UPDATE/DELETE e as inserções só ocorrem
-- através de triggers e funções SECURITY DEFINER (ver migration de RLS).
CREATE TABLE public.audit_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    description TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.notifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.system_settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key VARCHAR(100) NOT NULL UNIQUE,
    value TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- =============================================================================
-- 6. ÍNDICES
-- =============================================================================
CREATE INDEX idx_profiles_department_id ON public.profiles(department_id);
CREATE INDEX idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX idx_role_permissions_permission_id ON public.role_permissions(permission_id);
CREATE INDEX idx_manager_scopes_manager_id ON public.manager_scopes(manager_id);
CREATE INDEX idx_timesheets_status ON public.timesheets(status);
CREATE INDEX idx_timesheets_period ON public.timesheets(period_start, period_end);
CREATE INDEX idx_timesheets_approved_by ON public.timesheets(approved_by);
CREATE INDEX idx_timesheets_rejected_by ON public.timesheets(rejected_by);
CREATE INDEX idx_timesheet_entries_timesheet_id ON public.timesheet_entries(timesheet_id);
CREATE INDEX idx_timesheet_entries_employee_id ON public.timesheet_entries(employee_id);
CREATE INDEX idx_timesheet_entries_activity_id ON public.timesheet_entries(activity_id);
CREATE INDEX idx_timesheet_entries_work_date ON public.timesheet_entries(work_date);
CREATE INDEX idx_timesheet_approvals_timesheet_id ON public.timesheet_approvals(timesheet_id);
CREATE INDEX idx_timesheet_approvals_approver_id ON public.timesheet_approvals(approver_id);
CREATE INDEX idx_notifications_user_id ON public.notifications(user_id, created_at DESC);
CREATE INDEX idx_audit_events_actor ON public.audit_events(actor_user_id);
CREATE INDEX idx_audit_events_action ON public.audit_events(action);
CREATE INDEX idx_audit_events_created_at ON public.audit_events(created_at DESC);

-- =============================================================================
-- 7. TRIGGERS DE INTEGRIDADE
-- =============================================================================
CREATE FUNCTION public.set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_departments_updated_at BEFORE UPDATE ON public.departments
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_profiles_updated_at BEFORE UPDATE ON public.profiles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_roles_updated_at BEFORE UPDATE ON public.roles
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_permissions_updated_at BEFORE UPDATE ON public.permissions
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_activities_updated_at BEFORE UPDATE ON public.activities
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_timesheets_updated_at BEFORE UPDATE ON public.timesheets
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER trg_system_settings_updated_at BEFORE UPDATE ON public.system_settings
    FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- O total de minutos é sempre calculado no servidor, nunca aceite do cliente.
CREATE FUNCTION public.calculate_entry_total_minutes()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_total_minutes INTEGER;
BEGIN
    v_total_minutes := (EXTRACT(EPOCH FROM (NEW.end_time - NEW.start_time)) / 60)::INTEGER - NEW.break_minutes;

    IF v_total_minutes <= 0 THEN
        RAISE EXCEPTION 'O tempo de trabalho efetivo tem de ser superior a zero após o desconto da pausa.';
    END IF;

    NEW.total_minutes := v_total_minutes;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_timesheet_entries_total_minutes
    BEFORE INSERT OR UPDATE ON public.timesheet_entries
    FOR EACH ROW EXECUTE FUNCTION public.calculate_entry_total_minutes();

-- Os apontamentos têm de pertencer ao mesmo colaborador do timesheet e ao período deste.
CREATE FUNCTION public.validate_timesheet_entry()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = ''
AS $$
DECLARE
    v_timesheet public.timesheets%ROWTYPE;
BEGIN
    SELECT * INTO v_timesheet FROM public.timesheets WHERE id = NEW.timesheet_id;

    IF NEW.employee_id <> v_timesheet.employee_id THEN
        RAISE EXCEPTION 'O apontamento tem de pertencer ao colaborador do timesheet.';
    END IF;

    IF NEW.work_date NOT BETWEEN v_timesheet.period_start AND v_timesheet.period_end THEN
        RAISE EXCEPTION 'A data do apontamento está fora do período do timesheet.';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER trg_timesheet_entries_validate
    BEFORE INSERT OR UPDATE ON public.timesheet_entries
    FOR EACH ROW EXECUTE FUNCTION public.validate_timesheet_entry();

-- Funções internas de trigger não devem ser invocáveis via API.
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.calculate_entry_total_minutes() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.validate_timesheet_entry() FROM PUBLIC, anon, authenticated;
