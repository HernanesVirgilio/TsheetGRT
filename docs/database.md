# Esquema da Base de Dados & Modelo de Dados · SI Holdings Timesheet

## 1. Tabelas Principais

A base de dados é normalizada e implementada em PostgreSQL através do Supabase:

### `public.departments`
- `id` (UUID, PK)
- `code` (VARCHAR(50), UNIQUE) — ex.: `IT`, `RH`, `FIN`, `OPS`, `ESG`, `MKT`, `COM`
- `name` (VARCHAR(150))
- `description` (TEXT)
- `active` (BOOLEAN, DEFAULT true)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `public.profiles`
- `id` (UUID, PK)
- `auth_user_id` (UUID, UNIQUE, FK $\to$ `auth.users`, `ON DELETE SET NULL` para preservar o histórico)
- `employee_number` (VARCHAR(50), UNIQUE, gerado no servidor: `SIH-0001`, `SIH-0002`, …)
- `full_name` (VARCHAR(255))
- `email` (VARCHAR(255), UNIQUE, sempre em minúsculas)
- `phone` (VARCHAR(50))
- `department_id` (UUID, FK $\to$ `departments.id`)
- `job_title` (VARCHAR(150))
- `avatar_url` (TEXT)
- `is_active` (BOOLEAN, DEFAULT true)
- `must_change_password` (BOOLEAN, DEFAULT false)
- `last_login_at` (TIMESTAMPTZ)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `public.roles` & `public.permissions`
- `roles`: `id`, `code` (`ADMIN`, `IT`, `MANAGER`, `EMPLOYEE`), `name`, `description`
- `permissions`: `id`, `code` (ex.: `SELF_TIMESHEET_READ`, `TEAM_TIMESHEET_APPROVE`), `name`, `module`
- `role_permissions`: `id`, `role_id`, `permission_id` (UNIQUE composto)
- `user_roles`: `id`, `user_id` (UNIQUE: um perfil de acesso por utilizador), `role_id`

### `public.timesheets`
- `id` (UUID, PK)
- `employee_id` (UUID, FK $\to$ `profiles.id`)
- `period_start` (DATE)
- `period_end` (DATE)
- `status` (VARCHAR(30)) — `DRAFT`, `SUBMITTED`, `APPROVED`, `REJECTED`, `LOCKED`
- `submitted_at` (TIMESTAMPTZ)
- `approved_at` (TIMESTAMPTZ)
- `approved_by` (UUID, FK $\to$ `profiles.id`)
- `rejected_at` (TIMESTAMPTZ)
- `rejected_by` (UUID, FK $\to$ `profiles.id`)
- `rejection_reason` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `public.timesheet_entries`
- `id` (UUID, PK)
- `timesheet_id` (UUID, FK $\to$ `timesheets.id` ON DELETE CASCADE)
- `employee_id` (UUID, FK $\to$ `profiles.id`)
- `work_date` (DATE)
- `activity_id` (UUID, FK $\to$ `activities.id`)
- `start_time` (TIME)
- `end_time` (TIME)
- `break_minutes` (INTEGER, DEFAULT 0, CHECK $\ge 0$)
- `total_minutes` (INTEGER, CHECK $> 0$)
- `description` (TEXT)
- `created_at`, `updated_at` (TIMESTAMPTZ)

### `public.audit_events` (Imutável)
- `id` (UUID, PK)
- `actor_user_id` (UUID, FK $\to$ `profiles.id`)
- `action` (VARCHAR(100)) — ex.: `auth.login.success`, `timesheet.approved`
- `entity_type` (VARCHAR(100))
- `entity_id` (VARCHAR(100))
- `description` (TEXT)
- `ip_address` (VARCHAR(45))
- `user_agent` (TEXT)
- `created_at` (TIMESTAMPTZ, DEFAULT NOW())

---

## 2. Triggers de Integridade de Horas

O trigger PostgreSQL `fn_calculate_entry_total_minutes` garante no servidor que o valor de `total_minutes` é sempre exato e recalculado automaticamente a partir de `start_time`, `end_time` e `break_minutes`:

```sql
NEW.total_minutes := ((EXTRACT(HOUR FROM NEW.end_time) * 60) + EXTRACT(MINUTE FROM NEW.end_time))
                   - ((EXTRACT(HOUR FROM NEW.start_time) * 60) + EXTRACT(MINUTE FROM NEW.start_time))
                   - NEW.break_minutes;
```

---

## 3. Outras regras de integridade

- `departments.code`: 2 a 20 carateres (`A-Z`, `0-9`, `-`, `_`), imutável depois de criado.
- `timesheets`: período único por colaborador, rejeição exige motivo e ninguém aprova o próprio timesheet.
- `timesheet_entries`: o apontamento pertence ao colaborador do timesheet e cai dentro do período.
- `manager_scopes`: cada linha aponta para um colaborador **ou** para um departamento, sem duplicados.
- `updated_at` é mantido por trigger em todas as tabelas que o têm.

## 3.1 Módulo Suporte IT

| Tabela | Conteúdo | Escrita pela API |
| :--- | :--- | :--- |
| `it_ticket_categories` | Categorias configuráveis (`code`, `name`, `description`, `sort_order`, `active`). 9 categorias iniciais: Hardware, Software, Acessos, Rede, Impressoras, E-mail, Sistemas internos, Segurança, Outro. | Não (dados de referência da migration) |
| `it_tickets` | Pedido: `reference` (`IT-0001`, gerada), `title` (≥ 5), `description` (10–5000), `requester_id`, `requester_department_id` (departamento no momento da abertura), `category_id`, `priority` (`LOW`/`MEDIUM`/`HIGH`/`CRITICAL`), `status` (`OPEN`/`IN_PROGRESS`/`WAITING_USER`/`RESOLVED`/`CLOSED`), `assigned_to`, `asset_id`, `resolution_summary`, `due_at`, `status_changed_at`, `resolved_at`, `closed_at`. | Não — só por funções do servidor |
| `it_ticket_comments` | Mensagens do pedido: autor (nome guardado no momento), `body` (1–5000), `is_internal` (nota interna do IT). | Não — `add_it_ticket_comment` |
| `it_ticket_events` | Histórico só de leitura: ator, `event_type`, `old_value`, `new_value`, `note`, `is_internal`. | Não — escrito pelas funções do servidor |
| `it_assets` | Equipamento: `asset_tag` (`SI-IT-0001`, gerado se vazio, maiúsculas), `asset_type`, `brand`, `model`, `serial_number` (único), `status` (`ACTIVE`/`IN_REPAIR`/`IN_STOCK`/`RETIRED`/`LOST`), `assigned_to`, `department_id`, `location`, `acquired_on`, `notes`. | `INSERT`/`UPDATE` com `IT_ASSETS_MANAGE`; sem `DELETE` (usar `RETIRED`) |
| `it_interventions` | Intervenção técnica: pedido e/ou equipamento, técnico, `performed_at`, `problem_description` (5–2000), `work_performed` (5–4000), `outcome` (`RESOLVED`/`PARTIALLY_RESOLVED`/`NOT_RESOLVED`/`ESCALATED`), `notes`. | Não — `add_it_intervention` |

Regras de integridade principais:

- `it_tickets`: resolvido/fechado exige `resolution_summary`; datas de resolução e fecho coerentes com o estado; `due_at` calculado a partir da prioridade e das definições `IT_SLA_HOURS_*`.
- `it_assets`: só equipamentos `ACTIVE`, `IN_REPAIR` ou `LOST` têm utilizador responsável; utilizador e departamento têm de estar ativos; data de aquisição não pode ser futura; a data de registo é imutável.
- `it_interventions`: tem de referir um pedido ou um equipamento; a data não pode ser futura.

Relação pedido → equipamento → intervenção:

- Um pedido pode referir um equipamento (`it_tickets.asset_id`). O colaborador só associa equipamentos que lhe estão atribuídos; a equipa de IT pode alterar a associação.
- Uma intervenção refere um pedido e/ou um equipamento; registada num pedido sem equipamento indicado, herda o equipamento do pedido.
- A ficha do equipamento lista os pedidos (`it_tickets.asset_id`) e as intervenções (`it_interventions.asset_id`); o detalhe do pedido mostra o equipamento associado.

Ciclo de vida do pedido:

```
OPEN ──assumir──▶ IN_PROGRESS ◀──resposta do colaborador── WAITING_USER
  │                   │  ▲                                     ▲
  │                   │  └──────────── retomar ────────────────┤
  │                   └──────── pedir informação ──────────────┘
  └──────────── resolver (de qualquer estado em curso) ──────▶ RESOLVED ──fechar──▶ CLOSED
                                                                  │                   │
                         reabrir (colaborador ou IT) ◀────────────┘   reabrir (só IT) ┘
```

Pedir informação ao colaborador é possível a partir de `OPEN` ou `IN_PROGRESS`. Um pedido resolvido ou fechado não é alterado sem ser reaberto. A reabertura volta a `IN_PROGRESS` (com técnico) ou `OPEN` (sem técnico) e reinicia o prazo.

Equipamentos: o ciclo de vida é representado pelo estado (`IN_STOCK` → `ACTIVE` → `IN_REPAIR` → `RETIRED`/`LOST`); não existe remoção física e um equipamento abatido permanece no inventário e no histórico.

Prazos de resolução (SLA) — **valores iniciais do módulo IT**, em `system_settings` e validados por `validate_system_setting`:

| Chave | Valor inicial | Significado |
| :--- | :--- | :--- |
| `IT_SLA_HOURS_CRITICAL` | 8 | Prazo de resolução (horas) de pedidos críticos |
| `IT_SLA_HOURS_HIGH` | 24 | Prazo de pedidos de prioridade alta |
| `IT_SLA_HOURS_MEDIUM` | 72 | Prazo de pedidos de prioridade média |
| `IT_SLA_HOURS_LOW` | 120 | Prazo de pedidos de prioridade baixa |
| `IT_WAITING_USER_ALERT_DAYS` | 3 | Dias a aguardar o colaborador até o pedido ser sinalizado no painel |

Os prazos aceitam 1 a 2000 horas; o alerta aceita 1 a 60 dias. Não existe interface para os alterar nesta fase (ver `docs/supabase-setup.md`).

Regras de cálculo (servidor):

- `due_at` = início da contagem + horas da prioridade. O início é a abertura do pedido ou, depois de uma reabertura, a data da última reabertura.
- Alterar a prioridade recalcula `due_at` a partir desse mesmo início.
- O prazo **não é suspenso** enquanto o pedido aguarda o colaborador; nesse estado o pedido não conta como atraso do IT, mas volta a contar quando regressa ao atendimento.
- Painel (`get_it_dashboard_summary`): "prazo ultrapassado" = `OPEN`/`IN_PROGRESS` com `due_at` no passado; "espera prolongada" = `WAITING_USER` há mais de `IT_WAITING_USER_ALERT_DAYS` dias (desde `status_changed_at`). O painel sinaliza ainda, na lista "Requer atenção", os pedidos cujo prazo termina nas próximas 4 horas.

## 4. Ficheiros de Migração (fonte única de verdade)

Todas as migrações encontram-se em `supabase/migrations/` e são executadas por ordem (ver `docs/supabase-setup.md`):
1. `20261001000000_initial_schema.sql`: tabelas, constraints, índices e triggers de integridade.
2. `20261001000001_rls_policies.sql`: funções de segurança, proteção do último administrador, auditoria, privilégios e políticas RLS.
3. `20261001000002_seed_data.sql`: departamentos, perfis de acesso, permissões, atividades e configurações. **Não cria utilizadores.**
4. `20261008000000_manager_scope_and_reviews.sql`: módulo Manager. Leitura por âmbito, funções `submit_timesheet`/`review_timesheet`/`approve_timesheets`, validação e auditoria de `manager_scopes`, vista `my_team_members`, notificações por trigger.
5. `20261009000000_scope_rules_and_reviewer_visibility.sql`: âmbito por departamento limitado a colaboradores (EMPLOYEE), administradores excluídos do âmbito e função `get_timesheet_decisions` (nome, cargo e e-mail de quem decidiu).
6. `20261010000000_it_support_module.sql`: módulo Suporte IT. Permissões `IT_*`, definições de prazos, tabelas do ponto 3.1, funções de transição dos pedidos, histórico, auditoria e notificações por trigger, políticas RLS e privilégios.

O primeiro administrador é configurado com `supabase/scripts/bootstrap_first_admin.sql`.
