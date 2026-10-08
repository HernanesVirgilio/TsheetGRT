import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { AuditEvent } from '../types';
import { toIlikePattern } from '../utils/validation';

export interface AuditActor {
  id: string;
  full_name: string;
  email: string;
}

export type AuditEventWithActor = Omit<AuditEvent, 'actor'> & { actor: AuditActor | null };

export interface AuditQuery {
  page: number;
  pageSize: number;
  action: string;
  actor: string;
  /** Limita a um tipo de entidade (ex.: 'timesheets' na atividade da equipa). */
  entityType?: string;
}

export interface AuditPage {
  items: AuditEventWithActor[];
  total: number;
}

const AUDIT_SELECT = '*, actor:profiles(id, full_name, email)' as const;

async function findActorIds(search: string): Promise<string[]> {
  const pattern = toIlikePattern(search);
  const { data, error } = await supabase
    .from('profiles')
    .select('id')
    .or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
  if (error) throw toServiceError(error, 'Não foi possível pesquisar utilizadores.');
  return data.map((profile) => profile.id);
}

export async function listAuditEvents(query: AuditQuery): Promise<AuditPage> {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from('audit_events')
    .select(AUDIT_SELECT, { count: 'exact' })
    .order('created_at', { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.entityType) {
    request = request.eq('entity_type', query.entityType);
  }

  if (query.action.trim()) {
    request = request.ilike('action', toIlikePattern(query.action));
  }

  if (query.actor.trim()) {
    const actorIds = await findActorIds(query.actor);
    if (actorIds.length === 0) return { items: [], total: 0 };
    request = request.in('actor_user_id', actorIds);
  }

  const { data, error, count } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar o trilho de auditoria.');
  return { items: data, total: count ?? data.length };
}

export async function listRecentAuditEvents(limit: number): Promise<AuditEventWithActor[]> {
  const { data, error } = await supabase
    .from('audit_events')
    .select(AUDIT_SELECT)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toServiceError(error, 'Não foi possível carregar a auditoria recente.');
  return data;
}
