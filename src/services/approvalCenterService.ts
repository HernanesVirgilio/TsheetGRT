// Contagens do centro de aprovações: quantos pedidos aguardam a decisão de quem consulta, por tipo.
// Só conta (head: true): os registos vêm das listas de cada separador. A RLS limita tudo ao âmbito.
import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { ErrorLike } from '../lib/errors';
import type { PermissionCode } from '../types';
import { availableApprovalKinds } from '../utils/approvals';
import type { ApprovalCounts } from '../utils/approvals';
import { t } from '../lib/i18n';

export type { ApprovalCounts, ApprovalKind } from '../utils/approvals';

async function count(query: PromiseLike<{ count: number | null; error: ErrorLike | null }>): Promise<number> {
  const { count: total, error } = await query;
  if (error) throw toServiceError(error, t('Não foi possível contar os pedidos pendentes.'));
  return total ?? 0;
}

export async function getApprovalCounts(viewerId: string, hasPermission: (permission: PermissionCode) => boolean): Promise<ApprovalCounts> {
  const kinds = availableApprovalKinds(hasPermission);
  const canApproveAbsences = hasPermission('TIMESHEET_ABSENCE_APPROVE');
  const canValidateAbsences = hasPermission('TIMESHEET_ABSENCE_VALIDATE') && !canApproveAbsences;

  const [timesheets, absences, opportunities, meetings] = await Promise.all([
    kinds.includes('timesheets')
      ? count(supabase.from('timesheets').select('id', { count: 'exact', head: true }).eq('status', 'SUBMITTED').neq('employee_id', viewerId))
      : 0,
    kinds.includes('absences')
      ? count(
          supabase
            .from('absence_requests')
            .select('id', { count: 'exact', head: true })
            .eq('status', canValidateAbsences ? 'SUBMITTED' : 'PENDING_APPROVAL')
            .neq('employee_id', viewerId)
        )
      : 0,
    hasPermission('TIMESHEET_OPPORTUNITY_APPROVE')
      ? count(supabase.from('approval_requests').select('id', { count: 'exact', head: true }).eq('status', 'PENDING').neq('requested_by', viewerId))
      : 0,
    kinds.includes('meetings')
      ? count(
          supabase
            .from('meetings')
            .select('id', { count: 'exact', head: true })
            .eq('requested_with', viewerId)
            .eq('request_status', 'PENDING')
            .eq('status', 'PLANNED')
        )
      : 0,
  ]);
  return { timesheets, absences, opportunities, meetings };
}

export { availableApprovalKinds, totalPending } from '../utils/approvals';
