import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { Profile } from '../types';
import type { AuditEventWithActor } from './auditService';
import { listRecentAuditEvents } from './auditService';
import { mapProfile, PROFILE_WITH_RELATIONS_SELECT } from './mappers';

export interface AdminOverview {
  totalUsers: number;
  activeUsers: number;
  /** Utilizadores ativos que ainda não aceitaram o convite / nunca iniciaram sessão. */
  usersNeverSignedIn: number;
  activeUsersWithoutDepartment: number;
  activeDepartments: number;
  submittedTimesheets: number;
  approvedTimesheets: number;
  rejectedTimesheets: number;
  recentUsers: Profile[];
  recentAuditEvents: AuditEventWithActor[];
}

const RECENT_ITEMS_LIMIT = 5;

interface CountResult {
  count: number | null;
  error: { message: string; code?: string } | null;
}

function readCount(result: CountResult): number {
  if (result.error) throw toServiceError(result.error, 'Não foi possível carregar os indicadores.');
  return result.count ?? 0;
}

function countTimesheetsByStatus(status: string) {
  return supabase.from('timesheets').select('id', { count: 'exact', head: true }).eq('status', status);
}

export async function getAdminOverview(): Promise<AdminOverview> {
  const [
    totalUsers,
    activeUsers,
    usersNeverSignedIn,
    activeUsersWithoutDepartment,
    activeDepartments,
    submittedTimesheets,
    approvedTimesheets,
    rejectedTimesheets,
    recentUsersResult,
    recentAuditEvents,
  ] = await Promise.all([
    supabase.from('profiles').select('id', { count: 'exact', head: true }),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).is('last_login_at', null),
    supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true).is('department_id', null),
    supabase.from('departments').select('id', { count: 'exact', head: true }).eq('active', true),
    countTimesheetsByStatus('SUBMITTED'),
    countTimesheetsByStatus('APPROVED'),
    countTimesheetsByStatus('REJECTED'),
    supabase
      .from('profiles')
      .select(PROFILE_WITH_RELATIONS_SELECT)
      .order('created_at', { ascending: false })
      .limit(RECENT_ITEMS_LIMIT),
    listRecentAuditEvents(RECENT_ITEMS_LIMIT),
  ]);

  if (recentUsersResult.error) {
    throw toServiceError(recentUsersResult.error, 'Não foi possível carregar os utilizadores recentes.');
  }

  return {
    totalUsers: readCount(totalUsers),
    activeUsers: readCount(activeUsers),
    usersNeverSignedIn: readCount(usersNeverSignedIn),
    activeUsersWithoutDepartment: readCount(activeUsersWithoutDepartment),
    activeDepartments: readCount(activeDepartments),
    submittedTimesheets: readCount(submittedTimesheets),
    approvedTimesheets: readCount(approvedTimesheets),
    rejectedTimesheets: readCount(rejectedTimesheets),
    recentUsers: recentUsersResult.data.map(mapProfile),
    recentAuditEvents,
  };
}
