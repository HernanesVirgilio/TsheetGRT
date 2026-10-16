import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { MoreOptions } from '../ui/MoreOptions';
import { getErrorMessage } from '../../lib/errors';
import { useAuth } from '../../lib/auth/AuthContext';
import { t } from '../../lib/i18n';
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
  /** Mostra a opção de escalar a conclusão ao Manager (para gestores; o Manager não escala para si). */
  canRequestManagerReview?: boolean;
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
    // Vazio por omissão: sem data não há prazo; com data e sem hora, o prazo é às 17:00.
    dueTime: due ? toTimeInput(due) : '',
    startDate: task?.startDate ?? '',
    estimatedHours: task?.estimatedMinutes ? String(Math.round((task.estimatedMinutes / 60) * 100) / 100).replace('.', ',') : '',
  };
}

export const TaskFormModal: React.FC<TaskFormModalProps> = ({
  isOpen,
  task,
  assignees,
  links,
  contextLabel,
  canRequestManagerReview = false,
  onClose,
  onSaved,
}) => {
  const { currentUser } = useAuth();
  const [values, setValues] = useState<TaskFormValues>(() => initialValues(task));
  const [requiresManagerReview, setRequiresManagerReview] = useState(false);
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<TaskFormField | 'reason'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isCompleted = task?.status === 'COMPLETED';
  // Campos opcionais: na edição, a secção abre se já tiverem conteúdo diferente do habitual.
  const hasAdditionalValues = Boolean(task && (task.description || task.priority !== 'MEDIUM' || task.startDate || task.estimatedMinutes));
  const hasAdditionalErrors = Boolean(fieldErrors.description || fieldErrors.priority || fieldErrors.startDate || fieldErrors.estimatedHours);
  const additionalSummary = [
    t('Prioridade: {priority}', { priority: WORK_PRIORITY_LABELS[isWorkPriority(values.priority) ? values.priority : 'MEDIUM'].toLowerCase() }),
    values.description.trim() ? t('com descrição') : t('sem descrição'),
    values.estimatedHours ? t('estimativa {hours} h', { hours: values.estimatedHours }) : null,
    requiresManagerReview ? t('acompanhamento do Manager') : null,
  ]
    .filter(Boolean)
    .join(' · ');

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialValues(task));
    setRequiresManagerReview(false);
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
    const reasonError = isCompleted ? validateReason(reason, t('Indique o motivo da alteração de uma tarefa concluída')) : null;
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
        onSaved(task.id, t('Tarefa atualizada.'));
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
          requiresManagerReview: canRequestManagerReview && requiresManagerReview,
        });
        onSaved(taskId, t('Tarefa criada.'));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar a tarefa.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'task-form';
  return (
    <Modal
      isOpen={isOpen}
      title={task ? t('Editar {reference}', { reference: task.reference }) : t('Nova tarefa')}
      description={contextLabel}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {task ? t('Guardar alterações') : t('Criar tarefa')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {isCompleted && (
          <Alert variant="warning">
            {t('A tarefa está concluída. Cada alteração fica no histórico com o seu nome e o motivo indicado.')}
          </Alert>
        )}
        <TextField
          label={t('Título')}
          required
          maxLength={200}
          value={values.title}
          error={fieldErrors.title}
          onChange={(event) => updateValue('title', event.target.value)}
        />
        {!task && assignees.length > 0 && (
          <SelectField
            label={t('Responsável pela execução')}
            value={values.assigneeId}
            hint={
              assignees.find((person) => person.profileId === values.assigneeId)?.jobDescription ??
              // A lista vem do servidor: o próprio só aparece quando se pode atribuir a si próprio (não ao Manager).
              (assignees.some((person) => person.profileId === currentUser?.id)
                ? t('Sem responsável, a tarefa fica planeada. Pode escolher-se a si próprio.')
                : t('Sem responsável, a tarefa fica planeada.'))
            }
            onChange={(event) => updateValue('assigneeId', event.target.value)}
          >
            <option value="">{t('Sem responsável (planeada)')}</option>
            {assignees.map((person) => (
              <option key={person.profileId} value={person.profileId}>
                {person.fullName}
                {person.jobTitle ? ` · ${person.jobTitle}` : person.departmentName ? ` · ${person.departmentName}` : ''}
              </option>
            ))}
          </SelectField>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('Prazo (data)')}
            type="date"
            value={values.dueDate}
            error={fieldErrors.dueDate}
            hint={t('Opcional. Sem data, a tarefa não tem prazo.')}
            onChange={(event) => updateValue('dueDate', event.target.value)}
          />
          <TextField
            label={t('Prazo (hora)')}
            type="time"
            value={values.dueTime}
            hint={t('Sem hora, o prazo termina às 17:00.')}
            onChange={(event) => updateValue('dueTime', event.target.value)}
          />
        </div>

        <MoreOptions summary={additionalSummary} defaultOpen={hasAdditionalValues} forceOpen={hasAdditionalErrors}>
          <TextAreaField
            label={t('Descrição')}
            rows={4}
            maxLength={5000}
            value={values.description}
            error={fieldErrors.description}
            hint={t('O resultado esperado e a informação necessária para executar a tarefa.')}
            onChange={(event) => updateValue('description', event.target.value)}
          />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <SelectField
              label={t('Prioridade')}
              required
              value={values.priority}
              error={fieldErrors.priority}
              hint={t('Ordena o trabalho do dia.')}
              onChange={(event) => updateValue('priority', event.target.value)}
            >
              {WORK_PRIORITIES.map((priority) => (
                <option key={priority} value={priority}>
                  {WORK_PRIORITY_LABELS[priority]}
                </option>
              ))}
            </SelectField>
            <TextField label={t('Data de início')} type="date" value={values.startDate} error={fieldErrors.startDate} onChange={(event) => updateValue('startDate', event.target.value)} />
            <TextField
              label={t('Estimativa (horas)')}
              inputMode="decimal"
              value={values.estimatedHours}
              error={fieldErrors.estimatedHours}
              hint={t('Ex.: 1,5')}
              onChange={(event) => updateValue('estimatedHours', event.target.value)}
            />
          </div>
          {!task && canRequestManagerReview && (
            <label className="flex items-start gap-2 text-sm text-text">
              <input
                type="checkbox"
                className="mt-0.5 h-4 w-4 accent-primary-hover"
                checked={requiresManagerReview}
                onChange={(event) => setRequiresManagerReview(event.target.checked)}
              />
              <span>
                {t('Exige acompanhamento do Manager')}
                <span className="block text-xs text-text-muted">{t('A conclusão é enviada ao Manager para validação. Use apenas quando a decisão lhe compete.')}</span>
              </span>
            </label>
          )}
        </MoreOptions>

        {isCompleted && (
          <TextAreaField
            label={t('Motivo da alteração')}
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
            label={t('Motivo (opcional)')}
            maxLength={1000}
            value={reason}
            hint={t('Fica no histórico junto das alterações (ex.: porque o prazo mudou).')}
            onChange={(event) => setReason(event.target.value)}
          />
        )}
      </form>
    </Modal>
  );
};
