import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import { updatePassword } from '../../services/authService';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import { LoadingState } from '../../components/ui/States';
import type { FieldErrors, NewPasswordField } from '../../utils/validation';
import { hasErrors, MIN_PASSWORD_LENGTH, validateNewPassword } from '../../utils/validation';

/**
 * Destino dos links de convite e de recuperação enviados pelo Supabase Auth.
 * O SDK cria a sessão a partir do link; aqui o utilizador define a palavra-passe.
 */
export const ResetPasswordPage: React.FC = () => {
  const { status, hasSession, refreshProfile } = useAuth();
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<NewPasswordField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (status === 'loading') {
    return (
      <AuthLayout title="Definir palavra-passe">
        <LoadingState label="A validar o link..." />
      </AuthLayout>
    );
  }

  if (!hasSession) {
    return (
      <AuthLayout title="Link inválido ou expirado">
        <Alert variant="error">
          Este link já foi utilizado ou expirou. Peça um novo link de recuperação ou contacte o administrador para reenviar o convite.
        </Alert>
        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
          <Link to="/forgot-password" className="text-sm font-medium text-primary-hover hover:underline">
            Pedir novo link
          </Link>
          <Link to="/login" className="text-sm font-medium text-primary-hover hover:underline">
            Voltar ao início de sessão
          </Link>
        </div>
      </AuthLayout>
    );
  }

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateNewPassword({ newPassword, confirmPassword });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    try {
      await updatePassword(newPassword);
      await refreshProfile();
      navigate('/dashboard', { replace: true });
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar a palavra-passe.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Definir palavra-passe"
      subtitle={`Escolha uma palavra-passe pessoal com pelo menos ${MIN_PASSWORD_LENGTH} carateres.`}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField
          label="Nova palavra-passe"
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          error={fieldErrors.newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <TextField
          label="Confirmar palavra-passe"
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          Guardar palavra-passe
        </Button>
      </form>
    </AuthLayout>
  );
};
