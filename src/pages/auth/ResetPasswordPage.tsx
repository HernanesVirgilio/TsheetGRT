import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { KeyRound, CheckCircle2, AlertCircle, ArrowLeft } from 'lucide-react';

export const ResetPasswordPage: React.FC = () => {
  const navigate = useNavigate();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [isSuccess, setIsSuccess] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');

    if (newPassword.length < 12) {
      setErrorMessage('A nova palavra-passe deve conter pelo menos 12 carateres.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação da palavra-passe não coincide.');
      return;
    }

    setIsSubmitting(true);
    setTimeout(() => {
      setIsSubmitting(false);
      setIsSuccess(true);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#1F5FAD] flex items-center justify-center text-white font-bold text-xl mb-3 shadow-xs">
            SI
          </div>
          <span className="text-xs font-bold tracking-widest text-[#12304A] uppercase">
            SI HOLDINGS
          </span>
          <span className="text-xl font-bold tracking-tight text-[#1F5FAD]">
            TIMESHEET
          </span>
        </div>

        <div className="bg-white py-8 px-6 sm:px-10 rounded-lg border border-[#D9E0E7] shadow-xs">
          <h2 className="text-xl font-bold text-[#1F2937] mb-1">
            Definir nova palavra-passe
          </h2>
          <p className="text-xs text-[#64748B] mb-6">
            Introduza a nova palavra-passe segura para a sua conta corporativa.
          </p>

          {isSuccess ? (
            <div className="space-y-4">
              <div className="p-4 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-900 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm mb-1">Palavra-passe atualizada</p>
                  <p className="leading-relaxed">
                    A sua palavra-passe foi redefinida com sucesso. Pode agora iniciar sessão com as novas credenciais.
                  </p>
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="button"
                  onClick={() => navigate('/login')}
                  className="w-full py-2.5 px-4 rounded text-xs font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] transition"
                >
                  Ir para Início de Sessão
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4 text-xs">
              {errorMessage && (
                <div className="p-2.5 bg-red-50 border border-red-200 text-[#C0392B] rounded flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{errorMessage}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nova Palavra-passe (mínimo 12 carateres)
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={12}
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 pl-9 border border-[#D9E0E7] rounded bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1F5FAD]"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Confirmar Nova Palavra-passe
                </label>
                <div className="relative">
                  <input
                    type="password"
                    required
                    minLength={12}
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className="w-full px-3 py-2 pl-9 border border-[#D9E0E7] rounded bg-white text-slate-900 focus:outline-none focus:ring-1 focus:ring-[#1F5FAD]"
                  />
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded text-xs font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>A guardar...</span>
                  </>
                ) : (
                  <span>Guardar Nova Palavra-passe</span>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-slate-500 hover:text-slate-800"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar ao início de sessão
                </Link>
              </div>
            </form>
          )}
        </div>
      </div>

      <div className="text-center text-xs text-[#64748B] mt-8">
        Sistema interno · utilização reservada a colaboradores da SI Holdings.
      </div>
    </div>
  );
};
