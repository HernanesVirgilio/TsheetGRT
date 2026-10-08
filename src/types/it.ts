// Tipos de domínio do módulo IT. Os valores espelham as constraints de
// supabase/migrations/20261010000000_it_support_module.sql.

export const TICKET_STATUSES = ['OPEN', 'IN_PROGRESS', 'WAITING_USER', 'RESOLVED', 'CLOSED'] as const;
export type TicketStatus = (typeof TICKET_STATUSES)[number];

export const TICKET_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type TicketPriority = (typeof TICKET_PRIORITIES)[number];

export const TICKET_EVENT_TYPES = [
  'CREATED',
  'ASSIGNED',
  'STATUS_CHANGED',
  'PRIORITY_CHANGED',
  'CATEGORY_CHANGED',
  'ASSET_CHANGED',
  'COMMENTED',
  'RESOLVED',
  'CLOSED',
  'REOPENED',
  'INTERVENTION_ADDED',
] as const;
export type TicketEventType = (typeof TICKET_EVENT_TYPES)[number];

export const ASSET_TYPES = ['COMPUTER', 'LAPTOP', 'MONITOR', 'PRINTER', 'PHONE', 'NETWORK', 'OTHER'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];

export const ASSET_STATUSES = ['ACTIVE', 'IN_REPAIR', 'IN_STOCK', 'RETIRED', 'LOST'] as const;
export type AssetStatus = (typeof ASSET_STATUSES)[number];

/** Estados em que o equipamento pode ter um utilizador responsável. */
export const ASSIGNABLE_ASSET_STATUSES: readonly AssetStatus[] = ['ACTIVE', 'IN_REPAIR', 'LOST'];

export const INTERVENTION_OUTCOMES = ['RESOLVED', 'PARTIALLY_RESOLVED', 'NOT_RESOLVED', 'ESCALATED'] as const;
export type InterventionOutcome = (typeof INTERVENTION_OUTCOMES)[number];

function isOneOf<Value extends string>(values: readonly Value[], value: string): value is Value {
  return (values as readonly string[]).includes(value);
}

export const isTicketStatus = (value: string): value is TicketStatus => isOneOf(TICKET_STATUSES, value);
export const isTicketPriority = (value: string): value is TicketPriority => isOneOf(TICKET_PRIORITIES, value);
export const isTicketEventType = (value: string): value is TicketEventType => isOneOf(TICKET_EVENT_TYPES, value);
export const isAssetType = (value: string): value is AssetType => isOneOf(ASSET_TYPES, value);
export const isAssetStatus = (value: string): value is AssetStatus => isOneOf(ASSET_STATUSES, value);
export const isInterventionOutcome = (value: string): value is InterventionOutcome => isOneOf(INTERVENTION_OUTCOMES, value);

export interface TicketCategory {
  id: string;
  code: string;
  name: string;
}

export interface ItTechnician {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  email: string;
}

export interface TicketSummary {
  id: string;
  reference: string;
  title: string;
  status: TicketStatus;
  priority: TicketPriority;
  categoryId: string;
  categoryName: string | null;
  requesterId: string;
  /** Null quando o perfil do solicitante não é visível para quem consulta. */
  requesterName: string | null;
  departmentName: string | null;
  assignedTo: string | null;
  assetId: string | null;
  assetTag: string | null;
  dueAt: string;
  statusChangedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface TicketDetail extends TicketSummary {
  description: string;
  resolutionSummary: string | null;
  resolvedAt: string | null;
  closedAt: string | null;
}

export interface TicketComment {
  id: string;
  authorId: string | null;
  authorName: string;
  body: string;
  isInternal: boolean;
  createdAt: string;
}

export interface TicketEvent {
  id: string;
  actorId: string | null;
  actorName: string | null;
  eventType: TicketEventType;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  isInternal: boolean;
  createdAt: string;
}

export interface ItDashboardSummary {
  openCount: number;
  inProgressCount: number;
  waitingUserCount: number;
  resolvedCount: number;
  criticalCount: number;
  unassignedCount: number;
  overdueCount: number;
  waitingTooLongCount: number;
  waitingAlertDays: number;
}

export interface Asset {
  id: string;
  assetTag: string;
  assetType: AssetType;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: AssetStatus;
  assignedTo: string | null;
  assignedToName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  location: string | null;
  acquiredOn: string | null;
  notes: string;
  createdAt: string;
  updatedAt: string;
}

export interface Intervention {
  id: string;
  ticketId: string | null;
  ticketReference: string | null;
  assetId: string | null;
  assetTag: string | null;
  technicianName: string;
  performedAt: string;
  problemDescription: string;
  workPerformed: string;
  outcome: InterventionOutcome;
  notes: string;
}
