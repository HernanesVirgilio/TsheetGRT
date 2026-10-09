import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type { AbsenceDecision, AbsenceRequest, AbsenceStatus, AbsenceType, WorkEvent } from '../../types/work';
import { isAbsenceStatus } from '../../types/work';
import { isPresent } from '../mappers';
import { mapWorkEvent, WORK_EVENT_COLUMNS } from './workEvents';

const ABSENCE_SELECT =
  'id, reference, employee_id, absence_type_id, start_date, end_date, reason, status, submitted_at, decided_at, decision_comment, created_at, employee:profiles!absence_requests_employee_id_fkey(full_name), type:absence_types(name, requires_attachment)' as const;

interface AbsenceRow {
  id: string;
  reference: string;
  employee_id: string;
  absence_type_id: string;
  start_date: string;
  end_date: string;
  reason: string;
  status: string;
  submitted_at: string | null;
  decided_at: string | null;
  decision_comment: string | null;
  created_at: string;
  employee: { full_name: string } | null;
  type: { name: string; requires_attachment: boolean } | null;
}

function mapAbsence(row: AbsenceRow): AbsenceRequest | null {
  if (!isAbsenceStatus(row.status)) return null;
  return {
    id: row.id,
    reference: row.reference,
    employeeId: row.employee_id,
    employeeName: row.employee?.full_name ?? null,
    absenceTypeId: row.absence_type_id,
    absenceTypeName: row.type?.name ?? '—',
    requiresAttachment: row.type?.requires_attachment ?? false,
    startDate: row.start_date,
    endDate: row.end_date,
    reason: row.reason,
    status: row.status,
    submittedAt: row.submitted_at,
    decidedAt: row.decided_at,
    decisionComment: row.decision_comment,
    createdAt: row.created_at,
  };
}

export async function listAbsenceTypes(): Promise<AbsenceType[]> {
  const { data, error } = await supabase
    .from('absence_types')
    .select('id, code, name, requires_attachment')
    .eq('active', true)
    .order('sort_order');
  if (error) throw toServiceError(error, 'Não foi possível carregar os tipos de ausência.');
  return data.map((row) => ({ id: row.id, code: row.code, name: row.name, requiresAttachment: row.requires_attachment }));
}

export async function listMyAbsences(employeeId: string): Promise<AbsenceRequest[]> {
  const { data, error } = await supabase
    .from('absence_requests')
    .select(ABSENCE_SELECT)
    .eq('employee_id', employeeId)
    .order('start_date', { ascending: false })
    .limit(200);
  if (error) throw toServiceError(error, 'Não foi possível carregar os seus pedidos de ausência.');
  return data.map(mapAbsence).filter(isPresent);
}

/** Pedidos da equipa (RLS: âmbito do gestor com TIMESHEET_ABSENCE_READ, ou administração). */
export async function listTeamAbsences(viewerId: string, statuses: AbsenceStatus[]): Promise<AbsenceRequest[]> {
  let request = supabase
    .from('absence_requests')
    .select(ABSENCE_SELECT)
    .neq('employee_id', viewerId)
    .order('submitted_at', { ascending: true, nullsFirst: false })
    .limit(200);
  if (statuses.length > 0) request = request.in('status', statuses);
  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar os pedidos da equipa.');
  return data.map(mapAbsence).filter(isPresent);
}

/** Ausências aprovadas de um colaborador num intervalo (contexto da revisão do timesheet). */
export async function listApprovedAbsences(employeeId: string, from: string, to: string): Promise<AbsenceRequest[]> {
  const { data, error } = await supabase
    .from('absence_requests')
    .select(ABSENCE_SELECT)
    .eq('employee_id', employeeId)
    .eq('status', 'APPROVED')
    .lte('start_date', to)
    .gte('end_date', from)
    .order('start_date');
  if (error) throw toServiceError(error, 'Não foi possível carregar as ausências do período.');
  return data.map(mapAbsence).filter(isPresent);
}

export async function listAbsenceEvents(requestId: string): Promise<WorkEvent[]> {
  const { data, error } = await supabase
    .from('absence_events')
    .select(WORK_EVENT_COLUMNS)
    .eq('absence_request_id', requestId)
    .order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar o histórico do pedido.');
  return data.map(mapWorkEvent);
}

export interface AbsenceInput {
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}

/** Cria (requestId null) ou altera um rascunho próprio. */
export async function saveAbsence(requestId: string | null, input: AbsenceInput): Promise<string> {
  const { data, error } = await supabase.rpc('save_absence_request', {
    p_request_id: requestId,
    p_absence_type_id: input.absenceTypeId,
    p_start_date: input.startDate,
    p_end_date: input.endDate,
    p_reason: input.reason,
  });
  if (error) throw toServiceError(error, 'Não foi possível guardar o pedido.');
  return data;
}

export async function submitAbsence(requestId: string): Promise<void> {
  const { error } = await supabase.rpc('submit_absence_request', { p_request_id: requestId });
  if (error) throw toServiceError(error, 'Não foi possível submeter o pedido.');
}

export async function cancelAbsence(requestId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('cancel_absence_request', { p_request_id: requestId, p_reason: reason });
  if (error) throw toServiceError(error, 'Não foi possível cancelar o pedido.');
}

export async function decideAbsence(requestId: string, decision: AbsenceDecision, comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('decide_absence_request', { p_request_id: requestId, p_decision: decision, p_comment: comment });
  if (error) throw toServiceError(error, 'Não foi possível registar a decisão.');
}
