export const ROLE_CODES = ['ADMIN', 'IT', 'MANAGER', 'EMPLOYEE'] as const;

export type RoleCode = (typeof ROLE_CODES)[number];

export function isRoleCode(value: string): value is RoleCode {
  return (ROLE_CODES as readonly string[]).includes(value);
}

// Espelha public.permissions (supabase/migrations/20261001000002_seed_data.sql).
export const PERMISSION_CODES = [
  'SELF_ACCESS',
  'SELF_PROFILE_READ',
  'SELF_PROFILE_UPDATE',
  'SELF_TIMESHEET_READ',
  'SELF_TIMESHEET_CREATE',
  'SELF_TIMESHEET_UPDATE',
  'SELF_TIMESHEET_SUBMIT',
  'TEAM_READ',
  'TEAM_TIMESHEET_READ',
  'TEAM_TIMESHEET_REVIEW',
  'TEAM_TIMESHEET_APPROVE',
  'TEAM_TIMESHEET_REJECT',
  'USERS_READ',
  'USERS_CREATE',
  'USERS_UPDATE',
  'USERS_DISABLE',
  'USERS_ASSIGN_ROLE',
  'ROLES_READ',
  'ROLES_MANAGE',
  'PERMISSIONS_READ',
  'PERMISSIONS_MANAGE',
  'DEPARTMENTS_READ',
  'DEPARTMENTS_MANAGE',
  'AUDIT_READ',
  'SYSTEM_HEALTH_READ',
  'SYSTEM_SETTINGS_READ',
  'SYSTEM_SETTINGS_MANAGE',
  'REPORTS_READ',
  'REPORTS_EXPORT',
  'ADMIN_ACCESS',
  'IT_TICKET_CREATE',
  'IT_TICKETS_READ',
  'IT_TICKETS_MANAGE',
  'IT_TICKETS_ASSIGN',
  'IT_ASSETS_READ',
  'IT_ASSETS_MANAGE',
  'TIMESHEET_TASK_READ',
  'TIMESHEET_TASK_UPDATE',
  'TIMESHEET_TASK_CREATE',
  'TIMESHEET_TASK_ASSIGN',
  'TIMESHEET_TASK_REOPEN',
  'TIMESHEET_CALENDAR_READ',
  'TIMESHEET_CALENDAR_MANAGE',
  'TIMESHEET_MEETING_READ',
  'TIMESHEET_MEETING_CREATE',
  'TIMESHEET_ABSENCE_CREATE',
  'TIMESHEET_ABSENCE_READ',
  'TIMESHEET_ABSENCE_APPROVE',
  'TIMESHEET_OPPORTUNITY_READ',
  'TIMESHEET_OPPORTUNITY_UPDATE',
  'TIMESHEET_OPPORTUNITY_CREATE',
  'TIMESHEET_OPPORTUNITY_MANAGE',
  'TIMESHEET_ATTACHMENT_CREATE',
  'TIMESHEET_ATTACHMENT_DELETE',
] as const;

export type PermissionCode = (typeof PERMISSION_CODES)[number];

export function isPermissionCode(value: string): value is PermissionCode {
  return (PERMISSION_CODES as readonly string[]).includes(value);
}

export const TIMESHEET_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'LOCKED'] as const;

export type TimesheetStatus = (typeof TIMESHEET_STATUSES)[number];

export function isTimesheetStatus(value: string): value is TimesheetStatus {
  return (TIMESHEET_STATUSES as readonly string[]).includes(value);
}

export type ApprovalStatus = 'PENDING' | 'APPROVED' | 'REJECTED';

export type TaskStatus = 'TODO' | 'IN_PROGRESS' | 'DONE' | 'CANCELLED';

export type TaskPriority = 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT';

export type AccountStatus = 'ACTIVE' | 'INACTIVE' | 'BLOCKED';

export interface Department {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  auth_user_id: string | null;
  employee_number: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  department_id: string | null;
  job_title: string | null;
  avatar_url: string | null;
  is_active: boolean;
  must_change_password: boolean;
  created_at: string;
  updated_at: string;
  last_login_at?: string | null;
  // joined fields
  department?: Department | null;
  role?: Role | null;
}

export interface Role {
  id: string;
  code: RoleCode;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
  permissions?: Permission[];
  user_count?: number;
}

export interface Permission {
  id: string;
  code: PermissionCode;
  name: string;
  description: string;
  module: string;
  created_at: string;
  updated_at: string;
}

export interface RolePermission {
  id: string;
  role_id: string;
  permission_id: string;
  created_at: string;
}

export interface UserRole {
  id: string;
  user_id: string;
  role_id: string;
  created_at: string;
}

export interface Activity {
  id: string;
  code: string;
  name: string;
  description: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface Timesheet {
  id: string;
  employee_id: string;
  period_start: string; // YYYY-MM-DD
  period_end: string;   // YYYY-MM-DD
  status: TimesheetStatus;
  submitted_at: string | null;
  approved_at: string | null;
  approved_by: string | null;
  rejected_at: string | null;
  rejected_by: string | null;
  rejection_reason: string | null;
  created_at: string;
  updated_at: string;
  // joined
  employee?: Profile;
  approver?: Profile;
  entries?: TimesheetEntry[];
  total_minutes?: number;
  approval_history?: TimesheetApproval[];
}

export interface Task {
  id: string;
  title: string;
  description: string;
  assigned_to: string;
  created_by: string;
  status: TaskStatus;
  priority: TaskPriority;
  due_date: string; // YYYY-MM-DD
  created_at: string;
  updated_at: string;
  // joined
  assignee?: Profile;
  creator?: Profile;
}

export interface TimesheetEntry {
  id: string;
  timesheet_id: string;
  employee_id: string;
  work_date: string; // YYYY-MM-DD
  activity_id: string;
  start_time: string; // HH:mm
  end_time: string;   // HH:mm
  break_minutes: number;
  total_minutes: number;
  description: string;
  created_at: string;
  updated_at: string;
  // joined
  activity?: Activity;
}

export interface TimesheetApproval {
  id: string;
  timesheet_id: string;
  approver_id: string;
  status: ApprovalStatus;
  comment: string | null;
  created_at: string;
  // joined
  approver?: Profile;
}

export interface AuditEvent {
  id: string;
  actor_user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  description: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
  // joined
  actor?: Profile | null;
}

export interface NotificationItem {
  id: string;
  user_id: string;
  type: string;
  title: string;
  message: string;
  read_at: string | null;
  created_at: string;
}

export interface SystemSetting {
  id: string;
  key: string;
  value: string;
  description: string;
  updated_at: string;
}

export interface SystemHealthStatus {
  api: 'ONLINE' | 'DEGRADED' | 'OFFLINE';
  database: 'CONNECTED' | 'DISCONNECTED';
  authentication: 'OPERATIONAL' | 'DEGRADED';
  environment: string;
  version: string;
  lastCheck: string;
  activeUsersCount: number;
  recentSecurityEventsCount: number;
}

/** Resumo de um timesheet com colaborador e horas agregadas (listas, relatórios, aprovações). */
export interface TimesheetSummary {
  id: string;
  employeeId: string;
  employeeName: string;
  employeeNumber: string | null;
  departmentId: string | null;
  departmentName: string | null;
  periodStart: string;
  periodEnd: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  approvedAt: string | null;
  rejectedAt: string | null;
  rejectionReason: string | null;
  entryCount: number;
  totalMinutes: number;
}
