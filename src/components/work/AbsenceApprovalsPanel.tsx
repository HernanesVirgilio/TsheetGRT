import React, { useState } from 'react';
import { CheckCircle2, Eye, Forward, Undo2, XCircle } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listTeamAbsences } from '../../services/work/absenceService';
import type { AbsenceDecision, AbsenceRequest, AbsenceValidation } from '../../types/work';
import { Panel } from '../ui/Panel';
import { Alert } from '../ui/Alert';
import { Button, IconButton } from '../ui/Button';
import { DataTable } from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, LoadingState } from '../ui/States';
import { AbsenceDecisionModal, AbsenceValidationModal } from './AbsenceModals';
import { AbsenceDetailModal, absencePeriodLabel } from './AbsenceDetailModal';
import { formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

interface AbsenceApprovalsPanelProps {
  viewerId: string;
  /** Decisão final (Manager) e validação (gestor da equipa) são permissões distintas. */
  canApprove: boolean;
  canValidate: boolean;
  /** Chamado depois de cada validação ou decisão (para atualizar contadores). */
  onChanged?: () => void;
}

const validationNote = (request: AbsenceRequest) =>
  request.validationComment ?? <span className="text-text-muted">{request.validatedAt ? t('Validado sem comentário') : t('Sem validação intermédia')}</span>;

/**
 * Ausências por validar (gestor da equipa) e por decidir (Manager), no centro de aprovações.
 * A autorização efetiva (âmbito, estado, sem autoaprovação) é do servidor.
 */
export const AbsenceApprovalsPanel: React.FC<AbsenceApprovalsPanelProps> = ({ viewerId, canApprove, canValidate, onChanged }) => {
  const toValidate = useAsyncData(() => (canValidate ? listTeamAbsences(viewerId, ['SUBMITTED']) : Promise.resolve([])), [viewerId, canValidate]);
  const awaitingDecision = useAsyncData(() => listTeamAbsences(viewerId, ['PENDING_APPROVAL']), [viewerId]);
  const [detail, setDetail] = useState<AbsenceRequest | null>(null);
  const [decision, setDecision] = useState<{ request: AbsenceRequest; decision: AbsenceDecision } | null>(null);
  const [validation, setValidation] = useState<{ request: AbsenceRequest; validation: AbsenceValidation } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const reload = () => {
    toValidate.reload();
    awaitingDecision.reload();
    onChanged?.();
  };

  const baseColumns: DataTableColumn<AbsenceRequest>[] = [
    { id: 'employee', header: t('Colaborador'), render: (request) => <span className="font-semibold text-text">{request.employeeName ?? '—'}</span> },
    { id: 'type', header: t('Tipo'), render: (request) => request.absenceTypeName },
    { id: 'period', header: t('Período'), render: (request) => absencePeriodLabel(request) },
    { id: 'submitted', header: t('Submetido'), render: (request) => formatDateTime(request.submittedAt) },
    { id: 'reason', header: t('Motivo'), className: 'min-w-48', render: (request) => request.reason || '—' },
  ];

  const validationColumns: DataTableColumn<AbsenceRequest>[] = [
    ...baseColumns,
    {
      id: 'actions',
      header: t('Validação'),
      align: 'right',
      hideLabelOnMobile: true,
      render: (request) => (
        <div className="flex flex-wrap justify-end gap-1">
          <IconButton icon={Eye} label={t('Ver {reference}', { reference: request.reference })} onClick={() => setDetail(request)} />
          <Button size="sm" variant="secondary" icon={Undo2} onClick={() => setValidation({ request, validation: 'CHANGES_REQUESTED' })}>
            {t('Pedir correção')}
          </Button>
          <Button size="sm" variant="secondary" icon={XCircle} onClick={() => setValidation({ request, validation: 'REJECTED' })}>
            {t('Rejeitar')}
          </Button>
          <Button size="sm" icon={Forward} onClick={() => setValidation({ request, validation: 'VALIDATED' })}>
            {t('Aprovar')}
          </Button>
        </div>
      ),
    },
  ];

  const decisionColumns: DataTableColumn<AbsenceRequest>[] = [
    ...baseColumns,
    { id: 'validation', header: t('Parecer do gestor'), className: 'min-w-40', render: validationNote },
    {
      id: 'actions',
      header: canApprove ? t('Decisão') : t('Ver'),
      align: 'right',
      hideLabelOnMobile: true,
      render: (request) => (
        <div className="flex flex-wrap justify-end gap-1">
          <IconButton icon={Eye} label={t('Ver {reference}', { reference: request.reference })} onClick={() => setDetail(request)} />
          {canApprove && (
            <>
              <Button size="sm" variant="secondary" icon={Undo2} onClick={() => setDecision({ request, decision: 'CHANGES_REQUESTED' })}>
                {t('Pedir correção')}
              </Button>
              <Button size="sm" variant="danger" icon={XCircle} onClick={() => setDecision({ request, decision: 'REJECTED' })}>
                {t('Rejeitar')}
              </Button>
              <Button size="sm" icon={CheckCircle2} onClick={() => setDecision({ request, decision: 'APPROVED' })}>
                {t('Aprovar')}
              </Button>
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      {canValidate && (
        <Panel title={t('A aguardar a sua validação')} description={t('Valide e encaminhe ao Manager, ou devolva ao colaborador.')} flush>
          {toValidate.error && (
            <div className="p-4">
              <ErrorState message={toValidate.error} onRetry={toValidate.reload} />
            </div>
          )}
          {toValidate.isLoading && !toValidate.data && <LoadingState label={t('A carregar pedidos...')} />}
          {toValidate.data && toValidate.data.length === 0 && <EmptyState bordered={false} icon={CheckCircle2} title={t('Não há pedidos da equipa por validar.')} />}
          {toValidate.data && toValidate.data.length > 0 && (
            <DataTable caption={t('Pedidos por validar')} columns={validationColumns} rows={toValidate.data} getRowKey={(request) => request.id} />
          )}
        </Panel>
      )}
      <Panel
        title={canApprove ? t('A aguardar a sua decisão') : t('A aguardar a decisão do Manager')}
        description={canApprove ? t('Pedidos validados pelos gestores (ou sem gestor intermédio).') : t('Pedidos da equipa já validados.')}
        flush
      >
        {awaitingDecision.error && (
          <div className="p-4">
            <ErrorState message={awaitingDecision.error} onRetry={awaitingDecision.reload} />
          </div>
        )}
        {awaitingDecision.isLoading && !awaitingDecision.data && <LoadingState label={t('A carregar pedidos...')} />}
        {awaitingDecision.data && awaitingDecision.data.length === 0 && <EmptyState bordered={false} icon={CheckCircle2} title={t('Não há pedidos a aguardar decisão.')} />}
        {awaitingDecision.data && awaitingDecision.data.length > 0 && (
          <DataTable
            caption={canApprove ? t('Pedidos por decidir') : t('Pedidos a aguardar o Manager')}
            columns={decisionColumns}
            rows={awaitingDecision.data}
            getRowKey={(request) => request.id}
          />
        )}
      </Panel>

      <AbsenceValidationModal
        request={validation?.request ?? null}
        validation={validation?.validation ?? null}
        onClose={() => setValidation(null)}
        onValidated={(text) => {
          setValidation(null);
          setMessage(text);
          reload();
        }}
      />
      <AbsenceDecisionModal
        request={decision?.request ?? null}
        decision={decision?.decision ?? null}
        onClose={() => setDecision(null)}
        onDecided={(text) => {
          setDecision(null);
          setMessage(text);
          reload();
        }}
      />
      {detail && <AbsenceDetailModal request={detail} viewerId={viewerId} onClose={() => setDetail(null)} onChanged={reload} />}
    </>
  );
};
