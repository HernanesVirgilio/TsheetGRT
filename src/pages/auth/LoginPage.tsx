import React, { useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Lock, Mail, Eye, EyeOff, ShieldCheck, AlertCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';

export const LoginPage: React.FC = () => {
  const { signIn, isAuthenticated, mustChangePassword } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  // If already authenticated and no forced password change, redirect to dashboard
  React.useEffect(() => {
    if (isAuthenticated) {
      if (mustChangePassword) {
        navigate('/alterar-palavra-passe', { replace: true });
      } else {
        const from = (location.state as { from?: { pathname: string } })?.from?.pathname || '/dashboard';
        navigate(from, { replace: true });
      }
    }
  }, [isAuthenticated, mustChangePassword, navigate, location]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (!email || !password) {
      setErrorMessage('Por favor preencha todos os campos.');
      return;
    }

    setIsSubmitting(true);
    const result = await signIn(email, password);
    setIsSubmitting(false);

    if (!result.success) {
      setErrorMessage(result.error || 'E-mail ou palavra-passe incorretos.');
    }
  };

  const handleQuickFill = (testEmail: string) => {
    setEmail(testEmail);
    setPassword('123456');
    setErrorMessage('');
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-between py-10 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        {/* Institutional Brand */}
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#1F5FAD] flex items-center justify-center text-white font-bold text-xl tracking-wider shadow-sm mb-3">
            SI
          </div>
          <span className="text-xs font-bold tracking-widest text-[#12304A] uppercase">
            SI HOLDINGS
          </span>
          <span className="text-xl font-bold tracking-tight text-[#1F5FAD]">
            TIMESHEET
          </span>
        </div>

        {/* Login Card */}
        <div className="bg-white py-8 px-6 sm:px-10 rounded-lg border border-[#D9E0E7] shadow-xs">
          <div className="mb-6">
            <h2 className="text-xl font-bold text-[#1F2937]">Iniciar sessão</h2>
            <p className="text-xs text-[#64748B] mt-1">
              Utilize as suas credenciais da empresa.
            </p>
          </div>

          {errorMessage && (
            <div className="mb-5 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#C0392B] flex items-start gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-xs font-semibold text-slate-700 mb-1">
                E-mail
              </label>
              <div className="relative">
                <input
                  id="email"
                  type="email"
                  required
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="utilizador@siholdings-mz.com"
                  className="w-full px-3 py-2 pl-9 text-sm rounded border border-[#D9E0E7] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/20 focus:border-[#1F5FAD]"
                />
                <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="password" className="block text-xs font-semibold text-slate-700">
                  Palavra-passe
                </label>
                <a
                  href="/forgot-password"
                  className="text-xs text-[#1F5FAD] hover:underline"
                >
                  Esqueceu-se da palavra-passe?
                </a>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3 py-2 pl-9 pr-10 text-sm rounded border border-[#D9E0E7] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/20 focus:border-[#1F5FAD]"
                />
                <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-2.5 text-slate-400 hover:text-slate-600"
                  aria-label={showPassword ? 'Ocultar palavra-passe' : 'Mostrar palavra-passe'}
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center">
              <input
                id="remember_me"
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                className="h-4 w-4 rounded border-[#D9E0E7] text-[#1F5FAD] focus:ring-[#1F5FAD]"
              />
              <label htmlFor="remember_me" className="ml-2 block text-xs text-slate-600">
                Lembrar sessão neste dispositivo
              </label>
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded text-sm font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/40 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>A autenticar...</span>
                </>
              ) : (
                <span>Iniciar sessão</span>
              )}
            </button>
          </form>

          {/* Development Seed Accounts Box */}
          <div className="mt-8 pt-6 border-t border-slate-200">
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-600 mb-2">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-600" />
              <span>Contas de Desenvolvimento:</span>
            </div>
            <div className="grid grid-cols-2 gap-2 text-xs">
              <button
                type="button"
                onClick={() => handleQuickFill('admin@siholdings-mz.com')}
                className="p-2 text-left bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition"
              >
                <div className="font-semibold text-slate-800">ADMIN</div>
                <div className="text-[11px] text-slate-500 truncate">admin@siholdings-mz.com</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('it@siholdings-mz.com')}
                className="p-2 text-left bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition"
              >
                <div className="font-semibold text-slate-800">IT</div>
                <div className="text-[11px] text-slate-500 truncate">it@siholdings-mz.com</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('manager@siholdings-mz.com')}
                className="p-2 text-left bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition"
              >
                <div className="font-semibold text-slate-800">MANAGER</div>
                <div className="text-[11px] text-slate-500 truncate">manager@siholdings-mz.com</div>
              </button>
              <button
                type="button"
                onClick={() => handleQuickFill('colaborador@siholdings-mz.com')}
                className="p-2 text-left bg-slate-50 border border-slate-200 rounded hover:bg-slate-100 transition"
              >
                <div className="font-semibold text-slate-800">COLABORADOR</div>
                <div className="text-[11px] text-slate-500 truncate">colaborador@siholdings-mz.com</div>
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mt-2 text-center">
              Palavra-passe de desenvolvimento: <code className="bg-slate-100 px-1 py-0.5 rounded">123456</code> (Exige alteração no 1º acesso)
            </p>
          </div>
        </div>
      </div>

      {/* Institutional Footer */}
      <div className="text-center text-xs text-[#64748B] mt-8">
        Sistema interno · utilização reservada a colaboradores da SI Holdings.
      </div>
    </div>
  );
};
