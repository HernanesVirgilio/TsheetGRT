import React, { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, Role, PermissionCode, RoleCode } from '../../types';
import { dataService, logAuditEvent } from '../../services/dataService';
import { supabase, isConfiguredWithRealSupabase } from '../supabase/client';

interface AuthContextType {
  currentUser: Profile | null;
  profile: Profile | null;
  role: RoleCode | null;
  roles: Role[];
  permissions: PermissionCode[];
  isAuthenticated: boolean;
  isLoading: boolean;
  mustChangePassword: boolean;
  signIn: (email: string, passwordAttempt: string) => Promise<{ success: boolean; error?: string }>;
  signOut: () => Promise<void>;
  changePassword: (currentPasswordAttempt: string, newPassword: string) => Promise<{ success: boolean; error?: string }>;
  hasPermission: (permissionCode: PermissionCode) => boolean;
  switchAccountForDev: (email: string) => void;
  refreshProfile: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const AUTH_STORAGE_USER_ID = 'sih_authenticated_user_id';
const MUST_CHANGE_PWD_KEY = 'sih_must_change_pwd';

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<Profile | null>(null);
  const [mustChangePassword, setMustChangePassword] = useState<boolean>(false);
  const [isLoading, setIsLoading] = useState<boolean>(true);

  // Restore session on initial load
  const restoreSession = useCallback(() => {
    try {
      const storedUserId = localStorage.getItem(AUTH_STORAGE_USER_ID);
      if (storedUserId) {
        const found = dataService.getProfileById(storedUserId);
        if (found && found.is_active) {
          setCurrentUser(found);
          const flag = localStorage.getItem(MUST_CHANGE_PWD_KEY) === 'true' || found.must_change_password;
          setMustChangePassword(flag);
        } else {
          localStorage.removeItem(AUTH_STORAGE_USER_ID);
          localStorage.removeItem(MUST_CHANGE_PWD_KEY);
          setCurrentUser(null);
        }
      }
    } catch (err) {
      console.error('Failed to restore session:', err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  const refreshProfile = useCallback(() => {
    if (currentUser) {
      const updated = dataService.getProfileById(currentUser.id);
      if (updated) {
        setCurrentUser(updated);
        setMustChangePassword(updated.must_change_password);
      }
    }
  }, [currentUser]);

  const role: RoleCode | null = useMemo(() => {
    if (!currentUser || !currentUser.roles || currentUser.roles.length === 0) return null;
    return currentUser.roles[0].code;
  }, [currentUser]);

  const permissions: PermissionCode[] = useMemo(() => {
    if (!role) return [];
    return dataService.getUserPermissions(role);
  }, [role]);

  const hasPermission = useCallback(
    (code: PermissionCode): boolean => {
      if (!role) return false;
      if (role === 'ADMIN') return true;
      return permissions.includes(code);
    },
    [role, permissions]
  );

  const signIn = async (email: string, passwordAttempt: string): Promise<{ success: boolean; error?: string }> => {
    try {
      // If remote Supabase Auth is configured, authenticate via Supabase
      if (supabase && isConfiguredWithRealSupabase) {
        const { error: supaError } = await supabase.auth.signInWithPassword({
          email: email.trim().toLowerCase(),
          password: passwordAttempt,
        });
        if (supaError) {
          console.warn('Supabase remote auth notice:', supaError.message);
        }
      }

      const result = dataService.verifyCredentials(email, passwordAttempt);
      if (!result) {
        return { success: false, error: 'E-mail ou palavra-passe incorretos.' };
      }

      setCurrentUser(result.profile);
      setMustChangePassword(result.mustChangePassword);

      localStorage.setItem(AUTH_STORAGE_USER_ID, result.profile.id);
      localStorage.setItem(MUST_CHANGE_PWD_KEY, String(result.mustChangePassword));

      return { success: true };
    } catch {
      return { success: false, error: 'Não foi possível concluir a operação. Tente novamente.' };
    }
  };

  const signOut = async (): Promise<void> => {
    if (currentUser) {
      logAuditEvent(
        currentUser.id,
        'auth.logout',
        'auth',
        currentUser.id,
        `Sessão terminada por ${currentUser.full_name}`
      );
    }
    if (supabase && isConfiguredWithRealSupabase) {
      try {
        await supabase.auth.signOut();
      } catch (err) {
        console.warn('Supabase signout notice:', err);
      }
    }
    localStorage.removeItem(AUTH_STORAGE_USER_ID);
    localStorage.removeItem(MUST_CHANGE_PWD_KEY);
    setCurrentUser(null);
    setMustChangePassword(false);
  };

  const changePassword = async (
    currentPasswordAttempt: string,
    newPassword: string
  ): Promise<{ success: boolean; error?: string }> => {
    if (!currentUser) {
      return { success: false, error: 'Nenhum utilizador com sessão ativa.' };
    }

    try {
      if (supabase && isConfiguredWithRealSupabase) {
        try {
          await supabase.auth.updateUser({ password: newPassword });
        } catch (supaErr) {
          console.warn('Supabase update password notice:', supaErr);
        }
      }

      dataService.changeUserPassword(currentUser.id, currentPasswordAttempt, newPassword);
      setMustChangePassword(false);
      localStorage.setItem(MUST_CHANGE_PWD_KEY, 'false');
      refreshProfile();
      return { success: true };
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : 'Não foi possível alterar a palavra-passe.';
      return { success: false, error: message };
    }
  };

  // Quick switcher for development testing of all 4 roles
  const switchAccountForDev = (email: string) => {
    const p = dataService.getProfileByEmail(email);
    if (p) {
      setCurrentUser(p);
      setMustChangePassword(p.must_change_password);
      localStorage.setItem(AUTH_STORAGE_USER_ID, p.id);
      localStorage.setItem(MUST_CHANGE_PWD_KEY, String(p.must_change_password));
    }
  };

  const value = {
    currentUser,
    profile: currentUser,
    role,
    roles: currentUser?.roles || [],
    permissions,
    isAuthenticated: Boolean(currentUser),
    isLoading,
    mustChangePassword,
    signIn,
    signOut,
    changePassword,
    hasPermission,
    switchAccountForDev,
    refreshProfile,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth deve ser utilizado dentro de um AuthProvider');
  }
  return context;
};
