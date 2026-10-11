import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { WorkCenterPage } from '../work/WorkCenterPage';
import { ManagerDashboard } from './ManagerDashboard';
import { GestorDashboard } from './GestorDashboard';
import { ITDashboardPage } from '../it/ITDashboardPage';
import { AdminDashboard } from './AdminDashboard';
import { StartDashboard } from './StartDashboard';
import { firstName, greetingFor, selectDashboard } from '../../utils/dashboard';
import type { DashboardKind } from '../../utils/dashboard';

const DASHBOARDS: Record<DashboardKind, React.FC> = {
  ADMIN: AdminDashboard,
  IT: ITDashboardPage,
  MANAGER: ManagerDashboard,
  GESTOR: GestorDashboard,
  WORK: WorkCenterPage,
  START: StartDashboard,
};

/** Contexto de quem entrou: saudação, perfil de acesso e departamento. */
const DashboardGreeting: React.FC = () => {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const context = [currentUser.role?.name ?? 'Sem perfil de acesso', currentUser.department?.name].filter(Boolean).join(' · ');
  return (
    <p className="text-sm text-text-secondary">
      <span className="font-semibold text-text">
        {greetingFor(new Date())}, {firstName(currentUser.full_name)}.
      </span>{' '}
      {context}
    </p>
  );
};

/**
 * Dashboard inicial. O perfil escolhe o painel preferido, mas só se o utilizador tiver a permissão
 * que esse painel exige; caso contrário recebe um painel acessível em vez de erros de acesso.
 */
export const DashboardPage: React.FC = () => {
  const { role, hasPermission } = useAuth();
  const Dashboard = DASHBOARDS[selectDashboard(role, hasPermission)];

  return (
    <div className="space-y-3">
      <DashboardGreeting />
      <Dashboard />
    </div>
  );
};
