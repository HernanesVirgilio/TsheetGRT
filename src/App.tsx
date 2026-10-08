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

// Timesheet próprio
import { TimesheetListPage } from './pages/timesheets/TimesheetListPage';
import { TimesheetDetailPage } from './pages/timesheets/TimesheetDetailPage';

// Gestão de equipa (Manager)
import { TeamPage } from './pages/manager/TeamPage';
import { TeamMemberPage } from './pages/manager/TeamMemberPage';
import { ApprovalsPage } from './pages/manager/ApprovalsPage';
import { TimesheetReviewPage } from './pages/manager/TimesheetReviewPage';
import { TeamActivityPage } from './pages/manager/TeamActivityPage';

// Suporte IT
import { SupportTicketsPage } from './pages/it/SupportTicketsPage';
import { ITDashboardPage } from './pages/it/ITDashboardPage';
import { TicketsPage } from './pages/it/TicketsPage';
import { TicketDetailPage } from './pages/it/TicketDetailPage';
import { AssetsPage } from './pages/it/AssetsPage';
import { AssetDetailPage } from './pages/it/AssetDetailPage';
import { InterventionsPage } from './pages/it/InterventionsPage';

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

const PERMISSION_ROUTES: PermissionRoute[] = [
  { path: '/timesheets', permission: 'SELF_TIMESHEET_READ', element: <TimesheetListPage /> },
  { path: '/timesheets/:id', permission: 'SELF_TIMESHEET_READ', element: <TimesheetDetailPage /> },
  { path: '/team', permission: 'TEAM_READ', element: <TeamPage /> },
  { path: '/team/:id', permission: 'TEAM_READ', element: <TeamMemberPage /> },
  { path: '/approvals', permission: 'TEAM_TIMESHEET_REVIEW', element: <ApprovalsPage /> },
  { path: '/approvals/:id', permission: 'TEAM_TIMESHEET_REVIEW', element: <TimesheetReviewPage /> },
  { path: '/activity', permission: 'TEAM_TIMESHEET_READ', element: <TeamActivityPage /> },
  { path: '/support', permission: 'IT_TICKET_CREATE', element: <SupportTicketsPage /> },
  { path: '/support/:id', permission: 'IT_TICKET_CREATE', element: <TicketDetailPage context="support" /> },
  { path: '/it', permission: 'IT_TICKETS_READ', element: <ITDashboardPage /> },
  { path: '/it/tickets', permission: 'IT_TICKETS_READ', element: <TicketsPage /> },
  { path: '/it/tickets/:id', permission: 'IT_TICKETS_READ', element: <TicketDetailPage context="it" /> },
  { path: '/it/assets', permission: 'IT_ASSETS_READ', element: <AssetsPage /> },
  { path: '/it/assets/:id', permission: 'IT_ASSETS_READ', element: <AssetDetailPage /> },
  { path: '/it/interventions', permission: 'IT_TICKETS_READ', element: <InterventionsPage /> },
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

          {PERMISSION_ROUTES.map((route) => (
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
