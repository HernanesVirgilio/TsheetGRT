import React from 'react';
import { Link } from 'react-router-dom';
import { Panel } from '../ui/Panel';
import { StatusBadge } from '../ui/StatusBadge';
import { PriorityBadge } from './PriorityBadge';
import type { TicketDetail } from '../../types/it';
import { isTicketOverdue } from '../../utils/it';
import { formatDateTime } from '../../utils/format';

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

interface TicketInfoPanelProps {
  ticket: TicketDetail;
  assigneeName: string | null;
  /** Ligação para o detalhe do equipamento (apenas para quem tem acesso ao inventário). */
  assetLink?: string;
}

export const TicketInfoPanel: React.FC<TicketInfoPanelProps> = ({ ticket, assigneeName, assetLink }) => {
  const overdue = isTicketOverdue(ticket, new Date());
  return (
    <Panel>
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <StatusBadge status={ticket.status} />
        <PriorityBadge priority={ticket.priority} />
        {overdue && <StatusBadge status="BLOCKED" label="Prazo ultrapassado" />}
      </div>
      <p className="whitespace-pre-line text-sm text-text-secondary">{ticket.description}</p>
      {ticket.resolutionSummary && (
        <div className="mt-4 rounded-md border border-success/30 bg-success-soft px-4 py-3">
          <p className="text-sm font-semibold text-text">Resolução</p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{ticket.resolutionSummary}</p>
        </div>
      )}
      <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-4">
        <DetailItem label="Solicitante">{ticket.requesterName ?? '—'}</DetailItem>
        <DetailItem label="Departamento">{ticket.departmentName ?? 'Sem departamento'}</DetailItem>
        <DetailItem label="Categoria">{ticket.categoryName ?? '—'}</DetailItem>
        <DetailItem label="Técnico responsável">{assigneeName ?? 'Ainda sem técnico'}</DetailItem>
        <DetailItem label="Equipamento">
          {ticket.assetTag ? (
            assetLink ? (
              <Link to={assetLink} className="text-primary-hover hover:underline">
                {ticket.assetTag}
              </Link>
            ) : (
              ticket.assetTag
            )
          ) : (
            '—'
          )}
        </DetailItem>
        <DetailItem label="Aberto em">{formatDateTime(ticket.createdAt)}</DetailItem>
        <DetailItem label="Prazo de resolução">{formatDateTime(ticket.dueAt)}</DetailItem>
        {(ticket.closedAt ?? ticket.resolvedAt) && (
          <DetailItem label={ticket.closedAt ? 'Fechado em' : 'Resolvido em'}>
            {formatDateTime(ticket.closedAt ?? ticket.resolvedAt)}
          </DetailItem>
        )}
      </dl>
    </Panel>
  );
};
