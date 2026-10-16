// Testes da hierarquia ADMIN → MANAGER → GESTOR → COLABORADORES: âmbito em dois níveis, reuniões,
// notificações, tarefas próprias, descrição de funções, empresas, aprovação de oportunidades,
// ausências em dois níveis, auditoria, painéis e visão global da administração.
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'));
const report = new TestReport();
const check = report.check.bind(report);

const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
const manager = await db.createUser(admin.authId, 'manager@siholdings-mz.com', 'Marta Manager', 'MANAGER', 'OPS');
const managerOther = await db.createUser(admin.authId, 'manager.fin@siholdings-mz.com', 'Mário Manager Finanças', 'MANAGER', 'FIN');
const gestor = await db.createUser(admin.authId, 'gestor.ops@siholdings-mz.com', 'Gil Gestor Operações', 'GESTOR', 'OPS');
const gestorFin = await db.createUser(admin.authId, 'gestor.fin@siholdings-mz.com', 'Graça Gestora Finanças', 'GESTOR', 'FIN');
const ana = await db.createUser(admin.authId, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
const rui = await db.createUser(admin.authId, 'rui@siholdings-mz.com', 'Rui Operações', 'EMPLOYEE', 'OPS');
const bruno = await db.createUser(admin.authId, 'bruno@siholdings-mz.com', 'Bruno Finanças', 'EMPLOYEE', 'FIN');

const NOT_FOUND = '00000000-0000-4000-8000-000000000000';
const inHours = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const value = <Value>(sql: string, params: unknown[] = []) => db.scalar<Value>(sql, params);
const notificationsOf = (profileId: string, type?: string) =>
  type
    ? value<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = $2', [profileId, type])
    : value<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1', [profileId]);
const scopeTo = (managerProfileId: string, target: { departmentCode?: string; employeeId?: string }) =>
  (async () =>
    db.asUser(admin.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id, employee_id) VALUES ($1, $2, $3)', [
      managerProfileId,
      target.departmentCode ? await db.departmentId(target.departmentCode) : null,
      target.employeeId ?? null,
    ]))();
const inDays = async (days: number) => value<string>(`SELECT to_char((now() AT TIME ZONE 'Africa/Maputo')::date + ${days}, 'YYYY-MM-DD') AS value`);
const today = await inDays(0);
const createTask = async (authId: string, title: string, assigneeId: string | null, reviewByManager = false, dueAt: string = inHours(48)) => {
  const result = await db.asUser<{ id: string }>(
    authId,
    "SELECT public.create_task($1, 'Descrição', 'MEDIUM', $2, $3::timestamptz, p_requires_manager_review => $4) AS id",
    [title, assigneeId, dueAt, reviewByManager]
  );
  return { id: result.rows[0]?.id ?? '', error: result.error, code: result.code };
};

// =============================================================================
report.section('Estrutura: perfil GESTOR e âmbitos');
check((await value<number>("SELECT count(*)::int AS value FROM public.roles WHERE code = 'GESTOR'")) === 1, 'perfil GESTOR existe');
check(!(await scopeTo(gestor.profileId, { departmentCode: 'OPS' })).error, 'gestor recebe a equipa do departamento OPS');
check(!(await scopeTo(gestorFin.profileId, { departmentCode: 'FIN' })).error, 'gestora de Finanças recebe a equipa FIN');
check(!(await scopeTo(manager.profileId, { employeeId: gestor.profileId })).error, 'Manager supervisiona o gestor (âmbito explícito)');
check(!(await scopeTo(managerOther.profileId, { employeeId: gestorFin.profileId })).error, 'outro Manager supervisiona a gestora de Finanças');
check(
  (await scopeTo(gestor.profileId, { employeeId: manager.profileId })).error?.includes('só pode ter colaboradores') ?? false,
  'um gestor não pode ter um Manager no âmbito'
);
check(
  (await scopeTo(gestor.profileId, { employeeId: gestorFin.profileId })).error?.includes('só pode ter colaboradores') ?? false,
  'um gestor não pode ter outro gestor no âmbito'
);
check(
  (await scopeTo(ana.profileId, { departmentCode: 'OPS' })).error?.includes('MANAGER ou GESTOR') ?? false,
  'um colaborador não pode receber âmbito'
);
check(
  (await db.asUser(gestor.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [gestor.profileId, await db.departmentId('FIN')])).error !== null,
  'o gestor não altera o próprio âmbito'
);
const isManagerOf = async (authId: string, profileId: string) =>
  (await db.asUser<{ value: boolean }>(authId, 'SELECT public.is_manager_of_employee($1) AS value', [profileId])).rows[0]?.value === true;
check(await isManagerOf(gestor.authId, ana.profileId), 'gestor abrange os colaboradores da equipa');
check(!(await isManagerOf(gestor.authId, bruno.profileId)), 'gestor não abrange colaboradores de outra equipa');
check(await isManagerOf(manager.authId, gestor.profileId), 'Manager abrange o gestor que supervisiona');
check(await isManagerOf(manager.authId, ana.profileId), 'Manager abrange a equipa do gestor (dois níveis)');
check(!(await isManagerOf(manager.authId, bruno.profileId)), 'Manager não abrange equipas de gestores que não supervisiona');
check(!(await isManagerOf(gestor.authId, manager.profileId)), 'o gestor não abrange o seu Manager');

// =============================================================================
report.section('1–4. Reuniões: quem agenda e quem participa');
const createMeeting = (authId: string, title: string, participants: string[]) =>
  db.asUser<{ id: string }>(authId, 'SELECT public.create_meeting($1, $2::timestamptz, $3::timestamptz, p_participant_ids => $4::uuid[]) AS id', [
    title,
    inHours(24),
    inHours(25),
    participants,
  ]);
check(!(await createMeeting(ana.authId, 'Reunião do colaborador', [rui.profileId])).error, '1. colaborador agenda reunião com um colega, sem aprovação');
check(
  (await db.asUser<{ profile_id: string }>(ana.authId, "SELECT * FROM public.list_work_people('MEETING')")).rows.every((row) => row.profile_id !== bruno.profileId),
  '1. a lista de convidáveis do colaborador não inclui pessoas de outra equipa'
);
const gestorMeeting = await createMeeting(gestor.authId, 'Reunião semanal da equipa', [ana.profileId, rui.profileId, manager.profileId]);
check(!gestorMeeting.error, `3. gestor agenda reunião com a equipa e o seu Manager ${gestorMeeting.error ?? ''}`);
const gestorMeetingId = gestorMeeting.rows[0]?.id ?? '';
check(
  (await createMeeting(gestor.authId, 'Reunião com Finanças', [bruno.profileId])).error?.includes('Fora do seu âmbito') ?? false,
  '3. gestor não convida colaboradores fora do âmbito'
);
check((await db.asUser(ana.authId, 'SELECT id FROM public.meetings WHERE id = $1', [gestorMeetingId])).rows.length === 1, '2. colaborador vê a reunião em que participa');
check((await notificationsOf(ana.profileId, 'MEETING_INVITED')) === 1, '2. colaborador recebe o convite');
check((await db.asUser(bruno.authId, 'SELECT id FROM public.meetings WHERE id = $1', [gestorMeetingId])).rows.length === 0, 'colaborador de outra equipa não vê a reunião');
check(
  (await db.asUser(ana.authId, "SELECT public.cancel_meeting($1, 'Não posso ir')", [gestorMeetingId])).code === '42501',
  'participante não cancela a reunião'
);
check(
  (await db.asUser(ana.authId, "SELECT public.update_meeting($1, 'Alterada', $2::timestamptz, $3::timestamptz, '', '', NULL, NULL, ARRAY[]::uuid[])", [gestorMeetingId, inHours(30), inHours(31)])).code === '42501',
  'participante não altera a reunião'
);
const managerMeeting = await createMeeting(manager.authId, 'Revisão trimestral', [gestor.profileId, ana.profileId]);
check(!managerMeeting.error, `4. Manager agenda reunião com o gestor e a equipa supervisionada ${managerMeeting.error ?? ''}`);
check(
  (await createMeeting(manager.authId, 'Reunião com outra equipa', [bruno.profileId])).error?.includes('Fora do seu âmbito') ?? false,
  '4. Manager não convida fora das equipas supervisionadas'
);
const meetingPeople = await db.asUser<{ profile_id: string }>(gestor.authId, "SELECT * FROM public.list_work_people('MEETING')");
check(
  meetingPeople.rows.some((row) => row.profile_id === manager.profileId) && meetingPeople.rows.some((row) => row.profile_id === ana.profileId)
    && !meetingPeople.rows.some((row) => row.profile_id === bruno.profileId),
  'lista de convidáveis do gestor: equipa e chefia, sem outras equipas'
);
const anaInvites = await notificationsOf(ana.profileId, 'MEETING_INVITED');
await db.asUser(gestor.authId, "SELECT public.cancel_meeting($1, 'Reagendada para outra semana')", [gestorMeetingId]);
check((await notificationsOf(ana.profileId, 'MEETING_CANCELLED')) === 1 && anaInvites === 2, 'cancelamento notifica os participantes');

// =============================================================================
report.section('6–8. Notificações: gestor recebe a operação, Manager só o que exige decisão');
const managerBefore = await notificationsOf(manager.profileId);
const routine = await createTask(gestor.authId, 'Atualizar inventário', ana.profileId);
check(!routine.error, `gestor atribui tarefa à equipa ${routine.error ?? ''}`);
await db.asUser(ana.authId, 'SELECT public.start_task($1)', [routine.id]);
await db.asUser(ana.authId, "SELECT public.add_task_comment($1, 'Comecei pelo armazém')", [routine.id]);
await db.asUser(ana.authId, "SELECT public.block_task($1, 'Falta acesso ao armazém')", [routine.id]);
await db.asUser(ana.authId, 'SELECT public.unblock_task($1)', [routine.id]);
await db.asUser(gestor.authId, "SELECT public.update_task($1, 'Atualizar inventário', 'Descrição revista', 'HIGH', $2::timestamptz, NULL, NULL, NULL)", [routine.id, inHours(72)]);
await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Inventário atualizado')", [routine.id]);
check((await notificationsOf(manager.profileId)) === managerBefore, '6. Manager não recebe atribuições, comentários, bloqueios, prazos nem conclusões de rotina');
check((await notificationsOf(gestor.profileId, 'TASK_BLOCKED')) === 1, '8. gestor recebe o bloqueio da tarefa da equipa');
check((await notificationsOf(gestor.profileId, 'TASK_COMPLETED')) === 1, '8. gestor recebe a conclusão da tarefa que criou');

check(
  (await createTask(manager.authId, 'Preparar apresentação ao cliente', rui.profileId)).code === '42501',
  'Manager não atribui tarefas diretamente aos colaboradores da equipa do gestor'
);
const fromManager = await createTask(manager.authId, 'Preparar apresentação ao cliente', gestor.profileId);
check(!fromManager.error, `Manager atribui a tarefa ao gestor que supervisiona ${fromManager.error ?? ''}`);
check((await notificationsOf(gestor.profileId, 'TASK_ASSIGNED')) === 1, 'o gestor recebe a tarefa atribuída pelo Manager');
check(
  (await db.asUser(gestor.authId, 'SELECT public.assign_task($1, $2)', [fromManager.id, bruno.profileId])).code === '42501',
  'o gestor não distribui a tarefa fora da sua equipa'
);
check(
  !(await db.asUser(gestor.authId, "SELECT public.assign_task($1, $2, 'Distribuída à equipa')", [fromManager.id, rui.profileId])).error,
  'o gestor distribui pela equipa a tarefa recebida do Manager'
);
check((await value<string>('SELECT assignee_id::text AS value FROM public.tasks WHERE id = $1', [fromManager.id])) === rui.profileId, 'um só responsável: passa a ser o colaborador');
const forGestor = await createTask(manager.authId, 'Rever proposta comercial', gestor.profileId);
check(
  (await db.asUser(gestor.authId, "SELECT public.cancel_task($1, 'Sem efeito para a equipa')", [forGestor.id])).code === '42501',
  'poder distribuir não dá ao gestor o poder de cancelar a tarefa do Manager'
);
await db.asUser(rui.authId, 'SELECT public.start_task($1)', [fromManager.id]);
await db.asUser(rui.authId, "SELECT public.block_task($1, 'Aguarda dados do cliente')", [fromManager.id]);
check((await notificationsOf(gestor.profileId, 'TASK_BLOCKED')) === 2, '8. gestor recebe o bloqueio mesmo sem ter criado a tarefa');
await db.asUser(rui.authId, 'SELECT public.unblock_task($1)', [fromManager.id]);
await db.asUser(rui.authId, "SELECT public.complete_task($1, 'Apresentação pronta')", [fromManager.id]);
check((await notificationsOf(gestor.profileId, 'TEAM_TASK_COMPLETED')) === 1, '8. gestor recebe a conclusão de trabalho da equipa');
check((await notificationsOf(manager.profileId, 'TASK_COMPLETED')) === 1, 'Manager recebe a conclusão da tarefa que ele próprio pediu');

const escalated = await createTask(gestor.authId, 'Fecho do relatório mensal', ana.profileId, true);
await db.asUser(ana.authId, 'SELECT public.start_task($1)', [escalated.id]);
await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Relatório fechado')", [escalated.id]);
check((await notificationsOf(manager.profileId, 'TASK_REVIEW_REQUIRED')) === 1, '7. Manager recebe a conclusão que exige o seu acompanhamento');
check(
  (await value<string>("SELECT category AS value FROM public.notifications WHERE user_id = $1 AND type = 'TASK_REVIEW_REQUIRED'", [manager.profileId])) === 'COMPLETION',
  'notificação classificada como conclusão'
);
check((await notificationsOf(managerOther.profileId, 'TASK_REVIEW_REQUIRED')) === 0, 'Manager de outra estrutura não é notificado');

report.section('Acompanhamento das conclusões');
check(
  (await db.asUser(gestor.authId, 'SELECT public.review_task($1)', [escalated.id])).error?.includes('acompanhamento do Manager') ?? false,
  'gestor não valida uma conclusão reservada ao Manager'
);
check((await db.asUser(ana.authId, 'SELECT public.review_task($1)', [routine.id])).code === '42501', 'responsável não valida a própria conclusão');
check(!(await db.asUser(gestor.authId, "SELECT public.review_task($1, 'Bom trabalho')", [routine.id])).error, 'gestor valida a conclusão da tarefa da equipa');
check(!(await db.asUser(manager.authId, 'SELECT public.review_task($1)', [escalated.id])).error, 'Manager valida a conclusão que exige o seu acompanhamento');
check((await value<string>('SELECT reviewed_by::text AS value FROM public.tasks WHERE id = $1', [escalated.id])) === manager.profileId, 'quem validou fica registado');
check(
  (await db.asUser(manager.authId, 'SELECT public.review_task($1)', [escalated.id])).error?.includes('já foi validada') ?? false,
  'a validação não se repete'
);
await db.asUser(gestor.authId, "SELECT public.reopen_task($1, 'Faltam os anexos do relatório')", [escalated.id]);
check((await value<string | null>('SELECT reviewed_at::text AS value FROM public.tasks WHERE id = $1', [escalated.id])) === null, 'reabrir limpa a validação');

// =============================================================================
report.section('9–10. Responsáveis possíveis e tarefas para si próprio');
check((await createTask(manager.authId, 'Rever orçamento anual', manager.profileId)).code === '42501', '9. o Manager não se atribui tarefas a si próprio');
const managerAssignees = await db.asUser<{ profile_id: string }>(manager.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')");
check(
  managerAssignees.rows.map((row) => row.profile_id).join() === gestor.profileId,
  '9. responsáveis possíveis para o Manager: só os gestores que supervisiona (sem o próprio nem colaboradores)'
);
const managerOwners = await db.asUser<{ profile_id: string }>(manager.authId, "SELECT * FROM public.list_work_people('SCOPE')");
check(
  managerOwners.rows.some((row) => row.profile_id === manager.profileId) && managerOwners.rows.some((row) => row.profile_id === ana.profileId),
  'responsável comercial de oportunidades: lista própria, no âmbito de gestão (inclui o próprio)'
);
const managerSummary = await db.asUser<{ tasks_assigned: number }>(manager.authId, 'SELECT * FROM public.get_my_work_summary()');
check(managerSummary.rows[0]?.tasks_assigned === 0, '9. o painel do Manager não mostra tarefas atribuídas a si próprio');

check(
  (await createTask(gestor.authId, 'Planear escala de férias', gestor.profileId)).error?.includes('a si próprio') ?? false,
  '1. o gestor não atribui tarefas a si próprio (delega na equipa)'
);
const gestorSummary = await db.asUser<{ tasks_assigned: number }>(gestor.authId, 'SELECT * FROM public.get_my_work_summary()');
check(gestorSummary.rows[0]?.tasks_assigned === 1, '10. a tarefa recebida do Manager aparece no painel do gestor');

// 4–5. Definição protegida: a tarefa do Manager só é redefinida pelo Manager; as do gestor, pelo gestor.
const lockedValue = <Value>(column: string) => value<Value>(`SELECT ${column} AS value FROM public.tasks WHERE id = $1`, [forGestor.id]);
check((await lockedValue<boolean>('definition_locked')) === true, 'a tarefa delegada pelo Manager fica com a definição protegida');
const editManagerTask = (authId: string, title: string) =>
  db.asUser(authId, "SELECT public.update_task($1, $2, 'Descrição', 'HIGH', $3::timestamptz, NULL, NULL, NULL)", [forGestor.id, title, inHours(96)]);
check((await editManagerTask(gestor.authId, 'Título mudado pelo gestor')).code === '42501', '4. o gestor não altera a definição da tarefa delegada pelo Manager');
check((await lockedValue<string>('title')) === 'Rever proposta comercial', '4. a definição mantém-se');
check(!(await db.asUser(gestor.authId, 'SELECT public.start_task($1)', [forGestor.id])).error, '4. o gestor executa e atualiza o estado da tarefa recebida');
check(!(await editManagerTask(manager.authId, 'Rever proposta comercial (v2)')).error, 'o Manager altera a definição da tarefa que delegou');
const gestorTask = await createTask(gestor.authId, 'Preparar escala de férias', ana.profileId);
check(
  !(await db.asUser(gestor.authId, "SELECT public.update_task($1, 'Preparar escala de férias (revista)', 'Nova descrição', 'LOW', $2::timestamptz, NULL, NULL, NULL)", [gestorTask.id, inHours(120)])).error,
  '5. o gestor altera as tarefas que criou'
);
check(
  (await db.asUser(ana.authId, "SELECT public.update_task($1, 'Alterada pela responsável', '', 'LOW', NULL, NULL, NULL, NULL)", [gestorTask.id])).code === '42501',
  'o responsável não altera a definição da tarefa'
);
check((await db.asUser(ana.authId, 'SELECT public.assign_task($1, $2)', [gestorTask.id, rui.profileId])).code === '42501', 'o responsável não reatribui a tarefa');
check((await value<string>('SELECT assigned_by::text AS value FROM public.tasks WHERE id = $1', [gestorTask.id])) === gestor.profileId, 'quem atribuiu fica registado (assigned_by)');
const permissionsBefore = await db.asUser(ana.authId, 'SELECT * FROM public.get_my_permissions()');
await createTask(gestor.authId, 'Coordenar inventário de TI', ana.profileId);
const permissionsAfter = await db.asUser(ana.authId, 'SELECT * FROM public.get_my_permissions()');
check(permissionsBefore.rows.length === permissionsAfter.rows.length, 'atribuir uma tarefa não concede privilégios de sistema');

// =============================================================================
report.section('11–12. Equipa, cargos e descrição das funções');
check((await db.asUser(gestor.authId, 'SELECT id FROM public.profiles WHERE id = $1', [bruno.profileId])).rows.length === 0, '11. gestor não lê perfis de outra equipa');
const gestorTeam = await db.asUser<{ profile_id: string }>(gestor.authId, 'SELECT * FROM public.get_team_work_overview()');
check(
  gestorTeam.rows.length === 2 && !gestorTeam.rows.some((row) => row.profile_id === bruno.profileId),
  '11. carga da equipa do gestor limita-se à sua equipa'
);
check(
  (await db.asUser(gestor.authId, 'SELECT * FROM public.get_team_report($1::date, $2::date, NULL, $3)', [today, today, gestorFin.profileId])).code === '42501',
  '11. gestor não pede relatórios da equipa de outro gestor'
);
const brunoTask = await createTask(gestorFin.authId, 'Reconciliar contas', bruno.profileId);
check((await db.asUser(gestor.authId, 'SELECT id FROM public.tasks WHERE id = $1', [brunoTask.id])).rows.length === 0, '11. gestor não vê tarefas de outra equipa');
check(
  (await db.asUser(gestor.authId, 'SELECT public.assign_task($1, $2)', [brunoTask.id, ana.profileId])).error?.includes('Tarefa não encontrada') ?? false,
  '11. gestor não reatribui tarefas de outra equipa'
);

await db.asUser(admin.authId, "UPDATE public.profiles SET job_title = 'Técnica de Logística' WHERE id = $1", [ana.profileId]);
check(
  !(await db.asUser(manager.authId, "SELECT public.update_team_member_job_description($1, 'Gere o armazém central e as entregas aos clientes.')", [ana.profileId])).error,
  'Manager descreve a função de um colaborador supervisionado'
);
const anaProfile = await db.asUser<{ job_title: string; job_description: string }>(gestor.authId, 'SELECT job_title, job_description FROM public.profiles WHERE id = $1', [ana.profileId]);
check(
  anaProfile.rows[0]?.job_title === 'Técnica de Logística' && (anaProfile.rows[0]?.job_description ?? '').startsWith('Gere o armazém'),
  '12. gestor consulta o cargo e a descrição da função da equipa'
);
check(
  gestorTeam.rows.length > 0 && (await db.asUser<{ job_description: string | null }>(gestor.authId, 'SELECT job_description FROM public.get_team_work_overview() WHERE profile_id = $1', [ana.profileId])).rows[0]?.job_description !== null,
  '12. a descrição aparece na carga da equipa'
);
const assigneesWithRoles = await db.asUser<{ profile_id: string; job_description: string | null }>(gestor.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')");
check(assigneesWithRoles.rows.some((row) => row.profile_id === ana.profileId && row.job_description !== null), '12. ao atribuir trabalho, o gestor vê a função de cada pessoa');
check(
  (await db.asUser(gestor.authId, "SELECT public.update_team_member_job_description($1, 'Outra descrição')", [ana.profileId])).code === '42501',
  'sem a permissão própria, o gestor não altera descrições'
);
check(
  (await db.asUser(ana.authId, "UPDATE public.profiles SET job_description = 'Diretora' WHERE id = $1", [ana.profileId])).code === '42501',
  'o colaborador não altera a própria descrição'
);
check(
  (await db.asUser(managerOther.authId, "SELECT public.update_team_member_job_description($1, 'Fora do âmbito')", [ana.profileId])).code === '42501',
  'Manager de outra estrutura não altera descrições'
);
check((await db.countAudit('user.job_description.updated')) === 1, 'alteração da descrição auditada');

// =============================================================================
report.section('13–17. Empresas e aprovação de oportunidades');
const company = await db.asUser<{ id: string }>(gestor.authId, "INSERT INTO public.companies (name, nuit, email) VALUES ('Logística Beira, Lda', '400123456', 'geral@logbeira.co.mz') RETURNING id");
check(!company.error, `13. gestor cria a empresa durante o registo da oportunidade ${company.error ?? ''}`);
const companyId = company.rows[0]?.id ?? '';
check(
  (await db.asUser(gestor.authId, "INSERT INTO public.companies (name, nuit) VALUES ('Outra Empresa', '400123456')")).error?.includes('duplicate') ?? false,
  'NUIT duplicado recusado'
);
check(
  (await db.asUser(gestor.authId, "INSERT INTO public.companies (name) VALUES ('  logística beira, lda ')")).error?.includes('duplicate') ?? false,
  'nome duplicado (sem distinção de maiúsculas) recusado'
);
check((await db.asUser(ana.authId, "INSERT INTO public.companies (name) VALUES ('Empresa do colaborador')")).error !== null, 'colaborador não cria empresas');
const createOpportunity = (authId: string, title: string, ownerId: string | null, currency = 'MZN', estimated = 1500000) =>
  db.asUser<{ id: string }>(
    authId,
    'SELECT public.create_opportunity($1, $2, $3, p_estimated_value => $4, p_currency => $5, p_probability => 50) AS id',
    [title, companyId, ownerId, estimated, currency]
  );
const opportunity = await createOpportunity(gestor.authId, 'Gestão de frota da Beira', ana.profileId);
check(!opportunity.error, `gestor regista oportunidade para a equipa ${opportunity.error ?? ''}`);
const opportunityId = opportunity.rows[0]?.id ?? '';
check((await value<string>('SELECT company_id::text AS value FROM public.opportunities WHERE id = $1', [opportunityId])) === companyId, '14. a nova empresa fica relacionada com a oportunidade');
const approvalStatus = () => value<string>('SELECT approval_status AS value FROM public.opportunities WHERE id = $1', [opportunityId]);
check((await approvalStatus()) === 'NOT_SUBMITTED', '15. a oportunidade criada não fica aprovada');
check(
  (await db.asUser(gestor.authId, "SELECT public.change_opportunity_status($1, 'PROPOSAL')", [opportunityId])).error?.includes('aprovação do Manager') ?? false,
  '15. sem aprovação não avança para Proposta'
);
check(
  (await db.asUser(gestor.authId, "SELECT public.change_opportunity_status($1, 'WON')", [opportunityId])).error?.includes('aprovação do Manager') ?? false,
  '15. sem aprovação não é dada como ganha'
);
check(!(await db.asUser(gestor.authId, "SELECT public.change_opportunity_status($1, 'QUALIFICATION')", [opportunityId])).error, 'qualificação não exige aprovação');
const request = await db.asUser<{ id: string }>(gestor.authId, "SELECT public.request_opportunity_approval($1, 'Proposta de 1,5 M MZN para a frota') AS id", [opportunityId]);
check(!request.error, `gestor pede a aprovação ao Manager ${request.error ?? ''}`);
const requestId = request.rows[0]?.id ?? '';
check((await approvalStatus()) === 'PENDING', 'pedido pendente (ainda não aprovado)');
check(
  (await value<number>('SELECT amount::int AS value FROM public.approval_requests WHERE id = $1', [requestId])) === 1500000
    && (await value<string>('SELECT requested_by::text AS value FROM public.approval_requests WHERE id = $1', [requestId])) === gestor.profileId,
  'pedido regista quem submeteu, o valor e a moeda'
);
check((await notificationsOf(manager.profileId, 'OPPORTUNITY_APPROVAL_REQUIRED')) === 1, '7. Manager recebe o pedido de aprovação');
check((await notificationsOf(managerOther.profileId, 'OPPORTUNITY_APPROVAL_REQUIRED')) === 0, 'Manager de outra estrutura não recebe o pedido');
check(
  (await db.asUser(gestor.authId, "SELECT public.request_opportunity_approval($1, 'Segundo pedido')", [opportunityId])).error?.includes('pendente') ?? false,
  'não há dois pedidos pendentes para a mesma oportunidade'
);
check(
  (await db.asUser(gestor.authId, "SELECT public.decide_opportunity_approval($1, 'APPROVED')", [requestId])).code === '42501',
  '16. o gestor não aprova o próprio pedido'
);
check(
  (await db.asUser(ana.authId, "SELECT public.decide_opportunity_approval($1, 'APPROVED')", [requestId])).code === '42501',
  'o responsável da oportunidade não aprova'
);
check(
  (await db.asUser(managerOther.authId, "SELECT public.decide_opportunity_approval($1, 'APPROVED')", [requestId])).error?.includes('fora do seu âmbito') ?? false,
  '17. Manager não aprova pedidos fora do seu âmbito'
);
check(
  (await db.asUser(gestor.authId, "SELECT public.update_opportunity($1, 'Gestão de frota da Beira', $2, NULL, NULL, NULL, '', '', '', NULL, 9000000, 'MZN', 50, NULL, NULL, NULL, '')", [opportunityId, companyId])).error?.includes('pendente') ?? false,
  'os valores ficam fixos enquanto o pedido está pendente'
);
check(
  (await db.asUser(ana.authId, "UPDATE public.approval_requests SET status = 'APPROVED' WHERE id = $1", [requestId])).error?.includes('permission denied') ?? false,
  'a aprovação não pode ser forjada por UPDATE direto'
);
check(
  (await db.asUser(manager.authId, "SELECT public.decide_opportunity_approval($1, 'REJECTED', '')", [requestId])).error?.includes('motivo da rejeição') ?? false,
  'rejeição exige motivo'
);
check(!(await db.asUser(manager.authId, "SELECT public.decide_opportunity_approval($1, 'APPROVED', 'Avançar com a proposta')", [requestId])).error, 'Manager aprova o pedido');
check((await approvalStatus()) === 'APPROVED', 'a oportunidade fica aprovada');
check(
  (await db.asUser(admin.authId, "SELECT public.decide_opportunity_approval($1, 'REJECTED', 'Decisão concorrente tardia')", [requestId])).error?.includes('já foi decidido') ?? false,
  'uma segunda decisão sobre o mesmo pedido é recusada (atómico)'
);
check((await value<string>('SELECT decided_by::text AS value FROM public.approval_requests WHERE id = $1', [requestId])) === manager.profileId, 'decisor e data registados');
check((await notificationsOf(gestor.profileId, 'OPPORTUNITY_APPROVED')) === 1, 'quem pediu é notificado da decisão');
check(
  (await value<string>("SELECT category AS value FROM public.notifications WHERE user_id = $1 AND type = 'OPPORTUNITY_APPROVED'", [gestor.profileId])) === 'DECISION',
  'notificação classificada como decisão tomada'
);
check(!(await db.asUser(gestor.authId, "SELECT public.change_opportunity_status($1, 'PROPOSAL')", [opportunityId])).error, 'aprovada, avança para Proposta');
check((await db.asUser(ana.authId, 'SELECT id FROM public.approval_requests WHERE id = $1', [requestId])).rows.length === 1, 'o responsável consulta o pedido');
check((await db.asUser(bruno.authId, 'SELECT id FROM public.approval_requests WHERE id = $1', [requestId])).rows.length === 0, 'outras equipas não veem o pedido');

const managerOpportunity = await createOpportunity(manager.authId, 'Contrato de manutenção', manager.profileId);
check(
  (await value<string>('SELECT approval_status AS value FROM public.opportunities WHERE id = $1', [managerOpportunity.rows[0]?.id ?? ''])) === 'NOT_REQUIRED',
  'oportunidade registada pelo Manager não exige aprovação superior'
);
const gestorOwned = (await createOpportunity(gestor.authId, 'Armazém frigorífico', gestor.profileId, 'USD', 80000)).rows[0]?.id ?? '';
const managerRequest = await db.asUser<{ id: string }>(manager.authId, "SELECT public.request_opportunity_approval($1, 'Pedido feito pelo Manager') AS id", [gestorOwned]);
check(
  (await db.asUser(manager.authId, "SELECT public.decide_opportunity_approval($1, 'APPROVED')", [managerRequest.rows[0]?.id ?? ''])).error?.includes('pedido seu') ?? false,
  '16. quem pede nunca decide (também ao nível do Manager)'
);
await db.asUser(gestor.authId, "SELECT public.change_opportunity_status($1, 'CANCELLED', 'Cliente desistiu do projeto')", [gestorOwned]);
check(
  (await value<string>('SELECT status AS value FROM public.approval_requests WHERE id = $1', [managerRequest.rows[0]?.id ?? ''])) === 'CANCELLED'
    && (await value<string>('SELECT approval_status AS value FROM public.opportunities WHERE id = $1', [gestorOwned])) === 'NOT_SUBMITTED',
  'fechar a oportunidade anula o pedido pendente'
);
const pipeline = await db.asUser<{ currency: string; opportunities_active: number }>(gestor.authId, 'SELECT * FROM public.get_opportunity_pipeline()');
check(pipeline.rows.length === 2 && pipeline.rows.every((row) => ['MZN', 'USD'].includes(row.currency)), 'valores agrupados por moeda (nunca somados entre moedas)');

// =============================================================================
report.section('Ausências: colaborador → gestor valida → Manager decide');
const typeId = (code: string) => value<string>('SELECT id AS value FROM public.absence_types WHERE code = $1', [code]);
const vacation = await typeId('VACATION');
const saveAbsence = async (authId: string, type: string, start: number, end: number) =>
  (await db.asUser<{ id: string }>(authId, "SELECT public.save_absence_request(NULL, $1, $2::date, $3::date, 'Férias de família') AS id", [type, await inDays(start), await inDays(end)])).rows[0]?.id ?? '';
const absenceStatus = (id: string) => value<string>('SELECT status AS value FROM public.absence_requests WHERE id = $1', [id]);
const anaAbsence = await saveAbsence(ana.authId, vacation, 10, 14);
const managerAbsenceNotices = await notificationsOf(manager.profileId, 'ABSENCE_APPROVAL_REQUIRED');
check(!(await db.asUser(ana.authId, 'SELECT public.submit_absence_request($1)', [anaAbsence])).error, 'colaborador submete o pedido');
check((await absenceStatus(anaAbsence)) === 'SUBMITTED', 'pedido fica a aguardar a validação do gestor');
check((await notificationsOf(gestor.profileId, 'ABSENCE_VALIDATION_REQUIRED')) === 1, '8. gestor recebe o pedido para validar');
check((await notificationsOf(manager.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === managerAbsenceNotices, 'Manager ainda não é notificado (a validação é do gestor)');
check(
  (await db.asUser(gestor.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [anaAbsence])).code === '42501',
  'o gestor não aprova definitivamente'
);
check(
  (await db.asUser(manager.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [anaAbsence])).error?.includes('validação do gestor') ?? false,
  'o Manager não salta a validação do gestor'
);
check(
  (await db.asUser(gestorFin.authId, "SELECT public.validate_absence_request($1, 'VALIDATED')", [anaAbsence])).error?.includes('fora do seu âmbito') ?? false,
  'gestor de outra equipa não valida'
);
check(!(await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'VALIDATED', 'Equipa coberta nesse período')", [anaAbsence])).error, 'gestor valida e encaminha');
check((await absenceStatus(anaAbsence)) === 'PENDING_APPROVAL', 'pedido aguarda a decisão do Manager');
check((await value<string>('SELECT validated_by::text AS value FROM public.absence_requests WHERE id = $1', [anaAbsence])) === gestor.profileId, 'responsável pela validação registado');
check((await notificationsOf(manager.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === managerAbsenceNotices + 1, '7. Manager recebe o pedido que exige a sua decisão');
check((await notificationsOf(managerOther.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === 0, 'Manager de outra estrutura não recebe o pedido');
check((await notificationsOf(ana.profileId, 'ABSENCE_VALIDATED')) === 1, 'colaborador acompanha o estado do pedido');
check(
  (await db.asUser(managerOther.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [anaAbsence])).error?.includes('fora do seu âmbito') ?? false,
  '17. Manager não decide ausências fora do seu âmbito'
);
check(!(await db.asUser(manager.authId, "SELECT public.decide_absence_request($1, 'APPROVED', 'Boas férias')", [anaAbsence])).error, 'Manager aprova');
check(
  (await db.asUser(admin.authId, "SELECT public.decide_absence_request($1, 'REJECTED', 'Decisão concorrente tardia')", [anaAbsence])).error?.includes('Apenas pedidos pendentes') ?? false,
  'uma segunda decisão é recusada (atómico)'
);
check((await notificationsOf(ana.profileId, 'ABSENCE_APPROVED')) === 1, 'colaborador notificado da decisão');
check((await notificationsOf(gestor.profileId, 'ABSENCE_DECIDED')) === 1, 'gestor que validou é informado da decisão');
const anaCalendar = await db.asUser<{ item_id: string }>(
  ana.authId,
  "SELECT * FROM public.get_calendar_items((now() AT TIME ZONE 'Africa/Maputo')::date, (now() AT TIME ZONE 'Africa/Maputo')::date + 20, 'ME')"
);
check(anaCalendar.rows.some((row) => row.item_id === anaAbsence), 'calendário atualizado com a ausência aprovada');

const training = await typeId('TRAINING');
await db.asPostgres('UPDATE public.absence_types SET requires_manager_approval = false WHERE id = $1', [training]);
const ruiTraining = await saveAbsence(rui.authId, training, 3, 3);
await db.asUser(rui.authId, 'SELECT public.submit_absence_request($1)', [ruiTraining]);
check(
  (await db.asUser(gestor.authId, 'SELECT public.validate_absence_request($1, $2)', [ruiTraining, 'VALIDATED'])).error?.includes('justificação') ?? false,
  '12. a decisão do gestor exige justificação'
);
await db.asUser(gestor.authId, 'SELECT public.validate_absence_request($1, $2, $3)', [ruiTraining, 'VALIDATED', 'Formação prevista no plano']);
check((await absenceStatus(ruiTraining)) === 'APPROVED', 'tipo sem decisão do Manager fica aprovado na validação (regra da empresa)');

const ruiRejected = await saveAbsence(rui.authId, vacation, 50, 52);
await db.asUser(rui.authId, 'SELECT public.submit_absence_request($1)', [ruiRejected]);
const managerDecisionsBefore = await notificationsOf(manager.profileId, 'ABSENCE_APPROVAL_REQUIRED');
check(
  (await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'REJECTED', '')", [ruiRejected])).error?.includes('justificação') ?? false,
  '12. o gestor não rejeita sem justificação'
);
check(
  !(await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'REJECTED', 'Período de fecho do inventário')", [ruiRejected])).error,
  '12. o gestor rejeita com justificação'
);
check((await absenceStatus(ruiRejected)) === 'REJECTED', '12. a rejeição do gestor é a decisão final');
check(
  (await value<string>('SELECT decided_by::text AS value FROM public.absence_requests WHERE id = $1', [ruiRejected])) === gestor.profileId
    && (await value<string>('SELECT decision_comment AS value FROM public.absence_requests WHERE id = $1', [ruiRejected])) === 'Período de fecho do inventário',
  '12. fica registado quem decidiu e a justificação'
);
check((await notificationsOf(rui.profileId, 'ABSENCE_REJECTED')) === 1, '12. o colaborador é notificado da rejeição');
check((await notificationsOf(manager.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === managerDecisionsBefore, '12. uma rejeição do gestor não é enviada ao Manager');
check(
  (await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'VALIDATED', 'Afinal sim')", [ruiRejected])).error?.includes('estado atual') ?? false,
  '12. sem decisões duplicadas: um pedido decidido não volta a ser decidido'
);

// Colaborador sem gestor: atribuído diretamente a um Manager (departamento sem gestor). Usa o Manager de
// Finanças para não alterar a equipa verificada nos painéis abaixo.
const teresa = await db.createUser(admin.authId, 'teresa@siholdings-mz.com', 'Teresa Comercial', 'EMPLOYEE', 'COM');
await scopeTo(managerOther.profileId, { employeeId: teresa.profileId });
const teresaAbsence = await saveAbsence(teresa.authId, vacation, 60, 61);
const managerDecisionsBeforeTeresa = await notificationsOf(managerOther.profileId, 'ABSENCE_APPROVAL_REQUIRED');
await db.asUser(teresa.authId, 'SELECT public.submit_absence_request($1)', [teresaAbsence]);
check((await absenceStatus(teresaAbsence)) === 'PENDING_APPROVAL', '11. sem gestor, o pedido segue diretamente para o Manager');
check((await notificationsOf(managerOther.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === managerDecisionsBeforeTeresa + 1, '11. o Manager é notificado');
check((await notificationsOf(gestorFin.profileId, 'ABSENCE_VALIDATION_REQUIRED')) === 0, '11. nenhum gestor sem relação com o colaborador é notificado');
check(!(await db.asUser(managerOther.authId, "SELECT public.decide_absence_request($1, 'APPROVED', 'Aprovado')", [teresaAbsence])).error, '11. o Manager decide');
check((await notificationsOf(teresa.profileId, 'ABSENCE_APPROVED')) === 1, '11. o colaborador recebe a decisão');

check(
  (await db.asUser(gestor.authId, "SELECT public.save_absence_request(NULL, $1, $2::date, $3::date, 'Férias') AS id", [vacation, await inDays(30), await inDays(31)])).code === '42501',
  '13. o gestor não usa o pedido formal de colaborador'
);
check(
  (await db.asUser(manager.authId, "SELECT public.save_absence_request(NULL, $1, $2::date, $3::date, 'Férias') AS id", [vacation, await inDays(30), await inDays(31)])).code === '42501',
  '13. o Manager não usa o pedido formal de colaborador'
);
const managerNoticesBefore = await notificationsOf(manager.profileId, 'ABSENCE_COMMUNICATED');
const gestorNotice = await db.asUser<{ id: string }>(gestor.authId, "SELECT public.communicate_absence($1, $2::date, $3::date, 'Formação externa') AS id", [vacation, await inDays(30), await inDays(31)]);
check(!gestorNotice.error && (await absenceStatus(gestorNotice.rows[0]?.id ?? '')) === 'COMMUNICATED', `13. o gestor comunica a ausência (sem aprovação) ${gestorNotice.error ?? ''}`);
check((await notificationsOf(manager.profileId, 'ABSENCE_COMMUNICATED')) === managerNoticesBefore + 1, '13. o Manager é notificado da ausência comunicada pelo gestor');
check((await notificationsOf(managerOther.profileId, 'ABSENCE_COMMUNICATED')) === 0, '13. um Manager sem relação com o gestor não é notificado');

const ruiReturned = await saveAbsence(rui.authId, vacation, 40, 41);
await db.asUser(rui.authId, 'SELECT public.submit_absence_request($1)', [ruiReturned]);
check(
  (await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'CHANGES_REQUESTED', '')", [ruiReturned])).error?.includes('corrigido') ?? false,
  'devolver para correção exige comentário'
);
check(
  !(await db.asUser(gestor.authId, "SELECT public.validate_absence_request($1, 'CHANGES_REQUESTED', 'Confirme as datas com a escala')", [ruiReturned])).error
    && (await absenceStatus(ruiReturned)) === 'DRAFT',
  'gestor devolve o pedido ao colaborador'
);
check((await db.asUser(ana.authId, 'SELECT public.validate_absence_request($1, $2)', [anaAbsence, 'VALIDATED'])).code === '42501', 'colaborador não valida pedidos');

// =============================================================================
report.section('18. Auditoria das alterações e decisões');
for (const action of [
  'manager_scope.assigned',
  'opportunity.approval_requested',
  'opportunity.approved',
  'opportunity.approval_cancelled',
  'absence.submitted',
  'absence.validated',
  'absence.approved',
  'absence.changes_requested',
  'task.reviewed',
  'company.created',
]) {
  check((await db.countAudit(action)) >= 1, `auditoria: ${action}`);
}
check(
  (await value<string>("SELECT actor_user_id::text AS value FROM public.audit_events WHERE action = 'opportunity.approved' ORDER BY created_at DESC LIMIT 1")) === manager.profileId,
  'a auditoria regista quem decidiu'
);

// =============================================================================
report.section('19. Painéis com dados reais e limitados ao âmbito');
const range = [await inDays(-30), today];
type Dashboard = {
  team_size: number;
  tasks_in_progress: number;
  tasks_overdue: number;
  tasks_completed: number;
  tasks_pending_follow_up: number;
  absences_to_validate: number;
  opportunities_active: number;
};
const dashboardOf = async (authId: string) => (await db.asUser<Dashboard>(authId, 'SELECT * FROM public.get_team_dashboard($1::date, $2::date)', range)).rows[0];
const gestorDashboard = await dashboardOf(gestor.authId);
check(gestorDashboard?.team_size === 2, 'painel do gestor: 2 colaboradores na equipa');
check(
  gestorDashboard?.tasks_completed === (await value<number>("SELECT count(*)::int AS value FROM public.tasks WHERE status = 'COMPLETED' AND assignee_id = ANY($1::uuid[])", [[ana.profileId, rui.profileId]])),
  'painel do gestor: concluídas = consulta à base de dados'
);
check(gestorDashboard?.opportunities_active === 1, 'painel do gestor: oportunidades ativas da equipa');
const managerDashboard = await dashboardOf(manager.authId);
check(managerDashboard?.team_size === 3, 'painel do Manager: gestor + equipa supervisionada');
check((await db.asUser(ana.authId, 'SELECT * FROM public.get_team_dashboard($1::date, $2::date)', range)).code === '42501', 'colaborador não acede ao painel da equipa');
const supervision = await db.asUser<{ lead_id: string | null; team_size: number }>(manager.authId, 'SELECT * FROM public.get_supervision_overview($1::date, $2::date)', range);
check(
  supervision.rows.length === 1 && supervision.rows[0]?.lead_id === gestor.profileId && supervision.rows[0]?.team_size === 2,
  'supervisão: o Manager vê o seu gestor e a dimensão da equipa'
);
check((await db.asUser(gestor.authId, 'SELECT * FROM public.get_supervision_overview($1::date, $2::date)', range)).code === '42501', 'o gestor não tem a visão de supervisão');
const trend = await db.asUser<{ tasks_completed: number }>(gestor.authId, 'SELECT * FROM public.get_team_completion_trend($1::date, $2::date)', range);
check(trend.rows.length >= 4 && trend.rows.reduce((sum, row) => sum + row.tasks_completed, 0) >= 1, 'evolução semanal calculada');
const reportRows = await db.asUser<{ profile_id: string }>(manager.authId, 'SELECT * FROM public.get_team_report($1::date, $2::date, NULL, $3)', [...range, gestor.profileId]);
check(reportRows.rows.length === 3, 'relatório do Manager filtrado pelo gestor (gestor + equipa)');
check(
  (await db.asUser(manager.authId, 'SELECT * FROM public.get_team_report($1::date, $2::date, NULL, $3)', [...range, gestorFin.profileId])).code === '42501',
  'Manager não filtra por gestores que não supervisiona'
);

// =============================================================================
report.section('20. Administração mantém a visão global');
const adminDashboard = await dashboardOf(admin.authId);
const nonAdmins = await value<number>("SELECT count(*)::int AS value FROM public.profiles p WHERE p.is_active AND NOT EXISTS (SELECT 1 FROM public.user_roles ur JOIN public.roles r ON r.id = ur.role_id WHERE ur.user_id = p.id AND r.code = 'ADMIN')");
check(adminDashboard?.team_size === nonAdmins, 'painel da administração abrange toda a organização');
const adminSupervision = await db.asUser<{ lead_id: string }>(admin.authId, 'SELECT * FROM public.get_supervision_overview($1::date, $2::date)', range);
check(adminSupervision.rows.length === 2, 'administração vê todos os gestores');
check((await db.asUser(admin.authId, 'SELECT id FROM public.tasks WHERE id = $1', [brunoTask.id])).rows.length === 1, 'administração vê tarefas de qualquer equipa');

// =============================================================================
report.section('Alertas de prazo (gerados a pedido, sem duplicados)');
const soon = await createTask(gestor.authId, 'Entregar mapa de turnos', ana.profileId, false, inHours(3));
check(!soon.error, 'tarefa com prazo próximo');
await db.asUser(ana.authId, 'SELECT public.refresh_deadline_alerts()');
await db.asUser(ana.authId, 'SELECT public.refresh_deadline_alerts()');
check((await notificationsOf(ana.profileId, 'TASK_DUE_SOON')) === 1, 'alerta de prazo gerado uma única vez');
check(
  (await value<string>("SELECT category AS value FROM public.notifications WHERE user_id = $1 AND type = 'TASK_DUE_SOON'", [ana.profileId])) === 'DEADLINE',
  'alerta classificado como prazo'
);
await db.asPostgres("UPDATE public.tasks SET due_at = now() - interval '1 hour' WHERE id = $1", [soon.id]);
await db.asUser(gestor.authId, 'SELECT public.refresh_deadline_alerts()');
check((await notificationsOf(gestor.profileId, 'TEAM_TASK_OVERDUE')) === 1, 'gestor recebe o alerta de atraso da equipa');
await db.asUser(manager.authId, 'SELECT public.refresh_deadline_alerts()');
check((await notificationsOf(manager.profileId, 'TEAM_TASK_OVERDUE')) === 0, 'Manager não recebe alertas operacionais de atraso');
check(
  (await value<string>("SELECT link AS value FROM public.notifications WHERE user_id = $1 AND type = 'TEAM_TASK_OVERDUE'", [gestor.profileId])) === `/timesheet/tasks/${soon.id}`,
  'a notificação leva ao registo'
);

// =============================================================================
report.section('Âmbito deixa de valer quando o perfil muda');
const formerGestor = await db.createUser(admin.authId, 'antigo.gestor@siholdings-mz.com', 'Antigo Gestor', 'GESTOR', 'OPS');
await scopeTo(formerGestor.profileId, { departmentCode: 'OPS' });
check(await isManagerOf(formerGestor.authId, ana.profileId), 'gestor com âmbito abrange a equipa');
const employeeRole = await value<string>("SELECT id AS value FROM public.roles WHERE code = 'EMPLOYEE'");
await db.asUser(admin.authId, 'UPDATE public.user_roles SET role_id = $1 WHERE user_id = $2', [employeeRole, formerGestor.profileId]);
check(!(await isManagerOf(formerGestor.authId, ana.profileId)), 'sem TEAM_READ, um âmbito antigo não dá acesso');
check(
  (await db.asUser(formerGestor.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 0,
  'antigo gestor não vê as oportunidades da equipa'
);

// =============================================================================
report.section('Acesso anónimo e funções internas');
check((await db.asAnonymous('SELECT * FROM public.approval_requests')).error?.includes('permission denied') ?? false, 'anónimo não lê pedidos de aprovação');
check((await db.asAnonymous('SELECT * FROM public.get_team_dashboard(current_date, current_date)')).error?.includes('permission denied') ?? false, 'anónimo não executa os painéis');
check(
  (await db.asUser(ana.authId, 'SELECT private.supervises($1, $2)', [manager.profileId, ana.profileId])).error?.includes('permission denied') ?? false,
  'funções internas não são expostas'
);
check(
  (await db.asUser(ana.authId, 'SELECT public.decide_opportunity_approval($1, $2)', [NOT_FOUND, 'APPROVED'])).code === '42501',
  'colaborador não decide pedidos de aprovação'
);

// =============================================================================
report.section('Responsabilidades por perfil (20261016000000)');
const gestorAssignees = (await db.asUser<{ profile_id: string }>(gestor.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')")).rows.map((row) => row.profile_id);
check(
  gestorAssignees.includes(ana.profileId) && gestorAssignees.includes(rui.profileId) && !gestorAssignees.includes(gestor.profileId)
    && !gestorAssignees.includes(manager.profileId) && !gestorAssignees.includes(bruno.profileId),
  '2–3. o gestor escolhe entre os colaboradores da sua equipa (sem o próprio, a chefia ou outras equipas)'
);
check(!(await createTask(managerOther.authId, 'Contactar cliente', teresa.profileId)).error, 'o Manager atribui tarefas à equipa direta (colaborador sem gestor)');
check(
  (await createTask(managerOther.authId, 'Fecho mensal', bruno.profileId)).error?.includes('equipa de um gestor') ?? false,
  'o Manager não atribui diretamente à equipa de um gestor'
);
const unconfiguredMeetingPeople = (await db.asUser<{ profile_id: string }>(managerOther.authId, "SELECT * FROM public.list_work_people('MEETING')")).rows.map((row) => row.profile_id);
check(
  unconfiguredMeetingPeople.includes(gestor.profileId) && !unconfiguredMeetingPeople.includes(managerOther.profileId),
  '8. o Manager pode convidar gestores que não supervisiona (sem o próprio)'
);
const coordination = await createMeeting(managerOther.authId, 'Coordenação de gestores', [gestor.profileId, gestorFin.profileId, gestor.profileId]);
check(!coordination.error, `8–9. reunião com gestores criada sem relação hierárquica configurada ${coordination.error ?? ''}`);
check(
  Number(await value<number>('SELECT count(*)::int AS value FROM public.meeting_participants WHERE meeting_id = $1', [coordination.rows[0]?.id ?? ''])) === 2,
  'participantes sem duplicados'
);
check(
  (await createMeeting(managerOther.authId, 'Convite sem relação', [ana.profileId])).error?.includes('Fora do seu âmbito') ?? false,
  'convidar gestores não abre a equipa deles: colaboradores de outra estrutura continuam fora'
);
check(
  (await db.asUser(managerOther.authId, 'SELECT id FROM public.tasks WHERE assignee_id = $1', [ana.profileId])).rows.length === 0,
  '16. convidar não dá acesso aos dados da equipa do gestor'
);

// =============================================================================
report.section('Projeto do Manager com um gestor fora do seu âmbito formal (20261017000000)');
const project = (await createOpportunity(manager.authId, 'Implementação ERP', null)).rows[0]?.id ?? '';
check(
  !(await db.asUser(manager.authId, 'SELECT public.set_opportunity_execution_lead($1, $2)', [project, gestorFin.profileId])).error
    && !(await db.asUser(manager.authId, 'SELECT public.add_opportunity_member($1, $2)', [project, ana.profileId])).error,
  'o Manager define a equipa do projeto (gestor de execução e colaboradora de outro departamento)'
);
const managerProjectAssignees = (await db.asUser<{ profile_id: string }>(manager.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')")).rows.map((row) => row.profile_id);
check(
  managerProjectAssignees.includes(gestorFin.profileId) && !managerProjectAssignees.includes(manager.profileId) && !managerProjectAssignees.includes(ana.profileId),
  '3/9. o Manager vê o gestor do projeto como responsável possível (sem o próprio nem os colaboradores)'
);
const gestorFinTasksBefore = await notificationsOf(gestorFin.profileId, 'TASK_ASSIGNED');
const projectTask = await db.asUser<{ id: string }>(manager.authId, "SELECT public.create_task('Levantar requisitos do ERP', 'Reuniões com as áreas', 'HIGH', $1, $2::timestamptz, p_opportunity_id => $3) AS id", [gestorFin.profileId, inHours(200), project]);
check(!projectTask.error, `3. o Manager atribui a tarefa ao gestor do projeto ${projectTask.error ?? ''}`);
check((await notificationsOf(gestorFin.profileId, 'TASK_ASSIGNED')) === gestorFinTasksBefore + 1, '12. o gestor é notificado');
check(
  (await value<string>("SELECT link AS value FROM public.notifications WHERE user_id = $1 AND type = 'TASK_ASSIGNED' ORDER BY created_at DESC LIMIT 1", [gestorFin.profileId])) === `/timesheet/tasks/${projectTask.rows[0]?.id}`,
  '12. a notificação abre a tarefa'
);
const gestorFinAssignees = (await db.asUser<{ profile_id: string }>(gestorFin.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')")).rows.map((row) => row.profile_id);
check(
  gestorFinAssignees.includes(ana.profileId) && gestorFinAssignees.includes(bruno.profileId) && !gestorFinAssignees.includes(gestorFin.profileId),
  '2. o gestor vê a equipa formal e os colaboradores dos seus projetos (outros departamentos incluídos), sem o próprio'
);
check(
  !(await db.asUser(gestorFin.authId, 'SELECT public.assign_task($1, $2)', [projectTask.rows[0]?.id ?? '', ana.profileId])).error,
  '5. o gestor distribui a tarefa do Manager a uma colaboradora do projeto'
);
check((await db.asUser(ana.authId, 'SELECT id FROM public.tasks WHERE id = $1', [projectTask.rows[0]?.id ?? ''])).rows.length === 1, 'a responsável vê a tarefa');
check((await db.asUser(gestorFin.authId, 'SELECT id FROM public.tasks WHERE id = $1', [projectTask.rows[0]?.id ?? ''])).rows.length === 1, 'quem distribuiu continua a acompanhar a tarefa');
check(
  (await db.asUser(gestorFin.authId, "SELECT public.cancel_task($1, 'Sem efeito')", [projectTask.rows[0]?.id ?? ''])).code === '42501',
  '4. quem distribuiu não cancela a tarefa definida pelo Manager'
);
const managerProjectTeam = (await db.asUser<{ profile_id: string; project_role: string }>(manager.authId, 'SELECT * FROM public.get_project_team_overview()')).rows;
check(
  managerProjectTeam.some((row) => row.profile_id === gestorFin.profileId && row.project_role === 'EXECUTION_LEAD')
    && managerProjectTeam.some((row) => row.profile_id === ana.profileId) && !managerProjectTeam.some((row) => row.profile_id === manager.profileId),
  '6. a equipa do projeto aparece na vista do Manager (sem o próprio)'
);
check(
  Number(await value<number>('SELECT count(*)::int AS value FROM public.manager_scopes WHERE manager_id = $1 AND employee_id = $2', [manager.profileId, gestorFin.profileId])) === 0
    && (await db.asUser(manager.authId, 'SELECT id FROM public.my_team_members WHERE id = $1', [gestorFin.profileId])).rows.length === 0,
  '8. o projeto não cria hierarquia formal'
);
check(
  (await db.asUser(managerOther.authId, 'SELECT * FROM public.get_project_team_overview()')).rows.every((row) => (row as { opportunity_id: string }).opportunity_id !== project),
  '18. outro Manager não vê a equipa deste projeto'
);

report.finish();
