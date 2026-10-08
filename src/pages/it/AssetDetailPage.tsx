import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Wrench } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getAsset, listInterventions } from '../../services/itAssetService';
import { listAssetTickets } from '../../services/itTicketService';
import { listUsers } from '../../services/userService';
import { listDepartments } from '../../services/departmentService';
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
import { AssetFormModal } from '../../components/it/AssetFormModal';
import { InterventionFormModal } from '../../components/it/InterventionFormModal';
import { InterventionsTable } from '../../components/it/InterventionsTable';
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS } from '../../utils/it';
import { formatDate, formatDateTime } from '../../utils/format';
import { isUuid } from '../../utils/validation';

const BackLink: React.FC = () => (
  <Link to="/it/assets" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    Voltar aos ativos
  </Link>
);

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

/** Ficha do equipamento com o histórico de pedidos e de intervenções técnicas. */
export const AssetDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { hasPermission } = useAuth();
  const canManageAsset = hasPermission('IT_ASSETS_MANAGE');
  const canRegisterIntervention = hasPermission('IT_TICKETS_MANAGE');
  const canOpenTickets = hasPermission('IT_TICKETS_READ');

  const asset = useAsyncData(() => (isUuid(id) ? getAsset(id) : Promise.resolve(null)), [id]);
  const history = useAsyncData(
    () =>
      isUuid(id)
        ? Promise.all([
            listAssetTickets(id),
            listInterventions({ page: 1, pageSize: 100, ticketId: null, assetId: id, outcome: null }),
          ])
        : Promise.resolve(null),
    [id]
  );
  const referenceData = useAsyncData(
    () => (canManageAsset ? Promise.all([listUsers(), listDepartments()]) : Promise.resolve(null)),
    [canManageAsset]
  );
  const [users, departments] = referenceData.data ?? [[], []];

  const [isEditOpen, setIsEditOpen] = useState(false);
  const [isInterventionOpen, setIsInterventionOpen] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (asset.isLoading && !asset.data) return <LoadingState label="A carregar equipamento..." />;
  if (asset.error && !asset.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={asset.error} onRetry={asset.reload} />
      </div>
    );
  }
  if (!asset.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title="Equipamento não encontrado." message="O equipamento não existe ou não tem acesso a ele." />
      </div>
    );
  }

  const item = asset.data;
  const [tickets, interventions] = history.data ?? [[], { items: [], total: 0 }];

  const ticketColumns: DataTableColumn<TicketSummary>[] = [
    {
      id: 'reference',
      header: 'Pedido',
      render: (ticket) =>
        canOpenTickets ? (
          <Link to={`/it/tickets/${ticket.id}`} className="font-semibold text-text hover:underline">
            {ticket.reference}
          </Link>
        ) : (
          ticket.reference
        ),
    },
    { id: 'title', header: 'Assunto', render: (ticket) => ticket.title },
    { id: 'requester', header: 'Solicitante', render: (ticket) => ticket.requesterName ?? '—' },
    { id: 'priority', header: 'Prioridade', render: (ticket) => <PriorityBadge priority={ticket.priority} /> },
    { id: 'status', header: 'Estado', render: (ticket) => <StatusBadge status={ticket.status} size="sm" /> },
    { id: 'created', header: 'Aberto em', render: (ticket) => <span className="whitespace-nowrap">{formatDateTime(ticket.createdAt)}</span> },
  ];

  const handleSaved = (message: string) => {
    setIsEditOpen(false);
    setIsInterventionOpen(false);
    setSuccessMessage(message);
    asset.reload();
    history.reload();
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={item.assetTag}
        subtitle={`${ASSET_TYPE_LABELS[item.assetType]}${item.brand || item.model ? ` · ${[item.brand, item.model].filter(Boolean).join(' ')}` : ''}`}
        actions={
          <>
            <StatusBadge status={item.status} label={ASSET_STATUS_LABELS[item.status]} />
            {canRegisterIntervention && (
              <Button variant="secondary" icon={Wrench} onClick={() => setIsInterventionOpen(true)}>
                Registar intervenção
              </Button>
            )}
            {canManageAsset && (
              <Button icon={Pencil} onClick={() => setIsEditOpen(true)} disabled={!referenceData.data}>
                Editar
              </Button>
            )}
          </>
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {referenceData.error && <ErrorState message={referenceData.error} onRetry={referenceData.reload} />}

      <Panel title="Dados do equipamento">
        <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <DetailItem label="Tipo">{ASSET_TYPE_LABELS[item.assetType]}</DetailItem>
          <DetailItem label="Marca">{item.brand ?? '—'}</DetailItem>
          <DetailItem label="Modelo">{item.model ?? '—'}</DetailItem>
          <DetailItem label="Número de série">{item.serialNumber ?? '—'}</DetailItem>
          <DetailItem label="Utilizador responsável">{item.assignedToName ?? 'Sem utilizador'}</DetailItem>
          <DetailItem label="Departamento">{item.departmentName ?? '—'}</DetailItem>
          <DetailItem label="Localização">{item.location ?? '—'}</DetailItem>
          <DetailItem label="Data de aquisição">{formatDate(item.acquiredOn)}</DetailItem>
          <DetailItem label="Registado em">{formatDateTime(item.createdAt)}</DetailItem>
          <DetailItem label="Última alteração">{formatDateTime(item.updatedAt)}</DetailItem>
        </dl>
        {item.notes && (
          <div className="mt-5 border-t border-border pt-5">
            <p className="text-sm text-text-muted">Observações</p>
            <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{item.notes}</p>
          </div>
        )}
      </Panel>

      {history.error && <ErrorState message={history.error} onRetry={history.reload} />}
      {history.isLoading && !history.data && <LoadingState label="A carregar histórico..." />}

      {history.data && (
        <>
          <Panel title="Pedidos de suporte" description="Pedidos associados a este equipamento." flush>
            {tickets.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Nenhum pedido associado.</p>
            ) : (
              <DataTable caption="Pedidos do equipamento" columns={ticketColumns} rows={tickets} getRowKey={(ticket) => ticket.id} />
            )}
          </Panel>

          <Panel title="Intervenções técnicas" flush>
            {interventions.items.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Ainda não foram registadas intervenções.</p>
            ) : (
              <InterventionsTable interventions={interventions.items} hideAsset canOpenTickets={canOpenTickets} canOpenAssets />
            )}
            {interventions.total > interventions.items.length && (
              <p className="border-t border-border px-5 py-3 text-sm text-text-secondary">
                A mostrar as {interventions.items.length} intervenções mais recentes de {interventions.total}.{' '}
                <Link to="/it/interventions" className="font-medium text-primary-hover hover:underline">
                  Ver todas
                </Link>
              </p>
            )}
          </Panel>
        </>
      )}

      <AssetFormModal
        isOpen={isEditOpen}
        asset={item}
        users={users}
        departments={departments}
        onClose={() => setIsEditOpen(false)}
        onSaved={(message) => handleSaved(message)}
      />
      <InterventionFormModal
        isOpen={isInterventionOpen}
        ticketId={null}
        assetId={item.id}
        targetLabel={item.assetTag}
        onClose={() => setIsInterventionOpen(false)}
        onSaved={() => handleSaved('Intervenção registada.')}
      />
    </div>
  );
};
