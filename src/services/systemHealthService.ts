import { supabase, supabaseProjectUrl, supabasePublishableApiKey } from '../lib/supabase/client';
import { describeSupabaseError } from '../lib/errors';

export type CheckStatus = 'ok' | 'error';

export interface HealthCheck {
  status: CheckStatus;
  latencyMs: number | null;
  message: string;
}

export interface SystemHealthReport {
  checkedAt: string;
  database: HealthCheck;
  authentication: HealthCheck;
  session: HealthCheck;
  activeUsers: number | null;
  auditEventsLast24h: number | null;
  loginsLast24h: number | null;
  projectHost: string;
  environment: string;
}

const DAY_IN_MS = 24 * 60 * 60 * 1000;

async function measure<T>(operation: () => PromiseLike<T>): Promise<{ result: T; latencyMs: number }> {
  const startedAt = performance.now();
  const result = await operation();
  return { result, latencyMs: Math.round(performance.now() - startedAt) };
}

async function checkDatabase(): Promise<HealthCheck> {
  try {
    const { result, latencyMs } = await measure(() =>
      supabase.from('departments').select('id', { count: 'exact', head: true })
    );
    if (result.error) {
      return {
        status: 'error',
        latencyMs,
        message: describeSupabaseError(result.error, `Erro ao consultar a base de dados: ${result.error.message}`),
      };
    }
    return { status: 'ok', latencyMs, message: 'Base de dados acessível e schema disponível.' };
  } catch {
    return { status: 'error', latencyMs: null, message: 'Não foi possível contactar a base de dados.' };
  }
}

async function checkAuthentication(): Promise<HealthCheck> {
  try {
    const { result: response, latencyMs } = await measure(() =>
      fetch(`${supabaseProjectUrl}/auth/v1/health`, { headers: { apikey: supabasePublishableApiKey } })
    );
    return response.ok
      ? { status: 'ok', latencyMs, message: 'Serviço de autenticação operacional.' }
      : { status: 'error', latencyMs, message: `O serviço de autenticação respondeu com o estado HTTP ${response.status}.` };
  } catch {
    return { status: 'error', latencyMs: null, message: 'Não foi possível contactar o serviço de autenticação.' };
  }
}

async function checkSession(): Promise<HealthCheck> {
  const { result, latencyMs } = await measure(() => supabase.auth.getUser());
  return result.error || !result.data.user
    ? { status: 'error', latencyMs, message: 'A sessão atual não foi validada pelo servidor.' }
    : { status: 'ok', latencyMs, message: 'Sessão atual validada pelo servidor.' };
}

async function countOrNull(query: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  const { count, error } = await query;
  return error ? null : count ?? 0;
}

export async function getSystemHealth(): Promise<SystemHealthReport> {
  const since = new Date(Date.now() - DAY_IN_MS).toISOString();

  const [database, authentication, session, activeUsers, auditEventsLast24h, loginsLast24h] = await Promise.all([
    checkDatabase(),
    checkAuthentication(),
    checkSession(),
    countOrNull(supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('is_active', true)),
    countOrNull(supabase.from('audit_events').select('id', { count: 'exact', head: true }).gte('created_at', since)),
    countOrNull(
      supabase
        .from('audit_events')
        .select('id', { count: 'exact', head: true })
        .eq('action', 'auth.login.success')
        .gte('created_at', since)
    ),
  ]);

  return {
    checkedAt: new Date().toISOString(),
    database,
    authentication,
    session,
    activeUsers,
    auditEventsLast24h,
    loginsLast24h,
    projectHost: new URL(supabaseProjectUrl).host,
    environment: import.meta.env.MODE,
  };
}
