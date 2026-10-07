import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../supabase/client';
import { getErrorMessage } from '../errors';
import * as authService from '../../services/authService';
import type { AccessResult } from '../../services/authService';
import type { PermissionCode, Profile, RoleCode } from '../../types';

/**
 * Fluxo de autenticação:
 *   Supabase Auth → sessão Supabase → profiles → user_roles/roles → permissões → ProtectedRoute
 * O frontend apenas reflete o que o servidor autoriza; a RLS continua a ser a barreira real.
 */
type AuthState =
  | { status: 'loading' }
  | { status: 'signed_out' }
  | { status: 'no_access'; reason: string }
  | { status: 'ready'; profile: Profile; role: RoleCode | null; permissions: PermissionCode[] };

export type AuthStatus = AuthState['status'];

export type AuthActionResult = { success: true } | { success: false; error: string };

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
  mustChangePassword: boolean;
  signIn: (email: string, password: string) => Promise<AuthActionResult>;
  signOut: () => Promise<void>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthActionResult>;
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
          setState({ status: 'no_access', reason: getErrorMessage(error, 'Não foi possível verificar o seu acesso.') });
        }
      });

    return promise;
  }, []);

  const handleSession = useCallback(
    (session: Session | null) => {
      if (!session) {
        accessRequestRef.current = null;
        setState({ status: 'signed_out' });
        return;
      }
      resolveAccess(session.user.id).catch(() => undefined);
    },
    [resolveAccess]
  );

  useEffect(() => {
    supabase.auth
      .getSession()
      .then(({ data }) => handleSession(data.session))
      .catch(() => setState({ status: 'signed_out' }));

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
          await supabase.auth.signOut({ scope: 'local' });
          return { success: false, error: access.reason };
        }
        await authService.logAuthEvent('auth.login.success');
        return { success: true };
      } catch (error) {
        return { success: false, error: getErrorMessage(error, 'Não foi possível iniciar sessão. Tente novamente.') };
      }
    },
    [resolveAccess]
  );

  const signOut = useCallback(async () => {
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
      if (!profile) return { success: false, error: 'Não existe uma sessão ativa.' };
      try {
        await authService.verifyCurrentPassword(profile.email, currentPassword);
        await authService.updatePassword(newPassword);
        await refreshProfile();
        return { success: true };
      } catch (error) {
        return { success: false, error: getErrorMessage(error, 'Não foi possível alterar a palavra-passe.') };
      }
    },
    [profile, refreshProfile]
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
      mustChangePassword: profile?.must_change_password ?? false,
      signIn,
      signOut,
      changePassword,
      hasPermission,
      refreshProfile,
    }),
    [state, profile, permissions, signIn, signOut, changePassword, hasPermission, refreshProfile]
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
