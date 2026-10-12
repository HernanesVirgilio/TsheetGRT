// Regras puras do centro de aprovações: que tipos de pedido cada utilizador decide e o total pendente.
import type { PermissionCode } from '../types';

export type ApprovalKind = 'timesheets' | 'absences' | 'opportunities' | 'meetings';

export type ApprovalCounts = Record<ApprovalKind, number>;

/** Tipos de pedido que quem consulta pode decidir (ou acompanhar), segundo as permissões efetivas. */
export function availableApprovalKinds(hasPermission: (permission: PermissionCode) => boolean): ApprovalKind[] {
  const kinds: ApprovalKind[] = [];
  if (hasPermission('TEAM_TIMESHEET_REVIEW')) kinds.push('timesheets');
  if (hasPermission('TIMESHEET_ABSENCE_VALIDATE') || hasPermission('TIMESHEET_ABSENCE_APPROVE')) kinds.push('absences');
  if (hasPermission('TIMESHEET_OPPORTUNITY_APPROVE') || hasPermission('TIMESHEET_OPPORTUNITY_CREATE')) kinds.push('opportunities');
  // Pedidos de reunião só chegam a quem é chefia configurada de alguém (exige gerir equipa).
  if (hasPermission('TEAM_READ')) kinds.push('meetings');
  return kinds;
}

export function totalPending(counts: ApprovalCounts | null | undefined): number {
  return counts ? counts.timesheets + counts.absences + counts.opportunities + counts.meetings : 0;
}
