import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { updateJobDescription } from '../../services/work/teamService';
import { t } from '../../lib/i18n';

interface JobDescriptionModalProps {
  isOpen: boolean;
  profileId: string;
  fullName: string;
  currentDescription: string;
  onClose: () => void;
  onSaved: () => void;
}

const MAX_LENGTH = 2000;

/** Descrição da função (o que a pessoa faz). Validada no servidor: permissão própria e âmbito; auditada. */
export const JobDescriptionModal: React.FC<JobDescriptionModalProps> = ({ isOpen, profileId, fullName, currentDescription, onClose, onSaved }) => {
  const [description, setDescription] = useState(currentDescription);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setDescription(currentDescription);
    setErrorMessage(null);
  }, [isOpen, currentDescription]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await updateJobDescription(profileId, description.trim() || null);
      onSaved();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar a descrição.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'job-description-form';
  return (
    <Modal
      isOpen={isOpen}
      title={t('Descrição da função')}
      description={fullName}
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {t('Guardar')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextAreaField
          label={t('O que esta pessoa faz')}
          rows={6}
          maxLength={MAX_LENGTH}
          value={description}
          hint={t('Responsabilidades principais e o tipo de trabalho que pode receber ({count}/{MAX_LENGTH}). Não altera o perfil de acesso nem as permissões.', { count: description.length, MAX_LENGTH })}
          onChange={(event) => setDescription(event.target.value)}
        />
      </form>
    </Modal>
  );
};
