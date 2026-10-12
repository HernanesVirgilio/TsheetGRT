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
import { listMyLeads, requestMeeting } from '../../services/work/meetingService';
import type { MeetingDetail } from '../../types/work';
import type { MeetingFormField, MeetingFormValues } from '../../utils/work';
import { addDays, combineDateTime, initialMeetingValues, toDateInput, validateMeetingForm } from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';
import { t } from '../../lib/i18n';

interface MeetingRequestModalProps {
  isOpen: boolean;
  /** Pedido recusado a partir do qual se propõe outro horário (assunto, agenda e chefia mantêm-se). */
  basedOn?: MeetingDetail | null;
  onClose: () => void;
  onSent: (meetingId: string) => void;
}

/**
 * Pedido de reunião a uma chefia configurada: fica pendente até ser aceite ou recusado. Uma reunião
 * normal com colegas não passa por aqui (usa "Agendar reunião", sem aprovação).
 */
export const MeetingRequestModal: React.FC<MeetingRequestModalProps> = ({ isOpen, basedOn = null, onClose, onSent }) => {
  const leads = useAsyncData(() => (isOpen ? listMyLeads() : Promise.resolve([])), [isOpen]);
  const [leadId, setLeadId] = useState('');
  const [values, setValues] = useState<MeetingFormValues>(() => initialMeetingValues(null, toDateInput(addDays(new Date(), 1))));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<MeetingFormField | 'leadId'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const base = initialMeetingValues(null, toDateInput(addDays(new Date(), 1)));
    setValues(basedOn ? { ...base, title: basedOn.title, description: basedOn.description, location: basedOn.location ?? '', meetingUrl: basedOn.meetingUrl ?? '' } : base);
    setLeadId(basedOn?.requestedWith ?? '');
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, basedOn]);

  useEffect(() => {
    if (!leadId && leads.data && leads.data.length > 0) setLeadId(leads.data[0].profileId);
  }, [leadId, leads.data]);

  const update = (field: MeetingFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors: FieldErrors<MeetingFormField | 'leadId'> = validateMeetingForm(values);
    if (!leadId) errors.leadId = t('Escolha a quem pede a reunião.');
    const startsAt = combineDateTime(values.date, values.startTime);
    const endsAt = combineDateTime(values.date, values.endTime);
    if (startsAt && startsAt.getTime() <= Date.now()) errors.date = t('Proponha uma data futura.');
    setFieldErrors(errors);
    if (hasErrors(errors) || !startsAt || !endsAt) return;
    setIsSubmitting(true);
    try {
      const meetingId = await requestMeeting({
        leadId,
        title: values.title.trim(),
        startsAt: startsAt.toISOString(),
        endsAt: endsAt.toISOString(),
        agenda: values.description.trim(),
        location: values.location.trim() || null,
        meetingUrl: values.meetingUrl.trim() || null,
      });
      onSent(meetingId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível enviar o pedido de reunião.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'meeting-request-form';
  const hasLeads = (leads.data?.length ?? 0) > 0;
  return (
    <Modal
      isOpen={isOpen}
      title={basedOn ? t('Propor outro horário') : t('Solicitar reunião')}
      description={t('O pedido segue para a chefia escolhida, que o aceita ou recusa. Ao ser aceite, a reunião fica confirmada nos dois calendários.')}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting} disabled={!hasLeads}>
            {t('Enviar pedido')}
          </Button>
        </>
      }
    >
      {leads.isLoading && !leads.data && <LoadingState label={t('A carregar as suas chefias...')} />}
      {leads.error && <Alert variant="error">{leads.error}</Alert>}
      {leads.data && !hasLeads && (
        <EmptyState
          icon={UserX}
          title={t('Ainda não tem uma chefia configurada.')}
          message={t('A relação com a chefia é configurada pela administração. Entretanto, pode agendar uma reunião normal com colegas.')}
        />
      )}
      {hasLeads && (
        <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          {basedOn?.requestDecisionComment && (
            <Alert variant="warning" title={t('Motivo da recusa anterior')}>
              {basedOn.requestDecisionComment}
            </Alert>
          )}
          <SelectField label={t('Pedir a')} required value={leadId} error={fieldErrors.leadId} onChange={(event) => setLeadId(event.target.value)}>
            {(leads.data ?? []).map((lead) => (
              <option key={lead.profileId} value={lead.profileId}>
                {lead.fullName}
                {lead.jobTitle ? ` · ${lead.jobTitle}` : ''}
              </option>
            ))}
          </SelectField>
          <TextField label={t('Assunto')} required maxLength={200} value={values.title} error={fieldErrors.title} onChange={(event) => update('title', event.target.value)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField label={t('Data')} type="date" required value={values.date} error={fieldErrors.date} onChange={(event) => update('date', event.target.value)} />
            <TextField label={t('Início')} type="time" required value={values.startTime} error={fieldErrors.startTime} onChange={(event) => update('startTime', event.target.value)} />
            <TextField label={t('Fim')} type="time" required value={values.endTime} error={fieldErrors.endTime} onChange={(event) => update('endTime', event.target.value)} />
          </div>
          <TextAreaField label={t('Motivo ou agenda')} rows={3} maxLength={5000} value={values.description} onChange={(event) => update('description', event.target.value)} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label={t('Local')} maxLength={200} value={values.location} error={fieldErrors.location} onChange={(event) => update('location', event.target.value)} />
            <TextField label={t('Ligação da reunião')} type="url" maxLength={500} value={values.meetingUrl} error={fieldErrors.meetingUrl} onChange={(event) => update('meetingUrl', event.target.value)} />
          </div>
        </form>
      )}
    </Modal>
  );
};
