import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { validateRequiredText } from '../../utils/it';

interface NoteRule {
  label: string;
  /** Nota obrigatória com mínimo de carateres; ausente = opcional. */
  minLength?: number;
  maxLength: number;
  hint?: string;
}

interface TicketNoteModalProps {
  isOpen: boolean;
  title: string;
  description?: string;
  note: NoteRule;
  confirmLabel: string;
  variant?: 'primary' | 'danger';
  onClose: () => void;
  onConfirm: (note: string | null) => Promise<void>;
}

/** Ação com nota (resolver, aguardar colaborador, fechar, reabrir). As regras repetem as do servidor. */
export const TicketNoteModal: React.FC<TicketNoteModalProps> = ({
  isOpen,
  title,
  description,
  note,
  confirmLabel,
  variant = 'primary',
  onClose,
  onConfirm,
}) => {
  const [value, setValue] = useState('');
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValue('');
    setFieldError(null);
    setErrorMessage(null);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = value.trim();
    const validationError =
      note.minLength !== undefined
        ? validateRequiredText(value, note.label, note.minLength, note.maxLength)
        : trimmed.length > note.maxLength
          ? `Máximo de ${note.maxLength} carateres.`
          : null;
    setFieldError(validationError);
    if (validationError) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(trimmed || null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível concluir a ação.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'ticket-note-form';

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      description={description}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={variant} isLoading={isSubmitting}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextAreaField
          label={note.label}
          required={note.minLength !== undefined}
          rows={4}
          maxLength={note.maxLength}
          value={value}
          error={fieldError}
          hint={note.hint}
          onChange={(event) => setValue(event.target.value)}
        />
      </form>
    </Modal>
  );
};

export interface SelectOption {
  value: string;
  label: string;
}

interface TicketSelectModalProps {
  isOpen: boolean;
  title: string;
  fieldLabel: string;
  options: SelectOption[];
  initialValue: string;
  /** Opção vazia permitida (ex.: remover o equipamento associado). */
  emptyOptionLabel?: string;
  /** Nota opcional registada no histórico (ex.: motivo da alteração de prioridade). */
  optionalNote?: { label: string; maxLength: number };
  confirmLabel: string;
  onClose: () => void;
  onConfirm: (value: string | null, note: string | null) => Promise<void>;
}

/** Ação de escolha (atribuir técnico, prioridade, categoria, equipamento). */
export const TicketSelectModal: React.FC<TicketSelectModalProps> = ({
  isOpen,
  title,
  fieldLabel,
  options,
  initialValue,
  emptyOptionLabel,
  optionalNote,
  confirmLabel,
  onClose,
  onConfirm,
}) => {
  const [value, setValue] = useState(initialValue);
  const [note, setNote] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValue(initialValue);
    setNote('');
    setErrorMessage(null);
  }, [isOpen, initialValue]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (value === initialValue) {
      setErrorMessage('Escolha um valor diferente do atual.');
      return;
    }
    if (!value && emptyOptionLabel === undefined) {
      setErrorMessage('Selecione uma opção.');
      return;
    }
    const trimmedNote = note.trim();
    if (optionalNote && trimmedNote.length > optionalNote.maxLength) {
      setErrorMessage(`${optionalNote.label}: máximo de ${optionalNote.maxLength} carateres.`);
      return;
    }
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onConfirm(value || null, trimmedNote || null);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível concluir a ação.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'ticket-select-form';

  return (
    <Modal
      isOpen={isOpen}
      title={title}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <SelectField label={fieldLabel} value={value} onChange={(event) => setValue(event.target.value)}>
          <option value="">{emptyOptionLabel ?? 'Selecione…'}</option>
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </SelectField>
        {optionalNote && (
          <TextAreaField
            label={optionalNote.label}
            rows={3}
            maxLength={optionalNote.maxLength}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        )}
      </form>
    </Modal>
  );
};
