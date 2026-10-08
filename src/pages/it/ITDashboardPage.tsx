import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2, CircleDot, Clock, Hourglass, PauseCircle, UserX, Wrench } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getDashboardSummary, listActiveTickets, listRecentTicketEvents } from '../../services/itTicketService';
import type { TicketSummary } from '../../types/it';
import { PageHeader } from '../../components/ui/PageHeader';
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
      if (ticket.priority === 'CRITICAL') reasons.push('Crítico');
      if (!ticket.assignedTo) reasons.push('Sem técnico');
      if (isTicketOverdue(ticket, now)) reasons.push('Prazo ultrapassado');
      if (isTicketDueSoon(ticket, now)) reasons.push(`Prazo termina em menos de ${DUE_SOON_HOURS} h`);
      if (isWaitingTooLong(ticket, waitingAlertDays, now)) reasons.push(`À espera há mais de ${waitingAlertDays} dias`);
      return { ticket, reasons };
    })
    .filter((item) => item.reasons.length > 0)
    .sort((first, second) => compareTicketsByUrgency(first.ticket, second.ticket));
}

export const ITDashboardPage: React.FC = () => {
  const dashboard = useAsyncData(
    () => Promise.all([getDashboardSummary(), listActiveTickets(), listRecentTicketEvents(RECENT_ACTIVITY_LIMIT)]),
    []
  );

  if (dashboard.isLoading && !dashboard.data) return <LoadingState label="A carregar o painel do IT..." />;
  if (!dashboard.data) {
    return <ErrorState message={dashboard.error ?? 'Sem dados.'} onRetry={dashboard.reload} />;
  }

  const [summary, activeTickets, recentEvents] = dashboard.data;
  const now = new Date();
  const attention = buildAttentionList(activeTickets, summary.waitingAlertDays, now);
  const dueSoonCount = activeTickets.filter((ticket) => isTicketDueSoon(ticket, now)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Suporte IT"
        subtitle="Estado atual dos pedidos de suporte e do trabalho da equipa."
        actions={
          <Link
            to="/it/tickets"
            className="inline-flex h-10 items-center rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover hover:text-white"
          >
            Abrir fila de pedidos
          </Link>
        }
      />

      {dashboard.error && <ErrorState message={dashboard.error} onRetry={dashboard.reload} />}

      <section aria-label="Pedidos por estado" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Abertos" value={summary.openCount} icon={CircleDot} supporting="Ainda sem atendimento iniciado" />
        <StatCard label="Em atendimento" value={summary.inProgressCount} icon={Wrench} supporting="Com técnico a trabalhar no pedido" />
        <StatCard label="A aguardar colaborador" value={summary.waitingUserCount} icon={PauseCircle} supporting="Dependem de resposta do colaborador" />
        <StatCard label="Resolvidos" value={summary.resolvedCount} icon={CheckCircle2} supporting="A aguardar confirmação do colaborador" />
      </section>

      <section aria-label="Indicadores de atenção" className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Críticos em curso" value={summary.criticalCount} icon={AlertTriangle} supporting="Prioridade crítica ainda por concluir" />
        <StatCard label="Sem técnico" value={summary.unassignedCount} icon={UserX} supporting="Pedidos em curso por atribuir" />
        <StatCard
          label="Prazo ultrapassado"
          value={summary.overdueCount}
          icon={Clock}
          supporting={`Abertos ou em atendimento · ${dueSoonCount} a terminar nas próximas ${DUE_SOON_HOURS} h`}
        />
        <StatCard
          label="Espera prolongada"
          value={summary.waitingTooLongCount}
          icon={Hourglass}
          supporting={`A aguardar o colaborador há mais de ${pluralize(summary.waitingAlertDays, 'dia', 'dias')}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <Panel
            title="Requer atenção"
            description="Pedidos em curso críticos, sem técnico, com prazo ultrapassado ou a terminar, ou parados à espera do colaborador."
            actions={
              <Link to="/it/tickets?assignee=UNASSIGNED" className="text-sm font-medium text-primary-hover hover:underline">
                Ver pedidos sem técnico
              </Link>
            }
            flush
          >
            {attention.length === 0 ? (
              <p className="px-5 py-6 text-sm text-text-secondary">Nenhum pedido requer atenção neste momento.</p>
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
                E mais {attention.length - ATTENTION_LIMIT}.{' '}
                <Link to="/it/tickets" className="font-medium text-primary-hover hover:underline">
                  Ver todos na fila
                </Link>
              </p>
            )}
          </Panel>
        </div>

        <Panel title="Atividade recente" flush>
          {recentEvents.length === 0 ? (
            <p className="px-5 py-6 text-sm text-text-secondary">Ainda não existe atividade registada.</p>
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
  );
};
