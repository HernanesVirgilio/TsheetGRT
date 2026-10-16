-- TsheetGRT · Verificação DEPOIS de aplicar 20261015000000 e 20261015000001 (só leitura).
--
-- Uma única consulta: uma linha por verificação, com um estado:
--   BLOQUEIO  algo essencial falta ou está inseguro: a aplicação não pode ser considerada concluída;
--   AVISO     aplicado, mas há um ponto a rever (ex.: restrição por validar por causa de dados antigos);
--   OK        verificado.
-- A primeira linha (RESULTADO GLOBAL) só é OK quando todas as outras são OK. Executar no SQL Editor como
-- administrador. Objetos em falta são procurados com to_regclass/to_regprocedure e aparecem como BLOQUEIO, sem
-- interromper as restantes verificações.
WITH
expected_columns(table_name, column_name, data_type, nullable) AS (
    VALUES
        ('meetings', 'request_status', 'character varying', 'YES'),
        ('meetings', 'requested_with', 'uuid', 'YES'),
        ('meetings', 'request_decided_at', 'timestamp with time zone', 'YES'),
        ('meetings', 'request_decision_comment', 'text', 'YES'),
        ('meetings', 'request_proposed_starts_at', 'timestamp with time zone', 'YES'),
        ('meetings', 'request_proposed_ends_at', 'timestamp with time zone', 'YES'),
        ('meetings', 'client_request_id', 'uuid', 'YES'),
        ('meeting_participants', 'response', 'character varying', 'NO'),
        ('meeting_participants', 'responded_at', 'timestamp with time zone', 'YES'),
        ('meeting_participants', 'response_comment', 'text', 'YES'),
        ('absence_requests', 'kind', 'character varying', 'NO')
),
columns_check AS (
    SELECT 'coluna ' || e.table_name || '.' || e.column_name AS check_name,
           CASE WHEN c.column_name IS NOT NULL AND c.data_type = e.data_type AND c.is_nullable = e.nullable
                     AND (e.table_name <> 'meetings' OR c.column_default IS NULL) THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           coalesce(c.data_type || ' · null=' || c.is_nullable || ' · default=' || coalesce(c.column_default, '—'), 'em falta') AS detail
    FROM expected_columns e
    LEFT JOIN information_schema.columns c
      ON c.table_schema = 'public' AND c.table_name = e.table_name AND c.column_name = e.column_name
),
index_check AS (
    SELECT 'índice único de idempotência meetings_client_request_unique' AS check_name,
           CASE WHEN i.indisunique AND i.indpred IS NOT NULL THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           CASE WHEN i.indexrelid IS NULL THEN 'em falta' ELSE pg_get_indexdef(i.indexrelid) END AS detail
    FROM (SELECT 1) AS one
    LEFT JOIN pg_index i ON i.indexrelid = to_regclass('public.meetings_client_request_unique')
),
expected_constraints(table_name, constraint_name, may_stay_not_valid) AS (
    VALUES
        -- Criadas NOT VALID pela migration: ficam por validar se houver linhas antigas fora da regra (AVISO).
        ('meetings', 'meetings_requested_with_fkey', true), ('meetings', 'meetings_request_status_valid', true),
        ('meetings', 'meetings_request_comment_length', true), ('meetings', 'meetings_request_consistency', true),
        ('meetings', 'meetings_request_not_self', true), ('meetings', 'meetings_request_decision_consistency', true),
        ('meetings', 'meetings_request_rejection_reason', true), ('meetings', 'meetings_request_proposal_consistency', true),
        -- Validadas de imediato (a migration para antes se houver dados incompatíveis): por validar é BLOQUEIO.
        ('meeting_participants', 'meeting_participants_response_valid', false),
        ('meeting_participants', 'meeting_participants_response_comment_length', false),
        ('meeting_participants', 'meeting_participants_response_consistency', false),
        ('meeting_events', 'meeting_events_type_valid', false),
        ('absence_requests', 'absence_requests_kind_valid', false), ('absence_requests', 'absence_requests_status_valid', false),
        ('absence_requests', 'absence_requests_notice_consistency', false), ('absence_events', 'absence_events_type_valid', false)
),
constraints_check AS (
    SELECT 'restrição ' || e.constraint_name AS check_name,
           CASE WHEN c.oid IS NULL THEN 'BLOQUEIO'
                WHEN c.convalidated THEN 'OK'
                WHEN e.may_stay_not_valid THEN 'AVISO'
                ELSE 'BLOQUEIO' END AS status,
           CASE WHEN c.oid IS NULL THEN 'em falta'
                WHEN c.convalidated THEN 'ativa e validada'
                ELSE 'ativa para dados novos, por validar: há linhas antigas fora da regra (corrigir e executar VALIDATE CONSTRAINT)' END AS detail
    FROM expected_constraints e
    LEFT JOIN pg_constraint c ON c.conname = e.constraint_name AND c.conrelid = to_regclass('public.' || e.table_name)
),
foreign_constraints_check AS (
    SELECT 'sem restrições desconhecidas sobre as colunas do pedido' AS check_name,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           coalesce(string_agg(conname, ', '), 'nenhuma') AS detail
    FROM pg_constraint
    WHERE conrelid = to_regclass('public.meetings')
      AND pg_get_constraintdef(oid) ~ '(request_status|requested_with|request_decided_at|request_decision_comment|request_proposed_)'
      AND conname NOT IN (SELECT constraint_name FROM expected_constraints)
),
expected_triggers(table_name, trigger_name, events) AS (
    VALUES
        ('meetings', 'trg_meetings_guard_request', 'UPDATE'),
        ('meetings', 'trg_meetings_request_cancelled', 'UPDATE'),
        ('meeting_events', 'trg_meeting_events_reset_responses', 'INSERT'),
        ('system_settings', 'trg_system_settings_validate_operations', 'INSERT, UPDATE')
),
triggers_check AS (
    SELECT 'trigger ' || e.trigger_name AS check_name,
           CASE WHEN t.oid IS NULL OR t.tgenabled = 'D' THEN 'BLOQUEIO'
                WHEN (SELECT string_agg(event_manipulation, ', ' ORDER BY event_manipulation) FROM information_schema.triggers it
                      WHERE it.trigger_schema = 'public' AND it.trigger_name = e.trigger_name AND it.event_object_table = e.table_name) = e.events
                THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           CASE WHEN t.oid IS NULL THEN 'em falta' WHEN t.tgenabled = 'D' THEN 'desativado'
                ELSE 'ativo em ' || coalesce((SELECT string_agg(event_manipulation, ', ' ORDER BY event_manipulation) FROM information_schema.triggers it
                      WHERE it.trigger_schema = 'public' AND it.trigger_name = e.trigger_name AND it.event_object_table = e.table_name), '?')
                     || ' (esperado: ' || e.events || ')' END AS detail
    FROM expected_triggers e
    LEFT JOIN pg_trigger t ON t.tgname = e.trigger_name AND t.tgrelid = to_regclass('public.' || e.table_name) AND NOT t.tgisinternal
),
-- Funções chamadas pela aplicação: assinatura exata, modo de segurança, search_path fixo, sem anónimos e com
-- acesso autenticado.
expected_functions(signature, definer) AS (
    VALUES
        ('public.create_meeting(text,timestamp with time zone,timestamp with time zone,text,text,text,text,uuid[],uuid,uuid,uuid,uuid)', true),
        ('public.request_meeting_participation(uuid,uuid)', true),
        ('public.cancel_meeting_request(uuid)', true),
        ('public.decide_meeting_request(uuid,text,text,timestamp with time zone,timestamp with time zone)', true),
        ('public.respond_to_reschedule_proposal(uuid,boolean)', true),
        ('public.respond_to_meeting(uuid,text,text)', true),
        ('public.get_meeting_people(uuid)', true),
        ('public.list_my_leads()', true),
        ('public.list_work_people(text)', true),
        ('public.communicate_absence(uuid,date,date,text)', true),
        ('public.cancel_absence_request(uuid,text)', true),
        ('public.get_timesheet_history(uuid)', true),
        ('public.refresh_approval_reminders()', true),
        ('public.get_calendar_items(date,date,text)', false),
        ('public.get_my_work_summary()', true),
        ('public.get_team_work_overview()', true),
        ('public.get_schedule_conflicts(uuid[],timestamp with time zone,timestamp with time zone,uuid,uuid,uuid)', true),
        ('public.get_hours_report(date,date,uuid,uuid)', false),
        ('public.get_hours_trend(date,date,text,uuid,uuid)', false),
        ('public.get_approval_report(date,date,uuid)', false)
),
functions_check AS (
    SELECT 'função ' || e.signature AS check_name,
           CASE WHEN p.oid IS NOT NULL
                     AND p.prosecdef = e.definer
                     AND coalesce('search_path=""' = ANY (p.proconfig), false)
                     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                     AND has_function_privilege('authenticated', p.oid, 'EXECUTE') THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           CASE WHEN p.oid IS NULL THEN 'em falta'
                ELSE concat_ws(' · ', CASE WHEN p.prosecdef THEN 'DEFINER' ELSE 'INVOKER' END,
                               'search_path=' || coalesce(array_to_string(p.proconfig, ','), 'não fixo'),
                               'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE'),
                               'authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')) END AS detail
    FROM expected_functions e
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
),
obsolete_functions_check AS (
    SELECT 'assinaturas antigas de create_meeting e decide_meeting_request removidas' AS check_name,
           CASE WHEN to_regprocedure('public.create_meeting(text,timestamp with time zone,timestamp with time zone,text,text,text,text,uuid[],uuid,uuid)') IS NULL
                     AND to_regprocedure('public.create_meeting(text,timestamp with time zone,timestamp with time zone,text,text,text,text,uuid[],uuid,uuid,uuid)') IS NULL
                     AND to_regprocedure('public.decide_meeting_request(uuid,text,text)') IS NULL THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           'sobrecargas antigas tornariam as chamadas ambíguas' AS detail
),
-- Funções internas: nunca para anon; para authenticated só as chamadas dentro das funções SECURITY INVOKER.
private_functions(signature, authenticated_allowed) AS (
    VALUES
        ('private.is_colleague(uuid,uuid)', false),
        ('private.open_meeting_request(uuid,uuid)', false),
        ('private.add_accepted_lead(uuid,uuid,text)', false),
        ('private.guard_meeting_request()', false),
        ('private.notify_meeting_request_cancelled()', false),
        ('private.reset_meeting_responses()', false),
        ('private.absence_notice_recipients(uuid)', false),
        ('private.is_valid_approval_reminder_days(text)', false),
        ('private.assert_report_range(date,date)', true),
        ('private.assert_report_scope(uuid,uuid)', true),
        ('private.approval_reminder_days()', true)
),
private_check AS (
    SELECT 'função interna ' || e.signature AS check_name,
           CASE WHEN p.oid IS NOT NULL
                     AND coalesce('search_path=""' = ANY (p.proconfig), false)
                     AND NOT has_function_privilege('anon', p.oid, 'EXECUTE')
                     AND has_function_privilege('authenticated', p.oid, 'EXECUTE') = e.authenticated_allowed THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           CASE WHEN p.oid IS NULL THEN 'em falta'
                ELSE 'anon=' || has_function_privilege('anon', p.oid, 'EXECUTE') || ' · authenticated=' || has_function_privilege('authenticated', p.oid, 'EXECUTE')
                     || ' (esperado ' || e.authenticated_allowed || ')' END AS detail
    FROM private_functions e
    LEFT JOIN pg_proc p ON p.oid = to_regprocedure(e.signature)
),
function_results_check AS (
    SELECT 'list_work_people devolve department_id' AS check_name,
           CASE WHEN coalesce(pg_get_function_result(to_regprocedure('public.list_work_people(text)')) LIKE '%department_id uuid%', false) THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           coalesce(pg_get_function_result(to_regprocedure('public.list_work_people(text)')), 'em falta') AS detail
    UNION ALL
    SELECT 'get_meeting_people devolve resposta e is_requested',
           CASE WHEN coalesce(pg_get_function_result(to_regprocedure('public.get_meeting_people(uuid)')) LIKE '%is_requested boolean%', false) THEN 'OK' ELSE 'BLOQUEIO' END,
           coalesce(pg_get_function_result(to_regprocedure('public.get_meeting_people(uuid)')), 'em falta')
),
-- RLS: nenhuma tabela nova; as alteradas e as lidas pelos relatórios continuam protegidas.
rls_tables(table_name) AS (
    VALUES ('meetings'), ('meeting_participants'), ('meeting_events'), ('absence_requests'), ('absence_events'),
           ('timesheets'), ('timesheet_entries'), ('timesheet_approvals'), ('profiles'), ('notifications'), ('system_settings')
),
rls_check AS (
    SELECT 'RLS ativa e sem leitura anónima em ' || r.table_name AS check_name,
           CASE WHEN c.oid IS NOT NULL AND c.relrowsecurity AND NOT has_table_privilege('anon', c.oid, 'SELECT') THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           CASE WHEN c.oid IS NULL THEN 'tabela em falta'
                ELSE 'rls=' || c.relrowsecurity || ' · anon pode ler=' || has_table_privilege('anon', c.oid, 'SELECT') END AS detail
    FROM rls_tables r
    LEFT JOIN pg_class c ON c.oid = to_regclass('public.' || r.table_name)
),
report_policies_check AS (
    -- As funções de relatório (SECURITY INVOKER) dependem destas políticas de leitura.
    SELECT 'política de leitura em ' || r.table_name || ' (usada pelos relatórios)' AS check_name,
           CASE WHEN count(p.policyname) > 0 THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           coalesce(string_agg(p.policyname, ', '), 'nenhuma política SELECT: os relatórios ficariam vazios') AS detail
    FROM (VALUES ('timesheets'), ('timesheet_entries'), ('timesheet_approvals'), ('profiles')) AS r(table_name)
    LEFT JOIN pg_policies p ON p.schemaname = 'public' AND p.tablename = r.table_name AND p.cmd IN ('SELECT', 'ALL')
    GROUP BY r.table_name
),
write_policies_check AS (
    -- Na arquitetura do repositório, reuniões e participantes só são escritos pelas funções (SECURITY DEFINER).
    -- Uma política de escrita não é necessariamente um erro, mas não consta das migrations: rever.
    SELECT 'políticas de escrita em meetings/meeting_participants/meeting_events' AS check_name,
           CASE WHEN count(*) = 0 THEN 'OK' ELSE 'AVISO' END AS status,
           coalesce('fora do repositório, rever: ' || string_agg(tablename || '.' || policyname || ' (' || cmd || ')', ', '), 'nenhuma (escrita só pelas funções)') AS detail
    FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('meetings', 'meeting_participants', 'meeting_events') AND cmd <> 'SELECT'
),
exposure_check AS (
    SELECT 'esquema private não exposto no PostgREST' AS check_name,
           CASE WHEN config IS NULL THEN 'AVISO' WHEN config ~ '(^|[=, ])private([, ]|$)' THEN 'AVISO' ELSE 'OK' END AS status,
           CASE WHEN config IS NULL THEN 'não determinável por SQL: confirmar em Settings › API › Exposed schemas'
                WHEN config ~ '(^|[=, ])private([, ]|$)' THEN 'private está exposto: ' || config
                ELSE config END AS detail
    FROM (SELECT string_agg(setting, ', ') AS config FROM pg_roles, unnest(rolconfig) AS setting
          WHERE rolname = 'authenticator' AND setting LIKE 'pgrst.db_schemas=%') AS exposed
),
data_check AS (
    SELECT 'permissão TIMESHEET_ABSENCE_NOTIFY atribuída a GESTOR, MANAGER e ADMIN' AS check_name,
           CASE WHEN count(DISTINCT r.code) = 3 THEN 'OK' ELSE 'BLOQUEIO' END AS status,
           coalesce(string_agg(DISTINCT r.code, ', '), 'nenhum perfil') AS detail
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE p.code = 'TIMESHEET_ABSENCE_NOTIFY' AND r.code IN ('GESTOR', 'MANAGER', 'ADMIN')
    UNION ALL
    -- A migration não concede a permissão aos colaboradores: só uma autorização explícita (Roles e Permissões)
    -- ou a migration 20261016000000 (reuniões entre colegas), que se aplica depois desta verificação.
    SELECT 'TIMESHEET_MEETING_CREATE não atribuída a EMPLOYEE e IT pela migration',
           CASE WHEN count(DISTINCT r.code) = 0 THEN 'OK' ELSE 'AVISO' END,
           coalesce('atribuída a ' || string_agg(DISTINCT r.code, ', ') || ' (confirmar que foi uma autorização explícita ou a migration 20261016000000)', 'nenhum perfil de colaborador')
    FROM public.role_permissions rp
    JOIN public.roles r ON r.id = rp.role_id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE p.code = 'TIMESHEET_MEETING_CREATE' AND r.code IN ('EMPLOYEE', 'IT')
    UNION ALL
    SELECT 'definição APPROVAL_REMINDER_DAYS válida',
           CASE WHEN count(*) = 1 AND bool_and(CASE WHEN value ~ '^[0-9]{1,2}$' THEN value::INTEGER BETWEEN 1 AND 30 ELSE false END) THEN 'OK' ELSE 'BLOQUEIO' END,
           coalesce(max(value), 'em falta') || ' (inteiro de 1 a 30)'
    FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS'
    UNION ALL
    SELECT 'categorias das notificações novas',
           CASE WHEN to_regprocedure('private.notification_category(text)') IS NOT NULL
                     AND private.notification_category('MEETING_REQUEST') = 'APPROVAL_REQUEST'
                     AND private.notification_category('MEETING_REQUEST_DECIDED') = 'DECISION'
                     AND private.notification_category('APPROVAL_REMINDER') = 'APPROVAL_REQUEST'
                     AND private.notification_category('TIMESHEET_SUBMISSION_REMINDER') = 'DEADLINE' THEN 'OK' ELSE 'BLOQUEIO' END,
           'MEETING_REQUEST, MEETING_REQUEST_DECIDED, APPROVAL_REMINDER, TIMESHEET_SUBMISSION_REMINDER'
    UNION ALL
    SELECT 'reuniões com dados de pedido coerentes',
           CASE WHEN count(*) FILTER (WHERE request_status IS NOT NULL AND requested_with IS NULL) = 0 THEN 'OK' ELSE 'AVISO' END,
           count(*) FILTER (WHERE request_status IS NULL) || ' sem pedido · ' || count(*) FILTER (WHERE request_status IS NOT NULL) || ' com pedido · '
               || count(*) FILTER (WHERE request_status IS NOT NULL AND requested_with IS NULL) || ' com estado de pedido sem chefia (rever)'
    FROM public.meetings
),
checks AS (
    SELECT * FROM columns_check
    UNION ALL SELECT * FROM index_check
    UNION ALL SELECT * FROM constraints_check
    UNION ALL SELECT * FROM foreign_constraints_check
    UNION ALL SELECT * FROM triggers_check
    UNION ALL SELECT * FROM functions_check
    UNION ALL SELECT * FROM obsolete_functions_check
    UNION ALL SELECT * FROM private_check
    UNION ALL SELECT * FROM function_results_check
    UNION ALL SELECT * FROM rls_check
    UNION ALL SELECT * FROM report_policies_check
    UNION ALL SELECT * FROM write_policies_check
    UNION ALL SELECT * FROM exposure_check
    UNION ALL SELECT * FROM data_check
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
