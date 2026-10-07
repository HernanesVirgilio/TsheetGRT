-- SI HOLDINGS TIMESHEET - SEED DATA
-- PostgreSQL / Supabase Migration

-- 1. DEPARTMENTS
INSERT INTO public.departments (id, code, name, description, active) VALUES
('d1111111-1111-1111-1111-111111111111', 'IT', 'Tecnologias de Informação', 'Infraestrutura tecnológica, sistemas e suporte', true),
('d2222222-2222-2222-2222-222222222222', 'RH', 'Recursos Humanos', 'Gestão de pessoas, talento e desenvolvimento organizacional', true),
('d3333333-3333-3333-3333-333333333333', 'FIN', 'Finanças', 'Gestão financeira, tesouraria e contabilidade', true),
('d4444444-4444-4444-4444-444444444444', 'OPS', 'Operações', 'Operações transversais e logística empresarial', true),
('d5555555-5555-5555-5555-555555555555', 'ESG', 'ESG', 'Sustentabilidade ambiental, responsabilidade social e governança', true),
('d6666666-6666-6666-6666-666666666666', 'MKT', 'Marketing & Sales', 'Marketing corporativo, comunicação e promoção', true),
('d7777777-7777-7777-7777-777777777777', 'COM', 'Comercial', 'Desenvolvimento de negócios e parcerias comerciais', true)
ON CONFLICT (code) DO NOTHING;

-- 2. ROLES
INSERT INTO public.roles (id, code, name, description) VALUES
('r1111111-1111-1111-1111-111111111111', 'ADMIN', 'ADMIN', 'Acesso administrativo global ao sistema e configurações'),
('r2222222-2222-2222-2222-222222222222', 'IT', 'IT', 'Gestão técnica, auditoria técnica e saúde do sistema'),
('r3333333-3333-3333-3333-333333333333', 'MANAGER', 'MANAGER', 'Gestão da equipa, revisão e aprovação de timesheets'),
('r4444444-4444-4444-4444-444444444444', 'EMPLOYEE', 'COLABORADOR', 'Registo diário de horas e submissão do timesheet')
ON CONFLICT (code) DO NOTHING;

-- 3. PERMISSIONS
INSERT INTO public.permissions (id, code, name, description, module) VALUES
('p0100000-0000-0000-0000-000000000001', 'SELF_ACCESS', 'Acesso Geral Pessoal', 'Acesso à área pessoal do sistema', 'core'),
('p0100000-0000-0000-0000-000000000002', 'SELF_PROFILE_READ', 'Visualizar Perfil Próprio', 'Ver os próprios dados de perfil', 'profile'),
('p0100000-0000-0000-0000-000000000003', 'SELF_PROFILE_UPDATE', 'Atualizar Perfil Próprio', 'Alterar dados de contacto próprios', 'profile'),
('p0100000-0000-0000-0000-000000000004', 'SELF_TIMESHEET_READ', 'Ver Próprio Timesheet', 'Visualizar timesheets pessoais', 'timesheet'),
('p0100000-0000-0000-0000-000000000005', 'SELF_TIMESHEET_CREATE', 'Criar Próprio Timesheet', 'Criar e preencher novos registos de horas', 'timesheet'),
('p0100000-0000-0000-0000-000000000006', 'SELF_TIMESHEET_UPDATE', 'Editar Próprio Timesheet', 'Modificar registos de horas em rascunho', 'timesheet'),
('p0100000-0000-0000-0000-000000000007', 'SELF_TIMESHEET_SUBMIT', 'Submeter Próprio Timesheet', 'Enviar timesheet para aprovação', 'timesheet'),

('p0200000-0000-0000-0000-000000000001', 'TEAM_READ', 'Visualizar Equipa', 'Ver lista e detalhes de membros da equipa', 'team'),
('p0200000-0000-0000-0000-000000000002', 'TEAM_TIMESHEET_READ', 'Ver Timesheets da Equipa', 'Visualizar timesheets dos colaboradores sob gestão', 'team'),
('p0200000-0000-0000-0000-000000000003', 'TEAM_TIMESHEET_REVIEW', 'Rever Timesheets da Equipa', 'Analisar registos submetidos pela equipa', 'approvals'),
('p0200000-0000-0000-0000-000000000004', 'TEAM_TIMESHEET_APPROVE', 'Aprovar Timesheets', 'Aprovar submissões de timesheet da equipa', 'approvals'),
('p0200000-0000-0000-0000-000000000005', 'TEAM_TIMESHEET_REJECT', 'Rejeitar Timesheets', 'Rejeitar submissões com justificação', 'approvals'),

('p0300000-0000-0000-0000-000000000001', 'USERS_READ', 'Listar Utilizadores', 'Visualizar lista e detalhes de utilizadores', 'users'),
('p0300000-0000-0000-0000-000000000002', 'USERS_CREATE', 'Criar Utilizadores', 'Criar novas contas no sistema', 'users'),
('p0300000-0000-0000-0000-000000000003', 'USERS_UPDATE', 'Editar Utilizadores', 'Editar dados de utilizadores', 'users'),
('p0300000-0000-0000-0000-000000000004', 'USERS_DISABLE', 'Ativar/Desativar Utilizadores', 'Gerir estado de ativação de contas', 'users'),
('p0300000-0000-0000-0000-000000000005', 'USERS_ASSIGN_ROLE', 'Atribuir Roles', 'Modificar perfis de acesso e roles de utilizadores', 'users'),

('p0400000-0000-0000-0000-000000000001', 'ROLES_READ', 'Listar Roles', 'Visualizar perfis de acesso existentes', 'roles'),
('p0400000-0000-0000-0000-000000000002', 'ROLES_MANAGE', 'Gerir Roles', 'Criar e atualizar roles do sistema', 'roles'),
('p0400000-0000-0000-0000-000000000003', 'PERMISSIONS_READ', 'Listar Permissões', 'Visualizar mapa de permissões do sistema', 'permissions'),
('p0400000-0000-0000-0000-000000000004', 'PERMISSIONS_MANAGE', 'Gerir Permissões', 'Configurar permissões atribuídas a roles', 'permissions'),

('p0500000-0000-0000-0000-000000000001', 'DEPARTMENTS_READ', 'Listar Departamentos', 'Visualizar estrutura de departamentos', 'departments'),
('p0500000-0000-0000-0000-000000000002', 'DEPARTMENTS_MANAGE', 'Gerir Departamentos', 'Criar e atualizar departamentos', 'departments'),

('p0600000-0000-0000-0000-000000000001', 'AUDIT_READ', 'Consultar Auditoria', 'Visualizar registos imutáveis de auditoria', 'audit'),

('p0700000-0000-0000-0000-000000000001', 'SYSTEM_HEALTH_READ', 'Ver Saúde do Sistema', 'Consultar diagnóstico e integridade do sistema', 'health'),
('p0700000-0000-0000-0000-000000000002', 'SYSTEM_SETTINGS_READ', 'Ver Configurações', 'Visualizar definições globais da organização', 'settings'),
('p0700000-0000-0000-0000-000000000003', 'SYSTEM_SETTINGS_MANAGE', 'Gerir Configurações', 'Modificar definições do sistema', 'settings'),

('p0800000-0000-0000-0000-000000000001', 'REPORTS_READ', 'Aceder a Relatórios', 'Consultar relatórios analíticos de timesheet', 'reports'),
('p0800000-0000-0000-0000-000000000002', 'REPORTS_EXPORT', 'Exportar Relatórios', 'Exportar dados consolidados em formato CSV', 'reports'),

('p0900000-0000-0000-0000-000000000001', 'ADMIN_ACCESS', 'Acesso de Superadministrador', 'Acesso administrativo amplo a todas as áreas', 'admin')
ON CONFLICT (code) DO NOTHING;

-- 4. ROLE PERMISSIONS MAPPING
-- EMPLOYEE permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'EMPLOYEE' AND p.code IN (
    'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
    'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT'
)
ON CONFLICT DO NOTHING;

-- MANAGER permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'MANAGER' AND p.code IN (
    'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
    'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT',
    'TEAM_READ', 'TEAM_TIMESHEET_READ', 'TEAM_TIMESHEET_REVIEW', 'TEAM_TIMESHEET_APPROVE', 'TEAM_TIMESHEET_REJECT',
    'REPORTS_READ'
)
ON CONFLICT DO NOTHING;

-- IT permissions
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'IT' AND p.code IN (
    'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
    'USERS_READ', 'SYSTEM_HEALTH_READ', 'AUDIT_READ'
)
ON CONFLICT DO NOTHING;

-- ADMIN permissions (All permissions)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id FROM public.roles r CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN'
ON CONFLICT DO NOTHING;

-- 5. ACTIVITIES SEED
INSERT INTO public.activities (id, code, name, description, active) VALUES
('a1111111-1111-1111-1111-111111111111', 'ACT-OPS-01', 'Operações & Logística', 'Coordenação de processos operacionais diários', true),
('a2222222-2222-2222-2222-222222222222', 'ACT-DEV-02', 'Desenvolvimento & Manutenção IT', 'Programação, melhorias contínuas e suporte técnico', true),
('a3333333-3333-3333-3333-333333333333', 'ACT-FIN-03', 'Gestão Financeira & Auditoria', 'Revisão orçamental, reconciliação e análise', true),
('a4444444-4444-4444-4444-444444444444', 'ACT-ESG-04', 'Iniciativas ESG & Sustentabilidade', 'Monitorização de métricas e conformidade sustentável', true),
('a5555555-5555-5555-5555-555555555555', 'ACT-COM-05', 'Reuniões & Prospeção Comercial', 'Negociação de propostas e acompanhamento de clientes', true),
('a6666666-6666-6666-6666-666666666666', 'ACT-ADM-06', 'Coordenação Administrativa & RH', 'Gestão documental, apoio a colaboradores e reporte', true)
ON CONFLICT (code) DO NOTHING;

-- 6. SYSTEM SETTINGS
INSERT INTO public.system_settings (key, value, description) VALUES
('COMPANY_NAME', 'SI Holdings', 'Nome institucional da organização'),
('DEFAULT_TIMEZONE', 'Africa/Maputo', 'Fuso horário operacional padrão'),
('DEFAULT_LANGUAGE', 'pt-PT', 'Idioma primário da plataforma'),
('TIMESHEET_PERIOD_TYPE', 'MONTHLY', 'Tipo de ciclo de submissão do timesheet'),
('TIMESHEET_DAILY_TARGET_HOURS', '8', 'Horas diárias recomendadas de trabalho'),
('ALLOW_WEEKEND_ENTRIES', 'true', 'Permitir registo de horas ao fim de semana')
ON CONFLICT (key) DO NOTHING;
