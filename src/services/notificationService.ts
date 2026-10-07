import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { NotificationItem } from '../types';

/** A RLS limita a leitura às notificações do próprio utilizador. */
export async function listNotifications(limit?: number): Promise<NotificationItem[]> {
  let request = supabase.from('notifications').select('*').order('created_at', { ascending: false });
  if (limit) request = request.limit(limit);
  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar as notificações.');
  return data;
}

export async function markNotificationAsRead(notificationId: string): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null);
  if (error) throw toServiceError(error, 'Não foi possível marcar a notificação como lida.');
}

export async function markAllNotificationsAsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null);
  if (error) throw toServiceError(error, 'Não foi possível marcar as notificações como lidas.');
}
