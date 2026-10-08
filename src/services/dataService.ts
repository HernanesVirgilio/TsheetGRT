import {
  Profile,
  Department,
  Role,
  Activity,
  Timesheet,
  TimesheetEntry,
  AuditEvent,
  SystemHealthStatus,
} from '../types';
import {
  INITIAL_DEPARTMENTS,
  INITIAL_ROLES,
  INITIAL_PROFILES,
  INITIAL_USER_ROLE_MAP,
  INITIAL_ACTIVITIES,
  INITIAL_TIMESHEETS,
  INITIAL_TIMESHEET_ENTRIES,
  INITIAL_AUDIT_EVENTS,
} from '../lib/supabase/mockData';

// Storage keys for local persistence
const STORAGE_KEYS = {
  PROFILES: 'sih_profiles',
  USER_ROLES: 'sih_user_roles',
  DEPARTMENTS: 'sih_departments',
  ROLES: 'sih_roles',
  ACTIVITIES: 'sih_activities',
  TIMESHEETS: 'sih_timesheets',
  TIMESHEET_ENTRIES: 'sih_timesheet_entries',
  AUDIT_EVENTS: 'sih_audit_events',
};

// Helper to read from LocalStorage or seed safely in both browser and Node/CLI
function loadOrSeed<T>(key: string, seed: T): T {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      const raw = localStorage.getItem(key);
      if (raw) {
        return JSON.parse(raw);
      }
    }
  } catch (e) {
    console.error(`Error loading ${key} from storage:`, e);
  }
  save(key, seed);
  return seed;
}

function save<T>(key: string, data: T): void {
  try {
    if (typeof window !== 'undefined' && typeof localStorage !== 'undefined') {
      localStorage.setItem(key, JSON.stringify(data));
    }
  } catch (e) {
    console.error(`Error saving ${key} to storage:`, e);
  }
}

// In-memory / persisted state
let profiles: Profile[] = loadOrSeed(STORAGE_KEYS.PROFILES, INITIAL_PROFILES);
let userRolesMap: Record<string, string> = loadOrSeed(STORAGE_KEYS.USER_ROLES, INITIAL_USER_ROLE_MAP);
let departments: Department[] = loadOrSeed(STORAGE_KEYS.DEPARTMENTS, INITIAL_DEPARTMENTS);
let roles: Role[] = loadOrSeed(STORAGE_KEYS.ROLES, INITIAL_ROLES);
let activities: Activity[] = loadOrSeed(STORAGE_KEYS.ACTIVITIES, INITIAL_ACTIVITIES);
let timesheets: Timesheet[] = loadOrSeed(STORAGE_KEYS.TIMESHEETS, INITIAL_TIMESHEETS);
let timesheetEntries: TimesheetEntry[] = loadOrSeed(STORAGE_KEYS.TIMESHEET_ENTRIES, INITIAL_TIMESHEET_ENTRIES);
let auditEvents: AuditEvent[] = loadOrSeed(STORAGE_KEYS.AUDIT_EVENTS, INITIAL_AUDIT_EVENTS);

export function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
}

// Main DataService
export const dataService = {

  getProfileById(id: string): Profile | null {
    const p = profiles.find((item) => item.id === id);
    if (!p) return null;
    return {
      ...p,
      department: departments.find((d) => d.id === p.department_id) || null,
      role: roles.find((r) => r.code === userRolesMap[p.id]) || roles[3],
    };
  },

  // Timesheets
  getTimesheets(userProfile: Profile): Timesheet[] {
    const roleCode = userRolesMap[userProfile.id] || 'EMPLOYEE';

    // RLS Enforcement:
    // EMPLOYEE: only own timesheets
    // MANAGER: own + team members in same department or assigned
    // IT: own only
    // ADMIN: all timesheets
    let filtered: Timesheet[] = [];

    if (roleCode === 'ADMIN') {
      filtered = [...timesheets];
    } else if (roleCode === 'MANAGER') {
      // Find all employees in manager's department
      const departmentEmployeeIds = profiles
        .filter((p) => p.department_id === userProfile.department_id)
        .map((p) => p.id);
      filtered = timesheets.filter(
        (t) => t.employee_id === userProfile.id || departmentEmployeeIds.includes(t.employee_id)
      );
    } else {
      // EMPLOYEE or IT
      filtered = timesheets.filter((t) => t.employee_id === userProfile.id);
    }

    return filtered.map((t) => this.hydrateTimesheet(t));
  },

  hydrateTimesheet(t: Timesheet): Timesheet {
    const entries = timesheetEntries.filter((e) => e.timesheet_id === t.id);
    const totalMinutes = entries.reduce((acc, curr) => acc + curr.total_minutes, 0);

    return {
      ...t,
      employee: this.getProfileById(t.employee_id) || undefined,
      approver: t.approved_by ? this.getProfileById(t.approved_by) || undefined : undefined,
      entries: entries.map((e) => ({
        ...e,
        activity: activities.find((a) => a.id === e.activity_id),
      })),
      total_minutes: totalMinutes,
    };
  },

  // Audit
  getAuditEvents(page = 1, pageSize = 20, filterAction?: string, filterUser?: string): { items: AuditEvent[]; total: number } {
    let list = [...auditEvents];
    if (filterAction) {
      list = list.filter((e) => e.action.toLowerCase().includes(filterAction.toLowerCase()));
    }
    if (filterUser) {
      list = list.filter((e) => {
        const actor = profiles.find((p) => p.id === e.actor_user_id);
        return actor?.full_name.toLowerCase().includes(filterUser.toLowerCase()) ||
               actor?.email.toLowerCase().includes(filterUser.toLowerCase());
      });
    }

    const total = list.length;
    const startIndex = (page - 1) * pageSize;
    const paged = list.slice(startIndex, startIndex + pageSize).map((e) => ({
      ...e,
      actor: e.actor_user_id ? this.getProfileById(e.actor_user_id) : null,
    }));

    return { items: paged, total };
  },

  // System Health
  getSystemHealth(): SystemHealthStatus {
    const activeCount = profiles.filter((p) => p.is_active).length;
    const recentEvents = auditEvents.filter(
      (e) => Date.now() - new Date(e.created_at).getTime() < 86400000
    ).length;

    return {
      api: 'ONLINE',
      database: 'CONNECTED',
      authentication: 'OPERATIONAL',
      environment: 'Development',
      version: '0.1.0',
      lastCheck: new Date().toISOString(),
      activeUsersCount: activeCount,
      recentSecurityEventsCount: recentEvents,
    };
  },

};
