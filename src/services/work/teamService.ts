import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type {
  OpportunityPipelineRow,
  SupervisionRow,
  TeamActivityItem,
  TeamDashboard,
  TeamReportRow,
  TrendPoint,
} from '../../types/work';

/**
 * Painéis do gestor e do Manager. Todos os totais são calculados no servidor e limitados ao âmbito
 * de quem consulta (equipa direta do gestor; gestores supervisionados e as suas equipas para o Manager;
 * a organização inteira para a administração).
 */

export interface ReportFilters {
  from: string;
  to: string;
  departmentId: string | null;
  /** Gestor cujas equipas se analisam (null = todo o âmbito). */
  leadId: string | null;
}

export async function getTeamDashboard(from: string, to: string): Promise<TeamDashboard> {
  const { data, error } = await supabase.rpc('get_team_dashboard', { p_from: from, p_to: to });
  if (error) throw toServiceError(error, 'Não foi possível carregar o resumo da equipa.');
  const row = data[0];
  return {
    teamSize: row?.team_size ?? 0,
    tasksInProgress: row?.tasks_in_progress ?? 0,
    tasksBlocked: row?.tasks_blocked ?? 0,
    tasksOverdue: row?.tasks_overdue ?? 0,
    tasksCompleted: row?.tasks_completed ?? 0,
    tasksCompletedLate: row?.tasks_completed_late ?? 0,
    tasksPendingFollowUp: row?.tasks_pending_follow_up ?? 0,
    absencesToValidate: row?.absences_to_validate ?? 0,
    absencesAwaitingDecision: row?.absences_awaiting_decision ?? 0,
    opportunitiesActive: row?.opportunities_active ?? 0,
    opportunityApprovalsPending: row?.opportunity_approvals_pending ?? 0,
    meetingsNext7Days: row?.meetings_next_7_days ?? 0,
    minutesLogged: row?.minutes_logged ?? 0,
  };
}

/** Oportunidades da equipa por moeda: os montantes nunca são somados entre moedas diferentes. */
export async function getOpportunityPipeline(): Promise<OpportunityPipelineRow[]> {
  const { data, error } = await supabase.rpc('get_opportunity_pipeline');
  if (error) throw toServiceError(error, 'Não foi possível carregar as oportunidades da equipa.');
  return data.map((row) => ({
    currency: row.currency,
    opportunitiesActive: row.opportunities_active,
    estimatedValueActive: Number(row.estimated_value_active),
    weightedValueActive: Number(row.weighted_value_active),
    approvalsPending: row.approvals_pending,
    wonLast90Days: row.won_last_90_days,
    wonValueLast90Days: Number(row.won_value_last_90_days),
  }));
}

export async function getTeamReport(filters: ReportFilters): Promise<TeamReportRow[]> {
  const { data, error } = await supabase.rpc('get_team_report', {
    p_from: filters.from,
    p_to: filters.to,
    p_department_id: filters.departmentId,
    p_lead_id: filters.leadId,
  });
  if (error) throw toServiceError(error, 'Não foi possível carregar o relatório da equipa.');
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    departmentName: row.department_name,
    leadNames: row.lead_names,
    tasksCompleted: row.tasks_completed,
    tasksCompletedLate: row.tasks_completed_late,
    tasksOpen: row.tasks_open,
    tasksOverdue: row.tasks_overdue,
    tasksBlocked: row.tasks_blocked,
    minutesLogged: row.minutes_logged,
    entryCount: row.entry_count,
  }));
}

export async function getCompletionTrend(filters: ReportFilters): Promise<TrendPoint[]> {
  const { data, error } = await supabase.rpc('get_team_completion_trend', {
    p_from: filters.from,
    p_to: filters.to,
    p_department_id: filters.departmentId,
    p_lead_id: filters.leadId,
  });
  if (error) throw toServiceError(error, 'Não foi possível carregar a evolução da equipa.');
  return data.map((row) => ({
    weekStart: row.week_start,
    tasksCompleted: row.tasks_completed,
    tasksCompletedLate: row.tasks_completed_late,
    minutesLogged: row.minutes_logged,
  }));
}

/** Visão do Manager: uma linha por gestor supervisionado (e a equipa direta, se existir). */
export async function getSupervisionOverview(from: string, to: string): Promise<SupervisionRow[]> {
  const { data, error } = await supabase.rpc('get_supervision_overview', { p_from: from, p_to: to });
  if (error) throw toServiceError(error, 'Não foi possível carregar a supervisão das equipas.');
  return data.map((row) => ({
    leadId: row.lead_id,
    leadName: row.lead_name,
    departments: row.departments,
    teamSize: row.team_size,
    tasksCompleted: row.tasks_completed,
    tasksCompletedLate: row.tasks_completed_late,
    tasksOpen: row.tasks_open,
    tasksOverdue: row.tasks_overdue,
    tasksBlocked: row.tasks_blocked,
    minutesLogged: row.minutes_logged,
    absencesPending: row.absences_pending,
    approvalsPending: row.approvals_pending,
  }));
}

/** Descrição da função de um colaborador do âmbito (permissão TEAM_JOB_DESCRIPTION_UPDATE, auditada). */
export async function updateJobDescription(profileId: string, description: string | null): Promise<void> {
  const { error } = await supabase.rpc('update_team_member_job_description', { p_profile_id: profileId, p_description: description });
  if (error) throw toServiceError(error, 'Não foi possível guardar a descrição da função.');
}

const ACTIVITY_EVENTS = [
  'TASK_ASSIGNED',
  'TASK_REASSIGNED',
  'TASK_STARTED',
  'TASK_BLOCKED',
  'TASK_UNBLOCKED',
  'TASK_COMPLETED',
  'TASK_COMPLETED_LATE',
  'TASK_REOPENED',
  'TASK_CANCELLED',
  'TASK_REVIEWED',
];

/** Atividade recente nas tarefas visíveis (RLS: próprias, criadas e da equipa do âmbito). */
export async function listRecentTeamActivity(limit = 8): Promise<TeamActivityItem[]> {
  const { data, error } = await supabase
    .from('task_events')
    .select('id, task_id, event_type, field, actor_name, created_at, task:tasks(reference, title)')
    .in('event_type', ACTIVITY_EVENTS)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toServiceError(error, 'Não foi possível carregar a atividade recente.');
  return data.map((row) => ({
    id: row.id,
    taskId: row.task_id,
    taskReference: row.task?.reference ?? '—',
    taskTitle: row.task?.title ?? '',
    eventType: row.event_type,
    field: row.field,
    actorName: row.actor_name,
    createdAt: row.created_at,
  }));
}
