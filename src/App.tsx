import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider } from './lib/auth/AuthContext';
import { AppShell } from './components/layout/AppShell';
import { ProtectedRoute } from './components/layout/ProtectedRoute';

// Auth Pages
import { LoginPage } from './pages/auth/LoginPage';
import { ChangePasswordPage } from './pages/auth/ChangePasswordPage';
import { ForgotPasswordPage } from './pages/auth/ForgotPasswordPage';
import { ResetPasswordPage } from './pages/auth/ResetPasswordPage';

// Main Pages
import { DashboardPage } from './pages/dashboard/DashboardPage';
import { TimesheetListPage } from './pages/timesheets/TimesheetListPage';
import { TimesheetDetailPage } from './pages/timesheets/TimesheetDetailPage';
import { TeamPage } from './pages/manager/TeamPage';
import { ApprovalsPage } from './pages/manager/ApprovalsPage';
import { ReportsPage } from './pages/reports/ReportsPage';
import { UsersPage } from './pages/admin/UsersPage';
import { UserDetailPage } from './pages/admin/UserDetailPage';
import { DepartmentsPage } from './pages/admin/DepartmentsPage';
import { RolesPage } from './pages/admin/RolesPage';
import { AuditPage } from './pages/admin/AuditPage';
import { SystemHealthPage } from './pages/admin/SystemHealthPage';
import { SettingsPage } from './pages/admin/SettingsPage';
import { ProfilePage } from './pages/profile/ProfilePage';
import { NotificationsPage } from './pages/notifications/NotificationsPage';

// Error Pages
import { UnauthorizedPage } from './pages/UnauthorizedPage';
import { NotFoundPage } from './pages/NotFoundPage';

export const App: React.FC = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          {/* Public Authentication Routes */}
          <Route path="/login" element={<LoginPage />} />
          <Route path="/forgot-password" element={<ForgotPasswordPage />} />
          <Route path="/reset-password" element={<ResetPasswordPage />} />

          {/* Protected Shell Routes */}
          <Route element={<AppShell />}>
            {/* Forced or voluntary password change */}
            <Route path="/alterar-palavra-passe" element={<ChangePasswordPage />} />

            {/* Notifications */}
            <Route
              path="/notifications"
              element={
                <ProtectedRoute>
                  <NotificationsPage />
                </ProtectedRoute>
              }
            />

            {/* Dashboard: All authenticated users */}
            <Route
              path="/dashboard"
              element={
                <ProtectedRoute>
                  <DashboardPage />
                </ProtectedRoute>
              }
            />

            {/* Timesheets: Employee, Manager, Admin */}
            <Route
              path="/timesheets"
              element={
                <ProtectedRoute allowedRoles={['EMPLOYEE', 'MANAGER', 'ADMIN']}>
                  <TimesheetListPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/timesheets/:id"
              element={
                <ProtectedRoute allowedRoles={['EMPLOYEE', 'MANAGER', 'ADMIN']}>
                  <TimesheetDetailPage />
                </ProtectedRoute>
              }
            />

            {/* Manager Routes: Team & Approvals */}
            <Route
              path="/team"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <TeamPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/approvals"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <ApprovalsPage />
                </ProtectedRoute>
              }
            />

            {/* Reports: Manager & Admin */}
            <Route
              path="/reports"
              element={
                <ProtectedRoute allowedRoles={['MANAGER', 'ADMIN']}>
                  <ReportsPage />
                </ProtectedRoute>
              }
            />

            {/* User Management: IT & Admin */}
            <Route
              path="/users"
              element={
                <ProtectedRoute allowedRoles={['IT', 'ADMIN']}>
                  <UsersPage />
                </ProtectedRoute>
              }
            />
            <Route
              path="/users/:id"
              element={
                <ProtectedRoute allowedRoles={['IT', 'ADMIN']}>
                  <UserDetailPage />
                </ProtectedRoute>
              }
            />

            {/* Departments: Admin */}
            <Route
              path="/departments"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <DepartmentsPage />
                </ProtectedRoute>
              }
            />

            {/* Roles & Permissions: Admin */}
            <Route
              path="/roles"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <RolesPage />
                </ProtectedRoute>
              }
            />

            {/* Audit Logs: IT & Admin */}
            <Route
              path="/audit"
              element={
                <ProtectedRoute allowedRoles={['IT', 'ADMIN']}>
                  <AuditPage />
                </ProtectedRoute>
              }
            />

            {/* System Health: IT & Admin */}
            <Route
              path="/system-health"
              element={
                <ProtectedRoute allowedRoles={['IT', 'ADMIN']}>
                  <SystemHealthPage />
                </ProtectedRoute>
              }
            />

            {/* System Settings: Admin */}
            <Route
              path="/settings"
              element={
                <ProtectedRoute allowedRoles={['ADMIN']}>
                  <SettingsPage />
                </ProtectedRoute>
              }
            />

            {/* User Profile: All authenticated users */}
            <Route
              path="/profile"
              element={
                <ProtectedRoute>
                  <ProfilePage />
                </ProtectedRoute>
              }
            />

            {/* Error Pages */}
            <Route path="/403" element={<UnauthorizedPage />} />
            <Route path="/404" element={<NotFoundPage />} />
          </Route>

          {/* Root Redirect */}
          <Route path="/" element={<Navigate to="/dashboard" replace />} />

          {/* Fallback Not Found */}
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
};

export default App;
