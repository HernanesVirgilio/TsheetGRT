import type { DepartmentRow, PermissionRow, ProfileRow, RoleRow } from '../types/database';
import type { Department, Permission, Profile, Role } from '../types';
import { isPermissionCode, isRoleCode } from '../types';

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
