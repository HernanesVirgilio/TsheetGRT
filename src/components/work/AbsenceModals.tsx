import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { decideAbsence, saveAbsence } from '../../services/work/absenceService';
import type { AbsenceDecision, AbsenceRequest, AbsenceType } from '../../types/work';
import type { AbsenceFormField, AbsenceFormValues } from '../../utils/work';
import { daysBetween, validateAbsenceForm, validateReason } from '../../utils/work';
import { formatDate } from '../../utils/format';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';

interface AbsenceFormModalProps {
  isOpen: boolean;
  /** Null = novo pedido; caso contrário, rascunho a corrigir. */
  request: AbsenceRequest | null;
  types: AbsenceType[];
  onClose: () => void;
  onSaved: (requestId: string) => void;
}

export const AbsenceFormModal: React.FC<AbsenceFormModalProps> = ({ isOpen, request, types, onClose, onSaved }) => {
  const [values, setValues] = useState<AbsenceFormValues>({ absenceTypeId: '', startDate: '', endDate: '', reason: '' });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<AbsenceFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      absenceTypeId: request?.absenceTypeId ?? types[0]?.id ?? '',
      startDate: request?.startDate ?? '',
      endDate: request?.endDate ?? '',
      reason: request?.reason ?? '',
    });
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, request, types]);

  const updateValue = (field: AbsenceFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value, ...(field === 'startDate' && !current.endDate ? { endDate: value } : {}) }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const selectedType = types.find((type) => type.id === values.absenceTypeId);
  const days = values.startDate && values.endDate && values.endDate >= values.startDate ? daysBetween(values.startDate, values.endDate) + 1 : 0;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateAbsenceForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;
    setIsSubmitting(true);
    try {
      const requestId = await saveAbsence(request?.id ?? null, {
        absenceTypeId: values.absenceTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason.trim(),
      });
      onSaved(requestId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar o pedido.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'absence-form';
  return (
    <Modal
      isOpen={isOpen}
      title={request ? `Corrigir ${request.reference}` : 'Novo pedido de ausência'}
      description="O pedido fica em rascunho até o submeter para aprovação."
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            Guardar rascunho
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {request?.decisionComment && (
          <Alert variant="warning" title="Correção pedida pelo gestor">
            {request.decisionComment}
          </Alert>
        )}
        <SelectField label="Tipo de ausência" required value={values.absenceTypeId} error={fieldErrors.absenceTypeId} onChange={(event) => updateValue('absenceTypeId', event.target.value)}>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </SelectField>
        {selectedType?.requiresAttachment && (
          <Alert variant="info">Este tipo exige um comprovativo: anexe-o ao pedido antes de o submeter.</Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Data inicial" type="date" required value={values.startDate} error={fieldErrors.startDate} onChange={(event) => updateValue('startDate', event.target.value)} />
          <TextField
            label="Data final"
            type="date"
            required
            value={values.endDate}
            error={fieldErrors.endDate}
            hint={days > 0 ? `${days} dia${days === 1 ? '' : 's'} de calendário` : undefined}
            onChange={(event) => updateValue('endDate', event.target.value)}
          />
        </div>
        <TextAreaField label="Motivo / observações" rows={3} maxLength={2000} value={values.reason} error={fieldErrors.reason} onChange={(event) => updateValue('reason', event.target.value)} />
      </form>
    </Modal>
  );
};

interface AbsenceDecisionModalProps {
  request: AbsenceRequest | null;
  decision: AbsenceDecision | null;
  onClose: () => void;
  onDecided: (message: string) => void;
}

const DECISION_COPY: Record<AbsenceDecision, { title: string; confirm: string; label: string; variant: 'primary' | 'danger'; success: string }> = {
  APPROVED: { title: 'Aprovar ausência', confirm: 'Aprovar', label: 'Comentário (opcional)', variant: 'primary', success: 'Ausência aprovada.' },
  REJECTED: { title: 'Rejeitar ausência', confirm: 'Rejeitar', label: 'Motivo da rejeição', variant: 'danger', success: 'Pedido rejeitado.' },
  CHANGES_REQUESTED: {
    title: 'Pedir correção',
    confirm: 'Devolver ao colaborador',
    label: 'O que deve ser corrigido',
    variant: 'primary',
    success: 'Pedido devolvido para correção.',
  },
};

/** Decisão do gestor: validada no servidor (permissão, âmbito, estado, sem autoaprovação). */
export const AbsenceDecisionModal: React.FC<AbsenceDecisionModalProps> = ({ request, decision, onClose, onDecided }) => {
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setComment('');
    setCommentError(null);
    setErrorMessage(null);
  }, [request, decision]);

  if (!decision) return null;
  const copy = DECISION_COPY[decision];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request) return;
    const validation = decision === 'APPROVED' ? null : validateReason(comment, copy.label);
    setCommentError(validation);
    if (validation) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await decideAbsence(request.id, decision, comment.trim() || null);
      onDecided(copy.success);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível registar a decisão.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'absence-decision-form';
  return (
    <Modal
      isOpen={request !== null}
      title={copy.title}
      description={request ? `${request.employeeName ?? 'Colaborador'} · ${request.absenceTypeName} · ${formatDate(request.startDate)} a ${formatDate(request.endDate)}` : undefined}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={copy.variant} isLoading={isSubmitting}>
            {copy.confirm}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextAreaField
          label={copy.label}
          required={decision !== 'APPROVED'}
          rows={3}
          maxLength={1000}
          value={comment}
          error={commentError}
          onChange={(event) => {
            setComment(event.target.value);
            setCommentError(null);
          }}
        />
      </form>
    </Modal>
  );
};
