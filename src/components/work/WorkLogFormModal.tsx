import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { LoadingState } from '../ui/States';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { listActiveActivities } from '../../services/timesheetService';
import { createWorkLog } from '../../services/work/workLogService';
import { listMyOpenTasks } from '../../services/work/taskService';
import { listMeetings } from '../../services/work/meetingService';
import { listActiveOpportunities } from '../../services/work/opportunityService';
import type { EntryKind } from '../../types/work';
import { isEntryKind } from '../../types/work';
import { formatMinutesAsHours } from '../../utils/format';
import type { WorkLogFormField, WorkLogFormValues } from '../../utils/work';
import { ENTRY_KIND_LABELS, minutesBetween, toDateInput, validateWorkLogForm } from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';

/** Pré-preenchimento quando a atividade nasce de uma tarefa ou reunião (sem duplicar dados). */
export interface WorkLogPreset {
  kind?: EntryKind;
  contextId?: string;
  contextLabel?: string;
  workDate?: string;
  startTime?: string;
  endTime?: string;
  description?: string;
}

interface WorkLogFormModalProps {
  isOpen: boolean;
  employeeId: string;
  preset?: WorkLogPreset;
  onClose: () => void;
  onSaved: () => void;
}

const SELECTABLE_KINDS: EntryKind[] = ['TASK', 'MEETING', 'OPPORTUNITY', 'UNPLANNED', 'GENERAL'];

function initialValues(preset: WorkLogPreset | undefined): WorkLogFormValues {
  return {
    workDate: preset?.workDate ?? toDateInput(new Date()),
    startTime: preset?.startTime ?? '09:00',
    endTime: preset?.endTime ?? '10:00',
    breakMinutes: '0',
    activityId: '',
    kind: preset?.kind ?? 'TASK',
    contextId: preset?.contextId ?? '',
    description: preset?.description ?? '',
  };
}

async function loadOptions(employeeId: string) {
  const [activities, tasks, meetings, opportunities] = await Promise.all([
    listActiveActivities(),
    listMyOpenTasks(employeeId),
    listMeetings({ scope: 'MINE', viewerId: employeeId, when: 'PAST', status: null, search: '', page: 1, pageSize: 30 }),
    listActiveOpportunities(),
  ]);
  return { activities, tasks, meetings: meetings.items.filter((meeting) => meeting.status !== 'CANCELLED'), opportunities };
}

export const WorkLogFormModal: React.FC<WorkLogFormModalProps> = ({ isOpen, employeeId, preset, onClose, onSaved }) => {
  const options = useAsyncData(() => (isOpen ? loadOptions(employeeId) : Promise.resolve(null)), [isOpen, employeeId]);
  const [values, setValues] = useState<WorkLogFormValues>(() => initialValues(preset));
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<WorkLogFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues(preset));
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, preset]);

  // O tipo de atividade por omissão é o primeiro do catálogo.
  useEffect(() => {
    const first = options.data?.activities[0];
    if (first) setValues((current) => (current.activityId ? current : { ...current, activityId: first.id }));
  }, [options.data]);

  const updateValue = (field: WorkLogFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value, ...(field === 'kind' ? { contextId: '' } : {}) }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const totalMinutes = values.startTime && values.endTime ? minutesBetween(values.startTime, values.endTime) - Number(values.breakMinutes || 0) : 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateWorkLogForm(values, toDateInput(new Date()));
    setFieldErrors(errors);
    if (hasErrors(errors) || !isEntryKind(values.kind)) return;
    setIsSubmitting(true);
    try {
      await createWorkLog(employeeId, {
        workDate: values.workDate,
        startTime: values.startTime,
        endTime: values.endTime,
        breakMinutes: Number(values.breakMinutes || 0),
        activityId: values.activityId,
        kind: values.kind,
        taskId: values.kind === 'TASK' ? values.contextId : null,
        meetingId: values.kind === 'MEETING' ? values.contextId : null,
        opportunityId: values.kind === 'OPPORTUNITY' ? values.contextId : null,
        description: values.description.trim(),
      });
      onSaved();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível registar a atividade.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const contextOptions = (() => {
    const data = options.data;
    if (!data) return [];
    if (values.kind === 'TASK') return data.tasks.map((task) => ({ value: task.id, label: `${task.reference} · ${task.title}` }));
    if (values.kind === 'MEETING') return data.meetings.map((meeting) => ({ value: meeting.id, label: meeting.title }));
    if (values.kind === 'OPPORTUNITY') return data.opportunities.map((item) => ({ value: item.id, label: `${item.reference} · ${item.title}` }));
    return [];
  })();
  // Um contexto pré-definido (ex.: reunião concluída hoje) pode não constar das listas resumidas.
  if (preset?.contextId && preset.contextLabel && values.kind === preset.kind && !contextOptions.some((option) => option.value === preset.contextId)) {
    contextOptions.unshift({ value: preset.contextId, label: preset.contextLabel });
  }

  const formId = 'work-log-form';
  return (
    <Modal
      isOpen={isOpen}
      title="Registar atividade"
      description="O tempo fica no seu timesheet do período, com o contexto indicado."
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting} disabled={!options.data}>
            Registar
          </Button>
        </>
      }
    >
      {options.isLoading && !options.data && <LoadingState label="A carregar opções..." />}
      {options.error && <Alert variant="error">{options.error}</Alert>}
      {options.data && (
        <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <SelectField label="Contexto" required value={values.kind} onChange={(event) => updateValue('kind', event.target.value)}>
              {SELECTABLE_KINDS.map((kind) => (
                <option key={kind} value={kind}>
                  {kind === 'GENERAL' ? 'Geral (sem contexto)' : ENTRY_KIND_LABELS[kind]}
                </option>
              ))}
            </SelectField>
            {['TASK', 'MEETING', 'OPPORTUNITY'].includes(values.kind) ? (
              <SelectField
                label={values.kind === 'TASK' ? 'Tarefa' : values.kind === 'MEETING' ? 'Reunião' : 'Oportunidade'}
                required
                value={values.contextId}
                error={fieldErrors.contextId}
                hint={contextOptions.length === 0 ? 'Não existem registos disponíveis.' : undefined}
                onChange={(event) => updateValue('contextId', event.target.value)}
              >
                <option value="">Selecione…</option>
                {contextOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </SelectField>
            ) : (
              <SelectField label="Tipo de atividade" required value={values.activityId} error={fieldErrors.activityId} onChange={(event) => updateValue('activityId', event.target.value)}>
                {options.data.activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </SelectField>
            )}
            {['TASK', 'MEETING', 'OPPORTUNITY'].includes(values.kind) && (
              <SelectField label="Tipo de atividade" required value={values.activityId} error={fieldErrors.activityId} onChange={(event) => updateValue('activityId', event.target.value)}>
                {options.data.activities.map((activity) => (
                  <option key={activity.id} value={activity.id}>
                    {activity.name}
                  </option>
                ))}
              </SelectField>
            )}
            <TextField label="Data" type="date" required value={values.workDate} error={fieldErrors.workDate} max={toDateInput(new Date())} onChange={(event) => updateValue('workDate', event.target.value)} />
            <TextField label="Início" type="time" required value={values.startTime} error={fieldErrors.startTime} onChange={(event) => updateValue('startTime', event.target.value)} />
            <TextField label="Fim" type="time" required value={values.endTime} error={fieldErrors.endTime} onChange={(event) => updateValue('endTime', event.target.value)} />
            <TextField
              label="Pausa (minutos)"
              type="number"
              min={0}
              value={values.breakMinutes}
              error={fieldErrors.breakMinutes}
              hint={totalMinutes > 0 ? `Tempo efetivo: ${formatMinutesAsHours(totalMinutes)}` : undefined}
              onChange={(event) => updateValue('breakMinutes', event.target.value)}
            />
          </div>
          <TextAreaField
            label={values.kind === 'UNPLANNED' ? 'Descrição da atividade extraordinária' : 'O que foi feito'}
            required
            rows={3}
            maxLength={2000}
            value={values.description}
            error={fieldErrors.description}
            hint={values.kind === 'UNPLANNED' ? 'Ex.: Intervenção urgente pedida pelo Diretor Financeiro.' : undefined}
            onChange={(event) => updateValue('description', event.target.value)}
          />
        </form>
      )}
    </Modal>
  );
};
