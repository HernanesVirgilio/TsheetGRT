import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import type { FieldErrors, NewPasswordField } from '../../utils/validation';
import { hasErrors, MIN_PASSWORD_LENGTH, validateNewPassword } from '../../utils/validation';

type ChangePasswordField = NewPasswordField | 'currentPassword';

export const ChangePasswordPage: React.FC = () => {
  const { changePassword, mustChangePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<ChangePasswordField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const errors: FieldErrors<ChangePasswordField> = validateNewPassword({ newPassword, confirmPassword });
    if (!currentPassword) errors.currentPassword = 'Indique a palavra-passe atual.';
    else if (currentPassword === newPassword) errors.newPassword = 'A nova palavra-passe deve ser diferente da atual.';
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error);
      return;
    }
    setCurrentPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setSuccessMessage('Palavra-passe alterada com sucesso.');
    if (mustChangePassword) navigate('/dashboard', { replace: true });
  };

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Alterar palavra-passe"
        subtitle={
          mustChangePassword
            ? 'É obrigatório definir uma nova palavra-passe antes de continuar.'
            : 'Defina uma nova palavra-passe segura para a sua conta.'
        }
      />
      <Panel>
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          {successMessage && <Alert variant="success">{successMessage}</Alert>}
          <TextField
            label="Palavra-passe atual"
            type="password"
            autoComplete="current-password"
            required
            value={currentPassword}
            error={fieldErrors.currentPassword}
            onChange={(event) => setCurrentPassword(event.target.value)}
          />
          <TextField
            label="Nova palavra-passe"
            type="password"
            autoComplete="new-password"
            required
            hint={`Mínimo de ${MIN_PASSWORD_LENGTH} carateres.`}
            value={newPassword}
            error={fieldErrors.newPassword}
            onChange={(event) => setNewPassword(event.target.value)}
          />
          <TextField
            label="Confirmar nova palavra-passe"
            type="password"
            autoComplete="new-password"
            required
            value={confirmPassword}
            error={fieldErrors.confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
          />
          <div className="flex justify-end pt-2">
            <Button type="submit" isLoading={isSubmitting}>
              Atualizar palavra-passe
            </Button>
          </div>
        </form>
      </Panel>
    </div>
  );
};
