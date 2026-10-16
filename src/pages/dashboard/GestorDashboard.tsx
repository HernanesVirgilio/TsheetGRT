import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { AlertCircle, BarChart3, CheckCircle2, ClipboardList, Plus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyScopes } from '../../services/managerService';
import { getProjectTeamOverview, getTeamDashboard } from '../../services/work/teamService';
import { getTeamWorkOverview, listWorkPeople } from '../../services/work/calendarService';
import { listPendingMeetingRequests } from '../../services/work/meetingService';
import type { TeamMemberWorkload } from '../../types/work';
import { DashboardHeader } from '../../components/layout/DashboardHeader';
import { HeaderLink, ReviewApprovalsLink } from '../../components/work/ReviewApprovalsLink';
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
  ProjectTeamPanel,
  RecentActivityPanel,
  ReportSummaryPanel,
  UpcomingMeetingsPanel,
} from '../../components/work/DashboardPanels';
import { recentPeriod } from '../../utils/work';
import { formatMinutesAsHours, pluralize } from '../../utils/format';
import { t } from '../../lib/i18n';

const PERIOD_DAYS = 30;
const TREND_DAYS = 56;

/** Equipa: quem é, o que faz e o que tem em mãos. */
const TeamPanel: React.FC<{ members: TeamMemberWorkload[] }> = ({ members }) => (
  <Panel title={t('Equipa')} actions={<PanelLink to="/team">{t('Ver equipa')}</PanelLink>} flush>
    {members.length === 0 ? (
      <EmptyState
        bordered={false}
        icon={Users}
        title={t('Ainda não tem colaboradores na sua equipa nem nos projetos que coordena.')}
        message={t('A equipa formal é configurada pela administração; a equipa de um projeto define-se na respetiva oportunidade.')}
      />
    ) : (
      <ul className="divide-y divide-border">
        {members.map((member) => (
          <li key={member.profileId}>
            <Link to={`/team/${member.profileId}`} className="flex flex-col gap-2 px-5 py-3 hover:bg-background sm:flex-row sm:items-start sm:justify-between">
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-text">{member.fullName}</span>
                <span className="block text-xs text-text-secondary">
                  {[member.jobTitle ?? t('Cargo por definir'), member.departmentName].filter(Boolean).join(' · ')}
                </span>
                <span className="mt-1 line-clamp-2 block text-xs text-text-muted">
                  {member.jobDescription ?? t('Descrição da função por preencher.')}
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
  const projectTeam = useAsyncData(getProjectTeamOverview, []);
  const hasProjectTeam = (projectTeam.data?.length ?? 0) > 0;
  const meetingRequests = useAsyncData(() => listPendingMeetingRequests(viewerId), [viewerId]);
  const assignees = useAsyncData(() => (canCreateTask ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), [canCreateTask]);

  if (dashboard.error) return <ErrorState message={dashboard.error} kind={dashboard.errorKind} onRetry={dashboard.reload} />;
  if (!dashboard.data) return <LoadingState label={t('A carregar o painel da equipa...')} />;
  const summary = dashboard.data;
  const members = team.data ?? [];

  return (
    <div className="space-y-6">
      <DashboardHeader
        actions={
          <>
            {canCreateTask && (
              <Button variant="secondary" icon={Plus} onClick={() => setIsTaskFormOpen(true)} disabled={!assignees.data}>
                {t('Atribuir tarefa')}
              </Button>
            )}
            <HeaderLink to="/team" icon={Users}>
              {t('Ver equipa')}
            </HeaderLink>
            {hasPermission('REPORTS_READ') && (
              <HeaderLink to="/reports" icon={BarChart3}>
                {t('Relatórios')}
              </HeaderLink>
            )}
            <ReviewApprovalsLink />
          </>
        }
      />

      {/* A equipa de um projeto também conta: o aviso só aparece quando não há equipa formal nem de projeto. */}
      {scopes.data && scopes.data.length === 0 && projectTeam.data && !hasProjectTeam && (
        <Alert variant="info" title={t('Sem equipa formal nem equipas de projeto')}>
          {t('A equipa formal (departamentos ou colaboradores) é configurada pela administração. Quando for gestor de execução de um projeto, a equipa desse projeto aparece aqui.')}
        </Alert>
      )}
      {scopes.data && scopes.data.length > 0 && (
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text">{t('Equipa:')}</span>{' '}
          {scopes.data.map((scope) => (scope.departmentName ? t('Departamento {departmentName}', { departmentName: scope.departmentName }) : scope.employeeName ?? '—')).join(' · ')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Colaboradores')} value={summary.teamSize} supporting={t('{minutesLogged} registadas em {PERIOD_DAYS} dias', { minutesLogged: formatMinutesAsHours(summary.minutesLogged), PERIOD_DAYS })} icon={Users} />
        <StatCard label={t('Em curso')} value={summary.tasksInProgress} supporting={pluralize(summary.tasksBlocked, 'bloqueada', 'bloqueadas')} icon={ClipboardList} />
        <StatCard label={t('Em atraso')} value={summary.tasksOverdue} supporting={t('Prazo ultrapassado e por concluir')} icon={AlertCircle} />
        <StatCard
          label={t('Concluídas ({PERIOD_DAYS} dias)', { PERIOD_DAYS })}
          value={summary.tasksCompleted}
          supporting={pluralize(summary.tasksCompletedLate, 'com atraso', 'com atraso')}
          icon={CheckCircle2}
        />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          {team.error ? (
            <ErrorState message={team.error} kind={team.errorKind} onRetry={team.reload} />
          ) : team.data ? (
            // Sem equipa formal mas com projetos, mostra-se só a equipa de projeto (sem um painel vazio a mais).
            (members.length > 0 || !hasProjectTeam) && <TeamPanel members={members} />
          ) : (
            <LoadingState label={t('A carregar a equipa...')} />
          )}
          {projectTeam.error && <ErrorState message={projectTeam.error} onRetry={projectTeam.reload} />}
          {hasProjectTeam && projectTeam.data && <ProjectTeamPanel members={projectTeam.data} />}
          <MyTasksPanel viewerId={viewerId} />
        </div>
        <div className="space-y-6">
          <AttentionPanel
            title={t('Precisa da sua atenção')}
            items={[
              ...(meetingRequests.data && meetingRequests.data.length > 0
                ? [{ label: t('Pedidos de participação'), count: meetingRequests.data.length, to: '/approvals?tab=meetings', hint: t('Reuniões que pedem a sua participação'), tone: 'warning' as const }]
                : []),
              { label: t('Tarefas bloqueadas'), count: summary.tasksBlocked, to: '/timesheet/tasks?scope=TEAM&status=BLOCKED', hint: t('Impedimentos a resolver'), tone: 'danger' },
              { label: t('Conclusões por acompanhar'), count: summary.tasksPendingFollowUp, to: '/timesheet/tasks?scope=FOLLOW_UP', hint: t('Concluídas e ainda não validadas'), tone: 'warning' },
              { label: t('Ausências por validar'), count: summary.absencesToValidate, to: '/approvals?tab=absences', hint: t('Pedidos da equipa a aguardar a sua validação'), tone: 'warning' },
              { label: t('Ausências no Manager'), count: summary.absencesAwaitingDecision, to: '/approvals?tab=absences', hint: t('Validadas, a aguardar a decisão do Manager') },
              { label: t('Oportunidades por aprovar'), count: summary.opportunityApprovalsPending, to: '/approvals?tab=opportunities', hint: t('Pedidos enviados ao Manager') },
            ]}
          />
          {/* Uma falha nos pedidos de participação não pode passar por "nenhum pedido". */}
          {meetingRequests.error && <ErrorState message={meetingRequests.error} kind={meetingRequests.errorKind} onRetry={meetingRequests.reload} />}
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
