import type { DepartmentRow, PermissionRow, ProfileRow, RoleRow } from '../types/database';
import type { Department, Permission, Profile, Role, TimesheetSummary } from '../types';
import { isPermissionCode, isRoleCode, isTimesheetStatus } from '../types';

/** Seleção usada sempre que um perfil é lido com departamento e perfil de acesso. */
export const PROFILE_WITH_RELATIONS_SELECT =
  '*, department:departments(*), user_role:user_roles(role:roles(*))' as const;

export type ProfileWithRelationsRow = ProfileRow & {
  department: DepartmentRow | null;
  user_role: { role: RoleRow | null } | null;
};

export function mapDepartment(row: DepartmentRow): Department {
  return { ...row };
}

export function mapRole(row: RoleRow): Role | null {
  if (!isRoleCode(row.code)) return null;
  return { ...row, code: row.code };
}

export function mapPermission(row: PermissionRow): Permission | null {
  if (!isPermissionCode(row.code)) return null;
  return { ...row, code: row.code };
}

export function mapProfile(row: ProfileWithRelationsRow): Profile {
  const { department, user_role: userRole, ...profile } = row;
  return {
    ...profile,
    department: department ? mapDepartment(department) : null,
    role: userRole?.role ? mapRole(userRole.role) : null,
  };
}

export function isPresent<T>(value: T | null | undefined): value is T {
  return value !== null && value !== undefined;
}

/** Seleção comum para resumos de timesheets (literal único: o supabase-js infere o tipo a partir dela). */
export const TIMESHEET_SUMMARY_SELECT =
  'id, employee_id, period_start, period_end, status, submitted_at, approved_at, rejected_at, rejection_reason, employee:profiles!timesheets_employee_id_fkey(full_name, employee_number, department:departments(id, name)), entries:timesheet_entries(total_minutes)' as const;

export interface TimesheetSummaryRow {
  id: string;
  employee_id: string;
  period_start: string;
  period_end: string;
  status: string;
  submitted_at: string | null;
  approved_at: string | null;
  rejected_at: string | null;
  rejection_reason: string | null;
  employee: { full_name: string; employee_number: string; department: { id: string; name: string } | null } | null;
  entries: { total_minutes: number }[];
}

/** Devolve null para estados desconhecidos (nunca inventa um estado). */
export function mapTimesheetSummary(row: TimesheetSummaryRow): TimesheetSummary | null {
  if (!isTimesheetStatus(row.status)) return null;
  return {
    id: row.id,
    employeeId: row.employee_id,
    employeeName: row.employee?.full_name ?? 'Colaborador sem acesso visível',
    employeeNumber: row.employee?.employee_number ?? null,
    departmentId: row.employee?.department?.id ?? null,
    departmentName: row.employee?.department?.name ?? null,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    status: row.status,
    submittedAt: row.submitted_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    rejectionReason: row.rejection_reason,
    entryCount: row.entries.length,
    totalMinutes: row.entries.reduce((total, entry) => total + entry.total_minutes, 0),
  };
}
