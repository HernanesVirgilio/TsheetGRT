import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';

export type ReviewDecision = 'APPROVED' | 'REJECTED';

export interface BulkApprovalResult {
  timesheetId: string;
  approved: boolean;
  message: string;
}

/**
 * Decide um timesheet. Autorização, âmbito, estado e motivo são validados no servidor
 * (public.review_timesheet); o cliente nunca altera o estado diretamente.
 */
export async function reviewTimesheet(timesheetId: string, decision: ReviewDecision, comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('review_timesheet', {
    p_timesheet_id: timesheetId,
    p_decision: decision,
    p_comment: comment,
  });
  if (error) {
    throw toServiceError(
      error,
      decision === 'APPROVED' ? 'Não foi possível aprovar o timesheet.' : 'Não foi possível rejeitar o timesheet.'
    );
  }
}

/** Aprovação em massa: devolve o resultado de cada timesheet (as falhas não anulam os restantes). */
export async function approveTimesheets(timesheetIds: string[], comment: string | null): Promise<BulkApprovalResult[]> {
  const { data, error } = await supabase.rpc('approve_timesheets', {
    p_timesheet_ids: timesheetIds,
    p_comment: comment,
  });
  if (error) throw toServiceError(error, 'Não foi possível aprovar os timesheets selecionados.');
  return data.map((row) => ({ timesheetId: row.timesheet_id, approved: row.approved, message: row.message }));
}
