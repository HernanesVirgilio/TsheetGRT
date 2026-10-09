import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField, TextField } from '../ui/FormField';
import { PeoplePicker } from './PeoplePicker';
import { getErrorMessage } from '../../lib/errors';
import { createMeeting, updateMeeting } from '../../services/work/meetingService';
import type { MeetingDetail, WorkPerson } from '../../types/work';
import type { MeetingFormField, MeetingFormValues } from '../../utils/work';
import { combineDateTime, toDateInput, toTimeInput, validateMeetingForm } from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';

interface MeetingFormModalProps {
  isOpen: boolean;
  /** Null = nova reunião. */
  meeting: MeetingDetail | null;
  participantIds: string[];
  people: WorkPerson[];
  links?: { taskId?: string | null; opportunityId?: string | null };
  contextLabel?: string;
  defaultDate?: string;
  onClose: () => void;
  onSaved: (meetingId: string, message: string) => void;
}

function initialValues(meeting: MeetingDetail | null, defaultDate?: string): MeetingFormValues {
  const start = meeting ? new Date(meeting.startsAt) : null;
  const end = meeting ? new Date(meeting.endsAt) : null;
  return {
    title: meeting?.title ?? '',
    date: start ? toDateInput(start) : (defaultDate ?? toDateInput(new Date())),
    startTime: start ? toTimeInput(start) : '10:00',
    endTime: end ? toTimeInput(end) : '11:00',
    location: meeting?.location ?? '',
    meetingUrl: meeting?.meetingUrl ?? '',
    objective: meeting?.objective ?? '',
    description: meeting?.description ?? '',
  };
}

export const MeetingFormModal: React.FC<MeetingFormModalProps> = ({
  isOpen,
  meeting,
  participantIds,
  people,
  links,
  contextLabel,
  defaultDate,
  onClose,
  onSaved,
}) => {
  const [values, setValues] = useState<MeetingFormValues>(() => initialValues(meeting, defaultDate));
  const [selected, setSelected] = useState<string[]>(participantIds);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<MeetingFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues(meeting, defaultDate));
    setSelected(participantIds);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, meeting, participantIds, defaultDate]);

  const updateValue = (field: MeetingFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateMeetingForm(values);
    setFieldErrors(errors);
    const startsAt = combineDateTime(values.date, values.startTime);
    const endsAt = combineDateTime(values.date, values.endTime);
    if (hasErrors(errors) || !startsAt || !endsAt) return;
    const input = {
      title: values.title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      description: values.description.trim(),
      objective: values.objective.trim(),
      location: values.location.trim() || null,
      meetingUrl: values.meetingUrl.trim() || null,
      participantIds: selected,
    };
    setIsSubmitting(true);
    try {
      if (meeting) {
        await updateMeeting(meeting.id, input, meeting.updatedAt);
        onSaved(meeting.id, 'Reunião atualizada. Os participantes são notificados se o horário mudou.');
      } else {
        const meetingId = await createMeeting(input, links);
        onSaved(meetingId, 'Reunião criada. Os participantes foram convidados.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar a reunião.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'meeting-form';
  return (
    <Modal
      isOpen={isOpen}
      title={meeting ? 'Editar reunião' : 'Nova reunião'}
      description={contextLabel}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {meeting ? 'Guardar alterações' : 'Criar reunião'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField label="Título" required maxLength={200} value={values.title} error={fieldErrors.title} onChange={(event) => updateValue('title', event.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Data" type="date" required value={values.date} error={fieldErrors.date} onChange={(event) => updateValue('date', event.target.value)} />
          <TextField label="Início" type="time" required value={values.startTime} error={fieldErrors.startTime} onChange={(event) => updateValue('startTime', event.target.value)} />
          <TextField label="Fim" type="time" required value={values.endTime} error={fieldErrors.endTime} onChange={(event) => updateValue('endTime', event.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Local" maxLength={200} value={values.location} error={fieldErrors.location} onChange={(event) => updateValue('location', event.target.value)} />
          <TextField
            label="Ligação (videoconferência)"
            type="url"
            maxLength={500}
            value={values.meetingUrl}
            error={fieldErrors.meetingUrl}
            placeholder="https://"
            onChange={(event) => updateValue('meetingUrl', event.target.value)}
          />
        </div>
        <TextAreaField label="Objetivo" rows={2} maxLength={2000} value={values.objective} onChange={(event) => updateValue('objective', event.target.value)} />
        <TextAreaField label="Descrição / agenda" rows={3} maxLength={5000} value={values.description} onChange={(event) => updateValue('description', event.target.value)} />
        <PeoplePicker label="Participantes" people={people} selectedIds={selected} onChange={setSelected} hint="Recebem um convite por notificação." />
      </form>
    </Modal>
  );
};
