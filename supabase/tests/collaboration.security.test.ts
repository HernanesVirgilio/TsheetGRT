// Testes da colaboração e disponibilidade: reuniões entre colegas (sem aprovação) e respostas aos convites,
// pedidos de reunião a uma chefia (aceitar/recusar), comunicação de ausência distinta do pedido formal,
// histórico do timesheet a partir dos registos guardados e lembretes por regra sem duplicados.
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'));
const report = new TestReport();
const check = report.check.bind(report);

const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
const manager = await db.createUser(admin.authId, 'manager@siholdings-mz.com', 'Marta Manager', 'MANAGER', 'OPS');
const gestor = await db.createUser(admin.authId, 'gestor.ops@siholdings-mz.com', 'Gil Gestor Operações', 'GESTOR', 'OPS');
const gestorFin = await db.createUser(admin.authId, 'gestor.fin@siholdings-mz.com', 'Graça Gestora Finanças', 'GESTOR', 'FIN');
const ana = await db.createUser(admin.authId, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
const rui = await db.createUser(admin.authId, 'rui@siholdings-mz.com', 'Rui Operações', 'EMPLOYEE', 'OPS');
const bruno = await db.createUser(admin.authId, 'bruno@siholdings-mz.com', 'Bruno Finanças', 'EMPLOYEE', 'FIN');

const inHours = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const value = <Value>(sql: string, params: unknown[] = []) => db.scalar<Value>(sql, params);
const notificationsOf = (profileId: string, type: string) =>
  value<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = $2', [profileId, type]);
const scopeTo = async (managerProfileId: string, target: { departmentCode?: string; employeeId?: string }) =>
  db.asUser(admin.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id, employee_id) VALUES ($1, $2, $3)', [
    managerProfileId,
    target.departmentCode ? await db.departmentId(target.departmentCode) : null,
    target.employeeId ?? null,
  ]);
const inDays = async (days: number) => value<string>(`SELECT to_char((now() AT TIME ZONE 'Africa/Maputo')::date + ${days}, 'YYYY-MM-DD') AS value`);

await scopeTo(gestor.profileId, { departmentCode: 'OPS' });
await scopeTo(gestorFin.profileId, { departmentCode: 'FIN' });
await scopeTo(manager.profileId, { employeeId: gestor.profileId });

// =============================================================================
report.section('Reuniões entre colegas');
const createMeeting = (authId: string, title: string, participants: string[], start = 24, end = 25) =>
  db.asUser<{ id: string }>(authId, 'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[]) AS id', [
    title,
    inHours(start),
    inHours(end),
    participants,
  ]);
const colleagueMeeting = await createMeeting(ana.authId, 'Alinhamento entre colegas', [rui.profileId]);
check(!colleagueMeeting.error, `colaborador agenda reunião com um colega ${colleagueMeeting.error ?? ''}`);
const meetingId = colleagueMeeting.rows[0]?.id ?? '';
check((await value<string>('SELECT status AS value FROM public.meetings WHERE id = $1', [meetingId])) === 'PLANNED', 'a reunião não passa por aprovação');
check((await value<string | null>('SELECT request_status AS value FROM public.meetings WHERE id = $1', [meetingId])) === null, 'reunião normal não é um pedido');
check((await notificationsOf(rui.profileId, 'MEETING_INVITED')) === 1, 'o colega recebe o convite');
check(
  (await createMeeting(ana.authId, 'Reunião com Finanças', [bruno.profileId])).error?.includes('Fora do seu âmbito') ?? false,
  'colaborador não convida pessoas de outro departamento ou equipa'
);
check(!(await createMeeting(ana.authId, 'Reunião com o gestor', [gestor.profileId], 26, 27)).error, 'colaborador convida a sua chefia');

report.section('Respostas aos convites');
const respond = (authId: string, response: string, comment: string | null = null) =>
  db.asUser(authId, 'SELECT public.respond_to_meeting($1, $2, $3)', [meetingId, response, comment]);
const responseOf = (profileId: string) =>
  value<string>('SELECT response AS value FROM public.meeting_participants WHERE meeting_id = $1 AND profile_id = $2', [meetingId, profileId]);
check((await responseOf(rui.profileId)) === 'PENDING', 'o convite começa por responder');
check(!(await respond(rui.authId, 'ACCEPTED')).error, 'o convidado aceita');
check((await responseOf(rui.profileId)) === 'ACCEPTED', 'a resposta fica registada');
check((await notificationsOf(ana.profileId, 'MEETING_RESPONSE')) === 1, 'o organizador é notificado da resposta');
check((await respond(ana.authId, 'ACCEPTED')).code === '42501', 'o organizador não responde ao próprio convite');
check((await respond(bruno.authId, 'ACCEPTED')).code === '42501', 'quem não foi convidado não responde');
check((await respond(rui.authId, 'TALVEZ')).error?.includes('Resposta inválida') ?? false, 'resposta inválida recusada');
await db.asUser(ana.authId, "SELECT public.update_meeting($1, 'Alinhamento entre colegas', $2::timestamptz, $3::timestamptz, '', '', NULL, NULL, $4::uuid[])", [
  meetingId,
  inHours(30),
  inHours(31),
  [rui.profileId],
]);
check((await responseOf(rui.profileId)) === 'PENDING', 'reagendar volta a pedir a resposta');
const people = await db.asUser<{ profile_id: string; response: string }>(rui.authId, 'SELECT * FROM public.get_meeting_people($1)', [meetingId]);
check(people.rows.length === 2 && people.rows.some((row) => row.profile_id === rui.profileId && row.response === 'PENDING'), 'participantes com a resposta de cada um');

// =============================================================================
report.section('Pedido de reunião a uma chefia');
const requestMeeting = (authId: string, leadId: string, title: string, start = 48, end = 49) =>
  db.asUser<{ id: string }>(authId, 'SELECT public.request_meeting($1, $2, $3::timestamptz, $4::timestamptz, $5) AS id', [
    leadId,
    title,
    inHours(start),
    inHours(end),
    'Rever o plano de férias',
  ]);
const leads = await db.asUser<{ profile_id: string }>(ana.authId, 'SELECT * FROM public.list_my_leads()');
check(leads.rows.some((row) => row.profile_id === gestor.profileId) && leads.rows.some((row) => row.profile_id === manager.profileId), 'chefias configuradas (gestor e Manager)');
check((await db.asUser<{ profile_id: string }>(bruno.authId, 'SELECT * FROM public.list_my_leads()')).rows.every((row) => row.profile_id !== gestor.profileId), 'chefias de outra equipa não aparecem');
check((await requestMeeting(ana.authId, gestorFin.profileId, 'Pedido indevido')).code === '42501', 'não se pede reunião a quem não é chefia configurada');
check((await requestMeeting(ana.authId, rui.profileId, 'Pedido a colega')).code === '42501', 'um colega não é tratado como chefia');
const request = await requestMeeting(ana.authId, gestor.profileId, 'Conversa sobre objetivos');
check(!request.error, `colaborador pede reunião ao gestor ${request.error ?? ''}`);
const requestId = request.rows[0]?.id ?? '';
check((await requestMeeting(ana.authId, gestor.profileId, 'Pedido repetido')).error?.includes('pedido pendente') ?? false, 'pedido repetido para a mesma hora recusado');
check((await notificationsOf(gestor.profileId, 'MEETING_REQUEST')) === 1, 'a chefia recebe o pedido');
check((await db.asUser(ana.authId, 'SELECT public.confirm_meeting($1)', [requestId])).error !== null, 'quem pede não confirma a reunião sozinho');
const decide = (authId: string, id: string, decision: string, comment: string | null = null) =>
  db.asUser(authId, 'SELECT public.decide_meeting_request($1, $2, $3)', [id, decision, comment]);
check((await decide(rui.authId, requestId, 'ACCEPTED')).code === '42501', 'outra pessoa não decide o pedido');
check((await decide(manager.authId, requestId, 'ACCEPTED')).code === '42501', 'só decide a pessoa a quem foi pedido');
check((await decide(gestor.authId, requestId, 'REJECTED')).error?.includes('motivo') ?? false, 'recusar exige motivo');
check(!(await decide(gestor.authId, requestId, 'REJECTED', 'Estou em formação nesse dia')).error, 'a chefia recusa com motivo');
const rejected = await db.asUser<{ status: string; request_status: string }>(ana.authId, 'SELECT status, request_status FROM public.meetings WHERE id = $1', [requestId]);
check(rejected.rows[0]?.status === 'CANCELLED' && rejected.rows[0]?.request_status === 'REJECTED', 'pedido recusado deixa de ocupar a agenda');
check((await notificationsOf(ana.profileId, 'MEETING_REQUEST_DECIDED')) === 1, 'quem pediu é notificado da decisão');
check((await decide(gestor.authId, requestId, 'ACCEPTED')).error?.includes('já foi decidido') ?? false, 'segunda decisão recusada');
check((await value<number>("SELECT count(*)::int AS value FROM public.audit_events WHERE action = 'meeting.request_rejected'")) === 1, 'a decisão fica auditada');
const retry = await requestMeeting(ana.authId, gestor.profileId, 'Conversa sobre objetivos', 72, 73);
check(!retry.error, 'quem pediu propõe outro horário');
check(!(await decide(gestor.authId, retry.rows[0]?.id ?? '', 'ACCEPTED')).error, 'a chefia aceita');
check((await value<string>('SELECT status AS value FROM public.meetings WHERE id = $1', [retry.rows[0]?.id ?? ''])) === 'CONFIRMED', 'pedido aceite fica confirmado');

// =============================================================================
report.section('Comunicar ausência');
const vacation = await value<string>("SELECT id AS value FROM public.absence_types WHERE code = 'VACATION'");
const communicate = async (authId: string, start: number, end: number) =>
  db.asUser<{ id: string }>(authId, "SELECT public.communicate_absence($1, $2::date, $3::date, 'Deslocação') AS id", [vacation, await inDays(start), await inDays(end)]);
check((await communicate(ana.authId, 5, 6)).code === '42501', 'colaborador não comunica ausências (faz um pedido formal)');
const notice = await communicate(gestor.authId, 5, 7);
check(!notice.error, `gestor comunica a ausência ${notice.error ?? ''}`);
const noticeId = notice.rows[0]?.id ?? '';
const noticeRow = await db.asUser<{ status: string; kind: string; decided_by: string | null }>(gestor.authId, 'SELECT status, kind, decided_by FROM public.absence_requests WHERE id = $1', [noticeId]);
check(noticeRow.rows[0]?.status === 'COMMUNICATED' && noticeRow.rows[0]?.kind === 'NOTICE' && noticeRow.rows[0]?.decided_by === null, 'registada como comunicação, nunca como aprovada');
check((await notificationsOf(manager.profileId, 'ABSENCE_COMMUNICATED')) === 1, 'a chefia do gestor é informada');
check((await notificationsOf(ana.profileId, 'ABSENCE_COMMUNICATED')) === 1, 'a equipa direta é informada');
check((await notificationsOf(bruno.profileId, 'ABSENCE_COMMUNICATED')) === 0, 'outras equipas não são notificadas');
check((await communicate(gestor.authId, 6, 8)).error?.includes('Já existe') ?? false, 'período sobreposto recusado');
check(
  (await db.asUser(manager.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [noticeId])).error !== null,
  'uma comunicação não pode ser aprovada'
);
const calendar = await db.asUser<{ item_id: string; status: string }>(manager.authId, "SELECT * FROM public.get_calendar_items($1::date, $2::date, 'TEAM')", [await inDays(4), await inDays(8)]);
check(calendar.rows.some((row) => row.item_id === noticeId && row.status === 'COMMUNICATED'), 'a comunicação aparece no calendário da chefia');
check(
  (await db.asPostgres('UPDATE public.absence_requests SET status = \'APPROVED\', decided_by = $2, decided_at = now() WHERE id = $1', [noticeId, manager.profileId])).error !== null,
  'a base de dados impede transformar uma comunicação em aprovação'
);
check(!(await db.asUser(gestor.authId, 'SELECT public.cancel_absence_request($1)', [noticeId])).error, 'quem comunicou pode cancelar');

// =============================================================================
report.section('Histórico do timesheet');
const activityId = await value<string>("SELECT id AS value FROM public.activities WHERE code = 'ACT-OPS-01'");
const timesheet = await db.asUser<{ id: string }>(ana.authId, "INSERT INTO public.timesheets (employee_id, period_start, period_end) VALUES ($1, '2026-09-01', '2026-09-30') RETURNING id", [ana.profileId]);
const timesheetId = timesheet.rows[0]?.id ?? '';
await db.asUser(
  ana.authId,
  `INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, break_minutes, description, total_minutes)
   VALUES ($1, $2, '2026-09-02', $3, '08:00', '17:00', 60, 'Trabalho', 1)`,
  [timesheetId, ana.profileId, activityId]
);
await db.asUser(ana.authId, 'SELECT public.submit_timesheet($1)', [timesheetId]);
check((await db.asUser(gestor.authId, "SELECT public.review_timesheet($1, 'REJECTED', NULL)", [timesheetId])).error?.includes('motivo') ?? false, 'rejeição sem motivo recusada');
await db.asUser(gestor.authId, "SELECT public.review_timesheet($1, 'REJECTED', 'Falta o dia 3')", [timesheetId]);
await db.asUser(ana.authId, 'SELECT public.submit_timesheet($1)', [timesheetId]);
await db.asUser(gestor.authId, "SELECT public.review_timesheet($1, 'APPROVED', 'Correto')", [timesheetId]);
const history = await db.asUser<{ action: string; comment: string | null; actor_name: string | null }>(ana.authId, 'SELECT * FROM public.get_timesheet_history($1)', [timesheetId]);
check(
  history.rows.map((row) => row.action).join(',') === 'timesheet.created,timesheet.submitted,timesheet.rejected,timesheet.submitted,timesheet.approved',
  'criado → submetido → rejeitado → submetido de novo → aprovado'
);
check(history.rows.some((row) => row.action === 'timesheet.rejected' && row.comment === 'Falta o dia 3' && row.actor_name === 'Gil Gestor Operações'), 'a rejeição guarda o motivo e quem decidiu');
check((await db.asUser(gestor.authId, 'SELECT * FROM public.get_timesheet_history($1)', [timesheetId])).rows.length === 5, 'a chefia lê o histórico da equipa');
check((await db.asUser(bruno.authId, 'SELECT * FROM public.get_timesheet_history($1)', [timesheetId])).code === '42501', 'outro colaborador não lê o histórico');
check((await db.asUser(gestorFin.authId, 'SELECT * FROM public.get_timesheet_history($1)', [timesheetId])).code === '42501', 'gestor de outra equipa não lê o histórico');
check((await db.asUser(ana.authId, "SELECT public.review_timesheet($1, 'APPROVED', NULL)", [timesheetId])).error !== null, 'o colaborador nunca decide o próprio timesheet');

// =============================================================================
report.section('Lembretes por regra');
const pending = await db.asUser<{ id: string }>(rui.authId, "INSERT INTO public.timesheets (employee_id, period_start, period_end) VALUES ($1, '2026-09-01', '2026-09-30') RETURNING id", [rui.profileId]);
const pendingId = pending.rows[0]?.id ?? '';
await db.asUser(
  rui.authId,
  `INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, break_minutes, description, total_minutes)
   VALUES ($1, $2, '2026-09-02', $3, '08:00', '17:00', 60, 'Trabalho', 1)`,
  [pendingId, rui.profileId, activityId]
);
const reminders = (authId: string) => db.asUser<{ value: number }>(authId, 'SELECT public.refresh_approval_reminders() AS value');
check(((await reminders(rui.authId)).rows[0]?.value ?? 0) >= 1, 'timesheet com o período terminado gera o lembrete de submissão');
check(((await reminders(rui.authId)).rows[0]?.value ?? -1) === 0, 'o lembrete não se repete');
await db.asUser(rui.authId, 'SELECT public.submit_timesheet($1)', [pendingId]);
check(((await reminders(gestor.authId)).rows[0]?.value ?? -1) === 0, 'submissão recente não gera lembrete');
await db.asPostgres("UPDATE public.timesheets SET submitted_at = now() - interval '5 days' WHERE id = $1", [pendingId]);
check(((await reminders(gestor.authId)).rows[0]?.value ?? 0) === 1, 'aprovação pendente há mais de 3 dias gera o lembrete');
check(((await reminders(gestor.authId)).rows[0]?.value ?? -1) === 0, 'sem lembretes duplicados');
check(((await reminders(gestorFin.authId)).rows[0]?.value ?? -1) === 0, 'gestor de outra equipa não é lembrado');
check(
  (await db.asUser(admin.authId, "UPDATE public.system_settings SET value = '0' WHERE key = 'APPROVAL_REMINDER_DAYS'")).error?.includes('entre 1 e 30') ?? false,
  'o prazo do lembrete é validado'
);

// =============================================================================
report.section('Centro de relatórios (âmbito pela RLS)');
type HoursRow = { employee_id: string; minutes: number; days_worked: number };
const hours = (authId: string) =>
  db.asUser<HoursRow>(authId, "SELECT * FROM public.get_hours_report('2026-09-01'::date, '2026-09-30'::date)");
const gestorHours = await hours(gestor.authId);
check(
  gestorHours.rows.some((row) => row.employee_id === ana.profileId) && gestorHours.rows.some((row) => row.employee_id === rui.profileId),
  'o gestor vê as horas da equipa'
);
check(gestorHours.rows.every((row) => Number(row.minutes) > 0 && Number(row.days_worked) === 1), 'horas e dias agregados no servidor');
check((await hours(gestorFin.authId)).rows.length === 0, 'gestor de outra equipa não vê estas horas');
const ownHours = await hours(ana.authId);
check(ownHours.rows.length === 1 && ownHours.rows[0]?.employee_id === ana.profileId, 'o colaborador vê apenas as próprias horas');
check((await hours(admin.authId)).rows.length === 2, 'a administração vê a organização');
check(
  (await db.asUser(gestor.authId, "SELECT * FROM public.get_hours_report('2025-01-01'::date, '2026-09-30'::date)")).error?.includes('um ano') ?? false,
  'período superior a um ano recusado'
);
const trend = await db.asUser<{ bucket_start: string; minutes: number }>(gestor.authId, "SELECT * FROM public.get_hours_trend('2026-09-01'::date, '2026-09-30'::date, 'week')");
check(trend.rows.length === 1 && new Date(trend.rows[0]?.bucket_start ?? '').toISOString().startsWith('2026-08-31'), 'evolução semanal começa à segunda-feira');
check(
  (await db.asUser(gestor.authId, "SELECT * FROM public.get_hours_trend('2026-09-01'::date, '2026-09-30'::date, 'hour')")).error?.includes('inválido') ?? false,
  'agrupamento inválido recusado'
);
const approvalReport = await db.asUser<{ approved_count: number; rejected_count: number; resubmitted_approved: number; pending_now: number; pending_over_threshold: number }>(
  gestor.authId,
  'SELECT * FROM public.get_approval_report((now() AT TIME ZONE \'Africa/Maputo\')::date - 1, (now() AT TIME ZONE \'Africa/Maputo\')::date)'
);
const metrics = approvalReport.rows[0];
check(metrics?.approved_count === 1 && metrics?.rejected_count === 1, 'decisões do período contadas (1 aprovação, 1 rejeição)');
check(metrics?.resubmitted_approved === 1, 'aprovação após correção identificada');
check(metrics?.pending_now === 1 && metrics?.pending_over_threshold === 1, 'pendentes e pendentes acima do prazo do lembrete');
const outsiderReport = await db.asUser<{ approved_count: number; pending_now: number }>(
  gestorFin.authId,
  'SELECT * FROM public.get_approval_report((now() AT TIME ZONE \'Africa/Maputo\')::date - 1, (now() AT TIME ZONE \'Africa/Maputo\')::date)'
);
check(outsiderReport.rows[0]?.approved_count === 0 && outsiderReport.rows[0]?.pending_now === 0, 'indicadores de aprovação limitados ao âmbito');

// =============================================================================
report.section('Acesso anónimo');
check((await db.asAnonymous("SELECT * FROM public.get_hours_report('2026-09-01'::date, '2026-09-30'::date)")).error?.includes('permission denied') ?? false, 'anónimo não gera relatórios');
check((await db.asAnonymous('SELECT public.list_my_leads()')).error?.includes('permission denied') ?? false, 'anónimo não lista chefias');
check((await db.asAnonymous('SELECT public.refresh_approval_reminders()')).error?.includes('permission denied') ?? false, 'anónimo não gera lembretes');

report.finish();
