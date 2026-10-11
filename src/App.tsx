import React, { useEffect } from 'react';
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { PreferencesProvider } from './lib/preferences/PreferencesContext';
import { consumeAuthRedirect } from './lib/supabase/client';
import { ROUTE_PERMISSIONS } from './lib/auth/routeAccess';
import type { PermissionRoutePath } from './lib/auth/routeAccess';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

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

// Trabalho (Timesheet Core)
import { WorkCenterPage } from './pages/work/WorkCenterPage';
import { TasksPage } from './pages/work/TasksPage';
import { TaskDetailPage } from './pages/work/TaskDetailPage';
import { WorkLogPage } from './pages/work/WorkLogPage';
import { CalendarPage } from './pages/work/CalendarPage';
import { MeetingsPage } from './pages/work/MeetingsPage';
import { MeetingDetailPage } from './pages/work/MeetingDetailPage';
import { AbsencesPage } from './pages/work/AbsencesPage';
import { OpportunitiesPage } from './pages/work/OpportunitiesPage';
import { OpportunityDetailPage } from './pages/work/OpportunityDetailPage';
import { CompaniesPage } from './pages/work/CompaniesPage';
import { TeamWorkPage } from './pages/work/TeamWorkPage';
import { TeamReportsPage } from './pages/work/TeamReportsPage';
import { ApprovalRequestsPage } from './pages/work/ApprovalRequestsPage';

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
  path: PermissionRoutePath;
  element: React.ReactNode;
}

// A permissão de cada rota está em ROUTE_PERMISSIONS (lib/auth/routeAccess).

const PERMISSION_ROUTES: PermissionRoute[] = [
  { path: '/timesheets', element: <TimesheetListPage /> },
  { path: '/timesheets/:id', element: <TimesheetDetailPage /> },
  { path: '/timesheet', element: <WorkCenterPage /> },
  { path: '/timesheet/tasks', element: <TasksPage /> },
  { path: '/timesheet/tasks/:id', element: <TaskDetailPage /> },
  { path: '/timesheet/activities', element: <WorkLogPage /> },
  { path: '/timesheet/calendar', element: <CalendarPage /> },
  { path: '/timesheet/meetings', element: <MeetingsPage /> },
  { path: '/timesheet/meetings/:id', element: <MeetingDetailPage /> },
  { path: '/timesheet/absences', element: <AbsencesPage /> },
  { path: '/timesheet/opportunities', element: <OpportunitiesPage /> },
  { path: '/timesheet/opportunities/:id', element: <OpportunityDetailPage /> },
  { path: '/timesheet/companies', element: <CompaniesPage /> },
  { path: '/timesheet/team', element: <TeamWorkPage /> },
  { path: '/timesheet/reports', element: <TeamReportsPage /> },
  { path: '/timesheet/approvals', element: <ApprovalRequestsPage /> },
  { path: '/team', element: <TeamPage /> },
  { path: '/team/:id', element: <TeamMemberPage /> },
  { path: '/approvals', element: <ApprovalsPage /> },
  { path: '/approvals/:id', element: <TimesheetReviewPage /> },
  { path: '/activity', element: <TeamActivityPage /> },
  { path: '/support', element: <SupportTicketsPage /> },
  { path: '/support/:id', element: <TicketDetailPage context="support" /> },
  { path: '/it', element: <ITDashboardPage /> },
  { path: '/it/tickets', element: <TicketsPage /> },
  { path: '/it/tickets/:id', element: <TicketDetailPage context="it" /> },
  { path: '/it/assets', element: <AssetsPage /> },
  { path: '/it/assets/:id', element: <AssetDetailPage /> },
  { path: '/it/interventions', element: <InterventionsPage /> },
  { path: '/reports', element: <ReportsPage /> },
  { path: '/users', element: <UsersPage /> },
  { path: '/users/:id', element: <UserDetailPage /> },
  { path: '/departments', element: <DepartmentsPage /> },
  { path: '/roles', element: <RolesPage /> },
  { path: '/audit', element: <AuditPage /> },
  { path: '/system-health', element: <SystemHealthPage /> },
  { path: '/settings', element: <SettingsPage /> },
];

/**
 * Links de convite/recuperação podem chegar a qualquer URL: encaminha, uma única vez, para a definição
 * da palavra-passe. O link é consumido porque `navigate` muda a cada navegação e voltaria a disparar o efeito.
 */
const AuthRedirectHandler: React.FC = () => {
  const navigate = useNavigate();
  useEffect(() => {
    if (consumeAuthRedirect()) navigate('/reset-password', { replace: true });
  }, [navigate]);
  return null;
};

export const App: React.FC = () => (
  <BrowserRouter>
    <AuthProvider>
      <PreferencesProvider>
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
                element={<ProtectedRoute requiredPermission={ROUTE_PERMISSIONS[route.path]}>{route.element}</ProtectedRoute>}
              />
            ))}

            <Route path="/403" element={<UnauthorizedPage />} />
          </Route>

          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
        <AuthRedirectHandler />
      </PreferencesProvider>
    </AuthProvider>
  </BrowserRouter>
);

export default App;
