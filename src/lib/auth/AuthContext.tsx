import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { getErrorMessage } from '../errors';
import * as authService from '../../services/authService';
import type { AccessResult } from '../../services/authService';
import type { PermissionCode, Profile, RoleCode } from '../../types';
import { t } from '../i18n';

/**
 * Fluxo de autenticação:
 *   Supabase Auth → sessão Supabase → profiles → user_roles/roles → permissões → ProtectedRoute
 * O frontend apenas reflete o que o servidor autoriza; a RLS continua a ser a barreira real.
 */
/** Porque deixou de existir sessão: nunca existiu, o utilizador terminou-a ou terminou sem ação dele. */
export type SessionEndReason = 'none' | 'signed_out' | 'ended';

type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out'; reason: SessionEndReason }
  | { status: 'no_access'; reason: string }
  | { status: 'ready'; profile: Profile; role: RoleCode | null; permissions: PermissionCode[] };

export type AuthStatus = AuthState['status'];

export type AuthActionResult = { success: true } | { success: false; error: string };

/**
 * Resultado da definição da palavra-passe a partir de um convite ou de um link de recuperação:
 * - `ready`: sessão válida e acesso carregado;
 * - `blocked`: sessão válida, mas sem acesso à aplicação (o AppShell explica o motivo);
 * - `signed_out`: a palavra-passe foi guardada, mas já não existe sessão;
 * - `error`: a palavra-passe não foi guardada.
 */
export type PasswordSetupResult =
  | { outcome: 'ready' | 'blocked' | 'signed_out' }
  | { outcome: 'error'; error: string };

interface AuthContextValue {
  status: AuthStatus;
  currentUser: Profile | null;
  role: RoleCode | null;
  permissions: PermissionCode[];
  isAuthenticated: boolean;
  isLoading: boolean;
  /** Existe sessão Supabase, mesmo que o acesso à aplicação tenha sido recusado. */
  hasSession: boolean;
  accessError: string | null;
  /** Preenchido quando não há sessão; distingue o fim de sessão pedido pelo utilizador. */
  sessionEndReason: SessionEndReason | null;
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthActionResult>;
  completePasswordSetup: (newPassword: string) => Promise<PasswordSetupResult>;
  hasPermission: (permissionCode: PermissionCode) => boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

function toAuthState(result: AccessResult): AuthState {
  return result.kind === 'granted'
    ? { status: 'ready', profile: result.profile, role: result.role, permissions: result.permissions }
    : { status: 'no_access', reason: result.reason };
}

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<AuthState>({ status: 'loading' });
  const accessRequestRef = useRef<{ userId: string; promise: Promise<AccessResult> } | null>(null);
  const hadSessionRef = useRef(false);
  const signOutRequestedRef = useRef(false);

  // Um único pedido de acesso por utilizador, partilhado entre o login e os eventos do SDK.
  const resolveAccess = useCallback((userId: string, force = false): Promise<AccessResult> => {
    const existing = accessRequestRef.current;
    if (!force && existing?.userId === userId) return existing.promise;

    if (existing?.userId !== userId) setState({ status: 'loading' });

    const promise = authService.fetchAccess(userId);
    accessRequestRef.current = { userId, promise };

    promise
      .then((result) => {
        if (accessRequestRef.current?.promise === promise) setState(toAuthState(result));
      })
      .catch((error: unknown) => {
        if (accessRequestRef.current?.promise === promise) {
          accessRequestRef.current = null;
          setState({ status: 'no_access', reason: getErrorMessage(error, t('Não foi possível verificar o seu acesso.')) });
        }
      });

    return promise;
  }, []);

  const handleSession = useCallback(
    (session: Session | null) => {
      if (!session) {
        const reason: SessionEndReason = signOutRequestedRef.current ? 'signed_out' : hadSessionRef.current ? 'ended' : 'none';
        accessRequestRef.current = null;
        hadSessionRef.current = false;
        signOutRequestedRef.current = false;
        setState({ status: 'signed_out', reason });
        return;
      }
      hadSessionRef.current = true;
      resolveAccess(session.user.id).catch(() => undefined);
    },
    [resolveAccess]
  );

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => handleSession(data.session))
      .catch(() => setState({ status: 'signed_out', reason: 'none' }));

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      // O SDK recomenda não chamar outros métodos Supabase dentro deste callback.
      window.setTimeout(() => handleSession(session), 0);
    });
    return () => data.subscription.unsubscribe();
  }, [handleSession]);

  const signIn = useCallback(
    async (email: string, password: string): Promise<AuthActionResult> => {
      try {
        const userId = await authService.signInWithPassword(email, password);
        const access = await resolveAccess(userId);
        if (access.kind === 'denied') {
          signOutRequestedRef.current = true;
          await supabase.auth.signOut({ scope: 'local' });
          return { success: false, error: access.reason };
        }
        await authService.logAuthEvent('auth.login.success');
        return { success: true };
      } catch (error) {
        return { success: false, error: getErrorMessage(error, t('Não foi possível iniciar sessão. Tente novamente.')) };
      }
    },
    [resolveAccess]
  );

  const signOut = useCallback(async () => {
    signOutRequestedRef.current = true;
    try {
      await authService.signOut();
    } catch {
      // Sem ligação ao servidor: termina pelo menos a sessão local.
      await supabase.auth.signOut({ scope: 'local' });
    }
  }, []);

  const refreshProfile = useCallback(async () => {
    const { data } = await supabase.auth.getSession();
    if (data.session) await resolveAccess(data.session.user.id, true).catch(() => undefined);
  }, [resolveAccess]);

  const profile = state.status === 'ready' ? state.profile : null;

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string): Promise<AuthActionResult> => {
      if (!profile) return { success: false, error: t('Não existe uma sessão ativa.') };
      try {
        await authService.verifyCurrentPassword(profile.email, currentPassword);
        await authService.updatePassword(newPassword);
        await refreshProfile();
        return { success: true };
      } catch (error) {
        return { success: false, error: getErrorMessage(error, t('Não foi possível alterar a palavra-passe.')) };
      }
    },
    [profile, refreshProfile]
  );

  const completePasswordSetup = useCallback(
    async (newPassword: string): Promise<PasswordSetupResult> => {
      try {
        await authService.updatePassword(newPassword);
      } catch (error) {
        return { outcome: 'error', error: getErrorMessage(error, t('Não foi possível guardar a palavra-passe.')) };
      }
      // A atualização não garante, por si só, uma sessão válida: confirma-a antes de decidir o destino.
      const { data } = await supabase.auth.getSession();
      if (!data.session) return { outcome: 'signed_out' };
      // Recarrega o perfil (incluindo must_change_password, limpo no servidor) antes de navegar.
      const access = await resolveAccess(data.session.user.id, true).catch(() => null);
      return { outcome: access?.kind === 'granted' ? 'ready' : 'blocked' };
    },
    [resolveAccess]
  );

  const permissions = useMemo(() => (state.status === 'ready' ? state.permissions : []), [state]);

  const hasPermission = useCallback(
    (permissionCode: PermissionCode) => permissions.includes(permissionCode),
    [permissions]
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      status: state.status,
      currentUser: profile,
      role: state.status === 'ready' ? state.role : null,
      permissions,
      isAuthenticated: state.status === 'ready',
      isLoading: state.status === 'loading',
      hasSession: state.status === 'ready' || state.status === 'no_access',
      accessError: state.status === 'no_access' ? state.reason : null,
      sessionEndReason: state.status === 'signed_out' ? state.reason : null,
      mustChangePassword: profile?.must_change_password ?? false,
      signIn,
      signOut,
      changePassword,
      completePasswordSetup,
      hasPermission,
      refreshProfile,
    }),
    [state, profile, permissions, signIn, signOut, changePassword, completePasswordSetup, hasPermission, refreshProfile]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextValue => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
