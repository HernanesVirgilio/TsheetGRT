// Regras puras do dashboard inicial: que painel mostrar e como cumprimentar o utilizador.
import type { PermissionCode, RoleCode } from '../types';

export type DashboardKind = 'ADMIN' | 'IT' | 'MANAGER' | 'GESTOR' | 'WORK' | 'START';

/** Painel preferido de cada perfil e a permissão sem a qual os seus dados não podem ser lidos. */
const ROLE_DASHBOARDS: Record<RoleCode, { kind: DashboardKind; permission: PermissionCode }> = {
  ADMIN: { kind: 'ADMIN', permission: 'ADMIN_ACCESS' },
  IT: { kind: 'IT', permission: 'IT_TICKETS_READ' },
  MANAGER: { kind: 'MANAGER', permission: 'TEAM_SUPERVISE' },
  GESTOR: { kind: 'GESTOR', permission: 'TEAM_READ' },
  EMPLOYEE: { kind: 'WORK', permission: 'TIMESHEET_TASK_READ' },
};

/**
 * O perfil indica o painel preferido, mas é a permissão que decide: um perfil sem a permissão do seu
 * painel recebe o centro de trabalho (se o tiver) ou a página inicial com os atalhos disponíveis.
 */
export function selectDashboard(role: RoleCode | null, hasPermission: (permission: PermissionCode) => boolean): DashboardKind {
  const preferred = role ? ROLE_DASHBOARDS[role] : null;
  if (preferred && hasPermission(preferred.permission)) return preferred.kind;
  if (hasPermission('TIMESHEET_TASK_READ')) return 'WORK';
  return 'START';
}

export function greetingFor(date: Date): string {
  const hour = date.getHours();
  if (hour < 12) return 'Bom dia';
  if (hour < 19) return 'Boa tarde';
  return 'Boa noite';
}

export function firstName(fullName: string): string {
  return fullName.trim().split(/\s+/)[0] ?? '';
}
