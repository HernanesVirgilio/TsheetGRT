import { supabase } from '../lib/supabase/client';
import { ServiceError, toServiceError } from '../lib/errors';
import type { TimesheetStatus, TimesheetSummary } from '../types';
import { isPresent, mapTimesheetSummary, TIMESHEET_SUMMARY_SELECT } from './mappers';
import { t } from '../lib/i18n';
import { approvalReportArgs, hoursReportArgs, hoursTrendArgs, mapApprovalMetrics, mapHoursRow, mapTrendPoint } from './reportContract';
import type { ApprovalMetrics, HoursFilters, HoursRow, TrendBucket, TrendPoint } from './reportContract';

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
  // Timesheets cujo período se sobrepõe ao intervalo (um timesheet mensal conta numa semana desse mês).
  if (filters.periodFrom) request = request.gte('period_end', filters.periodFrom);
  if (filters.periodTo) request = request.lte('period_start', filters.periodTo);

  const { data, error } = await request;
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));

  return data
    .map(mapTimesheetSummary)
    .filter(isPresent)
    .filter((timesheet) => !filters.departmentId || timesheet.departmentId === filters.departmentId);
}

export type { ApprovalMetrics, HoursFilters, HoursRow, TrendPoint } from './reportContract';

/** Horas por colaborador e atividade, agregadas no servidor com o âmbito da RLS. */
export async function getHoursReport(filters: HoursFilters): Promise<HoursRow[]> {
  const { data, error } = await supabase.rpc('get_hours_report', hoursReportArgs(filters));
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));
  return data.map(mapHoursRow);
}

export async function getHoursTrend(filters: HoursFilters, bucket: TrendBucket): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc('get_hours_trend', hoursTrendArgs(filters, bucket));
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));
  return data.map(mapTrendPoint);
}

export async function getApprovalReport(from: string, to: string, departmentId: string | null): Promise<ApprovalMetrics> {
  const { data, error } = await supabase.rpc('get_approval_report', approvalReportArgs(from, to, departmentId));
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));
  const metrics = mapApprovalMetrics(data);
  // Sem linha não há métricas: nunca apresentar zeros como se o relatório tivesse sido gerado.
  if (!metrics) throw new ServiceError(t('Não foi possível gerar o relatório.'), null, 'unknown');
  return metrics;
}
