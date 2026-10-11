import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listApprovalRequests } from '../../services/work/opportunityService';
import type { ApprovalRequest } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { ApprovalDecisionModal } from '../../components/work/ApprovalModals';
import { ApprovalStatusBadge } from '../../components/work/ApprovalStatusBadge';
import { formatMoney } from '../../utils/work';
import { formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

type Tab = 'TO_DECIDE' | 'HISTORY';

/** Pedidos de aprovação de oportunidades: decisões do Manager e acompanhamento por quem pediu. */
export const ApprovalRequestsPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const canDecide = hasPermission('TIMESHEET_OPPORTUNITY_APPROVE');
  const [tab, setTab] = useState<Tab>(canDecide ? 'TO_DECIDE' : 'HISTORY');
  const pending = useAsyncData(() => (canDecide ? listApprovalRequests(['PENDING']) : Promise.resolve([])), [canDecide]);
  const history = useAsyncData(() => listApprovalRequests([], 200), []);
  const [decision, setDecision] = useState<{ request: ApprovalRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  // Quem pediu nunca decide: os próprios pedidos não aparecem para decisão (o servidor também o recusa).
  const toDecide = (pending.data ?? []).filter((request) => request.requestedBy !== viewerId);

  const baseColumns: DataTableColumn<ApprovalRequest>[] = [
    {
      id: 'request',
      header: t('Pedido'),
      render: (request) => (
        <span>
          <span className="block font-semibold text-text">{request.reference}</span>
          {request.opportunityId ? (
            <Link to={`/timesheet/opportunities/${request.opportunityId}`} className="block max-w-xs truncate text-xs text-primary-hover hover:underline">
              {request.title}
            </Link>
          ) : (
            <span className="block text-xs text-text-secondary">{request.title}</span>
          )}
        </span>
      ),
    },
    { id: 'owner', header: t('Responsável'), render: (request) => request.opportunityOwnerName ?? '—' },
    { id: 'requester', header: t('Pedido por'), render: (request) => request.requesterName ?? '—' },
    {
      id: 'amount',
      header: t('Valor'),
      align: 'right',
      render: (request) => <span className="whitespace-nowrap">{request.amount === null ? '—' : formatMoney(request.amount, request.currency ?? '')}</span>,
    },
    { id: 'created', header: t('Pedido em'), render: (request) => <span className="whitespace-nowrap">{formatDateTime(request.createdAt)}</span> },
  ];

  const decideColumns: DataTableColumn<ApprovalRequest>[] = [
    ...baseColumns,
    { id: 'justification', header: t('O que está a ser aprovado'), className: 'min-w-56', render: (request) => <span className="line-clamp-3">{request.justification}</span> },
    {
      id: 'actions',
      header: t('Decisão'),
      align: 'right',
      hideLabelOnMobile: true,
      render: (request) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="danger" icon={XCircle} onClick={() => setDecision({ request, decision: 'REJECTED' })}>
            {t('Rejeitar')}
          </Button>
          <Button size="sm" icon={CheckCircle2} onClick={() => setDecision({ request, decision: 'APPROVED' })}>
            {t('Aprovar')}
          </Button>
        </div>
      ),
    },
  ];

  const historyColumns: DataTableColumn<ApprovalRequest>[] = [
    ...baseColumns,
    { id: 'status', header: t('Estado'), render: (request) => <ApprovalStatusBadge status={request.status} /> },
    {
      id: 'decision',
      header: t('Decisão'),
      className: 'min-w-48',
      render: (request) =>
        request.decidedAt ? (
          <span className="text-xs">
            <span className="block text-text">
              {request.deciderName ?? 'Manager'} · {formatDateTime(request.decidedAt)}
            </span>
            {request.decisionComment && <span className="block text-text-muted">{request.decisionComment}</span>}
          </span>
        ) : (
          <span className="text-xs text-text-muted">{request.decisionComment ?? '—'}</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('Pedidos de aprovação')} subtitle={t('Oportunidades que precisam da decisão do Manager antes de avançar para proposta.')} />
      {canDecide && (
        <div role="tablist" aria-label={t('Pedidos de aprovação')} className="flex gap-2">
          <Button role="tab" size="sm" aria-selected={tab === 'TO_DECIDE'} variant={tab === 'TO_DECIDE' ? 'primary' : 'secondary'} onClick={() => setTab('TO_DECIDE')}>
            {t('Por decidir')}{toDecide.length > 0 ? ` (${toDecide.length})` : ''}
          </Button>
          <Button role="tab" size="sm" aria-selected={tab === 'HISTORY'} variant={tab === 'HISTORY' ? 'primary' : 'secondary'} onClick={() => setTab('HISTORY')}>
            {t('Histórico')}
          </Button>
        </div>
      )}
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      {tab === 'TO_DECIDE' && canDecide && (
        <Panel flush>
          {pending.error && (
            <div className="p-4">
              <ErrorState message={pending.error} onRetry={pending.reload} />
            </div>
          )}
          {pending.isLoading && !pending.data && <LoadingState label={t('A carregar pedidos...')} />}
          {pending.data && toDecide.length === 0 && <EmptyState bordered={false} icon={ClipboardCheck} title={t('Não há pedidos à espera da sua decisão.')} />}
          {toDecide.length > 0 && <DataTable caption={t('Pedidos por decidir')} columns={decideColumns} rows={toDecide} getRowKey={(request) => request.id} />}
        </Panel>
      )}

      {tab === 'HISTORY' && (
        <Panel flush>
          {history.error && (
            <div className="p-4">
              <ErrorState message={history.error} onRetry={history.reload} />
            </div>
          )}
          {history.isLoading && !history.data && <LoadingState label={t('A carregar pedidos...')} />}
          {history.data && history.data.length === 0 && <EmptyState bordered={false} icon={ClipboardCheck} title={t('Ainda não existem pedidos de aprovação.')} />}
          {history.data && history.data.length > 0 && (
            <DataTable caption={t('Histórico dos pedidos de aprovação')} columns={historyColumns} rows={history.data} getRowKey={(request) => request.id} />
          )}
        </Panel>
      )}

      <ApprovalDecisionModal
        request={decision?.request ?? null}
        decision={decision?.decision ?? null}
        onClose={() => setDecision(null)}
        onDecided={(text) => {
          setDecision(null);
          setMessage(text);
          pending.reload();
          history.reload();
        }}
      />
    </div>
  );
};
