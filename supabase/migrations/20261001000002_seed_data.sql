-- TsheetGRT · SI Holdings — Dados de referência
-- Não cria utilizadores nem contas de autenticação. O primeiro administrador é configurado
-- com supabase/scripts/bootstrap_first_admin.sql (ver docs/supabase-setup.md).

-- 1. DEPARTAMENTOS
INSERT INTO public.departments (code, name, description) VALUES
    ('IT', 'Tecnologias de Informação', 'Infraestrutura tecnológica, sistemas e suporte'),
    ('RH', 'Recursos Humanos', 'Gestão de pessoas, talento e desenvolvimento organizacional'),
    ('FIN', 'Finanças', 'Gestão financeira, tesouraria e contabilidade'),
    ('OPS', 'Operações', 'Operações transversais e logística empresarial'),
    ('ESG', 'ESG', 'Sustentabilidade ambiental, responsabilidade social e governança'),
    ('MKT', 'Marketing & Sales', 'Marketing corporativo, comunicação e promoção'),
    ('COM', 'Comercial', 'Desenvolvimento de negócios e parcerias comerciais');

-- 2. PERFIS DE ACESSO
INSERT INTO public.roles (code, name, description) VALUES
    ('ADMIN', 'ADMIN', 'Acesso administrativo global ao sistema e configurações'),
    ('IT', 'IT', 'Gestão técnica, auditoria técnica e saúde do sistema'),
    ('MANAGER', 'MANAGER', 'Gestão da equipa, revisão e aprovação de timesheets'),
    ('EMPLOYEE', 'COLABORADOR', 'Registo diário de horas e submissão do timesheet');

-- 3. PERMISSÕES
INSERT INTO public.permissions (code, name, description, module) VALUES
    ('SELF_ACCESS', 'Acesso Geral Pessoal', 'Acesso à área pessoal do sistema', 'core'),
    ('SELF_PROFILE_READ', 'Visualizar Perfil Próprio', 'Ver os próprios dados de perfil', 'profile'),
    ('SELF_PROFILE_UPDATE', 'Atualizar Perfil Próprio', 'Alterar dados de contacto próprios', 'profile'),
    ('SELF_TIMESHEET_READ', 'Ver Próprio Timesheet', 'Visualizar timesheets pessoais', 'timesheet'),
    ('SELF_TIMESHEET_CREATE', 'Criar Próprio Timesheet', 'Criar e preencher novos registos de horas', 'timesheet'),
    ('SELF_TIMESHEET_UPDATE', 'Editar Próprio Timesheet', 'Modificar registos de horas em rascunho', 'timesheet'),
    ('SELF_TIMESHEET_SUBMIT', 'Submeter Próprio Timesheet', 'Enviar timesheet para aprovação', 'timesheet'),
    ('TEAM_READ', 'Visualizar Equipa', 'Ver lista e detalhes de membros da equipa', 'team'),
    ('TEAM_TIMESHEET_READ', 'Ver Timesheets da Equipa', 'Visualizar timesheets dos colaboradores sob gestão', 'team'),
    ('TEAM_TIMESHEET_REVIEW', 'Rever Timesheets da Equipa', 'Analisar registos submetidos pela equipa', 'approvals'),
    ('TEAM_TIMESHEET_APPROVE', 'Aprovar Timesheets', 'Aprovar submissões de timesheet da equipa', 'approvals'),
    ('TEAM_TIMESHEET_REJECT', 'Rejeitar Timesheets', 'Rejeitar submissões com justificação', 'approvals'),
    ('USERS_READ', 'Listar Utilizadores', 'Visualizar lista e detalhes de utilizadores', 'users'),
    ('USERS_CREATE', 'Criar Utilizadores', 'Criar novas contas no sistema', 'users'),
    ('USERS_UPDATE', 'Editar Utilizadores', 'Editar dados de utilizadores', 'users'),
    ('USERS_DISABLE', 'Ativar/Desativar Utilizadores', 'Gerir estado de ativação de contas', 'users'),
    ('USERS_ASSIGN_ROLE', 'Atribuir Roles', 'Modificar perfis de acesso e roles de utilizadores', 'users'),
    ('ROLES_READ', 'Listar Roles', 'Visualizar perfis de acesso existentes', 'roles'),
    ('ROLES_MANAGE', 'Gerir Roles', 'Criar e atualizar roles do sistema', 'roles'),
    ('PERMISSIONS_READ', 'Listar Permissões', 'Visualizar mapa de permissões do sistema', 'permissions'),
    ('PERMISSIONS_MANAGE', 'Gerir Permissões', 'Configurar permissões atribuídas a roles', 'permissions'),
    ('DEPARTMENTS_READ', 'Listar Departamentos', 'Visualizar estrutura de departamentos', 'departments'),
    ('DEPARTMENTS_MANAGE', 'Gerir Departamentos', 'Criar e atualizar departamentos', 'departments'),
    ('AUDIT_READ', 'Consultar Auditoria', 'Visualizar registos imutáveis de auditoria', 'audit'),
    ('SYSTEM_HEALTH_READ', 'Ver Saúde do Sistema', 'Consultar diagnóstico e integridade do sistema', 'health'),
    ('SYSTEM_SETTINGS_READ', 'Ver Configurações', 'Visualizar definições globais da organização', 'settings'),
    ('SYSTEM_SETTINGS_MANAGE', 'Gerir Configurações', 'Modificar definições do sistema', 'settings'),
    ('REPORTS_READ', 'Aceder a Relatórios', 'Consultar relatórios analíticos de timesheet', 'reports'),
    ('REPORTS_EXPORT', 'Exportar Relatórios', 'Exportar dados consolidados em formato CSV', 'reports'),
    ('ADMIN_ACCESS', 'Acesso de Superadministrador', 'Acesso administrativo amplo a todas as áreas', 'admin');

-- 4. MATRIZ PERFIL → PERMISSÕES (docs/roles-and-permissions.md)
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
JOIN public.permissions p ON p.code = ANY (
    CASE r.code
        WHEN 'EMPLOYEE' THEN ARRAY[
            'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
            'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT']
        WHEN 'MANAGER' THEN ARRAY[
            'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
            'SELF_TIMESHEET_READ', 'SELF_TIMESHEET_CREATE', 'SELF_TIMESHEET_UPDATE', 'SELF_TIMESHEET_SUBMIT',
            'TEAM_READ', 'TEAM_TIMESHEET_READ', 'TEAM_TIMESHEET_REVIEW', 'TEAM_TIMESHEET_APPROVE', 'TEAM_TIMESHEET_REJECT',
            'REPORTS_READ']
        WHEN 'IT' THEN ARRAY[
            'SELF_ACCESS', 'SELF_PROFILE_READ', 'SELF_PROFILE_UPDATE',
            'USERS_READ', 'SYSTEM_HEALTH_READ', 'AUDIT_READ']
    END
)
WHERE r.code <> 'ADMIN';

-- O perfil ADMIN recebe todas as permissões existentes.
INSERT INTO public.role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.roles r
CROSS JOIN public.permissions p
WHERE r.code = 'ADMIN';

-- 5. ATIVIDADES
INSERT INTO public.activities (code, name, description) VALUES
    ('ACT-OPS-01', 'Operações & Logística', 'Coordenação de processos operacionais diários'),
    ('ACT-DEV-02', 'Desenvolvimento & Manutenção IT', 'Programação, melhorias contínuas e suporte técnico'),
    ('ACT-FIN-03', 'Gestão Financeira & Auditoria', 'Revisão orçamental, reconciliação e análise'),
    ('ACT-ESG-04', 'Iniciativas ESG & Sustentabilidade', 'Monitorização de métricas e conformidade sustentável'),
    ('ACT-COM-05', 'Reuniões & Prospeção Comercial', 'Negociação de propostas e acompanhamento de clientes'),
    ('ACT-ADM-06', 'Coordenação Administrativa & RH', 'Gestão documental, apoio a colaboradores e reporte');

-- 6. DEFINIÇÕES DO SISTEMA
INSERT INTO public.system_settings (key, value, description) VALUES
    ('COMPANY_NAME', 'SI Holdings', 'Nome institucional da organização'),
    ('DEFAULT_TIMEZONE', 'Africa/Maputo', 'Fuso horário operacional padrão'),
    ('DEFAULT_LANGUAGE', 'pt-PT', 'Idioma primário da plataforma'),
    ('TIMESHEET_PERIOD_TYPE', 'MONTHLY', 'Tipo de ciclo de submissão do timesheet'),
    ('TIMESHEET_DAILY_TARGET_HOURS', '8', 'Horas diárias recomendadas de trabalho'),
    ('ALLOW_WEEKEND_ENTRIES', 'true', 'Permitir registo de horas ao fim de semana');
