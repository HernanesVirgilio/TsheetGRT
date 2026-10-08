// Regras puras do módulo IT: etiquetas, prazos, histórico, ações visíveis e validação de formulários.
// As ações apresentadas espelham as regras do servidor apenas para a interface; a autorização
// efetiva é feita pelas funções e políticas RLS da base de dados.
import type {
  AssetStatus,
  AssetType,
  InterventionOutcome,
  TicketEvent,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from '../types/it';
import { ASSIGNABLE_ASSET_STATUSES } from '../types/it';
import type { FieldErrors } from './validation';

export const TICKET_STATUS_LABELS: Record<TicketStatus, string> = {
  OPEN: 'Aberto',
  IN_PROGRESS: 'Em atendimento',
  WAITING_USER: 'A aguardar colaborador',
  RESOLVED: 'Resolvido',
  CLOSED: 'Fechado',
};

export const TICKET_PRIORITY_LABELS: Record<TicketPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  COMPUTER: 'Computador',
  LAPTOP: 'Portátil',
  MONITOR: 'Monitor',
  PRINTER: 'Impressora',
  PHONE: 'Telefone',
  NETWORK: 'Equipamento de rede',
  OTHER: 'Outro',
};

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  ACTIVE: 'Em uso',
  IN_REPAIR: 'Em reparação',
  IN_STOCK: 'Em stock',
  RETIRED: 'Abatido',
  LOST: 'Perdido',
};

export const INTERVENTION_OUTCOME_LABELS: Record<InterventionOutcome, string> = {
  RESOLVED: 'Resolvido',
  PARTIALLY_RESOLVED: 'Parcialmente resolvido',
  NOT_RESOLVED: 'Não resolvido',
  ESCALATED: 'Escalado',
};

/** Ordem de urgência (maior primeiro) para ordenar filas. */
export const PRIORITY_WEIGHT: Record<TicketPriority, number> = { CRITICAL: 4, HIGH: 3, MEDIUM: 2, LOW: 1 };

const ACTIVE_STATUSES: readonly TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'];

export function isTicketActive(status: TicketStatus): boolean {
  return ACTIVE_STATUSES.includes(status);
}

/** Mesma regra do painel do servidor: em atraso se aberto ou em atendimento após o prazo. */
export function isTicketOverdue(ticket: Pick<TicketSummary, 'status' | 'dueAt'>, now: Date): boolean {
  return (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS') && new Date(ticket.dueAt).getTime() < now.getTime();
}

const HOUR_IN_MS = 60 * 60 * 1000;
const DAY_IN_MS = 24 * HOUR_IN_MS;

/** Antecedência com que o painel sinaliza um prazo a terminar. */
export const DUE_SOON_HOURS = 4;

/** Prazo ainda não ultrapassado, mas a terminar nas próximas horas (mesmos estados que o atraso). */
export function isTicketDueSoon(ticket: Pick<TicketSummary, 'status' | 'dueAt'>, now: Date, hours = DUE_SOON_HOURS): boolean {
  if (ticket.status !== 'OPEN' && ticket.status !== 'IN_PROGRESS') return false;
  const remaining = new Date(ticket.dueAt).getTime() - now.getTime();
  return remaining >= 0 && remaining <= hours * HOUR_IN_MS;
}

export function isWaitingTooLong(ticket: Pick<TicketSummary, 'status' | 'statusChangedAt'>, alertDays: number, now: Date): boolean {
  return ticket.status === 'WAITING_USER' && now.getTime() - new Date(ticket.statusChangedAt).getTime() > alertDays * DAY_IN_MS;
}

/** Fila do IT: mais urgente primeiro e, dentro da mesma prioridade, o mais antigo primeiro. */
export function compareTicketsByUrgency(first: TicketSummary, second: TicketSummary): number {
  return PRIORITY_WEIGHT[second.priority] - PRIORITY_WEIGHT[first.priority] || first.createdAt.localeCompare(second.createdAt);
}

/** Frase legível de um evento do histórico (os valores já vêm legíveis do servidor). */
export function describeTicketEvent(event: TicketEvent): string {
  switch (event.eventType) {
    case 'CREATED':
      return 'Pedido aberto';
    case 'ASSIGNED':
      return `Atribuído a ${event.newValue ?? '—'}`;
    case 'STATUS_CHANGED':
      return `Estado: ${event.oldValue ?? '—'} → ${event.newValue ?? '—'}`;
    case 'PRIORITY_CHANGED':
      return `Prioridade: ${event.oldValue ?? '—'} → ${event.newValue ?? '—'}`;
    case 'CATEGORY_CHANGED':
      return `Categoria: ${event.oldValue ?? '—'} → ${event.newValue ?? '—'}`;
    case 'ASSET_CHANGED':
      return `Equipamento: ${event.oldValue ?? '—'} → ${event.newValue ?? '—'}`;
    case 'COMMENTED':
      return event.isInternal ? 'Nota interna adicionada' : 'Comentário adicionado';
    case 'RESOLVED':
      return 'Pedido resolvido';
    case 'CLOSED':
      return 'Pedido fechado';
    case 'REOPENED':
      return 'Pedido reaberto';
    case 'INTERVENTION_ADDED':
      return 'Intervenção técnica registada';
  }
}

export interface TechnicianActions {
  canTake: boolean;
  canAssign: boolean;
  canStartWork: boolean;
  canWaitForUser: boolean;
  canEditClassification: boolean;
  canResolve: boolean;
  canClose: boolean;
  canReopen: boolean;
  canComment: boolean;
}

export function technicianActions(
  ticket: Pick<TicketSummary, 'status' | 'assignedTo'>,
  viewerId: string,
  permissions: { manage: boolean; assign: boolean }
): TechnicianActions {
  const active = isTicketActive(ticket.status);
  const manage = permissions.manage;
  return {
    canTake: manage && active && (ticket.assignedTo !== viewerId || ticket.status === 'OPEN'),
    canAssign: permissions.assign && manage && active,
    canStartWork: manage && (ticket.status === 'OPEN' || ticket.status === 'WAITING_USER'),
    canWaitForUser: manage && (ticket.status === 'OPEN' || ticket.status === 'IN_PROGRESS'),
    canEditClassification: manage && active,
    canResolve: manage && active,
    canClose: manage && ticket.status === 'RESOLVED',
    canReopen: manage && (ticket.status === 'RESOLVED' || ticket.status === 'CLOSED'),
    canComment: manage && ticket.status !== 'CLOSED',
  };
}

export interface RequesterActions {
  canReply: boolean;
  canConfirmResolution: boolean;
  canReopen: boolean;
}

export function requesterActions(status: TicketStatus): RequesterActions {
  return {
    canReply: status !== 'CLOSED',
    canConfirmResolution: status === 'RESOLVED',
    canReopen: status === 'RESOLVED',
  };
}

// ---------------------------------------------------------------------------- formulários

export interface TicketFormValues {
  title: string;
  description: string;
  categoryId: string;
  priority: string;
}

export type TicketFormField = keyof TicketFormValues;

export function validateTicketForm(values: TicketFormValues): FieldErrors<TicketFormField> {
  const errors: FieldErrors<TicketFormField> = {};
  const title = values.title.trim();
  const description = values.description.trim();
  if (title.length < 5) errors.title = 'Indique um título com pelo menos 5 carateres.';
  else if (title.length > 200) errors.title = 'O título não pode exceder 200 carateres.';
  if (description.length < 10) errors.description = 'Descreva o problema (pelo menos 10 carateres).';
  else if (description.length > 5000) errors.description = 'A descrição não pode exceder 5000 carateres.';
  if (!values.categoryId) errors.categoryId = 'Selecione a categoria.';
  if (!values.priority) errors.priority = 'Selecione a prioridade.';
  return errors;
}

/** Validação de textos obrigatórios das ações (resolução, motivo de reabertura, nota de espera). */
export function validateRequiredText(value: string, label: string, minLength: number, maxLength: number): string | null {
  const trimmed = value.trim();
  if (trimmed.length < minLength) return `${label} (mínimo ${minLength} carateres).`;
  if (trimmed.length > maxLength) return `Máximo de ${maxLength} carateres.`;
  return null;
}

export function validateComment(body: string): string | null {
  const trimmed = body.trim();
  if (!trimmed) return 'Escreva a mensagem.';
  if (trimmed.length > 5000) return 'A mensagem não pode exceder 5000 carateres.';
  return null;
}

export interface AssetFormValues {
  assetTag: string;
  assetType: string;
  brand: string;
  model: string;
  serialNumber: string;
  status: string;
  assignedTo: string;
  departmentId: string;
  location: string;
  acquiredOn: string;
  notes: string;
}

export type AssetFormField = keyof AssetFormValues;

const ASSET_TAG_PATTERN = /^[A-Z0-9][A-Z0-9-]{2,29}$/;

export function validateAssetForm(values: AssetFormValues, today: string): FieldErrors<AssetFormField> {
  const errors: FieldErrors<AssetFormField> = {};
  const tag = values.assetTag.trim().toUpperCase();
  if (tag && !ASSET_TAG_PATTERN.test(tag)) {
    errors.assetTag = 'Use 3 a 30 carateres: letras maiúsculas, números ou "-". Deixe vazio para gerar automaticamente.';
  }
  if (!values.assetType) errors.assetType = 'Selecione o tipo de equipamento.';
  if (!values.status) errors.status = 'Selecione o estado.';
  if (values.assignedTo && !(ASSIGNABLE_ASSET_STATUSES as readonly string[]).includes(values.status)) {
    errors.assignedTo = 'Apenas equipamentos em uso, em reparação ou perdidos têm utilizador responsável.';
  }
  if (values.acquiredOn && values.acquiredOn > today) errors.acquiredOn = 'A data de aquisição não pode ser futura.';
  if (values.brand.trim().length > 100) errors.brand = 'Máximo de 100 carateres.';
  if (values.model.trim().length > 150) errors.model = 'Máximo de 150 carateres.';
  if (values.serialNumber.trim().length > 100) errors.serialNumber = 'Máximo de 100 carateres.';
  if (values.location.trim().length > 150) errors.location = 'Máximo de 150 carateres.';
  return errors;
}

export interface InterventionFormValues {
  performedAt: string;
  problemDescription: string;
  workPerformed: string;
  outcome: string;
  notes: string;
}

export type InterventionFormField = keyof InterventionFormValues;

export function validateInterventionForm(values: InterventionFormValues, now: Date): FieldErrors<InterventionFormField> {
  const errors: FieldErrors<InterventionFormField> = {};
  if (!values.performedAt) errors.performedAt = 'Indique a data da intervenção.';
  else if (new Date(values.performedAt).getTime() > now.getTime()) errors.performedAt = 'A data não pode ser futura.';
  const problem = values.problemDescription.trim();
  const work = values.workPerformed.trim();
  if (problem.length < 5 || problem.length > 2000) errors.problemDescription = 'Descreva o problema (5 a 2000 carateres).';
  if (work.length < 5 || work.length > 4000) errors.workPerformed = 'Descreva o trabalho realizado (5 a 4000 carateres).';
  if (!values.outcome) errors.outcome = 'Selecione o resultado.';
  return errors;
}

// ---------------------------------------------------------------------------- auxiliares de apresentação

/**
 * Nome do técnico atual a partir do último evento de atribuição. O colaborador não tem acesso
 * aos perfis da equipa de IT; o nome fica registado no histórico pelo servidor.
 */
export function currentAssigneeName(events: TicketEvent[]): string | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event?.eventType === 'ASSIGNED') return event.newValue;
  }
  return null;
}

const pad = (value: number) => String(value).padStart(2, '0');

/** Data local no formato AAAA-MM-DD (campos type="date"). */
export function toLocalDateInput(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Data e hora locais no formato AAAA-MM-DDTHH:MM (campos type="datetime-local"). */
export function toLocalDateTimeInput(date: Date): string {
  return `${toLocalDateInput(date)}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
