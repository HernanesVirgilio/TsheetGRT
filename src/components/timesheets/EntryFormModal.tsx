import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { saveTimesheetEntry } from '../../services/timesheetService';
import type { TimesheetEntryDetail } from '../../services/timesheetService';
import type { Activity, TimesheetSummary } from '../../types';
import { formatMinutesAsHours } from '../../utils/format';
import type { EntryFormField, EntryFormValues } from '../../utils/timesheets';
import { calculateEntryMinutes, validateEntryForm } from '../../utils/timesheets';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';

const DEFAULT_START_TIME = '08:00';
const DEFAULT_END_TIME = '17:00';
const DEFAULT_BREAK_MINUTES = '60';

interface EntryFormModalProps {
  isOpen: boolean;
  timesheet: TimesheetSummary;
  entry: TimesheetEntryDetail | null;
  activities: Activity[];
  onClose: () => void;
  onSaved: (message: string) => void;
}

function initialValues(timesheet: TimesheetSummary, entry: TimesheetEntryDetail | null, activities: Activity[]): EntryFormValues {
  if (entry) {
    return {
      workDate: entry.workDate,
      activityId: entry.activityId,
      startTime: entry.startTime,
      endTime: entry.endTime,
      breakMinutes: String(entry.breakMinutes),
      description: entry.description,
    };
  }
  return {
    workDate: timesheet.periodStart,
    activityId: activities[0]?.id ?? '',
    startTime: DEFAULT_START_TIME,
    endTime: DEFAULT_END_TIME,
    breakMinutes: DEFAULT_BREAK_MINUTES,
    description: '',
  };
}

export const EntryFormModal: React.FC<EntryFormModalProps> = ({ isOpen, timesheet, entry, activities, onClose, onSaved }) => {
  const [values, setValues] = useState<EntryFormValues>(() => initialValues(timesheet, entry, activities));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<EntryFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues(timesheet, entry, activities));
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, timesheet, entry, activities]);

  const updateValue = (field: EntryFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const previewMinutes = calculateEntryMinutes(values.startTime, values.endTime, Number(values.breakMinutes) || 0);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateEntryForm(values, { start: timesheet.periodStart, end: timesheet.periodEnd });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    try {
      await saveTimesheetEntry(
        timesheet.id,
        timesheet.employeeId,
        {
          workDate: values.workDate,
          activityId: values.activityId,
          startTime: values.startTime,
          endTime: values.endTime,
          breakMinutes: Number(values.breakMinutes),
          description: values.description.trim(),
        },
        entry?.id
      );
      onSaved(entry ? 'Registo de horas atualizado.' : 'Registo de horas adicionado.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar o registo de horas.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'entry-form';

  return (
    <Modal
      isOpen={isOpen}
      title={entry ? 'Editar registo de horas' : 'Novo registo de horas'}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            Guardar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {activities.length === 0 && (
          <Alert variant="warning">Não existem atividades ativas. Contacte a administração.</Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label="Data"
            type="date"
            required
            min={timesheet.periodStart}
            max={timesheet.periodEnd}
            value={values.workDate}
            error={fieldErrors.workDate}
            onChange={(event) => updateValue('workDate', event.target.value)}
          />
          <SelectField
            label="Atividade"
            required
            value={values.activityId}
            error={fieldErrors.activityId}
            onChange={(event) => updateValue('activityId', event.target.value)}
          >
            <option value="">Selecione…</option>
            {activities.map((activity) => (
              <option key={activity.id} value={activity.id}>
                {activity.name}
              </option>
            ))}
          </SelectField>
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField
            label="Início"
            type="time"
            required
            value={values.startTime}
            error={fieldErrors.startTime}
            onChange={(event) => updateValue('startTime', event.target.value)}
          />
          <TextField
            label="Fim"
            type="time"
            required
            value={values.endTime}
            error={fieldErrors.endTime}
            onChange={(event) => updateValue('endTime', event.target.value)}
          />
          <TextField
            label="Pausa (min)"
            type="number"
            inputMode="numeric"
            min={0}
            required
            value={values.breakMinutes}
            error={fieldErrors.breakMinutes}
            onChange={(event) => updateValue('breakMinutes', event.target.value)}
          />
        </div>
        <p className="text-sm text-text-secondary">
          Tempo efetivo: <strong className="text-text">{formatMinutesAsHours(Math.max(previewMinutes, 0))}</strong>
        </p>
        <TextAreaField
          label="Descrição das tarefas"
          required
          rows={3}
          value={values.description}
          error={fieldErrors.description}
          onChange={(event) => updateValue('description', event.target.value)}
        />
      </form>
    </Modal>
  );
};
