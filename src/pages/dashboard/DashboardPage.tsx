import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { WorkCenterPage } from '../work/WorkCenterPage';
import { ManagerDashboard } from './ManagerDashboard';
import { GestorDashboard } from './GestorDashboard';
import { ITDashboardPage } from '../it/ITDashboardPage';
import { AdminDashboard } from './AdminDashboard';
import { StartDashboard } from './StartDashboard';
import { selectDashboard } from '../../utils/dashboard';
import type { DashboardKind } from '../../utils/dashboard';

const ITDashboard: React.FC = () => <ITDashboardPage asDashboard />;

const DASHBOARDS: Record<DashboardKind, React.FC> = {
  ADMIN: AdminDashboard,
  IT: ITDashboard,
  MANAGER: ManagerDashboard,
  GESTOR: GestorDashboard,
  WORK: WorkCenterPage,
  START: StartDashboard,
};

/**
 * Dashboard inicial. O perfil escolhe o painel preferido, mas só se o utilizador tiver a permissão
 * que esse painel exige; caso contrário recebe um painel acessível em vez de erros de acesso.
 * Cada painel tem o seu cabeçalho (saudação, contexto e ações do perfil).
 */
export const DashboardPage: React.FC = () => {
  const { role, hasPermission } = useAuth();
  const Dashboard = DASHBOARDS[selectDashboard(role, hasPermission)];
  return <Dashboard />;
};
