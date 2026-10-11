import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { NotificationItem } from '../types';
import { t } from '../lib/i18n';

/** A RLS limita a leitura às notificações do próprio utilizador. */
export async function listNotifications(limit?: number): Promise<NotificationItem[]> {
  let request = supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (limit) request = request.limit(limit);
  const { data, error } = await request;
  if (error) throw toServiceError(error, t('Não foi possível carregar as notificações.'));
  return data;
}

/** Total de notificações por ler (não limitado às que estão carregadas na lista). */
export async function countUnreadNotifications(): Promise<number> {
  const { count, error } = await supabase
    .from('notifications')
    .select('id', { count: 'exact', head: true })
    .is('read_at', null);
  if (error) throw toServiceError(error, t('Não foi possível contar as notificações por ler.'));
  return count ?? 0;
}

/**
 * Gera, no servidor, os alertas de prazo de quem está autenticado (prazos nas próximas 24 h, tarefas em
 * atraso e, para o gestor da equipa, atrasos da equipa). Não há duplicados: pode ser chamado sempre que
 * as notificações são carregadas. Uma falha não impede a leitura das notificações.
 */
export async function refreshDeadlineAlerts(): Promise<void> {
  const { error } = await supabase.rpc('refresh_deadline_alerts');
  if (error) throw toServiceError(error, t('Não foi possível atualizar os alertas de prazo.'));
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);
  if (error) throw toServiceError(error, t('Não foi possível marcar a notificação como lida.'));
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw toServiceError(error, t('Não foi possível marcar as notificações como lidas.'));
}
