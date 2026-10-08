import React from 'react';
import { Link } from 'react-router-dom';
import { DataTable } from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import { StatusBadge } from '../ui/StatusBadge';
import type { Intervention, InterventionOutcome } from '../../types/it';
import { INTERVENTION_OUTCOME_LABELS } from '../../utils/it';
import { formatDateTime } from '../../utils/format';

const OUTCOME_BADGE: Record<InterventionOutcome, string> = {
  RESOLVED: 'RESOLVED',
  PARTIALLY_RESOLVED: 'WAITING_USER',
  NOT_RESOLVED: 'BLOCKED',
  ESCALATED: 'IN_PROGRESS',
};

interface InterventionsTableProps {
  interventions: Intervention[];
  /** Esconder colunas redundantes no contexto (ex.: o equipamento na própria ficha). */
  hideTicket?: boolean;
  hideAsset?: boolean;
  /** Ligações para o detalhe do pedido/equipamento (apenas com permissão). */
  canOpenTickets: boolean;
  canOpenAssets: boolean;
}

export const InterventionsTable: React.FC<InterventionsTableProps> = ({
  interventions,
  hideTicket = false,
  hideAsset = false,
  canOpenTickets,
  canOpenAssets,
}) => {
  const columns: DataTableColumn<Intervention>[] = [
    { id: 'date', header: 'Data', render: (item) => <span className="whitespace-nowrap">{formatDateTime(item.performedAt)}</span> },
    ...(hideTicket
      ? []
      : [
          {
            id: 'ticket',
            header: 'Pedido',
            render: (item: Intervention) =>
              item.ticketId && item.ticketReference && canOpenTickets ? (
                <Link to={`/it/tickets/${item.ticketId}`} className="font-medium text-primary-hover hover:underline">
                  {item.ticketReference}
                </Link>
              ) : (
                (item.ticketReference ?? '—')
              ),
          },
        ]),
    ...(hideAsset
      ? []
      : [
          {
            id: 'asset',
            header: 'Equipamento',
            render: (item: Intervention) =>
              item.assetId && item.assetTag && canOpenAssets ? (
                <Link to={`/it/assets/${item.assetId}`} className="font-medium text-primary-hover hover:underline">
                  {item.assetTag}
                </Link>
              ) : (
                (item.assetTag ?? '—')
              ),
          },
        ]),
    { id: 'technician', header: 'Técnico', render: (item) => item.technicianName },
    {
      id: 'work',
      header: 'Problema / trabalho realizado',
      className: 'min-w-64',
      render: (item) => (
        <div className="space-y-1 text-left">
          <p className="text-text">{item.problemDescription}</p>
          <p className="whitespace-pre-line text-xs text-text-secondary">{item.workPerformed}</p>
          {item.notes && <p className="text-xs text-text-muted">Obs.: {item.notes}</p>}
        </div>
      ),
    },
    {
      id: 'outcome',
      header: 'Resultado',
      render: (item) => (
        <StatusBadge status={OUTCOME_BADGE[item.outcome]} label={INTERVENTION_OUTCOME_LABELS[item.outcome]} size="sm" />
      ),
    },
  ];

  return (
    <DataTable
      caption="Intervenções técnicas"
      columns={columns}
      rows={interventions}
      getRowKey={(item) => item.id}
    />
  );
};
