// Categorias das notificações (definidas no servidor a partir do tipo, ver private.notification_category).
import type { BadgeTone } from '../components/ui/badgeTones';

export const NOTIFICATION_CATEGORIES = ['INFO', 'COMPLETION', 'APPROVAL_REQUEST', 'DEADLINE', 'DECISION'] as const;
export type NotificationCategory = (typeof NOTIFICATION_CATEGORIES)[number];

export function isNotificationCategory(value: string): value is NotificationCategory {
  return (NOTIFICATION_CATEGORIES as readonly string[]).includes(value);
}

export const NOTIFICATION_CATEGORY_LABELS: Record<NotificationCategory, string> = {
  INFO: 'Informação',
  COMPLETION: 'Conclusão',
  APPROVAL_REQUEST: 'Pedido de aprovação',
  DEADLINE: 'Alerta de prazo',
  DECISION: 'Decisão tomada',
};

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
