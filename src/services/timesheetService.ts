import { supabase } from '../lib/supabase/client';
import { ServiceError, toServiceError } from '../lib/errors';
import type { Activity, ApprovalStatus, TimesheetSummary } from '../types';
import { isPresent, mapTimesheetSummary, TIMESHEET_SUMMARY_SELECT } from './mappers';

export interface TimesheetEntryDetail {
  id: string;
  workDate: string;
  activityId: string;
  activityName: string | null;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalMinutes: number;
  description: string;
}

/** Dados de quem decidiu, expostos pelo servidor de forma limitada (sem o restante perfil). */
export interface TimesheetReviewer {
  name: string;
  jobTitle: string | null;
  email: string | null;
}

export interface TimesheetDecision {
  id: string;
  status: ApprovalStatus;
  comment: string | null;
  createdAt: string;
  reviewer: TimesheetReviewer | null;
}

export interface TimesheetDetail {
  summary: TimesheetSummary;
  entries: TimesheetEntryDetail[];
  decisions: TimesheetDecision[];
}

export interface TimesheetEntryInput {
  workDate: string;
  activityId: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  description: string;
}

const DETAIL_SELECT =
  'id, employee_id, period_start, period_end, status, submitted_at, approved_at, rejected_at, rejection_reason, employee:profiles!timesheets_employee_id_fkey(full_name, employee_number, department:departments(id, name)), entries:timesheet_entries(id, work_date, activity_id, start_time, end_time, break_minutes, total_minutes, description, activity:activities(name))' as const;

const APPROVAL_STATUSES: readonly ApprovalStatus[] = ['PENDING', 'APPROVED', 'REJECTED'];

function isApprovalStatus(value: string): value is ApprovalStatus {
  return (APPROVAL_STATUSES as readonly string[]).includes(value);
}

/** Colunas TIME chegam como HH:MM:SS; a interface trabalha com HH:MM. */
function toHourMinute(time: string): string {
  return time.slice(0, 5);
}

export async function listMyTimesheets(profileId: string): Promise<TimesheetSummary[]> {
  const { data, error } = await supabase
    .from('timesheets')
    .select(TIMESHEET_SUMMARY_SELECT)
    .eq('employee_id', profileId)
    .order('period_start', { ascending: false });
  if (error) throw toServiceError(error, 'Não foi possível carregar os seus timesheets.');
  return data.map(mapTimesheetSummary).filter(isPresent);
}

/** Histórico de decisões (mais recentes primeiro), com nome, cargo e e-mail de quem decidiu. */
async function listTimesheetDecisions(timesheetId: string): Promise<TimesheetDecision[]> {
  const { data, error } = await supabase.rpc('get_timesheet_decisions', { p_timesheet_id: timesheetId });
  if (error) throw toServiceError(error, 'Não foi possível carregar o histórico de decisões.');
  return data.flatMap((decision) =>
    isApprovalStatus(decision.status)
      ? [
          {
            id: decision.decision_id,
            status: decision.status,
            comment: decision.comment,
            createdAt: decision.created_at,
            reviewer: decision.reviewer_name
              ? { name: decision.reviewer_name, jobTitle: decision.reviewer_job_title, email: decision.reviewer_email }
              : null,
          },
        ]
      : []
  );
}

/** Detalhe de um timesheet visível ao utilizador (a RLS decide: próprio, equipa ou administração). */
export async function getTimesheetDetail(timesheetId: string): Promise<TimesheetDetail | null> {
  const [timesheetResult, decisions] = await Promise.all([
    supabase.from('timesheets').select(DETAIL_SELECT).eq('id', timesheetId).maybeSingle(),
    listTimesheetDecisions(timesheetId),
  ]);
  const { data, error } = timesheetResult;
  if (error) throw toServiceError(error, 'Não foi possível carregar o timesheet.');
  if (!data) return null;

  const summary = mapTimesheetSummary(data);
  if (!summary) return null;

  return {
    summary,
    entries: data.entries
      .map((entry) => ({
        id: entry.id,
        workDate: entry.work_date,
        activityId: entry.activity_id,
        activityName: entry.activity?.name ?? null,
        startTime: toHourMinute(entry.start_time),
        endTime: toHourMinute(entry.end_time),
        breakMinutes: entry.break_minutes,
        totalMinutes: entry.total_minutes,
        description: entry.description,
      }))
      .sort((first, second) => first.workDate.localeCompare(second.workDate) || first.startTime.localeCompare(second.startTime)),
    decisions,
  };
}

export async function createTimesheet(profileId: string, periodStart: string, periodEnd: string): Promise<string> {
  const { data, error } = await supabase
    .from('timesheets')
    .insert({ employee_id: profileId, period_start: periodStart, period_end: periodEnd })
    .select('id')
    .single();
  if (error) throw toServiceError(error, 'Não foi possível criar o período.');
  return data.id;
}

/** O total de minutos é calculado pelo servidor a partir das horas e da pausa. */
export async function saveTimesheetEntry(
  timesheetId: string,
  profileId: string,
  input: TimesheetEntryInput,
  entryId?: string
): Promise<void> {
  const payload = {
    work_date: input.workDate,
    activity_id: input.activityId,
    start_time: input.startTime,
    end_time: input.endTime,
    break_minutes: input.breakMinutes,
    description: input.description,
  };
  const { error } = entryId
    ? await supabase.from('timesheet_entries').update(payload).eq('id', entryId)
    : await supabase.from('timesheet_entries').insert({ ...payload, timesheet_id: timesheetId, employee_id: profileId });
  if (error) throw toServiceError(error, 'Não foi possível guardar o registo de horas.');
}

export async function deleteTimesheetEntry(entryId: string): Promise<void> {
  const { data, error } = await supabase.from('timesheet_entries').delete().eq('id', entryId).select('id');
  if (error) throw toServiceError(error, 'Não foi possível eliminar o registo.');
  if (data.length === 0) throw new ServiceError('O registo não pode ser eliminado: o timesheet já não está editável.');
}

export async function submitTimesheet(timesheetId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_timesheet', { p_timesheet_id: timesheetId });
  if (error) throw toServiceError(error, 'Não foi possível submeter o timesheet.');
}

export async function listActiveActivities(): Promise<Activity[]> {
  const { data, error } = await supabase.from('activities').select('*').eq('active', true).order('name');
  if (error) throw toServiceError(error, 'Não foi possível carregar as atividades.');
  return data;
}
