import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type { MeetingDetail, MeetingLead, MeetingPerson, MeetingStatus, MeetingSummary, ScheduleConflict, WorkEvent } from '../../types/work';
import { isMeetingRequestStatus, isMeetingResponse, isMeetingStatus } from '../../types/work';
import { isPresent } from '../mappers';
import { toIlikePattern } from '../../utils/validation';
import { mapWorkEvent, WORK_EVENT_COLUMNS } from './workEvents';
import { t } from '../../lib/i18n';

const MEETING_SELECT =
  'id, title, description, objective, starts_at, ends_at, location, meeting_url, organizer_id, status, outcome, decisions, next_steps, cancel_reason, request_status, requested_with, request_decided_at, request_decision_comment, updated_at, organizer:profiles!meetings_organizer_id_fkey(full_name), task:tasks!meetings_task_id_fkey(id, reference, title), opportunity:opportunities(id, reference, title)' as const;

interface MeetingRow {
  id: string;
  title: string;
  description: string;
  objective: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  meeting_url: string | null;
  organizer_id: string;
  status: string;
  outcome: string | null;
  decisions: string | null;
  next_steps: string | null;
  cancel_reason: string | null;
  request_status: string | null;
  requested_with: string | null;
  request_decided_at: string | null;
  request_decision_comment: string | null;
  updated_at: string;
  organizer: { full_name: string } | null;
  task: { id: string; reference: string; title: string } | null;
  opportunity: { id: string; reference: string; title: string } | null;
}

function mapMeeting(row: MeetingRow): MeetingDetail | null {
  if (!isMeetingStatus(row.status)) return null;
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    objective: row.objective,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
    location: row.location,
    meetingUrl: row.meeting_url,
    organizerId: row.organizer_id,
    organizerName: row.organizer?.full_name ?? null,
    status: row.status,
    outcome: row.outcome,
    decisions: row.decisions,
    nextSteps: row.next_steps,
    cancelReason: row.cancel_reason,
    requestStatus: row.request_status && isMeetingRequestStatus(row.request_status) ? row.request_status : null,
    requestedWith: row.requested_with,
    requestDecidedAt: row.request_decided_at,
    requestDecisionComment: row.request_decision_comment,
    task: row.task,
    opportunity: row.opportunity,
    updatedAt: row.updated_at,
  };
}

export interface MeetingQuery {
  /** MINE: organizo ou participo. TEAM: tudo o que a RLS deixa ver (equipa do âmbito). */
  scope: 'MINE' | 'TEAM';
  viewerId: string;
  when: 'UPCOMING' | 'PAST';
  status: MeetingStatus | null;
  search: string;
  page: number;
  pageSize: number;
}

export async function listMeetings(query: MeetingQuery): Promise<{ items: MeetingSummary[]; total: number }> {
  const from = (query.page - 1) * query.pageSize;
  const now = new Date().toISOString();
  let request = supabase
    .from('meetings')
    .select(MEETING_SELECT, { count: 'exact' })
    .order('starts_at', { ascending: query.when === 'UPCOMING' })
    .range(from, from + query.pageSize - 1);
  request = query.when === 'UPCOMING' ? request.gte('ends_at', now) : request.lt('ends_at', now);
  if (query.status) request = request.eq('status', query.status);
  const search = query.search.trim();
  if (search) request = request.ilike('title', toIlikePattern(search));
  if (query.scope === 'MINE') {
    const participation = await supabase.from('meeting_participants').select('meeting_id').eq('profile_id', query.viewerId);
    if (participation.error) throw toServiceError(participation.error, t('Não foi possível carregar as reuniões.'));
    const ids = participation.data.map((row) => row.meeting_id);
    request = request.or(ids.length > 0 ? `organizer_id.eq.${query.viewerId},id.in.(${ids.join(',')})` : `organizer_id.eq.${query.viewerId}`);
  }
  const { data, error, count } = await request;
  if (error) throw toServiceError(error, t('Não foi possível carregar as reuniões.'));
  return { items: data.map(mapMeeting).filter(isPresent), total: count ?? data.length };
}

export async function listRelatedMeetings(column: 'task_id' | 'opportunity_id', id: string): Promise<MeetingSummary[]> {
  const { data, error } = await supabase.from('meetings').select(MEETING_SELECT).eq(column, id).order('starts_at', { ascending: false });
  if (error) throw toServiceError(error, t('Não foi possível carregar as reuniões relacionadas.'));
  return data.map(mapMeeting).filter(isPresent);
}

export async function getMeeting(meetingId: string): Promise<MeetingDetail | null> {
  const { data, error } = await supabase.from('meetings').select(MEETING_SELECT).eq('id', meetingId).maybeSingle();
  if (error) throw toServiceError(error, t('Não foi possível carregar a reunião.'));
  return data ? mapMeeting(data) : null;
}

export async function listMeetingEvents(meetingId: string): Promise<WorkEvent[]> {
  const { data, error } = await supabase
    .from('meeting_events')
    .select(`${WORK_EVENT_COLUMNS}, after_closure`)
    .eq('meeting_id', meetingId)
    .order('created_at');
  if (error) throw toServiceError(error, t('Não foi possível carregar o histórico da reunião.'));
  return data.map(mapWorkEvent);
}

export async function getMeetingPeople(meetingId: string): Promise<MeetingPerson[]> {
  const { data, error } = await supabase.rpc('get_meeting_people', { p_meeting_id: meetingId });
  if (error) throw toServiceError(error, t('Não foi possível carregar os participantes.'));
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    isOrganizer: row.is_organizer,
    response: isMeetingResponse(row.response) ? row.response : 'PENDING',
    respondedAt: row.responded_at,
    responseComment: row.response_comment,
  }));
}

/** Resposta de um convidado (aceitar ou recusar); o organizador é notificado. */
export async function respondToMeeting(meetingId: string, response: 'ACCEPTED' | 'DECLINED', comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('respond_to_meeting', { p_meeting_id: meetingId, p_response: response, p_comment: comment });
  if (error) throw toServiceError(error, t('Não foi possível registar a resposta.'));
}

/** Chefias configuradas de quem pede. Sem relação configurada, a lista vem vazia. */
export async function listMyLeads(): Promise<MeetingLead[]> {
  const { data, error } = await supabase.rpc('list_my_leads');
  if (error) throw toServiceError(error, t('Não foi possível carregar as suas chefias.'));
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    relation: row.relation === 'SUPERVISOR' ? 'SUPERVISOR' : 'LEAD',
  }));
}

export interface MeetingRequestInput {
  leadId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  agenda: string;
  location: string | null;
  meetingUrl: string | null;
}

/** Pedido de reunião a uma chefia: fica pendente até ser aceite ou recusado. */
export async function requestMeeting(input: MeetingRequestInput): Promise<string> {
  const { data, error } = await supabase.rpc('request_meeting', {
    p_lead_id: input.leadId,
    p_title: input.title,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_agenda: input.agenda,
    p_location: input.location,
    p_meeting_url: input.meetingUrl,
  });
  if (error) throw toServiceError(error, t('Não foi possível enviar o pedido de reunião.'));
  return data;
}

export async function decideMeetingRequest(meetingId: string, decision: 'ACCEPTED' | 'REJECTED', comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('decide_meeting_request', { p_meeting_id: meetingId, p_decision: decision, p_comment: comment });
  if (error) throw toServiceError(error, t('Não foi possível registar a decisão.'));
}

/** Pedidos de reunião à espera da resposta de quem consulta. */
export async function listPendingMeetingRequests(viewerId: string): Promise<MeetingSummary[]> {
  const { data, error } = await supabase
    .from('meetings')
    .select(MEETING_SELECT)
    .eq('requested_with', viewerId)
    .eq('request_status', 'PENDING')
    .eq('status', 'PLANNED')
    .order('starts_at')
    .limit(100);
  if (error) throw toServiceError(error, t('Não foi possível carregar os pedidos de reunião.'));
  return data.map(mapMeeting).filter(isPresent);
}

export interface MeetingInput {
  title: string;
  startsAt: string;
  endsAt: string;
  description: string;
  objective: string;
  location: string | null;
  meetingUrl: string | null;
  participantIds: string[];
}

export async function createMeeting(input: MeetingInput, links: { taskId?: string | null; opportunityId?: string | null } = {}): Promise<string> {
  const { data, error } = await supabase.rpc('create_meeting', {
    p_title: input.title,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_description: input.description,
    p_objective: input.objective,
    p_location: input.location,
    p_meeting_url: input.meetingUrl,
    p_participant_ids: input.participantIds,
    p_task_id: links.taskId ?? null,
    p_opportunity_id: links.opportunityId ?? null,
  });
  if (error) throw toServiceError(error, t('Não foi possível criar a reunião.'));
  return data;
}

export async function updateMeeting(meetingId: string, input: MeetingInput, expectedUpdatedAt: string): Promise<void> {
  const { error } = await supabase.rpc('update_meeting', {
    p_meeting_id: meetingId,
    p_title: input.title,
    p_starts_at: input.startsAt,
    p_ends_at: input.endsAt,
    p_description: input.description,
    p_objective: input.objective,
    p_location: input.location,
    p_meeting_url: input.meetingUrl,
    p_participant_ids: input.participantIds,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw toServiceError(error, t('Não foi possível guardar a reunião.'));
}

export interface ConflictQuery {
  profileIds: string[];
  startsAt: string;
  endsAt: string;
  /** Na edição, a própria reunião não conta como conflito. */
  excludeMeetingId?: string | null;
  links?: { taskId?: string | null; opportunityId?: string | null };
}

/**
 * Reuniões ativas e ausências aprovadas que se sobrepõem ao intervalo. O servidor só consulta pessoas que
 * quem organiza pode convidar e só devolve o título das reuniões que essa pessoa pode ver.
 */
export async function getScheduleConflicts(query: ConflictQuery): Promise<ScheduleConflict[]> {
  const { data, error } = await supabase.rpc('get_schedule_conflicts', {
    p_profile_ids: query.profileIds,
    p_starts_at: query.startsAt,
    p_ends_at: query.endsAt,
    p_exclude_meeting_id: query.excludeMeetingId ?? null,
    p_task_id: query.links?.taskId ?? null,
    p_opportunity_id: query.links?.opportunityId ?? null,
  });
  if (error) throw toServiceError(error, t('Não foi possível verificar a disponibilidade dos participantes.'));
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    kind: row.conflict_type === 'ABSENCE' ? 'ABSENCE' : 'MEETING',
    meetingId: row.meeting_id,
    title: row.title,
    startsAt: row.starts_at,
    endsAt: row.ends_at,
  }));
}

export async function confirmMeeting(meetingId: string): Promise<void> {
  const { error } = await supabase.rpc('confirm_meeting', { p_meeting_id: meetingId });
  if (error) throw toServiceError(error, t('Não foi possível confirmar a reunião.'));
}

export interface MeetingOutcomeInput {
  outcome: string;
  decisions: string | null;
  nextSteps: string | null;
}

export async function completeMeeting(meetingId: string, input: MeetingOutcomeInput): Promise<void> {
  const { error } = await supabase.rpc('complete_meeting', {
    p_meeting_id: meetingId,
    p_outcome: input.outcome,
    p_decisions: input.decisions,
    p_next_steps: input.nextSteps,
  });
  if (error) throw toServiceError(error, t('Não foi possível registar o resultado.'));
}

export async function updateMeetingOutcome(meetingId: string, input: MeetingOutcomeInput, reason: string): Promise<void> {
  const { error } = await supabase.rpc('update_meeting_outcome', {
    p_meeting_id: meetingId,
    p_outcome: input.outcome,
    p_decisions: input.decisions,
    p_next_steps: input.nextSteps,
    p_reason: reason,
  });
  if (error) throw toServiceError(error, t('Não foi possível corrigir o resultado.'));
}

export async function cancelMeeting(meetingId: string, reason: string): Promise<void> {
  const { error } = await supabase.rpc('cancel_meeting', { p_meeting_id: meetingId, p_reason: reason });
  if (error) throw toServiceError(error, t('Não foi possível cancelar a reunião.'));
}
