import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { addIntervention } from '../../services/itAssetService';
import { INTERVENTION_OUTCOMES, isInterventionOutcome } from '../../types/it';
import type { InterventionFormField, InterventionFormValues } from '../../utils/it';
import { INTERVENTION_OUTCOME_LABELS, toLocalDateTimeInput, validateInterventionForm } from '../../utils/it';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';
import { t } from '../../lib/i18n';

function emptyForm(): InterventionFormValues {
  return {
    performedAt: toLocalDateTimeInput(new Date()),
    problemDescription: '',
    workPerformed: '',
    outcome: '',
    notes: '',
  };
}

interface InterventionFormModalProps {
  isOpen: boolean;
  /** Pedido e/ou equipamento a que a intervenção fica associada (pelo menos um). */
  ticketId: string | null;
  assetId: string | null;
  /** Texto de contexto (ex.: "IT-0042 · SI-IT-0007"). */
  targetLabel: string;
  onClose: () => void;
  onSaved: () => void;
}

export const InterventionFormModal: React.FC<InterventionFormModalProps> = ({
  isOpen,
  ticketId,
  assetId,
  targetLabel,
  onClose,
  onSaved,
}) => {
  const [values, setValues] = useState<InterventionFormValues>(emptyForm);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<InterventionFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(emptyForm());
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen]);

  const updateValue = (field: InterventionFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateInterventionForm(values, new Date());
    setFieldErrors(errors);
    if (hasErrors(errors) || !isInterventionOutcome(values.outcome)) return;

    setIsSubmitting(true);
    try {
      await addIntervention({
        ticketId,
        assetId,
        // O campo datetime-local está na hora local; o servidor recebe o instante em ISO (UTC).
        performedAt: new Date(values.performedAt).toISOString(),
        problemDescription: values.problemDescription.trim(),
        workPerformed: values.workPerformed.trim(),
        outcome: values.outcome,
        notes: values.notes.trim(),
      });
      onSaved();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível registar a intervenção.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'intervention-form';

  return (
    <Modal
      isOpen={isOpen}
      title={t('Registar intervenção técnica')}
      description={targetLabel}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {t('Registar intervenção')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField
            label={t('Data e hora')}
            type="datetime-local"
            required
            value={values.performedAt}
            error={fieldErrors.performedAt}
            onChange={(event) => updateValue('performedAt', event.target.value)}
          />
          <SelectField
            label={t('Resultado')}
            required
            value={values.outcome}
            error={fieldErrors.outcome}
            onChange={(event) => updateValue('outcome', event.target.value)}
          >
            <option value="">{t('Selecione…')}</option>
            {INTERVENTION_OUTCOMES.map((outcome) => (
              <option key={outcome} value={outcome}>
                {INTERVENTION_OUTCOME_LABELS[outcome]}
              </option>
            ))}
          </SelectField>
        </div>
        <TextAreaField
          label={t('Problema identificado')}
          required
          rows={3}
          maxLength={2000}
          value={values.problemDescription}
          error={fieldErrors.problemDescription}
          onChange={(event) => updateValue('problemDescription', event.target.value)}
        />
        <TextAreaField
          label={t('Trabalho realizado')}
          required
          rows={4}
          maxLength={4000}
          value={values.workPerformed}
          error={fieldErrors.workPerformed}
          onChange={(event) => updateValue('workPerformed', event.target.value)}
        />
        <TextAreaField
          label={t('Observações')}
          rows={2}
          maxLength={2000}
          value={values.notes}
          onChange={(event) => updateValue('notes', event.target.value)}
        />
      </form>
    </Modal>
  );
};
