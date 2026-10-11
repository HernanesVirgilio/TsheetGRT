import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { requestPasswordReset } from '../../services/authService';
import { isValidEmail } from '../../utils/validation';
import { t } from '../../lib/i18n';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    if (!isValidEmail(email)) {
      setErrorMessage(t('Indique um endereço de e-mail válido.'));
      return;
    }

    setIsSubmitting(true);
    try {
      await requestPasswordReset(email);
      setIsSubmitted(true);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível enviar o pedido de recuperação.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title={t('Recuperar palavra-passe')}
      subtitle={t('Indique o seu e-mail institucional para receber um link de redefinição.')}
    >
      {isSubmitted ? (
        // Mensagem neutra: não revela se o e-mail existe no sistema.
        <Alert variant="success" title={t('Pedido enviado')}>
          {t('Se o endereço estiver registado, receberá em breve um e-mail com instruções para definir uma nova palavra-passe.')}
        </Alert>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4" noValidate>
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          <TextField
            label={t('E-mail institucional')}
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" className="w-full" isLoading={isSubmitting}>
            {t('Enviar instruções')}
          </Button>
        </form>
      )}
      <div className="mt-6 text-center">
        <Link to="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          {t('Voltar ao início de sessão')}
        </Link>
      </div>
    </AuthLayout>
  );
};
