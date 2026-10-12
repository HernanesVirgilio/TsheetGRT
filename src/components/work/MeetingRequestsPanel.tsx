import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, MessagesSquare, XCircle } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { decideMeetingRequest, listPendingMeetingRequests } from '../../services/work/meetingService';
import type { MeetingSummary } from '../../types/work';
import { Panel } from '../ui/Panel';
import { Alert } from '../ui/Alert';
import { Button } from '../ui/Button';
import { DataTable } from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, LoadingState } from '../ui/States';
import { TicketNoteModal } from '../it/TicketActionModals';
import { dateTimeFormatter, formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

const timeFormatter = () => dateTimeFormatter({ hour: '2-digit', minute: '2-digit' });

/** Pedidos de reunião dirigidos a quem consulta: aceitar confirma a reunião; recusar exige o motivo. */
export const MeetingRequestsPanel: React.FC<{ viewerId: string; onChanged?: () => void }> = ({ viewerId, onChanged }) => {
  const requests = useAsyncData(() => listPendingMeetingRequests(viewerId), [viewerId]);
  const [toReject, setToReject] = useState<MeetingSummary | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const done = (text: string) => {
    setMessage({ variant: 'success', text });
    requests.reload();
    onChanged?.();
  };

  const accept = async (meeting: MeetingSummary) => {
    setPendingId(meeting.id);
    setMessage(null);
    try {
      await decideMeetingRequest(meeting.id, 'ACCEPTED', null);
      done(t('Pedido aceite. A reunião ficou confirmada e quem pediu foi notificado.'));
    } catch (error) {
      setMessage({ variant: 'error', text: getErrorMessage(error, t('Não foi possível registar a decisão.')) });
    } finally {
      setPendingId(null);
    }
  };

  const columns: DataTableColumn<MeetingSummary>[] = [
    {
      id: 'title',
      header: t('Pedido'),
      render: (meeting) => (
        <Link to={`/timesheet/meetings/${meeting.id}`} className="font-semibold text-text hover:underline">
          {meeting.title}
        </Link>
      ),
    },
    { id: 'requester', header: t('Pedido por'), render: (meeting) => meeting.organizerName ?? '—' },
    {
      id: 'when',
      header: t('Horário proposto'),
      render: (meeting) => (
        <span className="whitespace-nowrap">
          {formatDateTime(meeting.startsAt)}–{timeFormatter().format(new Date(meeting.endsAt))}
        </span>
      ),
    },
    { id: 'location', header: t('Local'), render: (meeting) => meeting.location ?? '—' },
    {
      id: 'actions',
      header: t('Decisão'),
      align: 'right',
      hideLabelOnMobile: true,
      render: (meeting) => (
        <div className="flex flex-wrap justify-end gap-1">
          <Button size="sm" variant="danger" icon={XCircle} onClick={() => setToReject(meeting)}>
            {t('Recusar')}
          </Button>
          <Button size="sm" icon={CheckCircle2} isLoading={pendingId === meeting.id} onClick={() => accept(meeting)}>
            {t('Aceitar')}
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <p className="text-sm text-text-secondary">{t('Pedidos de tempo feitos pela sua equipa. Reuniões normais entre colegas não precisam de aprovação.')}</p>
      {message && (
        <Alert variant={message.variant} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      <Panel flush>
        {requests.error && (
          <div className="p-4">
            <ErrorState message={requests.error} onRetry={requests.reload} />
          </div>
        )}
        {requests.isLoading && !requests.data && <LoadingState label={t('A carregar pedidos...')} />}
        {requests.data && requests.data.length === 0 && <EmptyState bordered={false} icon={MessagesSquare} title={t('Não há pedidos de reunião à espera da sua resposta.')} />}
        {requests.data && requests.data.length > 0 && <DataTable caption={t('Pedidos de reunião')} columns={columns} rows={requests.data} getRowKey={(meeting) => meeting.id} />}
      </Panel>
      <TicketNoteModal
        isOpen={toReject !== null}
        title={t('Recusar pedido de reunião')}
        description={t('Quem pediu é notificado com o motivo e pode propor outro horário.')}
        note={{ label: t('Motivo da recusa'), minLength: 5, maxLength: 1000 }}
        confirmLabel={t('Recusar pedido')}
        variant="danger"
        onClose={() => setToReject(null)}
        onConfirm={async (reason) => {
          if (!toReject) return;
          await decideMeetingRequest(toReject.id, 'REJECTED', reason);
          setToReject(null);
          done(t('Pedido recusado. Quem pediu foi notificado.'));
        }}
      />
    </>
  );
};
