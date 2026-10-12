// Testes das equipas de projeto (responsável comercial, gestor de execução e membros), dos responsáveis
// hierárquicos de um utilizador e dos conflitos de agenda das reuniões.
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
const carla = await db.createUser(admin.authId, 'carla@siholdings-mz.com', 'Carla Comercial', 'EMPLOYEE', 'COM');

const value = <Value>(sql: string, params: unknown[] = []) => db.scalar<Value>(sql, params);
const notificationsOf = (profileId: string, title: string) =>
  value<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND title = $2', [profileId, title]);
const scopeTo = async (managerProfileId: string, target: { departmentCode?: string; employeeId?: string }) =>
  db.asUser(admin.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id, employee_id) VALUES ($1, $2, $3)', [
    managerProfileId,
    target.departmentCode ? await db.departmentId(target.departmentCode) : null,
    target.employeeId ?? null,
  ]);
await scopeTo(gestor.profileId, { departmentCode: 'OPS' });
await scopeTo(gestorFin.profileId, { departmentCode: 'FIN' });
await scopeTo(manager.profileId, { employeeId: gestor.profileId });

// =============================================================================
report.section('Responsáveis hierárquicos');
type Lead = { manager_id: string; relation: string; via: string };
const leadsOf = (authId: string, profileId: string) => db.asUser<Lead>(authId, 'SELECT * FROM public.get_profile_leads($1)', [profileId]);
const anaLeads = await leadsOf(admin.authId, ana.profileId);
check(
  anaLeads.rows.some((row) => row.manager_id === gestor.profileId && row.relation === 'LEAD' && row.via === 'Departamento Operações'),
  'colaboradora: gestor direto pelo departamento'
);
check(anaLeads.rows.some((row) => row.manager_id === manager.profileId && row.relation === 'SUPERVISOR'), 'colaboradora: Manager que supervisiona o gestor');
check(!anaLeads.rows.some((row) => row.manager_id === gestorFin.profileId), 'gestora de outra equipa não aparece');
const gestorLeads = await leadsOf(admin.authId, gestor.profileId);
check(
  gestorLeads.rows.length === 1 && gestorLeads.rows[0]?.manager_id === manager.profileId && gestorLeads.rows[0]?.via === 'Atribuição individual',
  'gestor: Manager responsável por atribuição individual'
);
check((await leadsOf(ana.authId, ana.profileId)).rows.length === 2, 'cada pessoa consulta os próprios responsáveis');
check((await leadsOf(ana.authId, rui.profileId)).code === '42501', 'colaborador não consulta a hierarquia de colegas');
check(!(await leadsOf(gestor.authId, rui.profileId)).error, 'gestor consulta a hierarquia da equipa');
check((await leadsOf(admin.authId, carla.profileId)).rows.length === 0, 'colaboradora sem gestor atribuído não tem responsáveis');
check(!(await scopeTo(gestor.profileId, { employeeId: carla.profileId })).error, 'administração atribui a colaboradora ao gestor');
check((await leadsOf(admin.authId, carla.profileId)).rows.some((row) => row.manager_id === gestor.profileId), 'a atribuição fica visível de imediato');
check((await db.countAudit('manager_scope.assigned')) === 4, 'cada atribuição fica auditada');

// =============================================================================
report.section('Projeto Sítio X: responsável, gestor de execução e equipa');
const company = await db.asUser<{ id: string }>(gestor.authId, "INSERT INTO public.companies (name) VALUES ('Construtora Sítio X, Lda') RETURNING id");
const companyId = company.rows[0]?.id ?? '';
const created = await db.asUser<{ id: string }>(gestor.authId, 'SELECT public.create_opportunity($1, $2, $3) AS id', ['Projeto Sítio X', companyId, ana.profileId]);
check(!created.error, `gestor regista a oportunidade com a Ana como responsável comercial ${created.error ?? ''}`);
const opportunityId = created.rows[0]?.id ?? '';
type Person = { profile_id: string; member_role: string; is_owner: boolean };
const peopleOf = async (authId: string) => (await db.asUser<Person>(authId, 'SELECT * FROM public.get_opportunity_people($1)', [opportunityId])).rows;
const setLead = (authId: string, profileId: string | null) =>
  db.asUser(authId, 'SELECT public.set_opportunity_execution_lead($1, $2)', [opportunityId, profileId]);
const addMember = (authId: string, profileId: string) => db.asUser(authId, 'SELECT public.add_opportunity_member($1, $2)', [opportunityId, profileId]);

check(!(await addMember(gestor.authId, rui.profileId)).error, 'gestor acrescenta o Rui à equipa');
check(!(await addMember(gestor.authId, bruno.profileId)).error, 'gestor acrescenta o Bruno (outra equipa) à equipa do projeto');
check((await addMember(gestor.authId, rui.profileId)).error?.includes('já trabalha') ?? false, 'associação duplicada recusada');
check((await addMember(gestor.authId, ana.profileId)).error?.includes('já trabalha') ?? false, 'o responsável não é acrescentado como membro');
check((await notificationsOf(rui.profileId, 'Foi adicionado a uma oportunidade')) === 1, 'membro notificado uma única vez');
check(
  (await value<string>("SELECT link AS value FROM public.notifications WHERE user_id = $1 AND title = 'Foi adicionado a uma oportunidade'", [rui.profileId])) === `/timesheet/opportunities/${opportunityId}`,
  'a notificação abre a oportunidade'
);

const leadCandidates = await db.asUser<{ profile_id: string }>(gestor.authId, "SELECT * FROM public.list_work_people('TEAM_LEAD')");
check(
  leadCandidates.rows.some((row) => row.profile_id === gestorFin.profileId) && leadCandidates.rows.some((row) => row.profile_id === manager.profileId)
    && !leadCandidates.rows.some((row) => row.profile_id === rui.profileId),
  'candidatos a gestor de execução: apenas perfis de gestão de equipa'
);
check((await setLead(gestor.authId, rui.profileId)).error?.includes('gestão de equipa') ?? false, 'colaborador sem gestão de equipa não pode ser gestor de execução');
check((await setLead(gestor.authId, ana.profileId)).error?.includes('responsável comercial') ?? false, 'gestor de execução distinto do responsável comercial');
check((await setLead(rui.authId, gestorFin.profileId)).code !== null, 'membro não define o gestor de execução');
check(!(await setLead(gestor.authId, gestorFin.profileId)).error, 'gestor define a gestora de Finanças como gestora de execução');
let people = await peopleOf(gestor.authId);
check(people[0]?.profile_id === ana.profileId && people[0]?.member_role === 'OWNER', 'responsável comercial em primeiro lugar');
check(people[1]?.profile_id === gestorFin.profileId && people[1]?.member_role === 'EXECUTION_LEAD', 'gestora de execução identificada');
check(people.filter((person) => person.member_role === 'MEMBER').length === 2, 'membros listados com a sua função');
check((await notificationsOf(gestorFin.profileId, 'Gestor de execução de uma oportunidade')) === 1, 'gestora de execução notificada');
check((await setLead(gestor.authId, gestorFin.profileId)).error?.includes('já é o gestor') ?? false, 'repetir a mesma atribuição é recusado');

check((await db.asUser(gestorFin.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 1, 'gestora de execução consulta a oportunidade');
check(
  (await db.asUser(gestorFin.authId, "SELECT public.update_opportunity($1, 'Projeto Sítio X alterado', $2, NULL, NULL, NULL, '', '', '', NULL, NULL, 'MZN', NULL, NULL, NULL, NULL, '')", [opportunityId, companyId])).code === '42501',
  'gestora de execução não altera os dados comerciais'
);
const fieldTask = await db.asUser<{ id: string }>(
  gestorFin.authId,
  "SELECT public.create_task('Levantamento no Sítio X', 'Visita técnica', 'MEDIUM', $1, $2::timestamptz, p_opportunity_id => $3) AS id",
  [bruno.profileId, new Date(Date.now() + 72 * 3600 * 1000).toISOString(), opportunityId]
);
check(!fieldTask.error, `gestora de execução atribui à sua equipa uma tarefa do projeto ${fieldTask.error ?? ''}`);
check(
  (await db.asUser(gestorFin.authId, "SELECT public.create_task('Tarefa fora da equipa', '', 'MEDIUM', $1, NULL, p_opportunity_id => $2) AS id", [rui.profileId, opportunityId])).error !== null,
  'gestora de execução não atribui tarefas fora da sua equipa'
);
check((await db.asUser(carla.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 0, 'quem não está no projeto não o vê');
check((await db.asUser(carla.authId, 'SELECT * FROM public.get_opportunity_people($1)', [opportunityId])).code === '42501', 'quem não está no projeto não vê a equipa');

check(!(await setLead(gestor.authId, manager.profileId)).error, 'gestor substitui a gestora de execução');
people = await peopleOf(gestor.authId);
check(
  people.find((person) => person.profile_id === manager.profileId)?.member_role === 'EXECUTION_LEAD'
    && people.find((person) => person.profile_id === gestorFin.profileId)?.member_role === 'MEMBER',
  'a anterior gestora de execução continua na equipa como membro'
);
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.opportunity_members WHERE opportunity_id = $1 AND member_role = 'EXECUTION_LEAD'", [opportunityId])) === 1,
  'nunca há mais do que um gestor de execução'
);
check(!(await setLead(gestor.authId, null)).error, 'gestor retira o gestor de execução');
check((await setLead(gestor.authId, null)).error?.includes('não tem gestor') ?? false, 'retirar sem gestor de execução é recusado');
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.opportunity_events WHERE opportunity_id = $1 AND event_type = 'OPPORTUNITY_EXECUTION_LEAD_CHANGED'", [opportunityId])) === 3,
  'cada alteração do gestor de execução fica no histórico'
);
check(!(await db.asUser(gestor.authId, 'SELECT public.remove_opportunity_member($1, $2)', [opportunityId, bruno.profileId])).error, 'gestor retira o Bruno');
check((await notificationsOf(bruno.profileId, 'Retirado de uma oportunidade')) === 1, 'quem sai é avisado');
check(
  (await value<string | null>("SELECT link AS value FROM public.notifications WHERE user_id = $1 AND title = 'Retirado de uma oportunidade'", [bruno.profileId])) === null,
  'o aviso de saída não aponta para o registo'
);
check((await db.asUser(bruno.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 0, 'quem sai deixa de ver a oportunidade');
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.tasks WHERE opportunity_id = $1 AND assignee_id = $2", [opportunityId, bruno.profileId])) === 1,
  'o trabalho já atribuído mantém-se (histórico operacional preservado)'
);

// =============================================================================
report.section('Conflitos de agenda');
const at = (days: number, hour: number, minute = 0) => {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + days);
  date.setUTCHours(hour - 2, minute, 0, 0); // Africa/Maputo = UTC+2
  return date.toISOString();
};
const createMeeting = (authId: string, title: string, startsAt: string, endsAt: string, participants: string[]) =>
  db.asUser<{ id: string }>(authId, 'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[]) AS id', [title, startsAt, endsAt, participants]);
type Conflict = { profile_id: string; conflict_type: string; meeting_id: string | null; title: string | null };
const conflicts = (authId: string, participants: string[], startsAt: string, endsAt: string, exclude: string | null = null) =>
  db.asUser<Conflict>(authId, 'SELECT * FROM public.get_schedule_conflicts($1::uuid[], $2::timestamptz, $3::timestamptz, $4)', [participants, startsAt, endsAt, exclude]);

const weekly = await createMeeting(gestor.authId, 'Reunião semanal', at(3, 9), at(3, 11), [ana.profileId, rui.profileId]);
check(!weekly.error, `gestor marca uma reunião de duas horas (09:00–11:00) ${weekly.error ?? ''}`);
const weeklyId = weekly.rows[0]?.id ?? '';
const overlap = await conflicts(gestor.authId, [ana.profileId, rui.profileId], at(3, 10, 30), at(3, 11, 30));
check(overlap.rows.filter((row) => row.conflict_type === 'MEETING').length === 2, 'sobreposição parcial detetada para os dois participantes');
check(overlap.rows.every((row) => row.title === 'Reunião semanal' && row.meeting_id === weeklyId), 'o organizador vê o título da reunião em conflito');
check((await conflicts(gestor.authId, [ana.profileId], at(3, 11), at(3, 11, 30))).rows.length === 0, 'reunião que começa quando a outra acaba não é conflito');
check((await conflicts(gestor.authId, [ana.profileId], at(3, 9), at(3, 11), weeklyId)).rows.length === 0, 'ao editar, a própria reunião não conta como conflito');
const meetingAsManager = await conflicts(manager.authId, [ana.profileId], at(3, 9, 30), at(3, 10));
check(meetingAsManager.rows.length === 1, 'Manager vê o conflito da equipa supervisionada');
const fromFinance = await conflicts(gestorFin.authId, [ana.profileId, bruno.profileId], at(3, 9), at(3, 10));
check(fromFinance.rows.length === 0, 'pessoas fora do âmbito de quem organiza não são consultadas');
check((await conflicts(ana.authId, [bruno.profileId], at(3, 9), at(3, 10))).rows.length === 0, 'colaborador não consulta a agenda de pessoas de outra equipa');
check((await conflicts(gestor.authId, [ana.profileId], at(3, 11), at(3, 10))).error?.includes('terminar depois') ?? false, 'intervalo invertido recusado');
check(
  (await conflicts(gestor.authId, [ana.profileId], at(1, 9), at(30, 9))).error?.includes('24 horas') ?? false,
  'não é possível consultar a agenda de alguém por períodos longos (máximo de 24 horas)'
);
check(
  (await conflicts(gestorFin.authId, [gestorFin.profileId], at(3, 9), at(3, 10), weeklyId)).code === '42501',
  'não é possível consultar através de uma reunião que não organiza'
);

// Reunião privada do Manager com o gestor: o gestor sabe que está ocupado, mas não vê o título.
const privateMeeting = await createMeeting(manager.authId, 'Avaliação de desempenho', at(4, 14), at(4, 15), [gestor.profileId]);
check(!privateMeeting.error, `Manager marca uma reunião com o gestor ${privateMeeting.error ?? ''}`);
const gestorBusy = await conflicts(gestor.authId, [gestor.profileId], at(4, 14, 30), at(4, 15, 30));
check(gestorBusy.rows.length === 1 && gestorBusy.rows[0]?.title === 'Avaliação de desempenho', 'participante vê o título das suas reuniões');
const managerOwnBusy = await conflicts(gestor.authId, [manager.profileId], at(4, 14), at(4, 14, 30));
check(managerOwnBusy.rows.length === 1, 'gestor vê que a chefia está ocupada');
await db.asUser(manager.authId, "SELECT public.cancel_meeting($1, 'Adiada')", [privateMeeting.rows[0]?.id ?? '']);
check((await conflicts(gestor.authId, [manager.profileId], at(4, 14), at(4, 14, 30))).rows.length === 0, 'reuniões canceladas não contam como conflito');
const strategy = await createMeeting(manager.authId, 'Planeamento estratégico', at(5, 9), at(5, 10), []);
check(!strategy.error, `Manager marca uma reunião sem a equipa ${strategy.error ?? ''}`);
const hidden = await conflicts(gestor.authId, [manager.profileId], at(5, 9), at(5, 9, 30));
check(
  hidden.rows.length === 1 && hidden.rows[0]?.title === null && hidden.rows[0]?.meeting_id === null,
  'reunião que o organizador não pode ver aparece só como período ocupado'
);

const vacation = await value<string>("SELECT id AS value FROM public.absence_types WHERE code = 'VACATION'");
const localDay = (days: number) => at(days, 12).slice(0, 10);
const absence = await db.asUser<{ id: string }>(rui.authId, "SELECT public.save_absence_request(NULL, $1, $2::date, $3::date, 'Férias') AS id", [vacation, localDay(6), localDay(7)]);
const absenceId = absence.rows[0]?.id ?? '';
await db.asUser(rui.authId, 'SELECT public.submit_absence_request($1)', [absenceId]);
const pendingAbsence = await conflicts(gestor.authId, [rui.profileId], at(6, 9), at(6, 10));
check(pendingAbsence.rows.length === 0, 'ausência ainda por decidir não é apresentada como conflito');
await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'VALIDATED')", [absenceId]);
await db.asUser(manager.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [absenceId]);
const absent = await conflicts(gestor.authId, [rui.profileId, ana.profileId], at(7, 15), at(7, 16));
check(
  absent.rows.length === 1 && absent.rows[0]?.conflict_type === 'ABSENCE' && absent.rows[0]?.profile_id === rui.profileId && absent.rows[0]?.title === null,
  'ausência aprovada indicada sem expor o tipo de ausência'
);
const absentRow = absent.rows[0] as (Conflict & { starts_at: string | Date; ends_at: string | Date }) | undefined;
check(
  absentRow !== undefined
    && new Date(absentRow.starts_at).getTime() === new Date(`${localDay(7)}T00:00:00+02:00`).getTime()
    && new Date(absentRow.ends_at).getTime() === new Date(`${localDay(8)}T00:00:00+02:00`).getTime(),
  'a ausência só é indicada no dia consultado (não revela a duração total)'
);

const invites = await value<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = 'MEETING_INVITED'", [rui.profileId]);
check(invites === 1, 'cada participante recebe um único convite');

// =============================================================================
report.section('Privilégios das funções novas e alteradas');
const signatures = [
  'public.set_opportunity_execution_lead(uuid, uuid, text)',
  'public.get_opportunity_people(uuid)',
  'public.get_profile_leads(uuid)',
  'public.get_schedule_conflicts(uuid[], timestamptz, timestamptz, uuid, uuid, uuid)',
  'public.list_work_people(text)',
  'public.add_opportunity_member(uuid, uuid)',
  'public.remove_opportunity_member(uuid, uuid)',
];
for (const signature of signatures) {
  const isSafe = await value<boolean>(
    `SELECT prosecdef
        AND proconfig = ARRAY['search_path=""']
        AND NOT has_function_privilege('anon', oid, 'EXECUTE')
        AND has_function_privilege('authenticated', oid, 'EXECUTE') AS value
     FROM pg_proc WHERE oid = $1::regprocedure`,
    [signature]
  );
  check(isSafe === true, `${signature}: SECURITY DEFINER, search_path vazio, sem anon, com authenticated`);
}
check((await db.asAnonymous(`SELECT * FROM public.get_profile_leads('${ana.profileId}')`)).error !== null, 'anónimo não consulta responsáveis');
check((await db.asAnonymous(`SELECT * FROM public.get_schedule_conflicts(ARRAY['${ana.profileId}']::uuid[], now(), now() + interval '1 hour')`)).error !== null, 'anónimo não consulta conflitos');
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND message LIKE '%Sítio X%'", [carla.profileId])) === 0,
  'quem não está no projeto não recebe notificações com o título da oportunidade'
);
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.notifications WHERE message LIKE '%Sítio X%' AND user_id NOT IN (SELECT profile_id FROM public.opportunity_members WHERE opportunity_id = $1) AND user_id NOT IN ($2, $3, $4)", [opportunityId, ana.profileId, bruno.profileId, gestorFin.profileId])) === 0,
  'as notificações do projeto só chegam ao responsável, à equipa e a quem foi retirado'
);

report.finish();
