import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type { TaskDetail, TaskStatus, TaskSummary, WorkEvent, WorkPriority } from '../../types/work';
import { isTaskStatus, isWorkPriority } from '../../types/work';
import { isPresent } from '../mappers';
import { toIlikePattern } from '../../utils/validation';
import { mapWorkEvent, WORK_EVENT_COLUMNS } from './workEvents';

/**
 * Tarefas. A leitura é feita sob RLS (próprias, criadas, equipa do âmbito, administração);
 * todas as alterações passam pelas funções do servidor, que validam permissão, âmbito e estado.
 */

const TASK_SELECT =
  'id, reference, title, description, status, priority, assignee_id, created_by, department_id, start_date, due_at, estimated_minutes, started_at, completed_at, completion_note, late_reason, blocked_reason, cancel_reason, parent_task_id, opportunity_id, meeting_id, created_at, updated_at, assignee:profiles!tasks_assignee_id_fkey(full_name), creator:profiles!tasks_created_by_fkey(full_name), department:departments(name), opportunity:opportunities(id, reference, title), meeting:meetings(id, title)' as const;

interface TaskRow {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  assignee_id: string | null;
  created_by: string;
  department_id: string | null;
  start_date: string | null;
  due_at: string | null;
  estimated_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  late_reason: string | null;
  blocked_reason: string | null;
  cancel_reason: string | null;
  created_at: string;
  updated_at: string;
  assignee: { full_name: string } | null;
  creator: { full_name: string } | null;
  department: { name: string } | null;
  parent_task_id: string | null;
  opportunity: { id: string; reference: string; title: string } | null;
  meeting: { id: string; title: string } | null;
}

function mapTask(row: TaskRow): TaskDetail | null {
  if (!isTaskStatus(row.status) || !isWorkPriority(row.priority)) return null;
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    assigneeId: row.assignee_id,
    assigneeName: row.assignee?.full_name ?? null,
    createdBy: row.created_by,
    creatorName: row.creator?.full_name ?? null,
    departmentId: row.department_id,
    departmentName: row.department?.name ?? null,
    startDate: row.start_date,
    dueAt: row.due_at,
    estimatedMinutes: row.estimated_minutes,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    completionNote: row.completion_note,
    lateReason: row.late_reason,
    blockedReason: row.blocked_reason,
    cancelReason: row.cancel_reason,
    parentTask: null,
    opportunity: row.opportunity,
    meeting: row.meeting,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const OPEN_STATUSES: TaskStatus[] = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'];

export type TaskScope = 'MINE' | 'TEAM' | 'CREATED';

export interface TaskQuery {
  scope: TaskScope;
  viewerId: string;
  search: string;
  statuses: TaskStatus[];
  priority: WorkPriority | null;
  assigneeId: string | null;
  overdueOnly: boolean;
  page: number;
  pageSize: number;
}

export interface TaskPage {
  items: TaskSummary[];
  total: number;
}

/** Lista paginada no servidor; prazos mais próximos primeiro (sem prazo no fim). */
export async function listTasks(query: TaskQuery): Promise<TaskPage> {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from('tasks')
    .select(TASK_SELECT, { count: 'exact' })
    .order('due_at', { ascending: true, nullsFirst: false })
    .order('updated_at', { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.scope === 'MINE') request = request.eq('assignee_id', query.viewerId);
  if (query.scope === 'CREATED') request = request.eq('created_by', query.viewerId);
  if (query.statuses.length > 0) request = request.in('status', query.statuses);
  if (query.priority) request = request.eq('priority', query.priority);
  if (query.assigneeId) request = request.eq('assignee_id', query.assigneeId);
  if (query.overdueOnly) request = request.lt('due_at', new Date().toISOString()).in('status', OPEN_STATUSES);
  const search = query.search.trim();
  if (search) {
    const pattern = toIlikePattern(search);
    request = request.or(`reference.ilike.${pattern},title.ilike.${pattern}`);
  }

  const { data, error, count } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar as tarefas.');
  return { items: data.map(mapTask).filter(isPresent), total: count ?? data.length };
}

/** Tarefas em aberto do próprio (centro de trabalho). */
export async function listMyOpenTasks(viewerId: string): Promise<TaskSummary[]> {
  const { data, error } = await supabase
    .from('tasks')
    .select(TASK_SELECT)
    .eq('assignee_id', viewerId)
    .in('status', ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'])
    .order('due_at', { ascending: true, nullsFirst: false })
    .limit(100);
  if (error) throw toServiceError(error, 'Não foi possível carregar as suas tarefas.');
  return data.map(mapTask).filter(isPresent);
}

/** Tarefas relacionadas: tarefas adicionais, de uma oportunidade ou geradas por uma reunião. */
export async function listRelatedTasks(relation: 'parent_task_id' | 'opportunity_id' | 'meeting_id', id: string): Promise<TaskSummary[]> {
  const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq(relation, id).order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar as tarefas relacionadas.');
  return data.map(mapTask).filter(isPresent);
}

/** Devolve null se a tarefa não existir ou não for visível para quem consulta. */
export async function getTask(taskId: string): Promise<TaskDetail | null> {
  const { data, error } = await supabase.from('tasks').select(TASK_SELECT).eq('id', taskId).maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar a tarefa.');
  const task = data ? mapTask(data) : null;
  if (!task || !data?.parent_task_id) return task;
  // Tarefa de origem (tarefa adicional): só é visível se a RLS o permitir.
  const parent = await supabase.from('tasks').select('id, reference, title').eq('id', data.parent_task_id).maybeSingle();
  if (parent.error) throw toServiceError(parent.error, 'Não foi possível carregar a tarefa de origem.');
  return { ...task, parentTask: parent.data };
}

export async function listTaskEvents(taskId: string): Promise<WorkEvent[]> {
  const { data, error } = await supabase
    .from('task_events')
    .select(`${WORK_EVENT_COLUMNS}, after_closure`)
    .eq('task_id', taskId)
    .order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar o histórico da tarefa.');
  return data.map(mapWorkEvent);
}

// ---------------------------------------------------------------------------- ações

export interface NewTaskInput {
  title: string;
  description: string;
  priority: WorkPriority;
  assigneeId: string | null;
  dueAt: string | null;
  startDate: string | null;
  estimatedMinutes: number | null;
  parentTaskId?: string | null;
  opportunityId?: string | null;
  meetingId?: string | null;
}

export async function createTask(input: NewTaskInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_task', {
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_assignee_id: input.assigneeId,
    p_due_at: input.dueAt,
    p_start_date: input.startDate,
    p_estimated_minutes: input.estimatedMinutes,
    p_parent_task_id: input.parentTaskId ?? null,
    p_opportunity_id: input.opportunityId ?? null,
    p_meeting_id: input.meetingId ?? null,
  });
  if (error) throw toServiceError(error, 'Não foi possível criar a tarefa.');
  return data;
}

export interface TaskPlanningInput {
  title: string;
  description: string;
  priority: WorkPriority;
  dueAt: string | null;
  startDate: string | null;
  estimatedMinutes: number | null;
  departmentId: string | null;
  reason: string | null;
  /** Versão lida pelo cliente: o servidor recusa se outra pessoa alterou entretanto. */
  expectedUpdatedAt: string;
}

export async function updateTask(taskId: string, input: TaskPlanningInput): Promise<void> {
  const { error } = await supabase.rpc('update_task', {
    p_task_id: taskId,
    p_title: input.title,
    p_description: input.description,
    p_priority: input.priority,
    p_due_at: input.dueAt,
    p_start_date: input.startDate,
    p_estimated_minutes: input.estimatedMinutes,
    p_department_id: input.departmentId,
    p_reason: input.reason,
    p_expected_updated_at: input.expectedUpdatedAt,
  });
  if (error) throw toServiceError(error, 'Não foi possível guardar a tarefa.');
}

async function runTaskAction(action: PromiseLike<{ error: { message: string; code?: string } | null }>, fallback: string): Promise<void> {
  const { error } = await action;
  if (error) throw toServiceError(error, fallback);
}

export const assignTask = (taskId: string, assigneeId: string | null, note: string | null) =>
  runTaskAction(supabase.rpc('assign_task', { p_task_id: taskId, p_assignee_id: assigneeId, p_note: note }), 'Não foi possível atribuir a tarefa.');

export const startTask = (taskId: string) =>
  runTaskAction(supabase.rpc('start_task', { p_task_id: taskId }), 'Não foi possível iniciar a tarefa.');

export const blockTask = (taskId: string, reason: string) =>
  runTaskAction(supabase.rpc('block_task', { p_task_id: taskId, p_reason: reason }), 'Não foi possível registar o bloqueio.');

export const unblockTask = (taskId: string, note: string | null) =>
  runTaskAction(supabase.rpc('unblock_task', { p_task_id: taskId, p_note: note }), 'Não foi possível desbloquear a tarefa.');

export const completeTask = (taskId: string, completionNote: string | null, lateReason: string | null) =>
  runTaskAction(
    supabase.rpc('complete_task', { p_task_id: taskId, p_completion_note: completionNote, p_late_reason: lateReason }),
    'Não foi possível concluir a tarefa.'
  );

export const reopenTask = (taskId: string, reason: string, newDueAt: string | null) =>
  runTaskAction(supabase.rpc('reopen_task', { p_task_id: taskId, p_reason: reason, p_new_due_at: newDueAt }), 'Não foi possível reabrir a tarefa.');

export const cancelTask = (taskId: string, reason: string) =>
  runTaskAction(supabase.rpc('cancel_task', { p_task_id: taskId, p_reason: reason }), 'Não foi possível cancelar a tarefa.');

export const addTaskComment = (taskId: string, body: string) =>
  runTaskAction(supabase.rpc('add_task_comment', { p_task_id: taskId, p_body: body }), 'Não foi possível enviar o comentário.');
