import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { TimesheetStatus } from '../types';
import { isTimesheetStatus } from '../types';
import type { ReportTimesheet } from '../utils/reports';

export interface ReportFilters {
  status: TimesheetStatus | null;
  employeeId: string | null;
  departmentId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
}

// Literal único: o supabase-js infere o tipo da resposta a partir desta string.
const REPORT_SELECT =
  'id, employee_id, period_start, period_end, status, submitted_at, approved_at, employee:profiles!timesheets_employee_id_fkey(full_name, department:departments(id, name)), entries:timesheet_entries(total_minutes)' as const;

/** Timesheets visíveis ao utilizador (o âmbito é decidido pela RLS no servidor). */
export async function listReportTimesheets(filters: ReportFilters): Promise<ReportTimesheet[]> {
  let request = supabase
    .from('timesheets')
    .select(REPORT_SELECT)
    .order('period_start', { ascending: false });

  if (filters.status) request = request.eq('status', filters.status);
  if (filters.employeeId) request = request.eq('employee_id', filters.employeeId);
  if (filters.periodFrom) request = request.gte('period_start', filters.periodFrom);
  if (filters.periodTo) request = request.lte('period_end', filters.periodTo);

  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível gerar o relatório.');

  return data
    .flatMap((row): ReportTimesheet[] => {
      if (!isTimesheetStatus(row.status)) return [];
      return [
        {
          id: row.id,
          employeeId: row.employee_id,
          employeeName: row.employee?.full_name ?? 'Colaborador sem acesso visível',
          departmentId: row.employee?.department?.id ?? null,
          departmentName: row.employee?.department?.name ?? null,
          periodStart: row.period_start,
          periodEnd: row.period_end,
          status: row.status,
          submittedAt: row.submitted_at,
          approvedAt: row.approved_at,
          entryCount: row.entries.length,
          totalMinutes: row.entries.reduce((total, entry) => total + entry.total_minutes, 0),
        },
      ];
    })
    .filter((timesheet) => !filters.departmentId || timesheet.departmentId === filters.departmentId);
}
