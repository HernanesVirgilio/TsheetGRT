import { matchPath } from 'react-router-dom';
import type { PermissionCode } from '../../types';

/**
 * Requisito de acesso de uma rota: uma permissão ou uma lista em que basta uma delas
 * (ex.: o centro de aprovações abre a quem decide timesheets, ausências ou oportunidades).
 */
export type RouteRequirement = PermissionCode | readonly PermissionCode[];

/** Quem decide algum tipo de pedido (timesheets, ausências, oportunidades ou reuniões pedidas à chefia). */
export const APPROVAL_CENTER_PERMISSIONS = [
  'TEAM_TIMESHEET_REVIEW',
  'TIMESHEET_ABSENCE_VALIDATE',
  'TIMESHEET_ABSENCE_APPROVE',
  'TIMESHEET_OPPORTUNITY_APPROVE',
  'TIMESHEET_OPPORTUNITY_CREATE',
  'TEAM_READ',
] as const satisfies readonly PermissionCode[];

/** Disponibilidade pessoal: pedir ausências (colaboradores) ou comunicá-las (quem gere equipa). */
export const ABSENCE_PERMISSIONS = ['TIMESHEET_ABSENCE_CREATE', 'TIMESHEET_ABSENCE_NOTIFY'] as const satisfies readonly PermissionCode[];

/** Relatórios gerais (REPORTS_READ) e relatórios da equipa (TEAM_READ) partilham o mesmo centro. */
export const REPORTS_PERMISSIONS = ['REPORTS_READ', 'TEAM_READ'] as const satisfies readonly PermissionCode[];

/**
 * Requisito de cada rota protegida. Fonte única para o router (App.tsx), o menu, o regresso após o
 * login e o destino das notificações. A RLS continua a ser a barreira real.
 */
export const ROUTE_PERMISSIONS = {
  '/timesheets': 'SELF_TIMESHEET_READ',
  '/timesheets/:id': 'SELF_TIMESHEET_READ',
  '/timesheet/tasks': 'TIMESHEET_TASK_READ',
  '/timesheet/tasks/:id': 'TIMESHEET_TASK_READ',
  '/timesheet/activities': 'SELF_TIMESHEET_READ',
  '/timesheet/calendar': 'TIMESHEET_CALENDAR_READ',
  '/timesheet/meetings': 'TIMESHEET_MEETING_READ',
  '/timesheet/meetings/:id': 'TIMESHEET_MEETING_READ',
  '/timesheet/absences': ABSENCE_PERMISSIONS,
  '/timesheet/opportunities': 'TIMESHEET_OPPORTUNITY_READ',
  '/timesheet/opportunities/:id': 'TIMESHEET_OPPORTUNITY_READ',
  '/timesheet/companies': 'TIMESHEET_OPPORTUNITY_READ',
  '/team': 'TEAM_READ',
  '/team/:id': 'TEAM_READ',
  '/approvals': APPROVAL_CENTER_PERMISSIONS,
  '/approvals/:id': 'TEAM_TIMESHEET_REVIEW',
  '/support': 'IT_TICKET_CREATE',
  '/support/:id': 'IT_TICKET_CREATE',
  '/it': 'IT_TICKETS_READ',
  '/it/tickets': 'IT_TICKETS_READ',
  '/it/tickets/:id': 'IT_TICKETS_READ',
  '/it/assets': 'IT_ASSETS_READ',
  '/it/assets/:id': 'IT_ASSETS_READ',
  '/it/interventions': 'IT_TICKETS_READ',
  '/reports': REPORTS_PERMISSIONS,
  '/users': 'USERS_READ',
  '/users/:id': 'USERS_READ',
  '/departments': 'DEPARTMENTS_READ',
  '/roles': 'ROLES_READ',
  '/audit': 'AUDIT_READ',
  '/system-health': 'SYSTEM_HEALTH_READ',
  '/settings': 'SYSTEM_SETTINGS_READ',
} as const satisfies Record<string, RouteRequirement>;

export type PermissionRoutePath = keyof typeof ROUTE_PERMISSIONS;

/**
 * Endereços antigos, consolidados num único destino. Continuam a funcionar (favoritos, notificações
 * já enviadas) e redirecionam para a página que agora reúne a funcionalidade.
 */
export const LEGACY_REDIRECTS: Record<string, string> = {
  '/timesheet': '/dashboard',
  '/timesheet/team': '/team?tab=workload',
  '/timesheet/reports': '/reports?tab=team',
  '/timesheet/approvals': '/approvals?tab=opportunities',
  '/activity': '/team?tab=activity',
};

/** Rotas da área autenticada disponíveis para qualquer conta com acesso à aplicação. */
const OPEN_APP_PATHS: readonly string[] = ['/dashboard', '/profile', '/notifications', '/alterar-palavra-passe'];

const PERMISSION_ROUTE_PATHS = Object.keys(ROUTE_PERMISSIONS) as PermissionRoutePath[];

/** Verifica um requisito: com uma lista, basta uma das permissões. */
export function meetsRequirement(requirement: RouteRequirement | null | undefined, hasPermission: (permission: PermissionCode) => boolean): boolean {
  if (!requirement) return true;
  return typeof requirement === 'string' ? hasPermission(requirement) : requirement.some(hasPermission);
}

/** Requisito do caminho: `null` se for aberto, `undefined` se a rota não existir. Segue os endereços antigos. */
export function requiredPermissionFor(path: string): RouteRequirement | null | undefined {
  const pathname = path.split(/[?#]/)[0];
  const redirect = LEGACY_REDIRECTS[pathname];
  if (redirect) return requiredPermissionFor(redirect);
  if (OPEN_APP_PATHS.includes(pathname)) return null;
  const pattern = PERMISSION_ROUTE_PATHS.find((routePath) => matchPath(routePath, pathname));
  return pattern ? ROUTE_PERMISSIONS[pattern] : undefined;
}

/** Indica se o utilizador pode abrir o caminho (rotas desconhecidas nunca são consideradas acessíveis). */
export function canAccessPath(path: string, hasPermission: (permission: PermissionCode) => boolean): boolean {
  const requirement = requiredPermissionFor(path);
  if (requirement === undefined) return false;
  return meetsRequirement(requirement, hasPermission);
}
