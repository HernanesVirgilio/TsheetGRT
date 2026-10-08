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
        Insert: Omit<TimesheetEntryRow, 'id' | 'total_minutes' | 'created_at' | 'updated_at'> &
          Partial<TimesheetEntryRow>;
        Update: Partial<TimesheetEntryRow>;
        Relationships: [
          Relationship<'timesheet_entries_timesheet_id_fkey', 'timesheet_id', 'timesheets', false>,
          ProfileReference<'timesheet_entries', 'employee_id'>,
          Relationship<'timesheet_entries_activity_id_fkey', 'activity_id', 'activities', false>,
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
      approve_timesheets: {
        Args: { p_timesheet_ids: string[]; p_comment?: string | null };
        Returns: { timesheet_id: string; approved: boolean; message: string }[];
      };
    };
    Enums: { [_ in never]: never };
    CompositeTypes: { [_ in never]: never };
  };
};
