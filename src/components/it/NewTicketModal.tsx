import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { createTicket } from '../../services/itTicketService';
import type { Asset, TicketCategory } from '../../types/it';
import { isTicketPriority, TICKET_PRIORITIES } from '../../types/it';
import type { TicketFormField, TicketFormValues } from '../../utils/it';
import { ASSET_TYPE_LABELS, TICKET_PRIORITY_LABELS, validateTicketForm } from '../../utils/it';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';
import { t } from '../../lib/i18n';

const EMPTY_FORM: TicketFormValues = { title: '', description: '', categoryId: '', priority: 'MEDIUM' };

interface NewTicketModalProps {
  isOpen: boolean;
  categories: TicketCategory[];
  /** Equipamentos atribuídos ao colaborador, para associar ao pedido. */
  assets: Asset[];
  onClose: () => void;
  onCreated: (ticketId: string) => void;
}

export const NewTicketModal: React.FC<NewTicketModalProps> = ({ isOpen, categories, assets, onClose, onCreated }) => {
  const [values, setValues] = useState<TicketFormValues>(EMPTY_FORM);
  const [assetId, setAssetId] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<TicketFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues(EMPTY_FORM);
    setAssetId('');
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen]);

  const updateValue = (field: TicketFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateTicketForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors) || !isTicketPriority(values.priority)) return;

    setIsSubmitting(true);
    try {
      const ticketId = await createTicket({
        title: values.title.trim(),
        description: values.description.trim(),
        categoryId: values.categoryId,
        priority: values.priority,
        assetId: assetId || null,
      });
      onCreated(ticketId);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível abrir o pedido de suporte.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'new-ticket-form';

  return (
    <Modal
      isOpen={isOpen}
      title={t('Novo pedido de suporte')}
      description={t('Descreva o problema com o máximo de detalhe. A equipa de IT é notificada de imediato.')}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {t('Abrir pedido')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField
          label={t('Título')}
          required
          maxLength={200}
          value={values.title}
          error={fieldErrors.title}
          hint={t('Ex.: Computador não liga')}
          onChange={(event) => updateValue('title', event.target.value)}
        />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField
            label={t('Categoria')}
            required
            value={values.categoryId}
            error={fieldErrors.categoryId}
            onChange={(event) => updateValue('categoryId', event.target.value)}
          >
            <option value="">{t('Selecione…')}</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('Prioridade')}
            required
            value={values.priority}
            error={fieldErrors.priority}
            hint={t('A equipa de IT pode ajustar a prioridade.')}
            onChange={(event) => updateValue('priority', event.target.value)}
          >
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TICKET_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </SelectField>
        </div>
        {assets.length > 0 && (
          <SelectField label={t('Equipamento (opcional)')} value={assetId} onChange={(event) => setAssetId(event.target.value)}>
            <option value="">{t('Nenhum')}</option>
            {assets.map((asset) => (
              <option key={asset.id} value={asset.id}>
                {asset.assetTag} · {ASSET_TYPE_LABELS[asset.assetType]} {[asset.brand, asset.model].filter(Boolean).join(' ')}
              </option>
            ))}
          </SelectField>
        )}
        <TextAreaField
          label={t('Descrição')}
          required
          rows={5}
          maxLength={5000}
          value={values.description}
          error={fieldErrors.description}
          hint={t('O que aconteceu, desde quando e que mensagens de erro aparecem.')}
          onChange={(event) => updateValue('description', event.target.value)}
        />
      </form>
    </Modal>
  );
};
