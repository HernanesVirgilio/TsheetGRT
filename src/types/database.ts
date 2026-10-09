// Tipos do schema PostgreSQL (supabase/migrations).
// Quando houver acesso ao projeto, podem ser regenerados com:
//   npx supabase gen types typescript --project-id <id> > src/types/database.ts

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Timestamps = {
  created_at: string;
  updated_at: string;
};

export type DepartmentRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type ProfileRow = Timestamps & {
  id: string;
  auth_user_id: string | null;
  employee_number: string;
  full_name: string;
  email: string;
  phone: string | null;
  department_id: string | null;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  last_login_at: string | null;
};

export type RoleRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string;
};

export type PermissionRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string;
  module: string;
};

export type RolePermissionRow = {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
};

export type UserRoleRow = {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
};

export type ManagerScopeRow = {
  id: string;
  manager_id: string;
  employee_id: string | null;
  department_id: string | null;
  created_at: string;
};

export type ActivityRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
};

export type TimesheetRow = Timestamps & {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
};

export type TimesheetEntryRow = Timestamps & {
  id: string;
  timesheet_id: string;
  employee_id: string;
  work_date: string;
  activity_id: string;
  start_time: string;
  end_time: string;
  break_minutes: number;
  total_minutes: number;
  description: string;
  /** GENERAL | TASK | MEETING | OPPORTUNITY | UNPLANNED (contexto do tempo). */
  kind: string;
  task_id: string | null;
  meeting_id: string | null;
  opportunity_id: string | null;
};

export type TimesheetApprovalRow = {
  id: string;
  timesheet_id: string;
  approver_id: string;
  status: string;
  comment: string | null;
  created_at: string;
};

export type AuditEventRow = {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
};

export type NotificationRow = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
};

export type SystemSettingRow = {
  id: string;
  key: string;
  value: string;
  description: string;
  updated_at: string;
};

export type ItTicketCategoryRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string;
  sort_order: number;
  active: boolean;
};

export type ItAssetRow = Timestamps & {
  id: string;
  asset_tag: string;
  asset_type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  assigned_to: string | null;
  department_id: string | null;
  location: string | null;
  acquired_on: string | null;
  notes: string;
};

export type ItTicketRow = Timestamps & {
  id: string;
  reference: string;
  title: string;
  description: string;
  requester_id: string;
  requester_department_id: string | null;
  category_id: string;
  priority: string;
  status: string;
  assigned_to: string | null;
  asset_id: string | null;
  resolution_summary: string | null;
  due_at: string;
  status_changed_at: string;
  resolved_at: string | null;
  closed_at: string | null;
};

export type ItTicketCommentRow = {
  id: string;
  ticket_id: string;
  author_id: string | null;
  author_name: string;
  body: string;
  is_internal: boolean;
  created_at: string;
};

export type ItTicketEventRow = {
  id: string;
  ticket_id: string;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  is_internal: boolean;
  created_at: string;
};

export type ItInterventionRow = {
  id: string;
  ticket_id: string | null;
  asset_id: string | null;
  technician_id: string | null;
  technician_name: string;
  performed_at: string;
  problem_description: string;
  work_performed: string;
  outcome: string;
  notes: string;
  created_at: string;
};

export type CompanyRow = Timestamps & {
  id: string;
  name: string;
  nuit: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string;
  status: string;
  created_by: string | null;
};

export type OpportunityRow = Timestamps & {
  id: string;
  reference: string;
  title: string;
  company_id: string;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  description: string;
  problem: string;
  proposal: string;
  initial_value: number | null;
  estimated_value: number | null;
  currency: string;
  probability: number | null;
  expected_close_date: string | null;
  owner_id: string;
  department_id: string | null;
  status: string;
  next_step: string | null;
  next_step_date: string | null;
  notes: string;
  lost_reason: string | null;
  closed_at: string | null;
  created_by: string | null;
};

export type OpportunityMemberRow = {
  opportunity_id: string;
  profile_id: string;
  added_by: string | null;
  created_at: string;
};

/** Estrutura comum dos históricos append-only (tarefas, reuniões, ausências, oportunidades). */
type WorkEventColumns = {
  id: string;
  actor_id: string | null;
  actor_name: string | null;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
};

export type OpportunityEventRow = WorkEventColumns & { opportunity_id: string; after_closure: boolean };

export type TaskRow = Timestamps & {
  id: string;
  reference: string;
  title: string;
  description: string;
  created_by: string;
  assignee_id: string | null;
  department_id: string | null;
  priority: string;
  status: string;
  start_date: string | null;
  due_at: string | null;
  estimated_minutes: number | null;
  started_at: string | null;
  completed_at: string | null;
  completion_note: string | null;
  late_reason: string | null;
  blocked_reason: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  parent_task_id: string | null;
  opportunity_id: string | null;
  meeting_id: string | null;
};

export type TaskEventRow = WorkEventColumns & { task_id: string; after_closure: boolean };

export type MeetingRow = Timestamps & {
  id: string;
  title: string;
  description: string;
  objective: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  meeting_url: string | null;
  organizer_id: string;
  department_id: string | null;
  status: string;
  outcome: string | null;
  decisions: string | null;
  next_steps: string | null;
  completed_at: string | null;
  cancelled_at: string | null;
  cancel_reason: string | null;
  task_id: string | null;
  opportunity_id: string | null;
};

export type MeetingParticipantRow = {
  meeting_id: string;
  profile_id: string;
  created_at: string;
};

export type MeetingEventRow = WorkEventColumns & { meeting_id: string; after_closure: boolean };

export type AbsenceTypeRow = Timestamps & {
  id: string;
  code: string;
  name: string;
  description: string;
  requires_attachment: boolean;
  active: boolean;
  sort_order: number;
};

export type AbsenceRequestRow = Timestamps & {
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
  decided_by: string | null;
  decision_comment: string | null;
  cancelled_at: string | null;
};

export type AbsenceEventRow = WorkEventColumns & { absence_request_id: string };

export type CalendarEventRow = Timestamps & {
  id: string;
  title: string;
  description: string;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  location: string | null;
  department_id: string | null;
  status: string;
  created_by: string;
};

export type AttachmentRow = {
  id: string;
  entity_type: string;
  entity_id: string;
  bucket_id: string;
  storage_path: string;
  file_name: string;
  mime_type: string;
  size_bytes: number;
  uploaded_by: string;
  created_at: string;
  upload_confirmed_at: string | null;
  deleted_at: string | null;
  deleted_by: string | null;
  delete_reason: string | null;
};

type Relationship<Name extends string, Column extends string, Target extends string, OneToOne extends boolean> = {
  foreignKeyName: Name;
  columns: [Column];
  isOneToOne: OneToOne;
  referencedRelation: Target;
  referencedColumns: ['id'];
};

type ProfileReference<Table extends string, Column extends string> = Relationship<
  `${Table}_${Column}_fkey`,
  Column,
  'profiles',
  false
>;

type NoArgs = Record<PropertyKey, never>;

export type Database = {
  public: {
    Tables: {
      departments: {
        Row: DepartmentRow;
        Insert: Pick<DepartmentRow, 'code' | 'name'> & Partial<DepartmentRow>;
        Update: Partial<DepartmentRow>;
        Relationships: [];
      };
      profiles: {
        Row: ProfileRow;
        Insert: Pick<ProfileRow, 'full_name' | 'email'> & Partial<ProfileRow>;
        Update: Partial<ProfileRow>;
        Relationships: [
          Relationship<'profiles_department_id_fkey', 'department_id', 'departments', false>,
        ];
      };
      roles: {
        Row: RoleRow;
        Insert: Pick<RoleRow, 'code' | 'name'> & Partial<RoleRow>;
        Update: Partial<RoleRow>;
        Relationships: [];
      };
      permissions: {
        Row: PermissionRow;
        Insert: Pick<PermissionRow, 'code' | 'name' | 'module'> & Partial<PermissionRow>;
        Update: Partial<PermissionRow>;
        Relationships: [];
      };
      role_permissions: {
        Row: RolePermissionRow;
        Insert: Pick<RolePermissionRow, 'role_id' | 'permission_id'> & Partial<RolePermissionRow>;
        Update: Partial<RolePermissionRow>;
        Relationships: [
          Relationship<'role_permissions_role_id_fkey', 'role_id', 'roles', false>,
          Relationship<'role_permissions_permission_id_fkey', 'permission_id', 'permissions', false>,
        ];
      };
      user_roles: {
        Row: UserRoleRow;
        Insert: Pick<UserRoleRow, 'user_id' | 'role_id'> & Partial<UserRoleRow>;
        Update: Partial<UserRoleRow>;
        Relationships: [
          Relationship<'user_roles_user_id_fkey', 'user_id', 'profiles', true>,
          Relationship<'user_roles_role_id_fkey', 'role_id', 'roles', false>,
        ];
      };
      manager_scopes: {
        Row: ManagerScopeRow;
        Insert: Pick<ManagerScopeRow, 'manager_id'> & Partial<ManagerScopeRow>;
        Update: Partial<ManagerScopeRow>;
        Relationships: [
          ProfileReference<'manager_scopes', 'manager_id'>,
          ProfileReference<'manager_scopes', 'employee_id'>,
          Relationship<'manager_scopes_department_id_fkey', 'department_id', 'departments', false>,
        ];
      };
      activities: {
        Row: ActivityRow;
        Insert: Pick<ActivityRow, 'code' | 'name'> & Partial<ActivityRow>;
        Update: Partial<ActivityRow>;
        Relationships: [];
      };
      timesheets: {
        Row: TimesheetRow;
        Insert: Pick<TimesheetRow, 'employee_id' | 'period_start' | 'period_end'> & Partial<TimesheetRow>;
        Update: Partial<TimesheetRow>;
        Relationships: [
          ProfileReference<'timesheets', 'employee_id'>,
          ProfileReference<'timesheets', 'approved_by'>,
          ProfileReference<'timesheets', 'rejected_by'>,
        ];
      };
      timesheet_entries: {
        Row: TimesheetEntryRow;
        Insert: Omit<TimesheetEntryRow, 'id' | 'total_minutes' | 'created_at' | 'updated_at' | 'kind' | 'task_id' | 'meeting_id' | 'opportunity_id'> &
          Partial<TimesheetEntryRow>;
        Update: Partial<TimesheetEntryRow>;
        Relationships: [
          Relationship<'timesheet_entries_timesheet_id_fkey', 'timesheet_id', 'timesheets', false>,
          ProfileReference<'timesheet_entries', 'employee_id'>,
          Relationship<'timesheet_entries_activity_id_fkey', 'activity_id', 'activities', false>,
          Relationship<'timesheet_entries_task_id_fkey', 'task_id', 'tasks', false>,
          Relationship<'timesheet_entries_meeting_id_fkey', 'meeting_id', 'meetings', false>,
          Relationship<'timesheet_entries_opportunity_id_fkey', 'opportunity_id', 'opportunities', false>,
        ];
      };
      timesheet_approvals: {
        Row: TimesheetApprovalRow;
        Insert: Pick<TimesheetApprovalRow, 'timesheet_id' | 'approver_id' | 'status'> & Partial<TimesheetApprovalRow>;
        Update: Partial<TimesheetApprovalRow>;
        Relationships: [
          Relationship<'timesheet_approvals_timesheet_id_fkey', 'timesheet_id', 'timesheets', false>,
          ProfileReference<'timesheet_approvals', 'approver_id'>,
        ];
      };
      audit_events: {
        Row: AuditEventRow;
        Insert: Pick<AuditEventRow, 'action' | 'entity_type' | 'description'> & Partial<AuditEventRow>;
        Update: Partial<AuditEventRow>;
        Relationships: [ProfileReference<'audit_events', 'actor_user_id'>];
      };
      notifications: {
        Row: NotificationRow;
        Insert: Pick<NotificationRow, 'user_id' | 'type' | 'title' | 'message'> & Partial<NotificationRow>;
        Update: Partial<NotificationRow>;
        Relationships: [ProfileReference<'notifications', 'user_id'>];
      };
      it_ticket_categories: {
        Row: ItTicketCategoryRow;
        Insert: Pick<ItTicketCategoryRow, 'code' | 'name'> & Partial<ItTicketCategoryRow>;
        Update: Partial<ItTicketCategoryRow>;
        Relationships: [];
      };
      it_assets: {
        Row: ItAssetRow;
        Insert: Pick<ItAssetRow, 'asset_type'> & Partial<ItAssetRow>;
        Update: Partial<ItAssetRow>;
        Relationships: [
          ProfileReference<'it_assets', 'assigned_to'>,
          Relationship<'it_assets_department_id_fkey', 'department_id', 'departments', false>,
        ];
      };
      it_tickets: {
        Row: ItTicketRow;
        Insert: Pick<ItTicketRow, 'title' | 'description' | 'requester_id' | 'category_id' | 'due_at'> & Partial<ItTicketRow>;
        Update: Partial<ItTicketRow>;
        Relationships: [
          ProfileReference<'it_tickets', 'requester_id'>,
          ProfileReference<'it_tickets', 'assigned_to'>,
          Relationship<'it_tickets_requester_department_id_fkey', 'requester_department_id', 'departments', false>,
          Relationship<'it_tickets_category_id_fkey', 'category_id', 'it_ticket_categories', false>,
          Relationship<'it_tickets_asset_id_fkey', 'asset_id', 'it_assets', false>,
        ];
      };
      it_ticket_comments: {
        Row: ItTicketCommentRow;
        Insert: Pick<ItTicketCommentRow, 'ticket_id' | 'author_name' | 'body'> & Partial<ItTicketCommentRow>;
        Update: Partial<ItTicketCommentRow>;
        Relationships: [
          Relationship<'it_ticket_comments_ticket_id_fkey', 'ticket_id', 'it_tickets', false>,
          ProfileReference<'it_ticket_comments', 'author_id'>,
        ];
      };
      it_ticket_events: {
        Row: ItTicketEventRow;
        Insert: Pick<ItTicketEventRow, 'ticket_id' | 'event_type'> & Partial<ItTicketEventRow>;
        Update: Partial<ItTicketEventRow>;
        Relationships: [
          Relationship<'it_ticket_events_ticket_id_fkey', 'ticket_id', 'it_tickets', false>,
          ProfileReference<'it_ticket_events', 'actor_id'>,
        ];
      };
      it_interventions: {
        Row: ItInterventionRow;
        Insert: Pick<ItInterventionRow, 'technician_name' | 'problem_description' | 'work_performed' | 'outcome'> &
          Partial<ItInterventionRow>;
        Update: Partial<ItInterventionRow>;
        Relationships: [
          Relationship<'it_interventions_ticket_id_fkey', 'ticket_id', 'it_tickets', false>,
          Relationship<'it_interventions_asset_id_fkey', 'asset_id', 'it_assets', false>,
          ProfileReference<'it_interventions', 'technician_id'>,
        ];
      };
      companies: {
        Row: CompanyRow;
        Insert: Pick<CompanyRow, 'name'> & Partial<CompanyRow>;
        Update: Partial<CompanyRow>;
        Relationships: [ProfileReference<'companies', 'created_by'>];
      };
      opportunities: {
        Row: OpportunityRow;
        Insert: Pick<OpportunityRow, 'title' | 'company_id' | 'owner_id'> & Partial<OpportunityRow>;
        Update: Partial<OpportunityRow>;
        Relationships: [
          Relationship<'opportunities_company_id_fkey', 'company_id', 'companies', false>,
          ProfileReference<'opportunities', 'owner_id'>,
          ProfileReference<'opportunities', 'created_by'>,
          Relationship<'opportunities_department_id_fkey', 'department_id', 'departments', false>,
        ];
      };
      opportunity_members: {
        Row: OpportunityMemberRow;
        Insert: Pick<OpportunityMemberRow, 'opportunity_id' | 'profile_id'> & Partial<OpportunityMemberRow>;
        Update: Partial<OpportunityMemberRow>;
        Relationships: [
          Relationship<'opportunity_members_opportunity_id_fkey', 'opportunity_id', 'opportunities', false>,
          ProfileReference<'opportunity_members', 'profile_id'>,
        ];
      };
      opportunity_events: {
        Row: OpportunityEventRow;
        Insert: Pick<OpportunityEventRow, 'opportunity_id' | 'event_type'> & Partial<OpportunityEventRow>;
        Update: Partial<OpportunityEventRow>;
        Relationships: [Relationship<'opportunity_events_opportunity_id_fkey', 'opportunity_id', 'opportunities', false>];
      };
      tasks: {
        Row: TaskRow;
        Insert: Pick<TaskRow, 'title' | 'created_by'> & Partial<TaskRow>;
        Update: Partial<TaskRow>;
        Relationships: [
          ProfileReference<'tasks', 'created_by'>,
          ProfileReference<'tasks', 'assignee_id'>,
          Relationship<'tasks_department_id_fkey', 'department_id', 'departments', false>,
          Relationship<'tasks_parent_task_id_fkey', 'parent_task_id', 'tasks', false>,
          Relationship<'tasks_opportunity_id_fkey', 'opportunity_id', 'opportunities', false>,
          Relationship<'tasks_meeting_id_fkey', 'meeting_id', 'meetings', false>,
        ];
      };
      task_events: {
        Row: TaskEventRow;
        Insert: Pick<TaskEventRow, 'task_id' | 'event_type'> & Partial<TaskEventRow>;
        Update: Partial<TaskEventRow>;
        Relationships: [Relationship<'task_events_task_id_fkey', 'task_id', 'tasks', false>];
      };
      meetings: {
        Row: MeetingRow;
        Insert: Pick<MeetingRow, 'title' | 'starts_at' | 'ends_at' | 'organizer_id'> & Partial<MeetingRow>;
        Update: Partial<MeetingRow>;
        Relationships: [
          ProfileReference<'meetings', 'organizer_id'>,
          Relationship<'meetings_department_id_fkey', 'department_id', 'departments', false>,
          Relationship<'meetings_task_id_fkey', 'task_id', 'tasks', false>,
          Relationship<'meetings_opportunity_id_fkey', 'opportunity_id', 'opportunities', false>,
        ];
      };
      meeting_participants: {
        Row: MeetingParticipantRow;
        Insert: Pick<MeetingParticipantRow, 'meeting_id' | 'profile_id'> & Partial<MeetingParticipantRow>;
        Update: Partial<MeetingParticipantRow>;
        Relationships: [
          Relationship<'meeting_participants_meeting_id_fkey', 'meeting_id', 'meetings', false>,
          ProfileReference<'meeting_participants', 'profile_id'>,
        ];
      };
      meeting_events: {
        Row: MeetingEventRow;
        Insert: Pick<MeetingEventRow, 'meeting_id' | 'event_type'> & Partial<MeetingEventRow>;
        Update: Partial<MeetingEventRow>;
        Relationships: [Relationship<'meeting_events_meeting_id_fkey', 'meeting_id', 'meetings', false>];
      };
      absence_types: {
        Row: AbsenceTypeRow;
        Insert: Pick<AbsenceTypeRow, 'code' | 'name'> & Partial<AbsenceTypeRow>;
        Update: Partial<AbsenceTypeRow>;
        Relationships: [];
      };
      absence_requests: {
        Row: AbsenceRequestRow;
        Insert: Pick<AbsenceRequestRow, 'employee_id' | 'absence_type_id' | 'start_date' | 'end_date'> & Partial<AbsenceRequestRow>;
        Update: Partial<AbsenceRequestRow>;
        Relationships: [
          ProfileReference<'absence_requests', 'employee_id'>,
          ProfileReference<'absence_requests', 'decided_by'>,
          Relationship<'absence_requests_absence_type_id_fkey', 'absence_type_id', 'absence_types', false>,
        ];
      };
      absence_events: {
        Row: AbsenceEventRow;
        Insert: Pick<AbsenceEventRow, 'absence_request_id' | 'event_type'> & Partial<AbsenceEventRow>;
        Update: Partial<AbsenceEventRow>;
        Relationships: [Relationship<'absence_events_absence_request_id_fkey', 'absence_request_id', 'absence_requests', false>];
      };
      calendar_events: {
        Row: CalendarEventRow;
        Insert: Pick<CalendarEventRow, 'title' | 'starts_at' | 'ends_at' | 'created_by'> & Partial<CalendarEventRow>;
        Update: Partial<CalendarEventRow>;
        Relationships: [
          ProfileReference<'calendar_events', 'created_by'>,
          Relationship<'calendar_events_department_id_fkey', 'department_id', 'departments', false>,
        ];
      };
      attachments: {
        Row: AttachmentRow;
        Insert: Pick<AttachmentRow, 'entity_type' | 'entity_id' | 'storage_path' | 'file_name' | 'mime_type' | 'size_bytes' | 'uploaded_by'> &
          Partial<AttachmentRow>;
        Update: Partial<AttachmentRow>;
        Relationships: [ProfileReference<'attachments', 'uploaded_by'>];
      };
      system_settings: {
        Row: SystemSettingRow;
        Insert: Pick<SystemSettingRow, 'key' | 'value'> & Partial<SystemSettingRow>;
        Update: Partial<SystemSettingRow>;
        Relationships: [];
      };
    };
    Views: {
      /** Perfis no manager_scope do utilizador autenticado (exclui o próprio). */
      my_team_members: {
        Row: ProfileRow;
        Relationships: [
          Relationship<'profiles_department_id_fkey', 'department_id', 'departments', false>,
        ];
      };
    };
    Functions: {
      get_current_profile_id: { Args: NoArgs; Returns: string | null };
      has_permission: { Args: { p_permission_code: string }; Returns: boolean };
      is_manager_of_employee: { Args: { p_employee_id: string }; Returns: boolean };
      get_my_permissions: { Args: NoArgs; Returns: string[] };
      log_auth_event: { Args: { p_action: string }; Returns: undefined };
      create_user_profile: {
        Args: {
          p_auth_user_id: string;
          p_full_name: string;
          p_email: string;
          p_role_code: string;
          p_department_id: string;
          p_job_title?: string | null;
          p_phone?: string | null;
        };
        Returns: string;
      };
      set_role_permissions: { Args: { p_role_code: string; p_permission_codes: string[] }; Returns: undefined };
      update_system_settings: { Args: { p_settings: Json }; Returns: undefined };
      submit_timesheet: { Args: { p_timesheet_id: string }; Returns: undefined };
      review_timesheet: {
        Args: { p_timesheet_id: string; p_decision: string; p_comment?: string | null };
        Returns: undefined;
      };
      create_it_ticket: {
        Args: { p_title: string; p_description: string; p_category_id: string; p_priority: string; p_asset_id?: string | null };
        Returns: string;
      };
      take_it_ticket: { Args: { p_ticket_id: string }; Returns: undefined };
      assign_it_ticket: { Args: { p_ticket_id: string; p_technician_id: string }; Returns: undefined };
      change_it_ticket_status: { Args: { p_ticket_id: string; p_status: string; p_note?: string | null }; Returns: undefined };
      update_it_ticket_priority: { Args: { p_ticket_id: string; p_priority: string; p_reason?: string | null }; Returns: undefined };
      update_it_ticket_category: { Args: { p_ticket_id: string; p_category_id: string }; Returns: undefined };
      set_it_ticket_asset: { Args: { p_ticket_id: string; p_asset_id: string | null }; Returns: undefined };
      resolve_it_ticket: { Args: { p_ticket_id: string; p_resolution: string }; Returns: undefined };
      close_it_ticket: { Args: { p_ticket_id: string; p_note?: string | null }; Returns: undefined };
      reopen_it_ticket: { Args: { p_ticket_id: string; p_reason: string }; Returns: undefined };
      add_it_ticket_comment: { Args: { p_ticket_id: string; p_body: string; p_is_internal?: boolean }; Returns: string };
      add_it_intervention: {
        Args: {
          p_ticket_id: string | null;
          p_asset_id: string | null;
          p_performed_at: string;
          p_problem_description: string;
          p_work_performed: string;
          p_outcome: string;
          p_notes?: string | null;
        };
        Returns: string;
      };
      list_it_technicians: {
        Args: NoArgs;
        Returns: { profile_id: string; full_name: string; job_title: string | null; email: string }[];
      };
      get_it_dashboard_summary: {
        Args: NoArgs;
        Returns: {
          open_count: number;
          in_progress_count: number;
          waiting_user_count: number;
          resolved_count: number;
          critical_count: number;
          unassigned_count: number;
          overdue_count: number;
          waiting_too_long_count: number;
          waiting_alert_days: number;
        }[];
      };
      get_timesheet_decisions: {
        Args: { p_timesheet_id: string };
        Returns: {
          decision_id: string;
          status: string;
          comment: string | null;
          created_at: string;
          reviewer_name: string | null;
          reviewer_job_title: string | null;
          reviewer_email: string | null;
        }[];
      };
      create_task: {
        Args: {
          p_title: string;
          p_description?: string;
          p_priority?: string;
          p_assignee_id?: string | null;
          p_due_at?: string | null;
          p_start_date?: string | null;
          p_estimated_minutes?: number | null;
          p_department_id?: string | null;
          p_parent_task_id?: string | null;
          p_opportunity_id?: string | null;
          p_meeting_id?: string | null;
        };
        Returns: string;
      };
      assign_task: { Args: { p_task_id: string; p_assignee_id: string | null; p_note?: string | null }; Returns: undefined };
      update_task: {
        Args: {
          p_task_id: string;
          p_title: string;
          p_description: string;
          p_priority: string;
          p_due_at: string | null;
          p_start_date: string | null;
          p_estimated_minutes: number | null;
          p_department_id: string | null;
          p_reason?: string | null;
          p_expected_updated_at?: string | null;
        };
        Returns: undefined;
      };
      start_task: { Args: { p_task_id: string }; Returns: undefined };
      block_task: { Args: { p_task_id: string; p_reason: string }; Returns: undefined };
      unblock_task: { Args: { p_task_id: string; p_note?: string | null }; Returns: undefined };
      complete_task: { Args: { p_task_id: string; p_completion_note?: string | null; p_late_reason?: string | null }; Returns: undefined };
      reopen_task: { Args: { p_task_id: string; p_reason: string; p_new_due_at?: string | null }; Returns: undefined };
      cancel_task: { Args: { p_task_id: string; p_reason: string }; Returns: undefined };
      add_task_comment: { Args: { p_task_id: string; p_body: string }; Returns: undefined };
      ensure_my_timesheet_period: { Args: { p_work_date: string }; Returns: string };
      get_work_time_totals: {
        Args: { p_entity_type: string; p_entity_id: string };
        Returns: { profile_id: string; full_name: string; total_minutes: number; entry_count: number }[];
      };
      create_meeting: {
        Args: {
          p_title: string;
          p_starts_at: string;
          p_ends_at: string;
          p_description?: string;
          p_objective?: string;
          p_location?: string | null;
          p_meeting_url?: string | null;
          p_participant_ids?: string[];
          p_task_id?: string | null;
          p_opportunity_id?: string | null;
        };
        Returns: string;
      };
      update_meeting: {
        Args: {
          p_meeting_id: string;
          p_title: string;
          p_starts_at: string;
          p_ends_at: string;
          p_description: string;
          p_objective: string;
          p_location: string | null;
          p_meeting_url: string | null;
          p_participant_ids: string[];
          p_expected_updated_at?: string | null;
        };
        Returns: undefined;
      };
      confirm_meeting: { Args: { p_meeting_id: string }; Returns: undefined };
      complete_meeting: {
        Args: { p_meeting_id: string; p_outcome: string; p_decisions?: string | null; p_next_steps?: string | null };
        Returns: undefined;
      };
      update_meeting_outcome: {
        Args: { p_meeting_id: string; p_outcome: string; p_decisions: string | null; p_next_steps: string | null; p_reason: string };
        Returns: undefined;
      };
      cancel_meeting: { Args: { p_meeting_id: string; p_reason: string }; Returns: undefined };
      save_absence_request: {
        Args: { p_request_id: string | null; p_absence_type_id: string; p_start_date: string; p_end_date: string; p_reason?: string };
        Returns: string;
      };
      submit_absence_request: { Args: { p_request_id: string }; Returns: undefined };
      decide_absence_request: { Args: { p_request_id: string; p_decision: string; p_comment?: string | null }; Returns: undefined };
      cancel_absence_request: { Args: { p_request_id: string; p_reason?: string | null }; Returns: undefined };
      create_opportunity: {
        Args: {
          p_title: string;
          p_company_id: string;
          p_owner_id?: string | null;
          p_contact_name?: string | null;
          p_contact_phone?: string | null;
          p_contact_email?: string | null;
          p_description?: string;
          p_problem?: string;
          p_proposal?: string;
          p_initial_value?: number | null;
          p_estimated_value?: number | null;
          p_currency?: string;
          p_probability?: number | null;
          p_expected_close_date?: string | null;
          p_next_step?: string | null;
          p_next_step_date?: string | null;
          p_notes?: string;
        };
        Returns: string;
      };
      update_opportunity: {
        Args: {
          p_opportunity_id: string;
          p_title: string;
          p_company_id: string;
          p_contact_name: string | null;
          p_contact_phone: string | null;
          p_contact_email: string | null;
          p_description: string;
          p_problem: string;
          p_proposal: string;
          p_initial_value: number | null;
          p_estimated_value: number | null;
          p_currency: string;
          p_probability: number | null;
          p_expected_close_date: string | null;
          p_next_step: string | null;
          p_next_step_date: string | null;
          p_notes: string;
          p_reason?: string | null;
          p_expected_updated_at?: string | null;
        };
        Returns: undefined;
      };
      change_opportunity_status: { Args: { p_opportunity_id: string; p_status: string; p_note?: string | null }; Returns: undefined };
      set_opportunity_owner: { Args: { p_opportunity_id: string; p_owner_id: string; p_note?: string | null }; Returns: undefined };
      add_opportunity_member: { Args: { p_opportunity_id: string; p_profile_id: string }; Returns: undefined };
      remove_opportunity_member: { Args: { p_opportunity_id: string; p_profile_id: string }; Returns: undefined };
      add_opportunity_comment: { Args: { p_opportunity_id: string; p_body: string }; Returns: undefined };
      register_attachment: {
        Args: { p_entity_type: string; p_entity_id: string; p_file_name: string; p_mime_type: string; p_size_bytes: number };
        Returns: { attachment_id: string; storage_path: string }[];
      };
      confirm_attachment: { Args: { p_attachment_id: string }; Returns: undefined };
      remove_attachment: { Args: { p_attachment_id: string; p_reason?: string | null }; Returns: undefined };
      get_calendar_items: {
        Args: { p_from: string; p_to: string; p_scope?: string };
        Returns: {
          item_type: string;
          item_id: string;
          title: string;
          starts_at: string;
          ends_at: string;
          all_day: boolean;
          status: string;
          person_id: string | null;
          person_name: string | null;
          reference: string | null;
          is_overdue: boolean;
        }[];
      };
      get_my_work_summary: {
        Args: NoArgs;
        Returns: {
          tasks_assigned: number;
          tasks_in_progress: number;
          tasks_blocked: number;
          tasks_overdue: number;
          tasks_due_today: number;
          tasks_due_next_7_days: number;
          minutes_today: number;
          minutes_this_week: number;
          daily_target_minutes: number;
          meetings_today: number;
          absence_today: string | null;
          pending_absence_requests: number;
        }[];
      };
      get_team_work_overview: {
        Args: NoArgs;
        Returns: {
          profile_id: string;
          full_name: string;
          job_title: string | null;
          department_name: string | null;
          tasks_open: number;
          tasks_in_progress: number;
          tasks_blocked: number;
          tasks_overdue: number;
          tasks_due_next_7_days: number;
          minutes_this_week: number;
          absence_today: string | null;
          pending_absence_requests: number;
        }[];
      };
      list_work_people: {
        Args: { p_purpose?: string };
        Returns: { profile_id: string; full_name: string; job_title: string | null; department_name: string | null }[];
      };
      get_meeting_people: {
        Args: { p_meeting_id: string };
        Returns: { profile_id: string; full_name: string; job_title: string | null; is_organizer: boolean }[];
      };
      get_opportunity_people: {
        Args: { p_opportunity_id: string };
        Returns: { profile_id: string; full_name: string; job_title: string | null; is_owner: boolean }[];
      };
      approve_timesheets: {
        Args: { p_timesheet_ids: string[]; p_comment?: string | null };
        Returns: { timesheet_id: string; approved: boolean; message: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
