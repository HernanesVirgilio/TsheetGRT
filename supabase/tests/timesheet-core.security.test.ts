// Testes de segurança e de regras de negócio do Timesheet Core: tarefas, tempo com contexto,
// reuniões, ausências, oportunidades, anexos (Storage), calendário e resumos.
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'));
const report = new TestReport();
const check = report.check.bind(report);

const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
const managerOps = await db.createUser(admin.authId, 'gestor.ops@siholdings-mz.com', 'Gestor Operações', 'MANAGER', 'OPS');
const managerFin = await db.createUser(admin.authId, 'gestor.fin@siholdings-mz.com', 'Gestor Finanças', 'MANAGER', 'FIN');
const ana = await db.createUser(admin.authId, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
const rui = await db.createUser(admin.authId, 'rui@siholdings-mz.com', 'Rui Operações', 'EMPLOYEE', 'OPS');
const bruno = await db.createUser(admin.authId, 'bruno@siholdings-mz.com', 'Bruno Finanças', 'EMPLOYEE', 'FIN');
const itUser = await db.createUser(admin.authId, 'it@siholdings-mz.com', 'Técnico IT', 'IT', 'IT');
const inactive = await db.createUser(admin.authId, 'inativo@siholdings-mz.com', 'Colaborador Inativo', 'EMPLOYEE', 'OPS');

const assignScope = async (managerProfileId: string, departmentCode: string) => {
  const result = await db.asUser(admin.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [
    managerProfileId,
    await db.departmentId(departmentCode),
  ]);
  if (result.error) throw new Error(`Falha ao atribuir âmbito: ${result.error}`);
};
await assignScope(managerOps.profileId, 'OPS');
await assignScope(managerFin.profileId, 'FIN');
await db.asUser(admin.authId, 'UPDATE public.profiles SET is_active = false WHERE id = $1', [inactive.profileId]);

const NOT_FOUND = '00000000-0000-4000-8000-000000000000';
const inHours = (hours: number) => new Date(Date.now() + hours * 3600 * 1000).toISOString();
const value = <Value>(sql: string, params: unknown[] = []) => db.scalar<Value>(sql, params);
const notificationsOf = (profileId: string, type: string) =>
  value<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = $2', [profileId, type]);
const taskValue = <Value>(taskId: string, column: string) =>
  value<Value>(`SELECT ${column} AS value FROM public.tasks WHERE id = $1`, [taskId]);
const createTask = async (authId: string, title: string, assigneeId: string | null, dueAt: string | null = inHours(48), extra = '') => {
  const result = await db.asUser<{ id: string }>(
    authId,
    `SELECT public.create_task($1, 'Descrição da tarefa', 'MEDIUM', $2, $3::timestamptz${extra}) AS id`,
    [title, assigneeId, dueAt]
  );
  return { id: result.rows[0]?.id ?? '', error: result.error, code: result.code };
};

// =============================================================================
report.section('Permissões por perfil');
const workPermissions = (roleCode: string) =>
  value<number>(
    "SELECT count(*)::int AS value FROM public.role_permissions rp JOIN public.roles r ON r.id = rp.role_id JOIN public.permissions p ON p.id = rp.permission_id WHERE r.code = $1 AND p.module = 'work'",
    [roleCode]
  );
check((await workPermissions('EMPLOYEE')) === 9, 'EMPLOYEE: 9 permissões de trabalho (sem criar/atribuir/aprovar)');
check((await workPermissions('MANAGER')) === 18, 'MANAGER: as 18 permissões de trabalho (assume as funções do futuro GESTOR)');
check((await workPermissions('IT')) === 7, 'IT: apenas uso pessoal (sem oportunidades nem gestão)');
check((await workPermissions('ADMIN')) === 18, 'ADMIN: todas as permissões de trabalho');

// =============================================================================
report.section('Tarefas: criação, âmbito e visibilidade');
check((await createTask(ana.authId, 'Tarefa criada pelo colaborador', ana.profileId)).code === '42501', 'colaborador não cria tarefas');
check((await createTask(itUser.authId, 'Tarefa criada pelo IT', null)).code === '42501', 'IT não cria tarefas');

const report1 = await createTask(managerOps.authId, 'Preparar relatório financeiro', ana.profileId);
check(!report1.error, `gestor cria tarefa para colaborador do âmbito ${report1.error ?? ''}`);
const taskA = report1.id;
check(/^TAR-\d{5}$/.test(await taskValue<string>(taskA, 'reference')), 'referência gerada no servidor');
check((await taskValue<string>(taskA, 'status')) === 'ASSIGNED', 'tarefa com responsável nasce atribuída');
check((await taskValue<string>(taskA, 'created_by')) === managerOps.profileId, 'criador = utilizador da sessão');
check((await notificationsOf(ana.profileId, 'TASK_ASSIGNED')) === 1, 'responsável notificado da nova tarefa');
check((await db.countAudit('task.created')) === 1 && (await db.countAudit('task.assigned')) === 1, 'criação e atribuição auditadas');

check(
  (await createTask(managerOps.authId, 'Tarefa fora do âmbito', bruno.profileId)).error?.includes('âmbito') ?? false,
  'gestor não atribui tarefa a colaborador fora do âmbito'
);
check(
  (await createTask(managerOps.authId, 'Tarefa para inativo', inactive.profileId)).error?.includes('âmbito') ?? false,
  'tarefa não é atribuída a utilizador inativo'
);
check(
  (await createTask(managerOps.authId, 'Tarefa com prazo passado', ana.profileId, inHours(-2))).error?.includes('data futura') ?? false,
  'prazo no passado recusado'
);
check(!(await createTask(managerOps.authId, 'Tarefa do próprio gestor', managerOps.profileId)).error, 'gestor atribui tarefa a si próprio');

const planned = await createTask(managerOps.authId, 'Tarefa ainda por atribuir', null);
check((await taskValue<string>(planned.id, 'status')) === 'PLANNED', 'tarefa sem responsável fica planeada');

check((await db.asUser(ana.authId, 'SELECT id FROM public.tasks WHERE id = $1', [taskA])).rows.length === 1, 'responsável vê a tarefa');
check((await db.asUser(rui.authId, 'SELECT id FROM public.tasks WHERE id = $1', [taskA])).rows.length === 0, 'colega não vê a tarefa de outro (ID manipulado)');
check((await db.asUser(managerFin.authId, 'SELECT id FROM public.tasks WHERE id = $1', [taskA])).rows.length === 0, 'gestor de outro âmbito não vê a tarefa');
check((await db.asUser(admin.authId, 'SELECT id FROM public.tasks')).rows.length >= 3, 'administração vê todas as tarefas');
check(
  (await db.asUser(rui.authId, 'SELECT public.start_task($1)', [taskA])).error?.includes('Tarefa não encontrada') ?? false,
  'colega não inicia a tarefa de outro'
);
check(
  (await db.asUser(managerFin.authId, 'SELECT public.assign_task($1, $2)', [taskA, bruno.profileId])).error?.includes('Tarefa não encontrada') ?? false,
  'gestor fora do âmbito não reatribui (sem revelar a tarefa)'
);
check(
  (await db.asUser(ana.authId, "UPDATE public.tasks SET status = 'COMPLETED' WHERE id = $1", [taskA])).error?.includes('permission denied') ?? false,
  'estado não muda por UPDATE direto'
);
check(
  (await db.asUser(ana.authId, "INSERT INTO public.tasks (title, created_by) VALUES ('Direta', $1)", [ana.profileId])).error?.includes('permission denied') ?? false,
  'tarefa não é criada por INSERT direto'
);
check(
  (await db.asUser(ana.authId, "INSERT INTO public.task_events (task_id, actor_id, event_type) VALUES ($1, $2, 'TASK_COMPLETED')", [taskA, managerOps.profileId])).error?.includes('permission denied') ?? false,
  'histórico não pode ser forjado (ator falso)'
);
check(
  (await db.asUser(ana.authId, "INSERT INTO public.audit_events (action, entity_type, description) VALUES ('task.completed', 'tasks', 'forjado')")).error?.includes('permission denied') ?? false,
  'auditoria não pode ser inserida diretamente'
);
check(
  (await db.asUser(ana.authId, 'SELECT public.assign_task($1, $2)', [taskA, rui.profileId])).code === '42501',
  'colaborador não reatribui tarefas'
);

// =============================================================================
report.section('Tarefas: execução e máquina de estados');
check(
  (await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Feito')", [taskA])).error?.includes('Inicie a tarefa') ?? false,
  'não se conclui uma tarefa por iniciar'
);
check(!(await db.asUser(ana.authId, 'SELECT public.start_task($1)', [taskA])).error, 'responsável inicia a tarefa');
check(
  (await taskValue<string>(taskA, 'status')) === 'IN_PROGRESS' && (await taskValue<string | null>(taskA, 'started_at')) !== null,
  'tarefa em curso com data de início'
);
check(
  (await db.asUser(managerOps.authId, 'SELECT public.start_task($1)', [taskA])).error?.includes('Só o responsável') ?? false,
  'só o responsável inicia'
);
check(
  (await db.asUser(ana.authId, "SELECT public.block_task($1, 'x')", [taskA])).error?.includes('Descreva o bloqueio') ?? false,
  'bloqueio exige descrição'
);
check(!(await db.asUser(ana.authId, "SELECT public.block_task($1, 'A aguardar dados da contabilidade')", [taskA])).error, 'responsável regista bloqueio');
check((await notificationsOf(managerOps.profileId, 'TASK_BLOCKED')) === 1, 'gestor notificado do bloqueio');
check(
  (await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Feito')", [taskA])).error?.includes('bloqueada') ?? false,
  'tarefa bloqueada não é concluída'
);
check(!(await db.asUser(ana.authId, 'SELECT public.unblock_task($1)', [taskA])).error, 'responsável desbloqueia');
check(!(await db.asUser(ana.authId, "SELECT public.add_task_comment($1, 'Dados recebidos')", [taskA])).error, 'responsável comenta');
check((await notificationsOf(managerOps.profileId, 'TASK_COMMENT')) === 1, 'criador notificado do comentário');
check(
  (await db.asUser(rui.authId, "SELECT public.add_task_comment($1, 'Intromissão')", [taskA])).error?.includes('não encontrada') ?? false,
  'colega não comenta tarefa alheia'
);
check(!(await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Relatório entregue')", [taskA])).error, 'conclusão dentro do prazo');
check(
  (await taskValue<string>(taskA, 'status')) === 'COMPLETED' && (await taskValue<string | null>(taskA, 'late_reason')) === null,
  'concluída sem motivo de atraso'
);
check((await notificationsOf(managerOps.profileId, 'TASK_COMPLETED')) === 1, 'criador notificado da conclusão');

// Conclusão depois do prazo.
const lateTask = (await createTask(managerOps.authId, 'Enviar proposta comercial', ana.profileId)).id;
await db.asUser(ana.authId, 'SELECT public.start_task($1)', [lateTask]);
await db.asPostgres("UPDATE public.tasks SET due_at = now() - interval '2 days' WHERE id = $1", [lateTask]);
check(
  (await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Enviada')", [lateTask])).error?.includes('motivo do atraso') ?? false,
  'conclusão atrasada sem motivo é recusada'
);
check(
  !(await db.asUser(ana.authId, "SELECT public.complete_task($1, 'Enviada', 'Aguardámos a validação do diretor')", [lateTask])).error,
  'conclusão atrasada com motivo é aceite'
);
check(
  (await value<string>("SELECT event_type AS value FROM public.task_events WHERE task_id = $1 AND event_type LIKE 'TASK_COMPLETED%'", [lateTask])) === 'TASK_COMPLETED_LATE',
  'histórico regista conclusão com atraso'
);
check(
  (await db.asPostgres("UPDATE public.tasks SET late_reason = NULL WHERE id = $1", [lateTask])).code === '23514',
  'a justificação do atraso não pode ser apagada (restrição na base de dados)'
);

// Edição depois da conclusão e concorrência.
const updatedAt = await taskValue<string>(taskA, 'updated_at');
check(
  (await db.asUser(managerOps.authId, "SELECT public.update_task($1, 'Preparar relatório financeiro anual', 'Descrição da tarefa', 'HIGH', $2::timestamptz, NULL, NULL, $3)", [taskA, inHours(48), await db.departmentId('OPS')])).error?.includes('motivo da alteração') ?? false,
  'edição de tarefa concluída exige motivo'
);
check(
  (await db.asUser(managerOps.authId, "SELECT public.update_task($1, 'Preparar relatório financeiro anual', 'Descrição da tarefa', 'HIGH', (SELECT due_at FROM public.tasks WHERE id = $1), NULL, NULL, $2, 'Âmbito alargado ao ano', '2000-01-01T00:00:00Z')", [taskA, await db.departmentId('OPS')])).error?.includes('alterada por outra pessoa') ?? false,
  'edição com versão desatualizada é recusada (concorrência)'
);
check(
  !(await db.asUser(managerOps.authId, "SELECT public.update_task($1, 'Preparar relatório financeiro anual', 'Descrição da tarefa', 'HIGH', (SELECT due_at FROM public.tasks WHERE id = $1), NULL, NULL, $2, 'Âmbito alargado ao ano', $3::timestamptz)", [taskA, await db.departmentId('OPS'), updatedAt])).error,
  'gestor edita tarefa concluída com motivo'
);
const afterClosure = await db.asPostgres<{ field: string; old_value: string; new_value: string; after_closure: boolean; actor_id: string }>(
  "SELECT field, old_value, new_value, after_closure, actor_id FROM public.task_events WHERE task_id = $1 AND after_closure ORDER BY created_at",
  [taskA]
);
check(
  afterClosure.rows.length === 2 && afterClosure.rows.every((row) => row.actor_id === managerOps.profileId),
  'cada campo alterado após a conclusão fica no histórico com o autor'
);
check(
  afterClosure.rows.some((row) => row.field === 'title' && row.old_value === 'Preparar relatório financeiro' && row.new_value === 'Preparar relatório financeiro anual'),
  'histórico guarda valor anterior e novo valor'
);
check(
  (await db.asUser(managerOps.authId, "SELECT public.update_task($1, 'Preparar relatório financeiro anual', 'Descrição da tarefa', 'HIGH', (SELECT due_at FROM public.tasks WHERE id = $1), NULL, NULL, $2, 'Sem alterações reais')", [taskA, await db.departmentId('OPS')])).error?.includes('Não existem alterações') ?? false,
  'edição sem alterações é recusada'
);

// Reabertura.
check((await db.asUser(ana.authId, "SELECT public.reopen_task($1, 'Faltou um anexo')", [taskA])).code === '42501', 'colaborador não reabre tarefas');
check(
  (await db.asUser(managerOps.authId, "SELECT public.reopen_task($1, 'x')", [taskA])).error?.includes('motivo da reabertura') ?? false,
  'reabertura exige motivo'
);
check(!(await db.asUser(managerOps.authId, "SELECT public.reopen_task($1, 'Faltou o anexo das despesas', $2::timestamptz)", [lateTask, inHours(24)])).error, 'gestor reabre tarefa concluída');
check(
  (await taskValue<string>(lateTask, 'status')) === 'IN_PROGRESS' && (await taskValue<string | null>(lateTask, 'completed_at')) === null,
  'tarefa reaberta volta a estar em curso'
);
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.task_events WHERE task_id = $1 AND event_type = 'TASK_COMPLETED_LATE' AND old_value IS NOT NULL", [lateTask])) === 1,
  'motivo do atraso da conclusão anterior permanece no histórico'
);
check(
  (await db.asUser(managerOps.authId, "SELECT public.reopen_task($1, 'Reabrir em curso')", [lateTask])).error?.includes('concluídas') ?? false,
  'só tarefas concluídas são reabertas'
);

// Cancelamento.
const toCancel = (await createTask(managerOps.authId, 'Tarefa a cancelar', rui.profileId)).id;
check((await db.asUser(rui.authId, "SELECT public.cancel_task($1, 'Não quero')", [toCancel])).code === '42501', 'colaborador não cancela tarefas');
check(!(await db.asUser(managerOps.authId, "SELECT public.cancel_task($1, 'Prioridade alterada pela direção')", [toCancel])).error, 'gestor cancela com motivo');
check(
  (await db.asUser(rui.authId, 'SELECT public.start_task($1)', [toCancel])).error?.includes('atribuída') ?? false,
  'tarefa cancelada não volta silenciosamente a estar em curso'
);
check(
  (await db.asUser(managerOps.authId, "SELECT public.reopen_task($1, 'Retomar trabalho')", [toCancel])).error?.includes('concluídas') ?? false,
  'tarefa cancelada não é reaberta'
);
check((await notificationsOf(rui.profileId, 'TASK_CANCELLED')) === 1, 'responsável notificado do cancelamento');

// Tarefa adicional e reatribuição.
const additional = await db.asUser<{ id: string }>(
  managerOps.authId,
  "SELECT public.create_task('Adicionar análise de despesas extraordinárias', '', 'HIGH', $1, $2::timestamptz, NULL, NULL, NULL, $3) AS id",
  [ana.profileId, inHours(72), taskA]
);
check(!additional.error, 'tarefa adicional criada como nova unidade de trabalho');
check(
  (await taskValue<string>(additional.rows[0]?.id ?? '', 'parent_task_id')) === taskA && (await taskValue<string>(taskA, 'title')) === 'Preparar relatório financeiro anual',
  'a tarefa original não é sobrescrita'
);
check(!(await db.asUser(managerOps.authId, 'SELECT public.assign_task($1, $2)', [lateTask, rui.profileId])).error, 'gestor reatribui a tarefa');
check(
  (await value<string>("SELECT event_type AS value FROM public.task_events WHERE task_id = $1 AND field = 'assignee' ORDER BY created_at DESC LIMIT 1", [lateTask])) === 'TASK_REASSIGNED',
  'reatribuição registada no histórico'
);
check(
  (await db.asUser(managerOps.authId, 'SELECT public.assign_task($1, NULL)', [lateTask])).error?.includes('ainda não iniciada') ?? false,
  'não se retira o responsável de uma tarefa em curso'
);

// =============================================================================
report.section('Tempo com contexto');
const anaTask = (await createTask(managerOps.authId, 'Implementar módulo de clientes', ana.profileId)).id;
await db.asUser(ana.authId, 'SELECT public.start_task($1)', [anaTask]);
const today = await value<string>("SELECT to_char((now() AT TIME ZONE 'Africa/Maputo')::date, 'YYYY-MM-DD') AS value");
const period = await db.asUser<{ id: string }>(ana.authId, 'SELECT public.ensure_my_timesheet_period($1::date) AS id', [today]);
check(!period.error, `período do colaborador criado segundo o ciclo da empresa ${period.error ?? ''}`);
const anaTimesheet = period.rows[0]?.id ?? '';
check(
  (await db.asUser<{ id: string }>(ana.authId, 'SELECT public.ensure_my_timesheet_period($1::date) AS id', [today])).rows[0]?.id === anaTimesheet,
  'o mesmo período é reutilizado'
);
check(
  (await db.asUser(ana.authId, "SELECT public.ensure_my_timesheet_period((now() + interval '3 days')::date)")).error?.includes('datas futuras') ?? false,
  'não se regista tempo em datas futuras'
);
const activityId = await value<string>("SELECT id AS value FROM public.activities WHERE code = 'ACT-DEV-02'");
const insertEntry = (authId: string, employeeId: string, kind: string, column: string | null, contextId: string | null, start = '09:00', end = '10:30', description = 'Desenvolvimento') =>
  db.asUser<{ id: string; opportunity_id: string | null }>(
    authId,
    `INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, break_minutes, description, kind${column ? `, ${column}` : ''})
     VALUES ($1, $2, $3::date, $4, $5::time, $6::time, 0, $7, $8${column ? ', $9' : ''}) RETURNING id, opportunity_id`,
    column ? [anaTimesheet, employeeId, today, activityId, start, end, description, kind, contextId] : [anaTimesheet, employeeId, today, activityId, start, end, description, kind]
  );
const taskEntry = await insertEntry(ana.authId, ana.profileId, 'TASK', 'task_id', anaTask);
check(!taskEntry.error, `colaborador regista 1h30 na própria tarefa ${taskEntry.error ?? ''}`);
check((await value<number>('SELECT total_minutes AS value FROM public.timesheet_entries WHERE id = $1', [taskEntry.rows[0]?.id])) === 90, 'duração calculada no servidor');
check(
  (await insertEntry(ana.authId, ana.profileId, 'TASK', 'task_id', toCancel, '11:00', '12:00')).error?.includes('atribuídas') ?? false,
  'não se regista tempo em tarefas de outra pessoa'
);
check(
  (await insertEntry(ana.authId, ana.profileId, 'TASK', null, null, '11:00', '12:00')).error?.includes('atribuídas') ?? false,
  'tempo de tarefa sem tarefa é recusado'
);
check(
  (await insertEntry(ana.authId, ana.profileId, 'UNPLANNED', null, null, '13:00', '14:00', 'Intervenção urgente pedida pelo Diretor Financeiro')).error === null,
  'atividade extraordinária registada'
);
check(
  (await insertEntry(ana.authId, ana.profileId, 'UNPLANNED', null, null, '14:00', '15:00', 'x')).code === '23514',
  'atividade extraordinária exige descrição'
);
check(
  (await insertEntry(ana.authId, ana.profileId, 'TASK', 'task_id', anaTask, '15:00', '14:00')).error?.includes('superior a zero') ?? false,
  'duração negativa recusada'
);
const totals = await db.asUser<{ full_name: string; total_minutes: number }>(managerOps.authId, "SELECT * FROM public.get_work_time_totals('TASK', $1)", [anaTask]);
check(totals.rows[0]?.total_minutes === 90 && totals.rows[0]?.full_name === 'Ana Operações', 'gestor vê o tempo dedicado à tarefa');
check(
  (await db.asUser(rui.authId, "SELECT * FROM public.get_work_time_totals('TASK', $1)", [anaTask])).error?.includes('não encontrada') ?? false,
  'colega não vê o tempo de tarefas alheias'
);

// =============================================================================
report.section('Reuniões');
const meetingResult = await db.asUser<{ id: string }>(
  ana.authId,
  "SELECT public.create_meeting('Apresentação inicial', $1::timestamptz, $2::timestamptz, 'Apresentar a proposta', 'Validar âmbito', 'Sala 2', 'https://meet.example.com/x', ARRAY[$3::uuid], $4) AS id",
  [inHours(24), inHours(25), rui.profileId, anaTask]
);
check(!meetingResult.error, `colaborador organiza reunião ${meetingResult.error ?? ''}`);
const meetingId = meetingResult.rows[0]?.id ?? '';
check((await notificationsOf(rui.profileId, 'MEETING_INVITED')) === 1, 'participante notificado do convite');
check(
  (await db.asUser(ana.authId, "SELECT public.create_meeting('Reunião impossível', $1::timestamptz, $2::timestamptz)", [inHours(5), inHours(4)])).error?.includes('terminar depois') ?? false,
  'reunião que termina antes de começar é recusada'
);
check(
  (await db.asUser(ana.authId, "SELECT public.create_meeting('Ligação perigosa', $1::timestamptz, $2::timestamptz, '', '', NULL, 'javascript:alert(1)')", [inHours(5), inHours(6)])).code === '23514',
  'ligação não http(s) recusada'
);
check((await db.asUser(rui.authId, 'SELECT id FROM public.meetings WHERE id = $1', [meetingId])).rows.length === 1, 'participante vê a reunião');
check((await db.asUser(bruno.authId, 'SELECT id FROM public.meetings WHERE id = $1', [meetingId])).rows.length === 0, 'não participante não vê a reunião');
check((await db.asUser(managerOps.authId, 'SELECT id FROM public.meetings WHERE id = $1', [meetingId])).rows.length === 1, 'gestor do organizador vê a reunião');
check(
  (await db.asUser(rui.authId, "SELECT public.cancel_meeting($1, 'Não posso ir')", [meetingId])).code === '42501',
  'participante não cancela a reunião'
);
check(
  (await db.asUser(ana.authId, "SELECT public.complete_meeting($1, 'Proposta aceite')", [meetingId])).error?.includes('ainda não começou') ?? false,
  'reunião futura não é dada como concluída'
);
await db.asPostgres("UPDATE public.meetings SET starts_at = now() - interval '2 hours', ends_at = now() - interval '1 hour' WHERE id = $1", [meetingId]);
check(
  (await db.asUser(ana.authId, "SELECT public.complete_meeting($1, '')", [meetingId])).error?.includes('resultado') ?? false,
  'conclusão exige o resultado'
);
check(
  !(await db.asUser(ana.authId, "SELECT public.complete_meeting($1, 'Cliente aceitou avançar', 'Avançar com proposta', 'Enviar orçamento')", [meetingId])).error,
  'organizador regista resultado, decisões e próximos passos'
);
check(
  (await db.asUser(ana.authId, "SELECT public.update_meeting_outcome($1, 'Cliente aceitou avançar com ajustes', NULL, NULL, '')", [meetingId])).error?.includes('motivo') ?? false,
  'corrigir o resultado exige motivo'
);
check(
  !(await db.asUser(ana.authId, "SELECT public.update_meeting_outcome($1, 'Cliente aceitou avançar com ajustes', 'Avançar com proposta', 'Enviar orçamento', 'Correção após confirmação por e-mail')", [meetingId])).error,
  'resultado corrigido com motivo'
);
check(
  (await value<boolean>("SELECT bool_and(after_closure) AS value FROM public.meeting_events WHERE meeting_id = $1 AND event_type = 'MEETING_OUTCOME_UPDATED'", [meetingId])),
  'correção do resultado marcada como pós-encerramento'
);
check(
  (await insertEntry(rui.authId, rui.profileId, 'MEETING', 'meeting_id', meetingId)).error !== null,
  'ninguém regista tempo no período de outra pessoa'
);
const ruiPeriod = (await db.asUser<{ id: string }>(rui.authId, 'SELECT public.ensure_my_timesheet_period($1::date) AS id', [today])).rows[0]?.id ?? '';
const meetingEntry = await db.asUser(
  rui.authId,
  "INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, description, kind, meeting_id) VALUES ($1, $2, $3::date, $4, '09:00', '10:00', 'Reunião de apresentação', 'MEETING', $5)",
  [ruiPeriod, rui.profileId, today, activityId, meetingId]
);
check(!meetingEntry.error, `participante regista o tempo da reunião ${meetingEntry.error ?? ''}`);
const brunoPeriod = (await db.asUser<{ id: string }>(bruno.authId, 'SELECT public.ensure_my_timesheet_period($1::date) AS id', [today])).rows[0]?.id ?? '';
check(
  (await db.asUser(bruno.authId, "INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, description, kind, meeting_id) VALUES ($1, $2, $3::date, $4, '09:00', '10:00', 'Reunião', 'MEETING', $5)", [brunoPeriod, bruno.profileId, today, activityId, meetingId])).error?.includes('participa') ?? false,
  'não participante não regista tempo na reunião'
);
const taskFromMeeting = await db.asUser<{ id: string }>(
  managerOps.authId,
  "SELECT public.create_task('Enviar orçamento', 'Seguimento da reunião', 'HIGH', $1, $2::timestamptz, NULL, NULL, NULL, NULL, NULL, $3) AS id",
  [ana.profileId, inHours(48), meetingId]
);
check(!taskFromMeeting.error && (await taskValue<string>(taskFromMeeting.rows[0]?.id ?? '', 'meeting_id')) === meetingId, 'tarefa criada a partir da reunião');

// =============================================================================
report.section('Ausências');
const typeId = (code: string) => value<string>('SELECT id AS value FROM public.absence_types WHERE code = $1', [code]);
const vacation = await typeId('VACATION');
const sick = await typeId('SICK');
const saveAbsence = (authId: string, type: string, start: string, end: string, requestId: string | null = null) =>
  db.asUser<{ id: string }>(authId, "SELECT public.save_absence_request($1, $2, $3::date, $4::date, 'Motivo do pedido') AS id", [requestId, type, start, end]);
const inDays = async (days: number) => value<string>(`SELECT to_char((now() AT TIME ZONE 'Africa/Maputo')::date + ${days}, 'YYYY-MM-DD') AS value`);
const anaAbsence = (await saveAbsence(ana.authId, vacation, await inDays(10), await inDays(14))).rows[0]?.id ?? '';
check(anaAbsence !== '' && (await value<string>('SELECT status AS value FROM public.absence_requests WHERE id = $1', [anaAbsence])) === 'DRAFT', 'colaborador cria pedido em rascunho');
check((await saveAbsence(ana.authId, vacation, await inDays(5), await inDays(3))).error?.includes('data final') ?? false, 'período invertido recusado');
check(!(await db.asUser(ana.authId, 'SELECT public.submit_absence_request($1)', [anaAbsence])).error, 'colaborador submete o pedido');
check((await notificationsOf(managerOps.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === 1, 'gestor do âmbito notificado');
check((await notificationsOf(managerFin.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === 0, 'gestor de outro âmbito não é notificado');
check((await db.asUser(ana.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [anaAbsence])).code === '42501', 'colaborador não aprova o próprio pedido');
check(
  (await db.asUser(managerFin.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [anaAbsence])).error?.includes('fora do seu âmbito') ?? false,
  'gestor fora do âmbito não aprova'
);
check((await db.asUser(rui.authId, 'SELECT id FROM public.absence_requests WHERE id = $1', [anaAbsence])).rows.length === 0, 'colega não vê ausências de outros');
check((await db.asUser(itUser.authId, 'SELECT id FROM public.absence_requests WHERE id = $1', [anaAbsence])).rows.length === 0, 'IT não vê ausências de outros');
check((await db.asUser(managerOps.authId, 'SELECT id FROM public.absence_requests WHERE id = $1', [anaAbsence])).rows.length === 1, 'gestor do âmbito vê o pedido');
check(
  (await db.asUser(ana.authId, "UPDATE public.absence_requests SET status = 'APPROVED' WHERE id = $1", [anaAbsence])).error?.includes('permission denied') ?? false,
  'aprovação não pode ser forjada por UPDATE direto'
);
check(
  (await db.asUser(managerOps.authId, "SELECT public.decide_absence_request($1, 'REJECTED', '')", [anaAbsence])).error?.includes('motivo da rejeição') ?? false,
  'rejeição exige motivo'
);
check(
  !(await db.asUser(managerOps.authId, "SELECT public.decide_absence_request($1, 'CHANGES_REQUESTED', 'Indique o período exato')", [anaAbsence])).error,
  'gestor devolve o pedido para correção'
);
check((await value<string>('SELECT status AS value FROM public.absence_requests WHERE id = $1', [anaAbsence])) === 'DRAFT', 'pedido devolvido volta a rascunho');
check(!(await saveAbsence(ana.authId, vacation, await inDays(10), await inDays(12), anaAbsence)).error, 'colaborador corrige o rascunho');
await db.asUser(ana.authId, 'SELECT public.submit_absence_request($1)', [anaAbsence]);
check(!(await db.asUser(managerOps.authId, "SELECT public.decide_absence_request($1, 'APPROVED', 'Bom descanso')", [anaAbsence])).error, 'gestor aprova');
check((await notificationsOf(ana.profileId, 'ABSENCE_APPROVED')) === 1, 'colaborador notificado da aprovação');
check(
  (await value<string>('SELECT decided_by::text AS value FROM public.absence_requests WHERE id = $1', [anaAbsence])) === managerOps.profileId,
  'decisor registado'
);
const overlap = (await saveAbsence(ana.authId, vacation, await inDays(12), await inDays(13))).rows[0]?.id ?? '';
check(
  (await db.asUser(ana.authId, 'SELECT public.submit_absence_request($1)', [overlap])).error?.includes('Já existe um pedido') ?? false,
  'pedidos sobrepostos são recusados'
);
const sickRequest = (await saveAbsence(ana.authId, sick, await inDays(20), await inDays(20))).rows[0]?.id ?? '';
check(
  (await db.asUser(ana.authId, 'SELECT public.submit_absence_request($1)', [sickRequest])).error?.includes('comprovativo') ?? false,
  'doença exige comprovativo anexado'
);
const managerAbsence = (await saveAbsence(managerOps.authId, vacation, await inDays(30), await inDays(31))).rows[0]?.id ?? '';
await db.asUser(managerOps.authId, 'SELECT public.submit_absence_request($1)', [managerAbsence]);
check(
  (await db.asUser(managerOps.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [managerAbsence])).error?.includes('próprio pedido') ?? false,
  'gestor não aprova a própria ausência'
);
check((await notificationsOf(admin.profileId, 'ABSENCE_APPROVAL_REQUIRED')) === 1, 'sem gestor acima, a administração é notificada');
check(!(await db.asUser(admin.authId, "SELECT public.decide_absence_request($1, 'APPROVED')", [managerAbsence])).error, 'administração aprova a ausência do gestor');
check(
  (await db.asUser(ana.authId, "SELECT public.cancel_absence_request($1, '')", [anaAbsence])).error?.includes('motivo do cancelamento') ?? false,
  'cancelar ausência aprovada exige motivo'
);
await db.asPostgres("UPDATE public.absence_requests SET start_date = (now() AT TIME ZONE 'Africa/Maputo')::date - 1 WHERE id = $1", [managerAbsence]);
check(
  (await db.asUser(managerOps.authId, "SELECT public.cancel_absence_request($1, 'Já não vou de férias')", [managerAbsence])).error?.includes('antes de começar') ?? false,
  'ausência já iniciada não é cancelada'
);

// =============================================================================
report.section('Empresas e oportunidades');
check(
  (await db.asUser(ana.authId, "INSERT INTO public.companies (name) VALUES ('Empresa do Colaborador')")).error?.includes('row-level security') ?? false,
  'colaborador não regista empresas'
);
const company = await db.asUser<{ id: string; created_by: string }>(
  managerOps.authId,
  "INSERT INTO public.companies (name, nuit, contact_name, created_by) VALUES ('Empresa ABC', '400123456', 'João', $1) RETURNING id, created_by",
  [ana.profileId]
);
check(!company.error && company.rows[0]?.created_by === managerOps.profileId, 'gestor regista empresa (autor definido no servidor, não pelo cliente)');
const companyId = company.rows[0]?.id ?? '';
check(
  (await db.asUser(managerOps.authId, "INSERT INTO public.companies (name) VALUES ('empresa abc ')")).code === '23505',
  'empresa duplicada recusada'
);
check((await db.asUser(managerOps.authId, 'DELETE FROM public.companies WHERE id = $1', [companyId])).error?.includes('permission denied') ?? false, 'empresas não são apagadas');

const createOpportunity = (authId: string, ownerId: string | null) =>
  db.asUser<{ id: string }>(
    authId,
    "SELECT public.create_opportunity('Implementação de sistema de RH', $1, $2, 'João', '+258840000000', 'joao@abc.co.mz', 'Empresa procura sistema de RH', 'Processos manuais', 'Plataforma de RH', 500000, 650000, 'MZN', 60, NULL, 'Preparar proposta técnica', (now() + interval '5 days')::date) AS id",
    [companyId, ownerId]
  );
check((await createOpportunity(ana.authId, null)).code === '42501', 'colaborador não cria oportunidades');
check((await createOpportunity(managerOps.authId, bruno.profileId)).error?.includes('âmbito') ?? false, 'responsável fora do âmbito recusado');
const opportunity = await createOpportunity(managerOps.authId, ana.profileId);
check(!opportunity.error, `gestor regista oportunidade ${opportunity.error ?? ''}`);
const opportunityId = opportunity.rows[0]?.id ?? '';
check((await notificationsOf(ana.profileId, 'OPPORTUNITY_ASSIGNED')) === 1, 'responsável notificado da oportunidade');
check((await db.asUser(rui.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 0, 'colega não vê a oportunidade');
check((await db.asUser(managerFin.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 0, 'gestor de outro âmbito não vê a oportunidade');
check((await db.asUser(itUser.authId, 'SELECT id FROM public.companies')).rows.length === 0, 'IT não acede ao diretório comercial');
check(
  !(await db.asUser(ana.authId, "SELECT public.change_opportunity_status($1, 'QUALIFICATION')", [opportunityId])).error,
  'responsável avança a etapa'
);
check(
  (await db.asUser(ana.authId, "SELECT public.change_opportunity_status($1, 'LOST', '')", [opportunityId])).error?.includes('motivo da perda') ?? false,
  'perda exige motivo'
);
check(
  (await db.asUser(ana.authId, "SELECT public.change_opportunity_status($1, 'CANCELLED', 'Cliente desistiu')", [opportunityId])).code === '42501',
  'colaborador não cancela oportunidades'
);
check(!(await db.asUser(ana.authId, 'SELECT public.add_opportunity_member($1, $2)', [opportunityId, rui.profileId])).error, 'responsável acrescenta membro');
check((await db.asUser(rui.authId, 'SELECT id FROM public.opportunities WHERE id = $1', [opportunityId])).rows.length === 1, 'membro passa a ver a oportunidade');
check((await notificationsOf(rui.profileId, 'OPPORTUNITY_ASSIGNED')) === 1, 'membro notificado');
check(!(await db.asUser(rui.authId, "SELECT public.add_opportunity_comment($1, 'Contactei o João')", [opportunityId])).error, 'membro comenta');
check(
  (await db.asUser(rui.authId, "SELECT public.change_opportunity_status($1, 'PROPOSAL')", [opportunityId])).code === '42501',
  'membro não altera a etapa'
);
const oppEntry = await db.asUser(
  rui.authId,
  "INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, description, kind, opportunity_id) VALUES ($1, $2, $3::date, $4, '14:00', '15:00', 'Elaborar orçamento', 'OPPORTUNITY', $5)",
  [ruiPeriod, rui.profileId, today, activityId, opportunityId]
);
check(!oppEntry.error, `membro regista tempo na oportunidade ${oppEntry.error ?? ''}`);
check(
  (await db.asUser(bruno.authId, "INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, description, kind, opportunity_id) VALUES ($1, $2, $3::date, $4, '14:00', '15:00', 'Orçamento', 'OPPORTUNITY', $5)", [brunoPeriod, bruno.profileId, today, activityId, opportunityId])).error?.includes('responsável ou membro') ?? false,
  'quem não participa não regista tempo na oportunidade'
);
const oppTask = await db.asUser<{ id: string }>(
  managerOps.authId,
  "SELECT public.create_task('Preparar proposta técnica', '', 'HIGH', $1, $2::timestamptz, NULL, NULL, NULL, NULL, $3) AS id",
  [ana.profileId, inHours(96), opportunityId]
);
await db.asUser(ana.authId, 'SELECT public.start_task($1)', [oppTask.rows[0]?.id]);
const oppTaskEntry = await insertEntry(ana.authId, ana.profileId, 'TASK', 'task_id', oppTask.rows[0]?.id ?? '', '16:00', '17:00');
check(oppTaskEntry.rows[0]?.opportunity_id === opportunityId, 'tempo da tarefa herda a oportunidade (tempo por oportunidade coerente)');
check(
  (await db.asUser<{ total_minutes: number }>(managerOps.authId, "SELECT * FROM public.get_work_time_totals('OPPORTUNITY', $1)", [opportunityId])).rows.reduce((sum, row) => sum + row.total_minutes, 0) === 120,
  'tempo total dedicado à oportunidade'
);
check(!(await db.asUser(ana.authId, "SELECT public.change_opportunity_status($1, 'WON', 'Contrato assinado')", [opportunityId])).error, 'oportunidade ganha');
check(
  (await value<number>('SELECT probability AS value FROM public.opportunities WHERE id = $1', [opportunityId])) === 100,
  'ganha: probabilidade 100% e data de fecho'
);
check(
  (await db.asUser(ana.authId, "SELECT public.update_opportunity($1, 'Implementação de sistema de RH', $2, 'João', NULL, NULL, '', '', '', 500000, 700000, 'MZN', 100, NULL, NULL, NULL, '')", [opportunityId, companyId])).error?.includes('oportunidade fechada') ?? false,
  'alterar oportunidade fechada exige motivo'
);
check(
  (await db.asUser(ana.authId, "SELECT public.change_opportunity_status($1, 'QUALIFICATION', 'Reabrir')", [opportunityId])).code === '42501',
  'colaborador não reabre oportunidades fechadas'
);
check(
  !(await db.asUser(managerOps.authId, "SELECT public.change_opportunity_status($1, 'QUALIFICATION', 'Cliente pediu revisão do âmbito')", [opportunityId])).error,
  'gestor reabre oportunidade'
);
check((await db.countAudit('opportunity.won')) === 1 && (await db.countAudit('opportunity.reopened')) === 1, 'ganho e reabertura auditados');

// =============================================================================
report.section('Anexos (Storage privado)');
const register = (authId: string, entityType: string, entityId: string, mime = 'application/pdf', size = 2048) =>
  db.asUser<{ attachment_id: string; storage_path: string }>(
    authId,
    "SELECT * FROM public.register_attachment($1, $2, '../../Relatório final.pdf', $3, $4)",
    [entityType, entityId, mime, size]
  );
const registered = await register(ana.authId, 'TASK', anaTask);
check(!registered.error, `responsável reserva anexo na tarefa ${registered.error ?? ''}`);
const attachmentId = registered.rows[0]?.attachment_id ?? '';
const storagePath = registered.rows[0]?.storage_path ?? '';
check(storagePath.startsWith(`task/${anaTask}/`) && !storagePath.includes('..') && !storagePath.includes(' '), 'caminho gerado no servidor, sem o nome original por tratar');
check((await register(rui.authId, 'TASK', anaTask)).code === '42501', 'colega não anexa a tarefa alheia');
check((await register(ana.authId, 'TASK', anaTask, 'application/x-msdownload')).error?.includes('não permitido') ?? false, 'tipo de ficheiro perigoso recusado');
check((await register(ana.authId, 'TASK', anaTask, 'application/pdf', 20 * 1024 * 1024)).error?.includes('10 MB') ?? false, 'ficheiro acima de 10 MB recusado');
check(
  (await db.asUser(ana.authId, 'SELECT public.confirm_attachment($1)', [attachmentId])).error?.includes('ainda não foi carregado') ?? false,
  'não se confirma um anexo sem ficheiro'
);
const uploadAs = (authId: string, path: string) =>
  db.asUser(authId, "INSERT INTO storage.objects (bucket_id, name) VALUES ('work-attachments', $1)", [path]);
check((await uploadAs(rui.authId, storagePath)).error?.includes('row-level security') ?? false, 'outro utilizador não carrega para um caminho alheio');
check((await uploadAs(ana.authId, `task/${anaTask}/arbitrario.pdf`)).error?.includes('row-level security') ?? false, 'não se carrega para caminhos não reservados');
check(!(await uploadAs(ana.authId, storagePath)).error, 'responsável carrega o ficheiro reservado');
check(!(await db.asUser(ana.authId, 'SELECT public.confirm_attachment($1)', [attachmentId])).error, 'carregamento confirmado');
check((await db.countAudit('attachment.added')) === 1, 'anexo auditado');
check(
  (await value<number>("SELECT count(*)::int AS value FROM public.task_events WHERE task_id = $1 AND event_type = 'TASK_ATTACHMENT_ADDED'", [anaTask])) === 1,
  'anexo registado no histórico da tarefa'
);
const readObject = (authId: string) =>
  db.asUser<{ name: string }>(authId, "SELECT name FROM storage.objects WHERE bucket_id = 'work-attachments' AND name = $1", [storagePath]);
check((await readObject(ana.authId)).rows.length === 1, 'responsável lê o ficheiro (URL assinado)');
check((await readObject(managerOps.authId)).rows.length === 1, 'gestor do âmbito lê o ficheiro');
check((await readObject(rui.authId)).rows.length === 0, 'colega não lê o ficheiro (IDOR no caminho)');
check((await readObject(managerFin.authId)).rows.length === 0, 'gestor de outro âmbito não lê o ficheiro');
check((await db.asAnonymous("SELECT name FROM storage.objects WHERE bucket_id = 'work-attachments'")).rows.length === 0, 'anónimo não lê ficheiros');
check(
  (await db.asUser(rui.authId, "SELECT public.remove_attachment($1, 'Remover')", [attachmentId])).error?.includes('não encontrado') ?? false,
  'colega não remove o anexo'
);
check(
  (await db.asUser(managerOps.authId, 'SELECT public.remove_attachment($1)', [attachmentId])).error?.includes('motivo da remoção') ?? false,
  'remoção por terceiros exige motivo'
);
check(!(await db.asUser(managerOps.authId, "SELECT public.remove_attachment($1, 'Documento substituído')", [attachmentId])).error, 'gestor remove o anexo com motivo');
check((await readObject(ana.authId)).rows.length === 0, 'anexo removido deixa de estar acessível');
check(
  (await value<number>('SELECT count(*)::int AS value FROM public.attachments WHERE id = $1 AND deleted_at IS NOT NULL', [attachmentId])) === 1,
  'remoção lógica: o registo permanece para o histórico'
);
check(
  (await db.asUser(ana.authId, 'DELETE FROM public.attachments WHERE id = $1', [attachmentId])).error?.includes('permission denied') ?? false,
  'metadados de anexos não são apagados pela API'
);
const sickAttachment = await register(ana.authId, 'ABSENCE', sickRequest, 'image/jpeg', 4096);
await uploadAs(ana.authId, sickAttachment.rows[0]?.storage_path ?? '');
await db.asUser(ana.authId, 'SELECT public.confirm_attachment($1)', [sickAttachment.rows[0]?.attachment_id]);
check(!(await db.asUser(ana.authId, 'SELECT public.submit_absence_request($1)', [sickRequest])).error, 'ausência por doença submetida com comprovativo');

// =============================================================================
report.section('Calendário, eventos internos e resumos');
const calendarOf = (authId: string, scope: string) =>
  db.asUser<{ item_type: string; item_id: string; person_id: string }>(
    authId,
    "SELECT * FROM public.get_calendar_items((now() AT TIME ZONE 'Africa/Maputo')::date - 3, (now() AT TIME ZONE 'Africa/Maputo')::date + 20, $1)",
    [scope]
  );
const anaCalendar = await calendarOf(ana.authId, 'ME');
check(!anaCalendar.error, `calendário do colaborador ${anaCalendar.error ?? ''}`);
const types = new Set(anaCalendar.rows.map((row) => row.item_type));
check(['DEADLINE', 'MEETING', 'ABSENCE', 'ACTIVITY', 'OPPORTUNITY_ACTIVITY'].every((type) => types.has(type)), 'agenda reúne prazos, reuniões, ausências, atividades e oportunidades');
check(anaCalendar.rows.every((row) => row.item_type === 'MEETING' || row.item_type === 'INTERNAL_EVENT' || row.person_id === ana.profileId), 'escopo "ME" mostra apenas o próprio trabalho');
const ruiTeamCalendar = await calendarOf(rui.authId, 'TEAM');
check(!ruiTeamCalendar.rows.some((row) => row.item_type === 'ABSENCE' && row.person_id === ana.profileId), 'colega não vê ausências de outros na agenda');
const managerCalendar = await calendarOf(managerOps.authId, 'TEAM');
check(managerCalendar.rows.some((row) => row.item_type === 'ABSENCE' && row.person_id === ana.profileId), 'gestor vê a ausência aprovada da equipa');
check(!managerCalendar.rows.some((row) => row.person_id === bruno.profileId), 'gestor não vê trabalho fora do âmbito');
check(
  (await db.asUser(ana.authId, 'SELECT * FROM public.get_calendar_items(current_date, current_date + 100)')).error?.includes('máximo de 62 dias') ?? false,
  'intervalo do calendário limitado'
);
check(
  (await db.asUser(ana.authId, "INSERT INTO public.calendar_events (title, starts_at, ends_at, created_by) VALUES ('Festa', now(), now() + interval '1 hour', $1)", [ana.profileId])).error?.includes('row-level security') ?? false,
  'colaborador não cria eventos internos'
);
const opsEvent = await db.asUser<{ id: string; created_by: string }>(
  managerOps.authId,
  "INSERT INTO public.calendar_events (title, starts_at, ends_at, department_id, created_by) VALUES ('Formação de equipa', now() + interval '1 day', now() + interval '1 day 2 hours', $1, $2) RETURNING id, created_by",
  [await db.departmentId('OPS'), ana.profileId]
);
check(!opsEvent.error && opsEvent.rows[0]?.created_by === managerOps.profileId, 'gestor cria evento do departamento (autor definido no servidor)');
check((await db.asUser(ana.authId, 'SELECT id FROM public.calendar_events WHERE id = $1', [opsEvent.rows[0]?.id])).rows.length === 1, 'evento visível ao departamento');
check((await db.asUser(bruno.authId, 'SELECT id FROM public.calendar_events WHERE id = $1', [opsEvent.rows[0]?.id])).rows.length === 0, 'evento não visível a outros departamentos');
check(
  (await db.asUser(managerFin.authId, "UPDATE public.calendar_events SET title = 'Alterado' WHERE id = $1", [opsEvent.rows[0]?.id])).affectedRows === 0,
  'outro gestor não altera o evento'
);

const summary = await db.asUser<{ tasks_in_progress: number; minutes_today: number; daily_target_minutes: number; tasks_overdue: number }>(
  ana.authId,
  'SELECT * FROM public.get_my_work_summary()'
);
check(
  !summary.error && summary.rows[0]?.tasks_in_progress === 2 && summary.rows[0]?.minutes_today === 210 && summary.rows[0]?.daily_target_minutes === 480,
  'resumo do colaborador: tarefas em curso, tempo de hoje e meta diária'
);
const overview = await db.asUser<{ profile_id: string; absence_today: string | null }>(managerOps.authId, 'SELECT * FROM public.get_team_work_overview()');
const overviewIds = overview.rows.map((row) => row.profile_id);
check(overviewIds.includes(ana.profileId) && overviewIds.includes(rui.profileId) && !overviewIds.includes(bruno.profileId), 'carga de trabalho apenas da equipa do âmbito');
check((await db.asUser(ana.authId, 'SELECT * FROM public.get_team_work_overview()')).code === '42501', 'colaborador não consulta a carga da equipa');
const assignees = await db.asUser<{ profile_id: string }>(managerOps.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')");
check(
  assignees.rows.some((row) => row.profile_id === ana.profileId) && !assignees.rows.some((row) => row.profile_id === bruno.profileId || row.profile_id === inactive.profileId),
  'responsáveis possíveis = âmbito ativo do gestor'
);
check(
  (await db.asUser<{ profile_id: string }>(ana.authId, "SELECT * FROM public.list_work_people('ASSIGNEE')")).rows.map((row) => row.profile_id).join() === ana.profileId,
  'colaborador só se vê a si próprio como responsável'
);
const people = await db.asUser<{ full_name: string; is_organizer: boolean }>(rui.authId, 'SELECT * FROM public.get_meeting_people($1)', [meetingId]);
check(people.rows.length === 2 && people.rows[0]?.is_organizer === true, 'participante vê quem organiza e participa');
check(
  (await db.asUser(bruno.authId, 'SELECT * FROM public.get_meeting_people($1)', [meetingId])).error?.includes('não encontrada') ?? false,
  'não participante não lê os participantes'
);

// =============================================================================
report.section('Compatibilidade do fluxo de aprovação existente');
check(!(await db.asUser(ana.authId, 'SELECT public.submit_timesheet($1)', [anaTimesheet])).error, 'colaborador submete o período com tempo contextualizado');
check(
  (await db.asUser(ana.authId, "INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, description) VALUES ($1, $2, $3::date, $4, '18:00', '19:00', 'Depois de submeter')", [anaTimesheet, ana.profileId, today, activityId])).error !== null,
  'período submetido não aceita novos registos'
);
check(
  (await db.asUser(ana.authId, 'SELECT public.ensure_my_timesheet_period($1::date)', [today])).error?.includes('já foi submetido') ?? false,
  'novo registo num período submetido é recusado com mensagem clara'
);
const reviewEntries = await db.asUser<{ kind: string }>(managerOps.authId, 'SELECT kind FROM public.timesheet_entries WHERE timesheet_id = $1', [anaTimesheet]);
check(reviewEntries.rows.some((row) => row.kind === 'TASK') && reviewEntries.rows.some((row) => row.kind === 'UNPLANNED'), 'gestor vê o contexto do tempo antes de aprovar');
check(!(await db.asUser(managerOps.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [anaTimesheet])).error, 'aprovação do timesheet continua a funcionar');

// =============================================================================
report.section('Acesso anónimo');
for (const table of ['tasks', 'task_events', 'meetings', 'absence_requests', 'opportunities', 'companies', 'attachments', 'calendar_events', 'absence_types']) {
  check((await db.asAnonymous(`SELECT * FROM public.${table}`)).error?.includes('permission denied') ?? false, `anónimo não lê ${table}`);
}
check((await db.asAnonymous("SELECT public.create_task('Anónima')")).error?.includes('permission denied') ?? false, 'anónimo não cria tarefas');
check((await db.asAnonymous('SELECT * FROM public.get_calendar_items(current_date, current_date)')).error?.includes('permission denied') ?? false, 'anónimo não lê o calendário');
check(
  (await db.asUser(ana.authId, 'SELECT public.start_task($1)', [NOT_FOUND])).error?.includes('Tarefa não encontrada') ?? false,
  'tarefa inexistente e tarefa sem acesso têm a mesma resposta'
);

report.finish();
