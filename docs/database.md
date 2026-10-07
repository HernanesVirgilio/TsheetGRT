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

## 4. Ficheiros de Migração (fonte única de verdade)

Todas as migrações encontram-se em `supabase/migrations/` e são executadas por ordem (ver `docs/supabase-setup.md`):
1. `20261001000000_initial_schema.sql`: tabelas, constraints, índices e triggers de integridade.
2. `20261001000001_rls_policies.sql`: funções de segurança, proteção do último administrador, auditoria, privilégios e políticas RLS.
3. `20261001000002_seed_data.sql`: departamentos, perfis de acesso, permissões, atividades e configurações. **Não cria utilizadores.**

O primeiro administrador é configurado com `supabase/scripts/bootstrap_first_admin.sql`.
