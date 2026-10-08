import React, { useState } from 'react';
import { Send } from 'lucide-react';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { validateComment } from '../../utils/it';

interface TicketCommentFormProps {
  label: string;
  hint?: string;
  /** Só a equipa de IT pode registar notas internas (validado também no servidor). */
  allowInternal: boolean;
  onSubmit: (body: string, isInternal: boolean) => Promise<void>;
}

export const TicketCommentForm: React.FC<TicketCommentFormProps> = ({ label, hint, allowInternal, onSubmit }) => {
  const [body, setBody] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const validationError = validateComment(body);
    setFieldError(validationError);
    if (validationError) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await onSubmit(body.trim(), allowInternal && isInternal);
      setBody('');
      setIsInternal(false);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível enviar a mensagem.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3 border-t border-border px-5 py-4" noValidate>
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
      <TextAreaField
        label={label}
        rows={3}
        value={body}
        error={fieldError}
        hint={hint}
        onChange={(event) => setBody(event.target.value)}
      />
      <div className="flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        {allowInternal ? (
          <label className="flex items-center gap-2 text-sm text-text">
            <input
              type="checkbox"
              checked={isInternal}
              onChange={(event) => setIsInternal(event.target.checked)}
              className="h-4 w-4 accent-primary-hover"
            />
            Nota interna (visível apenas para a equipa de IT)
          </label>
        ) : (
          <span />
        )}
        <Button type="submit" icon={Send} isLoading={isSubmitting}>
          Enviar
        </Button>
      </div>
    </form>
  );
};
