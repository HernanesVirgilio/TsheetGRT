import type { WorkEvent } from '../../types/work';

/** Colunas comuns dos históricos append-only (task_events, meeting_events, absence_events, opportunity_events). */
export const WORK_EVENT_COLUMNS = 'id, actor_name, event_type, field, old_value, new_value, note, created_at' as const;

interface WorkEventRow {
  id: string;
  actor_name: string | null;
  event_type: string;
  field: string | null;
  old_value: string | null;
  new_value: string | null;
  note: string | null;
  created_at: string;
  after_closure?: boolean;
}

export function mapWorkEvent(row: WorkEventRow): WorkEvent {
  return {
    id: row.id,
    actorName: row.actor_name,
    eventType: row.event_type,
    field: row.field,
    oldValue: row.old_value,
    newValue: row.new_value,
    note: row.note,
    afterClosure: row.after_closure ?? false,
    createdAt: row.created_at,
  };
}
