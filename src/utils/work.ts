// Regras puras do Timesheet Core: etiquetas, atraso, ações visíveis, validação de formulários e
// datas do calendário. As ações espelham as regras do servidor apenas para a interface; a
// autorização efetiva é feita pelas funções e políticas RLS da base de dados.
import type {
  AbsenceStatus,
  MeetingDetail,
  ApprovalRequestStatus,
  CalendarItemType,
  EntryKind,
  MeetingStatus,
  OpportunityApprovalStatus,
  OpportunityStatus,
  ScheduleConflict,
  TaskStatus,
  WorkEvent,
  WorkPriority,
} from '../types/work';
import { ACTIVE_OPPORTUNITY_STATUSES } from '../types/work';
import type { FieldErrors } from './validation';
import { isValidEmail } from './validation';
import { intlLocale, t, translated } from '../lib/i18n';

// ---------------------------------------------------------------------------- etiquetas

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = translated({
  PLANNED: 'Planeada',
  ASSIGNED: 'Atribuída',
  IN_PROGRESS: 'Em curso',
  BLOCKED: 'Bloqueada',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
});

export const WORK_PRIORITY_LABELS: Record<WorkPriority, string> = translated({
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
});

export const MEETING_STATUS_LABELS: Record<MeetingStatus, string> = translated({
  PLANNED: 'Planeada',
  CONFIRMED: 'Confirmada',
  COMPLETED: 'Realizada',
  CANCELLED: 'Cancelada',
});

export const ABSENCE_STATUS_LABELS: Record<AbsenceStatus, string> = translated({
  DRAFT: 'Rascunho',
  SUBMITTED: 'A aguardar validação do gestor',
  PENDING_APPROVAL: 'A aguardar decisão do Manager',
  APPROVED: 'Aprovada',
  REJECTED: 'Rejeitada',
  CANCELLED: 'Cancelada',
});

export const OPPORTUNITY_STATUS_LABELS: Record<OpportunityStatus, string> = translated({
  NEW: 'Nova',
  QUALIFICATION: 'Qualificação',
  PROPOSAL: 'Proposta',
  NEGOTIATION: 'Negociação',
  WON: 'Ganha',
  LOST: 'Perdida',
  CANCELLED: 'Cancelada',
});

export const OPPORTUNITY_APPROVAL_LABELS: Record<OpportunityApprovalStatus, string> = translated({
  NOT_REQUIRED: 'Não exige aprovação',
  NOT_SUBMITTED: 'Aprovação por pedir',
  PENDING: 'Aprovação pendente',
  APPROVED: 'Aprovada pelo Manager',
  REJECTED: 'Aprovação recusada',
});

export const APPROVAL_REQUEST_STATUS_LABELS: Record<ApprovalRequestStatus, string> = translated({
  PENDING: 'Pendente',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  CANCELLED: 'Anulado',
});

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = translated({
  GENERAL: 'Geral',
  TASK: 'Tarefa',
  MEETING: 'Reunião',
  OPPORTUNITY: 'Oportunidade',
  UNPLANNED: 'Extraordinária',
});

export const CALENDAR_ITEM_LABELS: Record<CalendarItemType, string> = translated({
  DEADLINE: 'Prazo',
  TASK: 'Tarefa',
  MEETING: 'Reunião',
  ABSENCE: 'Ausência',
  ACTIVITY: 'Atividade',
  INTERNAL_EVENT: 'Evento interno',
  OPPORTUNITY_ACTIVITY: 'Oportunidade',
});

/** Nomes legíveis dos campos registados no histórico. */
const FIELD_LABELS: Record<string, string> = translated({
  title: 'Título',
  description: 'Descrição',
  priority: 'Prioridade',
  due_at: 'Prazo',
  start_date: 'Data de início',
  estimated_minutes: 'Estimativa (min)',
  department: 'Departamento',
  assignee: 'Responsável',
  status: 'Estado',
  late_reason: 'Motivo do atraso',
  attachment: 'Anexo',
  participant: 'Participante',
  schedule: 'Horário',
  objective: 'Objetivo',
  location: 'Local',
  meeting_url: 'Ligação',
  outcome: 'Resultado',
  decisions: 'Decisões',
  next_steps: 'Próximos passos',
  type: 'Tipo',
  period: 'Período',
  reason: 'Motivo',
  company: 'Empresa',
  contact_name: 'Contacto',
  contact_phone: 'Telefone',
  contact_email: 'E-mail',
  problem: 'Problema identificado',
  proposal: 'Proposta',
  initial_value: 'Valor inicial',
  estimated_value: 'Valor estimado',
  currency: 'Moeda',
  probability: 'Probabilidade',
  expected_close_date: 'Data esperada',
  next_step: 'Próximo passo',
  next_step_date: 'Data do próximo passo',
  notes: 'Observações',
  owner: 'Responsável',
  member: 'Membro',
  approval: 'Aprovação',
  review: 'Acompanhamento',
});

const EVENT_LABELS: Record<string, string> = translated({
  TASK_CREATED: 'Tarefa criada',
  TASK_ASSIGNED: 'Tarefa atribuída',
  TASK_REASSIGNED: 'Responsável alterado',
  TASK_UNASSIGNED: 'Responsável retirado',
  TASK_STARTED: 'Tarefa iniciada',
  TASK_BLOCKED: 'Tarefa bloqueada',
  TASK_UNBLOCKED: 'Tarefa desbloqueada',
  TASK_UPDATED: 'Tarefa alterada',
  TASK_PRIORITY_CHANGED: 'Prioridade alterada',
  TASK_DEADLINE_CHANGED: 'Prazo alterado',
  TASK_COMMENT_ADDED: 'Comentário',
  TASK_COMPLETED: 'Tarefa concluída',
  TASK_COMPLETED_LATE: 'Tarefa concluída com atraso',
  TASK_REOPENED: 'Tarefa reaberta',
  TASK_CANCELLED: 'Tarefa cancelada',
  TASK_ATTACHMENT_ADDED: 'Anexo adicionado',
  TASK_ATTACHMENT_REMOVED: 'Anexo removido',
  TASK_REVIEWED: 'Conclusão validada',
  MEETING_CREATED: 'Reunião criada',
  MEETING_UPDATED: 'Reunião alterada',
  MEETING_RESCHEDULED: 'Reunião reagendada',
  MEETING_CONFIRMED: 'Reunião confirmada',
  MEETING_COMPLETED: 'Resultado registado',
  MEETING_OUTCOME_UPDATED: 'Resultado corrigido',
  MEETING_CANCELLED: 'Reunião cancelada',
  MEETING_PARTICIPANT_ADDED: 'Participante adicionado',
  MEETING_PARTICIPANT_REMOVED: 'Participante retirado',
  MEETING_ATTACHMENT_ADDED: 'Anexo adicionado',
  MEETING_ATTACHMENT_REMOVED: 'Anexo removido',
  ABSENCE_CREATED: 'Pedido criado',
  ABSENCE_UPDATED: 'Pedido alterado',
  ABSENCE_SUBMITTED: 'Pedido submetido',
  ABSENCE_VALIDATED: 'Validado pelo gestor e encaminhado',
  ABSENCE_APPROVED: 'Pedido aprovado',
  ABSENCE_REJECTED: 'Pedido rejeitado',
  ABSENCE_CHANGES_REQUESTED: 'Devolvido para correção',
  ABSENCE_CANCELLED: 'Pedido cancelado',
  ABSENCE_ATTACHMENT_ADDED: 'Anexo adicionado',
  ABSENCE_ATTACHMENT_REMOVED: 'Anexo removido',
  OPPORTUNITY_CREATED: 'Oportunidade registada',
  OPPORTUNITY_UPDATED: 'Oportunidade alterada',
  OPPORTUNITY_STAGE_CHANGED: 'Etapa alterada',
  OPPORTUNITY_OWNER_CHANGED: 'Responsável alterado',
  OPPORTUNITY_MEMBER_ADDED: 'Membro adicionado',
  OPPORTUNITY_MEMBER_REMOVED: 'Membro retirado',
  OPPORTUNITY_COMMENT_ADDED: 'Comentário',
  OPPORTUNITY_WON: 'Oportunidade ganha',
  OPPORTUNITY_LOST: 'Oportunidade perdida',
  OPPORTUNITY_CANCELLED: 'Oportunidade cancelada',
  OPPORTUNITY_REOPENED: 'Oportunidade reaberta',
  OPPORTUNITY_ATTACHMENT_ADDED: 'Anexo adicionado',
  OPPORTUNITY_ATTACHMENT_REMOVED: 'Anexo removido',
  OPPORTUNITY_APPROVAL_REQUESTED: 'Aprovação pedida ao Manager',
  OPPORTUNITY_APPROVED: 'Aprovada pelo Manager',
  OPPORTUNITY_APPROVAL_REJECTED: 'Aprovação recusada',
  OPPORTUNITY_APPROVAL_CANCELLED: 'Pedido de aprovação anulado',
  OPPORTUNITY_EXECUTION_LEAD_CHANGED: 'Gestor de execução alterado',
});

export function describeWorkEvent(event: Pick<WorkEvent, 'eventType' | 'field'>): string {
  const base = EVENT_LABELS[event.eventType] ?? event.eventType;
  if (event.field && (event.eventType.endsWith('_UPDATED') || event.eventType === 'MEETING_OUTCOME_UPDATED')) {
    return `${base}: ${FIELD_LABELS[event.field] ?? event.field}`;
  }
  return base;
}

/** Comentários são mostrados como mensagens; os restantes eventos como linhas do histórico. */
export function isCommentEvent(eventType: string): boolean {
  return eventType.endsWith('_COMMENT_ADDED');
}

// ---------------------------------------------------------------------------- atraso e prazos

const OPEN_TASK_STATUSES: readonly TaskStatus[] = ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED'];
const HOUR_IN_MS = 60 * 60 * 1000;

export function isTaskOpen(status: TaskStatus): boolean {
  return OPEN_TASK_STATUSES.includes(status);
}

/** Atraso calculado (não existe estado "atrasada"): prazo ultrapassado e tarefa por concluir. */
export function isTaskOverdue(task: { status: TaskStatus; dueAt: string | null }, now: Date): boolean {
  return (task.status === 'PLANNED' || isTaskOpen(task.status)) && task.dueAt !== null && new Date(task.dueAt).getTime() < now.getTime();
}

export function isTaskDueWithin(task: { status: TaskStatus; dueAt: string | null }, now: Date, hours: number): boolean {
  if (!task.dueAt || !(task.status === 'PLANNED' || isTaskOpen(task.status))) return false;
  const remaining = new Date(task.dueAt).getTime() - now.getTime();
  return remaining >= 0 && remaining <= hours * HOUR_IN_MS;
}

/** Concluir agora exige motivo de atraso (mesma regra do servidor). */
export function requiresLateReason(task: { dueAt: string | null }, now: Date): boolean {
  return task.dueAt !== null && now.getTime() > new Date(task.dueAt).getTime();
}

const PRIORITY_WEIGHT: Record<WorkPriority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

/** Ordem de trabalho: atrasadas primeiro, depois prazo mais próximo, depois prioridade. */
export function compareTasksForToday(
  first: { status: TaskStatus; dueAt: string | null; priority: WorkPriority },
  second: { status: TaskStatus; dueAt: string | null; priority: WorkPriority },
  now: Date
): number {
  const overdueDifference = Number(isTaskOverdue(second, now)) - Number(isTaskOverdue(first, now));
  if (overdueDifference !== 0) return overdueDifference;
  const firstDue = first.dueAt ? new Date(first.dueAt).getTime() : Number.POSITIVE_INFINITY;
  const secondDue = second.dueAt ? new Date(second.dueAt).getTime() : Number.POSITIVE_INFINITY;
  if (firstDue !== secondDue) return firstDue - secondDue;
  return PRIORITY_WEIGHT[second.priority] - PRIORITY_WEIGHT[first.priority];
}

// ---------------------------------------------------------------------------- ações visíveis

export interface TaskActions {
  canReview: boolean;
  canStart: boolean;
  canBlock: boolean;
  canUnblock: boolean;
  canComplete: boolean;
  canComment: boolean;
  canLogTime: boolean;
  canEdit: boolean;
  canAssign: boolean;
  canCancel: boolean;
  canReopen: boolean;
  canCreateFollowUp: boolean;
}

export interface TaskViewer {
  profileId: string;
  /** O servidor considera "gestão": administração, criador ou gestor do responsável. */
  managesTask: boolean;
  permissions: { update: boolean; create: boolean; assign: boolean; reopen: boolean; logTime: boolean; supervise?: boolean };
}

interface TaskForActions {
  status: TaskStatus;
  assigneeId: string | null;
  requiresManagerReview?: boolean;
  reviewedAt?: string | null;
}

export function taskActions(task: TaskForActions, viewer: TaskViewer): TaskActions {
  const isAssignee = task.assigneeId === viewer.profileId;
  const { update, create, assign, reopen, logTime } = viewer.permissions;
  const supervise = viewer.permissions.supervise ?? false;
  const manages = viewer.managesTask;
  const live = task.status !== 'CANCELLED';
  return {
    // Validar a conclusão: o gestor da tarefa ou, se exigir acompanhamento do Manager, quem supervisiona.
    canReview:
      task.status === 'COMPLETED' && !task.reviewedAt && !isAssignee && assign && (task.requiresManagerReview ? supervise : manages),
    canStart: update && isAssignee && task.status === 'ASSIGNED',
    canBlock: update && (isAssignee || manages) && task.status === 'IN_PROGRESS',
    canUnblock: update && (isAssignee || manages) && task.status === 'BLOCKED',
    canComplete: update && (isAssignee || (manages && assign)) && task.status === 'IN_PROGRESS',
    canComment: update && live,
    canLogTime: logTime && isAssignee && ['ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED'].includes(task.status),
    canEdit: manages && (assign || create) && live,
    canAssign: manages && assign && live,
    canCancel: manages && assign && task.status !== 'COMPLETED' && live,
    canReopen: manages && reopen && task.status === 'COMPLETED',
    canCreateFollowUp: create && live,
  };
}

export function isOpportunityActive(status: OpportunityStatus): boolean {
  return ACTIVE_OPPORTUNITY_STATUSES.includes(status);
}

/** Etapas que só são alcançadas com a oportunidade aprovada (ou sem exigência de aprovação). */
const STAGES_REQUIRING_APPROVAL: readonly OpportunityStatus[] = ['PROPOSAL', 'NEGOTIATION', 'WON'];

export function isOpportunityCleared(approvalStatus: OpportunityApprovalStatus): boolean {
  return approvalStatus === 'APPROVED' || approvalStatus === 'NOT_REQUIRED';
}

/** Próximas etapas possíveis a partir do estado atual (as fechadas só reabrem com gestão). */
export function nextOpportunityStatuses(
  status: OpportunityStatus,
  canManage: boolean,
  approvalStatus: OpportunityApprovalStatus = 'NOT_REQUIRED'
): OpportunityStatus[] {
  if (isOpportunityActive(status)) {
    const cleared = isOpportunityCleared(approvalStatus);
    const stages = ACTIVE_OPPORTUNITY_STATUSES.filter((stage) => stage !== status);
    const candidates: OpportunityStatus[] = [...stages, 'WON', 'LOST', ...(canManage ? (['CANCELLED'] as const) : [])];
    return candidates.filter((stage) => cleared || !STAGES_REQUIRING_APPROVAL.includes(stage));
  }
  return canManage ? ['QUALIFICATION'] : [];
}

/** O pedido de aprovação só pode ser feito com a oportunidade em curso e sem pedido ou aprovação ativos. */
export function canRequestOpportunityApproval(status: OpportunityStatus, approvalStatus: OpportunityApprovalStatus): boolean {
  return isOpportunityActive(status) && (approvalStatus === 'NOT_SUBMITTED' || approvalStatus === 'REJECTED');
}

/** Estados de oportunidade que exigem motivo na transição. */
export function opportunityStatusNeedsNote(current: OpportunityStatus, next: OpportunityStatus): boolean {
  return next === 'LOST' || next === 'CANCELLED' || !isOpportunityActive(current);
}

// ---------------------------------------------------------------------------- formulários

export interface TaskFormValues {
  title: string;
  description: string;
  priority: string;
  assigneeId: string;
  dueDate: string;
  dueTime: string;
  startDate: string;
  estimatedHours: string;
}
export type TaskFormField = keyof TaskFormValues;

export function validateTaskForm(values: TaskFormValues, now: Date, options: { isCompleted: boolean; dueChanged: boolean }): FieldErrors<TaskFormField> {
  const errors: FieldErrors<TaskFormField> = {};
  const title = values.title.trim();
  if (title.length < 3) errors.title = t('Indique um título com pelo menos 3 carateres.');
  else if (title.length > 200) errors.title = t('O título não pode exceder 200 carateres.');
  if (values.description.length > 5000) errors.description = t('A descrição não pode exceder 5000 carateres.');
  if (!values.priority) errors.priority = t('Selecione a prioridade.');
  if (values.dueTime && !values.dueDate) errors.dueDate = t('Indique a data do prazo.');
  const due = combineDateTime(values.dueDate, values.dueTime || '17:00');
  if (due && options.dueChanged && !options.isCompleted && due.getTime() <= now.getTime()) {
    errors.dueDate = t('O prazo tem de ser uma data futura.');
  }
  if (values.startDate && values.dueDate && values.startDate > values.dueDate) {
    errors.startDate = t('A data de início não pode ser posterior ao prazo.');
  }
  if (values.estimatedHours) {
    const hours = Number(values.estimatedHours.replace(',', '.'));
    if (!Number.isFinite(hours) || hours <= 0 || hours > 1000) errors.estimatedHours = t('Indique uma estimativa entre 0,25 e 1000 horas.');
  }
  return errors;
}

/** Data (AAAA-MM-DD) + hora (HH:MM) locais num Date; null se a data estiver vazia. */
export function combineDateTime(date: string, time: string): Date | null {
  if (!date) return null;
  const [year, month, day] = date.split('-').map(Number);
  const [hours, minutes] = (time || '00:00').split(':').map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, hours ?? 0, minutes ?? 0);
}

export function estimatedMinutesFromHours(value: string): number | null {
  if (!value.trim()) return null;
  return Math.round(Number(value.replace(',', '.')) * 60);
}

/** Texto obrigatório das ações (motivos, justificações). Espelha private.required_text. */
export function validateReason(value: string, label: string, minLength = 5, maxLength = 1000): string | null {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return t('{label} (mínimo {minLength} carateres).', { label, minLength });
  if (trimmed.length > maxLength) return t('Máximo de {maxLength} carateres.', { maxLength });
  return null;
}

export interface MeetingFormValues {
  title: string;
  date: string;
  startTime: string;
  endTime: string;
  location: string;
  meetingUrl: string;
  objective: string;
  description: string;
}
export type MeetingFormField = keyof MeetingFormValues;

export function validateMeetingForm(values: MeetingFormValues): FieldErrors<MeetingFormField> {
  const errors: FieldErrors<MeetingFormField> = {};
  if (values.title.trim().length < 3) errors.title = t('Indique um título com pelo menos 3 carateres.');
  if (!values.date) errors.date = t('Indique a data.');
  if (!values.startTime) errors.startTime = t('Indique a hora de início.');
  if (!values.endTime) errors.endTime = t('Indique a hora de fim.');
  else if (values.startTime && values.endTime <= values.startTime) errors.endTime = t('A reunião tem de terminar depois de começar.');
  const url = values.meetingUrl.trim();
  if (url && !/^https?:\/\//i.test(url)) errors.meetingUrl = t('A ligação tem de começar por http:// ou https://.');
  if (values.location.trim().length > 200) errors.location = t('Máximo de 200 carateres.');
  return errors;
}

/**
 * Identifica um pedido de verificação de conflitos: muda quando muda o horário ou o conjunto de pessoas
 * (independentemente da ordem). Serve para saber se o aviso apresentado ainda corresponde ao formulário.
 */
export function scheduleSignature(startsAt: string, endsAt: string, profileIds: string[]): string {
  return `${startsAt}|${endsAt}|${[...new Set(profileIds)].sort().join(',')}`;
}

/** Descrição curta do período ocupado, sem expor o que o organizador não pode ver. */
export function describeConflict(conflict: ScheduleConflict): string {
  const start = new Date(conflict.startsAt);
  const end = new Date(conflict.endsAt);
  const shortDate = (date: Date) => `${pad(date.getDate())}/${pad(date.getMonth() + 1)}`;
  if (conflict.kind === 'ABSENCE') {
    // A ausência termina no início do dia seguinte ao último dia ausente.
    const lastDay = new Date(end.getTime() - 1);
    return isSameDay(start, lastDay) ? t('Ausência aprovada ({start})', { start: shortDate(start) }) : t('Ausência aprovada ({start} a {lastDay})', { start: shortDate(start), lastDay: shortDate(lastDay) });
  }
  const period = isSameDay(start, end) ? `${toTimeInput(start)}–${toTimeInput(end)}` : t('{start} até {end} {end2}', { start: toTimeInput(start), end: shortDate(end), end2: toTimeInput(end) });
  return `${conflict.title ?? t('Ocupado noutra reunião')} · ${period}`;
}

/** Valores iniciais do formulário de reunião: a reunião existente, o intervalo escolhido no calendário ou o dia em vista. */
export function initialMeetingValues(meeting: MeetingDetail | null, defaultDate?: string, initialRange?: SlotSelection | null): MeetingFormValues {
  const start = meeting ? new Date(meeting.startsAt) : null;
  const end = meeting ? new Date(meeting.endsAt) : null;
  return {
    title: meeting?.title ?? '',
    date: start ? toDateInput(start) : (initialRange?.date ?? defaultDate ?? toDateInput(new Date())),
    startTime: start ? toTimeInput(start) : (initialRange?.startTime ?? '10:00'),
    endTime: end ? toTimeInput(end) : (initialRange?.endTime ?? '11:00'),
    location: meeting?.location ?? '',
    meetingUrl: meeting?.meetingUrl ?? '',
    objective: meeting?.objective ?? '',
    description: meeting?.description ?? '',
  };
}

export interface AbsenceFormValues {
  absenceTypeId: string;
  startDate: string;
  endDate: string;
  reason: string;
}
export type AbsenceFormField = keyof AbsenceFormValues;

export function validateAbsenceForm(values: AbsenceFormValues): FieldErrors<AbsenceFormField> {
  const errors: FieldErrors<AbsenceFormField> = {};
  if (!values.absenceTypeId) errors.absenceTypeId = t('Selecione o tipo de ausência.');
  if (!values.startDate) errors.startDate = t('Indique a data inicial.');
  if (!values.endDate) errors.endDate = t('Indique a data final.');
  else if (values.startDate && values.endDate < values.startDate) errors.endDate = t('A data final não pode ser anterior à data inicial.');
  else if (values.startDate && daysBetween(values.startDate, values.endDate) > 366) errors.endDate = t('Um pedido não pode exceder um ano.');
  if (values.reason.length > 2000) errors.reason = t('O motivo não pode exceder 2000 carateres.');
  return errors;
}

export interface CompanyFormValues {
  name: string;
  nuit: string;
  contactName: string;
  phone: string;
  email: string;
  address: string;
  website: string;
  notes: string;
}
export type CompanyFormField = keyof CompanyFormValues;

export function validateCompanyForm(values: CompanyFormValues): FieldErrors<CompanyFormField> {
  const errors: FieldErrors<CompanyFormField> = {};
  if (values.name.trim().length < 2) errors.name = t('Indique o nome da empresa.');
  if (values.nuit.trim() && !/^\d{9}$/.test(values.nuit.trim())) errors.nuit = t('O NUIT tem 9 dígitos.');
  if (values.email.trim() && !isValidEmail(values.email.trim())) errors.email = t('Indique um e-mail válido.');
  if (values.website.trim() && !/^https?:\/\//i.test(values.website.trim())) errors.website = t('O site tem de começar por http:// ou https://.');
  return errors;
}

export interface OpportunityFormValues {
  title: string;
  companyId: string;
  ownerId: string;
  contactName: string;
  contactPhone: string;
  contactEmail: string;
  description: string;
  problem: string;
  proposal: string;
  initialValue: string;
  estimatedValue: string;
  currency: string;
  probability: string;
  expectedCloseDate: string;
  nextStep: string;
  nextStepDate: string;
  notes: string;
}
export type OpportunityFormField = keyof OpportunityFormValues;

export function parseAmount(value: string): number | null {
  const normalized = value.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
  if (!normalized) return null;
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : Number.NaN;
}

export function validateOpportunityForm(values: OpportunityFormValues): FieldErrors<OpportunityFormField> {
  const errors: FieldErrors<OpportunityFormField> = {};
  if (values.title.trim().length < 3) errors.title = t('Indique um título com pelo menos 3 carateres.');
  if (!values.companyId) errors.companyId = t('Selecione a empresa.');
  if (values.contactEmail.trim() && !isValidEmail(values.contactEmail.trim())) errors.contactEmail = t('Indique um e-mail válido.');
  for (const field of ['initialValue', 'estimatedValue'] as const) {
    const amount = parseAmount(values[field]);
    if (amount !== null && (Number.isNaN(amount) || amount < 0)) errors[field] = t('Indique um valor positivo.');
  }
  if (values.probability.trim()) {
    const probability = Number(values.probability);
    if (!Number.isInteger(probability) || probability < 0 || probability > 100) errors.probability = t('Entre 0 e 100.');
  }
  if (!/^[A-Za-z]{3}$/.test(values.currency.trim())) errors.currency = t('Código de 3 letras (ex.: MZN).');
  return errors;
}

export interface WorkLogFormValues {
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: string;
  activityId: string;
  kind: string;
  contextId: string;
  description: string;
}
export type WorkLogFormField = keyof WorkLogFormValues;

export function validateWorkLogForm(values: WorkLogFormValues, today: string): FieldErrors<WorkLogFormField> {
  const errors: FieldErrors<WorkLogFormField> = {};
  if (!values.workDate) errors.workDate = t('Indique a data.');
  else if (values.workDate > today) errors.workDate = t('Não é possível registar tempo em datas futuras.');
  if (!values.startTime) errors.startTime = t('Indique a hora de início.');
  if (!values.endTime) errors.endTime = t('Indique a hora de fim.');
  const breakMinutes = Number(values.breakMinutes || '0');
  if (!Number.isInteger(breakMinutes) || breakMinutes < 0) errors.breakMinutes = t('A pausa tem de ser um número inteiro de minutos.');
  if (values.startTime && values.endTime) {
    const minutes = minutesBetween(values.startTime, values.endTime) - (Number.isFinite(breakMinutes) ? breakMinutes : 0);
    if (values.endTime <= values.startTime) errors.endTime = t('A hora de fim tem de ser posterior à de início.');
    else if (minutes <= 0) errors.breakMinutes = t('A pausa não pode ser igual ou superior ao tempo registado.');
  }
  if (!values.activityId) errors.activityId = t('Selecione o tipo de atividade.');
  if (['TASK', 'MEETING', 'OPPORTUNITY'].includes(values.kind) && !values.contextId) {
    errors.contextId = t('Selecione o registo a que o tempo se refere.');
  }
  const description = values.description.trim();
  if (!description) errors.description = t('Descreva o trabalho realizado.');
  else if (values.kind === 'UNPLANNED' && description.length < 5) errors.description = t('Descreva a atividade extraordinária (mínimo 5 carateres).');
  else if (description.length > 2000) errors.description = t('Máximo de 2000 carateres.');
  return errors;
}

// ---------------------------------------------------------------------------- datas

const pad = (value: number) => String(value).padStart(2, '0');

export function toDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function toTimeInput(date: Date): string {
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function parseDateInput(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function daysBetween(start: string, end: string): number {
  return Math.round((parseDateInput(end).getTime() - parseDateInput(start).getTime()) / (24 * HOUR_IN_MS));
}

export function minutesBetween(startTime: string, endTime: string): number {
  const [startHours, startMinutes] = startTime.split(':').map(Number);
  const [endHours, endMinutes] = endTime.split(':').map(Number);
  return (endHours ?? 0) * 60 + (endMinutes ?? 0) - ((startHours ?? 0) * 60 + (startMinutes ?? 0));
}

/** Segunda-feira da semana de uma data (as semanas começam à segunda). */
export function startOfWeek(date: Date): Date {
  const result = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const weekday = (result.getDay() + 6) % 7;
  return addDays(result, -weekday);
}

/** Grelha mensal de 6 semanas (42 dias) a começar na segunda-feira anterior ao dia 1. */
export function monthGrid(month: Date): Date[] {
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = startOfWeek(first);
  return Array.from({ length: 42 }, (_, index) => addDays(start, index));
}

export function isSameDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

/** Um item do calendário ocupa o dia se o intersetar (os de dia inteiro terminam no início do dia seguinte). */
export function itemOccursOn(item: { startsAt: string; endsAt: string; allDay: boolean }, day: Date): boolean {
  const dayStart = new Date(day.getFullYear(), day.getMonth(), day.getDate()).getTime();
  const dayEnd = dayStart + 24 * HOUR_IN_MS;
  const start = new Date(item.startsAt).getTime();
  const end = new Date(item.endsAt).getTime();
  if (start === end) return start >= dayStart && start < dayEnd;
  return start < dayEnd && end > dayStart && !(item.allDay && end === dayStart);
}

// ---------------------------------------------------------------------------- grelha horária do calendário

export const CALENDAR_DAY_START_HOUR = 7;
export const CALENDAR_DAY_END_HOUR = 21;
export const CALENDAR_SLOT_MINUTES = 30;
export const CALENDAR_SLOT_COUNT = ((CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60) / CALENDAR_SLOT_MINUTES;

/** Hora (HH:MM) do início de uma fatia da grelha. */
export function slotStartTime(slot: number): string {
  const minutes = CALENDAR_DAY_START_HOUR * 60 + slot * CALENDAR_SLOT_MINUTES;
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

export interface SlotSelection {
  date: string;
  startTime: string;
  endTime: string;
}

/**
 * Intervalo selecionado na grelha (clique, arrastamento ou teclado): do início da primeira fatia ao fim
 * da última, independentemente da direção em que o utilizador arrastou.
 */
export function selectionToRange(day: Date, anchorSlot: number, focusSlot: number): SlotSelection {
  const clamp = (slot: number) => Math.min(Math.max(Math.round(slot), 0), CALENDAR_SLOT_COUNT - 1);
  const first = Math.min(clamp(anchorSlot), clamp(focusSlot));
  const last = Math.max(clamp(anchorSlot), clamp(focusSlot));
  return { date: toDateInput(day), startTime: slotStartTime(first), endTime: slotStartTime(last + 1) };
}

export interface TimedLayout<Item> {
  item: Item;
  /** Minutos desde o início da grelha. */
  top: number;
  height: number;
  lane: number;
  lanes: number;
}

/**
 * Posição dos itens com hora num dia da grelha: recortados ao horário visível e distribuídos em colunas
 * quando se sobrepõem (para não se esconderem uns aos outros).
 */
export function layoutTimedItems<Item extends { startsAt: string; endsAt: string }>(items: Item[], day: Date): TimedLayout<Item>[] {
  const gridStart = new Date(day.getFullYear(), day.getMonth(), day.getDate(), CALENDAR_DAY_START_HOUR).getTime();
  const gridMinutes = (CALENDAR_DAY_END_HOUR - CALENDAR_DAY_START_HOUR) * 60;
  const positioned = items
    .map((item) => {
      const start = (new Date(item.startsAt).getTime() - gridStart) / 60000;
      const end = (new Date(item.endsAt).getTime() - gridStart) / 60000;
      const top = Math.max(0, Math.min(start, gridMinutes - 15));
      const bottom = Math.min(gridMinutes, Math.max(end, top + 15));
      return { item, top, height: bottom - top };
    })
    .filter((entry) => entry.top < gridMinutes)
    .sort((first, second) => first.top - second.top || second.height - first.height);

  const result: TimedLayout<Item>[] = [];
  let cluster: TimedLayout<Item>[] = [];
  let clusterEnd = -1;
  const laneEnds: number[] = [];
  const closeCluster = () => {
    const lanes = Math.max(1, ...cluster.map((entry) => entry.lane + 1));
    cluster.forEach((entry) => result.push({ ...entry, lanes }));
    cluster = [];
    laneEnds.length = 0;
  };
  for (const entry of positioned) {
    if (cluster.length > 0 && entry.top >= clusterEnd) closeCluster();
    let lane = laneEnds.findIndex((end) => end <= entry.top);
    if (lane === -1) lane = laneEnds.length;
    laneEnds[lane] = entry.top + entry.height;
    cluster.push({ ...entry, lane, lanes: 1 });
    clusterEnd = Math.max(clusterEnd, entry.top + entry.height);
  }
  if (cluster.length > 0) closeCluster();
  return result;
}

/** Período por omissão dos painéis e relatórios: os últimos N dias até hoje. */
export function recentPeriod(days: number, today: Date): { from: string; to: string } {
  return { from: toDateInput(addDays(today, -(days - 1))), to: toDateInput(today) };
}

export function formatMoney(value: number | null, currency: string): string {
  if (value === null) return '—';
  return `${new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1).replace('.', ',')} MB`;
}
