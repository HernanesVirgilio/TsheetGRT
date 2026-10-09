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

export const ABSENCE_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'CANCELLED'] as const;
export type AbsenceStatus = (typeof ABSENCE_STATUSES)[number];
export const isAbsenceStatus = (value: string): value is AbsenceStatus => isOneOf(ABSENCE_STATUSES, value);

export const ABSENCE_DECISIONS = ['APPROVED', 'REJECTED', 'CHANGES_REQUESTED'] as const;
export type AbsenceDecision = (typeof ABSENCE_DECISIONS)[number];

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
}

export interface MeetingDetail extends MeetingSummary {
  description: string;
  objective: string;
  meetingUrl: string | null;
  outcome: string | null;
  decisions: string | null;
  nextSteps: string | null;
  cancelReason: string | null;
  task: { id: string; reference: string; title: string } | null;
  opportunity: { id: string; reference: string; title: string } | null;
  updatedAt: string;
}

export interface MeetingPerson {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  isOrganizer: boolean;
}

export interface AbsenceType {
  id: string;
  code: string;
  name: string;
  requiresAttachment: boolean;
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
  submittedAt: string | null;
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

export interface OpportunityPerson {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  isOwner: boolean;
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
  departmentName: string | null;
  tasksOpen: number;
  tasksInProgress: number;
  tasksBlocked: number;
  tasksOverdue: number;
  tasksDueNext7Days: number;
  minutesThisWeek: number;
  absenceToday: string | null;
  pendingAbsenceRequests: number;
}

export interface WorkPerson {
  profileId: string;
  fullName: string;
  jobTitle: string | null;
  departmentName: string | null;
}
