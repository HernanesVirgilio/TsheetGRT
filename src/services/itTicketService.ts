import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type {
  ItDashboardSummary,
  ItTechnician,
  TicketCategory,
  TicketComment,
  TicketDetail,
  TicketEvent,
  TicketPriority,
  TicketStatus,
  TicketSummary,
} from '../types/it';
import { isTicketEventType, isTicketPriority, isTicketStatus } from '../types/it';
import { isPresent } from './mappers';
import { toIlikePattern } from '../utils/validation';

/**
 * Pedidos de suporte IT. Leitura sob RLS (o colaborador vê os próprios; o IT vê a fila);
 * todas as alterações passam pelas funções do servidor, que validam permissões e transições.
 */

const TICKET_SELECT =
  'id, reference, title, description, status, priority, category_id, requester_id, assigned_to, asset_id, due_at, status_changed_at, resolution_summary, resolved_at, closed_at, created_at, updated_at, category:it_ticket_categories(name), requester:profiles!it_tickets_requester_id_fkey(full_name), assignee:profiles!it_tickets_assigned_to_fkey(full_name), department:departments(name), asset:it_assets(asset_tag)' as const;

interface TicketRow {
  id: string;
  reference: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  category_id: string;
  requester_id: string;
  assigned_to: string | null;
  asset_id: string | null;
  due_at: string;
  status_changed_at: string;
  resolution_summary: string | null;
  resolved_at: string | null;
  closed_at: string | null;
  created_at: string;
  updated_at: string;
  category: { name: string } | null;
  requester: { full_name: string } | null;
  assignee: { full_name: string } | null;
  department: { name: string } | null;
  asset: { asset_tag: string } | null;
}

function mapTicket(row: TicketRow): TicketDetail | null {
  if (!isTicketStatus(row.status) || !isTicketPriority(row.priority)) return null;
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    description: row.description,
    status: row.status,
    priority: row.priority,
    categoryId: row.category_id,
    categoryName: row.category?.name ?? null,
    requesterId: row.requester_id,
    requesterName: row.requester?.full_name ?? null,
    departmentName: row.department?.name ?? null,
    assignedTo: row.assigned_to,
    assigneeName: row.assignee?.full_name ?? null,
    assetId: row.asset_id,
    assetTag: row.asset?.asset_tag ?? null,
    dueAt: row.due_at,
    statusChangedAt: row.status_changed_at,
    resolutionSummary: row.resolution_summary,
    resolvedAt: row.resolved_at,
    closedAt: row.closed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export type AssigneeFilter = { kind: 'any' } | { kind: 'unassigned' } | { kind: 'technician'; technicianId: string };

export interface TicketQuery {
  page: number;
  pageSize: number;
  search: string;
  statuses: TicketStatus[];
  priority: TicketPriority | null;
  categoryId: string | null;
  assignee: AssigneeFilter;
}

export interface TicketPage {
  items: TicketSummary[];
  total: number;
}

async function findRequesterIds(search: string): Promise<string[]> {
  const pattern = toIlikePattern(search);
  const { data, error } = await supabase.from('profiles').select('id').or(`full_name.ilike.${pattern},email.ilike.${pattern}`);
  if (error) throw toServiceError(error, 'Não foi possível pesquisar solicitantes.');
  return data.map((profile) => profile.id);
}

/** Fila do IT (paginada no servidor). Pesquisa por referência, título ou solicitante. */
export async function listTickets(query: TicketQuery): Promise<TicketPage> {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from('it_tickets')
    .select(TICKET_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, from + query.pageSize - 1);

  if (query.statuses.length > 0) request = request.in('status', query.statuses);
  if (query.priority) request = request.eq('priority', query.priority);
  if (query.categoryId) request = request.eq('category_id', query.categoryId);
  if (query.assignee.kind === 'unassigned') request = request.is('assigned_to', null);
  if (query.assignee.kind === 'technician') request = request.eq('assigned_to', query.assignee.technicianId);

  const search = query.search.trim();
  if (search) {
    const pattern = toIlikePattern(search);
    const requesterIds = await findRequesterIds(search);
    const requesterFilter = requesterIds.length > 0 ? `,requester_id.in.(${requesterIds.join(',')})` : '';
    request = request.or(`reference.ilike.${pattern},title.ilike.${pattern}${requesterFilter}`);
  }

  const { data, error, count } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar os pedidos de suporte.');
  return { items: data.map(mapTicket).filter(isPresent), total: count ?? data.length };
}

/** Pedidos do próprio utilizador (a RLS garante que só recebe os seus). */
export async function listMyTickets(requesterId: string): Promise<TicketSummary[]> {
  const { data, error } = await supabase
    .from('it_tickets')
    .select(TICKET_SELECT)
    .eq('requester_id', requesterId)
    .order('updated_at', { ascending: false });
  if (error) throw toServiceError(error, 'Não foi possível carregar os seus pedidos de suporte.');
  return data.map(mapTicket).filter(isPresent);
}

/** Pedidos ativos, para as listas de atenção do painel. */
export async function listActiveTickets(): Promise<TicketSummary[]> {
  const { data, error } = await supabase
    .from('it_tickets')
    .select(TICKET_SELECT)
    .in('status', ['OPEN', 'IN_PROGRESS', 'WAITING_USER'])
    .order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar os pedidos ativos.');
  return data.map(mapTicket).filter(isPresent);
}

export async function listAssetTickets(assetId: string): Promise<TicketSummary[]> {
  const { data, error } = await supabase
    .from('it_tickets')
    .select(TICKET_SELECT)
    .eq('asset_id', assetId)
    .order('created_at', { ascending: false });
  if (error) throw toServiceError(error, 'Não foi possível carregar os pedidos do equipamento.');
  return data.map(mapTicket).filter(isPresent);
}

/** Devolve null se o pedido não existir ou não for visível para quem consulta. */
export async function getTicket(ticketId: string): Promise<TicketDetail | null> {
  const { data, error } = await supabase.from('it_tickets').select(TICKET_SELECT).eq('id', ticketId).maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar o pedido de suporte.');
  return data ? mapTicket(data) : null;
}

export interface TicketTimeline {
  comments: TicketComment[];
  events: TicketEvent[];
}

/** Comentários e histórico visíveis (notas internas só chegam a quem tem acesso à fila do IT). */
export async function getTicketTimeline(ticketId: string): Promise<TicketTimeline> {
  const [commentsResult, eventsResult] = await Promise.all([
    supabase.from('it_ticket_comments').select('*').eq('ticket_id', ticketId).order('created_at'),
    supabase.from('it_ticket_events').select('*').eq('ticket_id', ticketId).order('created_at'),
  ]);
  if (commentsResult.error) throw toServiceError(commentsResult.error, 'Não foi possível carregar os comentários.');
  if (eventsResult.error) throw toServiceError(eventsResult.error, 'Não foi possível carregar o histórico.');

  return {
    comments: commentsResult.data.map((comment) => ({
      id: comment.id,
      authorId: comment.author_id,
      authorName: comment.author_name,
      body: comment.body,
      isInternal: comment.is_internal,
      createdAt: comment.created_at,
    })),
    events: eventsResult.data.flatMap((event) => {
      const eventType = event.event_type;
      if (!isTicketEventType(eventType)) return [];
      return [
        {
          id: event.id,
          actorId: event.actor_id,
          actorName: event.actor_name,
          eventType,
          oldValue: event.old_value,
          newValue: event.new_value,
          note: event.note,
          isInternal: event.is_internal,
          createdAt: event.created_at,
        },
      ];
    }),
  };
}

export interface RecentTicketEvent extends TicketEvent {
  ticketId: string;
  ticketReference: string | null;
}

export async function listRecentTicketEvents(limit: number): Promise<RecentTicketEvent[]> {
  const { data, error } = await supabase
    .from('it_ticket_events')
    .select('*, ticket:it_tickets(reference)')
    .neq('event_type', 'COMMENTED')
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw toServiceError(error, 'Não foi possível carregar a atividade recente.');
  return data.flatMap((event) => {
    const eventType = event.event_type;
    if (!isTicketEventType(eventType)) return [];
    return [
      {
        id: event.id,
        ticketId: event.ticket_id,
        ticketReference: event.ticket?.reference ?? null,
        actorId: event.actor_id,
        actorName: event.actor_name,
        eventType,
        oldValue: event.old_value,
        newValue: event.new_value,
        note: event.note,
        isInternal: event.is_internal,
        createdAt: event.created_at,
      },
    ];
  });
}

export async function listTicketCategories(): Promise<TicketCategory[]> {
  const { data, error } = await supabase
    .from('it_ticket_categories')
    .select('id, code, name')
    .eq('active', true)
    .order('sort_order');
  if (error) throw toServiceError(error, 'Não foi possível carregar as categorias.');
  return data;
}

/** Técnicos ativos (apenas nome, cargo e e-mail). */
export async function listTechnicians(): Promise<ItTechnician[]> {
  const { data, error } = await supabase.rpc('list_it_technicians');
  if (error) throw toServiceError(error, 'Não foi possível carregar os técnicos de IT.');
  return data.map((technician) => ({
    profileId: technician.profile_id,
    fullName: technician.full_name,
    jobTitle: technician.job_title,
    email: technician.email,
  }));
}

export async function getDashboardSummary(): Promise<ItDashboardSummary> {
  const { data, error } = await supabase.rpc('get_it_dashboard_summary');
  if (error) throw toServiceError(error, 'Não foi possível carregar os indicadores do IT.');
  const row = data[0];
  return {
    openCount: row?.open_count ?? 0,
    inProgressCount: row?.in_progress_count ?? 0,
    waitingUserCount: row?.waiting_user_count ?? 0,
    resolvedCount: row?.resolved_count ?? 0,
    criticalCount: row?.critical_count ?? 0,
    unassignedCount: row?.unassigned_count ?? 0,
    overdueCount: row?.overdue_count ?? 0,
    waitingTooLongCount: row?.waiting_too_long_count ?? 0,
    waitingAlertDays: row?.waiting_alert_days ?? 0,
  };
}

// ---------------------------------------------------------------------------- ações

export interface NewTicketInput {
  title: string;
  description: string;
  categoryId: string;
  priority: TicketPriority;
  assetId: string | null;
}

export async function createTicket(input: NewTicketInput): Promise<string> {
  const { data, error } = await supabase.rpc('create_it_ticket', {
    p_title: input.title,
    p_description: input.description,
    p_category_id: input.categoryId,
    p_priority: input.priority,
    p_asset_id: input.assetId,
  });
  if (error) throw toServiceError(error, 'Não foi possível abrir o pedido de suporte.');
  return data;
}

async function runTicketAction(action: PromiseLike<{ error: { message: string; code?: string } | null }>, fallback: string): Promise<void> {
  const { error } = await action;
  if (error) throw toServiceError(error, fallback);
}

export const takeTicket = (ticketId: string) =>
  runTicketAction(supabase.rpc('take_it_ticket', { p_ticket_id: ticketId }), 'Não foi possível assumir o pedido.');

export const assignTicket = (ticketId: string, technicianId: string) =>
  runTicketAction(
    supabase.rpc('assign_it_ticket', { p_ticket_id: ticketId, p_technician_id: technicianId }),
    'Não foi possível atribuir o pedido.'
  );

export const changeTicketStatus = (ticketId: string, status: 'IN_PROGRESS' | 'WAITING_USER', note: string | null) =>
  runTicketAction(
    supabase.rpc('change_it_ticket_status', { p_ticket_id: ticketId, p_status: status, p_note: note }),
    'Não foi possível alterar o estado do pedido.'
  );

export const updateTicketPriority = (ticketId: string, priority: TicketPriority, reason: string | null) =>
  runTicketAction(
    supabase.rpc('update_it_ticket_priority', { p_ticket_id: ticketId, p_priority: priority, p_reason: reason }),
    'Não foi possível alterar a prioridade.'
  );

export const updateTicketCategory = (ticketId: string, categoryId: string) =>
  runTicketAction(
    supabase.rpc('update_it_ticket_category', { p_ticket_id: ticketId, p_category_id: categoryId }),
    'Não foi possível alterar a categoria.'
  );

export const setTicketAsset = (ticketId: string, assetId: string | null) =>
  runTicketAction(
    supabase.rpc('set_it_ticket_asset', { p_ticket_id: ticketId, p_asset_id: assetId }),
    'Não foi possível associar o equipamento.'
  );

export const resolveTicket = (ticketId: string, resolution: string) =>
  runTicketAction(
    supabase.rpc('resolve_it_ticket', { p_ticket_id: ticketId, p_resolution: resolution }),
    'Não foi possível resolver o pedido.'
  );

export const closeTicket = (ticketId: string, note: string | null) =>
  runTicketAction(supabase.rpc('close_it_ticket', { p_ticket_id: ticketId, p_note: note }), 'Não foi possível fechar o pedido.');

export const reopenTicket = (ticketId: string, reason: string) =>
  runTicketAction(supabase.rpc('reopen_it_ticket', { p_ticket_id: ticketId, p_reason: reason }), 'Não foi possível reabrir o pedido.');

export const addTicketComment = (ticketId: string, body: string, isInternal: boolean) =>
  runTicketAction(
    supabase.rpc('add_it_ticket_comment', { p_ticket_id: ticketId, p_body: body, p_is_internal: isInternal }),
    'Não foi possível enviar o comentário.'
  );
