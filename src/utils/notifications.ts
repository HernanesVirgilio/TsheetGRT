// Categorias das notificações (definidas no servidor a partir do tipo, ver private.notification_category).
import type { BadgeTone } from '../components/ui/badgeTones';
import type { NotificationItem } from '../types';
import { translated } from '../lib/i18n';

export const NOTIFICATION_CATEGORIES = ['INFO', 'COMPLETION', 'APPROVAL_REQUEST', 'DEADLINE', 'DECISION'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = translated({
  INFO: 'Informação',
  COMPLETION: 'Conclusão',
  APPROVAL_REQUEST: 'Pedido de aprovação',
  DEADLINE: 'Alerta de prazo',
  DECISION: 'Decisão tomada',
});

export const NOTIFICATION_CATEGORY_TONES: Record<NotificationCategory, BadgeTone> = {
  INFO: 'neutral',
  COMPLETION: 'success',
  APPROVAL_REQUEST: 'warning',
  DEADLINE: 'danger',
  DECISION: 'info',
};

/** Só se navega para caminhos internos da aplicação (nunca para URLs externos). */
export function safeNotificationLink(link: string | null): string | null {
  if (!link || !link.startsWith('/') || link.startsWith('//')) return null;
  return /^\/[A-Za-z0-9/_?=&.-]*$/.test(link) ? link : null;
}

/**
 * Tipos do suporte IT enviados apenas a quem abriu o pedido. Os restantes podem ir para a equipa de IT;
 * quem não tem acesso à fila do IT acaba sempre nos seus pedidos de suporte.
 */
const IT_REQUESTER_TYPES: readonly string[] = ['IT_TICKET_UPDATED', 'IT_TICKET_WAITING_USER', 'IT_TICKET_RESOLVED'];

/**
 * Páginas de lista para os tipos que o servidor regista sem ligação (timesheets, suporte IT e
 * notificações anteriores aos módulos com ligação). Por ordem de preferência.
 */
function fallbackPaths(type: string): string[] {
  if (type === 'APPROVAL_REQUIRED') return ['/approvals'];
  if (type.startsWith('TIMESHEET_')) return ['/timesheets'];
  if (type.startsWith('IT_TICKET_')) return IT_REQUESTER_TYPES.includes(type) ? ['/support', '/it/tickets'] : ['/it/tickets', '/support'];
  if (type.startsWith('TASK_') || type.startsWith('TEAM_TASK_')) return ['/timesheet/tasks'];
  if (type.startsWith('MEETING_')) return ['/timesheet/meetings'];
  if (type.startsWith('ABSENCE_')) return ['/timesheet/absences'];
  if (type.startsWith('OPPORTUNITY_')) return ['/timesheet/opportunities'];
  return [];
}

/**
 * Destino ao abrir a notificação: a ligação registada pelo servidor ou, sem ela, a lista do módulo.
 * Devolve `null` quando não há destino ou o utilizador não o pode abrir, para não o levar a um ecrã sem acesso.
 */
export function resolveNotificationTarget(
  notification: Pick<NotificationItem, 'type' | 'link'>,
  canAccess: (path: string) => boolean
): string | null {
  const link = safeNotificationLink(notification.link);
  const candidates = link ? [link] : fallbackPaths(notification.type);
  return candidates.find(canAccess) ?? null;
}
