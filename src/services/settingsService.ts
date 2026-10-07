import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { SystemSetting } from '../types';

export async function listSystemSettings(): Promise<SystemSetting[]> {
  const { data, error } = await supabase.from('system_settings').select('*').order('key');
  if (error) throw toServiceError(error, 'Não foi possível carregar as configurações.');
  return data;
}

/** Guarda as definições alteradas numa única transação (validadas também no servidor). */
export async function updateSystemSettings(changes: Record<string, string>): Promise<void> {
  if (Object.keys(changes).length === 0) return;
  const { error } = await supabase.rpc('update_system_settings', { p_settings: changes });
  if (error) throw toServiceError(error, 'Não foi possível guardar as configurações.');
}
