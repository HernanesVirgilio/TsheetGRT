import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { meetsRequirement } from '../../lib/auth/routeAccess';
import type { RouteRequirement } from '../../lib/auth/routeAccess';
import { LoadingState } from '../ui/States';
import { UnauthorizedPage } from '../../pages/UnauthorizedPage';
import { t } from '../../lib/i18n';

interface ProtectedRouteProps {
  children: React.ReactNode;
  /** Uma permissão, ou uma lista em que basta uma delas. */
  requiredPermission?: RouteRequirement;
}

/**
 * Proteção de navegação (experiência de utilizador). A autorização efetiva é feita
 * no servidor pelas políticas RLS; esta verificação apenas evita ecrãs sem acesso.
 * Sem permissão, mostra o acesso restrito no próprio endereço (sem redirecionar),
 * para que o utilizador perceba que página pediu e possa regressar ao dashboard.
 */
export const ProtectedRoute: React.FC<ProtectedRouteProps> = ({ children, requiredPermission }) => {
  const { status, hasPermission } = useAuth();
  const location = useLocation();

  if (status === 'loading') {
    return <LoadingState label={t('A verificar permissões...')} />;
  }

  if (status !== 'ready') {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (!meetsRequirement(requiredPermission, hasPermission)) {
    return <UnauthorizedPage />;
  }

  return <>{children}</>;
};
