import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { decideOpportunityApproval, requestOpportunityApproval } from '../../services/work/opportunityService';
import type { ApprovalRequest, OpportunityDetail } from '../../types/work';
import { formatMoney, validateReason } from '../../utils/work';

interface RequestApprovalModalProps {
  opportunity: OpportunityDetail | null;
  onClose: () => void;
  onRequested: (message: string) => void;
}

/** Pedido explícito de aprovação ao Manager (o valor fica registado no pedido). */
export const RequestApprovalModal: React.FC<RequestApprovalModalProps> = ({ opportunity, onClose, onRequested }) => {
  const [justification, setJustification] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setJustification('');
    setFieldError(null);
    setErrorMessage(null);
  }, [opportunity]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!opportunity) return;
    const validation = validateReason(justification, 'Explique o que deve ser aprovado', 5, 2000);
    setFieldError(validation);
    if (validation) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await requestOpportunityApproval(opportunity.id, justification.trim());
      onRequested('Pedido de aprovação enviado ao Manager.');
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível pedir a aprovação.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'request-approval-form';
  return (
    <Modal
      isOpen={opportunity !== null}
      title="Pedir aprovação ao Manager"
      description={
        opportunity
          ? `${opportunity.reference} · ${opportunity.estimatedValue === null ? 'sem valor estimado' : formatMoney(opportunity.estimatedValue, opportunity.currency)}`
          : undefined
      }
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            Enviar pedido
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <p className="text-sm text-text-secondary">
          Sem aprovação, a oportunidade não avança para Proposta, Negociação ou Ganha. Os valores ficam fixos enquanto o pedido está pendente.
        </p>
        <TextAreaField
          label="O que deve ser aprovado"
          required
          rows={4}
          maxLength={2000}
          value={justification}
          error={fieldError}
          hint="Ex.: avançar com a proposta de 1,5 M MZN, prazo de entrega e condições."
          onChange={(event) => {
            setJustification(event.target.value);
            setFieldError(null);
          }}
        />
      </form>
    </Modal>
  );
};

interface ApprovalDecisionModalProps {
  request: ApprovalRequest | null;
  decision: 'APPROVED' | 'REJECTED' | null;
  onClose: () => void;
  onDecided: (message: string) => void;
}

/** Decisão do Manager: validada no servidor (permissão, âmbito, estado, sem decidir pedidos próprios). */
export const ApprovalDecisionModal: React.FC<ApprovalDecisionModalProps> = ({ request, decision, onClose, onDecided }) => {
  const [comment, setComment] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setComment('');
    setFieldError(null);
    setErrorMessage(null);
  }, [request, decision]);

  if (!decision) return null;
  const isApproval = decision === 'APPROVED';

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!request) return;
    const validation = isApproval ? null : validateReason(comment, 'Indique o motivo da rejeição');
    setFieldError(validation);
    if (validation) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await decideOpportunityApproval(request.id, decision, comment.trim() || null);
      onDecided(isApproval ? `Pedido ${request.reference} aprovado.` : `Pedido ${request.reference} rejeitado.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível registar a decisão.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'approval-decision-form';
  return (
    <Modal
      isOpen={request !== null}
      title={isApproval ? 'Aprovar pedido' : 'Rejeitar pedido'}
      description={request ? `${request.reference} · ${request.title}` : undefined}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={isApproval ? 'primary' : 'danger'} isLoading={isSubmitting}>
            {isApproval ? 'Aprovar' : 'Rejeitar'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {request && (
          <dl className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-text-muted">Valor</dt>
              <dd className="font-medium text-text">{request.amount === null ? 'Sem valor' : formatMoney(request.amount, request.currency ?? '')}</dd>
            </div>
            <div>
              <dt className="text-text-muted">Pedido por</dt>
              <dd className="font-medium text-text">{request.requesterName ?? '—'}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-text-muted">O que está a ser aprovado</dt>
              <dd className="whitespace-pre-line text-text">{request.justification}</dd>
            </div>
          </dl>
        )}
        <TextAreaField
          label={isApproval ? 'Comentário (opcional)' : 'Motivo da rejeição'}
          required={!isApproval}
          rows={3}
          maxLength={1000}
          value={comment}
          error={fieldError}
          onChange={(event) => {
            setComment(event.target.value);
            setFieldError(null);
          }}
        />
      </form>
    </Modal>
  );
};
