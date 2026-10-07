import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { initialAuthRedirectType } from './lib/supabase/client';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';
import type { PermissionCode } from './types';

// Autenticação
import { LoginPage } from './pages/auth/LoginPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

// Geral
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';

// Timesheets e equipa (fases seguintes)
import { TimesheetListPage } from './pages/timesheets/TimesheetListPage';
import { TimesheetDetailPage } from './pages/timesheets/TimesheetDetailPage';
import { TeamPage } from './pages/manager/TeamPage';
import { ApprovalsPage } from './pages/manager/ApprovalsPage';

// Administração
import { ReportsPage } from './pages/reports/ReportsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { UserDetailPage } from './pages/admin/UserDetailPage';
import { DepartmentsPage } from './pages/admin/DepartmentsPage';
import { RolesPage } from './pages/admin/RolesPage';
import { AuditPage } from './pages/admin/AuditPage';
import { SystemHealthPage } from './pages/admin/SystemHealthPage';
import { SettingsPage } from './pages/admin/SettingsPage';

// Erros
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { NotFoundPage } from './pages/NotFoundPage';

interface PermissionRoute {
  path: string;
  permission: PermissionCode;
  element: React.ReactNode;
}

const ADMINISTRATION_ROUTES: PermissionRoute[] = [
  { path: '/reports', permission: 'REPORTS_READ', element: <ReportsPage /> },
  { path: '/users', permission: 'USERS_READ', element: <UsersPage /> },
  { path: '/users/:id', permission: 'USERS_READ', element: <UserDetailPage /> },
  { path: '/departments', permission: 'DEPARTMENTS_READ', element: <DepartmentsPage /> },
  { path: '/roles', permission: 'ROLES_READ', element: <RolesPage /> },
  { path: '/audit', permission: 'AUDIT_READ', element: <AuditPage /> },
  { path: '/system-health', permission: 'SYSTEM_HEALTH_READ', element: <SystemHealthPage /> },
  { path: '/settings', permission: 'SYSTEM_SETTINGS_READ', element: <SettingsPage /> },
];

/** Links de convite/recuperação podem chegar a qualquer URL: encaminha para a definição da palavra-passe. */
const AuthRedirectHandler: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (initialAuthRedirectType) navigate('/reset-password', { replace: true });
  }, [navigate]);
  return null;
};

export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/forgot-password" element={<ForgotPasswordPage />} />
        <Route path="/reset-password" element={<ResetPasswordPage />} />

        <Route element={<AppShell />}>
          <Route path="/alterar-palavra-passe" element={<ChangePasswordPage />} />
          <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
          <Route path="/notifications" element={<ProtectedRoute><NotificationsPage /></ProtectedRoute>} />

          <Route
            path="/timesheets"
            element={<ProtectedRoute allowedRoles={['EMPLOYEE', 'MANAGER', 'ADMIN']}><TimesheetListPage /></ProtectedRoute>}
          />
          <Route
            path="/timesheets/:id"
            element={<ProtectedRoute allowedRoles={['EMPLOYEE', 'MANAGER', 'ADMIN']}><TimesheetDetailPage /></ProtectedRoute>}
          />
          <Route path="/team" element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}><TeamPage /></ProtectedRoute>} />
          <Route
            path="/approvals"
            element={<ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}><ApprovalsPage /></ProtectedRoute>}
          />

          {ADMINISTRATION_ROUTES.map((route) => (
            <Route
              key={route.path}
              path={route.path}
              element={<ProtectedRoute requiredPermission={route.permission}>{route.element}</ProtectedRoute>}
            />
          ))}

          <Route path="/403" element={<UnauthorizedPage />} />
        </Route>

        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
      <AuthRedirectHandler />
    </AuthProvider>
  </BrowserRouter>
);

export default App;
