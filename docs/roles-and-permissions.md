# Matriz de Perfis & Permissões · SI Holdings Timesheet

## 1. Perfis de Utilizador (Roles)

| Código | Designação em Português | Descrição Operacional |
| :--- | :--- | :--- |
| **`EMPLOYEE`** | COLABORADOR | Utilizador padrão da empresa. Regista e submete horas de trabalho e tarefas. |
| **`MANAGER`** | GESTOR / MANAGER | Responsável pela gestão de equipa departamental e validação/aprovação de ponto. |
| **`IT`** | SUPORTE IT | Responsável pelo suporte técnico (pedidos, equipamentos, intervenções), monitorização técnica e auditoria. |
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
| `IT_TICKET_CREATE` | it | Abrir e acompanhar os próprios pedidos de suporte |
| `IT_TICKETS_READ` | it | Consultar a fila de pedidos, o painel do IT e as intervenções |
| `IT_TICKETS_MANAGE` | it | Tratar pedidos (assumir, estados, classificação, resolver, notas internas, intervenções) |
| `IT_TICKETS_ASSIGN` | it | Atribuir pedidos a outros técnicos |
| `IT_ASSETS_READ` | it | Consultar o inventário de equipamentos |
| `IT_ASSETS_MANAGE` | it | Registar e editar equipamentos |

---

## 3. Atribuição de Permissões por Perfil

- **EMPLOYEE:**
  - `SELF_ACCESS`, `SELF_PROFILE_READ`, `SELF_PROFILE_UPDATE`
  - `SELF_TIMESHEET_READ`, `SELF_TIMESHEET_CREATE`, `SELF_TIMESHEET_UPDATE`, `SELF_TIMESHEET_SUBMIT`
  - `IT_TICKET_CREATE`

- **MANAGER:**
  - Todas as permissões de `EMPLOYEE`
  - `TEAM_READ`, `TEAM_TIMESHEET_READ`, `TEAM_TIMESHEET_REVIEW`, `TEAM_TIMESHEET_APPROVE`, `TEAM_TIMESHEET_REJECT`
  - `REPORTS_READ`
  - (`IT_TICKET_CREATE` incluída nas permissões de `EMPLOYEE`)

- **IT:**
  - `SELF_ACCESS`, `SELF_PROFILE_READ`, `SELF_PROFILE_UPDATE`
  - `USERS_READ`, `SYSTEM_HEALTH_READ`, `AUDIT_READ`
  - `IT_TICKET_CREATE`, `IT_TICKETS_READ`, `IT_TICKETS_MANAGE`, `IT_TICKETS_ASSIGN`, `IT_ASSETS_READ`, `IT_ASSETS_MANAGE`

- **ADMIN:**
  - Todas as permissões anteriores + `USERS_CREATE`, `USERS_UPDATE`, `USERS_DISABLE`, `USERS_ASSIGN_ROLE`, `ROLES_READ`, `ROLES_MANAGE`, `PERMISSIONS_READ`, `PERMISSIONS_MANAGE`, `DEPARTMENTS_READ`, `DEPARTMENTS_MANAGE`, `SYSTEM_SETTINGS_READ`, `SYSTEM_SETTINGS_MANAGE`, `REPORTS_EXPORT`, `ADMIN_ACCESS`

---

## 4. Regras aplicadas no servidor

- As permissões são sempre explícitas: `has_permission` não tem atalho para ADMIN nem para `ADMIN_ACCESS`.
- O perfil **ADMIN** mantém todas as permissões e não pode ser editado (`set_role_permissions` recusa a operação).
- A permissão `ADMIN_ACCESS` é exclusiva do perfil ADMIN.
- Só quem tem `ADMIN_ACCESS` pode atribuir o perfil ADMIN a um utilizador.
- Cada utilizador tem exatamente um perfil de acesso (`user_roles.user_id` é único).
- Novas permissões introduzidas em migrations futuras devem ser atribuídas explicitamente ao perfil ADMIN nessa mesma migration.

## 5. Navegação da área Admin

| Rota | Permissão exigida | Ações adicionais |
| :--- | :--- | :--- |
| `/users`, `/users/:id` | `USERS_READ` | criar: `USERS_CREATE` + `USERS_ASSIGN_ROLE`; editar: `USERS_UPDATE`; perfil: `USERS_ASSIGN_ROLE`; ativar/desativar: `USERS_DISABLE` |
| `/departments` | `DEPARTMENTS_READ` | criar/editar/ativar: `DEPARTMENTS_MANAGE` |
| `/roles` | `ROLES_READ` | gerir permissões: `PERMISSIONS_MANAGE` |
| `/audit` | `AUDIT_READ` | — |
| `/system-health` | `SYSTEM_HEALTH_READ` | — |
| `/settings` | `SYSTEM_SETTINGS_READ` | alterar: `SYSTEM_SETTINGS_MANAGE` |
| `/reports` | `REPORTS_READ` | exportar CSV: `REPORTS_EXPORT` (os dados respeitam sempre o âmbito) |

## 6. Navegação do Manager e do timesheet próprio

| Rota | Permissão exigida | Ações adicionais |
| :--- | :--- | :--- |
| `/timesheets`, `/timesheets/:id` | `SELF_TIMESHEET_READ` | criar período: `SELF_TIMESHEET_CREATE`; registar horas: `SELF_TIMESHEET_UPDATE`; submeter: `SELF_TIMESHEET_SUBMIT` |
| `/team`, `/team/:id` | `TEAM_READ` | apenas leitura (dados administrativos são do Admin) |
| `/approvals`, `/approvals/:id` | `TEAM_TIMESHEET_REVIEW` | aprovar (incl. em massa): `TEAM_TIMESHEET_APPROVE`; rejeitar: `TEAM_TIMESHEET_REJECT` |
| `/activity` | `TEAM_TIMESHEET_READ` | — |

Os dados destas páginas são sempre limitados ao `manager_scopes` do gestor pelo servidor.

## 7. Navegação do Suporte IT

| Rota | Permissão exigida | Ações adicionais |
| :--- | :--- | :--- |
| `/support`, `/support/:id` | `IT_TICKET_CREATE` | abrir pedido, responder, confirmar resolução, reabrir pedido resolvido (apenas nos próprios pedidos) |
| `/it` | `IT_TICKETS_READ` | — (painel; é também a dashboard do perfil IT) |
| `/it/tickets`, `/it/tickets/:id` | `IT_TICKETS_READ` | tratar pedidos: `IT_TICKETS_MANAGE`; atribuir a outro técnico: `IT_TICKETS_ASSIGN`; associar equipamento: `IT_ASSETS_READ` |
| `/it/assets`, `/it/assets/:id` | `IT_ASSETS_READ` | registar/editar: `IT_ASSETS_MANAGE`; registar intervenção: `IT_TICKETS_MANAGE` |
| `/it/interventions` | `IT_TICKETS_READ` | — (as intervenções são registadas no pedido ou no equipamento) |

**Técnicos de IT:** utilizadores ativos com `IT_TICKETS_MANAGE` que não têm o perfil ADMIN. O ADMIN mantém todas as permissões do IT e pode assumir pedidos, mas não aparece na lista de técnicos para atribuição nem recebe as notificações de pedidos novos (exceto se não existir nenhum técnico ativo). Ver `docs/security.md` §8.

A secção **Suporte IT** da barra lateral e a entrada **Pedidos de suporte** só aparecem a quem tem a permissão correspondente. As permissões podem ser ajustadas em **Roles e Permissões** (módulo "Suporte IT").
