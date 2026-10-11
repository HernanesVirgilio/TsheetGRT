import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { completeTask } from '../../services/work/taskService';
import type { TaskDetail } from '../../types/work';
import { requiresLateReason, validateReason } from '../../utils/work';
import { formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

interface CompleteTaskModalProps {
  task: TaskDetail | null;
  onClose: () => void;
  onCompleted: () => void;
}

/** Conclusão: depois do prazo exige o motivo do atraso (o servidor aplica a mesma regra). */
export const CompleteTaskModal: React.FC<CompleteTaskModalProps> = ({ task, onClose, onCompleted }) => {
  const [note, setNote] = useState('');
  const [lateReason, setLateReason] = useState('');
  const [lateError, setLateError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isLate = task ? requiresLateReason(task, new Date()) : false;

  useEffect(() => {
    if (!task) return;
    setNote('');
    setLateReason('');
    setLateError(null);
    setErrorMessage(null);
  }, [task]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!task) return;
    const validation = isLate ? validateReason(lateReason, t('Indique o motivo do atraso')) : null;
    setLateError(validation);
    if (validation) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await completeTask(task.id, note.trim() || null, isLate ? lateReason.trim() : null);
      onCompleted();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível concluir a tarefa.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'complete-task-form';
  return (
    <Modal
      isOpen={task !== null}
      title={task ? t('Concluir {reference}', { reference: task.reference }) : t('Concluir tarefa')}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {t('Concluir tarefa')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {isLate && task && (
          <Alert variant="warning" title={t('Conclusão depois do prazo')}>
            {t('O prazo era {date}. O motivo do atraso fica permanentemente no histórico.', { date: formatDateTime(task.dueAt) })}
          </Alert>
        )}
        <TextAreaField label={t('Resultado / nota de conclusão (opcional)')} rows={3} maxLength={2000} value={note} onChange={(event) => setNote(event.target.value)} />
        {isLate && (
          <TextAreaField
            label={t('Motivo do atraso')}
            required
            rows={3}
            maxLength={1000}
            value={lateReason}
            error={lateError}
            onChange={(event) => {
              setLateReason(event.target.value);
              setLateError(null);
            }}
          />
        )}
      </form>
    </Modal>
  );
};
