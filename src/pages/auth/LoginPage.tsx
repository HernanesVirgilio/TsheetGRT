import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { AuthLayout } from '../../components/layout/AuthLayout';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import { isValidEmail } from '../../utils/validation';

const DEFAULT_REDIRECT_PATH = '/dashboard';

/** Página que o utilizador tentou abrir antes de ser enviado para o login (ver ProtectedRoute). */
function readRedirectPath(state: unknown): string {
  if (typeof state !== 'object' || state === null || !('from' in state)) return DEFAULT_REDIRECT_PATH;
  const from: unknown = state.from;
  if (typeof from !== 'object' || from === null || !('pathname' in from)) return DEFAULT_REDIRECT_PATH;
  return typeof from.pathname === 'string' && from.pathname !== '/login' ? from.pathname : DEFAULT_REDIRECT_PATH;
}

export const LoginPage: React.FC = () => {
  const { signIn, status } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (status === 'ready') navigate(readRedirectPath(location.state), { replace: true });
  }, [status, navigate, location.state]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);

    if (!isValidEmail(email)) {
      setErrorMessage('Indique um endereço de e-mail válido.');
      return;
    }
    if (!password) {
      setErrorMessage('Indique a palavra-passe.');
      return;
    }

    setIsSubmitting(true);
    const result = await signIn(email, password);
    setIsSubmitting(false);
    if (!result.success) setErrorMessage(result.error);
  };

  return (
    <AuthLayout title="Iniciar sessão" subtitle="Utilize as suas credenciais institucionais.">
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

        <TextField
          label="E-mail"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          placeholder="nome@siholdings-mz.com"
        />

        <div className="space-y-1.5">
          <div className="relative">
            <TextField
              label="Palavra-passe"
              type={isPasswordVisible ? 'text' : 'password'}
              autoComplete="current-password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setIsPasswordVisible((visible) => !visible)}
              aria-label={isPasswordVisible ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
              className="absolute bottom-2 right-2 rounded p-1 text-text-muted hover:text-text"
            >
              {isPasswordVisible ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
          <div className="text-right">
            <Link to="/forgot-password" className="text-sm font-medium text-primary-hover hover:underline">
              Esqueceu-se da palavra-passe?
            </Link>
          </div>
        </div>

        <Button type="submit" className="w-full" isLoading={isSubmitting}>
          {isSubmitting ? 'A autenticar...' : 'Iniciar sessão'}
        </Button>
      </form>
    </AuthLayout>
  );
};
