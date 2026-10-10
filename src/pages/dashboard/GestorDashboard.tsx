import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ClipboardList, Plus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyScopes } from '../../services/managerService';
import { getTeamDashboard } from '../../services/work/teamService';
import { getTeamWorkOverview, listWorkPeople } from '../../services/work/calendarService';
import type { TeamMemberWorkload } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { OverdueBadge } from '../../components/work/WorkStatusBadge';
import { TaskFormModal } from '../../components/work/TaskFormModal';
import {
  AttentionPanel,
  MyTasksPanel,
  PanelLink,
  PipelinePanel,
  RecentActivityPanel,
  ReportSummaryPanel,
  UpcomingMeetingsPanel,
} from '../../components/work/DashboardPanels';
import { recentPeriod } from '../../utils/work';
import { formatMinutesAsHours, pluralize } from '../../utils/format';

const PERIOD_DAYS = 30;
const TREND_DAYS = 56;

/** Equipa: quem é, o que faz e o que tem em mãos. */
const TeamPanel: React.FC<{ members: TeamMemberWorkload[] }> = ({ members }) => (
  <Panel title="A minha equipa" actions={<PanelLink to="/team">Ver equipa</PanelLink>} flush>
    {members.length === 0 ? (
      <EmptyState bordered={false} icon={Users} title="Ainda não tem colaboradores no seu âmbito." message="A equipa é atribuída pela administração." />
    ) : (
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.profileId}>
            <Link to={`/team/${member.profileId}`} className="flex flex-col gap-2 px-5 py-3 hover:bg-background sm:flex-row sm:items-start sm:justify-between">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">{member.fullName}</span>
                <span className="block text-xs text-text-secondary">
                  {[member.jobTitle ?? 'Cargo por definir', member.departmentName].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs text-text-muted">
                  {member.jobDescription ?? 'Descrição da função por preencher.'}
                </span>
              </span>
              <span className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-text-secondary">
                <span>{pluralize(member.tasksOpen, 'tarefa em aberto', 'tarefas em aberto')}</span>
                {member.tasksOverdue > 0 && <OverdueBadge label={`${member.tasksOverdue} em atraso`} />}
                {member.absenceToday && <span className="rounded bg-warning-soft px-1.5 py-0.5 text-warning">Ausente: {member.absenceToday}</span>}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    )}
  </Panel>
);

/** Painel diário do gestor da equipa. Todos os números vêm do servidor e respeitam o âmbito. */
export const GestorDashboard: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const canCreateTask = hasPermission('TIMESHEET_TASK_CREATE');
  const [isTaskFormOpen, setIsTaskFormOpen] = useState(false);

  const period = useMemo(() => recentPeriod(PERIOD_DAYS, new Date()), []);
  const trendFilters = useMemo(() => ({ ...recentPeriod(TREND_DAYS, new Date()), departmentId: null, leadId: null }), []);

  const scopes = useAsyncData(() => listMyScopes(viewerId), [viewerId]);
  const dashboard = useAsyncData(() => getTeamDashboard(period.from, period.to), [period.from, period.to]);
  const team = useAsyncData(getTeamWorkOverview, []);
  const assignees = useAsyncData(() => (canCreateTask ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), [canCreateTask]);

  if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
  if (!dashboard.data) return <LoadingState label="A carregar o painel da equipa..." />;
  const summary = dashboard.data;
  const members = team.data ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Painel da equipa"
        subtitle="O trabalho da sua equipa hoje: execução, prazos, pedidos e o que precisa da sua atenção."
        actions={
          canCreateTask && (
            <Button icon={Plus} onClick={() => setIsTaskFormOpen(true)} disabled={!assignees.data}>
              Atribuir tarefa
            </Button>
          )
        }
      />

      {scopes.data && scopes.data.length === 0 && (
        <Alert variant="warning" title="Sem equipa atribuída">
          Ainda não lhe foi atribuído nenhum departamento ou colaborador. Contacte a administração.
        </Alert>
      )}
      {scopes.data && scopes.data.length > 0 && (
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text">Equipa:</span>{' '}
          {scopes.data.map((scope) => (scope.departmentName ? `Departamento ${scope.departmentName}` : scope.employeeName ?? '—')).join(' · ')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Colaboradores" value={summary.teamSize} supporting={`${formatMinutesAsHours(summary.minutesLogged)} registadas em ${PERIOD_DAYS} dias`} icon={Users} />
        <StatCard label="Em curso" value={summary.tasksInProgress} supporting={pluralize(summary.tasksBlocked, 'bloqueada', 'bloqueadas')} icon={ClipboardList} />
        <StatCard label="Em atraso" value={summary.tasksOverdue} supporting="Prazo ultrapassado e por concluir" icon={AlertCircle} />
        <StatCard
          label={`Concluídas (${PERIOD_DAYS} dias)`}
          value={summary.tasksCompleted}
          supporting={pluralize(summary.tasksCompletedLate, 'com atraso', 'com atraso')}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {team.error ? <ErrorState message={team.error} onRetry={team.reload} /> : team.data ? <TeamPanel members={members} /> : <LoadingState label="A carregar a equipa..." />}
          <MyTasksPanel viewerId={viewerId} />
        </div>
        <div className="space-y-6">
          <AttentionPanel
            title="Precisa da sua atenção"
            items={[
              { label: 'Tarefas bloqueadas', count: summary.tasksBlocked, to: '/timesheet/tasks?scope=TEAM&status=BLOCKED', hint: 'Impedimentos a resolver', tone: 'danger' },
              { label: 'Conclusões por acompanhar', count: summary.tasksPendingFollowUp, to: '/timesheet/tasks?scope=FOLLOW_UP', hint: 'Concluídas e ainda não validadas', tone: 'warning' },
              { label: 'Ausências por validar', count: summary.absencesToValidate, to: '/timesheet/absences?tab=TEAM', hint: 'Pedidos da equipa a aguardar a sua validação', tone: 'warning' },
              { label: 'Ausências no Manager', count: summary.absencesAwaitingDecision, to: '/timesheet/absences?tab=TEAM', hint: 'Validadas, a aguardar a decisão do Manager' },
              { label: 'Oportunidades por aprovar', count: summary.opportunityApprovalsPending, to: '/timesheet/approvals', hint: 'Pedidos enviados ao Manager' },
            ]}
          />
          <UpcomingMeetingsPanel viewerId={viewerId} />
          <PipelinePanel />
        </div>
      </div>

      <ReportSummaryPanel filters={trendFilters} members={members} />
      <RecentActivityPanel />

      <TaskFormModal
        isOpen={isTaskFormOpen}
        task={null}
        assignees={assignees.data ?? []}
        canRequestManagerReview={hasPermission('TIMESHEET_TASK_ASSIGN') && !hasPermission('TEAM_SUPERVISE')}
        onClose={() => setIsTaskFormOpen(false)}
        onSaved={(taskId) => {
          setIsTaskFormOpen(false);
          navigate(`/timesheet/tasks/${taskId}`);
        }}
      />
    </div>
  );
};
