import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LifeBuoy, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyTickets, listTicketCategories } from '../../services/itTicketService';
import { listMyAssets } from '../../services/itAssetService';
import type { TicketSummary } from '../../types/it';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { NewTicketModal } from '../../components/it/NewTicketModal';
import { formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

/** Pedidos de suporte do próprio colaborador. A RLS garante que só os seus são devolvidos. */
export const SupportTicketsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser } = useAuth();
  const profileId = currentUser?.id ?? '';

  const tickets = useAsyncData(() => (profileId ? listMyTickets(profileId) : Promise.resolve([])), [profileId]);
  const referenceData = useAsyncData(
    () => Promise.all([listTicketCategories(), profileId ? listMyAssets(profileId) : Promise.resolve([])]),
    [profileId]
  );
  const [categories, assets] = referenceData.data ?? [[], []];
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  const waitingCount = (tickets.data ?? []).filter((ticket) => ticket.status === 'WAITING_USER').length;
  const resolvedCount = (tickets.data ?? []).filter((ticket) => ticket.status === 'RESOLVED').length;

  const columns: DataTableColumn<TicketSummary>[] = [
    {
      id: 'reference',
      header: t('Pedido'),
      render: (ticket) => (
        <Link to={`/support/${ticket.id}`} className="block hover:underline">
          <span className="block font-semibold text-text">{ticket.reference}</span>
          <span className="block max-w-xs truncate text-xs text-text-secondary">{ticket.title}</span>
        </Link>
      ),
    },
    { id: 'category', header: t('Categoria'), render: (ticket) => ticket.categoryName ?? '—' },
    { id: 'priority', header: t('Prioridade'), render: (ticket) => <PriorityBadge priority={ticket.priority} /> },
    { id: 'status', header: t('Estado'), render: (ticket) => <StatusBadge status={ticket.status} size="sm" /> },
    { id: 'created', header: t('Aberto em'), render: (ticket) => <span className="whitespace-nowrap">{formatDateTime(ticket.createdAt)}</span> },
    { id: 'updated', header: t('Última atualização'), render: (ticket) => <span className="whitespace-nowrap">{formatDateTime(ticket.updatedAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Pedidos de suporte')}
        subtitle={t('Peça ajuda à equipa de IT e acompanhe o estado dos seus pedidos.')}
        actions={
          <Button icon={Plus} onClick={() => setIsCreateOpen(true)} disabled={!referenceData.data}>
            {t('Novo pedido')}
          </Button>
        }
      />

      {referenceData.error && <ErrorState message={referenceData.error} onRetry={referenceData.reload} />}
      {waitingCount > 0 && (
        <Alert variant="warning" title={t('A equipa de IT aguarda a sua resposta')}>
          {waitingCount === 1 ? '1 pedido precisa' : `${waitingCount} pedidos precisam`} de informação sua para continuar.
        </Alert>
      )}
      {resolvedCount > 0 && (
        <Alert variant="info">
          {resolvedCount === 1 ? '1 pedido foi resolvido' : t('{resolvedCount} pedidos foram resolvidos', { resolvedCount })}. Confirme a resolução ou reabra se o problema persistir.
        </Alert>
      )}

      <Panel flush>
        {tickets.error && (
          <div className="p-4">
            <ErrorState message={tickets.error} onRetry={tickets.reload} />
          </div>
        )}
        {tickets.isLoading && !tickets.data && <LoadingState label={t('A carregar os seus pedidos...')} />}
        {tickets.data && tickets.data.length === 0 && (
          <EmptyState
            bordered={false}
            icon={LifeBuoy}
            title={t('Ainda não abriu pedidos de suporte.')}
            message={t('Se tiver um problema com o computador, acessos, impressoras ou sistemas, abra um pedido.')}
          />
        )}
        {tickets.data && tickets.data.length > 0 && (
          <DataTable caption={t('Os meus pedidos de suporte')} columns={columns} rows={tickets.data} getRowKey={(ticket) => ticket.id} />
        )}
      </Panel>

      <NewTicketModal
        isOpen={isCreateOpen}
        categories={categories}
        assets={assets}
        onClose={() => setIsCreateOpen(false)}
        onCreated={(ticketId) => {
          setIsCreateOpen(false);
          navigate(`/support/${ticketId}`);
        }}
      />
    </div>
  );
};
