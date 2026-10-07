import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { Permission, PermissionCode, Role, RoleCode } from '../types';
import { isPresent, mapPermission, mapRole } from './mappers';

export interface RoleWithAccess extends Role {
  permissions: Permission[];
  user_count: number;
}

/** O perfil ADMIN mantém sempre todas as permissões (regra aplicada também no servidor). */
export const LOCKED_ROLE_CODE: RoleCode = 'ADMIN';

/** Permissão exclusiva do perfil ADMIN. */
export const ADMIN_ONLY_PERMISSION: PermissionCode = 'ADMIN_ACCESS';

export async function listRoles(): Promise<Role[]> {
  const { data, error } = await supabase.from('roles').select('*').order('name');
  if (error) throw toServiceError(error, 'Não foi possível carregar os perfis de acesso.');
  return data.map(mapRole).filter(isPresent);
}

export async function listPermissions(): Promise<Permission[]> {
  const { data, error } = await supabase.from('permissions').select('*').order('module').order('code');
  if (error) throw toServiceError(error, 'Não foi possível carregar as permissões.');
  return data.map(mapPermission).filter(isPresent);
}

export async function listRolesWithAccess(): Promise<RoleWithAccess[]> {
  const [rolesResult, assignmentsResult] = await Promise.all([
    supabase.from('roles').select('*, role_permissions(permission:permissions(*))').order('name'),
    supabase.from('user_roles').select('role_id'),
  ]);
  if (rolesResult.error) throw toServiceError(rolesResult.error, 'Não foi possível carregar os perfis de acesso.');
  if (assignmentsResult.error) {
    throw toServiceError(assignmentsResult.error, 'Não foi possível contar os utilizadores por perfil.');
  }

  const userCountByRole = new Map<string, number>();
  for (const assignment of assignmentsResult.data) {
    userCountByRole.set(assignment.role_id, (userCountByRole.get(assignment.role_id) ?? 0) + 1);
  }

  return rolesResult.data.flatMap(({ role_permissions: rolePermissions, ...roleRow }) => {
    const role = mapRole(roleRow);
    if (!role) return [];
    const permissions = rolePermissions
      .map((rolePermission) => (rolePermission.permission ? mapPermission(rolePermission.permission) : null))
      .filter(isPresent)
      .sort((first, second) => first.code.localeCompare(second.code));
    return [{ ...role, permissions, user_count: userCountByRole.get(role.id) ?? 0 }];
  });
}

export async function setRolePermissions(roleCode: RoleCode, permissionCodes: PermissionCode[]): Promise<void> {
  const { error } = await supabase.rpc('set_role_permissions', {
    p_role_code: roleCode,
    p_permission_codes: permissionCodes,
  });
  if (error) throw toServiceError(error, 'Não foi possível guardar as permissões.');
}
