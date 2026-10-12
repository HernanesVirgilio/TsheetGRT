import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarPlus, Clock3, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCalendarItems, getMyWorkSummary } from '../../services/work/calendarService';
import { listMyOpenTasks } from '../../services/work/taskService';
import { listWorkLog } from '../../services/work/workLogService';
import { listMyTimesheets } from '../../services/timesheetService';
import { listMyAbsences } from '../../services/work/absenceService';
import type { CalendarItem } from '../../types/work';
import type { TimesheetSummary } from '../../types';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { OverdueBadge, WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import { DashboardHeader } from '../../components/layout/DashboardHeader';
import { HeaderLink } from '../../components/work/ReviewApprovalsLink';
import { addDays, CALENDAR_ITEM_LABELS, compareTasksForToday, isSameDay, isTaskOverdue, itemOccursOn, toDateInput } from '../../utils/work';
import { formatDate, formatDateTime, formatMinutesAsHours, formatPeriod, dateTimeFormatter } from '../../utils/format';
import { t } from '../../lib/i18n';

const timeFormatter = () => dateTimeFormatter({ hour: '2-digit', minute: '2-digit' });
const DECISION_WINDOW_DAYS = 30;

function itemLink(item: CalendarItem): string {
  if (item.itemType === 'MEETING') return `/timesheet/meetings/${item.itemId}`;
  if (item.itemType === 'DEADLINE' || item.itemType === 'TASK') return `/timesheet/tasks/${item.itemId}`;
  if (item.itemType === 'OPPORTUNITY_ACTIVITY') return `/timesheet/opportunities/${item.itemId}`;
  if (item.itemType === 'ABSENCE') return '/timesheet/absences';
  return '/timesheet/calendar';
}

/** Timesheet do período em curso; sem ele, o mais recente (para mostrar o estado da submissão). */
export function currentTimesheet(timesheets: TimesheetSummary[], today: string): TimesheetSummary | null {
  return timesheets.find((timesheet) => timesheet.periodStart <= today && timesheet.periodEnd >= today) ?? timesheets[0] ?? null;
}

interface Decision {
  id: string;
  to: string;
  title: string;
  detail: string;
  at: string;
  tone: 'positive' | 'negative';
}

async function loadWorkCenter(profileId: string, withCalendar: boolean, withTimesheets: boolean) {
  const today = new Date();
  const [summary, tasks, agenda, recent, timesheets, absences] = await Promise.all([
    getMyWorkSummary(),
    listMyOpenTasks(profileId),
    withCalendar ? getCalendarItems(toDateInput(today), toDateInput(addDays(today, 7)), 'ME') : Promise.resolve([]),
    listWorkLog({ employeeId: profileId, from: toDateInput(addDays(today, -7)), to: toDateInput(today), kind: null }),
    withTimesheets ? listMyTimesheets(profileId) : Promise.resolve([]),
    listMyAbsences(profileId),
  ]);
  return { summary, tasks, agenda, recent, timesheets, absences };
}

/**
 * Painel do colaborador: o que fazer agora (registar horas, tarefas, agenda), o estado do timesheet e as
 * decisões recentes. Cada item aparece uma vez; os detalhes estão nos módulos correspondentes.
 */
export const WorkCenterPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const profileId = currentUser?.id ?? '';
  const withCalendar = hasPermission('TIMESHEET_CALENDAR_READ');
  const withTimesheets = hasPermission('SELF_TIMESHEET_READ');
  const data = useAsyncData(() => loadWorkCenter(profileId, withCalendar, withTimesheets), [profileId, withCalendar, withTimesheets]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const now = new Date();
  const canLogTime = hasPermission('SELF_TIMESHEET_UPDATE');

  const header = (
    <DashboardHeader
      message={t('As suas tarefas, a sua agenda e o tempo registado.')}
      actions={
        <>
          {hasPermission('TIMESHEET_MEETING_CREATE') && (
            <HeaderLink to="/timesheet/meetings" icon={CalendarPlus}>
              {t('Agendar reunião')}
            </HeaderLink>
          )}
          {withTimesheets && (
            <HeaderLink to="/timesheets" icon={Clock3}>
              {t('Timesheet')}
            </HeaderLink>
          )}
          {canLogTime && (
            <Button icon={Plus} onClick={() => setIsLogOpen(true)}>
              {t('Registar horas')}
            </Button>
          )}
        </>
      }
    />
  );

  if (data.isLoading && !data.data) return <div className="space-y-6">{header}<LoadingState label={t('A preparar o seu dia...')} /></div>;
  if (!data.data) return <div className="space-y-6">{header}<ErrorState message={data.error ?? t('Sem dados.')} onRetry={data.reload} /></div>;

  const { summary, tasks, agenda, recent, timesheets, absences } = data.data;
  const today = toDateInput(now);
  const orderedTasks = [...tasks].sort((first, second) => compareTasksForToday(first, second, now));
  const todayAndTomorrow = [now, addDays(now, 1)].map((day) => ({
    day,
    items: agenda
      .filter((item) => item.itemType !== 'ACTIVITY' && itemOccursOn(item, day))
      .sort((first, second) => Number(second.allDay) - Number(first.allDay) || first.startsAt.localeCompare(second.startsAt)),
  }));
  const upcomingMeetings = agenda
    .filter((item) => item.itemType === 'MEETING' && item.status !== 'CANCELLED' && new Date(item.endsAt).getTime() > now.getTime())
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt));
  const timesheet = currentTimesheet(timesheets, today);
  const pendingTasks = summary.tasksAssigned + summary.tasksInProgress + summary.tasksBlocked;

  const since = addDays(now, -DECISION_WINDOW_DAYS).toISOString();
  const decisions: Decision[] = [
    ...timesheets.flatMap((item): Decision[] => {
      if (item.status === 'APPROVED' && item.approvedAt && item.approvedAt >= since) {
        return [{ id: item.id, to: `/timesheets/${item.id}`, title: t('Timesheet aprovado'), detail: formatPeriod(item.periodStart, item.periodEnd), at: item.approvedAt, tone: 'positive' }];
      }
      if (item.status === 'REJECTED' && item.rejectedAt && item.rejectedAt >= since) {
        return [{ id: item.id, to: `/timesheets/${item.id}`, title: t('Timesheet devolvido para correção'), detail: item.rejectionReason ?? formatPeriod(item.periodStart, item.periodEnd), at: item.rejectedAt, tone: 'negative' }];
      }
      return [];
    }),
    ...absences.flatMap((item): Decision[] =>
      (item.status === 'APPROVED' || item.status === 'REJECTED') && item.decidedAt && item.decidedAt >= since
        ? [
            {
              id: item.id,
              to: '/timesheet/absences',
              title: item.status === 'APPROVED' ? t('Ausência aprovada') : t('Ausência rejeitada'),
              detail: `${item.absenceTypeName} · ${formatPeriod(item.startDate, item.endDate)}${item.decisionComment ? ` · ${item.decisionComment}` : ''}`,
              at: item.decidedAt,
              tone: item.status === 'APPROVED' ? 'positive' : 'negative',
            },
          ]
        : []
    ),
  ].sort((first, second) => second.at.localeCompare(first.at));

  const indicators = [
    {
      label: t('Horas esta semana'),
      value: formatMinutesAsHours(summary.minutesThisWeek),
      hint: summary.absenceToday ? t('Hoje: dia de ausência') : t('Hoje {today} de {target}', { today: formatMinutesAsHours(summary.minutesToday), target: formatMinutesAsHours(summary.dailyTargetMinutes) }),
    },
    {
      label: t('Timesheet'),
      value: timesheet ? <StatusBadge status={timesheet.status} /> : '—',
      hint: timesheet ? formatPeriod(timesheet.periodStart, timesheet.periodEnd) : t('Ainda não criou um timesheet'),
      to: timesheet ? `/timesheets/${timesheet.id}` : '/timesheets',
    },
    {
      label: t('Tarefas pendentes'),
      value: String(pendingTasks),
      hint: summary.tasksOverdue > 0 ? t('{count} em atraso', { count: summary.tasksOverdue }) : t('Nenhuma em atraso'),
      danger: summary.tasksOverdue > 0,
      to: '/timesheet/tasks',
    },
    {
      label: t('Próximas reuniões'),
      value: String(upcomingMeetings.length),
      hint: upcomingMeetings[0] ? `${upcomingMeetings[0].title} · ${formatDateTime(upcomingMeetings[0].startsAt)}` : t('Nenhuma nos próximos 7 dias'),
      to: '/timesheet/meetings',
    },
  ];

  return (
    <div className="space-y-6">
      {header}
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {timesheet?.status === 'REJECTED' && (
        <Alert variant="error" title={t('Timesheet devolvido para correção')}>
          {timesheet.rejectionReason}{' '}
          <Link to={`/timesheets/${timesheet.id}`} className="font-semibold underline">
            {t('Corrigir e submeter')}
          </Link>
        </Alert>
      )}
      {summary.absenceToday && (
        <Alert variant="info" title={t('Hoje está ausente')}>
          {t('Ausência registada: {absence}. O dia não conta como horas por registar.', { absence: summary.absenceToday })}
        </Alert>
      )}
      {data.error && <ErrorState message={data.error} onRetry={data.reload} />}

      <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 xl:grid-cols-4">
        {indicators.map((item) => {
          const content = (
            <>
              <dt className="text-xs font-medium text-text-secondary">{item.label}</dt>
              <dd className={`mt-1 text-xl font-semibold tabular-nums ${item.danger ? 'text-danger' : 'text-text'}`}>{item.value}</dd>
              <dd className="mt-0.5 truncate text-xs text-text-muted">{item.hint}</dd>
            </>
          );
          return item.to ? (
            <Link key={item.label} to={item.to} className="block bg-surface px-4 py-3 hover:bg-primary-soft">
              {content}
            </Link>
          ) : (
            <div key={item.label} className="bg-surface px-4 py-3">
              {content}
            </div>
          );
        })}
      </dl>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel
            title={t('Tarefas')}
            description={t('Atrasadas primeiro, depois o prazo mais próximo.')}
            actions={
              <Link to="/timesheet/tasks" className="text-sm font-medium text-primary-hover hover:underline">
                {t('Ver todas')}
              </Link>
            }
            flush
          >
            {orderedTasks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">{t('Não tem tarefas em aberto.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {orderedTasks.slice(0, 8).map((task) => (
                  <li key={task.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link to={`/timesheet/tasks/${task.id}`} className="font-semibold text-text hover:underline">
                        {task.reference}
                      </Link>
                      <span className="ml-2 text-sm text-text-secondary">{task.title}</span>
                      <p className="mt-0.5 text-xs text-text-muted">{t('Prazo: {date}', { date: formatDateTime(task.dueAt, t('sem prazo')) })}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      {isTaskOverdue(task, now) && <OverdueBadge />}
                      <PriorityBadge priority={task.priority} />
                      <WorkStatusBadge kind="task" status={task.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t('Tempo registado recentemente')}
            actions={
              <Link to="/timesheet/activities" className="text-sm font-medium text-primary-hover hover:underline">
                {t('Ver atividades')}
              </Link>
            }
            flush
          >
            {recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">{t('Sem tempo registado nos últimos 7 dias.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {recent.slice(0, 6).map((entry) => (
                  <li key={entry.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-medium text-text">{entry.task?.reference ?? entry.meeting?.title ?? entry.opportunity?.reference ?? entry.activityName}</span>
                      <span className="ml-2 text-text-secondary">{entry.description}</span>
                    </span>
                    <span className="text-xs text-text-muted">
                      {formatDate(entry.workDate)} · {formatMinutesAsHours(entry.totalMinutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          {withCalendar && (
            <Panel
              title={t('Agenda')}
              actions={
                <Link to="/timesheet/calendar" className="text-sm font-medium text-primary-hover hover:underline">
                  {t('Calendário')}
                </Link>
              }
              flush
            >
              {todayAndTomorrow.map(({ day, items }) => (
                <div key={day.toISOString()} className="border-b border-border px-5 py-3 last:border-b-0">
                  <p className="text-sm font-semibold capitalize text-text">{isSameDay(day, now) ? t('Hoje') : t('Amanhã')}</p>
                  {items.length === 0 ? (
                    <p className="mt-1 text-sm text-text-muted">{t('Sem compromissos.')}</p>
                  ) : (
                    <ul className="mt-2 space-y-2">
                      {items.map((item) => (
                        <li key={`${item.itemType}-${item.itemId}`} className="flex gap-3 text-sm">
                          <span className="w-14 shrink-0 tabular-nums text-text-muted">{item.allDay ? t('Dia') : timeFormatter().format(new Date(item.startsAt))}</span>
                          <span className="min-w-0">
                            <Link to={itemLink(item)} className={`font-medium hover:underline ${item.isOverdue ? 'text-danger' : 'text-text'}`}>
                              {item.reference ? `${item.reference} · ` : ''}
                              {item.title}
                            </Link>
                            <span className="block text-xs text-text-muted">{CALENDAR_ITEM_LABELS[item.itemType]}</span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              ))}
            </Panel>
          )}

          <Panel title={t('Decisões recentes')} description={t('Últimos {days} dias', { days: DECISION_WINDOW_DAYS })} flush>
            {decisions.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">
                {summary.pendingAbsenceRequests > 0
                  ? t('Sem decisões recentes. {count} pedido(s) de ausência a aguardar decisão.', { count: summary.pendingAbsenceRequests })
                  : t('Sem decisões recentes sobre os seus pedidos.')}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {decisions.slice(0, 5).map((decision) => (
                  <li key={`${decision.to}-${decision.id}`}>
                    <Link to={decision.to} className="block px-5 py-3 hover:bg-background">
                      <span className={`block text-sm font-semibold ${decision.tone === 'negative' ? 'text-danger' : 'text-text'}`}>{decision.title}</span>
                      <span className="block truncate text-xs text-text-secondary">{decision.detail}</span>
                      <span className="block text-xs text-text-muted">{formatDateTime(decision.at)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <WorkLogFormModal
        isOpen={isLogOpen}
        employeeId={profileId}
        onClose={() => setIsLogOpen(false)}
        onSaved={() => {
          setIsLogOpen(false);
          setMessage(t('Horas registadas.'));
          data.reload();
        }}
      />
    </div>
  );
};
