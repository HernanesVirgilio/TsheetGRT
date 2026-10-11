import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { translated } from '../../lib/i18n';
import { WorkCenterPage } from '../work/WorkCenterPage';
import { ManagerDashboard } from './ManagerDashboard';
import { GestorDashboard } from './GestorDashboard';
import { ITDashboardPage } from '../it/ITDashboardPage';
import { AdminDashboard } from './AdminDashboard';
import { StartDashboard } from './StartDashboard';
import { WelcomeBanner } from '../../components/layout/WelcomeBanner';
import { selectDashboard } from '../../utils/dashboard';
import type { DashboardKind } from '../../utils/dashboard';

const DASHBOARDS: Record<DashboardKind, React.FC> = {
  ADMIN: AdminDashboard,
  IT: ITDashboardPage,
  MANAGER: ManagerDashboard,
  GESTOR: GestorDashboard,
  WORK: WorkCenterPage,
  START: StartDashboard,
};

/** O que cada painel ajuda a fazer (mensagem do banner de boas-vindas). */
const WELCOME_MESSAGES: Record<DashboardKind, string> = translated({
  ADMIN: 'Utilizadores, perfis de acesso, departamentos e o estado do sistema num só lugar.',
  IT: 'Pedidos de suporte, fila de atendimento, equipamentos e intervenções.',
  MANAGER: 'Supervisione as equipas, as decisões que lhe competem e os resultados do período.',
  GESTOR: 'O trabalho da sua equipa hoje: tarefas, prazos, reuniões e pedidos.',
  WORK: 'As suas tarefas, a sua agenda e o tempo registado.',
  START: 'As áreas do TimesheetGRT disponíveis para o seu perfil.',
});

/**
 * Dashboard inicial. O perfil escolhe o painel preferido, mas só se o utilizador tiver a permissão
 * que esse painel exige; caso contrário recebe um painel acessível em vez de erros de acesso.
 */
export const DashboardPage: React.FC = () => {
  const { role, hasPermission } = useAuth();
  const kind = selectDashboard(role, hasPermission);
  const Dashboard = DASHBOARDS[kind];

  return (
    <div className="space-y-5">
      <WelcomeBanner message={WELCOME_MESSAGES[kind]} />
      <Dashboard />
    </div>
  );
};
