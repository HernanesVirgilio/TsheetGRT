import { createClient } from '@supabase/supabase-js';
import type { Database } from '../../types/database';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim() ?? '';
const supabasePublishableKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim() ?? '';

/** Mensagem a apresentar quando o ambiente não está configurado (ver .env.example). */
export const supabaseConfigError: string | null =
  supabaseUrl && supabasePublishableKey
    ? null
    : 'As variáveis VITE_SUPABASE_URL e VITE_SUPABASE_PUBLISHABLE_KEY não estão definidas. Crie o ficheiro .env a partir de .env.example.';

export const supabaseProjectUrl = supabaseUrl;
export const supabasePublishableApiKey = supabasePublishableKey;

export type AuthRedirectType = 'invite' | 'recovery';

/** Link de convite ou de recuperação com que a aplicação foi aberta. */
export interface AuthRedirect {
  type: AuthRedirectType | null;
  /** Código devolvido pelo Supabase quando o link é inválido (ex.: "otp_expired"). */
  errorCode: string | null;
}

// Os links chegam com "#...&type=invite|recovery" ou, quando falham, com "#error=...&error_code=...".
// O SDK consome e limpa o fragmento ao iniciar, por isso é lido antes de criar o cliente.
function readAuthRedirect(): AuthRedirect | null {
  if (typeof window === 'undefined') return null;
  const params = new URLSearchParams(window.location.hash.slice(1));
  const rawType = params.get('type');
  const type = rawType === 'invite' || rawType === 'recovery' ? rawType : null;
  const errorCode = params.get('error_code') ?? params.get('error');
  return type || errorCode ? { type, errorCode } : null;
}

/**
 * Link com que esta página foi carregada. Fica em memória (e não no estado da navegação) porque o SDK
 * limpa o fragmento com `location.hash = ''`, o que gera um popstate que apagaria esse estado.
 */
export const initialAuthRedirect = readAuthRedirect();

let isAuthRedirectPending = initialAuthRedirect !== null;

/**
 * Indica uma única vez que a página foi aberta por um link de autenticação. Depois de encaminhado para
 * /reset-password, a navegação seguinte (ex.: para o dashboard) já não pode ser desviada outra vez.
 */
export function consumeAuthRedirect(): boolean {
  const wasPending = isAuthRedirectPending;
  isAuthRedirectPending = false;
  return wasPending;
}

// Quando a configuração falta, a aplicação mostra o erro em vez de montar as rotas,
// por isso este cliente nunca chega a ser usado com valores vazios.
export const supabase = createClient<Database>(
  supabaseUrl || 'http://localhost',
  supabasePublishableKey || 'missing-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  }
);
