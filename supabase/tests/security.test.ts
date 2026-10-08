// Testes de segurança da base de dados: RLS, funções do servidor, âmbito de gestão e auditoria.
// Executar com: npm run test:db
import { join } from 'node:path';
import { TestDatabase, TestReport } from './harness';

const db = await TestDatabase.create(join(import.meta.dirname, '..', 'migrations'));
const report = new TestReport();
const check = report.check.bind(report);

const ROLE_ID = (code: string) => `(SELECT id FROM public.roles WHERE code = '${code}')`;

async function departmentId(code: string): Promise<string> {
  return db.scalar<string>('SELECT id AS value FROM public.departments WHERE code = $1', [code]);
}

async function createUser(adminAuth: string, email: string, name: string, role: string, departmentCode: string) {
  const authId = await db.createAuthUser(email);
  const result = await db.asUser<{ id: string }>(
    adminAuth,
    'SELECT public.create_user_profile($1, $2, $3, $4, $5) AS id',
    [authId, name, email, role, await departmentId(departmentCode)]
  );
  if (result.error) throw new Error(`Falha ao criar ${email}: ${result.error}`);
  return { authId, profileId: result.rows[0].id };
}

async function countAudit(action: string): Promise<number> {
  return db.scalar<number>('SELECT count(*)::int AS value FROM public.audit_events WHERE action = $1', [action]);
}

// =============================================================================
report.section('Seed');
check((await db.scalar<number>('SELECT count(*)::int AS value FROM public.permissions')) === 30, '30 permissões');
check((await db.scalar<number>('SELECT count(*)::int AS value FROM public.profiles')) === 0, 'seed não cria utilizadores');

// =============================================================================
report.section('Primeiro administrador');
check(
  (await db.asPostgres("SELECT public.bootstrap_first_admin('ninguem@siholdings-mz.com', 'X')")).error?.includes('Convide primeiro') ?? false,
  'bootstrap recusa e-mail sem conta Auth'
);
const adminAuth = await db.createAuthUser('admin@siholdings-mz.com');
const boot = await db.asPostgres<{ id: string }>("SELECT public.bootstrap_first_admin('Admin@SIHoldings-mz.com', 'Administrador') AS id");
check(!boot.error, 'bootstrap cria o administrador');
const adminProfileId = boot.rows[0]?.id;
check(
  (await db.asPostgres("SELECT public.bootstrap_first_admin('admin@siholdings-mz.com', 'Outro')")).error?.includes('Já existe') ?? false,
  'bootstrap recusa segundo administrador'
);
check(
  (await db.asUser(adminAuth, "SELECT public.bootstrap_first_admin('x@y.com', 'X')")).error?.includes('permission denied') ?? false,
  'bootstrap não é executável pela API'
);

// =============================================================================
report.section('Criação de utilizadores');
const it = await createUser(adminAuth, 'it@siholdings-mz.com', 'Técnico IT', 'IT', 'IT');
const managerA = await createUser(adminAuth, 'gestor.ops@siholdings-mz.com', 'Gestora Operações', 'MANAGER', 'OPS');
const managerB = await createUser(adminAuth, 'gestor.fin@siholdings-mz.com', 'Gestor Finanças', 'MANAGER', 'FIN');
const employeeOps = await createUser(adminAuth, 'ana@siholdings-mz.com', 'Ana Operações', 'EMPLOYEE', 'OPS');
const employeeOps2 = await createUser(adminAuth, 'bruno@siholdings-mz.com', 'Bruno Operações', 'EMPLOYEE', 'OPS');
const employeeFin = await createUser(adminAuth, 'carla@siholdings-mz.com', 'Carla Finanças', 'EMPLOYEE', 'FIN');
check(/^SIH-\d{4}$/.test(await db.scalar<string>('SELECT employee_number AS value FROM public.profiles WHERE id = $1', [it.profileId])), 'nº de colaborador gerado no servidor');
check(
  (await db.asUser(adminAuth, "SELECT public.create_user_profile(NULL, 'Dup', 'it@siholdings-mz.com', 'EMPLOYEE', $1)", [await departmentId('OPS')])).code === '23505',
  'e-mail duplicado rejeitado'
);
check(
  (await db.asUser(employeeOps.authId, "SELECT public.create_user_profile(NULL, 'Intruso', 'i@x.com', 'ADMIN', $1)", [await departmentId('OPS')])).code === '42501',
  'colaborador não cria utilizadores'
);
check((await countAudit('user.created')) === 7, 'criação auditada com o administrador como ator');

// =============================================================================
report.section('Perfis e funções administrativas');
check(
  (await db.asUser(employeeOps.authId, "UPDATE public.profiles SET phone = '+258 84 000 0000' WHERE id = $1", [employeeOps.profileId])).affectedRows === 1,
  'colaborador altera o próprio telefone'
);
check(
  (await db.asUser(employeeOps.authId, "UPDATE public.profiles SET full_name = 'Outro' WHERE id = $1", [employeeOps.profileId])).code === '42501',
  'colaborador não altera dados institucionais'
);
check(
  (await db.asUser(adminAuth, 'UPDATE public.profiles SET is_active = false WHERE id = $1', [adminProfileId])).error?.includes('própria conta') ?? false,
  'admin não desativa a própria conta'
);
check(
  (await db.asUser(adminAuth, `UPDATE public.user_roles SET role_id = ${ROLE_ID('EMPLOYEE')} WHERE user_id = $1`, [adminProfileId])).error?.includes('administrador ativo') ?? false,
  'último administrador não perde o perfil'
);
check(
  (await db.asPostgres('DELETE FROM auth.users WHERE id = $1', [adminAuth])).error?.includes('administrador ativo') ?? false,
  'conta Auth do último administrador não pode ser removida'
);
check(
  (await db.asUser(adminAuth, "SELECT public.set_role_permissions('ADMIN', ARRAY['SELF_ACCESS'])")).error?.includes('ADMIN') ?? false,
  'perfil ADMIN imutável'
);
check(
  (await db.asUser(adminAuth, "SELECT public.update_system_settings('{\"TIMESHEET_DAILY_TARGET_HOURS\":\"20\"}'::jsonb)")).error?.includes('entre 1 e 12') ?? false,
  'configurações validadas no servidor'
);
check(
  (await db.asUser(it.authId, `UPDATE public.profiles SET phone = '1' WHERE id = $1`, [employeeOps.profileId])).affectedRows === 0,
  'IT (só leitura) não altera utilizadores'
);

// =============================================================================
report.section('Âmbitos de gestão (manager_scopes)');
const assignOps = await db.asUser(adminAuth, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [managerA.profileId, await departmentId('OPS')]);
check(!assignOps.error, 'admin atribui departamento OPS à gestora A');
const assignEmployee = await db.asUser(adminAuth, 'INSERT INTO public.manager_scopes (manager_id, employee_id) VALUES ($1, $2)', [managerB.profileId, employeeFin.profileId]);
check(!assignEmployee.error, 'admin atribui colaboradora específica ao gestor B');
check((await countAudit('manager_scope.assigned')) === 2, 'atribuições de âmbito auditadas');
check(
  (await db.asUser(adminAuth, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [employeeOps.profileId, await departmentId('FIN')])).error?.includes('perfil MANAGER') ?? false,
  'âmbito só pode ser atribuído a gestores'
);
check(
  (await db.asUser(adminAuth, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [managerA.profileId, await departmentId('OPS')])).code === '23505',
  'âmbito duplicado é rejeitado'
);
check(
  (await db.asUser(managerA.authId, 'INSERT INTO public.manager_scopes (manager_id, department_id) VALUES ($1, $2)', [managerA.profileId, await departmentId('FIN')])).code === '42501',
  'gestora A não aumenta o próprio âmbito'
);
check(
  (await db.asUser(managerA.authId, 'DELETE FROM public.manager_scopes WHERE manager_id = $1', [managerA.profileId])).affectedRows === 0,
  'gestora A não remove o próprio âmbito'
);
const scopesSeenByA = await db.asUser<{ manager_id: string }>(managerA.authId, 'SELECT manager_id FROM public.manager_scopes');
check(scopesSeenByA.rows.length === 1 && scopesSeenByA.rows[0].manager_id === managerA.profileId, 'gestora A vê apenas o próprio âmbito');

// =============================================================================
report.section('Equipa e isolamento entre gestores');
const teamA = await db.asUser<{ id: string }>(managerA.authId, 'SELECT id FROM public.my_team_members ORDER BY full_name');
check(
  teamA.rows.length === 2 && teamA.rows.every((row) => [employeeOps.profileId, employeeOps2.profileId].includes(row.id)),
  'equipa da gestora A = colaboradores de OPS (sem a própria)'
);
const teamB = await db.asUser<{ id: string }>(managerB.authId, 'SELECT id FROM public.my_team_members');
check(teamB.rows.length === 1 && teamB.rows[0].id === employeeFin.profileId, 'equipa do gestor B = colaboradora atribuída');
check(
  (await db.asUser(managerA.authId, 'SELECT id FROM public.profiles WHERE id = $1', [employeeFin.profileId])).rows.length === 0,
  'gestora A não lê perfil fora do âmbito (ID manipulado)'
);
check(
  (await db.asUser(managerA.authId, 'SELECT id FROM public.profiles WHERE id = $1', [managerB.profileId])).rows.length === 0,
  'gestora A não lê o gestor B'
);
check(
  (await db.asUser(employeeOps.authId, 'SELECT id FROM public.my_team_members')).rows.length === 0,
  'colaborador não tem equipa'
);

// =============================================================================
report.section('Fluxo do colaborador (Meu Timesheet)');
const createTimesheet = async (authId: string, profileId: string, start: string, end: string) => {
  const result = await db.asUser<{ id: string }>(
    authId,
    'INSERT INTO public.timesheets (employee_id, period_start, period_end) VALUES ($1, $2, $3) RETURNING id',
    [profileId, start, end]
  );
  if (result.error) throw new Error(result.error);
  return result.rows[0].id;
};
const activityId = await db.scalar<string>("SELECT id AS value FROM public.activities WHERE code = 'ACT-OPS-01'");
const addEntry = (authId: string, profileId: string, timesheetId: string, date: string) =>
  db.asUser(
    authId,
    `INSERT INTO public.timesheet_entries (timesheet_id, employee_id, work_date, activity_id, start_time, end_time, break_minutes, description, total_minutes)
     VALUES ($1, $2, $3, $4, '08:00', '17:00', 60, 'Trabalho', 1)`,
    [timesheetId, profileId, date, activityId]
  );

check(
  (await db.asUser(employeeOps.authId, "INSERT INTO public.timesheets (employee_id, period_start, period_end, status) VALUES ($1, '2026-09-01', '2026-09-30', 'APPROVED')", [employeeOps.profileId])).error !== null,
  'timesheet não pode nascer aprovado'
);
check(
  (await db.asUser(employeeOps.authId, "INSERT INTO public.timesheets (employee_id, period_start, period_end) VALUES ($1, '2026-09-01', '2026-09-30')", [employeeOps2.profileId])).error !== null,
  'colaborador não cria timesheets para outros'
);
const timesheetAna = await createTimesheet(employeeOps.authId, employeeOps.profileId, '2026-10-01', '2026-10-31');
check((await db.asUser(employeeOps.authId, 'SELECT public.submit_timesheet($1)', [timesheetAna])).error?.includes('sem registos') ?? false, 'submissão sem registos é recusada');
check(!(await addEntry(employeeOps.authId, employeeOps.profileId, timesheetAna, '2026-10-05')).error, 'colaborador lança horas');
check(
  (await db.scalar<number>('SELECT total_minutes AS value FROM public.timesheet_entries WHERE timesheet_id = $1', [timesheetAna])) === 480,
  'total de minutos calculado no servidor (ignora o valor do cliente)'
);
check((await addEntry(employeeOps.authId, employeeOps.profileId, timesheetAna, '2026-11-05')).error?.includes('fora do período') ?? false, 'registo fora do período rejeitado');
check(
  (await db.asUser(employeeOps.authId, "UPDATE public.timesheets SET status = 'SUBMITTED' WHERE id = $1", [timesheetAna])).error?.includes('permission denied') ?? false,
  'estado não pode ser alterado por UPDATE direto'
);
check(
  (await db.asUser(employeeOps2.authId, 'SELECT public.submit_timesheet($1)', [timesheetAna])).error?.includes('não encontrado') ?? false,
  'colaborador não submete timesheet de outro'
);
check(!(await db.asUser(employeeOps.authId, 'SELECT public.submit_timesheet($1)', [timesheetAna])).error, 'colaborador submete o próprio timesheet');
check((await addEntry(employeeOps.authId, employeeOps.profileId, timesheetAna, '2026-10-06')).error !== null, 'timesheet submetido fica bloqueado para edição');
check(
  (await db.scalar<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = 'APPROVAL_REQUIRED'", [managerA.profileId])) === 1,
  'gestora do âmbito é notificada da submissão'
);
check(
  (await db.scalar<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1", [managerB.profileId])) === 0,
  'gestor fora do âmbito não é notificado'
);

// =============================================================================
report.section('Leitura de timesheets por âmbito');
check((await db.asUser(managerA.authId, 'SELECT id FROM public.timesheets WHERE id = $1', [timesheetAna])).rows.length === 1, 'gestora A lê timesheet da equipa');
check((await db.asUser(managerB.authId, 'SELECT id FROM public.timesheets WHERE id = $1', [timesheetAna])).rows.length === 0, 'gestor B não lê timesheet fora do âmbito (REPORTS_READ já não é global)');
check((await db.asUser(managerB.authId, 'SELECT id FROM public.timesheet_entries WHERE timesheet_id = $1', [timesheetAna])).rows.length === 0, 'gestor B não lê os registos de horas');
check((await db.asUser(it.authId, 'SELECT id FROM public.timesheets')).rows.length === 0, 'IT não lê timesheets');
check((await db.asUser(adminAuth, 'SELECT id FROM public.timesheets')).rows.length === 1, 'admin lê todos os timesheets');

// =============================================================================
report.section('Decisão: rejeição e aprovação');
check(
  (await db.asUser(managerB.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetAna])).error?.includes('fora do seu âmbito') ?? false,
  'gestor B não aprova fora do âmbito'
);
check(
  (await db.asUser(employeeOps2.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetAna])).code === '42501',
  'colaborador não aprova'
);
check(
  (await db.asUser(managerA.authId, "UPDATE public.timesheets SET status = 'APPROVED' WHERE id = $1", [timesheetAna])).error?.includes('permission denied') ?? false,
  'gestora não aprova por UPDATE direto'
);
check(
  (await db.asUser(managerA.authId, "INSERT INTO public.timesheet_approvals (timesheet_id, approver_id, status) VALUES ($1, $2, 'APPROVED')", [timesheetAna, managerA.profileId])).error?.includes('permission denied') ?? false,
  'gestora não fabrica registos de aprovação'
);
check(
  (await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'REJECTED', '   ')", [timesheetAna])).error?.includes('exige um motivo') ?? false,
  'rejeição sem motivo é recusada'
);
check(!(await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'REJECTED', 'Falta o dia 6')", [timesheetAna])).error, 'gestora rejeita com motivo');
const rejected = await db.asPostgres<{ status: string; rejection_reason: string; rejected_by: string }>(
  'SELECT status, rejection_reason, rejected_by FROM public.timesheets WHERE id = $1',
  [timesheetAna]
);
check(
  rejected.rows[0]?.status === 'REJECTED' && rejected.rows[0].rejection_reason === 'Falta o dia 6' && rejected.rows[0].rejected_by === managerA.profileId,
  'motivo e autor da rejeição persistidos'
);
check(
  (await db.scalar<string>("SELECT description AS value FROM public.audit_events WHERE action = 'timesheet.rejected'")).includes('Falta o dia 6'),
  'rejeição auditada com o motivo'
);
check(
  (await db.scalar<number>("SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1 AND type = 'TIMESHEET_REJECTED'", [employeeOps.profileId])) === 1,
  'colaborador é notificado da rejeição'
);
check(
  (await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetAna])).error?.includes('estado atual: rejeitado') ?? false,
  'timesheet rejeitado não pode ser aprovado sem nova submissão'
);
check(!(await addEntry(employeeOps.authId, employeeOps.profileId, timesheetAna, '2026-10-06')).error, 'timesheet rejeitado volta a ser editável');
await db.asUser(employeeOps.authId, 'SELECT public.submit_timesheet($1)', [timesheetAna]);
check(!(await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED', 'Conforme')", [timesheetAna])).error, 'gestora aprova após nova submissão');
check(
  (await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetAna])).error?.includes('estado atual: aprovado') ?? false,
  'timesheet aprovado não pode ser decidido de novo'
);
check(
  (await db.scalar<number>('SELECT count(*)::int AS value FROM public.timesheet_approvals WHERE timesheet_id = $1', [timesheetAna])) === 2,
  'histórico de decisões registado (rejeição + aprovação)'
);

const timesheetManagerA = await createTimesheet(managerA.authId, managerA.profileId, '2026-10-01', '2026-10-31');
await addEntry(managerA.authId, managerA.profileId, timesheetManagerA, '2026-10-05');
await db.asUser(managerA.authId, 'SELECT public.submit_timesheet($1)', [timesheetManagerA]);
check(
  (await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetManagerA])).error?.includes('próprio timesheet') ?? false,
  'gestora não aprova o próprio timesheet'
);

// =============================================================================
report.section('Aprovação em massa');
const timesheetBruno = await createTimesheet(employeeOps2.authId, employeeOps2.profileId, '2026-10-01', '2026-10-31');
await addEntry(employeeOps2.authId, employeeOps2.profileId, timesheetBruno, '2026-10-07');
await db.asUser(employeeOps2.authId, 'SELECT public.submit_timesheet($1)', [timesheetBruno]);
const timesheetCarla = await createTimesheet(employeeFin.authId, employeeFin.profileId, '2026-10-01', '2026-10-31');
await addEntry(employeeFin.authId, employeeFin.profileId, timesheetCarla, '2026-10-07');
await db.asUser(employeeFin.authId, 'SELECT public.submit_timesheet($1)', [timesheetCarla]);

const bulk = await db.asUser<{ timesheet_id: string; approved: boolean; message: string }>(
  managerA.authId,
  'SELECT * FROM public.approve_timesheets($1)',
  [[timesheetBruno, timesheetCarla, timesheetAna, timesheetManagerA]]
);
const bulkById = new Map(bulk.rows.map((row) => [row.timesheet_id, row]));
check(!bulk.error && bulk.rows.length === 4, 'aprovação em massa devolve resultado por timesheet');
check(bulkById.get(timesheetBruno)?.approved === true, 'timesheet da equipa aprovado');
check(bulkById.get(timesheetCarla)?.approved === false && (bulkById.get(timesheetCarla)?.message.includes('fora do seu âmbito') ?? false), 'timesheet fora do âmbito recusado com motivo');
check(bulkById.get(timesheetAna)?.approved === false && (bulkById.get(timesheetAna)?.message.includes('aprovado') ?? false), 'timesheet já aprovado recusado com motivo');
check(bulkById.get(timesheetManagerA)?.approved === false, 'próprio timesheet recusado na aprovação em massa');
check((await db.scalar<string>("SELECT status AS value FROM public.timesheets WHERE id = $1", [timesheetCarla])) === 'SUBMITTED', 'falhas parciais não alteram os restantes');
check((await countAudit('timesheet.bulk_approved')) === 1, 'aprovação em massa auditada');
check(!(await db.asUser(managerB.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetCarla])).error, 'gestor B aprova a colaboradora atribuída');

// =============================================================================
report.section('Âmbito por departamento: apenas colaboradores (EMPLOYEE)');
const managerC = await createUser(adminAuth, 'gestor.ops2@siholdings-mz.com', 'Gestor Operações 2', 'MANAGER', 'OPS');
const adminOps = await createUser(adminAuth, 'admin.ops@siholdings-mz.com', 'Admin Operações', 'ADMIN', 'OPS');
const teamAfter = await db.asUser<{ id: string }>(managerA.authId, 'SELECT id FROM public.my_team_members');
check(
  teamAfter.rows.length === 2 && teamAfter.rows.every((row) => [employeeOps.profileId, employeeOps2.profileId].includes(row.id)),
  'equipa por departamento exclui outro MANAGER e ADMIN do mesmo departamento'
);
check((await db.asUser(managerA.authId, 'SELECT id FROM public.profiles WHERE id = $1', [managerC.profileId])).rows.length === 0, 'gestora A não lê outro gestor do departamento (ID manipulado)');
check((await db.asUser(managerA.authId, 'SELECT id FROM public.profiles WHERE id = $1', [adminOps.profileId])).rows.length === 0, 'gestora A não lê administrador do departamento (ID manipulado)');

const notificationsBefore = await db.scalar<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1', [managerA.profileId]);
const timesheetManagerC = await createTimesheet(managerC.authId, managerC.profileId, '2026-10-01', '2026-10-31');
await addEntry(managerC.authId, managerC.profileId, timesheetManagerC, '2026-10-05');
await db.asUser(managerC.authId, 'SELECT public.submit_timesheet($1)', [timesheetManagerC]);
check(
  (await db.scalar<number>('SELECT count(*)::int AS value FROM public.notifications WHERE user_id = $1', [managerA.profileId])) === notificationsBefore,
  'submissão de outro gestor do departamento não notifica a gestora A'
);
check((await db.asUser(managerA.authId, 'SELECT id FROM public.timesheets WHERE id = $1', [timesheetManagerC])).rows.length === 0, 'gestora A não lê o timesheet de outro gestor (ID manipulado)');
check((await db.asUser(managerA.authId, 'SELECT id FROM public.timesheet_entries WHERE timesheet_id = $1', [timesheetManagerC])).rows.length === 0, 'gestora A não lê os registos de outro gestor');
check(
  (await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetManagerC])).error?.includes('fora do seu âmbito') ?? false,
  'gestora A não decide o timesheet de outro gestor'
);
check(
  ((await db.asUser<{ approved: boolean }>(managerA.authId, 'SELECT * FROM public.approve_timesheets($1)', [[timesheetManagerC]])).rows[0]?.approved ?? true) === false,
  'aprovação em massa também recusa outro gestor'
);

check(
  (await db.asUser(adminAuth, 'INSERT INTO public.manager_scopes (manager_id, employee_id) VALUES ($1, $2)', [managerA.profileId, adminOps.profileId])).error?.includes('administrador não pode') ?? false,
  'um ADMIN não pode ser atribuído explicitamente ao âmbito'
);
check(
  !(await db.asUser(adminAuth, 'INSERT INTO public.manager_scopes (manager_id, employee_id) VALUES ($1, $2)', [managerA.profileId, managerC.profileId])).error,
  'outro gestor pode ser atribuído por regra explícita'
);
check((await db.asUser(managerA.authId, 'SELECT id FROM public.my_team_members WHERE id = $1', [managerC.profileId])).rows.length === 1, 'gestor atribuído explicitamente entra na equipa');
check(!(await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetManagerC])).error, 'gestora A decide o timesheet do gestor atribuído explicitamente');
await db.asUser(adminAuth, `UPDATE public.user_roles SET role_id = ${ROLE_ID('ADMIN')} WHERE user_id = $1`, [managerC.profileId]);
check((await db.asUser(managerA.authId, 'SELECT id FROM public.profiles WHERE id = $1', [managerC.profileId])).rows.length === 0, 'colaborador promovido a ADMIN sai do âmbito, mesmo com atribuição explícita');

// =============================================================================
report.section('Quem decidiu: leitura limitada para o colaborador');
const decisionsForAna = await db.asUser<Record<string, unknown>>(employeeOps.authId, 'SELECT * FROM public.get_timesheet_decisions($1)', [timesheetAna]);
check(
  decisionsForAna.rows.length === 2 && decisionsForAna.rows.every((row) => row.reviewer_name === 'Gestora Operações'),
  'colaborador vê o nome do gestor responsável por cada decisão'
);
check(
  Object.keys(decisionsForAna.rows[0] ?? {}).sort().join(',') ===
    'comment,created_at,decision_id,reviewer_email,reviewer_job_title,reviewer_name,status',
  'apenas nome, cargo e e-mail do gestor são expostos'
);
check(decisionsForAna.rows[0]?.reviewer_email === 'gestor.ops@siholdings-mz.com', 'e-mail institucional do gestor disponível');
check((await db.asUser(employeeOps.authId, 'SELECT id FROM public.profiles WHERE id = $1', [managerA.profileId])).rows.length === 0, 'colaborador continua sem acesso ao perfil do gestor');
check((await db.asUser(employeeOps.authId, 'SELECT * FROM public.get_timesheet_decisions($1)', [timesheetBruno])).rows.length === 0, 'colaborador não vê decisões de timesheets de outros (ID manipulado)');
check((await db.asUser(managerB.authId, 'SELECT * FROM public.get_timesheet_decisions($1)', [timesheetAna])).rows.length === 0, 'gestor fora do âmbito não vê as decisões');
check((await db.asUser(managerA.authId, 'SELECT * FROM public.get_timesheet_decisions($1)', [timesheetAna])).rows.length === 2, 'gestora do âmbito vê as decisões');
check((await db.asAnonymous("SELECT * FROM public.get_timesheet_decisions('00000000-0000-0000-0000-000000000000')")).error?.includes('permission denied') ?? false, 'anónimo não executa a leitura de decisões');

// =============================================================================
report.section('Auditoria e operações proibidas ao gestor');
const auditA = await db.asUser<{ action: string; entity_id: string | null }>(managerA.authId, 'SELECT action, entity_id FROM public.audit_events');
check(auditA.rows.length > 0 && auditA.rows.every((row) => row.action.startsWith('timesheet.')), 'gestora A lê apenas a auditoria de timesheets');
check(auditA.rows.every((row) => row.entity_id !== timesheetCarla && row.entity_id !== timesheetManagerA), 'auditoria limitada à equipa (sem a do gestor B nem a própria)');
check(
  (await db.asUser(managerA.authId, "INSERT INTO public.audit_events (action, entity_type, description) VALUES ('timesheet.approved', 'timesheets', 'forjado')")).error?.includes('permission denied') ?? false,
  'gestora não fabrica eventos de auditoria'
);
check(
  (await db.asUser(managerA.authId, "SELECT public.log_auth_event('timesheet.approved')")).error?.includes('inválido') ?? false,
  'log_auth_event não serve para forjar outros eventos'
);
check(
  (await db.asUser(managerA.authId, `UPDATE public.user_roles SET role_id = ${ROLE_ID('ADMIN')} WHERE user_id = $1`, [managerA.profileId])).affectedRows === 0,
  'gestora não altera o próprio perfil de acesso'
);
check(
  (await db.asUser(managerA.authId, `INSERT INTO public.user_roles (user_id, role_id) VALUES ($1, ${ROLE_ID('ADMIN')})`, [employeeOps.profileId])).error !== null,
  'gestora não atribui ADMIN'
);
check((await db.asUser(managerA.authId, "SELECT public.set_role_permissions('MANAGER', ARRAY['USERS_READ'])")).code === '42501', 'gestora não altera permissões');
check(
  (await db.asUser(managerA.authId, "SELECT public.update_system_settings('{\"COMPANY_NAME\":\"X\"}'::jsonb)")).code === '42501',
  'gestora não altera configurações'
);
check(
  (await db.asUser(managerA.authId, "UPDATE public.profiles SET job_title = 'Chefe' WHERE id = $1", [employeeOps.profileId])).affectedRows === 0,
  'gestora não altera dados administrativos da equipa'
);
check(
  (await db.asUser(managerA.authId, "UPDATE public.departments SET name = 'X' WHERE code = 'OPS'")).affectedRows === 0,
  'gestora não altera departamentos'
);

// =============================================================================
report.section('Contas desativadas e acesso anónimo');
await db.asUser(adminAuth, 'UPDATE public.profiles SET is_active = false WHERE id = $1', [managerA.profileId]);
check((await db.asUser(managerA.authId, 'SELECT id FROM public.my_team_members')).rows.length === 0, 'gestora desativada perde a equipa');
check(
  (await db.asUser(managerA.authId, "SELECT public.review_timesheet($1, 'APPROVED')", [timesheetCarla])).code === '42501',
  'gestora desativada não decide timesheets'
);
await db.asUser(adminAuth, 'UPDATE public.profiles SET is_active = true WHERE id = $1', [managerA.profileId]);
check((await db.asAnonymous('SELECT * FROM public.departments')).error?.includes('permission denied') ?? false, 'anónimo não lê tabelas');
check((await db.asAnonymous('SELECT * FROM public.my_team_members')).error?.includes('permission denied') ?? false, 'anónimo não lê a vista da equipa');

report.finish();
