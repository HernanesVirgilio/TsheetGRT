import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CalendarDays, Clock3, ListTodo, Plus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCalendarItems, getMyWorkSummary, getTeamWorkOverview } from '../../services/work/calendarService';
import { listMyOpenTasks } from '../../services/work/taskService';
import { listWorkLog } from '../../services/work/workLogService';
import type { CalendarItem } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { OverdueBadge, WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import { addDays, CALENDAR_ITEM_LABELS, compareTasksForToday, isSameDay, isTaskOverdue, itemOccursOn, toDateInput } from '../../utils/work';
import { formatDate, formatDateTime, formatMinutesAsHours } from '../../utils/format';

const dayFormatter = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormatter = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });

function itemLink(item: CalendarItem): string {
  if (item.itemType === 'MEETING') return `/timesheet/meetings/${item.itemId}`;
  if (item.itemType === 'DEADLINE' || item.itemType === 'TASK') return `/timesheet/tasks/${item.itemId}`;
  if (item.itemType === 'OPPORTUNITY_ACTIVITY') return `/timesheet/opportunities/${item.itemId}`;
  if (item.itemType === 'ABSENCE') return '/timesheet/absences';
  return '/timesheet/calendar';
}

async function loadWorkCenter(profileId: string, withTeam: boolean, withCalendar: boolean) {
  const today = new Date();
  const [summary, tasks, agenda, recent, team] = await Promise.all([
    getMyWorkSummary(),
    listMyOpenTasks(profileId),
    withCalendar ? getCalendarItems(toDateInput(today), toDateInput(addDays(today, 7)), 'ME') : Promise.resolve([]),
    listWorkLog({ employeeId: profileId, from: toDateInput(addDays(today, -7)), to: toDateInput(today), kind: null }),
    withTeam ? getTeamWorkOverview() : Promise.resolve(null),
  ]);
  return { summary, tasks, agenda, recent, team };
}

/** Centro de trabalho: o que fazer hoje, o que está atrasado, agenda, tempo registado e pedidos. */
export const WorkCenterPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const profileId = currentUser?.id ?? '';
  const withTeam = hasPermission('TEAM_READ');
  const withCalendar = hasPermission('TIMESHEET_CALENDAR_READ');
  const data = useAsyncData(() => loadWorkCenter(profileId, withTeam, withCalendar), [profileId, withTeam, withCalendar]);
  const [isLogOpen, setIsLogOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const now = new Date();
  const canLogTime = hasPermission('SELF_TIMESHEET_UPDATE');

  if (data.isLoading && !data.data) return <LoadingState label="A preparar o seu dia..." />;
  if (!data.data) return <ErrorState message={data.error ?? 'Sem dados.'} onRetry={data.reload} />;

  const { summary, tasks, agenda, recent, team } = data.data;
  const orderedTasks = [...tasks].sort((first, second) => compareTasksForToday(first, second, now));
  const todayAndTomorrow = [now, addDays(now, 1)].map((day) => ({
    day,
    items: agenda
      .filter((item) => item.itemType !== 'ACTIVITY' && itemOccursOn(item, day))
      .sort((first, second) => Number(second.allDay) - Number(first.allDay) || first.startsAt.localeCompare(second.startsAt)),
  }));
  const nextMeeting = agenda
    .filter((item) => item.itemType === 'MEETING' && item.status !== 'CANCELLED' && new Date(item.endsAt).getTime() > now.getTime())
    .sort((first, second) => first.startsAt.localeCompare(second.startsAt))[0];
  const remainingToday = Math.max(0, summary.dailyTargetMinutes - summary.minutesToday);
  const teamTotals = team
    ? {
        overdue: team.reduce((sum, member) => sum + member.tasksOverdue, 0),
        blocked: team.reduce((sum, member) => sum + member.tasksBlocked, 0),
        pendingAbsences: team.reduce((sum, member) => sum + member.pendingAbsenceRequests, 0),
        absentToday: team.filter((member) => member.absenceToday),
      }
    : null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Centro de trabalho"
        subtitle={`${dayFormatter.format(now)} · ${currentUser?.full_name ?? ''}`}
        actions={
          canLogTime && (
            <Button icon={Plus} onClick={() => setIsLogOpen(true)}>
              Registar atividade
            </Button>
          )
        }
      />
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {summary.absenceToday && (
        <Alert variant="info" title="Hoje está ausente">
          Ausência aprovada: {summary.absenceToday}. O dia não conta como horas por registar.
        </Alert>
      )}
      {data.error && <ErrorState message={data.error} onRetry={data.reload} />}

      <section aria-label="Resumo do dia" className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        <StatCard label="Em curso" value={summary.tasksInProgress} icon={ListTodo} supporting={`${summary.tasksAssigned} por iniciar · ${summary.tasksBlocked} bloqueada(s)`} />
        <StatCard label="Atrasadas" value={summary.tasksOverdue} icon={AlertTriangle} supporting="Prazo ultrapassado" />
        <StatCard label="Prazos" value={summary.tasksDueToday} icon={CalendarDays} supporting={`hoje · ${summary.tasksDueNext7Days} nos próximos 7 dias`} />
        <StatCard
          label="Tempo hoje"
          value={formatMinutesAsHours(summary.minutesToday)}
          icon={Clock3}
          supporting={summary.absenceToday ? 'Dia de ausência' : `Meta ${formatMinutesAsHours(summary.dailyTargetMinutes)} · faltam ${formatMinutesAsHours(remainingToday)}`}
        />
        <StatCard label="Esta semana" value={formatMinutesAsHours(summary.minutesThisWeek)} icon={Clock3} supporting={`${summary.meetingsToday} reunião(ões) hoje`} />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel
            title="As minhas tarefas"
            description="Atrasadas primeiro, depois o prazo mais próximo."
            actions={
              <Link to="/timesheet/tasks" className="text-sm font-medium text-primary-hover hover:underline">
                Ver todas
              </Link>
            }
            flush
          >
            {orderedTasks.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">Não tem tarefas em aberto.</p>
            ) : (
              <ul className="divide-y divide-border">
                {orderedTasks.slice(0, 8).map((task) => (
                  <li key={task.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link to={`/timesheet/tasks/${task.id}`} className="font-semibold text-text hover:underline">
                        {task.reference}
                      </Link>
                      <span className="ml-2 text-sm text-text-secondary">{task.title}</span>
                      <p className="mt-0.5 text-xs text-text-muted">Prazo: {formatDateTime(task.dueAt, 'sem prazo')}</p>
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
            title="Atividade recente"
            actions={
              <Link to="/timesheet/activities" className="text-sm font-medium text-primary-hover hover:underline">
                Ver atividades
              </Link>
            }
            flush
          >
            {recent.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">Sem tempo registado nos últimos 7 dias.</p>
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
          <Panel
            title="Agenda"
            description={nextMeeting ? `Próxima reunião: ${nextMeeting.title} · ${formatDateTime(nextMeeting.startsAt)}` : 'Sem reuniões nos próximos dias.'}
            actions={
              <Link to="/timesheet/calendar" className="text-sm font-medium text-primary-hover hover:underline">
                Calendário
              </Link>
            }
            flush
          >
            {todayAndTomorrow.map(({ day, items }) => (
              <div key={day.toISOString()} className="border-b border-border px-5 py-3 last:border-b-0">
                <p className="text-sm font-semibold capitalize text-text">{isSameDay(day, now) ? 'Hoje' : 'Amanhã'}</p>
                {items.length === 0 ? (
                  <p className="mt-1 text-sm text-text-muted">Sem compromissos.</p>
                ) : (
                  <ul className="mt-2 space-y-2">
                    {items.map((item) => (
                      <li key={`${item.itemType}-${item.itemId}`} className="flex gap-3 text-sm">
                        <span className="w-14 shrink-0 tabular-nums text-text-muted">{item.allDay ? 'Dia' : timeFormatter.format(new Date(item.startsAt))}</span>
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

          <Panel title="Pedidos">
            <p className="text-sm text-text-secondary">
              {summary.pendingAbsenceRequests > 0
                ? `${summary.pendingAbsenceRequests} pedido(s) de ausência a aguardar aprovação.`
                : 'Não tem pedidos de ausência pendentes.'}
            </p>
            <Link to="/timesheet/absences" className="mt-2 inline-block text-sm font-medium text-primary-hover hover:underline">
              Ausências
            </Link>
          </Panel>

          {teamTotals && (
            <Panel
              title="Equipa"
              actions={
                <Link to="/timesheet/team" className="text-sm font-medium text-primary-hover hover:underline">
                  Carga da equipa
                </Link>
              }
            >
              <ul className="space-y-1 text-sm">
                <li className="flex justify-between">
                  <span className="text-text-secondary">Tarefas atrasadas</span>
                  <span className={`font-semibold ${teamTotals.overdue > 0 ? 'text-danger' : 'text-text'}`}>{teamTotals.overdue}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-text-secondary">Tarefas bloqueadas</span>
                  <span className="font-semibold text-text">{teamTotals.blocked}</span>
                </li>
                <li className="flex justify-between">
                  <span className="text-text-secondary">Ausências por decidir</span>
                  <span className="font-semibold text-text">{teamTotals.pendingAbsences}</span>
                </li>
              </ul>
              {teamTotals.absentToday.length > 0 && (
                <p className="mt-3 flex items-start gap-2 text-sm text-text-secondary">
                  <Users className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  Ausentes hoje: {teamTotals.absentToday.map((member) => member.fullName).join(', ')}
                </p>
              )}
            </Panel>
          )}
        </div>
      </div>

      <WorkLogFormModal
        isOpen={isLogOpen}
        employeeId={profileId}
        onClose={() => setIsLogOpen(false)}
        onSaved={() => {
          setIsLogOpen(false);
          setMessage('Atividade registada.');
          data.reload();
        }}
      />
    </div>
  );
};
