// Ensaio do procedimento de aplicação das migrations 20261015 no estado real de produção:
//   * base de dados até 20261014 com dados criados pelas funções antigas (reuniões, participantes, ausência);
//   * as quatro colunas do pedido acrescentadas à mão em meetings;
//   * pré-verificação (supabase/scripts/20261015_preflight.sql) → aplicação → pós-verificação (…_postcheck.sql).
// Cada script devolve OK / AVISO / BLOQUEIO por verificação e um RESULTADO GLOBAL. Cenários: estado real (só o aviso
// de exposição do esquema, que SQL não consegue determinar), reparação com DEFAULT/NOT NULL (avisos), restrição
// desconhecida, definição de lembretes inválida e dados históricos incompatíveis (bloqueios: a migration para sem
// aplicar nada e não corrige dados). Executar com: npm run test:db
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const MIGRATIONS = join(import.meta.dirname, '..', 'migrations');
const SCRIPTS = join(import.meta.dirname, '..', 'scripts');
const COLLABORATION = '20261015000000_collaboration_availability_reminders.sql';
const REPORTING = '20261015000001_reporting_centre.sql';
const collaborationSql = readFileSync(join(MIGRATIONS, COLLABORATION), 'utf8');
const reportingSql = readFileSync(join(MIGRATIONS, REPORTING), 'utf8');
const preflightSql = readFileSync(join(SCRIPTS, '20261015_preflight.sql'), 'utf8');
const postcheckSql = readFileSync(join(SCRIPTS, '20261015_postcheck.sql'), 'utf8');
// P0 (resumo) é a primeira instrução do script, até ao bloco P1.
const preflightSummarySql = preflightSql.slice(preflightSql.indexOf('WITH'), preflightSql.indexOf('-- P1.') - '-- -----------------------------------------------------------------------------\n'.length);

// Histórico da CLI (em produção existe em supabase_migrations; aqui é reproduzido para a pré-verificação).
const MIGRATION_HISTORY = `
  CREATE SCHEMA supabase_migrations;
  CREATE TABLE supabase_migrations.schema_migrations (version TEXT PRIMARY KEY, name TEXT);
  INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('20261014000000', 'profile_preferences');
`;
const PLAIN_REPAIR = `
  ALTER TABLE public.meetings
    ADD COLUMN requested_with UUID REFERENCES public.profiles(id),
    ADD COLUMN request_status TEXT,
    ADD COLUMN request_decided_at TIMESTAMPTZ,
    ADD COLUMN request_decision_comment TEXT;
`;
// A exposição do esquema private no PostgREST não é determinável por SQL neste ambiente (nem, em geral, no Supabase).
const UNDETERMINABLE = 'esquema private não exposto no PostgREST';

const report = new TestReport();
// O detalhe só é mostrado quando a verificação falha.
const check = (condition: boolean, label: string, detail = '') => report.check(condition, condition || !detail ? label : `${label} — ${detail}`);
const inHours = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();

type Row = { check_name: string; status: 'OK' | 'AVISO' | 'BLOQUEIO'; detail: string };
async function run(db: TestDatabase, sql: string): Promise<Row[]> {
  const result = await db.asPostgres<Row>(sql);
  if (result.error) throw new Error(result.error);
  return result.rows;
}
const global = (rows: Row[]) => rows.find((row) => row.check_name === 'RESULTADO GLOBAL')?.status;
const statusOf = (rows: Row[], name: string) => rows.find((row) => row.check_name.startsWith(name))?.status;
const issues = (rows: Row[], status: Row['status']) => rows.filter((row) => row.status === status && row.check_name !== 'RESULTADO GLOBAL');
const names = (rows: Row[]) => rows.map((row) => row.check_name).join(' | ');

/** Estado de produção: migrations até 20261014, dados reais criados com as funções antigas e a reparação manual. */
async function productionState(manualRepair: string) {
  const db = await TestDatabase.create(MIGRATIONS, { stopBefore: COLLABORATION });
  const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
  const gestor = await db.createUser(admin.authId, 'gestor@siholdings-mz.com', 'Gil Gestor', 'GESTOR', 'OPS');
  const ana = await db.createUser(admin.authId, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
  await db.asUser(admin.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [gestor.profileId, await db.departmentId('OPS')]);
  const oldMeeting = await db.asUser<{ id: string }>(gestor.authId, 'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[]) AS id', [
    'Reunião criada antes da migration', inHours(24), inHours(25), [ana.profileId],
  ]);
  const vacation = await db.scalar<string>("SELECT id AS value FROM public.absence_types WHERE code = 'VACATION'");
  const oldAbsence = await db.asUser<{ id: string }>(ana.authId, "SELECT public.save_absence_request(NULL, $1, current_date + 10, current_date + 12, 'Férias') AS id", [vacation]);
  const setup = await db.execScript(MIGRATION_HISTORY + manualRepair);
  if (setup.error) throw new Error(setup.error);
  return { db, gestor, ana, meetingId: oldMeeting.rows[0]?.id ?? '', absenceId: oldAbsence.rows[0]?.id ?? '', setupError: oldMeeting.error ?? oldAbsence.error };
}

/** Nada da migration ficou aplicado (tudo ou nada). */
async function nothingApplied(db: TestDatabase): Promise<boolean> {
  const result = await db.asPostgres<{ value: boolean }>(
    `SELECT to_regprocedure('private.is_colleague(uuid,uuid)') IS NULL
        AND NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'meeting_participants' AND column_name = 'response')
        AND NOT EXISTS (SELECT 1 FROM public.permissions WHERE code = 'TIMESHEET_ABSENCE_NOTIFY') AS value`
  );
  return result.rows[0]?.value === true;
}

// =============================================================================
report.section('Estado real: colunas acrescentadas à mão, sem valores por omissão');
{
  const { db, gestor, ana, meetingId, absenceId, setupError } = await productionState(PLAIN_REPAIR);
  check(!setupError && Boolean(meetingId) && Boolean(absenceId), `dados criados com as funções antigas ${setupError ?? ''}`);

  const fullPreflight = await db.execScript(preflightSql);
  check(!fullPreflight.error, `todos os blocos da pré-verificação correm antes da migration ${fullPreflight.error ?? ''}`);
  const before = await run(db, preflightSummarySql);
  check(global(before) === 'AVISO' && issues(before, 'BLOQUEIO').length === 0, 'pré-verificação: sem bloqueios', names(issues(before, 'BLOQUEIO')));
  check(issues(before, 'AVISO').map((row) => row.check_name).join() === UNDETERMINABLE, 'o único aviso é o que SQL não consegue determinar (exposição do esquema)', names(issues(before, 'AVISO')));
  const history = await db.asPostgres<{ version: string }>('SELECT version FROM supabase_migrations.schema_migrations ORDER BY version');
  check(history.rows.map((row) => row.version).join() === '20261014000000', 'a pré-verificação não alterou o histórico');

  const postBefore = await run(db, postcheckSql);
  check(global(postBefore) === 'BLOQUEIO', 'antes da aplicação, a pós-verificação corre (sem erro) e bloqueia', `${issues(postBefore, 'BLOQUEIO').length} bloqueios`);

  const applied = await db.execScript(collaborationSql);
  check(!applied.error, `20261015000000 aplica-se sobre o estado reparado à mão ${applied.error ?? ''}`);
  check(!applied.notices.some((notice) => notice.includes('por validar')), 'sem avisos de restrições por validar (dados existentes cumprem as regras)');
  const reporting = await db.execScript(reportingSql);
  check(!reporting.error, `20261015000001 aplica-se a seguir ${reporting.error ?? ''}`);

  const after = await run(db, postcheckSql);
  check(after.length >= 80 && issues(after, 'BLOQUEIO').length === 0, `pós-verificação: ${after.length - 1} verificações sem bloqueios`, names(issues(after, 'BLOQUEIO')));
  check(issues(after, 'AVISO').map((row) => row.check_name).join() === UNDETERMINABLE, 'pós-verificação: o único aviso é a exposição do esquema (confirmar no painel)', names(issues(after, 'AVISO')));
  check(global(after) === 'AVISO', 'o resultado global não declara sucesso total enquanto houver um ponto por confirmar');

  // Nenhum dado existente foi apagado ou alterado indevidamente.
  const meeting = await db.asPostgres<{ title: string; status: string; request_status: string | null }>('SELECT title, status, request_status FROM public.meetings WHERE id = $1', [meetingId]);
  check(meeting.rows[0]?.title === 'Reunião criada antes da migration' && meeting.rows[0]?.status === 'PLANNED' && meeting.rows[0]?.request_status === null, 'a reunião existente mantém-se, como reunião normal');
  const participants = await db.asPostgres<{ profile_id: string; response: string }>('SELECT profile_id, response FROM public.meeting_participants WHERE meeting_id = $1', [meetingId]);
  check(participants.rows.length === 1 && participants.rows[0]?.profile_id === ana.profileId && participants.rows[0]?.response === 'PENDING', 'o participante existente mantém-se, com a resposta por dar');
  const absence = await db.asPostgres<{ status: string; kind: string }>('SELECT status, kind FROM public.absence_requests WHERE id = $1', [absenceId]);
  check(absence.rows[0]?.status === 'DRAFT' && absence.rows[0]?.kind === 'REQUEST', 'o pedido de ausência existente mantém-se, como pedido formal');
  const setting = await db.asPostgres<{ value: string }>("SELECT value FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS'");
  check(setting.rows[0]?.value === '3', 'a definição de lembretes foi criada com o valor por omissão (não existia)');

  // A aplicação anterior (create_meeting com os argumentos de antes) continua a funcionar depois da migration.
  const legacyCall = await db.asUser(gestor.authId, 'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[]) AS id', [
    'Chamada com os argumentos antigos', inHours(30), inHours(31), [ana.profileId],
  ]);
  check(!legacyCall.error, `compatível com a versão anterior da aplicação ${legacyCall.error ?? ''}`);

  // Segunda aplicação (por exemplo, `db push` depois de uma aplicação manual não registada): sem efeitos.
  const again = await db.execScript(collaborationSql + reportingSql);
  check(!again.error && issues(await run(db, postcheckSql), 'BLOQUEIO').length === 0, 'aplicar de novo não falha nem altera o resultado');
}

// =============================================================================
report.section('Variante: reparação manual com valor por omissão e NOT NULL');
{
  const { db, gestor, ana } = await productionState(`
    ALTER TABLE public.meetings
      ADD COLUMN requested_with UUID,
      ADD COLUMN request_status VARCHAR(10) NOT NULL DEFAULT 'NONE',
      ADD COLUMN request_decided_at TIMESTAMPTZ,
      ADD COLUMN request_decision_comment TEXT;
  `);
  const before = await run(db, preflightSummarySql);
  check(issues(before, 'BLOQUEIO').length === 0 && statusOf(before, 'colunas do pedido sem DEFAULT') === 'AVISO' && statusOf(before, 'reuniões com dados de pedido') === 'AVISO',
    'pré-verificação: avisos (DEFAULT/NOT NULL e dados de pedido), sem bloqueio', names(issues(before, 'AVISO')));
  const applied = await db.execScript(collaborationSql + reportingSql);
  check(!applied.error, `aplica-se mesmo com DEFAULT/NOT NULL nas colunas ${applied.error ?? ''}`);
  check(applied.notices.some((notice) => notice.includes('meetings_request_status_valid')), 'avisa que a reunião existente (request_status = NONE) está fora da regra');
  const created = await db.asUser(gestor.authId, 'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[])', [
    'Nova reunião normal', inHours(40), inHours(41), [ana.profileId],
  ]);
  check(!created.error, `novas reuniões normais continuam a ser criadas (o DEFAULT foi retirado) ${created.error ?? ''}`);
  const after = await run(db, postcheckSql);
  check(statusOf(after, 'restrição meetings_request_status_valid') === 'AVISO', 'pós-verificação: restrição por validar apresentada como aviso (ativa para dados novos)');
  check(statusOf(after, 'reuniões com dados de pedido coerentes') === 'AVISO', 'pós-verificação: reuniões marcadas indevidamente identificadas');
  check(issues(after, 'BLOQUEIO').length === 0 && global(after) === 'AVISO', 'o resultado global é AVISO, nunca OK', names(issues(after, 'BLOQUEIO')));
}

// =============================================================================
report.section('Bloqueio: restrição desconhecida sobre as colunas do pedido');
{
  const { db } = await productionState(PLAIN_REPAIR + `
    ALTER TABLE public.meetings ADD CONSTRAINT meetings_request_status_check CHECK (request_status IN ('PENDING', 'ACCEPTED', 'REJECTED'));
  `);
  const before = await run(db, preflightSummarySql);
  check(statusOf(before, 'restrições desconhecidas') === 'BLOQUEIO' && global(before) === 'BLOQUEIO', 'a pré-verificação bloqueia e indica a restrição');
  const applied = await db.execScript(collaborationSql);
  check(applied.error?.includes('meetings_request_status_check') ?? false, 'a migration para e indica a restrição desconhecida');
  check(await nothingApplied(db), 'nada foi aplicado (tudo ou nada)');
}

// =============================================================================
report.section('Bloqueio: APPROVAL_REMINDER_DAYS já existe com um valor inválido');
{
  const { db } = await productionState(PLAIN_REPAIR + `
    INSERT INTO public.system_settings (key, value, description) VALUES ('APPROVAL_REMINDER_DAYS', 'abc', 'criada à mão');
  `);
  const before = await run(db, preflightSummarySql);
  check(statusOf(before, 'definição APPROVAL_REMINDER_DAYS') === 'BLOQUEIO', 'a pré-verificação bloqueia e mostra o valor', before.find((row) => row.check_name.startsWith('definição'))?.detail ?? '');
  const applied = await db.execScript(collaborationSql);
  check(applied.error?.includes('APPROVAL_REMINDER_DAYS já existe com um valor inválido (abc)') ?? false, 'a migration para com o diagnóstico', applied.error ?? '');
  check(await nothingApplied(db), 'nada foi aplicado');
  const kept = await db.asPostgres<{ value: string }>("SELECT value FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS'");
  check(kept.rows[0]?.value === 'abc', 'o valor existente não foi substituído automaticamente');
}

// =============================================================================
report.section('Bloqueio: dados históricos incompatíveis com as restrições novas');
{
  const { db, meetingId, absenceId } = await productionState(PLAIN_REPAIR);
  // Simula alterações feitas à mão: restrições antigas retiradas e registos fora das regras.
  const tampered = await db.execScript(`
    ALTER TABLE public.meeting_events DROP CONSTRAINT meeting_events_type_valid;
    INSERT INTO public.meeting_events (meeting_id, event_type) VALUES ('${meetingId}', 'MEETING_LEGACY_IMPORT');
    ALTER TABLE public.absence_requests DROP CONSTRAINT absence_requests_status_valid;
    UPDATE public.absence_requests SET status = 'ARCHIVED', submitted_at = now() WHERE id = '${absenceId}';
  `);
  check(!tampered.error, `preparação dos dados incompatíveis ${tampered.error ?? ''}`);
  const before = await run(db, preflightSummarySql);
  check(statusOf(before, 'meeting_events: tipos') === 'BLOQUEIO' && (before.find((row) => row.check_name.startsWith('meeting_events'))?.detail.includes('MEETING_LEGACY_IMPORT') ?? false),
    'pré-verificação: tipo de evento desconhecido identificado');
  check(statusOf(before, 'absence_requests: estados') === 'BLOQUEIO' && (before.find((row) => row.check_name.startsWith('absence_requests'))?.detail.includes('estado não permitido=1') ?? false),
    'pré-verificação: estado de ausência não permitido identificado, por categoria');
  const detail = await db.execScript(preflightSql);
  check(!detail.error, 'os blocos de detalhe (P11, P12) correm sem erro');
  const applied = await db.execScript(collaborationSql);
  check((applied.error?.includes('meeting_events com event_type desconhecido: 1') ?? false) && (applied.error?.includes('absence_requests com estado ou tipo incompatível: 1') ?? false),
    'a migration para com a contagem e os identificadores dos registos', applied.error ?? '');
  check(await nothingApplied(db), 'nada foi aplicado');
  const preserved = await db.asPostgres<{ value: number }>(
    "SELECT (SELECT count(*) FROM public.meeting_events WHERE event_type = 'MEETING_LEGACY_IMPORT') + (SELECT count(*) FROM public.absence_requests WHERE status = 'ARCHIVED') AS value"
  );
  check(Number(preserved.rows[0]?.value) === 2, 'os registos históricos não foram apagados nem convertidos');
}

// =============================================================================
report.section('Aviso: histórico de migrations inexistente');
{
  const db = await TestDatabase.create(MIGRATIONS, { stopBefore: COLLABORATION });
  const summary = await db.asPostgres<Row>(preflightSummarySql);
  check(!summary.error, `o resumo corre mesmo sem supabase_migrations.schema_migrations ${summary.error ?? ''}`);
  check(statusOf(summary.rows, 'histórico de migrations') === 'AVISO', 'o histórico em falta é apresentado como aviso (não usar db push)');
}

report.finish();
