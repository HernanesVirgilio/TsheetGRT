// Tipos de domínio do Timesheet Core. Os valores espelham as constraints das migrations
// supabase/migrations/20261011000000_timesheet_core_*.sql.

function isOneOf<Value extends string>(values: readonly Value[], value: string): value is Value {
  return (values as readonly string[]).includes(value);
}

export const TASK_STATUSES = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED', 'COMPLETED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export const isTaskStatus = (value: string): value is TaskStatus => isOneOf(TASK_STATUSES, value);

export const WORK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type WorkPriority = (typeof WORK_PRIORITIES)[number];
export const isWorkPriority = (value: string): value is WorkPriority => isOneOf(WORK_PRIORITIES, value);

export const MEETING_STATUSES = ['PLANNED', 'CONFIRMED', 'COMPLETED', 'CANCELLED'] as const;
export type MeetingStatus = (typeof MEETING_STATUSES)[number];
export const isMeetingStatus = (value: string): value is MeetingStatus => isOneOf(MEETING_STATUSES, value);

/** SUBMITTED: a aguardar a validação do gestor. PENDING_APPROVAL: a aguardar a decisão do Manager. */
export const ABSENCE_STATUSES = ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCELLED', 'COMMUNICATED'] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];
export const isAbsenceStatus = (value: string): value is AbsenceStatus => isOneOf(ABSENCE_STATUSES, value);

export const ABSENCE_DECISIONS = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] as const;
export type AbsenceDecision = (typeof ABSENCE_DECISIONS)[number];

/** Validação do gestor da equipa (1.º nível). */
export type AbsenceValidation = 'VALIDATED' | 'CHANGES_REQUESTED';

export const OPPORTUNITY_APPROVAL_STATUSES = ['NOT_REQUIRED', 'NOT_SUBMITTED', 'PENDING', 'APPROVED', 'REJECTED'] as const;
export type OpportunityApprovalStatus = (typeof OPPORTUNITY_APPROVAL_STATUSES)[number];
export const isOpportunityApprovalStatus = (value: string): value is OpportunityApprovalStatus => isOneOf(OPPORTUNITY_APPROVAL_STATUSES, value);

export const APPROVAL_REQUEST_STATUSES = ['PENDING', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type ApprovalRequestStatus = (typeof APPROVAL_REQUEST_STATUSES)[number];
export const isApprovalRequestStatus = (value: string): value is ApprovalRequestStatus => isOneOf(APPROVAL_REQUEST_STATUSES, value);

export const OPPORTUNITY_STATUSES = ['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION', 'WON', 'LOST', 'CANCELLED'] as const;
export type OpportunityStatus = (typeof OPPORTUNITY_STATUSES)[number];
export const isOpportunityStatus = (value: string): value is OpportunityStatus => isOneOf(OPPORTUNITY_STATUSES, value);
export const ACTIVE_OPPORTUNITY_STATUSES: readonly OpportunityStatus[] = ['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'];

export const COMPANY_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CompanyStatus = (typeof COMPANY_STATUSES)[number];
export const isCompanyStatus = (value: string): value is CompanyStatus => isOneOf(COMPANY_STATUSES, value);

/** Contexto de um registo de tempo (timesheet_entries.kind). */
export const ENTRY_KINDS = ['GENERAL', 'TASK', 'MEETING', 'OPPORTUNITY', 'UNPLANNED'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];
export const isEntryKind = (value: string): value is EntryKind => isOneOf(ENTRY_KINDS, value);

export const ATTACHMENT_ENTITY_TYPES = ['TASK', 'ACTIVITY', 'MEETING', 'ABSENCE', 'OPPORTUNITY'] as const;
export type AttachmentEntityType = (typeof ATTACHMENT_ENTITY_TYPES)[number];

export const CALENDAR_ITEM_TYPES = ['DEADLINE', 'TASK', 'MEETING', 'ABSENCE', 'ACTIVITY', 'INTERNAL_EVENT', 'OPPORTUNITY_ACTIVITY'] as const;
export type CalendarItemType = (typeof CALENDAR_ITEM_TYPES)[number];
export const isCalendarItemType = (value: string): value is CalendarItemType => isOneOf(CALENDAR_ITEM_TYPES, value);

export type CalendarScope = 'ME' | 'TEAM';

/** Evento de um histórico append-only (tarefa, reunião, ausência ou oportunidade). */
export interface WorkEvent {
  id: string;
  actorName: string | null;
  eventType: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  note: string | null;
  afterClosure: boolean;
  createdAt: string;
}

export interface TaskSummary {
  id: string;
  reference: string;
  title: string;
  status: TaskStatus;
  priority: WorkPriority;
  assigneeId: string | null;
  assigneeName: string | null;
  createdBy: string;
  creatorName: string | null;
  departmentId: string | null;
  departmentName: string | null;
  startDate: string | null;
  dueAt: string | null;
  completedAt: string | null;
  updatedAt: string;
  /** A conclusão é acompanhada por quem supervisiona o gestor. */
  requiresManagerReview: boolean;
  reviewedAt: string | null;
}

export interface TaskDetail extends TaskSummary {
  description: string;
  estimatedMinutes: number | null;
  startedAt: string | null;
  completionNote: string | null;
  lateReason: string | null;
  blockedReason: string | null;
  cancelReason: string | null;
  parentTask: { id: string; reference: string; title: string } | null;
  opportunity: { id: string; reference: string; title: string } | null;
  meeting: { id: string; title: string } | null;
  reviewNote: string | null;
  createdAt: string;
}

export interface MeetingSummary {
  id: string;
  title: string;
  startsAt: string;
  endsAt: string;
  location: string | null;
  status: MeetingStatus;
  organizerId: string;
  organizerName: string | null;
  /** Pedido de reunião a uma chefia (null numa reunião normal, que não passa por aprovação). */
  requestStatus: MeetingRequestStatus | null;
  requestedWith: string | null;
}

export const MEETING_REQUEST_STATUSES = ['PENDING', 'ACCEPTED', 'REJECTED'] as const;
export type MeetingRequestStatus = (typeof MEETING_REQUEST_STATUSES)[number];
export const isMeetingRequestStatus = (value: string): value is MeetingRequestStatus => isOneOf(MEETING_REQUEST_STATUSES, value);

export const MEETING_RESPONSES = ['PENDING', 'ACCEPTED', 'DECLINED'] as const;
export type MeetingResponse = (typeof MEETING_RESPONSES)[number];
export const isMeetingResponse = (value: string): value is MeetingResponse => isOneOf(MEETING_RESPONSES, value);

export interface MeetingDetail extends MeetingSummary {
  description: string;
  objective: string;
  meetingUrl: string | null;
  outcome: string | null;
  decisions: string | null;
  nextSteps: string | null;
  cancelReason: string | null;
  requestDecidedAt: string | null;
  requestDecisionComment: string | null;
  task: { id: string; reference: string; title: string } | null;
  opportunity: { id: string; reference: string; title: string } | null;
  updatedAt: string;
}

export interface MeetingPerson {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  isOrganizer: boolean;
  response: MeetingResponse;
  respondedAt: string | null;
  responseComment: string | null;
}

/** Chefia configurada de quem pede (a quem se pode pedir uma reunião). */
export interface MeetingLead {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  relation: 'LEAD' | 'SUPERVISOR';
}

export interface AbsenceType {
  id: string;
  code: string;
  name: string;
  requiresAttachment: boolean;
  requiresManagerApproval: boolean;
}

export interface AbsenceRequest {
  id: string;
  reference: string;
  employeeId: string;
  employeeName: string | null;
  absenceTypeId: string;
  absenceTypeName: string;
  requiresAttachment: boolean;
  startDate: string;
  endDate: string;
  reason: string;
  status: AbsenceStatus;
  /** REQUEST: pedido formal (validação e decisão); NOTICE: indisponibilidade comunicada, nunca aprovada. */
  kind: 'REQUEST' | 'NOTICE';
  submittedAt: string | null;
  validatedAt: string | null;
  validationComment: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
}

export interface Company {
  id: string;
  name: string;
  nuit: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string;
  status: CompanyStatus;
}

export interface OpportunitySummary {
  id: string;
  reference: string;
  title: string;
  companyId: string;
  companyName: string | null;
  ownerId: string;
  ownerName: string | null;
  status: OpportunityStatus;
  estimatedValue: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  approvalStatus: OpportunityApprovalStatus;
  updatedAt: string;
}

export interface OpportunityDetail extends OpportunitySummary {
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  description: string;
  problem: string;
  proposal: string;
  initialValue: number | null;
  notes: string;
  lostReason: string | null;
  createdBy: string | null;
  closedAt: string | null;
}

/** Responsável comercial, gestor de execução (opcional) ou membro da equipa do projeto. */
export type OpportunityRole = 'OWNER' | 'EXECUTION_LEAD' | 'MEMBER';

export interface OpportunityPerson {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  isOwner: boolean;
  role: OpportunityRole;
}

/** Período ocupado de um participante: outra reunião ou uma ausência aprovada. */
export interface ScheduleConflict {
  profileId: string;
  fullName: string;
  kind: 'MEETING' | 'ABSENCE';
  /** Só preenchidos quando quem organiza pode ver essa reunião. */
  meetingId: string | null;
  title: string | null;
  startsAt: string;
  endsAt: string;
}

export interface Attachment {
  id: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  storagePath: string;
  uploadedBy: string;
  createdAt: string;
}

export interface CalendarItem {
  itemType: CalendarItemType;
  itemId: string;
  title: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  status: string;
  personId: string | null;
  personName: string | null;
  reference: string | null;
  isOverdue: boolean;
}

export interface CalendarEvent {
  id: string;
  title: string;
  description: string;
  startsAt: string;
  endsAt: string;
  allDay: boolean;
  location: string | null;
  departmentId: string | null;
  createdBy: string;
}

/** Registo de tempo com o seu contexto (tarefa, reunião, oportunidade ou extraordinário). */
export interface WorkLogEntry {
  id: string;
  timesheetId: string;
  timesheetStatus: string;
  employeeId: string;
  workDate: string;
  startTime: string;
  endTime: string;
  breakMinutes: number;
  totalMinutes: number;
  description: string;
  kind: EntryKind;
  activityId: string;
  activityName: string | null;
  task: { id: string; reference: string; title: string } | null;
  meeting: { id: string; title: string } | null;
  opportunity: { id: string; reference: string; title: string } | null;
}

export interface WorkTimeTotal {
  profileId: string;
  fullName: string;
  totalMinutes: number;
  entryCount: number;
}

export interface MyWorkSummary {
  tasksAssigned: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tasksOverdue: number;
  tasksDueToday: number;
  tasksDueNext7Days: number;
  minutesToday: number;
  minutesThisWeek: number;
  dailyTargetMinutes: number;
  meetingsToday: number;
  absenceToday: string | null;
  pendingAbsenceRequests: number;
}

export interface TeamMemberWorkload {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  jobDescription: string | null;
  departmentName: string | null;
  roleCode: string | null;
  /** Gestor(es) direto(s) da equipa a que pertence. */
  leadNames: string | null;
  /** Abrangido diretamente pelo âmbito de quem consulta (não através de um gestor). */
  isDirect: boolean;
  tasksOpen: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tasksOverdue: number;
  tasksDueNext7Days: number;
  tasksCompleted30Days: number;
  opportunitiesActive: number;
  minutesThisWeek: number;
  lastActivityDate: string | null;
  absenceToday: string | null;
  pendingAbsenceRequests: number;
}

export interface WorkPerson {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  /** Só preenchida para responsáveis possíveis (equipa do âmbito). */
  jobDescription?: string | null;
}

/** Pedido de aprovação explícito (oportunidades). */
export interface ApprovalRequest {
  id: string;
  reference: string;
  opportunityId: string | null;
  opportunityReference: string | null;
  opportunityTitle: string | null;
  opportunityOwnerName: string | null;
  requestedBy: string;
  requesterName: string | null;
  title: string;
  amount: number | null;
  currency: string | null;
  justification: string;
  status: ApprovalRequestStatus;
  deciderName: string | null;
  decidedAt: string | null;
  decisionComment: string | null;
  createdAt: string;
}

/** Indicadores do painel do gestor/Manager (calculados no servidor, limitados ao âmbito). */
export interface TeamDashboard {
  teamSize: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tasksOverdue: number;
  tasksCompleted: number;
  tasksCompletedLate: number;
  tasksPendingFollowUp: number;
  absencesToValidate: number;
  absencesAwaitingDecision: number;
  opportunitiesActive: number;
  opportunityApprovalsPending: number;
  meetingsNext7Days: number;
  minutesLogged: number;
}

export interface OpportunityPipelineRow {
  currency: string;
  opportunitiesActive: number;
  estimatedValueActive: number;
  weightedValueActive: number;
  approvalsPending: number;
  wonLast90Days: number;
  wonValueLast90Days: number;
}

export interface TeamReportRow {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
  leadNames: string | null;
  tasksCompleted: number;
  tasksCompletedLate: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksBlocked: number;
  minutesLogged: number;
  entryCount: number;
}

export interface TrendPoint {
  weekStart: string;
  tasksCompleted: number;
  tasksCompletedLate: number;
  minutesLogged: number;
}

/** Uma linha por gestor supervisionado (leadId null = equipa direta do Manager). */
export interface SupervisionRow {
  leadId: string | null;
  leadName: string;
  departments: string | null;
  teamSize: number;
  tasksCompleted: number;
  tasksCompletedLate: number;
  tasksOpen: number;
  tasksOverdue: number;
  tasksBlocked: number;
  minutesLogged: number;
  absencesPending: number;
  approvalsPending: number;
}

/** Evento recente do histórico das tarefas da equipa. */
export interface TeamActivityItem {
  id: string;
  taskId: string;
  taskReference: string;
  taskTitle: string;
  eventType: string;
  field: string | null;
  actorName: string | null;
  createdAt: string;
}
