import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../lib/auth/AuthContext';
import { initialAuthRedirect } from '../../lib/supabase/client';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import { LoadingState } from '../../components/ui/States';
import type { FieldErrors, NewPasswordField } from '../../utils/validation';
import { hasErrors, MIN_PASSWORD_LENGTH, validateNewPassword } from '../../utils/validation';
import { t } from '../../lib/i18n';

const InvalidLinkScreen: React.FC<{ isExpired: boolean }> = ({ isExpired }) => (
  <AuthLayout title={isExpired ? t('Link expirado') : t('Link inválido')}>
    <Alert variant="error">
      {isExpired
        ? t('Este link já expirou ou já foi utilizado. Os links de convite e de recuperação só podem ser usados uma vez.')
        : t('Não foi possível validar este link.')}{' '}
      {t('Peça um novo link de recuperação ou contacte o administrador para reenviar o convite.')}
    </Alert>
    <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:justify-between">
      <Link to="/forgot-password" className="text-sm font-medium text-primary-hover hover:underline">
        {t('Pedir novo link')}
      </Link>
      <Link to="/login" className="text-sm font-medium text-primary-hover hover:underline">
        {t('Voltar ao início de sessão')}
      </Link>
    </div>
  </AuthLayout>
);

/**
 * Destino dos links de convite e de recuperação enviados pelo Supabase Auth.
 * O SDK cria a sessão a partir do link; aqui o utilizador define a palavra-passe e, só depois de o
 * servidor confirmar a sessão e o acesso, segue para o dashboard.
 */
export const ResetPasswordPage: React.FC = () => {
  const { status, hasSession, completePasswordSetup } = useAuth();
  const navigate = useNavigate();
  // Após um refresh o fragmento já foi limpo: o formulário continua disponível com a sessão do link.
  const authRedirect = initialAuthRedirect;
  const isInvite = authRedirect?.type === 'invite';
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<NewPasswordField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // O link falhou no Supabase (expirado, já usado, ...): não há nada para definir.
  if (authRedirect?.errorCode) {
    return <InvalidLinkScreen isExpired={authRedirect.errorCode === 'otp_expired' || authRedirect.errorCode === 'access_denied'} />;
  }

  if (status === 'loading') {
    return (
      <AuthLayout title={isInvite ? t('Ativar conta') : t('Definir palavra-passe')}>
        <LoadingState label={t('A validar o link...')} />
      </AuthLayout>
    );
  }

  if (!hasSession) return <InvalidLinkScreen isExpired />;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    const errors = validateNewPassword({ newPassword, confirmPassword });
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    const result = await completePasswordSetup(newPassword);
    if (result.outcome === 'error') {
      setErrorMessage(result.error);
      setIsSubmitting(false);
      return;
    }
    if (result.outcome === 'signed_out') {
      navigate('/login', {
        replace: true,
        state: { notice: t('A palavra-passe foi guardada, mas a sessão do link terminou. Inicie sessão com a nova palavra-passe.') },
      });
      return;
    }
    // `ready` abre o dashboard; `blocked` mostra no AppShell o motivo e as opções disponíveis.
    navigate('/dashboard', { replace: true });
  };

  return (
    <AuthLayout
      title={isInvite ? t('Ativar conta') : t('Definir nova palavra-passe')}
      subtitle={[
        isInvite ? t('Bem-vindo ao TimesheetGRT.') : '',
        t('Escolha uma palavra-passe pessoal com pelo menos {min} carateres.', { min: MIN_PASSWORD_LENGTH }),
      ]
        .filter(Boolean)
        .join(' ')}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField
          label={t('Nova palavra-passe')}
          type="password"
          autoComplete="new-password"
          required
          value={newPassword}
          error={fieldErrors.newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
        />
        <TextField
          label={t('Confirmar palavra-passe')}
          type="password"
          autoComplete="new-password"
          required
          value={confirmPassword}
          error={fieldErrors.confirmPassword}
          onChange={(event) => setConfirmPassword(event.target.value)}
        />
        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? t('A guardar e a preparar o acesso...') : isInvite ? t('Ativar conta') : t('Guardar palavra-passe')}
        </Button>
      </form>
    </AuthLayout>
  );
};
