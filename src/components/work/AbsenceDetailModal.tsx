import React from 'react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listAbsenceEvents } from '../../services/work/absenceService';
import type { AbsenceRequest } from '../../types/work';
import { Modal } from '../ui/Modal';
import { Alert } from '../ui/Alert';
import { Panel } from '../ui/Panel';
import { LoadingState } from '../ui/States';
import { WorkStatusBadge } from './WorkStatusBadge';
import { WorkTimeline } from './WorkTimeline';
import { AttachmentsPanel } from './AttachmentsPanel';
import { daysBetween } from '../../utils/work';
import { formatDate, formatDateTime, pluralize } from '../../utils/format';
import { t } from '../../lib/i18n';

export function absencePeriodLabel(request: Pick<AbsenceRequest, 'startDate' | 'endDate'>): string {
  const days = daysBetween(request.startDate, request.endDate) + 1;
  const range = request.startDate === request.endDate ? formatDate(request.startDate) : t('{start} a {end}', { start: formatDate(request.startDate), end: formatDate(request.endDate) });
  return `${range} (${pluralize(days, 'dia', 'dias')})`;
}

interface AbsenceDetailModalProps {
  request: AbsenceRequest;
  viewerId: string;
  onClose: () => void;
  onChanged: () => void;
}

/** Detalhe de um pedido ou comunicação de ausência: estado, parecer, anexos e histórico guardado. */
export const AbsenceDetailModal: React.FC<AbsenceDetailModalProps> = ({ request, viewerId, onClose, onChanged }) => {
  const events = useAsyncData(() => listAbsenceEvents(request.id), [request.id]);
  const isOwner = request.employeeId === viewerId;
  return (
    <Modal isOpen title={`${request.reference} · ${request.absenceTypeName}`} description={absencePeriodLabel(request)} size="lg" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-2">
          <WorkStatusBadge kind="absence" status={request.status} />
          {request.employeeName && !isOwner && <span className="text-sm text-text-secondary">{request.employeeName}</span>}
        </div>
        {request.kind === 'NOTICE' && (
          <Alert variant="info">{t('Ausência comunicada: informa a equipa e as chefias, mas não é uma ausência aprovada.')}</Alert>
        )}
        {request.reason && <p className="whitespace-pre-line text-sm text-text-secondary">{request.reason}</p>}
        {request.validatedAt && (
          <p className="text-sm text-text-secondary">
            {t('Validado pelo gestor em {date}', { date: formatDateTime(request.validatedAt) })}
            {request.validationComment ? `: ${request.validationComment}` : '.'}
          </p>
        )}
        {request.requiresAttachment && request.status === 'DRAFT' && <Alert variant="info">{t('Este tipo de ausência exige um comprovativo anexado antes da submissão.')}</Alert>}
        {request.kind === 'REQUEST' && (
          <AttachmentsPanel
            entityType="ABSENCE"
            entityId={request.id}
            viewerId={viewerId}
            canUpload={isOwner && (request.status === 'DRAFT' || request.status === 'SUBMITTED')}
            canRemoveOthers={false}
            onChanged={onChanged}
          />
        )}
        <Panel title={t('Histórico')} flush>
          {events.isLoading && !events.data && <LoadingState label={t('A carregar histórico...')} />}
          {events.error && <p className="px-5 py-4 text-sm text-danger">{events.error}</p>}
          {events.data && <WorkTimeline events={events.data} />}
        </Panel>
      </div>
    </Modal>
  );
};
