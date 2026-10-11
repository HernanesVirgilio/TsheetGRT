import { matchPath } from 'react-router-dom';
import type { PermissionCode } from '../../types';

/**
 * Permissão funcional exigida por cada rota protegida. Fonte única para o router (App.tsx),
 * o regresso após o login e o destino das notificações. A RLS continua a ser a barreira real.
 */
export const ROUTE_PERMISSIONS = {
  '/timesheets': 'SELF_TIMESHEET_READ',
  '/timesheets/:id': 'SELF_TIMESHEET_READ',
  '/timesheet': 'TIMESHEET_TASK_READ',
  '/timesheet/tasks': 'TIMESHEET_TASK_READ',
  '/timesheet/tasks/:id': 'TIMESHEET_TASK_READ',
  '/timesheet/activities': 'SELF_TIMESHEET_READ',
  '/timesheet/calendar': 'TIMESHEET_CALENDAR_READ',
  '/timesheet/meetings': 'TIMESHEET_MEETING_READ',
  '/timesheet/meetings/:id': 'TIMESHEET_MEETING_READ',
  '/timesheet/absences': 'TIMESHEET_ABSENCE_CREATE',
  '/timesheet/opportunities': 'TIMESHEET_OPPORTUNITY_READ',
  '/timesheet/opportunities/:id': 'TIMESHEET_OPPORTUNITY_READ',
  '/timesheet/companies': 'TIMESHEET_OPPORTUNITY_READ',
  '/timesheet/team': 'TEAM_READ',
  '/timesheet/reports': 'TEAM_READ',
  '/timesheet/approvals': 'TIMESHEET_OPPORTUNITY_READ',
  '/team': 'TEAM_READ',
  '/team/:id': 'TEAM_READ',
  '/approvals': 'TEAM_TIMESHEET_REVIEW',
  '/approvals/:id': 'TEAM_TIMESHEET_REVIEW',
  '/activity': 'TEAM_TIMESHEET_READ',
  '/support': 'IT_TICKET_CREATE',
  '/support/:id': 'IT_TICKET_CREATE',
  '/it': 'IT_TICKETS_READ',
  '/it/tickets': 'IT_TICKETS_READ',
  '/it/tickets/:id': 'IT_TICKETS_READ',
  '/it/assets': 'IT_ASSETS_READ',
  '/it/assets/:id': 'IT_ASSETS_READ',
  '/it/interventions': 'IT_TICKETS_READ',
  '/reports': 'REPORTS_READ',
  '/users': 'USERS_READ',
  '/users/:id': 'USERS_READ',
  '/departments': 'DEPARTMENTS_READ',
  '/roles': 'ROLES_READ',
  '/audit': 'AUDIT_READ',
  '/system-health': 'SYSTEM_HEALTH_READ',
  '/settings': 'SYSTEM_SETTINGS_READ',
} as const satisfies Record<string, PermissionCode>;

export type PermissionRoutePath = keyof typeof ROUTE_PERMISSIONS;

/** Rotas da área autenticada disponíveis para qualquer conta com acesso à aplicação. */
const OPEN_APP_PATHS: readonly string[] = ['/dashboard', '/profile', '/notifications', '/alterar-palavra-passe'];

const PERMISSION_ROUTE_PATHS = Object.keys(ROUTE_PERMISSIONS) as PermissionRoutePath[];

/** Permissão exigida pelo caminho: `null` se for aberto, `undefined` se a rota não existir. */
export function requiredPermissionFor(path: string): PermissionCode | null | undefined {
  const pathname = path.split(/[?#]/)[0];
  if (OPEN_APP_PATHS.includes(pathname)) return null;
  const pattern = PERMISSION_ROUTE_PATHS.find((routePath) => matchPath(routePath, pathname));
  return pattern ? ROUTE_PERMISSIONS[pattern] : undefined;
}

/** Indica se o utilizador pode abrir o caminho (rotas desconhecidas nunca são consideradas acessíveis). */
export function canAccessPath(path: string, hasPermission: (permission: PermissionCode) => boolean): boolean {
  const permission = requiredPermissionFor(path);
  if (permission === undefined) return false;
  return permission === null || hasPermission(permission);
}
