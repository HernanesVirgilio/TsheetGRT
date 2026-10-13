// Testes da colaboração e disponibilidade: reuniões normais (sem aprovação) criadas por qualquer perfil, convites
// por departamento e individuais sem duplicados, respostas aos convites, pedido explícito de participação de uma
// chefia configurada (aceitar, recusar, propor outro horário), comunicação de ausência distinta do pedido formal,
// histórico do timesheet, lembretes por regra e relatórios limitados ao âmbito.
//
// A base de dados reproduz o estado de produção: migrations até 20261014, as quatro colunas do pedido acrescentadas
// à mão em meetings, e só depois as migrations 20261015 (aplicadas duas vezes, para provar que podem ser repetidas).
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const COLLABORATION = '20261015000000_collaboration_availability_reminders.sql';
const REPORTING = '20261015000001_reporting_centre.sql';
const MANUAL_PRODUCTION_REPAIR = `
  ALTER TABLE public.meetings
    ADD COLUMN requested_with UUID REFERENCES public.profiles(id),
    ADD COLUMN request_status TEXT,
    ADD COLUMN request_decided_at TIMESTAMPTZ,
    ADD COLUMN request_decision_comment TEXT;
`;
const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'), {
  beforeFile: { file: COLLABORATION, sql: MANUAL_PRODUCTION_REPAIR },
  reapply: [COLLABORATION, REPORTING],
});
const report = new TestReport();
const check = report.check.bind(report);

const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
const manager = await db.createUser(admin.authId, 'manager@siholdings-mz.com', 'Marta Manager', 'MANAGER', 'OPS');
const managerFin = await db.createUser(admin.authId, 'manager.fin@siholdings-mz.com', 'Mário Manager Finanças', 'MANAGER', 'FIN');
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
await scopeTo(managerFin.profileId, { employeeId: gestorFin.profileId });

// =============================================================================
report.section('Esquema reparado à mão em produção');
const requestColumns = await db.asPostgres<{ column_name: string; data_type: string }>(
  "SELECT column_name, data_type FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'meetings' AND column_name LIKE 'request%' ORDER BY column_name"
);
check(
  requestColumns.rows.map((row) => `${row.column_name}:${row.data_type}`).join(',') ===
    'request_decided_at:timestamp with time zone,request_decision_comment:text,request_proposed_ends_at:timestamp with time zone,request_proposed_starts_at:timestamp with time zone,request_status:character varying,requested_with:uuid',
  'as colunas existentes são reaproveitadas, normalizadas e completadas'
);
check(
  (await value<number>("SELECT count(*)::int AS value FROM pg_constraint WHERE conrelid = 'public.meetings'::regclass AND contype = 'c' AND conname LIKE 'meetings_request%' AND convalidated")) === 7,
  'as regras do pedido ficam ativas e validadas'
);

// =============================================================================
report.section('Reuniões normais: sem aprovação, por qualquer perfil');
type CreateOptions = { participants?: string[]; start?: number; end?: number; leadId?: string | null };
const createMeeting = (authId: string, title: string, { participants = [], start = 24, end = 25, leadId = null }: CreateOptions = {}) =>
  db.asUser<{ id: string }>(
    authId,
    'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[], p_request_lead_id => $5::uuid) AS id',
    [title, inHours(start), inHours(end), participants, leadId]
  );
const meetingRow = (id: string) =>
  db.asPostgres<{ status: string; request_status: string | null; requested_with: string | null; organizer_id: string; starts_at: string }>(
    'SELECT status, request_status, requested_with, organizer_id, starts_at FROM public.meetings WHERE id = $1',
    [id]
  ).then((result) => result.rows[0]);
const participantsOf = (id: string) =>
  db.asPostgres<{ profile_id: string; response: string }>('SELECT profile_id, response FROM public.meeting_participants WHERE meeting_id = $1', [id]).then((result) => result.rows);

const colleagueMeeting = await createMeeting(ana.authId, 'Alinhamento entre colegas', { participants: [rui.profileId] });
check(!colleagueMeeting.error, `colaborador agenda reunião com um colega ${colleagueMeeting.error ?? ''}`);
const meetingId = colleagueMeeting.rows[0]?.id ?? '';
const colleagueRow = await meetingRow(meetingId);
check(colleagueRow?.status === 'PLANNED' && colleagueRow.request_status === null, 'reunião normal: sem aprovação e sem pedido');
check(colleagueRow?.organizer_id === ana.profileId, 'quem organiza é sempre o utilizador autenticado');
check((await notificationsOf(rui.profileId, 'MEETING_INVITED')) === 1, 'o colega recebe o convite');
check((await notificationsOf(gestor.profileId, 'MEETING_REQUEST')) === 0, 'uma reunião normal não gera pedido para a chefia');
check(
  (await createMeeting(ana.authId, 'Reunião com Finanças', { participants: [bruno.profileId] })).error?.includes('Fora do seu âmbito') ?? false,
  'colaborador não convida pessoas de outro departamento ou equipa'
);
// Duplo envio: exatamente o mesmo pedido (mesmos valores do formulário) duas vezes seguidas.
// Idempotência: a mesma chave de pedido (duplo clique, nova tentativa após falha de rede) devolve a mesma reunião.
const KEY_A = 'aaaaaaaa-0000-4000-8000-000000000001';
const KEY_B = 'aaaaaaaa-0000-4000-8000-000000000002';
const repeatSlot = [inHours(60), inHours(61)];
const createWithKey = (authId: string, key: string | null, title = 'Envio repetido') =>
  db.asUser<{ id: string }>(
    authId,
    'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[], p_client_request_id => $5::uuid) AS id',
    [title, repeatSlot[0], repeatSlot[1], [rui.profileId], key]
  );
const firstSubmit = await createWithKey(ana.authId, KEY_A);
const secondSubmit = await createWithKey(ana.authId, KEY_A);
check(!firstSubmit.error && !secondSubmit.error && firstSubmit.rows[0]?.id === secondSubmit.rows[0]?.id, 'a mesma chave devolve a mesma reunião (sem erro)');
check((await value<number>("SELECT count(*)::int AS value FROM public.meetings WHERE title = 'Envio repetido'")) === 1, 'fica uma única reunião');
check(
  (await value<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = $2 AND message LIKE $3', [rui.profileId, 'MEETING_INVITED', 'Envio repetido%'])) === 1,
  'a repetição não envia um segundo convite'
);
const legitimateTwin = await createWithKey(ana.authId, KEY_B);
check(!legitimateTwin.error && legitimateTwin.rows[0]?.id !== firstSubmit.rows[0]?.id, 'outra reunião com o mesmo título e horário (outra chave) é permitida');
check(!(await createWithKey(ana.authId, null)).error && !(await createWithKey(ana.authId, null)).error, 'sem chave (versão anterior da aplicação): sem bloqueio por título e horário');
const otherOrganizer = await createWithKey(rui.authId, KEY_A, 'Mesma chave, outro organizador');
check(!otherOrganizer.error && otherOrganizer.rows[0]?.id !== firstSubmit.rows[0]?.id, 'a chave é única por organizador (não devolve reuniões de outra pessoa)');
check(
  (await db.asPostgres("INSERT INTO public.meetings (title, starts_at, ends_at, organizer_id, client_request_id) VALUES ('Duplicado direto', now() + interval '1 day', now() + interval '1 day 1 hour', $1, $2)", [ana.profileId, KEY_A])).error?.includes('meetings_client_request_unique') ?? false,
  'o índice único impede o duplicado mesmo fora da função (chamadas simultâneas)'
);
check((await createMeeting(ana.authId, 'Horário inválido', { start: 30, end: 29 })).error?.includes('terminar depois de começar') ?? false, 'fim antes do início recusado');

// Manager: convida um departamento inteiro e pessoas individuais; ninguém fica duplicado.
const directory = await db.asUser<{ profile_id: string; department_id: string | null }>(manager.authId, "SELECT * FROM public.list_work_people('MEETING')");
const opsId = await db.departmentId('OPS');
const opsPeople = directory.rows.filter((row) => row.department_id === opsId).map((row) => row.profile_id);
check([ana.profileId, rui.profileId, gestor.profileId].every((id) => opsPeople.includes(id)), 'o diretório indica o departamento de cada pessoa');
check(!directory.rows.some((row) => row.profile_id === bruno.profileId), 'o diretório do Manager não inclui pessoas fora do âmbito');
const departmentMeeting = await createMeeting(manager.authId, 'Reunião do departamento', { participants: [...opsPeople, ana.profileId, rui.profileId], start: 50, end: 51 });
check(!departmentMeeting.error, `Manager cria a reunião diretamente, com um departamento e pessoas individuais ${departmentMeeting.error ?? ''}`);
const departmentId = departmentMeeting.rows[0]?.id ?? '';
const departmentParticipants = await participantsOf(departmentId);
check(departmentParticipants.length === new Set(departmentParticipants.map((row) => row.profile_id)).size && departmentParticipants.length === opsPeople.length, 'cada pessoa é convidada uma única vez');
check((await meetingRow(departmentId))?.status === 'PLANNED' && (await meetingRow(departmentId))?.request_status === null, 'a reunião do Manager não passa por aprovação');
const anaCalendar = await db.asUser<{ item_id: string; status: string }>(ana.authId, "SELECT * FROM public.get_calendar_items(current_date, current_date + 7, 'ME')");
check(anaCalendar.rows.some((row) => row.item_id === departmentId && row.status === 'PLANNED'), 'a reunião aparece no calendário de quem foi convidado');

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
const requestPeople = async (id: string) =>
  (await db.asUser<{ profile_id: string; response: string | null; is_requested: boolean }>(ana.authId, 'SELECT * FROM public.get_meeting_people($1)', [id])).rows;

// =============================================================================
report.section('Pedido de participação de uma chefia');
const leads = await db.asUser<{ profile_id: string }>(ana.authId, 'SELECT * FROM public.list_my_leads()');
check(leads.rows.some((row) => row.profile_id === gestor.profileId) && leads.rows.some((row) => row.profile_id === manager.profileId), 'chefias configuradas (gestor e Manager)');
check((await db.asUser<{ profile_id: string }>(bruno.authId, 'SELECT * FROM public.list_my_leads()')).rows.every((row) => row.profile_id !== gestor.profileId), 'chefias de outra equipa não aparecem');
check((await createMeeting(ana.authId, 'Pedido indevido', { leadId: gestorFin.profileId, start: 40, end: 41 })).code === '42501', 'não se pede participação a quem não é chefia configurada');
check((await createMeeting(ana.authId, 'Pedido a colega', { leadId: rui.profileId, start: 42, end: 43 })).code === '42501', 'um colega não é tratado como chefia');
check((await value<number>("SELECT count(*)::int AS value FROM public.meetings WHERE title IN ('Pedido indevido', 'Pedido a colega')")) === 0, 'um pedido recusado na validação não deixa reunião criada (transação)');

const withLead = await createMeeting(ana.authId, 'Planeamento trimestral', { participants: [rui.profileId], leadId: gestor.profileId, start: 48, end: 49 });
check(!withLead.error, `colaborador cria a reunião com colegas e pede a participação do gestor ${withLead.error ?? ''}`);
const requestId = withLead.rows[0]?.id ?? '';
const pendingRow = await meetingRow(requestId);
check(pendingRow?.request_status === 'PENDING' && pendingRow.requested_with === gestor.profileId && pendingRow.status === 'PLANNED', 'pedido pendente, dirigido à chefia configurada');
check((await participantsOf(requestId)).map((row) => row.profile_id).join() === rui.profileId, 'a chefia só passa a participante quando aceita');
check(
  (await requestPeople(requestId)).some((row) => row.profile_id === gestor.profileId && row.is_requested && row.response === null),
  'a chefia pedida aparece identificada, sem resposta enquanto não aceitar'
);
check((await notificationsOf(gestor.profileId, 'MEETING_REQUEST')) === 1, 'a chefia recebe o pedido');
check(
  (await createMeeting(ana.authId, 'Planeamento trimestral (repetido)', { leadId: gestor.profileId, start: 48, end: 49 })).error?.includes('pedido pendente') ?? false,
  'pedido repetido para a mesma pessoa e hora recusado'
);
check((await db.asUser(ana.authId, 'SELECT public.confirm_meeting($1)', [requestId])).error?.includes('aguarda resposta') ?? false, 'quem pede não confirma a reunião sozinho');
const anaRequestCalendar = await db.asUser<{ item_id: string; status: string }>(ana.authId, "SELECT * FROM public.get_calendar_items(current_date, current_date + 7, 'ME')");
check(anaRequestCalendar.rows.some((row) => row.item_id === requestId && row.status === 'REQUEST_PENDING'), 'no calendário o pedido em curso distingue-se de uma reunião confirmada');

const decide = (authId: string, id: string, decision: string, comment: string | null = null, proposal: [string, string] | null = null) =>
  db.asUser(authId, 'SELECT public.decide_meeting_request($1, $2, $3, $4::timestamptz, $5::timestamptz)', [id, decision, comment, proposal?.[0] ?? null, proposal?.[1] ?? null]);
check((await decide(ana.authId, requestId, 'ACCEPTED')).code === '42501', 'quem pede não decide o próprio pedido');
check((await decide(rui.authId, requestId, 'ACCEPTED')).code === '42501', 'outro participante não decide');
check((await decide(manager.authId, requestId, 'ACCEPTED')).code === '42501', 'outra chefia (mesmo acima) não decide um pedido que não lhe foi dirigido');
check((await decide(gestorFin.authId, requestId, 'ACCEPTED')).code === '42501', 'uma chefia sem relação não decide');
check((await decide(gestor.authId, requestId, 'REJECTED')).error?.includes('motivo') ?? false, 'recusar exige motivo');
check(!(await decide(gestor.authId, requestId, 'REJECTED', 'Estou em formação nesse dia')).error, 'a chefia recusa com motivo');
const rejectedRow = await meetingRow(requestId);
check(rejectedRow?.request_status === 'REJECTED' && rejectedRow.status === 'PLANNED', 'recusada a participação, a reunião com os colegas mantém-se');
check(!(await participantsOf(requestId)).some((row) => row.profile_id === gestor.profileId), 'a chefia que recusou não fica como participante');
check((await notificationsOf(ana.profileId, 'MEETING_REQUEST_DECIDED')) === 1, 'quem pediu é notificado da decisão');
check((await decide(gestor.authId, requestId, 'ACCEPTED')).error?.includes('já foi decidido') ?? false, 'segunda decisão recusada');
check((await value<number>("SELECT count(*)::int AS value FROM public.audit_events WHERE action = 'meeting.request_rejected'")) === 1, 'a decisão fica auditada');

// Nova proposta: pedir de novo, a chefia propõe outro horário e quem organiza aceita.
check(!(await db.asUser(ana.authId, 'SELECT public.request_meeting_participation($1, $2)', [requestId, gestor.profileId])).error, 'quem organiza volta a pedir a participação');
check((await db.asUser(rui.authId, 'SELECT public.request_meeting_participation($1, $2)', [requestId, gestor.profileId])).code === '42501', 'só quem organiza pede');
await db.asUser(rui.authId, 'SELECT public.respond_to_meeting($1, $2)', [requestId, 'ACCEPTED']);
check((await decide(gestor.authId, requestId, 'RESCHEDULE', null, [inHours(74), inHours(73)])).error?.includes('terminar depois') ?? false, 'proposta com horário inválido recusada');
check(!(await decide(gestor.authId, requestId, 'RESCHEDULE', 'Prefiro de manhã', [inHours(72), inHours(73)])).error, 'a chefia propõe outro horário');
check((await meetingRow(requestId))?.request_status === 'RESCHEDULE_PROPOSED', 'o pedido fica com a proposta');
check((await db.asUser(gestor.authId, 'SELECT public.respond_to_reschedule_proposal($1, true)', [requestId])).code === '42501', 'só quem organiza responde à proposta');
check(!(await db.asUser(ana.authId, 'SELECT public.respond_to_reschedule_proposal($1, true)', [requestId])).error, 'quem organiza aceita o novo horário');
const rescheduled = await meetingRow(requestId);
const rescheduledPeople = await participantsOf(requestId);
check(rescheduled?.request_status === 'ACCEPTED' && rescheduled.status === 'CONFIRMED', 'proposta aceite: pedido aceite e reunião confirmada');
check(Math.abs(new Date(rescheduled?.starts_at ?? 0).getTime() - new Date(inHours(72)).getTime()) < 60_000, 'a reunião passa para o horário proposto');
check(rescheduledPeople.some((row) => row.profile_id === gestor.profileId && row.response === 'ACCEPTED'), 'a chefia passa a participante com presença confirmada');
check(rescheduledPeople.some((row) => row.profile_id === rui.profileId && row.response === 'PENDING'), 'os colegas voltam a confirmar o novo horário');

// Aceitação direta e reunião só com a chefia.
const gestorToManager = await createMeeting(gestor.authId, 'Revisão da equipa', { leadId: manager.profileId, start: 80, end: 81 });
check(!gestorToManager.error, `o gestor pede a participação do seu Manager ${gestorToManager.error ?? ''}`);
const gestorRequestId = gestorToManager.rows[0]?.id ?? '';
check(!(await decide(manager.authId, gestorRequestId, 'ACCEPTED')).error, 'o Manager aceita');
const accepted = await meetingRow(gestorRequestId);
check(accepted?.status === 'CONFIRMED' && (await participantsOf(gestorRequestId)).some((row) => row.profile_id === manager.profileId), 'aceite: participante e reunião confirmada');
check((await decide(manager.authId, gestorRequestId, 'REJECTED', 'Mudei de ideias')).error?.includes('já foi decidido') ?? false, 'uma decisão tomada não é repetida');
const onlyLead = await createMeeting(ana.authId, 'Conversa individual', { leadId: gestor.profileId, start: 90, end: 91 });
await decide(gestor.authId, onlyLead.rows[0]?.id ?? '', 'REJECTED', 'Sem disponibilidade nessa semana');
check((await meetingRow(onlyLead.rows[0]?.id ?? ''))?.status === 'CANCELLED', 'sem outros participantes, a recusa cancela a reunião (fica rastreável)');

// O Manager só pede a participação de outra chefia se houver relação configurada.
check(
  (await createMeeting(manager.authId, 'Coordenação entre Managers', { leadId: managerFin.profileId, start: 95, end: 96 })).code === '42501',
  'sem relação configurada entre Managers, o pedido é recusado (não se inventa hierarquia)'
);

// Cancelar a reunião retira o pedido em curso e informa a chefia.
const toCancel = await createMeeting(ana.authId, 'Reunião a cancelar', { participants: [rui.profileId], leadId: gestor.profileId, start: 100, end: 101 });
const toCancelId = toCancel.rows[0]?.id ?? '';
const withdrawnBefore = await value<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND title = 'Pedido de participação retirado'", [gestor.profileId]);
check(!(await db.asUser(ana.authId, "SELECT public.cancel_meeting($1, 'Já não é necessária')", [toCancelId])).error, 'quem organiza cancela a reunião');
check((await meetingRow(toCancelId))?.request_status === 'CANCELLED', 'o pedido em curso fica retirado');
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND title = 'Pedido de participação retirado'", [gestor.profileId])) === withdrawnBefore + 1,
  'a chefia é informada de que o pedido foi retirado'
);
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.meetings WHERE requested_with = $1 AND request_status = 'PENDING' AND status = 'PLANNED'", [gestor.profileId])) === 0,
  'nada fica pendente para a chefia depois de decidido ou retirado'
);

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
  'o prazo do lembrete é validado na atualização'
);
check(
  (await db.asUser(admin.authId, "UPDATE public.system_settings SET value = 'três' WHERE key = 'APPROVAL_REMINDER_DAYS'")).error?.includes('entre 1 e 30') ?? false,
  'texto não numérico recusado sem erro de conversão'
);
// Definição apagada (só possível como postgres): erro explícito, nunca um valor inventado; a inserção também valida.
await db.asPostgres("DELETE FROM public.system_settings WHERE key = 'APPROVAL_REMINDER_DAYS'");
check((await reminders(gestor.authId)).error?.includes('APPROVAL_REMINDER_DAYS não existe') ?? false, 'definição em falta: erro explícito nos lembretes');
check(
  (await db.asPostgres("INSERT INTO public.system_settings (key, value, description) VALUES ('APPROVAL_REMINDER_DAYS', '45', 'teste')")).error?.includes('entre 1 e 30') ?? false,
  'a inserção com valor inválido também é recusada'
);
await db.asPostgres("INSERT INTO public.system_settings (key, value, description) VALUES ('APPROVAL_REMINDER_DAYS', '3', 'Dias de espera até lembrar quem decide de uma aprovação pendente')");
check(((await reminders(gestor.authId)).rows[0]?.value ?? -1) === 0, 'com a definição reposta, os lembretes voltam a funcionar');

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
// Limites do período: no máximo 366 datas de calendário (p_to - p_from <= 365).
const range = (from: string, to: string) => db.asUser(gestor.authId, 'SELECT * FROM public.get_hours_report($1::date, $2::date)', [from, to]);
check(!(await range('2026-09-01', '2026-09-01')).error, 'um único dia é aceite');
check(!(await range('2024-01-01', '2024-12-31')).error, 'limite máximo aceite: um ano bissexto completo (366 datas)');
check((await range('2025-01-01', '2026-01-02')).error?.includes('366 dias') ?? false, 'imediatamente acima do limite (367 datas) recusado');
check((await range('2026-09-30', '2026-09-01')).error?.includes('igual ou posterior') ?? false, 'data inicial posterior à final recusada');
check((await db.asUser(gestor.authId, 'SELECT * FROM public.get_hours_report(NULL::date, NULL::date)')).error?.includes('Indique a data') ?? false, 'datas nulas recusadas');
check((await db.asUser(gestor.authId, "SELECT * FROM public.get_approval_report('2025-01-01'::date, '2026-01-02'::date)")).error?.includes('366 dias') ?? false, 'o mesmo limite aplica-se ao relatório de aprovações');
const trend = await db.asUser<{ bucket_start: string; minutes: number }>(gestor.authId, "SELECT * FROM public.get_hours_trend('2026-09-01'::date, '2026-09-30'::date, 'week')");
check(trend.rows.length === 1 && new Date(trend.rows[0]?.bucket_start ?? '').toISOString().startsWith('2026-08-31'), 'evolução semanal começa à segunda-feira');
const bucket = (value: string | null) => db.asUser(gestor.authId, "SELECT * FROM public.get_hours_trend('2026-09-01'::date, '2026-09-30'::date, $1)", [value]);
for (const valid of ['day', 'week', 'month']) check(!(await bucket(valid)).error, `agrupamento ${valid} aceite`);
check((await bucket('hour')).error?.includes('Agrupamento inválido') ?? false, 'agrupamento não permitido recusado');
check((await bucket(null)).error?.includes('Agrupamento inválido') ?? false, 'agrupamento nulo recusado (já não devolve um único grupo nulo)');

// Âmbito dos filtros: recusado de forma explícita, também em chamadas diretas à API.
// opsId já foi obtido na secção das reuniões por departamento.
const finId = await db.departmentId('FIN');
const filtered = (authId: string, fn: string, department: string | null, employee: string | null = null) =>
  fn === 'approval'
    ? db.asUser(authId, "SELECT * FROM public.get_approval_report('2026-09-01'::date, '2026-09-30'::date, $1::uuid)", [department])
    : fn === 'trend'
      ? db.asUser(authId, "SELECT * FROM public.get_hours_trend('2026-09-01'::date, '2026-09-30'::date, 'week', $1::uuid, $2::uuid)", [department, employee])
      : db.asUser(authId, "SELECT * FROM public.get_hours_report('2026-09-01'::date, '2026-09-30'::date, $1::uuid, $2::uuid)", [department, employee]);
check(!(await filtered(gestor.authId, 'hours', opsId)).error, 'gestor filtra o departamento da sua equipa');
check((await filtered(gestor.authId, 'hours', finId)).code === '42501', 'gestor não filtra um departamento fora do âmbito (horas)');
check((await filtered(gestor.authId, 'trend', finId)).code === '42501', 'gestor não filtra um departamento fora do âmbito (evolução)');
check((await filtered(gestor.authId, 'approval', finId)).code === '42501', 'gestor não consulta aprovações de um departamento fora do âmbito');
check(!(await filtered(gestor.authId, 'approval', opsId)).error, 'gestor consulta as aprovações do seu departamento');
check((await filtered(gestor.authId, 'hours', null, bruno.profileId)).code === '42501', 'gestor não filtra um colaborador fora do âmbito');
check(!(await filtered(gestor.authId, 'hours', null, ana.profileId)).error, 'gestor filtra um colaborador da equipa');
check(!(await filtered(manager.authId, 'hours', opsId)).error, 'Manager filtra o departamento das equipas que supervisiona');
check((await filtered(managerFin.authId, 'approval', opsId)).code === '42501', 'Manager de outra área não consulta este departamento');
check(!(await filtered(ana.authId, 'hours', opsId, ana.profileId)).error, 'colaborador filtra o próprio departamento e a si próprio');
check((await filtered(ana.authId, 'hours', null, rui.profileId)).code === '42501', 'colaborador não filtra um colega');
check((await filtered(ana.authId, 'approval', finId)).code === '42501', 'colaborador não consulta aprovações de outro departamento');
check(!(await filtered(admin.authId, 'approval', finId)).error && !(await filtered(admin.authId, 'hours', null, bruno.profileId)).error, 'a administração filtra qualquer departamento ou colaborador');
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
check((await db.asAnonymous("SELECT * FROM public.get_approval_report('2026-09-01'::date, '2026-09-30'::date)")).error?.includes('permission denied') ?? false, 'anónimo não consulta aprovações');
check((await db.asAnonymous('SELECT private.assert_report_scope(NULL, NULL)')).error?.includes('permission denied') ?? false, 'anónimo não executa as funções internas dos relatórios');
check((await db.asAnonymous('SELECT public.list_my_leads()')).error?.includes('permission denied') ?? false, 'anónimo não lista chefias');
check((await db.asAnonymous('SELECT public.refresh_approval_reminders()')).error?.includes('permission denied') ?? false, 'anónimo não gera lembretes');

report.finish();
