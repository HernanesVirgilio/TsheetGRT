// Testes de segurança do módulo IT: RLS, fluxo dos pedidos, histórico, notificações, ativos e intervenções.
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'));
const report = new TestReport();
const check = report.check.bind(report);

const admin = await db.bootstrapAdmin('admin@siholdings-mz.com', 'Administrador');
const technician = await db.createUser(admin.authId, 'tecnico@siholdings-mz.com', 'Técnico Principal', 'IT', 'IT');
const technician2 = await db.createUser(admin.authId, 'tecnico2@siholdings-mz.com', 'Técnico Secundário', 'IT', 'IT');
const employeeA = await db.createUser(admin.authId, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
const employeeB = await db.createUser(admin.authId, 'bruno@siholdings-mz.com', 'Bruno Finanças', 'EMPLOYEE', 'FIN');
const manager = await db.createUser(admin.authId, 'gestora@siholdings-mz.com', 'Gestora Operações', 'MANAGER', 'OPS');

const categoryId = (code: string) => db.scalar<string>('SELECT id AS value FROM public.it_ticket_categories WHERE code = $1', [code]);
const hardware = await categoryId('HARDWARE');
const network = await categoryId('NETWORK');
const ticketValue = <Value>(ticketId: string, column: string) =>
  db.scalar<Value>(`SELECT ${column} AS value FROM public.it_tickets WHERE id = $1`, [ticketId]);
const notificationsOf = (profileId: string, type: string) =>
  db.scalar<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = $2', [profileId, type]);
const createTicket = (authId: string, title: string, assetId: string | null = null) =>
  db.asUser<{ id: string }>(
    authId,
    "SELECT public.create_it_ticket($1, 'Descrição detalhada do problema', $2, 'MEDIUM', $3) AS id",
    [title, hardware, assetId]
  );

// =============================================================================
report.section('Permissões e técnicos');
const technicians = await db.asUser<Record<string, unknown>>(employeeA.authId, 'SELECT * FROM public.list_it_technicians()');
check(technicians.rows.length === 3, 'técnicos = perfis com IT_TICKETS_MANAGE (2 IT + administrador)');
check(
  Object.keys(technicians.rows[0] ?? {}).sort().join(',') === 'email,full_name,job_title,profile_id',
  'diretório de técnicos expõe apenas nome, cargo e e-mail'
);
check(
  !technicians.rows.some((row) => row.profile_id === employeeA.profileId || row.profile_id === manager.profileId),
  'colaboradores e gestores não são técnicos'
);
check((await db.asUser(employeeA.authId, 'SELECT id FROM public.it_ticket_categories')).rows.length === 9, 'categorias disponíveis ao colaborador');

// =============================================================================
report.section('Colaborador: abrir e consultar pedidos');
const created = await createTicket(employeeA.authId, 'Computador não liga');
check(!created.error, `colaborador abre pedido ${created.error ?? ''}`);
const ticketA = created.rows[0]?.id ?? '';
check(/^IT-\d{4}$/.test(await ticketValue<string>(ticketA, 'reference')), 'referência legível gerada no servidor');
check((await ticketValue<string>(ticketA, 'requester_id')) === employeeA.profileId, 'solicitante = utilizador da sessão');
check(
  (await ticketValue<string>(ticketA, 'requester_department_id')) === (await db.departmentId('OPS')),
  'departamento do solicitante registado'
);
check((await ticketValue<string>(ticketA, 'status')) === 'OPEN', 'pedido nasce aberto');
check(
  (await db.scalar<number>("SELECT extract(epoch FROM (due_at - created_at))::int AS value FROM public.it_tickets WHERE id = $1", [ticketA])) === 72 * 3600,
  'prazo calculado no servidor pela prioridade (média = 72 h)'
);
check(
  (await db.scalar<string>("SELECT actor_id::text AS value FROM public.it_ticket_events WHERE ticket_id = $1 AND event_type = 'CREATED'", [ticketA])) === employeeA.profileId,
  'evento de criação com o ator da sessão'
);
check((await db.countAudit('it_ticket.created')) === 1, 'criação auditada');
check(
  (await notificationsOf(technician.profileId, 'IT_TICKET_CREATED')) === 1 && (await notificationsOf(employeeB.profileId, 'IT_TICKET_CREATED')) === 0,
  'técnicos notificados do novo pedido (colaboradores não)'
);
check(
  (await db.asUser(employeeA.authId, "INSERT INTO public.it_tickets (title, description, requester_id, category_id, due_at) VALUES ('Direto', 'Inserção direta na tabela', $1, $2, now())", [employeeA.profileId, hardware])).error?.includes('permission denied') ?? false,
  'pedido não pode ser criado por INSERT direto'
);
check(
  (await db.asUser(employeeA.authId, "SELECT public.create_it_ticket('Pedido urgente', 'Descrição detalhada', $1, 'URGENTE')", [hardware])).error?.includes('Prioridade inválida') ?? false,
  'prioridade inválida recusada'
);
check((await createTicket(employeeA.authId, 'Ab')).code === '23514', 'título demasiado curto recusado');
check((await db.asUser(employeeA.authId, 'SELECT id FROM public.it_tickets WHERE id = $1', [ticketA])).rows.length === 1, 'colaborador vê o próprio pedido');
check((await db.asUser(employeeB.authId, 'SELECT id FROM public.it_tickets WHERE id = $1', [ticketA])).rows.length === 0, 'outro colaborador não vê o pedido (ID manipulado)');
check((await db.asUser(manager.authId, 'SELECT id FROM public.it_tickets')).rows.length === 0, 'gestor sem permissões de IT não vê pedidos de terceiros');
check(
  (await db.asUser(employeeB.authId, "SELECT public.add_it_ticket_comment($1, 'Intromissão')", [ticketA])).error?.includes('não encontrado') ?? false,
  'outro colaborador não comenta o pedido'
);
check(
  (await db.asUser(employeeA.authId, "UPDATE public.it_tickets SET status = 'RESOLVED' WHERE id = $1", [ticketA])).error?.includes('permission denied') ?? false,
  'estado não pode ser alterado por UPDATE direto'
);
check((await db.asUser(employeeA.authId, 'SELECT public.take_it_ticket($1)', [ticketA])).code === '42501', 'colaborador não assume pedidos');
check(
  (await db.asUser(employeeA.authId, 'SELECT public.assign_it_ticket($1, $2)', [ticketA, employeeA.profileId])).code === '42501',
  'colaborador não atribui pedidos'
);
check(
  (await db.asUser(employeeA.authId, "SELECT public.update_it_ticket_priority($1, 'CRITICAL')", [ticketA])).code === '42501',
  'colaborador não altera a prioridade'
);
check(
  (await db.asUser(employeeA.authId, "SELECT public.add_it_ticket_comment($1, 'Nota secreta', true)", [ticketA])).error?.includes('notas internas') ?? false,
  'colaborador não regista notas internas'
);
check(
  (await db.asUser(employeeA.authId, "INSERT INTO public.it_ticket_events (ticket_id, actor_id, event_type) VALUES ($1, $2, 'RESOLVED')", [ticketA, technician.profileId])).error?.includes('permission denied') ?? false,
  'histórico não pode ser forjado (ator falso)'
);
check(
  (await db.asUser(employeeA.authId, "INSERT INTO public.it_ticket_comments (ticket_id, author_id, author_name, body) VALUES ($1, $2, 'Técnico Principal', 'Falso')", [ticketA, technician.profileId])).error?.includes('permission denied') ?? false,
  'comentário não pode ser forjado em nome de outro'
);
check(
  (await db.asUser(employeeA.authId, "INSERT INTO public.audit_events (action, entity_type, description) VALUES ('it_ticket.resolved', 'it_tickets', 'forjado')")).error?.includes('permission denied') ?? false,
  'auditoria não pode ser inserida diretamente'
);

// =============================================================================
report.section('IT: assumir, atribuir e atender');
check((await db.asUser(technician.authId, 'SELECT id FROM public.it_tickets')).rows.length === 1, 'técnico vê a fila de pedidos');
check(!(await db.asUser(technician.authId, 'SELECT public.take_it_ticket($1)', [ticketA])).error, 'técnico assume o pedido');
check(
  (await ticketValue<string>(ticketA, 'assigned_to')) === technician.profileId && (await ticketValue<string>(ticketA, 'status')) === 'IN_PROGRESS',
  'pedido atribuído e em atendimento'
);
check((await notificationsOf(employeeA.profileId, 'IT_TICKET_UPDATED')) === 1, 'colaborador notificado do técnico responsável');
check(
  (await db.asUser(technician.authId, 'SELECT public.take_it_ticket($1)', [ticketA])).error?.includes('Já é o técnico') ?? false,
  'assumir duas vezes é recusado'
);
check(
  (await db.asUser(technician.authId, 'SELECT public.assign_it_ticket($1, $2)', [ticketA, employeeB.profileId])).error?.includes('técnico de IT ativo') ?? false,
  'não é possível atribuir a quem não é técnico'
);
check(!(await db.asUser(technician.authId, 'SELECT public.assign_it_ticket($1, $2)', [ticketA, technician2.profileId])).error, 'técnico atribui a outro técnico');
check((await notificationsOf(technician2.profileId, 'IT_TICKET_ASSIGNED')) === 1, 'técnico atribuído é notificado');
check(
  (await db.asUser(technician2.authId, "SELECT public.change_it_ticket_status($1, 'WAITING_USER')", [ticketA])).error?.includes('informação') ?? false,
  'aguardar colaborador exige nota'
);
check(
  (await db.asUser(technician2.authId, "SELECT public.change_it_ticket_status($1, 'RESOLVED')", [ticketA])).error?.includes('ações próprias') ?? false,
  'transição para resolvido só pela ação própria'
);
check(
  (await db.asUser(technician2.authId, "SELECT public.change_it_ticket_status($1, 'CLOSED')", [ticketA])).error?.includes('ações próprias') ?? false,
  'transição para fechado só pela ação própria'
);
check(
  !(await db.asUser(technician2.authId, "SELECT public.change_it_ticket_status($1, 'WAITING_USER', 'Indique o modelo do computador')", [ticketA])).error,
  'técnico coloca o pedido a aguardar o colaborador'
);
check((await notificationsOf(employeeA.profileId, 'IT_TICKET_WAITING_USER')) === 1, 'colaborador notificado de que o IT aguarda resposta');
check(!(await db.asUser(employeeA.authId, "SELECT public.add_it_ticket_comment($1, 'É um Dell Latitude 5420')", [ticketA])).error, 'colaborador responde');
check((await ticketValue<string>(ticketA, 'status')) === 'IN_PROGRESS', 'resposta devolve o pedido ao atendimento');
check(
  (await notificationsOf(technician2.profileId, 'IT_TICKET_USER_REPLIED')) === 1 && (await notificationsOf(technician2.profileId, 'IT_TICKET_COMMENT')) === 0,
  'técnico notificado uma única vez da resposta'
);

check(!(await db.asUser(technician2.authId, "SELECT public.add_it_ticket_comment($1, 'Suspeita de fonte avariada', true)", [ticketA])).error, 'técnico regista nota interna');
const commentsForEmployee = await db.asUser<{ body: string }>(employeeA.authId, 'SELECT body FROM public.it_ticket_comments WHERE ticket_id = $1', [ticketA]);
check(commentsForEmployee.rows.length === 1 && !commentsForEmployee.rows.some((row) => row.body.includes('fonte')), 'colaborador não vê notas internas');
check(
  (await db.asUser<{ is_internal: boolean }>(employeeA.authId, 'SELECT is_internal FROM public.it_ticket_events WHERE ticket_id = $1', [ticketA])).rows.every((row) => !row.is_internal),
  'colaborador não vê eventos internos do histórico'
);
check((await db.asUser(technician.authId, 'SELECT id FROM public.it_ticket_comments WHERE ticket_id = $1', [ticketA])).rows.length === 2, 'técnico vê comentários e notas internas');

check(
  (await db.asUser(technician2.authId, "SELECT public.update_it_ticket_priority($1, 'CRITICAL', repeat('x', 1001))", [ticketA])).error?.includes('1000 carateres') ?? false,
  'motivo da alteração de prioridade com tamanho limitado'
);
check(!(await db.asUser(technician2.authId, "SELECT public.update_it_ticket_priority($1, 'CRITICAL', 'Bloqueia o trabalho')", [ticketA])).error, 'técnico altera a prioridade');
check(
  (await db.scalar<number>("SELECT extract(epoch FROM (due_at - created_at))::int AS value FROM public.it_tickets WHERE id = $1", [ticketA])) === 8 * 3600,
  'prazo recalculado com a nova prioridade (crítica = 8 h)'
);
check(
  (await db.asUser(technician2.authId, "SELECT public.update_it_ticket_priority($1, 'CRITICAL')", [ticketA])).error?.includes('já tem prioridade') ?? false,
  'alteração sem efeito é recusada'
);
check(!(await db.asUser(technician2.authId, 'SELECT public.update_it_ticket_category($1, $2)', [ticketA, network])).error, 'técnico altera a categoria');
const priorityEvent = await db.asPostgres<{ old_value: string; new_value: string; actor_id: string }>(
  "SELECT old_value, new_value, actor_id FROM public.it_ticket_events WHERE ticket_id = $1 AND event_type = 'PRIORITY_CHANGED'",
  [ticketA]
);
check(
  priorityEvent.rows[0]?.old_value === 'Média' && priorityEvent.rows[0]?.new_value === 'Crítica' && priorityEvent.rows[0]?.actor_id === technician2.profileId,
  'histórico com valor anterior, novo valor e autor'
);
check(
  (await db.asUser(technician.authId, 'SELECT public.take_it_ticket($1)', ['00000000-0000-4000-8000-000000000000'])).error?.includes('não encontrado') ?? false,
  'pedido inexistente: resposta "não encontrado"'
);

// =============================================================================
report.section('Ativos');
const assetInsert = await db.asUser<{ id: string; asset_tag: string }>(
  technician.authId,
  "INSERT INTO public.it_assets (asset_type, brand, model, serial_number, status, assigned_to, department_id) VALUES ('LAPTOP', 'Dell', 'Latitude 5420', 'SN-001', 'ACTIVE', $1, $2) RETURNING id, asset_tag",
  [employeeA.profileId, await db.departmentId('OPS')]
);
check(!assetInsert.error, `técnico regista equipamento ${assetInsert.error ?? ''}`);
const assetA = assetInsert.rows[0]?.id ?? '';
check(/^SI-IT-\d{4}$/.test(assetInsert.rows[0]?.asset_tag ?? ''), 'código patrimonial gerado no servidor');
check((await db.countAudit('it_asset.created')) === 1, 'registo de equipamento auditado');
check(
  (await db.asUser(employeeA.authId, "INSERT INTO public.it_assets (asset_type) VALUES ('MONITOR')")).code === '42501',
  'colaborador não regista equipamentos'
);
check(
  (await db.asUser(technician.authId, "INSERT INTO public.it_assets (asset_type, serial_number) VALUES ('MONITOR', 'SN-001')")).code === '23505',
  'número de série duplicado recusado'
);
check(
  (await db.asUser(technician.authId, "INSERT INTO public.it_assets (asset_type, status, assigned_to) VALUES ('MONITOR', 'IN_STOCK', $1)", [employeeB.profileId])).code === '23514',
  'equipamento em stock não pode ter responsável'
);
check(
  (await db.asUser(technician.authId, "INSERT INTO public.it_assets (asset_type, acquired_on) VALUES ('MONITOR', current_date + 10)")).error?.includes('futura') ?? false,
  'data de aquisição futura recusada'
);
check((await db.asUser(technician.authId, 'DELETE FROM public.it_assets WHERE id = $1', [assetA])).error?.includes('permission denied') ?? false, 'equipamentos não são apagados (abate por estado)');
check((await db.asUser(employeeA.authId, 'SELECT id FROM public.it_assets')).rows.length === 1, 'colaborador vê o equipamento que lhe está atribuído');
check((await db.asUser(employeeB.authId, 'SELECT id FROM public.it_assets')).rows.length === 0, 'outro colaborador não vê o equipamento');
check((await db.asUser(manager.authId, 'SELECT id FROM public.it_assets')).rows.length === 0, 'gestor sem permissões de IT não vê o inventário');
check(!(await createTicket(employeeA.authId, 'Teclado do portátil falha', assetA)).error, 'colaborador associa o próprio equipamento a um pedido');
check(
  (await createTicket(employeeB.authId, 'Portátil de outra pessoa', assetA)).error?.includes('Equipamento não encontrado') ?? false,
  'colaborador não associa equipamento de outra pessoa'
);
check(!(await db.asUser(technician2.authId, 'SELECT public.set_it_ticket_asset($1, $2)', [ticketA, assetA])).error, 'técnico associa o equipamento ao pedido');

// =============================================================================
report.section('Intervenções');
const intervention = await db.asUser<{ id: string }>(
  technician2.authId,
  "SELECT public.add_it_intervention($1, NULL, now(), 'Não liga', 'Substituída a fonte de alimentação', 'RESOLVED') AS id",
  [ticketA]
);
check(!intervention.error, `técnico regista intervenção ${intervention.error ?? ''}`);
const interventionRow = await db.asPostgres<{ technician_id: string; asset_id: string }>(
  'SELECT technician_id, asset_id FROM public.it_interventions WHERE id = $1',
  [intervention.rows[0]?.id]
);
check(interventionRow.rows[0]?.technician_id === technician2.profileId, 'técnico da intervenção = utilizador da sessão');
check(interventionRow.rows[0]?.asset_id === assetA, 'intervenção herda o equipamento do pedido');
check((await db.countAudit('it_intervention.created')) === 1, 'intervenção auditada');
check(
  (await db.asUser(technician2.authId, "SELECT public.add_it_intervention(NULL, NULL, now(), 'Problema', 'Trabalho feito', 'RESOLVED')")).error?.includes('pedido e/ou o equipamento') ?? false,
  'intervenção exige pedido ou equipamento'
);
check(
  (await db.asUser(technician2.authId, "SELECT public.add_it_intervention($1, NULL, now() + interval '2 days', 'Problema', 'Trabalho feito', 'RESOLVED')", [ticketA])).error?.includes('futura') ?? false,
  'intervenção com data futura recusada'
);
check(
  (await db.asUser(employeeA.authId, "SELECT public.add_it_intervention($1, NULL, now(), 'Problema', 'Trabalho feito', 'RESOLVED')", [ticketA])).code === '42501',
  'colaborador não regista intervenções'
);
check(
  (await db.asUser(employeeA.authId, "INSERT INTO public.it_interventions (ticket_id, technician_id, technician_name, problem_description, work_performed, outcome) VALUES ($1, $2, 'Falso', 'Problema', 'Trabalho', 'RESOLVED')", [ticketA, technician.profileId])).error?.includes('permission denied') ?? false,
  'intervenção não pode ser forjada por INSERT direto'
);
check((await db.asUser(employeeA.authId, 'SELECT id FROM public.it_interventions')).rows.length === 0, 'colaborador não vê o registo técnico interno');

// =============================================================================
report.section('Resolver, fechar e reabrir');
check(
  (await db.asUser(employeeA.authId, 'SELECT public.close_it_ticket($1)', [ticketA])).error?.includes('Apenas pedidos resolvidos') ?? false,
  'pedido não resolvido não pode ser fechado'
);
check(
  (await db.asUser(technician2.authId, "SELECT public.resolve_it_ticket($1, '  ')", [ticketA])).error?.includes('Descreva a resolução') ?? false,
  'resolução exige descrição'
);
check(!(await db.asUser(technician2.authId, "SELECT public.resolve_it_ticket($1, 'Fonte de alimentação substituída')", [ticketA])).error, 'técnico resolve o pedido');
check(
  (await ticketValue<string>(ticketA, 'status')) === 'RESOLVED' && (await ticketValue<string | null>(ticketA, 'resolved_at')) !== null,
  'pedido resolvido com data de resolução'
);
check((await notificationsOf(employeeA.profileId, 'IT_TICKET_RESOLVED')) === 1, 'colaborador notificado da resolução');
check(
  (await db.asUser(technician2.authId, "SELECT public.update_it_ticket_priority($1, 'LOW')", [ticketA])).error?.includes('reabra-o') ?? false,
  'pedido resolvido não é alterado sem reabertura'
);
check(
  (await db.asUser(employeeA.authId, "SELECT public.reopen_it_ticket($1, 'não')", [ticketA])).error?.includes('motivo') ?? false,
  'reabertura exige motivo'
);
check(!(await db.asUser(employeeA.authId, "SELECT public.reopen_it_ticket($1, 'Voltou a desligar-se sozinho')", [ticketA])).error, 'colaborador reabre um pedido resolvido');
check(
  (await ticketValue<string>(ticketA, 'status')) === 'IN_PROGRESS' && (await ticketValue<string | null>(ticketA, 'resolved_at')) === null,
  'reabertura devolve ao atendimento e limpa a resolução'
);
check((await notificationsOf(technician2.profileId, 'IT_TICKET_REOPENED')) === 1, 'técnico notificado da reabertura');
await db.asUser(technician2.authId, "SELECT public.resolve_it_ticket($1, 'Placa principal substituída')", [ticketA]);
check(!(await db.asUser(employeeA.authId, "SELECT public.close_it_ticket($1, 'Confirmo que está a funcionar')", [ticketA])).error, 'colaborador confirma a resolução e fecha');
check((await ticketValue<string | null>(ticketA, 'closed_at')) !== null, 'data de encerramento registada');
check((await notificationsOf(technician2.profileId, 'IT_TICKET_CLOSED')) === 1, 'técnico notificado da confirmação');
check(
  (await db.asUser(employeeA.authId, "SELECT public.reopen_it_ticket($1, 'Voltou a falhar outra vez')", [ticketA])).error?.includes('equipa de IT') ?? false,
  'colaborador não reabre um pedido fechado'
);
check(
  (await db.asUser(employeeA.authId, "SELECT public.add_it_ticket_comment($1, 'Mais uma coisa')", [ticketA])).error?.includes('fechado') ?? false,
  'pedido fechado não aceita comentários'
);
check(
  (await db.asUser(employeeB.authId, "SELECT public.reopen_it_ticket($1, 'Reabrir pedido alheio')", [ticketA])).error?.includes('não encontrado') ?? false,
  'outro colaborador não reabre o pedido'
);
check(!(await db.asUser(technician.authId, "SELECT public.reopen_it_ticket($1, 'Avaria recorrente confirmada')", [ticketA])).error, 'IT reabre um pedido fechado');
check((await ticketValue<string | null>(ticketA, 'closed_at')) === null, 'reabertura limpa a data de encerramento');
const eventTypes = await db.asPostgres<{ event_type: string }>('SELECT DISTINCT event_type FROM public.it_ticket_events WHERE ticket_id = $1', [ticketA]);
check(
  ['CREATED', 'ASSIGNED', 'STATUS_CHANGED', 'PRIORITY_CHANGED', 'CATEGORY_CHANGED', 'ASSET_CHANGED', 'COMMENTED', 'RESOLVED', 'CLOSED', 'REOPENED', 'INTERVENTION_ADDED']
    .every((type) => eventTypes.rows.some((row) => row.event_type === type)),
  'histórico regista todos os tipos de evento do fluxo'
);
check((await db.countAudit('it_ticket.reopened')) === 2, 'reaberturas auditadas');

// =============================================================================
report.section('Painel, escalada e administração');
const summary = await db.asUser<{ in_progress_count: number; critical_count: number; open_count: number; unassigned_count: number }>(
  technician.authId,
  'SELECT * FROM public.get_it_dashboard_summary()'
);
check(!summary.error && summary.rows[0]?.critical_count === 1 && summary.rows[0]?.open_count === 1, 'indicadores do painel calculados no servidor');
check((await db.asUser(employeeA.authId, 'SELECT * FROM public.get_it_dashboard_summary()')).code === '42501', 'colaborador não acede ao painel do IT');
check((await db.asUser(technician.authId, "SELECT public.set_role_permissions('IT', ARRAY['ADMIN_ACCESS'])")).code === '42501', 'técnico não altera permissões');
check(
  (await db.asUser(technician.authId, "SELECT public.update_system_settings('{\"IT_SLA_HOURS_CRITICAL\":\"1\"}'::jsonb)")).code === '42501',
  'técnico não altera os prazos do IT'
);
check(
  (await db.asUser(technician.authId, "UPDATE public.user_roles SET role_id = (SELECT id FROM public.roles WHERE code = 'ADMIN') WHERE user_id = $1", [technician.profileId])).affectedRows === 0,
  'técnico não se promove a ADMIN'
);
check((await db.asUser(technician.authId, 'SELECT id FROM public.timesheets')).rows.length === 0, 'técnico não recebe acesso global a timesheets');
check(
  (await db.asUser(admin.authId, "SELECT public.update_system_settings('{\"IT_SLA_HOURS_CRITICAL\":\"9999\"}'::jsonb)")).error?.includes('entre 1 e 2000') ?? false,
  'prazos do IT validados no servidor'
);
check((await db.asUser(admin.authId, 'SELECT id FROM public.it_tickets')).rows.length === 2, 'administrador vê todos os pedidos');
check(!(await db.asUser(admin.authId, 'SELECT public.assign_it_ticket($1, $2)', [ticketA, technician.profileId])).error, 'administrador atribui pedidos');

await db.asUser(admin.authId, 'UPDATE public.profiles SET is_active = false WHERE id = $1', [technician2.profileId]);
check(
  (await db.asUser(technician2.authId, 'SELECT public.take_it_ticket($1)', [ticketA])).code === '42501',
  'técnico desativado não opera pedidos'
);
check(
  (await db.asUser(admin.authId, 'SELECT public.assign_it_ticket($1, $2)', [ticketA, technician2.profileId])).error?.includes('técnico de IT ativo') ?? false,
  'não é possível atribuir a um técnico desativado'
);
check((await db.asUser(employeeA.authId, 'SELECT * FROM public.list_it_technicians()')).rows.length === 2, 'técnico desativado sai do diretório');

// =============================================================================
report.section('Acesso anónimo');
check((await db.asAnonymous('SELECT * FROM public.it_tickets')).error?.includes('permission denied') ?? false, 'anónimo não lê pedidos');
check((await db.asAnonymous('SELECT * FROM public.it_assets')).error?.includes('permission denied') ?? false, 'anónimo não lê equipamentos');
check((await db.asAnonymous('SELECT * FROM public.list_it_technicians()')).error?.includes('permission denied') ?? false, 'anónimo não lê o diretório de técnicos');
check(
  (await db.asAnonymous("SELECT public.create_it_ticket('Pedido anónimo', 'Descrição detalhada', NULL, 'LOW')")).error?.includes('permission denied') ?? false,
  'anónimo não abre pedidos'
);

report.finish();
