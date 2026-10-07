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

// Os links de convite e de recuperação chegam com "#...&type=invite|recovery".
// O SDK consome e limpa o fragmento ao iniciar, por isso o tipo é lido antes de criar o cliente.
function readAuthRedirectType(): AuthRedirectType | null {
  if (typeof window === 'undefined') return null;
  const type = new URLSearchParams(window.location.hash.slice(1)).get('type');
  return type === 'invite' || type === 'recovery' ? type : null;
}

export const initialAuthRedirectType = readAuthRedirectType();

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
