-- TsheetGRT · Verificação ANTES de aplicar 20261015000000 e 20261015000001 (só leitura).
--
-- Executar no SQL Editor do projeto, como administrador (papel postgres). Nenhuma instrução altera dados ou
-- esquema: só SELECT sobre catálogos e tabelas. O SQL Editor mostra apenas o resultado da última instrução:
-- executar cada bloco separadamente ("Run selected") e guardar os resultados.
--
-- P0 é o resumo, com um estado por verificação:
--   BLOQUEIO  não aplicar: a migration pararia (sem aplicar nada) ou ficaria num estado inseguro;
--   AVISO     pode aplicar, mas há um ponto a rever ou que não foi possível determinar;
--   OK        pré-condição cumprida.
-- Os blocos P1–P15 dão o detalhe de cada ponto.
--
-- As consultas funcionam antes da migration: colunas que ainda podem não existir são lidas com to_jsonb(linha) e
-- tabelas opcionais com to_regclass, para que uma ausência não interrompa o resto do diagnóstico.

-- -----------------------------------------------------------------------------
-- P0. Resumo
-- -----------------------------------------------------------------------------
WITH
known_request_constraints(name) AS (
    VALUES ('meetings_requested_with_fkey'), ('meetings_request_status_valid'), ('meetings_request_comment_length'),
           ('meetings_request_consistency'), ('meetings_request_not_self'), ('meetings_request_decision_consistency'),
           ('meetings_request_rejection_reason'), ('meetings_request_proposal_consistency')
),
meeting_event_types(type) AS (
    VALUES ('MEETING_CREATED'), ('MEETING_UPDATED'), ('MEETING_RESCHEDULED'), ('MEETING_CONFIRMED'), ('MEETING_COMPLETED'),
           ('MEETING_OUTCOME_UPDATED'), ('MEETING_CANCELLED'), ('MEETING_PARTICIPANT_ADDED'), ('MEETING_PARTICIPANT_REMOVED'),
           ('MEETING_ATTACHMENT_ADDED'), ('MEETING_ATTACHMENT_REMOVED'), ('MEETING_RESPONDED'), ('MEETING_REQUESTED'),
           ('MEETING_REQUEST_ACCEPTED'), ('MEETING_REQUEST_REJECTED'), ('MEETING_REQUEST_RESCHEDULE_PROPOSED'),
           ('MEETING_REQUEST_RESCHEDULE_ACCEPTED'), ('MEETING_REQUEST_RESCHEDULE_DECLINED'), ('MEETING_REQUEST_CANCELLED')
),
absence_event_types(type) AS (
    VALUES ('ABSENCE_CREATED'), ('ABSENCE_UPDATED'), ('ABSENCE_SUBMITTED'), ('ABSENCE_VALIDATED'), ('ABSENCE_APPROVED'),
           ('ABSENCE_REJECTED'), ('ABSENCE_CHANGES_REQUESTED'), ('ABSENCE_CANCELLED'), ('ABSENCE_ATTACHMENT_ADDED'),
           ('ABSENCE_ATTACHMENT_REMOVED'), ('ABSENCE_COMMUNICATED')
),
absence_rows AS (
    SELECT a.id, a.status, coalesce(to_jsonb(a) ->> 'kind', 'REQUEST') AS kind, a.validated_by, a.decided_by
    FROM public.absence_requests a
),
absence_problems AS (
    SELECT
        count(*) FILTER (WHERE status NOT IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMMUNICATED')) AS bad_status,
        count(*) FILTER (WHERE kind NOT IN ('REQUEST', 'NOTICE')) AS bad_kind,
        count(*) FILTER (WHERE kind = 'NOTICE' AND status NOT IN ('COMMUNICATED', 'CANCELLED')) AS notice_bad_status,
        count(*) FILTER (WHERE kind = 'NOTICE' AND (validated_by IS NOT NULL OR decided_by IS NOT NULL)) AS notice_with_decision,
        count(*) FILTER (WHERE kind = 'REQUEST' AND status = 'COMMUNICATED') AS request_communicated
    FROM absence_rows
),
meeting_request_data AS (
    SELECT count(*) FILTER (WHERE to_jsonb(m) ->> 'request_status' IS NOT NULL OR to_jsonb(m) ->> 'requested_with' IS NOT NULL
                                  OR to_jsonb(m) ->> 'request_decided_at' IS NOT NULL) AS with_request_data
    FROM public.meetings m
),
setting AS (
    SELECT (SELECT value FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS') AS value,
           EXISTS (SELECT 1 FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS') AS present
),
exposed AS (
    SELECT string_agg(setting, ', ') AS config
    FROM pg_roles, unnest(rolconfig) AS setting
    WHERE rolname = 'authenticator' AND setting LIKE 'pgrst.db_schemas=%'
),
checks(check_name, status, detail) AS (
    SELECT 'histórico de migrations (supabase_migrations.schema_migrations)',
           CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL THEN 'AVISO'
                WHEN (xpath('/row/c/text()', query_to_xml(
                        'SELECT count(*) AS c FROM supabase_migrations.schema_migrations WHERE version = ''20261014000000''', false, true, '')))[1]::TEXT = '1'
                THEN 'OK' ELSE 'AVISO' END,
           CASE WHEN to_regclass('supabase_migrations.schema_migrations') IS NULL
                THEN 'tabela inexistente: não usar supabase db push sem registar o histórico (procedimento, secção 4)'
                ELSE 'ver P1; 20261014000000 registada = ' || (xpath('/row/c/text()', query_to_xml(
                        'SELECT count(*) AS c FROM supabase_migrations.schema_migrations WHERE version = ''20261014000000''', false, true, '')))[1]::TEXT END
    UNION ALL
    SELECT 'perfis de acesso existentes',
           CASE WHEN count(*) = 5 THEN 'OK' ELSE 'BLOQUEIO' END,
           count(*) || ' de 5 (ADMIN, IT, MANAGER, GESTOR, EMPLOYEE); sem eles as permissões novas não são atribuídas'
    FROM public.roles WHERE code IN ('ADMIN', 'IT', 'MANAGER', 'GESTOR', 'EMPLOYEE')
    UNION ALL
    SELECT 'restrições desconhecidas sobre as colunas do pedido (meetings)',
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'BLOQUEIO' END,
           coalesce('a migration para: ' || string_agg(conname, ', '), 'nenhuma')
    FROM pg_constraint
    WHERE conrelid = 'public.meetings'::regclass AND contype IN ('c', 'f', 'u', 'x')
      AND pg_get_constraintdef(oid) ~ '(request_status|requested_with|request_decided_at|request_decision_comment|request_proposed_starts_at|request_proposed_ends_at)'
      AND conname NOT IN (SELECT name FROM known_request_constraints)
    UNION ALL
    SELECT 'colunas do pedido sem DEFAULT nem NOT NULL',
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'AVISO' END,
           coalesce('a migration retira-os sem alterar valores: ' || string_agg(column_name, ', '), 'nenhuma coluna com DEFAULT ou NOT NULL')
    FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'meetings'
      AND (column_name LIKE 'request%' OR column_name = 'requested_with')
      AND (column_default IS NOT NULL OR is_nullable = 'NO')
    UNION ALL
    SELECT 'reuniões com dados de pedido já preenchidos',
           CASE WHEN with_request_data = 0 THEN 'OK' ELSE 'AVISO' END,
           with_request_data || ' reunião(ões); ver P4. Fora das regras novas, a restrição fica por validar (aviso na migration)'
    FROM meeting_request_data
    UNION ALL
    SELECT 'meeting_events: tipos de evento históricos permitidos',
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'BLOQUEIO' END,
           coalesce('a migration para; tipos desconhecidos: ' || string_agg(DISTINCT event_type, ', ') || ' (ver P11)', 'todos os tipos são permitidos')
    FROM public.meeting_events WHERE event_type NOT IN (SELECT type FROM meeting_event_types)
    UNION ALL
    SELECT 'absence_events: tipos de evento históricos permitidos',
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'BLOQUEIO' END,
           coalesce('a migration para; tipos desconhecidos: ' || string_agg(DISTINCT event_type, ', ') || ' (ver P11)', 'todos os tipos são permitidos')
    FROM public.absence_events WHERE event_type NOT IN (SELECT type FROM absence_event_types)
    UNION ALL
    SELECT 'absence_requests: estados e tipos compatíveis com as regras novas',
           CASE WHEN bad_status + bad_kind + notice_bad_status + notice_with_decision + request_communicated = 0 THEN 'OK' ELSE 'BLOQUEIO' END,
           format('estado não permitido=%s · tipo não permitido=%s · NOTICE com estado inválido=%s · NOTICE com validação/decisão=%s · REQUEST comunicado=%s (ver P12)',
                  bad_status, bad_kind, notice_bad_status, notice_with_decision, request_communicated)
    FROM absence_problems
    UNION ALL
    SELECT 'definição APPROVAL_REMINDER_DAYS',
           CASE WHEN NOT present THEN 'OK'
                WHEN CASE WHEN value ~ '^[0-9]{1,2}$' THEN value::INTEGER BETWEEN 1 AND 30 ELSE false END THEN 'OK'
                ELSE 'BLOQUEIO' END,
           CASE WHEN NOT present THEN 'ainda não existe: será criada com 3 dias'
                WHEN CASE WHEN value ~ '^[0-9]{1,2}$' THEN value::INTEGER BETWEEN 1 AND 30 ELSE false END THEN 'existe e é válida (' || value || '); será mantida'
                ELSE 'existe com um valor inválido (' || value || '): a migration para; corrigir para um inteiro de 1 a 30' END
    FROM setting
    UNION ALL
    SELECT 'funções a recriar sem objetos dependentes',
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'BLOQUEIO' END,
           coalesce('dependências: ' || string_agg(DISTINCT p.proname, ', ') || ' (ver P8)', 'nenhuma')
    FROM pg_depend d
    JOIN pg_proc p ON p.oid = d.refobjid
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND d.deptype = 'n'
      AND p.proname IN ('create_meeting', 'decide_meeting_request', 'get_meeting_people', 'list_work_people')
    UNION ALL
    SELECT 'RLS ativa nas tabelas lidas pelos relatórios',
           CASE WHEN bool_and(c.relrowsecurity) THEN 'OK' ELSE 'BLOQUEIO' END,
           string_agg(c.relname || '=' || c.relrowsecurity, ', ' ORDER BY c.relname) || ' (as funções de relatório dependem desta RLS; ver P14)'
    FROM pg_class c
    WHERE c.oid IN (to_regclass('public.timesheets'), to_regclass('public.timesheet_entries'),
                    to_regclass('public.timesheet_approvals'), to_regclass('public.profiles'))
    UNION ALL
    SELECT 'esquema private não exposto no PostgREST',
           CASE WHEN config IS NULL THEN 'AVISO' WHEN config ~ '(^|[=, ])private([, ]|$)' THEN 'AVISO' ELSE 'OK' END,
           CASE WHEN config IS NULL THEN 'não determinável por SQL: confirmar em Settings › API › Exposed schemas'
                ELSE config END
    FROM exposed
)
SELECT check_name, status, detail
FROM (
    SELECT 0 AS position, 'RESULTADO GLOBAL' AS check_name,
           CASE WHEN bool_or(status = 'BLOQUEIO') THEN 'BLOQUEIO' WHEN bool_or(status = 'AVISO') THEN 'AVISO' ELSE 'OK' END AS status,
           count(*) FILTER (WHERE status = 'BLOQUEIO') || ' bloqueio(s) · ' || count(*) FILTER (WHERE status = 'AVISO') || ' aviso(s) · '
               || count(*) FILTER (WHERE status = 'OK') || ' ok' AS detail
    FROM checks
    UNION ALL
    SELECT CASE status WHEN 'BLOQUEIO' THEN 1 WHEN 'AVISO' THEN 2 ELSE 3 END, check_name, status, detail
    FROM checks
) AS result
ORDER BY position, check_name;

-- -----------------------------------------------------------------------------
-- P1. Histórico de migrations registado pela CLI
-- Esperado: versões 20261001000000 … 20261014000000 presentes; 20261015000000 e 20261015000001 ausentes.
-- Se a tabela não existir ou estiver incompleta, NÃO usar `supabase db push` (ver procedimento, secção 4).
-- -----------------------------------------------------------------------------
SELECT version, name
FROM supabase_migrations.schema_migrations
ORDER BY version;

-- -----------------------------------------------------------------------------
-- P2. Colunas do pedido em meetings (acrescentadas à mão) e chave de idempotência
-- Verificar: tipo, NULL permitido e valor por omissão. A migration retira DEFAULT e NOT NULL destas colunas.
-- -----------------------------------------------------------------------------
SELECT column_name, data_type, character_maximum_length, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'meetings'
  AND (column_name LIKE 'request%' OR column_name IN ('requested_with', 'client_request_id'))
ORDER BY column_name;

-- -----------------------------------------------------------------------------
-- P3. Restrições de meetings e se estão validadas
-- Qualquer restrição que use as colunas do pedido e não esteja na lista de P0 faz a migration parar sem aplicar nada.
-- -----------------------------------------------------------------------------
SELECT conname, contype, convalidated, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid = 'public.meetings'::regclass
ORDER BY conname;

-- -----------------------------------------------------------------------------
-- P4. Dados já existentes nas colunas do pedido
-- Esperado: só linhas sem dados de pedido (reuniões normais). As colunas são lidas como JSON para que a
-- consulta funcione mesmo que alguma ainda não exista.
-- -----------------------------------------------------------------------------
SELECT to_jsonb(m) ->> 'request_status' AS request_status,
       (to_jsonb(m) ->> 'requested_with') IS NOT NULL AS has_requested_with,
       (to_jsonb(m) ->> 'request_decided_at') IS NOT NULL AS has_decided_at,
       count(*) AS meetings,
       (array_agg(m.id ORDER BY m.created_at))[1:10] AS sample_ids
FROM public.meetings m
GROUP BY 1, 2, 3
ORDER BY 1 NULLS FIRST;

-- -----------------------------------------------------------------------------
-- P5. Triggers nas tabelas alteradas (não internos)
-- Verificar triggers criados à mão. Os da migration (trg_meetings_guard_request, trg_meetings_request_cancelled,
-- trg_meeting_events_reset_responses, trg_system_settings_validate_operations) são recriados se já existirem.
-- -----------------------------------------------------------------------------
SELECT event_object_table AS table_name, trigger_name, action_timing, string_agg(event_manipulation, ', ') AS events
FROM information_schema.triggers
WHERE event_object_schema = 'public'
  AND event_object_table IN ('meetings', 'meeting_participants', 'meeting_events', 'absence_requests', 'absence_events', 'system_settings')
GROUP BY 1, 2, 3
ORDER BY 1, 2;

-- -----------------------------------------------------------------------------
-- P6. Restantes tabelas alteradas
-- Esperado (antes): meeting_participants sem response/responded_at/response_comment; absence_requests sem kind.
-- -----------------------------------------------------------------------------
SELECT table_name, column_name, data_type, is_nullable, column_default
FROM information_schema.columns
WHERE table_schema = 'public'
  AND ((table_name = 'meeting_participants') OR (table_name = 'absence_requests' AND column_name IN ('kind', 'status')))
ORDER BY table_name, ordinal_position;

-- -----------------------------------------------------------------------------
-- P7. Funções que a migration substitui (assinatura muda) ou cria
-- Esperado (antes): create_meeting com 10 argumentos; funções novas ausentes. Uma função alterada à mão no
-- painel é substituída pela versão do repositório: comparar a definição (pg_get_functiondef) se houver dúvidas.
-- -----------------------------------------------------------------------------
SELECT n.nspname || '.' || p.proname AS function_name, pg_get_function_identity_arguments(p.oid) AS arguments,
       pg_get_function_result(p.oid) AS result, p.prosecdef AS security_definer, p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname IN ('public', 'private')
  AND p.proname IN (
      'create_meeting', 'decide_meeting_request', 'request_meeting', 'request_meeting_participation', 'cancel_meeting_request',
      'respond_to_reschedule_proposal', 'respond_to_meeting', 'get_meeting_people', 'list_my_leads', 'list_work_people',
      'communicate_absence', 'get_timesheet_history', 'refresh_approval_reminders', 'get_hours_report', 'get_hours_trend',
      'get_approval_report', 'is_colleague', 'open_meeting_request', 'approval_reminder_days', 'assert_report_range',
      'assert_report_scope', 'is_valid_approval_reminder_days'
  )
ORDER BY 1, 2;

-- -----------------------------------------------------------------------------
-- P8. Objetos que dependem das funções que vão ser recriadas (DROP FUNCTION)
-- Esperado: nenhuma linha. Uma vista que dependa delas impediria o DROP (a migration falharia sem aplicar nada).
-- -----------------------------------------------------------------------------
SELECT d.classid::regclass AS dependent_catalog, d.objid, p.proname AS function_name
FROM pg_depend d
JOIN pg_proc p ON p.oid = d.refobjid
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname IN ('create_meeting', 'decide_meeting_request', 'get_meeting_people', 'list_work_people')
  AND d.deptype = 'n';

-- -----------------------------------------------------------------------------
-- P9. Perfis de acesso e permissões envolvidas
-- Esperado: os cinco perfis existem; TIMESHEET_ABSENCE_NOTIFY ainda não existe.
-- -----------------------------------------------------------------------------
SELECT 'role' AS kind, code FROM public.roles WHERE code IN ('ADMIN', 'IT', 'MANAGER', 'GESTOR', 'EMPLOYEE')
UNION ALL
SELECT 'permission', code FROM public.permissions WHERE code IN ('TIMESHEET_MEETING_CREATE', 'TIMESHEET_ABSENCE_NOTIFY')
ORDER BY 1, 2;

-- -----------------------------------------------------------------------------
-- P10. Volume (estimativa do tempo de bloqueio das ALTER TABLE)
-- -----------------------------------------------------------------------------
SELECT 'meetings' AS table_name, count(*) FROM public.meetings
UNION ALL SELECT 'meeting_participants', count(*) FROM public.meeting_participants
UNION ALL SELECT 'meeting_events', count(*) FROM public.meeting_events
UNION ALL SELECT 'absence_requests', count(*) FROM public.absence_requests;

-- -----------------------------------------------------------------------------
-- P11. Tipos de evento históricos (comparar com as listas de P0)
-- Um tipo que não conste das listas bloqueia a migration. Não apagar nem converter eventos: perceber primeiro
-- de onde vieram (eventos são histórico append-only).
-- -----------------------------------------------------------------------------
SELECT 'meeting_events' AS table_name, event_type::TEXT AS event_type, count(*) AS total
FROM public.meeting_events
GROUP BY event_type::TEXT
UNION ALL
SELECT 'absence_events', event_type::TEXT, count(*)
FROM public.absence_events
GROUP BY event_type::TEXT
ORDER BY table_name, event_type;

-- -----------------------------------------------------------------------------
-- P12. Pedidos de ausência incompatíveis com as regras novas (por categoria, só identificadores)
-- Esperado: nenhuma linha. kind é lido como JSON (antes da migration ainda não existe e vale REQUEST).
-- -----------------------------------------------------------------------------
WITH rows AS (
    SELECT a.id, a.reference, a.status, coalesce(to_jsonb(a) ->> 'kind', 'REQUEST') AS kind,
           a.validated_by IS NOT NULL AS has_validation, a.decided_by IS NOT NULL AS has_decision
    FROM public.absence_requests a
)
SELECT problem, count(*) AS total, (array_agg(reference ORDER BY reference))[1:20] AS sample_references
FROM (
    SELECT 'estado não permitido' AS problem, reference FROM rows
    WHERE status NOT IN ('DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMMUNICATED')
    UNION ALL SELECT 'tipo (kind) não permitido', reference FROM rows WHERE kind NOT IN ('REQUEST', 'NOTICE')
    UNION ALL SELECT 'NOTICE com estado diferente de COMMUNICATED/CANCELLED', reference FROM rows WHERE kind = 'NOTICE' AND status NOT IN ('COMMUNICATED', 'CANCELLED')
    UNION ALL SELECT 'NOTICE com validação ou decisão', reference FROM rows WHERE kind = 'NOTICE' AND (has_validation OR has_decision)
    UNION ALL SELECT 'REQUEST com estado COMMUNICATED', reference FROM rows WHERE kind = 'REQUEST' AND status = 'COMMUNICATED'
) AS problems
GROUP BY problem
ORDER BY problem;

-- -----------------------------------------------------------------------------
-- P13. Definição APPROVAL_REMINDER_DAYS
-- Esperado: nenhuma linha (será criada com 3) ou um inteiro de 1 a 30 (é mantido). Um valor inválido bloqueia a
-- migration: corrigir em Configurações antes de aplicar. A migration nunca substitui o valor existente.
-- -----------------------------------------------------------------------------
SELECT key, value,
       CASE WHEN value ~ '^[0-9]{1,2}$' THEN value::INTEGER BETWEEN 1 AND 30 ELSE false END AS valid,
       updated_at
FROM public.system_settings
WHERE key = 'APPROVAL_REMINDER_DAYS';

-- -----------------------------------------------------------------------------
-- P14. RLS e políticas de leitura das tabelas usadas pelos relatórios
-- As funções de relatório são SECURITY INVOKER: só agregam o que estas políticas deixam ler. Comparar com as
-- migrations do repositório (20261008000000_manager_scope_and_reviews.sql) e investigar diferenças.
-- -----------------------------------------------------------------------------
SELECT c.relname AS table_name, c.relrowsecurity AS rls_enabled, pol.policyname, pol.cmd, pol.roles, pol.qual
FROM pg_class c
LEFT JOIN pg_policies pol ON pol.schemaname = 'public' AND pol.tablename = c.relname
WHERE c.oid IN (to_regclass('public.timesheets'), to_regclass('public.timesheet_entries'),
                to_regclass('public.timesheet_approvals'), to_regclass('public.profiles'))
ORDER BY c.relname, pol.cmd, pol.policyname;

-- -----------------------------------------------------------------------------
-- P15. Esquemas expostos pelo PostgREST
-- Esperado: private ausente. Se não houver linhas, a configuração não está guardada no papel authenticator:
-- confirmar em Settings › API › Exposed schemas.
-- -----------------------------------------------------------------------------
SELECT rolname, setting
FROM pg_roles, unnest(rolconfig) AS setting
WHERE rolname = 'authenticator' AND setting LIKE 'pgrst.%';
