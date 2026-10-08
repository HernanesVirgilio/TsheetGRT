import type { TimesheetStatus, TimesheetSummary } from '../types';

/** Mantido como alias: os relatórios trabalham sobre o resumo comum de timesheets. */
export type ReportTimesheet = TimesheetSummary;

export interface ReportGroup {
  key: string;
  label: string;
  timesheetCount: number;
  totalMinutes: number;
  approvedCount: number;
  submittedCount: number;
  openCount: number;
}

const OPEN_STATUSES: readonly TimesheetStatus[] = ['DRAFT', 'REJECTED'];

/** Agrega timesheets por uma chave (colaborador, departamento, período). Ordena por rótulo. */
export function groupTimesheets(
  timesheets: ReportTimesheet[],
  keyOf: (timesheet: ReportTimesheet) => string,
  labelOf: (timesheet: ReportTimesheet) => string
): ReportGroup[] {
  const groups = new Map<string, ReportGroup>();

  for (const timesheet of timesheets) {
    const key = keyOf(timesheet);
    const group = groups.get(key) ?? {
      key,
      label: labelOf(timesheet),
      timesheetCount: 0,
      totalMinutes: 0,
      approvedCount: 0,
      submittedCount: 0,
      openCount: 0,
    };
    group.timesheetCount += 1;
    group.totalMinutes += timesheet.totalMinutes;
    if (timesheet.status === 'APPROVED') group.approvedCount += 1;
    if (timesheet.status === 'SUBMITTED') group.submittedCount += 1;
    if (OPEN_STATUSES.includes(timesheet.status)) group.openCount += 1;
    groups.set(key, group);
  }

  return [...groups.values()].sort((first, second) => first.label.localeCompare(second.label, 'pt-PT'));
}

export const NO_DEPARTMENT_LABEL = 'Sem departamento';

export function isOpenTimesheet(timesheet: ReportTimesheet): boolean {
  return OPEN_STATUSES.includes(timesheet.status);
}

export function sumMinutes(items: { totalMinutes: number }[]): number {
  return items.reduce((total, item) => total + item.totalMinutes, 0);
}
