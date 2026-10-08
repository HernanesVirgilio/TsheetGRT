import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { Profile, TimesheetStatus, TimesheetSummary } from '../types';
import { isPresent, mapDepartment, mapTimesheetSummary, TIMESHEET_SUMMARY_SELECT } from './mappers';
import type { DepartmentRow, ProfileRow } from '../types/database';

/**
 * Dados do gestor. A equipa é sempre lida da vista my_team_members (manager_scope do
 * utilizador autenticado, com a RLS de profiles aplicada) e os timesheets são filtrados
 * pelos colaboradores dessa equipa no próprio pedido ao servidor.
 */

export interface ManagerScopeSummary {
  id: string;
  departmentName: string | null;
  employeeName: string | null;
}

export interface TeamTimesheetFilters {
  status: TimesheetStatus | null;
  employeeId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
}

const TEAM_MEMBER_SELECT = '*, department:departments(*)' as const;

function mapTeamMember(row: ProfileRow & { department: DepartmentRow | null }): Profile {
  const { department, ...profile } = row;
  return { ...profile, department: department ? mapDepartment(department) : null };
}

export async function listTeamMembers(): Promise<Profile[]> {
  const { data, error } = await supabase.from('my_team_members').select(TEAM_MEMBER_SELECT).order('full_name');
  if (error) throw toServiceError(error, 'Não foi possível carregar a sua equipa.');
  return data.map(mapTeamMember);
}

/** Devolve null se o colaborador não existir ou não pertencer ao âmbito do gestor. */
export async function getTeamMember(profileId: string): Promise<Profile | null> {
  const { data, error } = await supabase.from('my_team_members').select(TEAM_MEMBER_SELECT).eq('id', profileId).maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar o colaborador.');
  return data ? mapTeamMember(data) : null;
}

async function listTeamMemberIds(): Promise<string[]> {
  const { data, error } = await supabase.from('my_team_members').select('id');
  if (error) throw toServiceError(error, 'Não foi possível carregar a sua equipa.');
  return data.flatMap((member) => (member.id ? [member.id] : []));
}

export async function listTeamTimesheets(filters: TeamTimesheetFilters): Promise<TimesheetSummary[]> {
  const teamIds = await listTeamMemberIds();
  const employeeIds = filters.employeeId ? teamIds.filter((id) => id === filters.employeeId) : teamIds;
  if (employeeIds.length === 0) return [];

  let request = supabase
    .from('timesheets')
    .select(TIMESHEET_SUMMARY_SELECT)
    .in('employee_id', employeeIds)
    .order('period_start', { ascending: false })
    .order('submitted_at', { ascending: true });

  if (filters.status) request = request.eq('status', filters.status);
  if (filters.periodFrom) request = request.gte('period_start', filters.periodFrom);
  if (filters.periodTo) request = request.lte('period_end', filters.periodTo);

  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar os timesheets da equipa.');
  return data.map(mapTimesheetSummary).filter(isPresent);
}

/** Âmbito de gestão do próprio gestor (apenas leitura; atribuído pela administração). */
export async function listMyScopes(managerProfileId: string): Promise<ManagerScopeSummary[]> {
  const { data, error } = await supabase
    .from('manager_scopes')
    .select('id, department:departments(name), employee:profiles!manager_scopes_employee_id_fkey(full_name)')
    .eq('manager_id', managerProfileId);
  if (error) throw toServiceError(error, 'Não foi possível carregar o seu âmbito de gestão.');
  return data.map((scope) => ({
    id: scope.id,
    departmentName: scope.department?.name ?? null,
    employeeName: scope.employee?.full_name ?? null,
  }));
}
