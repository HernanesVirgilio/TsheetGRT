import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { completeMeeting, updateMeetingOutcome } from '../../services/work/meetingService';
import type { MeetingDetail } from '../../types/work';
import { validateReason } from '../../utils/work';

interface MeetingOutcomeModalProps {
  meeting: MeetingDetail | null;
  onClose: () => void;
  onSaved: (message: string) => void;
}

/** Regista o resultado (conclui a reunião) ou corrige-o depois de concluída, com motivo. */
export const MeetingOutcomeModal: React.FC<MeetingOutcomeModalProps> = ({ meeting, onClose, onSaved }) => {
  const isCorrection = meeting?.status === 'COMPLETED';
  const [outcome, setOutcome] = useState('');
  const [decisions, setDecisions] = useState('');
  const [nextSteps, setNextSteps] = useState('');
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState<{ outcome?: string | null; reason?: string | null }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!meeting) return;
    setOutcome(meeting.outcome ?? '');
    setDecisions(meeting.decisions ?? '');
    setNextSteps(meeting.nextSteps ?? '');
    setReason('');
    setErrors({});
    setErrorMessage(null);
  }, [meeting]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!meeting) return;
    const nextErrors = {
      outcome: validateReason(outcome, 'Descreva o resultado da reunião', 5, 5000),
      reason: isCorrection ? validateReason(reason, 'Indique o motivo da alteração') : null,
    };
    setErrors(nextErrors);
    if (nextErrors.outcome || nextErrors.reason) return;
    const input = { outcome: outcome.trim(), decisions: decisions.trim() || null, nextSteps: nextSteps.trim() || null };
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      if (isCorrection) {
        await updateMeetingOutcome(meeting.id, input, reason.trim());
        onSaved('Resultado corrigido. A alteração ficou no histórico.');
      } else {
        await completeMeeting(meeting.id, input);
        onSaved('Resultado registado e reunião concluída.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar o resultado.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'meeting-outcome-form';
  return (
    <Modal
      isOpen={meeting !== null}
      title={isCorrection ? 'Corrigir resultado da reunião' : 'Registar resultado da reunião'}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {isCorrection ? 'Guardar correção' : 'Concluir reunião'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextAreaField label="Resultado" required rows={3} maxLength={5000} value={outcome} error={errors.outcome} onChange={(event) => setOutcome(event.target.value)} />
        <TextAreaField label="Decisões" rows={3} maxLength={5000} value={decisions} onChange={(event) => setDecisions(event.target.value)} />
        <TextAreaField
          label="Próximos passos"
          rows={3}
          maxLength={5000}
          value={nextSteps}
          hint="Para atribuir trabalho, crie depois uma tarefa a partir da reunião."
          onChange={(event) => setNextSteps(event.target.value)}
        />
        {isCorrection && (
          <TextAreaField label="Motivo da correção" required rows={2} maxLength={1000} value={reason} error={errors.reason} onChange={(event) => setReason(event.target.value)} />
        )}
      </form>
    </Modal>
  );
};
