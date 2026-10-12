import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, Clock, Hourglass, ListChecks, UserX } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getDashboardSummary, listActiveTickets, listRecentTicketEvents } from '../../services/itTicketService';
import type { TicketSummary } from '../../types/it';
import { PageHeader } from '../../components/ui/PageHeader';
import { DashboardHeader } from '../../components/layout/DashboardHeader';
import { SystemHealthStrip } from '../../components/work/SystemHealthStrip';
import { useAuth } from '../../lib/auth/AuthContext';
import { Panel } from '../../components/ui/Panel';
import { StatCard } from '../../components/ui/StatCard';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { StatusBadge } from '../../components/ui/StatusBadge';
import {
  compareTicketsByUrgency,
  describeTicketEvent,
  DUE_SOON_HOURS,
  isTicketDueSoon,
  isTicketOverdue,
  isWaitingTooLong,
} from '../../utils/it';
import { formatDateTime, pluralize } from '../../utils/format';
import { t } from '../../lib/i18n';

const ATTENTION_LIMIT = 10;
const RECENT_ACTIVITY_LIMIT = 12;

interface AttentionItem {
  ticket: TicketSummary;
  reasons: string[];
}

/** Pedidos que precisam de ação: críticos, sem técnico, com prazo ultrapassado ou a terminar, ou parados à espera do colaborador. */
function buildAttentionList(tickets: TicketSummary[], waitingAlertDays: number, now: Date): AttentionItem[] {
  return tickets
    .map((ticket) => {
      const reasons: string[] = [];
      if (ticket.priority === 'CRITICAL') reasons.push(t('Crítico'));
      if (!ticket.assignedTo) reasons.push(t('Sem técnico'));
      if (isTicketOverdue(ticket, now)) reasons.push(t('Prazo ultrapassado'));
      if (isTicketDueSoon(ticket, now)) reasons.push(t('Prazo termina em menos de {DUE_SOON_HOURS} h', { DUE_SOON_HOURS }));
      if (isWaitingTooLong(ticket, waitingAlertDays, now)) reasons.push(t('À espera há mais de {waitingAlertDays} dias', { waitingAlertDays }));
      return { ticket, reasons };
    })
    .filter((item) => item.reasons.length > 0)
    .sort((first, second) => compareTicketsByUrgency(first.ticket, second.ticket));
}

/** Painel do suporte IT. Com `asDashboard`, é o painel inicial do perfil IT (saudação e saúde do sistema). */
export const ITDashboardPage: React.FC<{ asDashboard?: boolean }> = ({ asDashboard = false }) => {
  const { hasPermission } = useAuth();
  const dashboard = useAsyncData(
    () => Promise.all([getDashboardSummary(), listActiveTickets(), listRecentTicketEvents(RECENT_ACTIVITY_LIMIT)]),
    []
  );

  if (dashboard.isLoading && !dashboard.data) return <LoadingState label={t('A carregar o painel do IT...')} />;
  if (!dashboard.data) {
    return <ErrorState message={dashboard.error ?? t('Sem dados.')} onRetry={dashboard.reload} />;
  }

  const [summary, activeTickets, recentEvents] = dashboard.data;
  const queueLink = (
    <Link
      to="/it/tickets"
      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover hover:text-on-primary-hover"
    >
      <ListChecks className="h-4 w-4" aria-hidden="true" />
      {t('Abrir fila de suporte')}
    </Link>
  );
  const now = new Date();
  const attention = buildAttentionList(activeTickets, summary.waitingAlertDays, now);
  const dueSoonCount = activeTickets.filter((ticket) => isTicketDueSoon(ticket, now)).length;

  return (
    <div className="space-y-6">
      {asDashboard ? (
        <DashboardHeader message={t('Pedidos de suporte, prazos, equipamentos e o estado dos serviços.')} actions={queueLink} />
      ) : (
        <PageHeader title={t('Suporte IT')} subtitle={t('Estado atual dos pedidos de suporte e do trabalho da equipa.')} actions={queueLink} />
      )}

      {dashboard.error && <ErrorState message={dashboard.error} onRetry={dashboard.reload} />}

      <section aria-label={t('Indicadores de atenção')} className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label={t('Críticos em curso')} value={summary.criticalCount} icon={AlertTriangle} supporting={t('Prioridade crítica ainda por concluir')} />
        <StatCard label={t('Sem técnico')} value={summary.unassignedCount} icon={UserX} supporting={t('Pedidos em curso por atribuir')} />
        <StatCard
          label={t('Prazo ultrapassado')}
          value={summary.overdueCount}
          icon={Clock}
          supporting={t('Abertos ou em atendimento · {dueSoonCount} a terminar nas próximas {DUE_SOON_HOURS} h', { dueSoonCount, DUE_SOON_HOURS })}
        />
        <StatCard
          label={t('Espera prolongada')}
          value={summary.waitingTooLongCount}
          icon={Hourglass}
          supporting={t('A aguardar o colaborador há mais de {days}', { days: pluralize(summary.waitingAlertDays, 'dia', 'dias') })}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel
            title={t('Requer atenção')}
            description={t('Pedidos em curso críticos, sem técnico, com prazo ultrapassado ou a terminar, ou parados à espera do colaborador.')}
            actions={
              <Link to="/it/tickets?assignee=UNASSIGNED" className="text-sm font-medium text-primary-hover hover:underline">
                {t('Ver pedidos sem técnico')}
              </Link>
            }
            flush
          >
            {attention.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">{t('Nenhum pedido requer atenção neste momento.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {attention.slice(0, ATTENTION_LIMIT).map(({ ticket, reasons }) => (
                  <li key={ticket.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <Link to={`/it/tickets/${ticket.id}`} className="font-semibold text-text hover:underline">
                        {ticket.reference}
                      </Link>
                      <span className="ml-2 text-sm text-text-secondary">{ticket.title}</span>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {ticket.requesterName ?? '—'} · {ticket.categoryName ?? '—'} · aberto em {formatDateTime(ticket.createdAt)}
                      </p>
                      <p className="mt-1 text-xs font-medium text-danger">{reasons.join(' · ')}</p>
                    </div>
                    <div className="flex shrink-0 flex-wrap items-center gap-2">
                      <PriorityBadge priority={ticket.priority} />
                      <StatusBadge status={ticket.status} size="sm" />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            {attention.length > ATTENTION_LIMIT && (
              <p className="border-t border-border px-5 py-3 text-sm text-text-secondary">
                {t('E mais {count}.', { count: attention.length - ATTENTION_LIMIT })}{' '}
                <Link to="/it/tickets" className="font-medium text-primary-hover hover:underline">
                  {t('Ver todos na fila')}
                </Link>
              </p>
            )}
          </Panel>
          <p className="mt-3 text-sm text-text-secondary" aria-label={t('Pedidos por estado')}>
            <span className="font-medium text-text">{t('Fila:')}</span>{' '}
            {t('{open} abertos · {inProgress} em atendimento · {waiting} a aguardar o colaborador · {resolved} resolvidos por confirmar', {
              open: summary.openCount,
              inProgress: summary.inProgressCount,
              waiting: summary.waitingUserCount,
              resolved: summary.resolvedCount,
            })}
          </p>
        </div>

        <div className="space-y-6">
        {hasPermission('SYSTEM_HEALTH_READ') && <SystemHealthStrip />}
        <Panel title={t('Atividade recente')} flush>
          {recentEvents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-secondary">{t('Ainda não existe atividade registada.')}</p>
          ) : (
            <ul className="divide-y divide-border">
              {recentEvents.map((event) => (
                <li key={event.id} className="px-5 py-3">
                  <p className="text-sm text-text">
                    <Link to={`/it/tickets/${event.ticketId}`} className="font-semibold hover:underline">
                      {event.ticketReference ?? 'Pedido'}
                    </Link>{' '}
                    · {describeTicketEvent(event)}
                  </p>
                  <p className="mt-0.5 text-xs text-text-muted">
                    {event.actorName ?? 'Sistema'} · {formatDateTime(event.createdAt)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        </div>
      </div>
    </div>
  );
};
