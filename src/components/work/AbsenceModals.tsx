import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { communicateAbsence, decideAbsence, saveAbsence, validateAbsence } from '../../services/work/absenceService';
import type { AbsenceDecision, AbsenceRequest, AbsenceType, AbsenceValidation } from '../../types/work';
import type { AbsenceFormField, AbsenceFormValues } from '../../utils/work';
import { daysBetween, validateAbsenceForm, validateReason } from '../../utils/work';
import { formatDate, pluralize } from '../../utils/format';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';
import { t, translatedFields } from '../../lib/i18n';

interface AbsenceFormModalProps {
  isOpen: boolean;
  /** Null = novo pedido; caso contrário, rascunho a corrigir. */
  request: AbsenceRequest | null;
  types: AbsenceType[];
  /**
   * REQUEST: pedido formal (rascunho → validação → decisão).
   * NOTICE: comunicar indisponibilidade, sem aprovação; fica registada como comunicada, nunca como aprovada.
   */
  mode?: 'REQUEST' | 'NOTICE';
  onClose: () => void;
  onSaved: (requestId: string) => void;
}

export const AbsenceFormModal: React.FC<AbsenceFormModalProps> = ({ isOpen, request, types, mode = 'REQUEST', onClose, onSaved }) => {
  const isNotice = mode === 'NOTICE';
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
      const input = {
        absenceTypeId: values.absenceTypeId,
        startDate: values.startDate,
        endDate: values.endDate,
        reason: values.reason.trim(),
      };
      const requestId = isNotice ? await communicateAbsence(input) : await saveAbsence(request?.id ?? null, input);
      onSaved(requestId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, isNotice ? t('Não foi possível comunicar a ausência.') : t('Não foi possível guardar o pedido.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'absence-form';
  return (
    <Modal
      isOpen={isOpen}
      title={isNotice ? t('Comunicar ausência') : request ? t('Corrigir {reference}', { reference: request.reference }) : t('Solicitar ausência')}
      description={
        isNotice
          ? t('Informa as suas chefias configuradas e a sua equipa direta. Fica registada como ausência comunicada, sem aprovação formal.')
          : t('O pedido fica em rascunho até o submeter. Segue para o gestor da equipa (validação) e depois para o Manager (decisão).')
      }
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {isNotice ? t('Comunicar') : t('Guardar rascunho')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {request?.decisionComment && (
          <Alert variant="warning" title={t('Correção pedida')}>
            {request.decisionComment}
          </Alert>
        )}
        <SelectField label={t('Tipo de ausência')} required value={values.absenceTypeId} error={fieldErrors.absenceTypeId} onChange={(event) => updateValue('absenceTypeId', event.target.value)}>
          {types.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name}
            </option>
          ))}
        </SelectField>
        {!isNotice && selectedType && !selectedType.requiresManagerApproval && (
          <Alert variant="info">{t('Este tipo de ausência fica aprovado com a validação do gestor da equipa.')}</Alert>
        )}
        {!isNotice && selectedType?.requiresAttachment && (
          <Alert variant="info">{t('Este tipo exige um comprovativo: anexe-o ao pedido antes de o submeter.')}</Alert>
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label={t('Data inicial')} type="date" required value={values.startDate} error={fieldErrors.startDate} onChange={(event) => updateValue('startDate', event.target.value)} />
          <TextField
            label={t('Data final')}
            type="date"
            required
            value={values.endDate}
            error={fieldErrors.endDate}
            hint={days > 0 ? t('{days} de calendário', { days: pluralize(days, 'dia', 'dias') }) : undefined}
            onChange={(event) => updateValue('endDate', event.target.value)}
          />
        </div>
        <TextAreaField label={t('Motivo / observações')} rows={3} maxLength={2000} value={values.reason} error={fieldErrors.reason} onChange={(event) => updateValue('reason', event.target.value)} />
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

const DECISION_COPY: Record<AbsenceDecision, { title: string; confirm: string; label: string; variant: 'primary' | 'danger'; success: string }> = translatedFields({
  APPROVED: { title: 'Aprovar ausência', confirm: 'Aprovar', label: 'Comentário (opcional)', variant: 'primary', success: 'Ausência aprovada.' },
  REJECTED: { title: 'Rejeitar ausência', confirm: 'Rejeitar', label: 'Motivo da rejeição', variant: 'danger', success: 'Pedido rejeitado.' },
  CHANGES_REQUESTED: {
    title: 'Pedir correção',
    confirm: 'Devolver ao colaborador',
    label: 'O que deve ser corrigido',
    variant: 'primary',
    success: 'Pedido devolvido para correção.',
  },
}, ['title', 'confirm', 'label', 'success']);

/** Decisão final (Manager ou administração): validada no servidor (permissão, âmbito, estado, sem autoaprovação). */
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
      setErrorMessage(getErrorMessage(error, t('Não foi possível registar a decisão.')));
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
            {t('Cancelar')}
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

interface AbsenceValidationModalProps {
  request: AbsenceRequest | null;
  validation: AbsenceValidation | null;
  onClose: () => void;
  onValidated: (message: string) => void;
}

const VALIDATION_TEXT: Record<AbsenceValidation, { title: string; action: string; label: string; done: string }> = translatedFields(
  {
    VALIDATED: {
      title: 'Aprovar pedido',
      action: 'Aprovar',
      label: 'Justificação da aprovação',
      done: 'Pedido {reference} aprovado. Segue para o Manager quando o tipo o exige.',
    },
    REJECTED: { title: 'Rejeitar pedido', action: 'Rejeitar', label: 'Justificação da rejeição', done: 'Pedido {reference} rejeitado.' },
    CHANGES_REQUESTED: { title: 'Pedir correção', action: 'Devolver ao colaborador', label: 'O que deve ser corrigido', done: 'Pedido devolvido para correção.' },
  },
  // `done` tem parâmetros: é traduzido no momento do uso, com t(text.done, { reference }).
  ['title', 'action', 'label']
);

/**
 * 1.º nível: o gestor da equipa aprova (seguindo para o Manager quando o tipo o exige), rejeita ou devolve
 * ao colaborador. Todas as decisões são justificadas (o servidor exige-o).
 */
export const AbsenceValidationModal: React.FC<AbsenceValidationModalProps> = ({ request, validation, onClose, onValidated }) => {
  const [comment, setComment] = useState('');
  const [commentError, setCommentError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setComment('');
    setCommentError(null);
    setErrorMessage(null);
  }, [request, validation]);

  if (!validation) return null;
  const isForward = validation === 'VALIDATED';
  const text = VALIDATION_TEXT[validation];

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request) return;
    const check = validateReason(comment, validation === 'CHANGES_REQUESTED' ? t('Indique o que deve ser corrigido') : t('Indique a justificação da decisão'), validation === 'CHANGES_REQUESTED' ? 5 : 3);
    setCommentError(check);
    if (check) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await validateAbsence(request.id, validation, comment.trim());
      onValidated(t(text.done, { reference: request.reference }));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível registar a validação.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'absence-validation-form';
  return (
    <Modal
      isOpen={request !== null}
      title={text.title}
      description={request ? `${request.employeeName ?? 'Colaborador'} · ${request.absenceTypeName} · ${formatDate(request.startDate)} a ${formatDate(request.endDate)}` : undefined}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {text.action}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {isForward && (
          <p className="text-sm text-text-secondary">
            {t('A decisão final é do Manager, exceto nos tipos que a empresa definiu como aprovados na validação.')}
          </p>
        )}
        <TextAreaField
          label={text.label}
          required
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
