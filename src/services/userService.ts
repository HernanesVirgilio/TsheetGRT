import { FunctionsHttpError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase/client';
import { ServiceError, toServiceError } from '../lib/errors';
import type { AuditEvent, Profile, RoleCode, TimesheetStatus } from '../types';
import { isTimesheetStatus } from '../types';
import { mapProfile, PROFILE_WITH_RELATIONS_SELECT } from './mappers';

export interface CreateUserInput {
  fullName: string;
  email: string;
  roleCode: RoleCode;
  departmentId: string;
  jobTitle: string | null;
  phone: string | null;
}

export interface UpdateUserInput {
  fullName: string;
  phone: string | null;
  departmentId: string;
  jobTitle: string | null;
}

export interface UserTimesheetSummary {
  id: string;
  periodStart: string;
  periodEnd: string;
  status: TimesheetStatus;
  submittedAt: string | null;
  entryCount: number;
  totalMinutes: number;
}

const USER_ACTIVITY_LIMIT = 15;

export async function listUsers(): Promise<Profile[]> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_WITH_RELATIONS_SELECT)
    .order('full_name');
  if (error) throw toServiceError(error, 'Não foi possível carregar os utilizadores.');
  return data.map(mapProfile);
}

export async function getUser(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select(PROFILE_WITH_RELATIONS_SELECT)
    .eq('id', userId)
    .maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar o utilizador.');
  return data ? mapProfile(data) : null;
}

async function readFunctionError(error: unknown): Promise<string | null> {
  if (!(error instanceof FunctionsHttpError)) return null;
  const response: unknown = error.context;
  if (!(response instanceof Response)) return null;
  try {
    const body: unknown = await response.json();
    if (typeof body === 'object' && body !== null && 'error' in body && typeof body.error === 'string') {
      return body.error;
    }
  } catch {
    return null;
  }
  return null;
}

/** Convida o utilizador por e-mail (Edge Function admin-create-user) e cria o perfil. */
export async function createUser(input: CreateUserInput): Promise<string> {
  const { data, error } = await supabase.functions.invoke<{ profileId: string }>('admin-create-user', {
    body: input,
  });

  if (error) {
    const serverMessage = await readFunctionError(error);
    throw new ServiceError(
      serverMessage ?? 'Não foi possível contactar o serviço de criação de utilizadores. Verifique se a Edge Function está publicada.'
    );
  }
  if (!data?.profileId) {
    throw new ServiceError('O serviço não confirmou a criação do utilizador.');
  }
  return data.profileId;
}

export async function updateUser(userId: string, input: UpdateUserInput): Promise<void> {
  const { error } = await supabase
    .from('profiles')
    .update({
      full_name: input.fullName,
      phone: input.phone,
      department_id: input.departmentId,
      job_title: input.jobTitle,
    })
    .eq('id', userId);
  if (error) throw toServiceError(error, 'Não foi possível guardar os dados do utilizador.');
}

export async function setUserActive(userId: string, isActive: boolean): Promise<void> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ is_active: isActive })
    .eq('id', userId)
    .select('id');
  if (error) throw toServiceError(error, 'Não foi possível alterar o estado do utilizador.');
  if (data.length === 0) throw new ServiceError('Não tem permissão para alterar o estado deste utilizador.');
}

export async function assignUserRole(userId: string, roleId: string): Promise<void> {
  const { error } = await supabase
    .from('user_roles')
    .upsert({ user_id: userId, role_id: roleId }, { onConflict: 'user_id' });
  if (error) throw toServiceError(error, 'Não foi possível alterar o perfil de acesso.');
}

export async function updateOwnPhone(profileId: string, phone: string | null): Promise<void> {
  const { error } = await supabase.from('profiles').update({ phone }).eq('id', profileId);
  if (error) throw toServiceError(error, 'Não foi possível atualizar o contacto.');
}

export async function listUserTimesheets(userId: string): Promise<UserTimesheetSummary[]> {
  const { data, error } = await supabase
    .from('timesheets')
    .select('id, period_start, period_end, status, submitted_at, entries:timesheet_entries(total_minutes)')
    .eq('employee_id', userId)
    .order('period_start', { ascending: false });
  if (error) throw toServiceError(error, 'Não foi possível carregar os timesheets do utilizador.');

  return data.flatMap((timesheet) =>
    isTimesheetStatus(timesheet.status)
      ? [
          {
            id: timesheet.id,
            periodStart: timesheet.period_start,
            periodEnd: timesheet.period_end,
            status: timesheet.status,
            submittedAt: timesheet.submitted_at,
            entryCount: timesheet.entries.length,
            totalMinutes: timesheet.entries.reduce((sum, entry) => sum + entry.total_minutes, 0),
          },
        ]
      : []
  );
}

/** Eventos de auditoria em que o utilizador é o ator ou a entidade afetada. */
export async function listUserActivity(userId: string): Promise<AuditEvent[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select('*')
    .or(`actor_user_id.eq.${userId},entity_id.eq.${userId}`)
    .order('created_at', { ascending: false })
    .limit(USER_ACTIVITY_LIMIT);
  if (error) throw toServiceError(error, 'Não foi possível carregar a atividade do utilizador.');
  return data;
}
