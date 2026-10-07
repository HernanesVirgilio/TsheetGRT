import {
  Profile,
  Department,
  Role,
  Activity,
  Timesheet,
  TimesheetEntry,
  TimesheetApproval,
  AuditEvent,
  NotificationItem,
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
  INITIAL_APPROVALS,
  INITIAL_NOTIFICATIONS,
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
  APPROVALS: 'sih_approvals',
  NOTIFICATIONS: 'sih_notifications',
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
let approvals: TimesheetApproval[] = loadOrSeed(STORAGE_KEYS.APPROVALS, INITIAL_APPROVALS);
let notifications: NotificationItem[] = loadOrSeed(STORAGE_KEYS.NOTIFICATIONS, INITIAL_NOTIFICATIONS);
let auditEvents: AuditEvent[] = loadOrSeed(STORAGE_KEYS.AUDIT_EVENTS, INITIAL_AUDIT_EVENTS);

// Audit helper
export function logAuditEvent(
  actorUserId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  description: string
): AuditEvent {
  const newEvent: AuditEvent = {
    id: `aud-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    actor_user_id: actorUserId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    description,
    ip_address: null,
    user_agent: navigator.userAgent || 'Mozilla/5.0 (Internal Browser)',
    created_at: new Date().toISOString(),
  };
  auditEvents = [newEvent, ...auditEvents];
  save(STORAGE_KEYS.AUDIT_EVENTS, auditEvents);
  return newEvent;
}

// Notification helper
export function createNotification(
  userId: string,
  type: string,
  title: string,
  message: string
): NotificationItem {
  const item: NotificationItem = {
    id: `notif-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
    user_id: userId,
    type,
    title,
    message,
    read_at: null,
    created_at: new Date().toISOString(),
  };
  notifications = [item, ...notifications];
  save(STORAGE_KEYS.NOTIFICATIONS, notifications);
  return item;
}

// Time calculation helper
export function calculateMinutesBetween(startTime: string, endTime: string, breakMinutes: number = 0): number {
  const [startHour, startMin] = startTime.split(':').map(Number);
  const [endHour, endMin] = endTime.split(':').map(Number);
  const startTotal = startHour * 60 + startMin;
  const endTotal = endHour * 60 + endMin;
  const diff = endTotal - startTotal - breakMinutes;
  return Math.max(0, diff);
}

export function formatMinutesToHours(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes.toString().padStart(2, '0')}m`;
}

// Main DataService
export const dataService = {
  // Profiles
  getProfiles(): Profile[] {
    return profiles.map((p) => ({
      ...p,
      department: departments.find((d) => d.id === p.department_id) || null,
      role: roles.find((r) => r.code === userRolesMap[p.id]) || roles[3],
    }));
  },

  getProfileById(id: string): Profile | null {
    const p = profiles.find((item) => item.id === id);
    if (!p) return null;
    return {
      ...p,
      department: departments.find((d) => d.id === p.department_id) || null,
      role: roles.find((r) => r.code === userRolesMap[p.id]) || roles[3],
    };
  },

  // Activities
  getActivities(): Activity[] {
    return activities;
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

  getTimesheetById(id: string, userProfile: Profile): Timesheet | null {
    const t = timesheets.find((item) => item.id === id);
    if (!t) return null;

    const roleCode = userRolesMap[userProfile.id] || 'EMPLOYEE';
    if (roleCode !== 'ADMIN' && t.employee_id !== userProfile.id) {
      if (roleCode === 'MANAGER') {
        const emp = profiles.find((p) => p.id === t.employee_id);
        if (emp?.department_id !== userProfile.department_id) {
          throw new Error('Não autorizado a aceder a este timesheet');
        }
      } else {
        throw new Error('Não autorizado a aceder a este timesheet');
      }
    }

    return this.hydrateTimesheet(t);
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

  createTimesheet(employeeId: string, periodStart: string, periodEnd: string): Timesheet {
    // Check if one already exists for this period
    const existing = timesheets.find(
      (t) => t.employee_id === employeeId && t.period_start === periodStart && t.period_end === periodEnd
    );
    if (existing) {
      return this.hydrateTimesheet(existing);
    }

    const newTs: Timesheet = {
      id: `ts-${Date.now()}`,
      employee_id: employeeId,
      period_start: periodStart,
      period_end: periodEnd,
      status: 'DRAFT',
      submitted_at: null,
      approved_at: null,
      approved_by: null,
      rejected_at: null,
      rejected_by: null,
      rejection_reason: null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    timesheets.push(newTs);
    save(STORAGE_KEYS.TIMESHEETS, timesheets);

    logAuditEvent(employeeId, 'timesheet.created', 'timesheets', newTs.id, `Novo período de timesheet criado: ${periodStart} a ${periodEnd}`);

    return this.hydrateTimesheet(newTs);
  },

  saveTimesheetEntry(entryData: {
    id?: string;
    timesheet_id: string;
    employee_id: string;
    work_date: string;
    activity_id: string;
    start_time: string;
    end_time: string;
    break_minutes: number;
    description: string;
  }): TimesheetEntry {
    const timesheet = timesheets.find((t) => t.id === entryData.timesheet_id);
    if (!timesheet) throw new Error('Timesheet não encontrado.');

    if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
      throw new Error('Não é possível alterar registos de um timesheet já submetido ou aprovado.');
    }

    // Validation
    if (entryData.end_time <= entryData.start_time) {
      throw new Error('A hora de fim tem de ser posterior à hora de início.');
    }
    if (entryData.break_minutes < 0) {
      throw new Error('A pausa não pode ser negativa.');
    }

    const totalMinutes = calculateMinutesBetween(entryData.start_time, entryData.end_time, entryData.break_minutes);
    if (totalMinutes <= 0) {
      throw new Error('O tempo efetivo de trabalho após a pausa tem de ser superior a zero.');
    }

    if (entryData.id) {
      // Update existing
      const index = timesheetEntries.findIndex((e) => e.id === entryData.id);
      if (index === -1) throw new Error('Registo não encontrado.');

      timesheetEntries[index] = {
        ...timesheetEntries[index],
        ...entryData,
        total_minutes: totalMinutes,
        updated_at: new Date().toISOString(),
      };
      save(STORAGE_KEYS.TIMESHEET_ENTRIES, timesheetEntries);

      // Update parent timesheet updated_at
      timesheet.updated_at = new Date().toISOString();
      save(STORAGE_KEYS.TIMESHEETS, timesheets);

      return timesheetEntries[index];
    } else {
      // Insert new
      const newEntry: TimesheetEntry = {
        id: `te-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        timesheet_id: entryData.timesheet_id,
        employee_id: entryData.employee_id,
        work_date: entryData.work_date,
        activity_id: entryData.activity_id,
        start_time: entryData.start_time,
        end_time: entryData.end_time,
        break_minutes: entryData.break_minutes,
        total_minutes: totalMinutes,
        description: entryData.description.trim(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      timesheetEntries.push(newEntry);
      save(STORAGE_KEYS.TIMESHEET_ENTRIES, timesheetEntries);

      timesheet.updated_at = new Date().toISOString();
      save(STORAGE_KEYS.TIMESHEETS, timesheets);

      return newEntry;
    }
  },

  deleteTimesheetEntry(entryId: string, employeeId: string): void {
    const entry = timesheetEntries.find((e) => e.id === entryId);
    if (!entry) return;

    const timesheet = timesheets.find((t) => t.id === entry.timesheet_id);
    if (!timesheet) return;

    if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
      throw new Error('Não é possível remover registos de um timesheet já submetido ou aprovado.');
    }

    if (timesheet.employee_id !== employeeId) {
      throw new Error('Não tem autorização para eliminar este registo.');
    }

    timesheetEntries = timesheetEntries.filter((e) => e.id !== entryId);
    save(STORAGE_KEYS.TIMESHEET_ENTRIES, timesheetEntries);

    timesheet.updated_at = new Date().toISOString();
    save(STORAGE_KEYS.TIMESHEETS, timesheets);
  },

  submitTimesheet(timesheetId: string, employeeId: string): Timesheet {
    const timesheet = timesheets.find((t) => t.id === timesheetId);
    if (!timesheet) throw new Error('Timesheet não encontrado.');

    if (timesheet.employee_id !== employeeId) {
      throw new Error('Apenas o próprio colaborador pode submeter o seu timesheet.');
    }

    if (timesheet.status !== 'DRAFT' && timesheet.status !== 'REJECTED') {
      throw new Error('Este timesheet já foi submetido ou já se encontra aprovado.');
    }

    const entries = timesheetEntries.filter((e) => e.timesheet_id === timesheetId);
    if (entries.length === 0) {
      throw new Error('Não é possível submeter um timesheet sem registos de horas.');
    }

    timesheet.status = 'SUBMITTED';
    timesheet.submitted_at = new Date().toISOString();
    timesheet.rejected_at = null;
    timesheet.rejection_reason = null;
    timesheet.updated_at = new Date().toISOString();
    save(STORAGE_KEYS.TIMESHEETS, timesheets);

    logAuditEvent(
      employeeId,
      'timesheet.submitted',
      'timesheets',
      timesheetId,
      `Timesheet do período ${timesheet.period_start} a ${timesheet.period_end} submetido para aprovação`
    );

    // Notify managers in the same department
    const employee = profiles.find((p) => p.id === employeeId);
    if (employee) {
      const managers = profiles.filter(
        (p) => userRolesMap[p.id] === 'MANAGER' && p.department_id === employee.department_id
      );
      managers.forEach((m) => {
        createNotification(
          m.id,
          'APPROVAL_REQUIRED',
          'Novo timesheet para aprovação',
          `${employee.full_name} submeteu o timesheet referente ao período ${timesheet.period_start} a ${timesheet.period_end}.`
        );
      });
    }

    return this.hydrateTimesheet(timesheet);
  },

  approveTimesheet(timesheetId: string, approverId: string, comment?: string): Timesheet {
    const timesheet = timesheets.find((t) => t.id === timesheetId);
    if (!timesheet) throw new Error('Timesheet não encontrado.');

    if (timesheet.status !== 'SUBMITTED') {
      throw new Error('Apenas timesheets com estado SUBMETIDO podem ser aprovados.');
    }

    // Manager cannot approve own timesheet
    if (timesheet.employee_id === approverId) {
      throw new Error('Um colaborador/gestor não pode aprovar a sua própria folha de horas.');
    }

    const approver = profiles.find((p) => p.id === approverId);
    const approverRole = userRolesMap[approverId];
    if (approverRole !== 'MANAGER' && approverRole !== 'ADMIN') {
      throw new Error('Não tem permissão para aprovar timesheets.');
    }

    timesheet.status = 'APPROVED';
    timesheet.approved_at = new Date().toISOString();
    timesheet.approved_by = approverId;
    timesheet.rejected_at = null;
    timesheet.rejection_reason = null;
    timesheet.updated_at = new Date().toISOString();
    save(STORAGE_KEYS.TIMESHEETS, timesheets);

    // Record approval log
    const approvalRecord: TimesheetApproval = {
      id: `app-${Date.now()}`,
      timesheet_id: timesheetId,
      approver_id: approverId,
      status: 'APPROVED',
      comment: comment || 'Aprovado sem observações adicionais.',
      created_at: new Date().toISOString(),
    };
    approvals.push(approvalRecord);
    save(STORAGE_KEYS.APPROVALS, approvals);

    logAuditEvent(
      approverId,
      'timesheet.approved',
      'timesheets',
      timesheetId,
      `Timesheet aprovado por ${approver?.full_name || 'Gestor'}`
    );

    // Notify employee
    createNotification(
      timesheet.employee_id,
      'TIMESHEET_APPROVED',
      'Timesheet aprovado',
      `O seu timesheet referente ao período ${timesheet.period_start} a ${timesheet.period_end} foi aprovado com sucesso.`
    );

    return this.hydrateTimesheet(timesheet);
  },

  rejectTimesheet(timesheetId: string, approverId: string, reason: string): Timesheet {
    if (!reason || !reason.trim()) {
      throw new Error('A rejeição de um timesheet exige obrigatoriamente um motivo justificado.');
    }

    const timesheet = timesheets.find((t) => t.id === timesheetId);
    if (!timesheet) throw new Error('Timesheet não encontrado.');

    if (timesheet.status !== 'SUBMITTED') {
      throw new Error('Apenas timesheets em estado SUBMETIDO podem ser rejeitados.');
    }

    const approverRole = userRolesMap[approverId];
    if (approverRole !== 'MANAGER' && approverRole !== 'ADMIN') {
      throw new Error('Não tem permissão para rejeitar timesheets.');
    }

    timesheet.status = 'REJECTED';
    timesheet.rejected_at = new Date().toISOString();
    timesheet.rejected_by = approverId;
    timesheet.rejection_reason = reason.trim();
    timesheet.approved_at = null;
    timesheet.approved_by = null;
    timesheet.updated_at = new Date().toISOString();
    save(STORAGE_KEYS.TIMESHEETS, timesheets);

    // Record approval log
    const approvalRecord: TimesheetApproval = {
      id: `app-${Date.now()}`,
      timesheet_id: timesheetId,
      approver_id: approverId,
      status: 'REJECTED',
      comment: reason.trim(),
      created_at: new Date().toISOString(),
    };
    approvals.push(approvalRecord);
    save(STORAGE_KEYS.APPROVALS, approvals);

    const approver = profiles.find((p) => p.id === approverId);
    logAuditEvent(
      approverId,
      'timesheet.rejected',
      'timesheets',
      timesheetId,
      `Timesheet rejeitado por ${approver?.full_name || 'Gestor'}. Motivo: ${reason}`
    );

    // Notify employee
    createNotification(
      timesheet.employee_id,
      'TIMESHEET_REJECTED',
      'Timesheet devolvido para correção',
      `O seu timesheet de ${timesheet.period_start} foi rejeitado: "${reason.trim()}". Proceda às correções necessárias.`
    );

    return this.hydrateTimesheet(timesheet);
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
