import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Clock3, Pencil, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTeamMember, listTeamTimesheets } from '../../services/managerService';
import { getTeamWorkOverview } from '../../services/work/calendarService';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { OverdueBadge } from '../../components/work/WorkStatusBadge';
import { JobDescriptionModal } from '../../components/work/JobDescriptionModal';
import type { TimesheetSummary } from '../../types';
import type { TeamMemberWorkload } from '../../types/work';
import { leadTeamMembers } from '../../utils/work';
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
import { t, translatedFields } from '../../lib/i18n';

const COLUMNS: DataTableColumn<TimesheetSummary>[] = translatedFields([
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
        ? t('Aprovado em {approvedAt}', { approvedAt: formatDate(timesheet.approvedAt) })
        : timesheet.status === 'REJECTED'
          ? t('Rejeitado em {rejectedAt}', { rejectedAt: formatDate(timesheet.rejectedAt) })
          : '—',
  },
], ['header']);

const LEAD_TEAM_COLUMNS: DataTableColumn<TeamMemberWorkload>[] = translatedFields([
  {
    id: 'name',
    header: 'Colaborador',
    render: (member) => (
      <Link to={`/team/${member.profileId}`} className="block hover:underline">
        <span className="block font-semibold text-text">{member.fullName}</span>
        <span className="block text-xs text-text-muted">{[member.jobTitle, member.departmentName].filter(Boolean).join(' · ') || '—'}</span>
      </Link>
    ),
  },
  { id: 'open', header: 'Em aberto', align: 'right', render: (member) => member.tasksOpen },
  { id: 'overdue', header: 'Atrasadas', align: 'right', render: (member) => (member.tasksOverdue > 0 ? <OverdueBadge label={String(member.tasksOverdue)} /> : 0) },
  { id: 'blocked', header: 'Bloqueadas', align: 'right', render: (member) => member.tasksBlocked },
  { id: 'completed', header: 'Concluídas (30 dias)', align: 'right', render: (member) => member.tasksCompleted30Days },
  { id: 'hours', header: 'Horas na semana', align: 'right', render: (member) => formatMinutesAsHours(member.minutesThisWeek) },
], ['header']);

const BackLink: React.FC = () => (
  <Link to="/team" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    {t('Voltar à equipa')}
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

  if (member.isLoading && !member.data) return <LoadingState label={t('A carregar colaborador...')} />;
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
        <EmptyState title={t('Colaborador não encontrado.')} message={t('O colaborador não existe ou não pertence ao seu âmbito de gestão.')} />
      </div>
    );
  }

  const profile = member.data;
  const totals = summarizeTimesheets(timesheets.data ?? []);
  const work = (workload.data ?? []).find((row) => row.profileId === profile.id) ?? null;
  // Um gestor supervisionado: a sua equipa, com os indicadores de cada pessoa (mesmo vazia, para se ver a lacuna).
  const leadTeam = work?.roleCode === 'GESTOR' ? leadTeamMembers(workload.data ?? [], { profileId: profile.id, fullName: profile.full_name }) : null;

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader title={profile.full_name} subtitle={`${profile.employee_number ?? ''} · ${profile.job_title ?? t('Sem cargo definido')}`} />
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
          <DetailItem label={t('Departamento')}>{profile.department?.name ?? t('Sem departamento')}</DetailItem>
          <DetailItem label={t('Cargo')}>{profile.job_title ?? '—'}</DetailItem>
          <DetailItem label={t('Telefone')}>{profile.phone ?? '—'}</DetailItem>
          <DetailItem label={t('Nº de colaborador')}>{profile.employee_number ?? '—'}</DetailItem>
        </dl>
      </Panel>

      <Panel
        title={t('Descrição da função')}
        description={t('O que esta pessoa faz e que responsabilidades pode receber. Não altera o perfil de acesso.')}
        actions={
          canEditDescription && (
            <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setIsEditing(true)}>
              {profile.job_description ? 'Atualizar' : 'Preencher'}
            </Button>
          )
        }
      >
        <p className="whitespace-pre-line text-sm text-text-secondary">{profile.job_description ?? t('Descrição da função por preencher.')}</p>
      </Panel>

      {work && (
        <Panel title={t('Trabalho em mãos')}>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
            <DetailItem label={t('Tarefas em aberto')}>{work.tasksOpen}</DetailItem>
            <DetailItem label={t('Em curso')}>{work.tasksInProgress}</DetailItem>
            <DetailItem label={t('Bloqueadas')}>{work.tasksBlocked}</DetailItem>
            <DetailItem label={t('Atrasadas')}>{work.tasksOverdue > 0 ? <OverdueBadge label={String(work.tasksOverdue)} /> : 0}</DetailItem>
            <DetailItem label={t('Oportunidades ativas')}>{work.opportunitiesActive}</DetailItem>
            <DetailItem label={t('Concluídas (30 dias)')}>{work.tasksCompleted30Days}</DetailItem>
          </dl>
          <p className="mt-4 text-xs text-text-muted">
            {work.leadNames ? t('Gestor da equipa: {leadNames} · ', { leadNames: work.leadNames }) : ''}
            {work.absenceToday ? t('Ausente hoje ({absenceToday}) · ', { absenceToday: work.absenceToday }) : t('Presente hoje · ')}
            Último registo de tempo: {work.lastActivityDate ? formatCalendarDate(work.lastActivityDate) : 'sem registos'} · {formatMinutesAsHours(work.minutesThisWeek)} esta semana
          </p>
        </Panel>
      )}

      {leadTeam && (
        <Panel title={t('Equipa deste gestor')} description={t('Colaboradores atribuídos a este gestor e o trabalho que têm em mãos.')} flush>
          {leadTeam.length === 0 ? (
            <EmptyState
              bordered={false}
              icon={Users}
              title={t('Este gestor ainda não tem colaboradores atribuídos.')}
              message={t('A atribuição de equipas é feita pela administração.')}
            />
          ) : (
            <DataTable caption={t('Equipa de {full_name}', { full_name: profile.full_name })} columns={LEAD_TEAM_COLUMNS} rows={leadTeam} getRowKey={(row) => row.profileId} />
          )}
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('Horas aprovadas')} value={formatMinutesAsHours(totals.approvedMinutes)} />
        <StatCard label={t('Horas por aprovar')} value={formatMinutesAsHours(totals.pendingMinutes)} />
        <StatCard label={t('Timesheets rejeitados')} value={totals.rejectedCount} />
      </div>

      <Panel title={t('Timesheets')} description={t('Histórico de submissões e decisões deste colaborador.')} flush>
        {timesheets.error && (
          <div className="p-4">
            <ErrorState message={timesheets.error} onRetry={timesheets.reload} />
          </div>
        )}
        {timesheets.isLoading && !timesheets.data && <LoadingState />}
        {timesheets.data?.length === 0 && (
          <EmptyState bordered={false} icon={Clock3} title={t('Este colaborador ainda não tem timesheets.')} />
        )}
        {timesheets.data && timesheets.data.length > 0 && (
          <DataTable caption={t('Timesheets de {full_name}', { full_name: profile.full_name })} columns={COLUMNS} rows={timesheets.data} getRowKey={(row) => row.id} />
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
          setMessage(t('Descrição da função atualizada. A alteração ficou registada na auditoria.'));
          member.reload();
          workload.reload();
        }}
      />
    </div>
  );
};
