import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type {
  CalendarEvent,
  CalendarItem,
  CalendarScope,
  MyWorkSummary,
  TeamMemberWorkload,
  WorkPerson,
} from '../../types/work';
import { isCalendarItemType } from '../../types/work';

/** Agenda operacional (tarefas, prazos, reuniões, ausências, atividades, eventos, oportunidades). */
export async function getCalendarItems(from: string, to: string, scope: CalendarScope): Promise<CalendarItem[]> {
  const { data, error } = await supabase.rpc('get_calendar_items', { p_from: from, p_to: to, p_scope: scope });
  if (error) throw toServiceError(error, 'Não foi possível carregar o calendário.');
  return data.flatMap((row) =>
    isCalendarItemType(row.item_type)
      ? [
          {
            itemType: row.item_type,
            itemId: row.item_id,
            title: row.title,
            startsAt: row.starts_at,
            endsAt: row.ends_at,
            allDay: row.all_day,
            status: row.status,
            personId: row.person_id,
            personName: row.person_name,
            reference: row.reference,
            isOverdue: row.is_overdue,
          },
        ]
      : []
  );
}

export async function getCalendarEvent(eventId: string): Promise<CalendarEvent | null> {
  const { data, error } = await supabase
    .from('calendar_events')
    .select('id, title, description, starts_at, ends_at, all_day, location, department_id, created_by')
    .eq('id', eventId)
    .maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar o evento.');
  return data
    ? {
        id: data.id,
        title: data.title,
        description: data.description,
        startsAt: data.starts_at,
        endsAt: data.ends_at,
        allDay: data.all_day,
        location: data.location,
        departmentId: data.department_id,
        createdBy: data.created_by,
      }
    : null;
}

export interface CalendarEventInput {
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  departmentId: string | null;
}

/** Escrita direta sob RLS (TIMESHEET_CALENDAR_MANAGE); o autor é definido pelo servidor. */
export async function createCalendarEvent(profileId: string, input: CalendarEventInput): Promise<void> {
  const { error } = await supabase.from('calendar_events').insert({
    title: input.title,
    description: input.description,
    starts_at: input.startsAt,
    ends_at: input.endsAt,
    all_day: input.allDay,
    location: input.location,
    department_id: input.departmentId,
    created_by: profileId,
  });
  if (error) throw toServiceError(error, 'Não foi possível criar o evento.');
}

export async function cancelCalendarEvent(eventId: string): Promise<void> {
  const { data, error } = await supabase.from('calendar_events').update({ status: 'CANCELLED' }).eq('id', eventId).select('id');
  if (error) throw toServiceError(error, 'Não foi possível cancelar o evento.');
  if (data.length === 0) throw toServiceError({ message: 'permission denied', code: '42501' }, 'Não foi possível cancelar o evento.');
}

export async function getMyWorkSummary(): Promise<MyWorkSummary> {
  const { data, error } = await supabase.rpc('get_my_work_summary');
  if (error) throw toServiceError(error, 'Não foi possível carregar o resumo do seu trabalho.');
  const row = data[0];
  return {
    tasksAssigned: row?.tasks_assigned ?? 0,
    tasksInProgress: row?.tasks_in_progress ?? 0,
    tasksBlocked: row?.tasks_blocked ?? 0,
    tasksOverdue: row?.tasks_overdue ?? 0,
    tasksDueToday: row?.tasks_due_today ?? 0,
    tasksDueNext7Days: row?.tasks_due_next_7_days ?? 0,
    minutesToday: row?.minutes_today ?? 0,
    minutesThisWeek: row?.minutes_this_week ?? 0,
    dailyTargetMinutes: row?.daily_target_minutes ?? 480,
    meetingsToday: row?.meetings_today ?? 0,
    absenceToday: row?.absence_today ?? null,
    pendingAbsenceRequests: row?.pending_absence_requests ?? 0,
  };
}

export async function getTeamWorkOverview(): Promise<TeamMemberWorkload[]> {
  const { data, error } = await supabase.rpc('get_team_work_overview');
  if (error) throw toServiceError(error, 'Não foi possível carregar a carga de trabalho da equipa.');
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    departmentName: row.department_name,
    tasksOpen: row.tasks_open,
    tasksInProgress: row.tasks_in_progress,
    tasksBlocked: row.tasks_blocked,
    tasksOverdue: row.tasks_overdue,
    tasksDueNext7Days: row.tasks_due_next_7_days,
    minutesThisWeek: row.minutes_this_week,
    absenceToday: row.absence_today,
    pendingAbsenceRequests: row.pending_absence_requests,
  }));
}

/** ASSIGNEE: responsáveis possíveis (âmbito). PARTICIPANT: colaboradores ativos (reuniões/membros). */
export async function listWorkPeople(purpose: 'ASSIGNEE' | 'PARTICIPANT'): Promise<WorkPerson[]> {
  const { data, error } = await supabase.rpc('list_work_people', { p_purpose: purpose });
  if (error) throw toServiceError(error, 'Não foi possível carregar os colaboradores.');
  return data.map((row) => ({ profileId: row.profile_id, fullName: row.full_name, jobTitle: row.job_title, departmentName: row.department_name }));
}
