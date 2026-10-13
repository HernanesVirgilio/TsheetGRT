// Contrato entre o centro de relatórios e as funções SQL de 20261015000001_reporting_centre.sql:
// argumentos enviados por RPC e conversão das linhas devolvidas. Sem dependência do cliente Supabase,
// para poder ser testado (src/tests/reports.test.ts compara os nomes com as assinaturas das migrations).
import type { Database } from '../types/database';

type Functions = Database['public']['Functions'];
export type HoursReportArgs = Functions['get_hours_report']['Args'];
export type HoursTrendArgs = Functions['get_hours_trend']['Args'];
export type ApprovalReportArgs = Functions['get_approval_report']['Args'];
type HoursReportRow = Functions['get_hours_report']['Returns'][number];
type HoursTrendRow = Functions['get_hours_trend']['Returns'][number];
type ApprovalReportRow = Functions['get_approval_report']['Returns'][number];

export type TrendBucket = 'day' | 'week' | 'month';

export interface HoursFilters {
  from: string;
  to: string;
  departmentId: string | null;
  employeeId: string | null;
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

export interface TrendPoint {
  bucketStart: string;
  minutes: number;
  people: number;
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

/** Filtros nulos são enviados explicitamente: a função SQL trata NULL como "todos" (dentro do âmbito). */
export function hoursReportArgs(filters: HoursFilters): HoursReportArgs {
  return { p_from: filters.from, p_to: filters.to, p_department_id: filters.departmentId, p_employee_id: filters.employeeId };
}

export function hoursTrendArgs(filters: HoursFilters, bucket: TrendBucket): HoursTrendArgs {
  return { ...hoursReportArgs(filters), p_bucket: bucket };
}

export function approvalReportArgs(from: string, to: string, departmentId: string | null): ApprovalReportArgs {
  return { p_from: from, p_to: to, p_department_id: departmentId };
}

export function mapHoursRow(row: HoursReportRow): HoursRow {
  return {
    employeeId: row.employee_id,
    employeeName: row.employee_name ?? '—',
    departmentId: row.department_id,
    departmentName: row.department_name,
    activityName: row.activity_name,
    minutes: Number(row.minutes),
    entries: Number(row.entries),
    daysWorked: Number(row.days_worked),
  };
}

export function mapTrendPoint(row: HoursTrendRow): TrendPoint {
  return { bucketStart: String(row.bucket_start).slice(0, 10), minutes: Number(row.minutes), people: Number(row.people) };
}

/**
 * A função agrega e devolve sempre exatamente uma linha. Uma resposta sem linhas é uma falha do servidor e
 * não pode ser apresentada como "zero aprovações" (devolve null para quem chama tratar como erro).
 */
export function mapApprovalMetrics(rows: readonly ApprovalReportRow[] | null): ApprovalMetrics | null {
  const row = rows?.[0];
  if (!row) return null;
  return {
    approved: Number(row.approved_count),
    rejected: Number(row.rejected_count),
    avgDecisionHours: row.avg_decision_hours === null ? null : Number(row.avg_decision_hours),
    decisionsMeasured: Number(row.decisions_measured),
    resubmittedApproved: Number(row.resubmitted_approved),
    pendingNow: Number(row.pending_now),
    pendingOverThreshold: Number(row.pending_over_threshold),
    thresholdDays: Number(row.threshold_days),
    oldestPendingAt: row.oldest_pending_at,
  };
}
