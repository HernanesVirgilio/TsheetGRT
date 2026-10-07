# Matriz de Perfis & Permissões · SI Holdings Timesheet

## 1. Perfis de Utilizador (Roles)

| Código | Designação em Português | Descrição Operacional |
| :--- | :--- | :--- |
| **`EMPLOYEE`** | COLABORADOR | Utilizador padrão da empresa. Regista e submete horas de trabalho e tarefas. |
| **`MANAGER`** | GESTOR / MANAGER | Responsável pela gestão de equipa departamental e validação/aprovação de ponto. |
| **`IT`** | SUPORTE IT | Responsável pela monitorização técnica, diagnóstico de integridade e auditoria. |
| **`ADMIN`** | ADMINISTRADOR | Nível máximo administrativo da aplicação: utilizadores, departamentos e definições. |

---

## 2. Mapa Completo de Permissões Explícitas

| Código da Permissão | Módulo | Descrição Funcional |
| :--- | :--- | :--- |
| `SELF_ACCESS` | core | Acesso ao sistema e menu básico |
| `SELF_PROFILE_READ` | profile | Visualização de dados do perfil próprio |
| `SELF_PROFILE_UPDATE` | profile | Atualização de contactos telefónicos próprios |
| `SELF_TIMESHEET_READ` | timesheet | Consulta de folhas de horas próprias |
| `SELF_TIMESHEET_CREATE` | timesheet | Criação e registo diário de entradas |
| `SELF_TIMESHEET_UPDATE` | timesheet | Edição de apontamentos em estado Rascunho |
| `SELF_TIMESHEET_SUBMIT` | timesheet | Submissão formal de ponto para validação |
| `TEAM_READ` | team | Consulta de lista de colaboradores sob gestão |
| `TEAM_TIMESHEET_READ` | team | Visualização de folhas de horas da equipa |
| `TEAM_TIMESHEET_REVIEW` | approvals | Análise detalhada dos lançamentos submetidos |
| `TEAM_TIMESHEET_APPROVE` | approvals | Aprovação e validação formal de timesheets |
| `TEAM_TIMESHEET_REJECT` | approvals | Devolução de timesheets com justificação |
| `USERS_READ` | users | Listagem e pesquisa de contas de utilizador |
| `USERS_CREATE` | users | Criação de novos utilizadores na organização |
| `USERS_UPDATE` | users | Edição de cargos, dados e contactos de utilizadores |
| `USERS_DISABLE` | users | Desativação/reativação suave de contas |
| `USERS_ASSIGN_ROLE` | users | Atribuição e alteração de perfis de utilizador |
| `ROLES_READ` | roles | Consulta de perfis de acesso existentes |
| `ROLES_MANAGE` | roles | Gestão de perfis e matriz de autorização |
| `PERMISSIONS_READ` | permissions | Consulta da lista de permissões da aplicação |
| `PERMISSIONS_MANAGE` | permissions | Manutenção e atribuição de permissões |
| `DEPARTMENTS_READ` | departments | Consulta de departamentos da empresa |
| `DEPARTMENTS_MANAGE` | departments | Criação e edição de departamentos |
| `AUDIT_READ` | audit | Consulta ao histórico imutável de auditoria |
| `SYSTEM_HEALTH_READ` | health | Acesso ao diagnóstico e integridade técnica |
| `SYSTEM_SETTINGS_READ` | settings | Visualização de parâmetros da organização |
| `SYSTEM_SETTINGS_MANAGE` | settings | Atualização de parâmetros institucionais |
| `REPORTS_READ` | reports | Acesso aos relatórios consolidados de horas |
| `REPORTS_EXPORT` | reports | Exportação de dados consolidados em formato CSV |
| `ADMIN_ACCESS` | admin | Acesso administrativo global irrestrito |

---

## 3. Atribuição de Permissões por Perfil

- **EMPLOYEE:**
  - `SELF_ACCESS`, `SELF_PROFILE_READ`, `SELF_PROFILE_UPDATE`
  - `SELF_TIMESHEET_READ`, `SELF_TIMESHEET_CREATE`, `SELF_TIMESHEET_UPDATE`, `SELF_TIMESHEET_SUBMIT`

- **MANAGER:**
  - Todas as permissões de `EMPLOYEE`
  - `TEAM_READ`, `TEAM_TIMESHEET_READ`, `TEAM_TIMESHEET_REVIEW`, `TEAM_TIMESHEET_APPROVE`, `TEAM_TIMESHEET_REJECT`
  - `REPORTS_READ`

- **IT:**
  - `SELF_ACCESS`, `SELF_PROFILE_READ`, `SELF_PROFILE_UPDATE`
  - `USERS_READ`, `SYSTEM_HEALTH_READ`, `AUDIT_READ`

- **ADMIN:**
  - Todas as permissões anteriores + `USERS_CREATE`, `USERS_UPDATE`, `USERS_DISABLE`, `USERS_ASSIGN_ROLE`, `ROLES_READ`, `ROLES_MANAGE`, `PERMISSIONS_READ`, `PERMISSIONS_MANAGE`, `DEPARTMENTS_READ`, `DEPARTMENTS_MANAGE`, `SYSTEM_SETTINGS_READ`, `SYSTEM_SETTINGS_MANAGE`, `REPORTS_EXPORT`, `ADMIN_ACCESS`
