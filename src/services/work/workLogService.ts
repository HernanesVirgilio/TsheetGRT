import { supabase } from '../../lib/supabase/client';
import { ServiceError, toServiceError } from '../../lib/errors';
import type { EntryKind, WorkLogEntry, WorkTimeTotal } from '../../types/work';
import { isEntryKind } from '../../types/work';
import { isPresent } from '../mappers';

/**
 * Registo de tempo com contexto. Reutiliza timesheet_entries (fonte única do tempo): o servidor
 * garante o período do colaborador (ensure_my_timesheet_period) e o registo é inserido sob a RLS
 * existente; o contexto (tarefa/reunião/oportunidade) é validado por trigger no servidor.
 */

const ENTRY_SELECT =
  'id, timesheet_id, employee_id, work_date, start_time, end_time, break_minutes, total_minutes, description, kind, activity_id, activity:activities(name), task:tasks(id, reference, title), meeting:meetings(id, title), opportunity:opportunities(id, reference, title), timesheet:timesheets(status)' as const;

interface EntryRow {
  id: string;
  timesheet_id: string;
  employee_id: string;
  work_date: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_minutes: number;
  description: string;
  kind: string;
  activity_id: string;
  activity: { name: string } | null;
  task: { id: string; reference: string; title: string } | null;
  meeting: { id: string; title: string } | null;
  opportunity: { id: string; reference: string; title: string } | null;
  timesheet: { status: string } | null;
}

function mapEntry(row: EntryRow): WorkLogEntry | null {
  if (!isEntryKind(row.kind)) return null;
  return {
    id: row.id,
    timesheetId: row.timesheet_id,
    timesheetStatus: row.timesheet?.status ?? 'DRAFT',
    employeeId: row.employee_id,
    workDate: row.work_date,
    startTime: row.start_time.slice(0, 5),
    endTime: row.end_time.slice(0, 5),
    breakMinutes: row.break_minutes,
    totalMinutes: row.total_minutes,
    description: row.description,
    kind: row.kind,
    activityId: row.activity_id,
    activityName: row.activity?.name ?? null,
    task: row.task,
    meeting: row.meeting,
    opportunity: row.opportunity,
  };
}

export interface WorkLogQuery {
  employeeId: string;
  from: string;
  to: string;
  kind: EntryKind | null;
}

export async function listWorkLog(query: WorkLogQuery): Promise<WorkLogEntry[]> {
  let request = supabase
    .from('timesheet_entries')
    .select(ENTRY_SELECT)
    .eq('employee_id', query.employeeId)
    .gte('work_date', query.from)
    .lte('work_date', query.to)
    .order('work_date', { ascending: false })
    .order('start_time', { ascending: false })
    .limit(500);
  if (query.kind) request = request.eq('kind', query.kind);
  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar as atividades.');
  return data.map(mapEntry).filter(isPresent);
}

/** Registos de tempo ligados a uma tarefa, reunião ou oportunidade (visíveis segundo a RLS). */
export async function listContextEntries(column: 'task_id' | 'meeting_id' | 'opportunity_id', id: string): Promise<WorkLogEntry[]> {
  const { data, error } = await supabase
    .from('timesheet_entries')
    .select(ENTRY_SELECT)
    .eq(column, id)
    .order('work_date', { ascending: false })
    .limit(200);
  if (error) throw toServiceError(error, 'Não foi possível carregar o tempo registado.');
  return data.map(mapEntry).filter(isPresent);
}

/** Registos de tempo de um período (revisão do timesheet com contexto). */
export async function listTimesheetContext(timesheetId: string): Promise<WorkLogEntry[]> {
  const { data, error } = await supabase.from('timesheet_entries').select(ENTRY_SELECT).eq('timesheet_id', timesheetId);
  if (error) throw toServiceError(error, 'Não foi possível carregar o contexto do timesheet.');
  return data.map(mapEntry).filter(isPresent);
}

export interface WorkLogInput {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  activityId: string;
  kind: EntryKind;
  taskId: string | null;
  meetingId: string | null;
  opportunityId: string | null;
  description: string;
}

export async function createWorkLog(employeeId: string, input: WorkLogInput): Promise<void> {
  const period = await supabase.rpc('ensure_my_timesheet_period', { p_work_date: input.workDate });
  if (period.error) throw toServiceError(period.error, 'Não foi possível preparar o período do timesheet.');
  const { error } = await supabase.from('timesheet_entries').insert({
    timesheet_id: period.data,
    employee_id: employeeId,
    work_date: input.workDate,
    start_time: input.startTime,
    end_time: input.endTime,
    break_minutes: input.breakMinutes,
    activity_id: input.activityId,
    description: input.description,
    kind: input.kind,
    task_id: input.taskId,
    meeting_id: input.meetingId,
    opportunity_id: input.kind === 'OPPORTUNITY' ? input.opportunityId : null,
  });
  if (error) throw toServiceError(error, 'Não foi possível registar a atividade.');
}

export async function deleteWorkLog(entryId: string): Promise<void> {
  const { data, error } = await supabase.from('timesheet_entries').delete().eq('id', entryId).select('id');
  if (error) throw toServiceError(error, 'Não foi possível eliminar o registo.');
  if (data.length === 0) throw new ServiceError('O registo não pode ser eliminado: o período já foi submetido.');
}

export async function getWorkTimeTotals(entityType: 'TASK' | 'MEETING' | 'OPPORTUNITY', entityId: string): Promise<WorkTimeTotal[]> {
  const { data, error } = await supabase.rpc('get_work_time_totals', { p_entity_type: entityType, p_entity_id: entityId });
  if (error) throw toServiceError(error, 'Não foi possível carregar o tempo dedicado.');
  return data.map((row) => ({ profileId: row.profile_id, fullName: row.full_name, totalMinutes: row.total_minutes, entryCount: row.entry_count }));
}
