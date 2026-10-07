-- ==============================================================================
-- SI HOLDINGS TIMESHEET - ESQUEMA COMPLETO CONSOLIDADO (POSTGRESQL / SUPABASE)
-- Execute este script no SQL Editor do projeto Supabase:
-- https://supabase.com/dashboard/project/iahgopefwixbprfzcwbd/sql/new
-- ==============================================================================

-- 0. EXTENSÕES
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. DEPARTAMENTOS
CREATE TABLE IF NOT EXISTS public.departments (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT DEFAULT '',
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 2. PERFIS (Vinculados a auth.users do Supabase)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    auth_user_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    employee_number VARCHAR(50) UNIQUE,
    full_name VARCHAR(255) NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    phone VARCHAR(50),
    department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL,
    job_title VARCHAR(150),
    avatar_url TEXT,
    is_active BOOLEAN DEFAULT true NOT NULL,
    must_change_password BOOLEAN DEFAULT false NOT NULL,
    last_login_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 3. ROLES (Perfis de Acesso)
CREATE TABLE IF NOT EXISTS public.roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(100) NOT NULL,
    description TEXT DEFAULT '',
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 4. PERMISSÕES
CREATE TABLE IF NOT EXISTS public.permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(100) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT DEFAULT '',
    module VARCHAR(100) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 5. RELAÇÃO ROLE <-> PERMISSÕES
CREATE TABLE IF NOT EXISTS public.role_permissions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    permission_id UUID NOT NULL REFERENCES public.permissions(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_role_permission UNIQUE (role_id, permission_id)
);

-- 6. RELAÇÃO UTILIZADOR <-> ROLE
CREATE TABLE IF NOT EXISTS public.user_roles (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    role_id UUID NOT NULL REFERENCES public.roles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT uq_user_role UNIQUE (user_id, role_id)
);

-- 7. ÂMBITO DE GESTÃO (Manager Scope)
CREATE TABLE IF NOT EXISTS public.manager_scopes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    manager_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    employee_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    department_id UUID REFERENCES public.departments(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_manager_scope_target CHECK (employee_id IS NOT NULL OR department_id IS NOT NULL)
);

-- 8. ATIVIDADES / PROJETOS DE TIMESHEET
CREATE TABLE IF NOT EXISTS public.activities (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    code VARCHAR(50) UNIQUE NOT NULL,
    name VARCHAR(150) NOT NULL,
    description TEXT DEFAULT '',
    active BOOLEAN DEFAULT true NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 9. FOLHAS DE PONTO (Timesheets)
CREATE TABLE IF NOT EXISTS public.timesheets (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    period_start DATE NOT NULL,
    period_end DATE NOT NULL,
    status VARCHAR(30) DEFAULT 'DRAFT' NOT NULL CHECK (status IN ('DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED')),
    submitted_at TIMESTAMPTZ,
    approved_at TIMESTAMPTZ,
    approved_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejected_at TIMESTAMPTZ,
    rejected_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    rejection_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_timesheet_period CHECK (period_end >= period_start)
);

-- 10. APONTAMENTOS DIÁRIOS (Timesheet Entries)
CREATE TABLE IF NOT EXISTS public.timesheet_entries (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timesheet_id UUID NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
    employee_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    work_date DATE NOT NULL,
    activity_id UUID NOT NULL REFERENCES public.activities(id) ON DELETE RESTRICT,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    break_minutes INTEGER DEFAULT 0 NOT NULL CHECK (break_minutes >= 0),
    total_minutes INTEGER NOT NULL CHECK (total_minutes > 0),
    description TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    CONSTRAINT chk_entry_time_range CHECK (end_time > start_time)
);

-- 11. REGISTOS FORMAIS DE APROVAÇÃO
CREATE TABLE IF NOT EXISTS public.timesheet_approvals (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    timesheet_id UUID NOT NULL REFERENCES public.timesheets(id) ON DELETE CASCADE,
    approver_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
    status VARCHAR(30) NOT NULL CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED')),
    comment TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 12. EVENTOS IMUTÁVEIS DE AUDITORIA
CREATE TABLE IF NOT EXISTS public.audit_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    actor_user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    entity_type VARCHAR(100) NOT NULL,
    entity_id VARCHAR(100),
    description TEXT NOT NULL,
    ip_address VARCHAR(45),
    user_agent TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 13. NOTIFICAÇÕES
CREATE TABLE IF NOT EXISTS public.notifications (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL,
    title VARCHAR(200) NOT NULL,
    message TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- 14. DEFINIÇÕES GLOBAIS DO SISTEMA
CREATE TABLE IF NOT EXISTS public.system_settings (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    key VARCHAR(100) UNIQUE NOT NULL,
    value TEXT NOT NULL,
    description TEXT DEFAULT '',
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);

-- ÍNDICES DE PERFORMANCE
CREATE INDEX IF NOT EXISTS idx_profiles_email ON public.profiles(email);
CREATE INDEX IF NOT EXISTS idx_profiles_department_id ON public.profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_user_id ON public.user_roles(user_id);
CREATE INDEX IF NOT EXISTS idx_user_roles_role_id ON public.user_roles(role_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_employee_id ON public.timesheets(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheets_status ON public.timesheets(status);
CREATE INDEX IF NOT EXISTS idx_timesheets_period ON public.timesheets(period_start, period_end);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_timesheet_id ON public.timesheet_entries(timesheet_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_employee_id ON public.timesheet_entries(employee_id);
CREATE INDEX IF NOT EXISTS idx_timesheet_entries_work_date ON public.timesheet_entries(work_date);
CREATE INDEX IF NOT EXISTS idx_notifications_user_id ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_read_at ON public.notifications(read_at);
CREATE INDEX IF NOT EXISTS idx_audit_events_actor ON public.audit_events(actor_user_id);
CREATE INDEX IF NOT EXISTS idx_audit_events_action ON public.audit_events(action);
CREATE INDEX IF NOT EXISTS idx_audit_events_created_at ON public.audit_events(created_at DESC);

-- TRIGGER DE CÁLCULO DE HORAS
CREATE OR REPLACE FUNCTION public.fn_calculate_entry_total_minutes()
RETURNS TRIGGER AS $$
DECLARE
    v_start_minutes INTEGER;
    v_end_minutes INTEGER;
    v_calc_minutes INTEGER;
BEGIN
    v_start_minutes := (EXTRACT(HOUR FROM NEW.start_time) * 60) + EXTRACT(MINUTE FROM NEW.start_time);
    v_end_minutes := (EXTRACT(HOUR FROM NEW.end_time) * 60) + EXTRACT(MINUTE FROM NEW.end_time);
    v_calc_minutes := (v_end_minutes - v_start_minutes) - NEW.break_minutes;

    IF v_calc_minutes <= 0 THEN
        RAISE EXCEPTION 'O tempo de trabalho efetivo tem de ser superior a zero após o desconto da pausa.';
    END IF;

    NEW.total_minutes := v_calc_minutes;
    NEW.updated_at := NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_calc_entry_minutes ON public.timesheet_entries;
CREATE TRIGGER trg_calc_entry_minutes
BEFORE INSERT OR UPDATE ON public.timesheet_entries
FOR EACH ROW
EXECUTE FUNCTION public.fn_calculate_entry_total_minutes();

-- FUNÇÕES DE AUTORIZAÇÃO / RLS
CREATE OR REPLACE FUNCTION public.get_current_profile_id()
RETURNS UUID AS $$
    SELECT id FROM public.profiles WHERE auth_user_id = auth.uid() LIMIT 1;
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.has_permission(p_permission_code TEXT)
RETURNS BOOLEAN AS $$
DECLARE
    v_has BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1
        FROM public.profiles p
        JOIN public.user_roles ur ON ur.user_id = p.id
        JOIN public.roles r ON r.id = ur.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions perm ON perm.id = rp.permission_id
        WHERE p.auth_user_id = auth.uid()
          AND p.is_active = true
          AND (perm.code = p_permission_code OR perm.code = 'ADMIN_ACCESS')
    ) INTO v_has;
    RETURN COALESCE(v_has, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_manager_of_employee(p_employee_id UUID)
RETURNS BOOLEAN AS $$
DECLARE
    v_is_mgr BOOLEAN;
    v_my_profile_id UUID;
BEGIN
    v_my_profile_id := public.get_current_profile_id();
    IF v_my_profile_id IS NULL THEN
        RETURN false;
    END IF;

    SELECT EXISTS (
        SELECT 1
        FROM public.manager_scopes ms
        JOIN public.profiles emp ON emp.id = p_employee_id
        WHERE ms.manager_id = v_my_profile_id
          AND (
            ms.employee_id = p_employee_id
            OR ms.department_id = emp.department_id
          )
    ) INTO v_is_mgr;

    RETURN COALESCE(v_is_mgr, false);
END;
$$ LANGUAGE plpgsql STABLE SECURITY DEFINER;

-- ATIVAÇÃO DE RLS
ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.manager_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_entries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.timesheet_approvals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;

-- POLÍTICAS RLS
DROP POLICY IF EXISTS "Departments viewable" ON public.departments;
CREATE POLICY "Departments viewable" ON public.departments FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Departments manageable by admins" ON public.departments;
CREATE POLICY "Departments manageable by admins" ON public.departments FOR ALL TO authenticated USING (public.has_permission('DEPARTMENTS_MANAGE'));

DROP POLICY IF EXISTS "Profiles read policy" ON public.profiles;
CREATE POLICY "Profiles read policy" ON public.profiles FOR SELECT TO authenticated
USING (auth_user_id = auth.uid() OR public.has_permission('USERS_READ') OR public.is_manager_of_employee(id));

DROP POLICY IF EXISTS "Profiles update policy" ON public.profiles;
CREATE POLICY "Profiles update policy" ON public.profiles FOR UPDATE TO authenticated
USING (auth_user_id = auth.uid() OR public.has_permission('USERS_UPDATE'));

DROP POLICY IF EXISTS "Roles viewable" ON public.roles;
CREATE POLICY "Roles viewable" ON public.roles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Permissions viewable" ON public.permissions;
CREATE POLICY "Permissions viewable" ON public.permissions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Activities viewable" ON public.activities;
CREATE POLICY "Activities viewable" ON public.activities FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Timesheets select" ON public.timesheets;
CREATE POLICY "Timesheets select" ON public.timesheets FOR SELECT TO authenticated
USING (employee_id = public.get_current_profile_id() OR (public.has_permission('TEAM_TIMESHEET_READ') AND public.is_manager_of_employee(employee_id)) OR public.has_permission('REPORTS_READ'));

DROP POLICY IF EXISTS "Timesheets insert" ON public.timesheets;
CREATE POLICY "Timesheets insert" ON public.timesheets FOR INSERT TO authenticated
WITH CHECK (employee_id = public.get_current_profile_id() AND public.has_permission('SELF_TIMESHEET_CREATE'));

DROP POLICY IF EXISTS "Timesheets update" ON public.timesheets;
CREATE POLICY "Timesheets update" ON public.timesheets FOR UPDATE TO authenticated
USING ((employee_id = public.get_current_profile_id() AND status IN ('DRAFT', 'REJECTED')) OR (public.is_manager_of_employee(employee_id) AND public.has_permission('TEAM_TIMESHEET_APPROVE')) OR public.has_permission('ADMIN_ACCESS'));

DROP POLICY IF EXISTS "Timesheet entries select" ON public.timesheet_entries;
CREATE POLICY "Timesheet entries select" ON public.timesheet_entries FOR SELECT TO authenticated
USING (employee_id = public.get_current_profile_id() OR (public.has_permission('TEAM_TIMESHEET_READ') AND public.is_manager_of_employee(employee_id)) OR public.has_permission('REPORTS_READ'));

DROP POLICY IF EXISTS "Timesheet entries insert" ON public.timesheet_entries;
CREATE POLICY "Timesheet entries insert" ON public.timesheet_entries FOR INSERT TO authenticated
WITH CHECK (employee_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "Timesheet entries update" ON public.timesheet_entries;
CREATE POLICY "Timesheet entries update" ON public.timesheet_entries FOR UPDATE TO authenticated
USING (employee_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "Timesheet entries delete" ON public.timesheet_entries;
CREATE POLICY "Timesheet entries delete" ON public.timesheet_entries FOR DELETE TO authenticated
USING (employee_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "Audit logs readable" ON public.audit_events;
CREATE POLICY "Audit logs readable" ON public.audit_events FOR SELECT TO authenticated USING (public.has_permission('AUDIT_READ'));

DROP POLICY IF EXISTS "Audit events insertable" ON public.audit_events;
CREATE POLICY "Audit events insertable" ON public.audit_events FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Notifications viewable" ON public.notifications;
CREATE POLICY "Notifications viewable" ON public.notifications FOR SELECT TO authenticated USING (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "Notifications updatable" ON public.notifications;
CREATE POLICY "Notifications updatable" ON public.notifications FOR UPDATE TO authenticated USING (user_id = public.get_current_profile_id());

DROP POLICY IF EXISTS "Settings readable" ON public.system_settings;
CREATE POLICY "Settings readable" ON public.system_settings FOR SELECT TO authenticated USING (true);

-- CARGA INICIAL (SEEDS)
INSERT INTO public.departments (id, code, name, description, active) VALUES
('d1111111-1111-1111-1111-111111111111', 'IT', 'Tecnologias de Informação', 'Infraestrutura tecnológica, sistemas corporativos e suporte', true),
('d2222222-2222-2222-2222-222222222222', 'RH', 'Recursos Humanos', 'Gestão de pessoas, talento e desenvolvimento organizacional', true),
('d3333333-3333-3333-3333-333333333333', 'FIN', 'Finanças', 'Gestão financeira, tesouraria e contabilidade', true),
('d4444444-4444-4444-4444-444444444444', 'OPS', 'Operações', 'Operações transversais e logística empresarial', true),
('d5555555-5555-5555-5555-555555555555', 'ESG', 'ESG', 'Sustentabilidade ambiental, responsabilidade social e governança', true),
('d6666666-6666-6666-6666-666666666666', 'MKT', 'Marketing & Sales', 'Marketing corporativo, comunicação e promoção', true),
('d7777777-7777-7777-7777-777777777777', 'COM', 'Comercial', 'Desenvolvimento de negócios e parcerias comerciais', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.roles (id, code, name, description) VALUES
('r1111111-1111-1111-1111-111111111111', 'ADMIN', 'ADMIN', 'Acesso administrativo global ao sistema'),
('r2222222-2222-2222-2222-222222222222', 'IT', 'IT', 'Gestão técnica, auditoria técnica e saúde do sistema'),
('r3333333-3333-3333-3333-333333333333', 'MANAGER', 'MANAGER', 'Gestão da equipa, revisão e aprovação de timesheets'),
('r4444444-4444-4444-4444-444444444444', 'EMPLOYEE', 'COLABORADOR', 'Registo diário de horas e submissão do timesheet')
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.permissions (id, code, name, description, module) VALUES
('p0100000-0000-0000-0000-000000000001', 'SELF_ACCESS', 'Acesso Geral Pessoal', 'Acesso à área pessoal do sistema', 'core'),
('p0100000-0000-0000-0000-000000000002', 'SELF_PROFILE_READ', 'Visualizar Perfil Próprio', 'Ver os próprios dados de perfil', 'profile'),
('p0100000-0000-0000-0000-000000000003', 'SELF_PROFILE_UPDATE', 'Atualizar Perfil Próprio', 'Alterar dados de contacto próprios', 'profile'),
('p0100000-0000-0000-0000-000000000004', 'SELF_TIMESHEET_READ', 'Ver Próprio Timesheet', 'Visualizar timesheets pessoais', 'timesheet'),
('p0100000-0000-0000-0000-000000000005', 'SELF_TIMESHEET_CREATE', 'Criar Próprio Timesheet', 'Criar e preencher novos registos de horas', 'timesheet'),
('p0100000-0000-0000-0000-000000000006', 'SELF_TIMESHEET_UPDATE', 'Editar Próprio Timesheet', 'Modificar registos de horas em rascunho', 'timesheet'),
('p0100000-0000-0000-0000-000000000007', 'SELF_TIMESHEET_SUBMIT', 'Submeter Próprio Timesheet', 'Enviar timesheet para aprovação', 'timesheet'),
('p0200000-0000-0000-0000-000000000001', 'TEAM_READ', 'Visualizar Equipa', 'Ver lista de membros da equipa', 'team'),
('p0200000-0000-0000-0000-000000000002', 'TEAM_TIMESHEET_READ', 'Ver Timesheets da Equipa', 'Visualizar timesheets da equipa', 'team'),
('p0200000-0000-0000-0000-000000000003', 'TEAM_TIMESHEET_REVIEW', 'Rever Timesheets da Equipa', 'Analisar registos submetidos', 'approvals'),
('p0200000-0000-0000-0000-000000000004', 'TEAM_TIMESHEET_APPROVE', 'Aprovar Timesheets', 'Aprovar submissões de timesheet', 'approvals'),
('p0200000-0000-0000-0000-000000000005', 'TEAM_TIMESHEET_REJECT', 'Rejeitar Timesheets', 'Rejeitar submissões com justificação', 'approvals'),
('p0300000-0000-0000-0000-000000000001', 'USERS_READ', 'Listar Utilizadores', 'Visualizar lista de utilizadores', 'users'),
('p0300000-0000-0000-0000-000000000002', 'USERS_CREATE', 'Criar Utilizadores', 'Criar novas contas no sistema', 'users'),
('p0300000-0000-0000-0000-000000000003', 'USERS_UPDATE', 'Editar Utilizadores', 'Editar dados de utilizadores', 'users'),
('p0300000-0000-0000-0000-000000000004', 'USERS_DISABLE', 'Ativar/Desativar Utilizadores', 'Gerir estado de ativação de contas', 'users'),
('p0300000-0000-0000-0000-000000000005', 'USERS_ASSIGN_ROLE', 'Atribuir Roles', 'Modificar perfis de acesso', 'users'),
('p0400000-0000-0000-0000-000000000001', 'ROLES_READ', 'Listar Roles', 'Visualizar perfis existentes', 'roles'),
('p0400000-0000-0000-0000-000000000002', 'ROLES_MANAGE', 'Gerir Roles', 'Criar e atualizar roles', 'roles'),
('p0400000-0000-0000-0000-000000000003', 'PERMISSIONS_READ', 'Listar Permissões', 'Visualizar permissões do sistema', 'permissions'),
('p0400000-0000-0000-0000-000000000004', 'PERMISSIONS_MANAGE', 'Gerir Permissões', 'Configurar permissões de roles', 'permissions'),
('p0500000-0000-0000-0000-000000000001', 'DEPARTMENTS_READ', 'Listar Departamentos', 'Visualizar departamentos', 'departments'),
('p0500000-0000-0000-0000-000000000002', 'DEPARTMENTS_MANAGE', 'Gerir Departamentos', 'Criar e editar departamentos', 'departments'),
('p0600000-0000-0000-0000-000000000001', 'AUDIT_READ', 'Consultar Auditoria', 'Visualizar registos de auditoria', 'audit'),
('p0700000-0000-0000-0000-000000000001', 'SYSTEM_HEALTH_READ', 'Ver Saúde do Sistema', 'Consultar diagnóstico do sistema', 'health'),
('p0700000-0000-0000-0000-000000000002', 'SYSTEM_SETTINGS_READ', 'Ver Configurações', 'Visualizar definições da organização', 'settings'),
('p0700000-0000-0000-0000-000000000003', 'SYSTEM_SETTINGS_MANAGE', 'Gerir Configurações', 'Modificar definições do sistema', 'settings'),
('p0800000-0000-0000-0000-000000000001', 'REPORTS_READ', 'Aceder a Relatórios', 'Consultar relatórios de timesheet', 'reports'),
('p0800000-0000-0000-0000-000000000002', 'REPORTS_EXPORT', 'Exportar Relatórios', 'Exportar dados para CSV', 'reports'),
('p0900000-0000-0000-0000-000000000001', 'ADMIN_ACCESS', 'Acesso Superadministrador', 'Acesso administrativo total', 'admin')
ON CONFLICT (code) DO NOTHING;

-- PERMISSÕES POR ROLE
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'EMPLOYEE' AND p.code IN ('SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE', 'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'MANAGER' AND p.code IN ('SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE', 'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT', 'TEAM_READ', 'TEAM_TIMESHEET_READ', 'TEAM_TIMESHEET_REVIEW', 'TEAM_TIMESHEET_APPROVE', 'TEAM_TIMESHEET_REJECT', 'REPORTS_READ')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'IT' AND p.code IN ('SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE', 'USERS_READ', 'SYSTEM_HEALTH_READ', 'AUDIT_READ')
ON CONFLICT DO NOTHING;

INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

INSERT INTO public.activities (id, code, name, description, active) VALUES
('a1111111-1111-1111-1111-111111111111', 'ACT-OPS-01', 'Operações & Logística', 'Coordenação de processos operacionais diários', true),
('a2222222-2222-2222-2222-222222222222', 'ACT-DEV-02', 'Desenvolvimento & Manutenção IT', 'Programação, melhorias contínuas e suporte técnico', true),
('a3333333-3333-3333-3333-333333333333', 'ACT-FIN-03', 'Gestão Financeira & Auditoria', 'Revisão orçamental, reconciliação e análise', true),
('a4444444-4444-4444-4444-444444444444', 'ACT-ESG-04', 'Iniciativas ESG & Sustentabilidade', 'Monitorização de métricas e conformidade sustentável', true),
('a5555555-5555-5555-5555-555555555555', 'ACT-COM-05', 'Reuniões & Prospeção Comercial', 'Negociação de propostas e clientes corporativos', true),
('a6666666-6666-6666-6666-666666666666', 'ACT-ADM-06', 'Coordenação Administrativa & RH', 'Gestão documental, apoio a colaboradores e reporte', true)
ON CONFLICT (code) DO NOTHING;

INSERT INTO public.system_settings (key, value, description) VALUES
('COMPANY_NAME', 'SI Holdings', 'Nome institucional da organização'),
('DEFAULT_TIMEZONE', 'Africa/Maputo', 'Fuso horário operacional padrão'),
('DEFAULT_LANGUAGE', 'pt-PT', 'Idioma primário da plataforma'),
('TIMESHEET_PERIOD_TYPE', 'MONTHLY', 'Tipo de ciclo de submissão do timesheet'),
('TIMESHEET_DAILY_TARGET_HOURS', '8', 'Horas diárias recomendadas de trabalho'),
('ALLOW_WEEKEND_ENTRIES', 'true', 'Permitir registo de horas ao fim de semana')
ON CONFLICT (key) DO NOTHING;
