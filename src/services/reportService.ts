import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { TimesheetStatus, TimesheetSummary } from '../types';
import { isPresent, mapTimesheetSummary, TIMESHEET_SUMMARY_SELECT } from './mappers';
import { t } from '../lib/i18n';

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

export interface HoursRow {
  employeeId: string;
  employeeName: string;
  departmentId: string | null;
  departmentName: string | null;
  activityName: string;
  minutes: number;
  entries: number;
  daysWorked: number;
}

export interface HoursFilters {
  from: string;
  to: string;
  departmentId: string | null;
  employeeId: string | null;
}

/** Horas por colaborador e atividade, agregadas no servidor com o âmbito da RLS. */
export async function getHoursReport(filters: HoursFilters): Promise<HoursRow[]> {
  const { data, error } = await supabase.rpc('get_hours_report', {
    p_from: filters.from,
    p_to: filters.to,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
  });
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));
  return data.map((row) => ({
    employeeId: row.employee_id,
    employeeName: row.employee_name ?? '—',
    departmentId: row.department_id,
    departmentName: row.department_name,
    activityName: row.activity_name,
    minutes: Number(row.minutes),
    entries: Number(row.entries),
    daysWorked: Number(row.days_worked),
  }));
}

export interface TrendPoint {
  bucketStart: string;
  minutes: number;
  people: number;
}

export async function getHoursTrend(filters: HoursFilters, bucket: 'day' | 'week' | 'month'): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc('get_hours_trend', {
    p_from: filters.from,
    p_to: filters.to,
    p_bucket: bucket,
    p_department_id: filters.departmentId,
    p_employee_id: filters.employeeId,
  });
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));
  return data.map((row) => ({ bucketStart: String(row.bucket_start).slice(0, 10), minutes: Number(row.minutes), people: Number(row.people) }));
}

export interface ApprovalMetrics {
  approved: number;
  rejected: number;
  avgDecisionHours: number | null;
  decisionsMeasured: number;
  resubmittedApproved: number;
  pendingNow: number;
  pendingOverThreshold: number;
  thresholdDays: number;
  oldestPendingAt: string | null;
}

export async function getApprovalReport(from: string, to: string, departmentId: string | null): Promise<ApprovalMetrics> {
  const { data, error } = await supabase.rpc('get_approval_report', { p_from: from, p_to: to, p_department_id: departmentId });
  if (error) throw toServiceError(error, t('Não foi possível gerar o relatório.'));
  const row = data[0];
  return {
    approved: Number(row?.approved_count ?? 0),
    rejected: Number(row?.rejected_count ?? 0),
    avgDecisionHours: row?.avg_decision_hours === null || row?.avg_decision_hours === undefined ? null : Number(row.avg_decision_hours),
    decisionsMeasured: Number(row?.decisions_measured ?? 0),
    resubmittedApproved: Number(row?.resubmitted_approved ?? 0),
    pendingNow: Number(row?.pending_now ?? 0),
    pendingOverThreshold: Number(row?.pending_over_threshold ?? 0),
    thresholdDays: Number(row?.threshold_days ?? 3),
    oldestPendingAt: row?.oldest_pending_at ?? null,
  };
}
