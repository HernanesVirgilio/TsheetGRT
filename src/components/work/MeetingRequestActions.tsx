import React, { useEffect, useState } from 'react';
import { UserX } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { EmptyState } from '../ui/EmptyState';
import { LoadingState } from '../ui/States';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { decideMeetingRequest, listMyLeads, requestMeetingParticipation } from '../../services/work/meetingService';
import type { MeetingDetail } from '../../types/work';
import { combineDateTime, toDateInput, toTimeInput } from '../../utils/work';
import { t } from '../../lib/i18n';

interface LeadRequestModalProps {
  meeting: MeetingDetail | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/**
 * Pedir (de novo) a participação de uma chefia configurada numa reunião existente — por exemplo, depois de
 * uma recusa, ajustando antes o horário com "Editar". Só quem organiza; a validação final é do servidor.
 */
export const LeadRequestModal: React.FC<LeadRequestModalProps> = ({ meeting, onClose, onDone }) => {
  const isOpen = meeting !== null;
  const leads = useAsyncData(() => (isOpen ? listMyLeads() : Promise.resolve([])), [isOpen]);
  const [leadId, setLeadId] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMessage(null);
    setLeadId(meeting?.requestedWith ?? '');
  }, [isOpen, meeting]);

  useEffect(() => {
    if (!leadId && leads.data && leads.data.length > 0) setLeadId(leads.data[0].profileId);
  }, [leadId, leads.data]);

  const submit = async () => {
    if (!meeting || !leadId || isSubmitting) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await requestMeetingParticipation(meeting.id, leadId);
      const name = leads.data?.find((lead) => lead.profileId === leadId)?.fullName ?? '';
      onDone(t('Pedido de participação enviado a {name}.', { name }));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível enviar o pedido de participação.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const hasLeads = (leads.data?.length ?? 0) > 0;
  return (
    <Modal
      isOpen={isOpen}
      title={t('Pedir participação')}
      description={t('A chefia recebe o pedido para o horário atual da reunião. Se precisar de outro horário, edite a reunião antes de pedir.')}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button onClick={submit} isLoading={isSubmitting} disabled={!hasLeads || !leadId}>
            {t('Enviar pedido')}
          </Button>
        </>
      }
    >
      <div className="space-y-4">
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {leads.isLoading && !leads.data && <LoadingState label={t('A carregar as suas chefias...')} />}
        {leads.error && <Alert variant="error">{leads.error}</Alert>}
        {leads.data && !hasLeads && (
          <EmptyState icon={UserX} title={t('Ainda não tem uma chefia configurada.')} message={t('A relação com a chefia é configurada por um administrador autorizado.')} />
        )}
        {hasLeads && (
          <SelectField label={t('Pedir a participação de')} value={leadId} onChange={(event) => setLeadId(event.target.value)}>
            {(leads.data ?? []).map((lead) => (
              <option key={lead.profileId} value={lead.profileId}>
                {lead.fullName}
                {lead.jobTitle ? ` · ${lead.jobTitle}` : ''}
              </option>
            ))}
          </SelectField>
        )}
      </div>
    </Modal>
  );
};

interface ProposeTimeModalProps {
  meeting: MeetingDetail | null;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** A chefia a quem foi pedida a participação propõe outro horário; quem organiza aceita ou recusa. */
export const ProposeTimeModal: React.FC<ProposeTimeModalProps> = ({ meeting, onClose, onDone }) => {
  const isOpen = meeting !== null;
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [comment, setComment] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!meeting) return;
    setDate(toDateInput(new Date(meeting.startsAt)));
    setStartTime(toTimeInput(new Date(meeting.startsAt)));
    setEndTime(toTimeInput(new Date(meeting.endsAt)));
    setComment('');
    setErrorMessage(null);
  }, [meeting]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!meeting || isSubmitting) return;
    const startsAt = combineDateTime(date, startTime);
    const endsAt = combineDateTime(date, endTime);
    if (!startsAt || !endsAt || endsAt <= startsAt) {
      setErrorMessage(t('A reunião tem de terminar depois de começar.'));
      return;
    }
    if (startsAt.getTime() <= Date.now()) {
      setErrorMessage(t('Proponha uma data futura.'));
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await decideMeetingRequest(meeting.id, 'RESCHEDULE', comment.trim() || null, { startsAt: startsAt.toISOString(), endsAt: endsAt.toISOString() });
      onDone(t('Novo horário proposto. Quem organiza foi notificado e decide se o aceita.'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível registar a decisão.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'propose-time-form';
  return (
    <Modal
      isOpen={isOpen}
      title={t('Propor outro horário')}
      description={t('A participação fica pendente até quem organiza aceitar o novo horário.')}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {t('Propor horário')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label={t('Data')} type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          <TextField label={t('Início')} type="time" required value={startTime} onChange={(event) => setStartTime(event.target.value)} />
          <TextField label={t('Fim')} type="time" required value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </div>
        <TextAreaField label={t('Comentário (opcional)')} rows={2} maxLength={1000} value={comment} onChange={(event) => setComment(event.target.value)} />
      </form>
    </Modal>
  );
};
