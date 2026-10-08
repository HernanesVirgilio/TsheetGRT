import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { TimesheetStatus, TimesheetSummary } from '../types';
import { isPresent, mapTimesheetSummary, TIMESHEET_SUMMARY_SELECT } from './mappers';

export interface ReportFilters {
  status: TimesheetStatus | null;
  employeeId: string | null;
  departmentId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
}

/**
 * Timesheets para relatórios. O âmbito é decidido pela RLS no servidor:
 * administradores veem a empresa, gestores apenas o seu manager_scope e os próprios.
 */
export async function listReportTimesheets(filters: ReportFilters): Promise<TimesheetSummary[]> {
  let request = supabase
    .from('timesheets')
    .select(TIMESHEET_SUMMARY_SELECT)
    .order('period_start', { ascending: false });

  if (filters.status) request = request.eq('status', filters.status);
  if (filters.employeeId) request = request.eq('employee_id', filters.employeeId);
  if (filters.periodFrom) request = request.gte('period_start', filters.periodFrom);
  if (filters.periodTo) request = request.lte('period_end', filters.periodTo);

  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível gerar o relatório.');

  return data
    .map(mapTimesheetSummary)
    .filter(isPresent)
    .filter((timesheet) => !filters.departmentId || timesheet.departmentId === filters.departmentId);
}
