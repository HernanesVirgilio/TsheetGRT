import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import type { PermissionCode, RoleCode } from '../../types';
import { LoadingState } from '../ui/States';

interface ProtectedRouteProps {
  children: React.ReactNode;
  requiredPermission?: PermissionCode;
  allowedRoles?: RoleCode[];
}

/**
 * Proteção de navegação (experiência de utilizador). A autorização efetiva é feita
 * no servidor pelas políticas RLS; esta verificação apenas evita ecrãs sem acesso.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredPermission, allowedRoles }) => {
  const { status, hasPermission, role } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingState label="A verificar permissões..." />;
  }

  if (status !== 'ready') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (allowedRoles && (!role || !allowedRoles.includes(role))) {
    return <Navigate to="/403" replace />;
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <Navigate to="/403" replace />;
  }

  return <>{children}</>;
};
