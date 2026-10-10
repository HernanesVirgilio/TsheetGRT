import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Pencil } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTeamMember, listTeamTimesheets } from '../../services/managerService';
import { getTeamWorkOverview } from '../../services/work/calendarService';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { OverdueBadge } from '../../components/work/WorkStatusBadge';
import { JobDescriptionModal } from '../../components/work/JobDescriptionModal';
import type { TimesheetSummary } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { StatCard } from '../../components/ui/StatCard';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { formatCalendarDate, formatDate, formatMinutesAsHours, formatPeriod } from '../../utils/format';
import { summarizeTimesheets } from '../../utils/timesheets';
import { isUuid } from '../../utils/validation';

const COLUMNS: DataTableColumn<TimesheetSummary>[] = [
  {
    id: 'period',
    header: 'Período',
    render: (timesheet) => (
      <Link to={`/approvals/${timesheet.id}`} className="font-semibold text-primary-hover hover:underline">
        {formatPeriod(timesheet.periodStart, timesheet.periodEnd)}
      </Link>
    ),
  },
  { id: 'status', header: 'Estado', render: (timesheet) => <StatusBadge status={timesheet.status} size="sm" /> },
  { id: 'hours', header: 'Horas', render: (timesheet) => formatMinutesAsHours(timesheet.totalMinutes) },
  { id: 'submitted', header: 'Submetido', render: (timesheet) => formatDate(timesheet.submittedAt) },
  {
    id: 'decision',
    header: 'Decisão',
    render: (timesheet) =>
      timesheet.status === 'APPROVED'
        ? `Aprovado em ${formatDate(timesheet.approvedAt)}`
        : timesheet.status === 'REJECTED'
          ? `Rejeitado em ${formatDate(timesheet.rejectedAt)}`
          : '—',
  },
];

const BackLink: React.FC = () => (
  <Link to="/team" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    Voltar à equipa
  </Link>
);

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

/**
 * Detalhe de um colaborador da equipa: cargo, descrição da função e trabalho em mãos. Os dados
 * administrativos são geridos pelo Admin; a descrição da função pode ser atualizada por quem tem
 * TEAM_JOB_DESCRIPTION_UPDATE (não altera perfis técnicos nem permissões).
 */
export const TeamMemberPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canEditDescription = hasPermission('TEAM_JOB_DESCRIPTION_UPDATE') || hasPermission('USERS_UPDATE');
  const [isEditing, setIsEditing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const isValidId = isUuid(id);
  const member = useAsyncData(() => (isValidId ? getTeamMember(id) : Promise.resolve(null)), [id]);
  const workload = useAsyncData(getTeamWorkOverview, []);
  const timesheets = useAsyncData(
    () =>
      isValidId
        ? listTeamTimesheets({ status: null, employeeId: id, periodFrom: null, periodTo: null })
        : Promise.resolve([]),
    [id]
  );

  if (member.isLoading && !member.data) return <LoadingState label="A carregar colaborador..." />;
  if (member.error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={member.error} onRetry={member.reload} />
      </div>
    );
  }
  if (!member.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title="Colaborador não encontrado." message="O colaborador não existe ou não pertence ao seu âmbito de gestão." />
      </div>
    );
  }

  const profile = member.data;
  const totals = summarizeTimesheets(timesheets.data ?? []);
  const work = (workload.data ?? []).find((row) => row.profileId === profile.id) ?? null;

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader title={profile.full_name} subtitle={`${profile.employee_number ?? ''} · ${profile.job_title ?? 'Sem cargo definido'}`} />
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Panel>
        <div className="mb-5 flex items-center gap-4">
          <UserAvatar name={profile.full_name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text">{profile.full_name}</p>
            <p className="truncate text-sm text-text-secondary">{profile.email}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={profile.is_active ? 'ACTIVE' : 'INACTIVE'} />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="Departamento">{profile.department?.name ?? 'Sem departamento'}</DetailItem>
          <DetailItem label="Cargo">{profile.job_title ?? '—'}</DetailItem>
          <DetailItem label="Telefone">{profile.phone ?? '—'}</DetailItem>
          <DetailItem label="Nº de colaborador">{profile.employee_number ?? '—'}</DetailItem>
        </dl>
      </Panel>

      <Panel
        title="Descrição da função"
        description="O que esta pessoa faz e que responsabilidades pode receber. Não altera o perfil de acesso."
        actions={
          canEditDescription && (
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setIsEditing(true)}>
              {profile.job_description ? 'Atualizar' : 'Preencher'}
            </Button>
          )
        }
      >
        <p className="whitespace-pre-line text-sm text-text-secondary">{profile.job_description ?? 'Descrição da função por preencher.'}</p>
      </Panel>

      {work && (
        <Panel title="Trabalho em mãos">
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <DetailItem label="Tarefas em aberto">{work.tasksOpen}</DetailItem>
            <DetailItem label="Em curso">{work.tasksInProgress}</DetailItem>
            <DetailItem label="Bloqueadas">{work.tasksBlocked}</DetailItem>
            <DetailItem label="Atrasadas">{work.tasksOverdue > 0 ? <OverdueBadge label={String(work.tasksOverdue)} /> : 0}</DetailItem>
            <DetailItem label="Oportunidades ativas">{work.opportunitiesActive}</DetailItem>
            <DetailItem label="Concluídas (30 dias)">{work.tasksCompleted30Days}</DetailItem>
          </dl>
          <p className="mt-4 text-xs text-text-muted">
            {work.leadNames ? `Gestor da equipa: ${work.leadNames} · ` : ''}
            {work.absenceToday ? `Ausente hoje (${work.absenceToday}) · ` : 'Presente hoje · '}
            Último registo de tempo: {work.lastActivityDate ? formatCalendarDate(work.lastActivityDate) : 'sem registos'} · {formatMinutesAsHours(work.minutesThisWeek)} esta semana
          </p>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Horas aprovadas" value={formatMinutesAsHours(totals.approvedMinutes)} />
        <StatCard label="Horas por aprovar" value={formatMinutesAsHours(totals.pendingMinutes)} />
        <StatCard label="Timesheets rejeitados" value={totals.rejectedCount} />
      </div>

      <Panel title="Timesheets" description="Histórico de submissões e decisões deste colaborador." flush>
        {timesheets.error && (
          <div className="p-4">
            <ErrorState message={timesheets.error} onRetry={timesheets.reload} />
          </div>
        )}
        {timesheets.isLoading && !timesheets.data && <LoadingState />}
        {timesheets.data?.length === 0 && (
          <EmptyState bordered={false} icon={Clock3} title="Este colaborador ainda não tem timesheets." />
        )}
        {timesheets.data && timesheets.data.length > 0 && (
          <DataTable caption={`Timesheets de ${profile.full_name}`} columns={COLUMNS} rows={timesheets.data} getRowKey={(row) => row.id} />
        )}
      </Panel>

      <JobDescriptionModal
        isOpen={isEditing}
        profileId={profile.id}
        fullName={profile.full_name}
        currentDescription={profile.job_description ?? ''}
        onClose={() => setIsEditing(false)}
        onSaved={() => {
          setIsEditing(false);
          setMessage('Descrição da função atualizada. A alteração ficou registada na auditoria.');
          member.reload();
          workload.reload();
        }}
      />
    </div>
  );
};
