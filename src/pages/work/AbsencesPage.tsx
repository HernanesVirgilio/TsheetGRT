import React, { useState } from 'react';
import { Link, Navigate, useSearchParams } from 'react-router-dom';
import { CalendarOff, Eye, Megaphone, Pencil, Plus, Send, Undo2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { cancelAbsence, listAbsenceTypes, listMyAbsences, submitAbsence } from '../../services/work/absenceService';
import type { AbsenceRequest } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { TicketNoteModal } from '../../components/it/TicketActionModals';
import { WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { AbsenceFormModal } from '../../components/work/AbsenceModals';
import { AbsenceDetailModal, absencePeriodLabel } from '../../components/work/AbsenceDetailModal';
import { toDateInput } from '../../utils/work';
import { t } from '../../lib/i18n';

type FormMode = 'REQUEST' | 'NOTICE';

/**
 * Disponibilidade pessoal: pedidos formais de ausência (rascunho → validação → decisão) e, para quem
 * gere equipa, a comunicação de indisponibilidade sem aprovação. As decisões sobre pedidos da equipa
 * estão no centro de aprovações; a disponibilidade da equipa está no módulo Equipa.
 */
export const AbsencesPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const [searchParams] = useSearchParams();
  const viewerId = currentUser?.id ?? '';
  const canDecideTeam = hasPermission('TIMESHEET_ABSENCE_APPROVE') || hasPermission('TIMESHEET_ABSENCE_VALIDATE');
  const canNotify = hasPermission('TIMESHEET_ABSENCE_NOTIFY');
  // Quem gere equipa comunica a ausência; o pedido formal (com aprovação) é dos colaboradores.
  const canRequest = hasPermission('TIMESHEET_ABSENCE_CREATE');
  const types = useAsyncData(listAbsenceTypes, []);
  const mine = useAsyncData(() => listMyAbsences(viewerId), [viewerId]);

  const [form, setForm] = useState<{ mode: FormMode; request: AbsenceRequest | null } | null>(null);
  const [detail, setDetail] = useState<AbsenceRequest | null>(null);
  const [toCancel, setToCancel] = useState<AbsenceRequest | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  // Ligações antigas (notificações já enviadas) para o separador da equipa.
  if (searchParams.get('tab') === 'TEAM') {
    return <Navigate to={canDecideTeam ? '/approvals?tab=absences' : '/team?tab=availability'} replace />;
  }

  const submit = async (request: AbsenceRequest) => {
    setPendingId(request.id);
    setMessage(null);
    try {
      await submitAbsence(request.id);
      setMessage({ variant: 'success', text: t('Pedido {reference} submetido. O estado é atualizado nesta página a cada etapa.', { reference: request.reference }) });
      mine.reload();
    } catch (error) {
      setMessage({ variant: 'error', text: getErrorMessage(error, t('Não foi possível submeter o pedido.')) });
    } finally {
      setPendingId(null);
    }
  };

  const today = toDateInput(new Date());
  const canCancel = (request: AbsenceRequest) =>
    ['DRAFT', 'SUBMITTED', 'PENDING_APPROVAL'].includes(request.status) ||
    (request.status === 'APPROVED' && request.startDate > today) ||
    (request.status === 'COMMUNICATED' && request.endDate >= today);

  const columns: DataTableColumn<AbsenceRequest>[] = [
    { id: 'reference', header: t('Registo'), render: (request) => <span className="font-semibold text-text">{request.reference}</span> },
    { id: 'type', header: t('Tipo'), render: (request) => request.absenceTypeName },
    { id: 'period', header: t('Período'), render: (request) => absencePeriodLabel(request) },
    { id: 'status', header: t('Estado'), render: (request) => <WorkStatusBadge kind="absence" status={request.status} /> },
    {
      id: 'comment',
      header: t('Observações'),
      className: 'min-w-48',
      render: (request) => request.decisionComment ?? request.validationComment ?? <span className="text-text-muted">—</span>,
    },
    {
      id: 'actions',
      header: t('Ações'),
      align: 'right',
      hideLabelOnMobile: true,
      render: (request) => (
        <div className="flex flex-wrap justify-end gap-1">
          <IconButton icon={Eye} label={t('Ver {reference}', { reference: request.reference })} onClick={() => setDetail(request)} />
          {request.status === 'DRAFT' && canRequest && (
            <>
              <IconButton
                icon={Pencil}
                label={t('Corrigir {reference}', { reference: request.reference })}
                onClick={() => setForm({ mode: 'REQUEST', request })}
              />
              <Button size="sm" icon={Send} isLoading={pendingId === request.id} onClick={() => submit(request)}>
                {t('Submeter')}
              </Button>
            </>
          )}
          {canCancel(request) && (
            <IconButton icon={Undo2} tone="danger" label={t('Cancelar {reference}', { reference: request.reference })} onClick={() => setToCancel(request)} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Disponibilidade')}
        subtitle={t('Férias, doença, licenças e outras ausências. Um pedido segue para validação e decisão; uma comunicação apenas informa.')}
        actions={
          <>
            {canNotify && (
              <Button variant="secondary" icon={Megaphone} disabled={!types.data} onClick={() => setForm({ mode: 'NOTICE', request: null })}>
                {t('Comunicar ausência')}
              </Button>
            )}
            {canRequest && (
              <Button icon={Plus} disabled={!types.data} onClick={() => setForm({ mode: 'REQUEST', request: null })}>
                {t('Solicitar ausência')}
              </Button>
            )}
          </>
        }
      />

      {(canDecideTeam || hasPermission('TEAM_READ')) && (
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-text-secondary">
          {hasPermission('TEAM_READ') && (
            <Link to="/team?tab=availability" className="font-medium text-primary-hover hover:underline">
              {t('Disponibilidade da equipa')}
            </Link>
          )}
          {canDecideTeam && (
            <Link to="/approvals?tab=absences" className="font-medium text-primary-hover hover:underline">
              {t('Pedidos da equipa por decidir')}
            </Link>
          )}
        </p>
      )}

      {message && (
        <Alert variant={message.variant} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}

      <Panel flush>
        {mine.error && (
          <div className="p-4">
            <ErrorState message={mine.error} onRetry={mine.reload} />
          </div>
        )}
        {mine.isLoading && !mine.data && <LoadingState label={t('A carregar pedidos...')} />}
        {mine.data && mine.data.length === 0 && (
          <EmptyState
            bordered={false}
            icon={CalendarOff}
            title={t('Ainda não registou ausências.')}
            message={t('Crie um pedido, anexe comprovativos quando necessário e submeta-o. O estado é atualizado aqui a cada etapa.')}
          />
        )}
        {mine.data && mine.data.length > 0 && <DataTable caption={t('As suas ausências')} columns={columns} rows={mine.data} getRowKey={(request) => request.id} />}
      </Panel>

      <AbsenceFormModal
        isOpen={form !== null}
        mode={form?.mode ?? 'REQUEST'}
        request={form?.request ?? null}
        types={types.data ?? []}
        onClose={() => setForm(null)}
        onSaved={() => {
          const wasNotice = form?.mode === 'NOTICE';
          setForm(null);
          setMessage({
            variant: 'success',
            text: wasNotice
              ? t('Ausência comunicada às suas chefias e à sua equipa direta.')
              : t('Pedido guardado em rascunho. Anexe comprovativos se necessário e submeta-o.'),
          });
          mine.reload();
        }}
      />
      <TicketNoteModal
        isOpen={toCancel !== null}
        title={toCancel ? t('Cancelar {reference}', { reference: toCancel.reference }) : t('Cancelar pedido')}
        description={toCancel?.status === 'APPROVED' ? t('A ausência já foi aprovada: o gestor da equipa e quem decidiu são notificados.') : undefined}
        note={toCancel?.status === 'APPROVED' ? { label: t('Motivo do cancelamento'), minLength: 5, maxLength: 1000 } : { label: t('Motivo (opcional)'), maxLength: 1000 }}
        confirmLabel={t('Cancelar pedido')}
        variant="danger"
        onClose={() => setToCancel(null)}
        onConfirm={async (reason) => {
          if (!toCancel) return;
          await cancelAbsence(toCancel.id, reason);
          setToCancel(null);
          setMessage({ variant: 'success', text: t('Pedido cancelado.') });
          mine.reload();
        }}
      />
      {detail && <AbsenceDetailModal request={detail} viewerId={viewerId} onClose={() => setDetail(null)} onChanged={mine.reload} />}
    </div>
  );
};
