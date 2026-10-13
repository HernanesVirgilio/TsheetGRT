// Testes das regras puras de entrada e navegação: acesso por rota, escolha do dashboard,
// destino das notificações e secções do menu lateral. A autorização efetiva continua na RLS.
import { canAccessPath, LEGACY_REDIRECTS, meetsRequirement, requiredPermissionFor, ROUTE_PERMISSIONS } from '../lib/auth/routeAccess';
import { firstName, greetingFor, selectDashboard } from '../utils/dashboard';
import { resolveNotificationTarget } from '../utils/notifications';
import { findActiveSection, isNavigationItemActive, parseOpenSections } from '../utils/navigation';
import { currentLocation, visibleNavigation } from '../components/layout/navigationConfig';
import { availableApprovalKinds } from '../utils/approvals';
import { buildInsights, compareValues, periodRange, previousRange, rangeLength, shiftAnchor, trendBucket } from '../utils/reportPeriods';
import type { PermissionCode } from '../types';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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
assert(requiredPermissionFor('/timesheet/tasks') === 'TIMESHEET_TASK_READ' && requiredPermissionFor('/timesheet/meetings') === 'TIMESHEET_MEETING_READ', 'rotas aninhadas distinguidas');
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
assert(findActiveSection(sections, '/timesheet/reports') === 'team', 'segunda secção identificada pelo caminho');
assert(findActiveSection(sections, '/it/tickets/42') === 'it' && findActiveSection(sections, '/dashboard') === null, 'IT e páginas fora das secções');
assert(JSON.stringify(parseOpenSections('{"work":true,"it":false,"x":"sim"}')) === '{"work":true,"it":false}', 'estado guardado válido é lido');
assert(Object.keys(parseOpenSections('não é json')).length === 0 && Object.keys(parseOpenSections('[true]')).length === 0, 'estado guardado inválido é ignorado');

console.log('\nArquitetura de informação');
const allPermissions = () => true;
const groups = visibleNavigation(allPermissions);
const destinations = groups.flatMap((group) => group.items.map((item) => item.to));
assert(new Set(destinations).size === destinations.length, 'cada destino aparece uma única vez no menu');
assert(['/team', '/approvals', '/reports', '/timesheet/absences', '/timesheet/opportunities'].every((path) => destinations.includes(path)), 'equipa, aprovações, relatórios, disponibilidade e oportunidades continuam acessíveis');
assert(!destinations.includes('/timesheet/team') && !destinations.includes('/activity') && !destinations.includes('/timesheet/approvals') && !destinations.includes('/timesheet/reports'), 'sem entradas duplicadas (carga, atividade da equipa, pedidos de aprovação, relatórios da equipa)');
assert(groups.map((group) => group.id).join(',') === 'home,work,collaboration,approvals,analysis,support,administration', 'grupos pela ordem definida');
const employeeMenu = visibleNavigation(permissionsOf('SELF_TIMESHEET_READ', 'TIMESHEET_TASK_READ', 'TIMESHEET_MEETING_READ', 'TIMESHEET_ABSENCE_CREATE', 'IT_TICKET_CREATE'));
assert(!employeeMenu.some((group) => group.id === 'approvals' || group.id === 'administration' || group.id === 'analysis'), 'o colaborador não vê aprovações, relatórios nem administração');
assert(currentLocation(groups, '/approvals/abc')?.item.to === '/approvals' && currentLocation(groups, '/timesheet/companies')?.item.to === '/timesheet/opportunities', 'páginas de detalhe ficam associadas ao seu destino');
assert(currentLocation(groups, '/profile') === null, 'páginas de conta não pertencem a um grupo');

console.log('\nRequisitos de acesso e endereços antigos');
assert(meetsRequirement(['REPORTS_READ', 'TEAM_READ'], permissionsOf('TEAM_READ')) && !meetsRequirement(['REPORTS_READ', 'TEAM_READ'], permissionsOf('SELF_ACCESS')), 'lista de permissões: basta uma');
assert(canAccessPath('/approvals', permissionsOf('TIMESHEET_ABSENCE_VALIDATE')) && !canAccessPath('/approvals', employee), 'o centro de aprovações abre a quem decide algum tipo de pedido');
assert(Object.keys(LEGACY_REDIRECTS).every((path) => !(path in ROUTE_PERMISSIONS)), 'endereços antigos não têm página própria');
assert(requiredPermissionFor('/timesheet/team') === 'TEAM_READ' && requiredPermissionFor('/timesheet') === null, 'endereços antigos herdam o acesso do destino');
assert(availableApprovalKinds(permissionsOf('TEAM_TIMESHEET_REVIEW', 'TEAM_READ')).join(',') === 'timesheets,meetings', 'separadores de aprovação segundo as permissões');

console.log('\nPeríodos dos relatórios');
const anchor = new Date(2026, 9, 14);
assert(JSON.stringify(periodRange('WEEK', anchor)) === JSON.stringify({ from: '2026-10-12', to: '2026-10-18' }), 'semana de segunda a domingo');
assert(JSON.stringify(periodRange('QUARTER', anchor)) === JSON.stringify({ from: '2026-10-01', to: '2026-12-31' }), 'trimestre civil');
assert(JSON.stringify(previousRange('MONTH', periodRange('MONTH', new Date(2026, 2, 15)))) === JSON.stringify({ from: '2026-02-01', to: '2026-02-28' }), 'mês anterior com o seu próprio número de dias');
assert(JSON.stringify(previousRange('CUSTOM', { from: '2026-10-10', to: '2026-10-19' })) === JSON.stringify({ from: '2026-09-30', to: '2026-10-09' }), 'período personalizado: mesmo número de dias imediatamente antes');
assert(rangeLength(periodRange('YEAR', anchor)) === 365 && shiftAnchor('YEAR', anchor, -1).getFullYear() === 2025, 'ano e navegação entre anos');
assert(trendBucket({ from: '2026-10-01', to: '2026-10-31' }) === 'day' && trendBucket(periodRange('QUARTER', anchor)) === 'week' && trendBucket(periodRange('YEAR', anchor)) === 'month', 'agrupamento da evolução segundo a duração');
assert(compareValues(120, 0).percent === null && compareValues(0, 0).percent === null, 'sem base no período anterior não há percentagem (nunca divide por zero)');
assert(compareValues(90, 100).percent === -10, 'variação percentual');
assert(buildInsights({ hours: compareValues(102, 100), people: compareValues(5, 5), pendingOverThreshold: 0, thresholdDays: 3, rejectionRate: null }).length === 0, 'variações pequenas não geram observações');
const insights = buildInsights({ hours: compareValues(80, 100), people: compareValues(4, 5), pendingOverThreshold: 5, thresholdDays: 3, rejectionRate: null });
assert(insights.length === 3 && insights.every((insight) => insight.tone === 'attention'), 'descida de horas, menos pessoas e pendentes antigos geram observações');
assert(buildInsights({ hours: compareValues(50, 0), people: compareValues(2, 0), pendingOverThreshold: null, thresholdDays: null, rejectionRate: null }).length === 0, 'sem base de comparação não há tendência');

console.log('\nLayout: um único contexto de deslocamento');
// Regressão: <main> sem posição deixava os elementos absolutos (ex.: sr-only) escaparem para a janela e alargarem o
// documento inteiro (segunda barra de deslocamento e área vazia). Medido no browser: 3117 px de documento numa janela de 768.
const shell = readFileSync(join(process.cwd(), 'src', 'components', 'layout', 'AppShell.tsx'), 'utf-8');
const mainClasses = (shell.match(/<main id="conteudo-principal" className="([^"]+)"/)?.[1] ?? '').split(' ');
assert(mainClasses.includes('relative') && mainClasses.includes('overflow-y-auto') && mainClasses.includes('min-h-0'), '<main> é o contentor de deslocamento e dos elementos absolutos');
assert(/className="relative flex h-\[100vh\][^"]*overflow-hidden/.test(shell), 'o shell ocupa a janela, é posicionado e não desloca');

console.log(`\n${passed} testes passaram.`);
