import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Read public environment variables safely
export const SUPABASE_URL =
  import.meta.env.VITE_SUPABASE_URL ||
  'https://iahgopefwixbprfzcwbd.supabase.co';

export const SUPABASE_ANON_KEY =
  import.meta.env.VITE_SUPABASE_ANON_KEY ||
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  'sb_publishable_6cX3j02MOIURRS4xEVf3ww_74CjQUCs';

export const isConfiguredWithRealSupabase = Boolean(
  SUPABASE_URL &&
  SUPABASE_ANON_KEY &&
  SUPABASE_URL !== 'https://your-project.supabase.co' &&
  !SUPABASE_URL.includes('example')
);

// Centralized Supabase Client instance (only created if valid configuration exists)
export const supabase: SupabaseClient | null = isConfiguredWithRealSupabase
  ? createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
      },
    })
  : null;

export interface SupabaseHealthCheckResult {
  connected: boolean;
  url: string;
  hasTables: boolean;
  status: 'ONLINE_ACTIVE' | 'ONLINE_TABLES_MISSING' | 'OFFLINE_ERROR' | 'NOT_CONFIGURED';
  message: string;
  timestamp: string;
  latencyMs?: number;
}

/**
 * Perform a live check against the Supabase endpoint
 */
export async function checkSupabaseHealth(): Promise<SupabaseHealthCheckResult> {
  const timestamp = new Date().toISOString();
  if (!supabase || !isConfiguredWithRealSupabase) {
    return {
      connected: false,
      url: SUPABASE_URL || 'Não configurado',
      hasTables: false,
      status: 'NOT_CONFIGURED',
      message: 'Cliente Supabase não inicializado ou chaves em falta.',
      timestamp,
    };
  }

  const startTime = performance.now();
  try {
    const { error } = await supabase
      .from('departments')
      .select('count', { count: 'exact', head: true });
    
    const latencyMs = Math.round(performance.now() - startTime);

    if (error) {
      if (error.code === 'PGRST205' || error.message?.includes('schema cache')) {
        return {
          connected: true,
          url: SUPABASE_URL,
          hasTables: false,
          status: 'ONLINE_TABLES_MISSING',
          message: 'Instância Supabase online e acessível, mas as tabelas ainda não foram criadas no PostgreSQL.',
          timestamp,
          latencyMs,
        };
      }

      return {
        connected: false,
        url: SUPABASE_URL,
        hasTables: false,
        status: 'OFFLINE_ERROR',
        message: `Falha ao consultar tabelas do Supabase: ${error.message} (${error.code || 'sem código'})`,
        timestamp,
        latencyMs,
      };
    }

    return {
      connected: true,
      url: SUPABASE_URL,
      hasTables: true,
      status: 'ONLINE_ACTIVE',
      message: 'Instância Supabase operacional e tabelas sincronizadas.',
      timestamp,
      latencyMs,
    };
  } catch (err: any) {
    const latencyMs = Math.round(performance.now() - startTime);
    return {
      connected: false,
      url: SUPABASE_URL,
      hasTables: false,
      status: 'OFFLINE_ERROR',
      message: err.message || 'Erro de rede ao conectar à instância Supabase.',
      timestamp,
      latencyMs,
    };
  }
}
