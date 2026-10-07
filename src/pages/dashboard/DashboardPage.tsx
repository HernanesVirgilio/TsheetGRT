import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { EmployeeDashboard } from './EmployeeDashboard';
import { ManagerDashboard } from './ManagerDashboard';
import { ITDashboard } from './ITDashboard';
import { AdminDashboard } from './AdminDashboard';

export const DashboardPage: React.FC = () => {
  const { role } = useAuth();

  switch (role) {
    case 'ADMIN':
      return <AdminDashboard />;
    case 'IT':
      return <ITDashboard />;
    case 'MANAGER':
      return <ManagerDashboard />;
    case 'EMPLOYEE':
    default:
      return <EmployeeDashboard />;
  }
};
