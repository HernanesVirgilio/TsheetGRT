import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { Department } from '../types';
import { mapDepartment } from './mappers';

export interface DepartmentInput {
  code: string;
  name: string;
  description: string;
}

export async function listDepartments(): Promise<Department[]> {
  const { data, error } = await supabase.from('departments').select('*').order('name');
  if (error) throw toServiceError(error, 'Não foi possível carregar os departamentos.');
  return data.map(mapDepartment);
}

export async function createDepartment(input: DepartmentInput): Promise<void> {
  const { error } = await supabase.from('departments').insert({
    code: input.code,
    name: input.name,
    description: input.description,
  });
  if (error) throw toServiceError(error, 'Não foi possível criar o departamento.');
}

/** O código não é editável (o servidor também o impede). */
export async function updateDepartment(departmentId: string, input: Omit<DepartmentInput, 'code'>): Promise<void> {
  const { error } = await supabase
    .from('departments')
    .update({ name: input.name, description: input.description })
    .eq('id', departmentId);
  if (error) throw toServiceError(error, 'Não foi possível guardar o departamento.');
}

export async function setDepartmentActive(departmentId: string, active: boolean): Promise<void> {
  const { error } = await supabase.from('departments').update({ active }).eq('id', departmentId);
  if (error) throw toServiceError(error, 'Não foi possível alterar o estado do departamento.');
}

/** Número de utilizadores ativos por departamento (para avisar antes de desativar). */
export async function countActiveUsersByDepartment(): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('profiles').select('department_id').eq('is_active', true);
  if (error) throw toServiceError(error, 'Não foi possível contar os utilizadores por departamento.');

  const counts = new Map<string, number>();
  for (const profile of data) {
    if (profile.department_id) {
      counts.set(profile.department_id, (counts.get(profile.department_id) ?? 0) + 1);
    }
  }
  return counts;
}
