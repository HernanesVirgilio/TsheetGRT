import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { createTask, updateTask } from '../../services/work/taskService';
import type { TaskDetail, WorkPerson } from '../../types/work';
import { isWorkPriority, WORK_PRIORITIES } from '../../types/work';
import type { TaskFormField, TaskFormValues } from '../../utils/work';
import {
  combineDateTime,
  estimatedMinutesFromHours,
  toDateInput,
  toTimeInput,
  validateReason,
  validateTaskForm,
  WORK_PRIORITY_LABELS,
} from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';

/** Ligações de uma tarefa nova (tarefa adicional, oportunidade, reunião de origem). */
export interface TaskLinks {
  parentTaskId?: string | null;
  opportunityId?: string | null;
  meetingId?: string | null;
}

interface TaskFormModalProps {
  isOpen: boolean;
  /** Null = nova tarefa. */
  task: TaskDetail | null;
  /** Responsáveis possíveis (âmbito de quem atribui). Vazio esconde a escolha. */
  assignees: WorkPerson[];
  links?: TaskLinks;
  /** Contexto mostrado no topo (ex.: "Tarefa adicional de TAR-00012"). */
  contextLabel?: string;
  onClose: () => void;
  onSaved: (taskId: string, message: string) => void;
}

function initialValues(task: TaskDetail | null): TaskFormValues {
  const due = task?.dueAt ? new Date(task.dueAt) : null;
  return {
    title: task?.title ?? '',
    description: task?.description ?? '',
    priority: task?.priority ?? 'MEDIUM',
    assigneeId: task?.assigneeId ?? '',
    dueDate: due ? toDateInput(due) : '',
    dueTime: due ? toTimeInput(due) : '17:00',
    startDate: task?.startDate ?? '',
    estimatedHours: task?.estimatedMinutes ? String(Math.round((task.estimatedMinutes / 60) * 100) / 100).replace('.', ',') : '',
  };
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({ isOpen, task, assignees, links, contextLabel, onClose, onSaved }) => {
  const [values, setValues] = useState<TaskFormValues>(() => initialValues(task));
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<TaskFormField | 'reason'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCompleted = task?.status === 'COMPLETED';

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues(task));
    setReason('');
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, task]);

  const updateValue = (field: TaskFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const original = initialValues(task);
    const dueChanged = values.dueDate !== original.dueDate || values.dueTime !== original.dueTime;
    const errors: FieldErrors<TaskFormField | 'reason'> = validateTaskForm(values, new Date(), { isCompleted, dueChanged: task ? dueChanged : true });
    const reasonError = isCompleted ? validateReason(reason, 'Indique o motivo da alteração de uma tarefa concluída') : null;
    if (reasonError) errors.reason = reasonError;
    setFieldErrors(errors);
    if (hasErrors(errors) || !isWorkPriority(values.priority)) return;

    const due = combineDateTime(values.dueDate, values.dueTime || '17:00');
    setIsSubmitting(true);
    try {
      if (task) {
        await updateTask(task.id, {
          title: values.title.trim(),
          description: values.description.trim(),
          priority: values.priority,
          dueAt: due ? due.toISOString() : null,
          startDate: values.startDate || null,
          estimatedMinutes: estimatedMinutesFromHours(values.estimatedHours),
          departmentId: task.departmentId,
          reason: reason.trim() || null,
          expectedUpdatedAt: task.updatedAt,
        });
        onSaved(task.id, 'Tarefa atualizada.');
      } else {
        const taskId = await createTask({
          title: values.title.trim(),
          description: values.description.trim(),
          priority: values.priority,
          assigneeId: values.assigneeId || null,
          dueAt: due ? due.toISOString() : null,
          startDate: values.startDate || null,
          estimatedMinutes: estimatedMinutesFromHours(values.estimatedHours),
          parentTaskId: links?.parentTaskId ?? null,
          opportunityId: links?.opportunityId ?? null,
          meetingId: links?.meetingId ?? null,
        });
        onSaved(taskId, 'Tarefa criada.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar a tarefa.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'task-form';
  return (
    <Modal
      isOpen={isOpen}
      title={task ? `Editar ${task.reference}` : 'Nova tarefa'}
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
            {task ? 'Guardar alterações' : 'Criar tarefa'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {isCompleted && (
          <Alert variant="warning">
            A tarefa está concluída. Cada alteração fica no histórico com o seu nome e o motivo indicado.
          </Alert>
        )}
        <TextField
          label="Título"
          required
          maxLength={200}
          value={values.title}
          error={fieldErrors.title}
          onChange={(event) => updateValue('title', event.target.value)}
        />
        <TextAreaField
          label="Descrição"
          rows={4}
          maxLength={5000}
          value={values.description}
          error={fieldErrors.description}
          hint="O resultado esperado e a informação necessária para executar a tarefa."
          onChange={(event) => updateValue('description', event.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Prioridade" required value={values.priority} error={fieldErrors.priority} onChange={(event) => updateValue('priority', event.target.value)}>
            {WORK_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {WORK_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </SelectField>
          {!task && assignees.length > 0 && (
            <SelectField
              label="Responsável"
              value={values.assigneeId}
              hint="Sem responsável, a tarefa fica planeada."
              onChange={(event) => updateValue('assigneeId', event.target.value)}
            >
              <option value="">Sem responsável (planeada)</option>
              {assignees.map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.fullName}
                  {person.departmentName ? ` · ${person.departmentName}` : ''}
                </option>
              ))}
            </SelectField>
          )}
          <TextField label="Prazo (data)" type="date" value={values.dueDate} error={fieldErrors.dueDate} onChange={(event) => updateValue('dueDate', event.target.value)} />
          <TextField label="Prazo (hora)" type="time" value={values.dueTime} onChange={(event) => updateValue('dueTime', event.target.value)} />
          <TextField label="Data de início" type="date" value={values.startDate} error={fieldErrors.startDate} onChange={(event) => updateValue('startDate', event.target.value)} />
          <TextField
            label="Estimativa (horas)"
            inputMode="decimal"
            value={values.estimatedHours}
            error={fieldErrors.estimatedHours}
            hint="Ex.: 1,5"
            onChange={(event) => updateValue('estimatedHours', event.target.value)}
          />
        </div>
        {isCompleted && (
          <TextAreaField
            label="Motivo da alteração"
            required
            rows={3}
            maxLength={1000}
            value={reason}
            error={fieldErrors.reason}
            onChange={(event) => {
              setReason(event.target.value);
              setFieldErrors((current) => ({ ...current, reason: undefined }));
            }}
          />
        )}
        {task && !isCompleted && (
          <TextField
            label="Motivo (opcional)"
            maxLength={1000}
            value={reason}
            hint="Fica no histórico junto das alterações (ex.: porque o prazo mudou)."
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </form>
    </Modal>
  );
};
