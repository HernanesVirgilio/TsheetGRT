import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { WorkCenterPage } from '../work/WorkCenterPage';
import { ManagerDashboard } from './ManagerDashboard';
import { ITDashboardPage } from '../it/ITDashboardPage';
import { AdminDashboard } from './AdminDashboard';

export const DashboardPage: React.FC = () => {
  const { role } = useAuth();

  switch (role) {
    case 'ADMIN':
      return <AdminDashboard />;
    case 'IT':
      return <ITDashboardPage />;
    case 'MANAGER':
      return <ManagerDashboard />;
    case 'EMPLOYEE':
    default:
      return <WorkCenterPage />;
  }
};
