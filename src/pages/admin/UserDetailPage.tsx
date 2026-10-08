import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, FileClock, Pencil, Shield, UserCheck, UserX } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getUser, listUserActivity, listUserTimesheets } from '../../services/userService';
import type { UserTimesheetSummary } from '../../services/userService';
import { listDepartments } from '../../services/departmentService';
import { listRoles } from '../../services/roleService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { UserFormModal } from '../../components/admin/UserFormModal';
import { RoleAssignModal } from '../../components/admin/RoleAssignModal';
import { UserStatusDialog } from '../../components/admin/UserStatusDialog';
import { ManagerScopePanel } from '../../components/admin/ManagerScopePanel';
import { formatDate, formatDateTime, formatMinutesAsHours, formatPeriod } from '../../utils/format';
import { isUuid } from '../../utils/validation';

const TIMESHEET_COLUMNS: DataTableColumn<UserTimesheetSummary>[] = [
  { id: 'period', header: 'Período', render: (timesheet) => formatPeriod(timesheet.periodStart, timesheet.periodEnd) },
  { id: 'status', header: 'Estado', render: (timesheet) => <StatusBadge status={timesheet.status} size="sm" /> },
  { id: 'entries', header: 'Registos', render: (timesheet) => timesheet.entryCount },
  { id: 'hours', header: 'Horas', render: (timesheet) => formatMinutesAsHours(timesheet.totalMinutes) },
  { id: 'submitted', header: 'Submetido em', render: (timesheet) => formatDate(timesheet.submittedAt) },
];

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

const BackLink: React.FC = () => (
  <Link to="/users" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    Voltar a utilizadores
  </Link>
);

export const UserDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { currentUser, hasPermission } = useAuth();
  const isValidId = isUuid(id);

  const user = useAsyncData(() => (isValidId ? getUser(id) : Promise.resolve(null)), [id]);
  const timesheets = useAsyncData(() => (isValidId ? listUserTimesheets(id) : Promise.resolve([])), [id]);
  const canReadAudit = hasPermission('AUDIT_READ');
  const activity = useAsyncData(
    () => (isValidId && canReadAudit ? listUserActivity(id) : Promise.resolve([])),
    [id, canReadAudit]
  );
  const referenceData = useAsyncData(() => Promise.all([listDepartments(), listRoles()]), []);
  const [departments, roles] = referenceData.data ?? [[], []];

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isRoleOpen, setIsRoleOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);

  if (user.isLoading && !user.data) return <LoadingState label="A carregar utilizador..." />;
  if (user.error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={user.error} onRetry={user.reload} />
      </div>
    );
  }
  if (!user.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title="Utilizador não encontrado." message="O utilizador não existe ou não tem permissão para o consultar." />
      </div>
    );
  }

  const profile = user.data;
  const isCurrentUser = profile.id === currentUser?.id;
  const canAssignAdmin = hasPermission('ADMIN_ACCESS');

  const handleSaved = (message: string) => {
    setIsEditOpen(false);
    setIsRoleOpen(false);
    setIsStatusOpen(false);
    setSuccessMessage(message);
    user.reload();
    activity.reload();
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={profile.full_name}
        subtitle={`${profile.employee_number ?? ''} · ${profile.job_title ?? 'Sem cargo definido'}`}
        actions={
          <>
            {hasPermission('USERS_UPDATE') && (
              <Button variant="secondary" icon={Pencil} onClick={() => setIsEditOpen(true)} disabled={!referenceData.data}>
                Editar
              </Button>
            )}
            {hasPermission('USERS_ASSIGN_ROLE') && (
              <Button variant="secondary" icon={Shield} onClick={() => setIsRoleOpen(true)} disabled={!referenceData.data}>
                Perfil de acesso
              </Button>
            )}
            {hasPermission('USERS_DISABLE') && !isCurrentUser && (
              <Button
                variant={profile.is_active ? 'danger' : 'primary'}
                icon={profile.is_active ? UserX : UserCheck}
                onClick={() => setIsStatusOpen(true)}
              >
                {profile.is_active ? 'Desativar' : 'Ativar'}
              </Button>
            )}
          </>
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {!profile.is_active && (
        <Alert variant="warning">Esta conta está desativada e não consegue aceder ao sistema.</Alert>
      )}

      <Panel>
        <div className="mb-5 flex items-center gap-4">
          <UserAvatar name={profile.full_name} size="lg" />
          <div>
            <p className="text-base font-semibold text-text">{profile.full_name}</p>
            <p className="text-sm text-text-secondary">{profile.email}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={profile.is_active ? 'ACTIVE' : 'INACTIVE'} />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
          <DetailItem label="Perfil de acesso">{profile.role?.name ?? 'Sem perfil'}</DetailItem>
          <DetailItem label="Departamento">{profile.department?.name ?? 'Sem departamento'}</DetailItem>
          <DetailItem label="Cargo / função">{profile.job_title ?? '—'}</DetailItem>
          <DetailItem label="Telefone">{profile.phone ?? '—'}</DetailItem>
          <DetailItem label="Criado em">{formatDate(profile.created_at)}</DetailItem>
          <DetailItem label="Último acesso">{formatDateTime(profile.last_login_at, 'Nunca acedeu')}</DetailItem>
        </dl>
      </Panel>

      {profile.role?.code === 'MANAGER' && (
        <ManagerScopePanel manager={profile} departments={departments} canManage={hasPermission('USERS_UPDATE')} />
      )}

      <Panel title="Timesheets" description="Períodos registados por este colaborador." flush>
        {timesheets.error && (
          <div className="p-4">
            <ErrorState message={timesheets.error} onRetry={timesheets.reload} />
          </div>
        )}
        {timesheets.isLoading && !timesheets.data && <LoadingState />}
        {timesheets.data?.length === 0 && <EmptyState bordered={false} title="Nenhum timesheet registado." />}
        {timesheets.data && timesheets.data.length > 0 && (
          <DataTable
            caption={`Timesheets de ${profile.full_name}`}
            columns={TIMESHEET_COLUMNS}
            rows={timesheets.data}
            getRowKey={(timesheet) => timesheet.id}
          />
        )}
      </Panel>

      {canReadAudit && (
        <Panel title="Atividade recente" description="Ações realizadas por este utilizador ou sobre a sua conta." flush>
          {activity.error && (
            <div className="p-4">
              <ErrorState message={activity.error} onRetry={activity.reload} />
            </div>
          )}
          {activity.isLoading && !activity.data && <LoadingState />}
          {activity.data?.length === 0 && (
            <EmptyState bordered={false} icon={FileClock} title="Sem atividade registada." />
          )}
          {activity.data && activity.data.length > 0 && (
            <ul className="divide-y divide-border">
              {activity.data.map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <p className="text-sm text-text">{event.description}</p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    <span className="font-mono">{event.action}</span> · {formatDateTime(event.created_at)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      )}

      <UserFormModal
        isOpen={isEditOpen}
        user={profile}
        departments={departments}
        roles={roles}
        canAssignAdmin={canAssignAdmin}
        onClose={() => setIsEditOpen(false)}
        onSaved={handleSaved}
      />
      <RoleAssignModal
        user={isRoleOpen ? profile : null}
        roles={roles}
        canAssignAdmin={canAssignAdmin}
        onClose={() => setIsRoleOpen(false)}
        onSaved={handleSaved}
      />
      <UserStatusDialog user={isStatusOpen ? profile : null} onClose={() => setIsStatusOpen(false)} onSaved={handleSaved} />
    </div>
  );
};
