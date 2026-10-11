// Testes das regras puras de entrada e navegação: acesso por rota, escolha do dashboard,
// destino das notificações e secções do menu lateral. A autorização efetiva continua na RLS.
import { canAccessPath, requiredPermissionFor, ROUTE_PERMISSIONS } from '../lib/auth/routeAccess';
import { firstName, greetingFor, selectDashboard } from '../utils/dashboard';
import { resolveNotificationTarget } from '../utils/notifications';
import { findActiveSection, isNavigationItemActive, parseOpenSections } from '../utils/navigation';
import type { PermissionCode } from '../types';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

function permissionsOf(...codes: PermissionCode[]): (permission: PermissionCode) => boolean {
  return (permission) => codes.includes(permission);
}

console.log('\nAcesso por rota');
assert(requiredPermissionFor('/dashboard') === null && requiredPermissionFor('/notifications') === null, 'dashboard, perfil e notificações abertos a qualquer conta');
assert(requiredPermissionFor('/timesheet/tasks/abc-123') === 'TIMESHEET_TASK_READ', 'rota com parâmetro resolve a permissão');
assert(requiredPermissionFor('/timesheet/absences?tab=TEAM') === 'TIMESHEET_ABSENCE_CREATE', 'parâmetros de pesquisa ignorados');
assert(requiredPermissionFor('/timesheet') === 'TIMESHEET_TASK_READ' && requiredPermissionFor('/timesheet/reports') === 'TEAM_READ', 'rotas aninhadas distinguidas');
assert(requiredPermissionFor('/nao-existe') === undefined && requiredPermissionFor('/403') === undefined, 'rotas desconhecidas não têm permissão');
const employee = permissionsOf('SELF_TIMESHEET_READ', 'IT_TICKET_CREATE', 'TIMESHEET_TASK_READ');
assert(canAccessPath('/timesheets', employee) && canAccessPath('/support/xyz', employee), 'colaborador abre o timesheet e os pedidos de suporte');
assert(!canAccessPath('/users', employee) && !canAccessPath('/it/tickets', employee), 'colaborador não abre administração nem a fila do IT');
assert(!canAccessPath('/nao-existe', employee) && !canAccessPath('/reset-password', employee), 'rotas desconhecidas nunca são destino de regresso');
assert(Object.keys(ROUTE_PERMISSIONS).every((path) => path.startsWith('/')), 'todas as rotas protegidas são caminhos internos');

console.log('\nDashboard inicial');
const all = () => true;
assert(selectDashboard('ADMIN', all) === 'ADMIN' && selectDashboard('IT', all) === 'IT', 'administração e IT recebem o seu painel');
assert(selectDashboard('MANAGER', all) === 'MANAGER' && selectDashboard('GESTOR', all) === 'GESTOR', 'Manager e gestor recebem o seu painel');
assert(selectDashboard('EMPLOYEE', permissionsOf('TIMESHEET_TASK_READ')) === 'WORK', 'colaborador recebe o centro de trabalho');
assert(selectDashboard('IT', permissionsOf('TIMESHEET_TASK_READ')) === 'WORK', 'perfil sem a permissão do seu painel recebe o centro de trabalho');
assert(selectDashboard('ADMIN', permissionsOf('SELF_ACCESS')) === 'START', 'o perfil sozinho não abre o painel de administração');
assert(selectDashboard(null, permissionsOf('SELF_ACCESS', 'SELF_PROFILE_READ')) === 'START', 'conta sem perfil recebe a página inicial em vez de um erro');
assert(greetingFor(new Date(2026, 9, 11, 9)) === 'Bom dia' && greetingFor(new Date(2026, 9, 11, 15)) === 'Boa tarde' && greetingFor(new Date(2026, 9, 11, 21)) === 'Boa noite', 'saudação segundo a hora');
assert(firstName('  Ana Maria Sitoe ') === 'Ana', 'primeiro nome para a saudação');

console.log('\nDestino das notificações');
const gestor = permissionsOf('TIMESHEET_TASK_READ', 'TEAM_TIMESHEET_REVIEW', 'TIMESHEET_ABSENCE_CREATE', 'IT_TICKET_CREATE');
const canOpen = (permission: (code: PermissionCode) => boolean) => (path: string) => canAccessPath(path, permission);
assert(resolveNotificationTarget({ type: 'TASK_ASSIGNED', link: '/timesheet/tasks/abc' }, canOpen(gestor)) === '/timesheet/tasks/abc', 'ligação registada no servidor tem prioridade');
assert(resolveNotificationTarget({ type: 'TASK_ASSIGNED', link: null }, canOpen(gestor)) === '/timesheet/tasks', 'tarefa sem ligação abre a lista de tarefas');
assert(resolveNotificationTarget({ type: 'APPROVAL_REQUIRED', link: null }, canOpen(gestor)) === '/approvals', 'timesheet submetido abre as aprovações');
assert(resolveNotificationTarget({ type: 'TIMESHEET_APPROVED', link: null }, canOpen(permissionsOf('SELF_TIMESHEET_READ'))) === '/timesheets', 'decisão do timesheet abre o próprio timesheet');
assert(resolveNotificationTarget({ type: 'IT_TICKET_RESOLVED', link: null }, canOpen(gestor)) === '/support', 'pedido resolvido abre os pedidos de suporte de quem o abriu');
const technician = permissionsOf('IT_TICKET_CREATE', 'IT_TICKETS_READ');
assert(resolveNotificationTarget({ type: 'IT_TICKET_CREATED', link: null }, canOpen(technician)) === '/it/tickets', 'novo pedido abre a fila do IT para o técnico');
assert(resolveNotificationTarget({ type: 'IT_TICKET_CLOSED', link: null }, canOpen(gestor)) === '/support', 'sem acesso à fila do IT, o colaborador vai para os seus pedidos');
assert(resolveNotificationTarget({ type: 'TASK_ASSIGNED', link: '/timesheet/tasks/abc' }, canOpen(permissionsOf('SELF_ACCESS'))) === null, 'sem permissão não há destino (nada é exposto)');
assert(resolveNotificationTarget({ type: 'TASK_ASSIGNED', link: 'https://exemplo.com' }, canOpen(gestor)) === '/timesheet/tasks', 'ligação externa ignorada');
assert(resolveNotificationTarget({ type: 'OUTRO', link: null }, canOpen(gestor)) === null, 'tipo desconhecido sem ligação não tem destino');

console.log('\nMenu lateral');
assert(isNavigationItemActive({ to: '/timesheet/tasks' }, '/timesheet/tasks/abc'), 'item ativo nos sub-caminhos');
assert(!isNavigationItemActive({ to: '/timesheet', end: true }, '/timesheet/tasks') && isNavigationItemActive({ to: '/timesheet', end: true }, '/timesheet'), '"end" limita ao caminho exato');
const sections = [
  { id: 'work', items: [{ to: '/timesheet', end: true }, { to: '/timesheet/tasks' }] },
  { id: 'team', items: [{ to: '/team' }, { to: '/timesheet/reports' }] },
  { id: 'it', items: [{ to: '/it', end: true }, { to: '/it/tickets' }] },
];
assert(findActiveSection(sections, '/timesheet/tasks/abc') === 'work', 'tarefa abre a secção Trabalho');
assert(findActiveSection(sections, '/timesheet/reports') === 'team', 'relatórios da equipa abrem a Gestão de equipa');
assert(findActiveSection(sections, '/it/tickets/42') === 'it' && findActiveSection(sections, '/dashboard') === null, 'IT e páginas fora das secções');
assert(JSON.stringify(parseOpenSections('{"work":true,"it":false,"x":"sim"}')) === '{"work":true,"it":false}', 'estado guardado válido é lido');
assert(Object.keys(parseOpenSections('não é json')).length === 0 && Object.keys(parseOpenSections('[true]')).length === 0, 'estado guardado inválido é ignorado');

console.log(`\n${passed} testes passaram.`);
