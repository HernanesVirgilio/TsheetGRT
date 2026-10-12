import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CalendarDays, ListTodo } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyOpenTasks } from '../../services/work/taskService';
import { listMeetings } from '../../services/work/meetingService';
import { getCompletionTrend, getOpportunityPipeline, listRecentTeamActivity } from '../../services/work/teamService';
import type { ReportFilters } from '../../services/work/teamService';
import type { TeamMemberWorkload } from '../../types/work';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, LoadingState } from '../ui/States';
import { OverdueBadge, WorkStatusBadge } from './WorkStatusBadge';
import { StackedBarChart, StackedColumnChart } from '../charts/StackedCharts';
import { compareTasksForToday, describeWorkEvent, formatMoney, isTaskOverdue } from '../../utils/work';
import { formatCalendarDate, formatDateTime, formatMinutesAsHours } from '../../utils/format';
import { t } from '../../lib/i18n';

export const PanelLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-hover hover:underline">
    {children}
    <ArrowRight className="h-4 w-4" aria-hidden="true" />
  </Link>
);

export interface AttentionItem {
  label: string;
  count: number;
  to: string;
  /** Explica o que a contagem significa (ex.: "aguardam a decisão do Manager"). */
  hint: string;
  tone?: 'danger' | 'warning' | 'neutral';
}

/** Lista curta do que precisa de ação, com ligação direta ao trabalho. Zeros são mostrados como estão. */
export const AttentionPanel: React.FC<{ title: string; items: AttentionItem[] }> = ({ title, items }) => (
  <Panel title={title} flush>
    <ul className="divide-y divide-border">
      {items.map((item) => (
        <li key={item.label}>
          <Link to={item.to} className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-background">
            <span className="min-w-0">
              <span className="block text-sm font-medium text-text">{item.label}</span>
              <span className="block text-xs text-text-muted">{item.hint}</span>
            </span>
            <span
              className={`min-w-8 rounded px-2 py-0.5 text-center text-sm font-semibold tabular-nums ${
                item.count === 0
                  ? 'text-text-muted'
                  : item.tone === 'danger'
                    ? 'bg-danger-soft text-danger'
                    : item.tone === 'warning'
                      ? 'bg-warning-soft text-warning'
                      : 'bg-surface-muted text-text'
              }`}
            >
              {item.count}
            </span>
          </Link>
        </li>
      ))}
    </ul>
  </Panel>
);

/** Tarefas em aberto atribuídas ao próprio (incluindo as que criou para si). */
export const MyTasksPanel: React.FC<{ viewerId: string }> = ({ viewerId }) => {
  const tasks = useAsyncData(() => listMyOpenTasks(viewerId), [viewerId]);
  const now = new Date();
  const ordered = [...(tasks.data ?? [])].sort((first, second) => compareTasksForToday(first, second, now)).slice(0, 5);
  return (
    <Panel title={t('Tarefas atribuídas a si')} actions={<PanelLink to="/timesheet/tasks">{t('Ver todas')}</PanelLink>} flush>
      {tasks.error && <p className="px-5 py-4 text-sm text-danger">{tasks.error}</p>}
      {tasks.isLoading && !tasks.data && <LoadingState label={t('A carregar tarefas...')} />}
      {tasks.data && ordered.length === 0 && <EmptyState bordered={false} icon={ListTodo} title={t('Não tem tarefas em aberto.')} />}
      {ordered.length > 0 && (
        <ul className="divide-y divide-border">
          {ordered.map((task) => (
            <li key={task.id}>
              <Link to={`/timesheet/tasks/${task.id}`} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 hover:bg-background">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium text-text">
                    {task.reference} · {task.title}
                  </span>
                  <span className="block text-xs text-text-muted">
                    {t('Prazo: {date}', { date: formatDateTime(task.dueAt, t('sem prazo')) })}
                    {task.createdBy !== viewerId && task.creatorName ? ` · pedida por ${task.creatorName}` : ''}
                  </span>
                </span>
                <span className="flex gap-1">
                  <WorkStatusBadge kind="task" status={task.status} />
                  {isTaskOverdue(task, now) && <OverdueBadge />}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

export const UpcomingMeetingsPanel: React.FC<{ viewerId: string }> = ({ viewerId }) => {
  const meetings = useAsyncData(
    () => listMeetings({ scope: 'MINE', viewerId, when: 'UPCOMING', status: null, search: '', page: 1, pageSize: 5 }),
    [viewerId]
  );
  const items = (meetings.data?.items ?? []).filter((meeting) => meeting.status !== 'CANCELLED');
  return (
    <Panel title={t('Próximas reuniões')} actions={<PanelLink to="/timesheet/calendar">{t('Calendário')}</PanelLink>} flush>
      {meetings.error && <p className="px-5 py-4 text-sm text-danger">{meetings.error}</p>}
      {meetings.isLoading && !meetings.data && <LoadingState label={t('A carregar reuniões...')} />}
      {meetings.data && items.length === 0 && <EmptyState bordered={false} icon={CalendarDays} title={t('Sem reuniões agendadas.')} />}
      {items.length > 0 && (
        <ul className="divide-y divide-border">
          {items.map((meeting) => (
            <li key={meeting.id}>
              <Link to={`/timesheet/meetings/${meeting.id}`} className="block px-5 py-3 hover:bg-background">
                <span className="block truncate text-sm font-medium text-text">{meeting.title}</span>
                <span className="block text-xs text-text-muted">
                  {formatDateTime(meeting.startsAt)}
                  {meeting.organizerId !== viewerId && meeting.organizerName ? ` · organizada por ${meeting.organizerName}` : ''}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

/** Oportunidades da equipa por moeda (nunca somadas entre moedas). */
export const PipelinePanel: React.FC = () => {
  const pipeline = useAsyncData(getOpportunityPipeline, []);
  const rows = (pipeline.data ?? []).filter((row) => row.opportunitiesActive > 0 || row.approvalsPending > 0 || row.wonLast90Days > 0);
  return (
    <Panel title={t('Oportunidades da equipa')} actions={<PanelLink to="/timesheet/opportunities">{t('Ver oportunidades')}</PanelLink>} flush>
      {pipeline.error && <p className="px-5 py-4 text-sm text-danger">{pipeline.error}</p>}
      {pipeline.isLoading && !pipeline.data && <LoadingState label={t('A carregar oportunidades...')} />}
      {pipeline.data && rows.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">{t('Sem oportunidades em curso na equipa.')}</p>}
      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <caption className="sr-only">{t('Oportunidades da equipa por moeda')}</caption>
            <thead>
              <tr className="border-b border-border text-xs text-text-muted">
                <th scope="col" className="px-5 py-2 font-semibold">{t('Moeda')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Em curso')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Valor estimado')}</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">{t('Ponderado')}</th>
                <th scope="col" className="px-5 py-2 text-right font-semibold">{t('Por aprovar')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((row) => (
                <tr key={row.currency}>
                  <th scope="row" className="px-5 py-2 font-semibold text-text">{row.currency}</th>
                  <td className="px-3 py-2 text-right tabular-nums">{row.opportunitiesActive}</td>
                  <td className="px-3 py-2 text-right tabular-nums">{formatMoney(row.estimatedValueActive, row.currency)}</td>
                  <td className="px-3 py-2 text-right tabular-nums text-text-secondary">{formatMoney(row.weightedValueActive, row.currency)}</td>
                  <td className="px-5 py-2 text-right tabular-nums">{row.approvalsPending}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-5 pb-3 pt-2 text-xs text-text-muted">{t('Ponderado = valor estimado × probabilidade. Cada moeda é somada à parte.')}</p>
        </div>
      )}
    </Panel>
  );
};

export const RecentActivityPanel: React.FC = () => {
  const activity = useAsyncData(() => listRecentTeamActivity(8), []);
  return (
    <Panel title={t('Atividade recente')} flush>
      {activity.error && <p className="px-5 py-4 text-sm text-danger">{activity.error}</p>}
      {activity.isLoading && !activity.data && <LoadingState label={t('A carregar atividade...')} />}
      {activity.data && activity.data.length === 0 && <p className="px-5 py-4 text-sm text-text-secondary">{t('Sem atividade registada.')}</p>}
      {activity.data && activity.data.length > 0 && (
        <ul className="divide-y divide-border">
          {activity.data.map((item) => (
            <li key={item.id}>
              <Link to={`/timesheet/tasks/${item.taskId}`} className="block px-5 py-2.5 hover:bg-background">
                <span className="block truncate text-sm text-text">
                  <span className="font-medium">{describeWorkEvent(item)}</span> · {item.taskReference} {item.taskTitle}
                </span>
                <span className="block text-xs text-text-muted">
                  {item.actorName ?? 'Sistema'} · {formatDateTime(item.createdAt)}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
};

const COMPLETION_SERIES: [{ label: string; swatchClass: string }, { label: string; swatchClass: string }] = [
  { label: 'Concluídas no prazo', swatchClass: 'bg-chart-1' },
  { label: 'Concluídas com atraso', swatchClass: 'bg-chart-2' },
];

const WORKLOAD_SERIES: [{ label: string; swatchClass: string }, { label: string; swatchClass: string }] = [
  { label: 'Em aberto, no prazo', swatchClass: 'bg-chart-1' },
  { label: 'Em atraso', swatchClass: 'bg-chart-2' },
];

const HOURS_SERIES: [{ label: string; swatchClass: string }] = [{ label: 'Horas registadas', swatchClass: 'bg-chart-1' }];

const weekLabel = (weekStart: string) => formatCalendarDate(weekStart).slice(0, 5);

/** Resumo pequeno dos relatórios: evolução semanal e distribuição do trabalho. A análise completa fica na página própria. */
export const ReportSummaryPanel: React.FC<{ filters: ReportFilters; members: TeamMemberWorkload[]; groupLabel?: string }> = ({
  filters,
  members,
  groupLabel = 'colaborador',
}) => {
  const trend = useAsyncData(() => getCompletionTrend(filters), [filters.from, filters.to, filters.departmentId, filters.leadId]);
  const workloadRows = [...members]
    .sort((first, second) => second.tasksOpen - first.tasksOpen)
    .map((member) => ({
      id: member.profileId,
      label: member.fullName,
      values: [Math.max(0, member.tasksOpen - member.tasksOverdue), member.tasksOverdue],
      detail: t('{minutesThisWeek} registadas esta semana', { minutesThisWeek: formatMinutesAsHours(member.minutesThisWeek) }),
    }));
  return (
    <Panel title={t('Relatórios')} description={t('Resumo do período; a análise detalhada está na página de relatórios.')} actions={<PanelLink to="/reports?tab=team">{t('Abrir relatórios')}</PanelLink>}>
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="space-y-6">
          {trend.error && <ErrorState message={trend.error} onRetry={trend.reload} />}
          {trend.isLoading && !trend.data && <LoadingState label={t('A carregar evolução...')} />}
          {trend.data && (
            <StackedColumnChart
              title={t('Tarefas concluídas por semana')}
              series={COMPLETION_SERIES}
              rows={trend.data.map((point) => ({
                id: point.weekStart,
                label: weekLabel(point.weekStart),
                values: [Math.max(0, point.tasksCompleted - point.tasksCompletedLate), point.tasksCompletedLate],
                detail: t('Semana de {weekStart} · {minutesLogged} registadas', { weekStart: formatCalendarDate(point.weekStart), minutesLogged: formatMinutesAsHours(point.minutesLogged) }),
              }))}
              emptyMessage={t('Nenhuma tarefa concluída no período.')}
            />
          )}
          {/* Mesma série semanal (já carregada): o esforço registado ajuda a ler a evolução das conclusões. */}
          {trend.data && (
            <StackedColumnChart
              title={t('Horas registadas por semana')}
              series={HOURS_SERIES}
              rows={trend.data.map((point) => ({
                id: point.weekStart,
                label: weekLabel(point.weekStart),
                values: [point.minutesLogged],
                detail: t('Semana de {weekStart}', { weekStart: formatCalendarDate(point.weekStart) }),
              }))}
              formatValue={formatMinutesAsHours}
              emptyMessage={t('Sem tempo registado no período.')}
            />
          )}
        </div>
        <StackedBarChart
          title={t('Trabalho em aberto por {groupLabel}', { groupLabel })}
          series={WORKLOAD_SERIES}
          rows={workloadRows}
          maxRows={8}
          emptyMessage={t('A equipa não tem tarefas em aberto.')}
        />
      </div>
    </Panel>
  );
};
