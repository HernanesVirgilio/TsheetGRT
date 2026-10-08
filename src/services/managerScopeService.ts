import { supabase } from '../lib/supabase/client';
import { ServiceError, toServiceError } from '../lib/errors';

/** Gestão dos âmbitos de gestão pela administração (USERS_UPDATE; validado e auditado no servidor). */

export interface ManagerScope {
  id: string;
  departmentId: string | null;
  departmentName: string | null;
  employeeId: string | null;
  employeeName: string | null;
  createdAt: string;
}

export type ScopeTarget = { kind: 'department'; departmentId: string } | { kind: 'employee'; employeeId: string };

export async function listManagerScopes(managerProfileId: string): Promise<ManagerScope[]> {
  const { data, error } = await supabase
    .from('manager_scopes')
    .select('id, department_id, employee_id, created_at, department:departments(name), employee:profiles!manager_scopes_employee_id_fkey(full_name)')
    .eq('manager_id', managerProfileId)
    .order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar o âmbito de gestão.');
  return data.map((scope) => ({
    id: scope.id,
    departmentId: scope.department_id,
    departmentName: scope.department?.name ?? null,
    employeeId: scope.employee_id,
    employeeName: scope.employee?.full_name ?? null,
    createdAt: scope.created_at,
  }));
}

export async function addManagerScope(managerProfileId: string, target: ScopeTarget): Promise<void> {
  const { error } = await supabase.from('manager_scopes').insert(
    target.kind === 'department'
      ? { manager_id: managerProfileId, department_id: target.departmentId }
      : { manager_id: managerProfileId, employee_id: target.employeeId }
  );
  if (error) {
    if (error.code === '23505') throw new ServiceError('Este âmbito já está atribuído ao gestor.', error.code);
    throw toServiceError(error, 'Não foi possível atribuir o âmbito.');
  }
}

export async function removeManagerScope(scopeId: string): Promise<void> {
  const { data, error } = await supabase.from('manager_scopes').delete().eq('id', scopeId).select('id');
  if (error) throw toServiceError(error, 'Não foi possível remover o âmbito.');
  if (data.length === 0) throw new ServiceError('Não tem permissão para remover este âmbito.');
}
