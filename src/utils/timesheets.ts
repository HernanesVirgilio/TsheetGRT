import type { TimesheetSummary } from '../types';
import type { TimesheetReviewer } from '../services/timesheetService';
import type { FieldErrors } from './validation';

const MINUTES_PER_HOUR = 60;
const MAX_DESCRIPTION_LENGTH = 1000;
export const MAX_REVIEW_COMMENT_LENGTH = 1000;

function toMinutes(time: string): number | null {
  const match = /^(\d{2}):(\d{2})/.exec(time);
  if (!match) return null;
  return Number(match[1]) * MINUTES_PER_HOUR + Number(match[2]);
}

/** Mesma regra do trigger calculate_entry_total_minutes (o servidor recalcula sempre). */
export function calculateEntryMinutes(startTime: string, endTime: string, breakMinutes: number): number {
  const start = toMinutes(startTime);
  const end = toMinutes(endTime);
  if (start === null || end === null) return 0;
  return end - start - breakMinutes;
}

export interface EntryFormValues {
  workDate: string;
  activityId: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  description: string;
}

export type EntryFormField = keyof EntryFormValues;

export function validateEntryForm(
  values: EntryFormValues,
  period: { start: string; end: string }
): FieldErrors<EntryFormField> {
  const errors: FieldErrors<EntryFormField> = {};
  if (!values.workDate) errors.workDate = 'Indique a data.';
  else if (values.workDate < period.start || values.workDate > period.end) {
    errors.workDate = 'A data tem de estar dentro do período do timesheet.';
  }
  if (!values.activityId) errors.activityId = 'Selecione a atividade.';
  if (!values.startTime) errors.startTime = 'Indique a hora de início.';
  if (!values.endTime) errors.endTime = 'Indique a hora de fim.';
  else if (values.startTime && values.endTime <= values.startTime) {
    errors.endTime = 'A hora de fim tem de ser posterior à de início.';
  }

  const breakMinutes = Number(values.breakMinutes);
  if (!/^\d+$/.test(values.breakMinutes)) errors.breakMinutes = 'Indique a pausa em minutos (número inteiro).';
  else if (!errors.endTime && values.startTime && values.endTime && calculateEntryMinutes(values.startTime, values.endTime, breakMinutes) <= 0) {
    errors.breakMinutes = 'A pausa não pode ser igual ou superior ao tempo de trabalho.';
  }

  const description = values.description.trim();
  if (!description) errors.description = 'Descreva as tarefas realizadas.';
  else if (description.length > MAX_DESCRIPTION_LENGTH) errors.description = `Máximo de ${MAX_DESCRIPTION_LENGTH} carateres.`;
  return errors;
}

export type PeriodField = 'periodStart' | 'periodEnd';

export function validatePeriod(periodStart: string, periodEnd: string): FieldErrors<PeriodField> {
  const errors: FieldErrors<PeriodField> = {};
  if (!periodStart) errors.periodStart = 'Indique a data de início.';
  if (!periodEnd) errors.periodEnd = 'Indique a data de fim.';
  else if (periodStart && periodEnd < periodStart) errors.periodEnd = 'A data de fim não pode ser anterior à de início.';
  return errors;
}

export function validateRejectionReason(reason: string): string | null {
  const trimmed = reason.trim();
  if (!trimmed) return 'Indique o motivo da rejeição.';
  if (trimmed.length > MAX_REVIEW_COMMENT_LENGTH) return `O motivo não pode exceder ${MAX_REVIEW_COMMENT_LENGTH} carateres.`;
  return null;
}

export interface TeamTimesheetTotals {
  submittedCount: number;
  approvedCount: number;
  rejectedCount: number;
  draftCount: number;
  totalMinutes: number;
  approvedMinutes: number;
  /** Horas submetidas a aguardar decisão. */
  pendingMinutes: number;
}

export function summarizeTimesheets(timesheets: TimesheetSummary[]): TeamTimesheetTotals {
  return timesheets.reduce<TeamTimesheetTotals>(
    (totals, timesheet) => ({
      submittedCount: totals.submittedCount + (timesheet.status === 'SUBMITTED' ? 1 : 0),
      approvedCount: totals.approvedCount + (timesheet.status === 'APPROVED' ? 1 : 0),
      rejectedCount: totals.rejectedCount + (timesheet.status === 'REJECTED' ? 1 : 0),
      draftCount: totals.draftCount + (timesheet.status === 'DRAFT' ? 1 : 0),
      totalMinutes: totals.totalMinutes + timesheet.totalMinutes,
      approvedMinutes: totals.approvedMinutes + (timesheet.status === 'APPROVED' ? timesheet.totalMinutes : 0),
      pendingMinutes: totals.pendingMinutes + (timesheet.status === 'SUBMITTED' ? timesheet.totalMinutes : 0),
    }),
    { submittedCount: 0, approvedCount: 0, rejectedCount: 0, draftCount: 0, totalMinutes: 0, approvedMinutes: 0, pendingMinutes: 0 }
  );
}

/** Timesheet mais recente (pelo início do período) de cada colaborador. */
export function latestTimesheetByEmployee(timesheets: TimesheetSummary[]): Map<string, TimesheetSummary> {
  const latest = new Map<string, TimesheetSummary>();
  for (const timesheet of timesheets) {
    const current = latest.get(timesheet.employeeId);
    if (!current || timesheet.periodStart > current.periodStart) latest.set(timesheet.employeeId, timesheet);
  }
  return latest;
}

/** Data da última submissão/decisão de um timesheet (atividade relevante mais recente). */
export function lastActivityAt(timesheet: TimesheetSummary): string | null {
  const dates = [timesheet.submittedAt, timesheet.approvedAt, timesheet.rejectedAt].filter(
    (value): value is string => value !== null
  );
  return dates.sort().at(-1) ?? null;
}

/** Nome (e cargo) de quem decidiu; o servidor só expõe estes dados do gestor. */
export function describeReviewer(reviewer: TimesheetReviewer | null): string {
  if (!reviewer) return 'gestor responsável';
  return reviewer.jobTitle ? `${reviewer.name} (${reviewer.jobTitle})` : reviewer.name;
}
