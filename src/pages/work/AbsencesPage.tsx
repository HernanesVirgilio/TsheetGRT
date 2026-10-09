import React, { useState } from 'react';
import { CalendarOff, CheckCircle2, Eye, Pencil, Plus, Send, Undo2, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { cancelAbsence, listAbsenceEvents, listAbsenceTypes, listMyAbsences, listTeamAbsences, submitAbsence } from '../../services/work/absenceService';
import type { AbsenceDecision, AbsenceRequest } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { TicketNoteModal } from '../../components/it/TicketActionModals';
import { WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { WorkTimeline } from '../../components/work/WorkTimeline';
import { AttachmentsPanel } from '../../components/work/AttachmentsPanel';
import { AbsenceDecisionModal, AbsenceFormModal } from '../../components/work/AbsenceModals';
import { daysBetween, toDateInput } from '../../utils/work';
import { formatDate, formatDateTime } from '../../utils/format';

type Tab = 'MINE' | 'APPROVALS';

function periodLabel(request: AbsenceRequest): string {
  const days = daysBetween(request.startDate, request.endDate) + 1;
  return `${formatDate(request.startDate)}${request.startDate === request.endDate ? '' : ` a ${formatDate(request.endDate)}`} (${days} dia${days === 1 ? '' : 's'})`;
}

export const AbsencesPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const canApprove = hasPermission('TIMESHEET_ABSENCE_APPROVE');
  const [tab, setTab] = useState<Tab>('MINE');
  const types = useAsyncData(listAbsenceTypes, []);
  const mine = useAsyncData(() => listMyAbsences(viewerId), [viewerId]);
  const pending = useAsyncData(() => (canApprove ? listTeamAbsences(viewerId, ['SUBMITTED']) : Promise.resolve([])), [viewerId, canApprove]);
  const upcomingTeam = useAsyncData(() => (canApprove ? listTeamAbsences(viewerId, ['APPROVED']) : Promise.resolve([])), [viewerId, canApprove]);

  const [formRequest, setFormRequest] = useState<AbsenceRequest | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [detail, setDetail] = useState<AbsenceRequest | null>(null);
  const [toCancel, setToCancel] = useState<AbsenceRequest | null>(null);
  const [decision, setDecision] = useState<{ request: AbsenceRequest; decision: AbsenceDecision } | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  const reloadAll = () => {
    mine.reload();
    pending.reload();
    upcomingTeam.reload();
  };

  const submit = async (request: AbsenceRequest) => {
    setPendingId(request.id);
    setMessage(null);
    try {
      await submitAbsence(request.id);
      setMessage({ variant: 'success', text: `Pedido ${request.reference} submetido para aprovação.` });
      reloadAll();
    } catch (error) {
      setMessage({ variant: 'error', text: getErrorMessage(error, 'Não foi possível submeter o pedido.') });
    } finally {
      setPendingId(null);
    }
  };

  const today = toDateInput(new Date());
  const mineColumns: DataTableColumn<AbsenceRequest>[] = [
    { id: 'reference', header: 'Pedido', render: (request) => <span className="font-semibold text-text">{request.reference}</span> },
    { id: 'type', header: 'Tipo', render: (request) => request.absenceTypeName },
    { id: 'period', header: 'Período', render: (request) => periodLabel(request) },
    { id: 'status', header: 'Estado', render: (request) => <WorkStatusBadge kind="absence" status={request.status} /> },
    {
      id: 'comment',
      header: 'Observação do gestor',
      className: 'min-w-48',
      render: (request) => request.decisionComment ?? <span className="text-text-muted">—</span>,
    },
    {
      id: 'actions',
      header: 'Ações',
      align: 'right',
      hideLabelOnMobile: true,
      render: (request) => (
        <div className="flex flex-wrap justify-end gap-1">
          <IconButton icon={Eye} label={`Ver ${request.reference}`} onClick={() => setDetail(request)} />
          {request.status === 'DRAFT' && (
            <>
              <IconButton
                icon={Pencil}
                label={`Corrigir ${request.reference}`}
                onClick={() => {
                  setFormRequest(request);
                  setIsFormOpen(true);
                }}
              />
              <Button size="sm" icon={Send} isLoading={pendingId === request.id} onClick={() => submit(request)}>
                Submeter
              </Button>
            </>
          )}
          {(request.status === 'DRAFT' || request.status === 'SUBMITTED' || (request.status === 'APPROVED' && request.startDate > today)) && (
            <IconButton icon={Undo2} tone="danger" label={`Cancelar ${request.reference}`} onClick={() => setToCancel(request)} />
          )}
        </div>
      ),
    },
  ];

  const pendingColumns: DataTableColumn<AbsenceRequest>[] = [
    { id: 'employee', header: 'Colaborador', render: (request) => <span className="font-semibold text-text">{request.employeeName ?? '—'}</span> },
    { id: 'type', header: 'Tipo', render: (request) => request.absenceTypeName },
    { id: 'period', header: 'Período', render: (request) => periodLabel(request) },
    { id: 'submitted', header: 'Submetido', render: (request) => formatDateTime(request.submittedAt) },
    { id: 'reason', header: 'Motivo', className: 'min-w-48', render: (request) => request.reason || '—' },
    {
      id: 'actions',
      header: 'Decisão',
      align: 'right',
      hideLabelOnMobile: true,
      render: (request) => (
        <div className="flex flex-wrap justify-end gap-1">
          <IconButton icon={Eye} label={`Ver ${request.reference}`} onClick={() => setDetail(request)} />
          <Button size="sm" variant="secondary" icon={Undo2} onClick={() => setDecision({ request, decision: 'CHANGES_REQUESTED' })}>
            Pedir correção
          </Button>
          <Button size="sm" variant="danger" icon={XCircle} onClick={() => setDecision({ request, decision: 'REJECTED' })}>
            Rejeitar
          </Button>
          <Button size="sm" icon={CheckCircle2} onClick={() => setDecision({ request, decision: 'APPROVED' })}>
            Aprovar
          </Button>
        </div>
      ),
    },
  ];

  const upcoming = (upcomingTeam.data ?? []).filter((request) => request.endDate >= today);
  const pendingCount = pending.data?.length ?? 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ausências"
        subtitle="Pedidos de férias, doença, licenças e outras ausências, com aprovação do gestor."
        actions={
          hasPermission('TIMESHEET_ABSENCE_CREATE') && (
            <Button
              icon={Plus}
              disabled={!types.data}
              onClick={() => {
                setFormRequest(null);
                setIsFormOpen(true);
              }}
            >
              Novo pedido
            </Button>
          )
        }
      />
      {canApprove && (
        <div role="tablist" aria-label="Ausências" className="flex gap-2">
          <Button role="tab" size="sm" aria-selected={tab === 'MINE'} variant={tab === 'MINE' ? 'primary' : 'secondary'} onClick={() => setTab('MINE')}>
            Os meus pedidos
          </Button>
          <Button role="tab" size="sm" aria-selected={tab === 'APPROVALS'} variant={tab === 'APPROVALS' ? 'primary' : 'secondary'} onClick={() => setTab('APPROVALS')}>
            Aprovações{pendingCount > 0 ? ` (${pendingCount})` : ''}
          </Button>
        </div>
      )}
      {message && (
        <Alert variant={message.variant} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      {tab === 'MINE' && (
        <Panel flush>
          {mine.error && (
            <div className="p-4">
              <ErrorState message={mine.error} onRetry={mine.reload} />
            </div>
          )}
          {mine.isLoading && !mine.data && <LoadingState label="A carregar pedidos..." />}
          {mine.data && mine.data.length === 0 && (
            <EmptyState bordered={false} icon={CalendarOff} title="Ainda não fez pedidos de ausência." message="Crie um pedido, anexe comprovativos quando necessário e submeta-o ao seu gestor." />
          )}
          {mine.data && mine.data.length > 0 && <DataTable caption="Os meus pedidos de ausência" columns={mineColumns} rows={mine.data} getRowKey={(request) => request.id} />}
        </Panel>
      )}

      {tab === 'APPROVALS' && canApprove && (
        <>
          <Panel title="A aguardar a sua decisão" flush>
            {pending.error && (
              <div className="p-4">
                <ErrorState message={pending.error} onRetry={pending.reload} />
              </div>
            )}
            {pending.isLoading && !pending.data && <LoadingState label="A carregar pedidos..." />}
            {pending.data && pending.data.length === 0 && <EmptyState bordered={false} icon={CheckCircle2} title="Não existem pedidos de ausência pendentes." />}
            {pending.data && pending.data.length > 0 && <DataTable caption="Pedidos pendentes" columns={pendingColumns} rows={pending.data} getRowKey={(request) => request.id} />}
          </Panel>
          <Panel title="Ausências aprovadas (atuais e futuras)" flush>
            {upcoming.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Sem ausências aprovadas na equipa.</p>
            ) : (
              <ul className="divide-y divide-border">
                {upcoming.map((request) => (
                  <li key={request.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3 text-sm">
                    <span className="font-medium text-text">{request.employeeName ?? '—'}</span>
                    <span className="text-text-secondary">
                      {request.absenceTypeName} · {periodLabel(request)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </>
      )}

      <AbsenceFormModal
        isOpen={isFormOpen}
        request={formRequest}
        types={types.data ?? []}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => {
          setIsFormOpen(false);
          setMessage({ variant: 'success', text: 'Pedido guardado em rascunho. Anexe comprovativos se necessário e submeta-o.' });
          mine.reload();
        }}
      />
      <AbsenceDecisionModal
        request={decision?.request ?? null}
        decision={decision?.decision ?? null}
        onClose={() => setDecision(null)}
        onDecided={(text) => {
          setDecision(null);
          setMessage({ variant: 'success', text });
          reloadAll();
        }}
      />
      <TicketNoteModal
        isOpen={toCancel !== null}
        title={toCancel ? `Cancelar ${toCancel.reference}` : 'Cancelar pedido'}
        description={toCancel?.status === 'APPROVED' ? 'A ausência já foi aprovada: o gestor é notificado do cancelamento.' : undefined}
        note={toCancel?.status === 'APPROVED' ? { label: 'Motivo do cancelamento', minLength: 5, maxLength: 1000 } : { label: 'Motivo (opcional)', maxLength: 1000 }}
        confirmLabel="Cancelar pedido"
        variant="danger"
        onClose={() => setToCancel(null)}
        onConfirm={async (reason) => {
          if (!toCancel) return;
          await cancelAbsence(toCancel.id, reason);
          setToCancel(null);
          setMessage({ variant: 'success', text: 'Pedido cancelado.' });
          reloadAll();
        }}
      />
      {detail && <AbsenceDetailModal request={detail} viewerId={viewerId} onClose={() => setDetail(null)} onChanged={reloadAll} />}
    </div>
  );
};

const AbsenceDetailModal: React.FC<{ request: AbsenceRequest; viewerId: string; onClose: () => void; onChanged: () => void }> = ({
  request,
  viewerId,
  onClose,
  onChanged,
}) => {
  const events = useAsyncData(() => listAbsenceEvents(request.id), [request.id]);
  const isOwner = request.employeeId === viewerId;
  return (
    <Modal isOpen title={`${request.reference} · ${request.absenceTypeName}`} description={periodLabel(request)} size="lg" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <WorkStatusBadge kind="absence" status={request.status} />
          {request.employeeName && !isOwner && <span className="text-sm text-text-secondary">{request.employeeName}</span>}
        </div>
        {request.reason && <p className="whitespace-pre-line text-sm text-text-secondary">{request.reason}</p>}
        {request.requiresAttachment && request.status === 'DRAFT' && <Alert variant="info">Este tipo de ausência exige um comprovativo anexado antes da submissão.</Alert>}
        <AttachmentsPanel
          entityType="ABSENCE"
          entityId={request.id}
          viewerId={viewerId}
          canUpload={isOwner && (request.status === 'DRAFT' || request.status === 'SUBMITTED')}
          canRemoveOthers={false}
          onChanged={onChanged}
        />
        <Panel title="Histórico" flush>
          {events.isLoading && !events.data && <LoadingState label="A carregar histórico..." />}
          {events.error && <p className="px-5 py-4 text-sm text-danger">{events.error}</p>}
          {events.data && <WorkTimeline events={events.data} />}
        </Panel>
      </div>
    </Modal>
  );
};
