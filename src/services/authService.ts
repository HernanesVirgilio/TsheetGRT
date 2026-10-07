import type { AuthError } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase/client';
import { ServiceError, toServiceError } from '../lib/errors';
import type { PermissionCode, Profile, RoleCode } from '../types';
import { isPermissionCode } from '../types';
import { mapProfile, PROFILE_WITH_RELATIONS_SELECT } from './mappers';

export type AuthEventAction = 'auth.login.success' | 'auth.logout' | 'auth.password.changed';

export type AccessResult =
  | { kind: 'granted'; profile: Profile; role: RoleCode | null; permissions: PermissionCode[] }
  | { kind: 'denied'; reason: string };

const AUTH_ERROR_MESSAGES: Record<string, string> = {
  invalid_credentials: 'E-mail ou palavra-passe incorretos.',
  email_not_confirmed: 'A conta ainda não foi ativada. Utilize o link do convite enviado por e-mail.',
  user_banned: 'Esta conta está bloqueada. Contacte o administrador.',
  over_request_rate_limit: 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.',
  over_email_send_rate_limit: 'Foram enviados demasiados e-mails. Aguarde alguns minutos e tente novamente.',
  weak_password: 'A palavra-passe não cumpre os requisitos de segurança definidos.',
  same_password: 'A nova palavra-passe deve ser diferente da atual.',
  session_not_found: 'A sessão expirou. Inicie sessão novamente.',
  session_expired: 'A sessão expirou. Inicie sessão novamente.',
};

function toAuthServiceError(error: AuthError, fallback: string): ServiceError {
  const message = error.code ? AUTH_ERROR_MESSAGES[error.code] : undefined;
  if (message) return new ServiceError(message, error.code ?? null);
  if (error.name === 'AuthRetryableFetchError') {
    return new ServiceError('Não foi possível contactar o servidor de autenticação. Verifique a ligação.', null);
  }
  return new ServiceError(fallback, error.code ?? null);
}

/** Resolve o perfil, o perfil de acesso e as permissões do utilizador autenticado. */
export async function fetchAccess(authUserId: string): Promise<AccessResult> {
  const { data: profileRow, error: profileError } = await supabase
    .from('profiles')
    .select(PROFILE_WITH_RELATIONS_SELECT)
    .eq('auth_user_id', authUserId)
    .maybeSingle();

  if (profileError) throw toServiceError(profileError, 'Não foi possível carregar o seu perfil.');
  if (!profileRow) {
    return {
      kind: 'denied',
      reason: 'A sua conta não tem um perfil associado no TsheetGRT. Contacte o administrador.',
    };
  }
  if (!profileRow.is_active) {
    return { kind: 'denied', reason: 'A sua conta está desativada. Contacte o administrador.' };
  }

  const { data: permissionCodes, error: permissionsError } = await supabase.rpc('get_my_permissions');
  if (permissionsError) throw toServiceError(permissionsError, 'Não foi possível carregar as suas permissões.');

  const profile = mapProfile(profileRow);
  return {
    kind: 'granted',
    profile,
    role: profile.role?.code ?? null,
    permissions: (permissionCodes ?? []).filter(isPermissionCode),
  };
}

export async function signInWithPassword(email: string, password: string): Promise<string> {
  const { data, error } = await supabase.auth.signInWithPassword({
    email: email.trim().toLowerCase(),
    password,
  });
  if (error) throw toAuthServiceError(error, 'Não foi possível iniciar sessão. Tente novamente.');
  return data.user.id;
}

/** Regista o evento na auditoria. Uma falha de registo não deve impedir a ação do utilizador. */
export async function logAuthEvent(action: AuthEventAction): Promise<void> {
  const { error } = await supabase.rpc('log_auth_event', { p_action: action });
  if (error && import.meta.env.DEV) {
    console.warn(`Não foi possível registar o evento ${action}:`, error.message);
  }
}

export async function signOut(): Promise<void> {
  await logAuthEvent('auth.logout');
  const { error } = await supabase.auth.signOut();
  if (error) throw toAuthServiceError(error, 'Não foi possível terminar a sessão.');
}

export async function requestPasswordReset(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) throw toAuthServiceError(error, 'Não foi possível enviar o pedido de recuperação.');
}

export async function updatePassword(newPassword: string): Promise<void> {
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw toAuthServiceError(error, 'Não foi possível atualizar a palavra-passe.');
  await logAuthEvent('auth.password.changed');
}

/** Confirma a palavra-passe atual antes de permitir a alteração. */
export async function verifyCurrentPassword(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === 'invalid_credentials') {
      throw new ServiceError('A palavra-passe atual está incorreta.', error.code);
    }
    throw toAuthServiceError(error, 'Não foi possível validar a palavra-passe atual.');
  }
}
