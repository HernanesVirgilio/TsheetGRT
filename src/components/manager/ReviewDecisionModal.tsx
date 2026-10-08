import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { reviewTimesheet } from '../../services/approvalService';
import type { ReviewDecision } from '../../services/approvalService';
import type { TimesheetSummary } from '../../types';
import { formatMinutesAsHours, formatPeriod } from '../../utils/format';
import { MAX_REVIEW_COMMENT_LENGTH, validateRejectionReason } from '../../utils/timesheets';

interface ReviewDecisionModalProps {
  timesheet: TimesheetSummary | null;
  decision: ReviewDecision;
  onClose: () => void;
  onDone: (message: string) => void;
}

/** Aprovar (comentário opcional) ou rejeitar (motivo obrigatório) um timesheet submetido. */
export const ReviewDecisionModal: React.FC<ReviewDecisionModalProps> = ({ timesheet, decision, onClose, onDone }) => {
  const [comment, setComment] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isRejection = decision === 'REJECTED';

  useEffect(() => {
    setComment('');
    setFieldError(null);
    setErrorMessage(null);
  }, [timesheet, decision]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!timesheet) return;
    const validationError = isRejection ? validateRejectionReason(comment) : null;
    setFieldError(validationError);
    if (validationError) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await reviewTimesheet(timesheet.id, decision, comment.trim() || null);
      onDone(
        `Timesheet de ${timesheet.employeeName} (${formatPeriod(timesheet.periodStart, timesheet.periodEnd)}) ${
          isRejection ? 'rejeitado' : 'aprovado'
        } com sucesso.`
      );
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível registar a decisão.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'review-decision-form';

  return (
    <Modal
      isOpen={Boolean(timesheet)}
      title={isRejection ? 'Rejeitar timesheet' : 'Aprovar timesheet'}
      description={
        timesheet &&
        `${timesheet.employeeName} · ${formatPeriod(timesheet.periodStart, timesheet.periodEnd)} · ${formatMinutesAsHours(timesheet.totalMinutes)}`
      }
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={isRejection ? 'danger' : 'primary'} isLoading={isSubmitting}>
            {isRejection ? 'Rejeitar' : 'Aprovar'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextAreaField
          label={isRejection ? 'Motivo da rejeição' : 'Comentário (opcional)'}
          required={isRejection}
          rows={4}
          maxLength={MAX_REVIEW_COMMENT_LENGTH}
          value={comment}
          error={fieldError}
          hint={isRejection ? 'O colaborador recebe este motivo para corrigir o timesheet.' : undefined}
          onChange={(event) => setComment(event.target.value)}
        />
      </form>
    </Modal>
  );
};
