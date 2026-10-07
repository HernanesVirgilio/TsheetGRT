import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { KeyRound, ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';

export const ChangePasswordPage: React.FC = () => {
  const { changePassword, mustChangePassword } = useAuth();
  const navigate = useNavigate();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessMessage('');

    if (!currentPassword || !newPassword || !confirmPassword) {
      setErrorMessage('Por favor preencha todos os campos.');
      return;
    }

    if (newPassword.length < 12) {
      setErrorMessage('A nova palavra-passe deve conter pelo menos 12 carateres.');
      return;
    }

    if (newPassword === currentPassword) {
      setErrorMessage('A nova palavra-passe deve ser diferente da atual.');
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMessage('A confirmação da nova palavra-passe não coincide.');
      return;
    }

    setIsSubmitting(true);
    const result = await changePassword(currentPassword, newPassword);
    setIsSubmitting(false);

    if (result.success) {
      setSuccessMessage('Palavra-passe alterada com sucesso! A redirecionar para o dashboard...');
      setTimeout(() => {
        navigate('/dashboard', { replace: true });
      }, 1500);
    } else {
      setErrorMessage(result.error || 'Não foi possível alterar a palavra-passe.');
    }
  };

  return (
    <div className="max-w-xl mx-auto py-8 px-4">
      <div className="bg-white rounded-lg border border-[#D9E0E7] shadow-xs p-6 sm:p-8">
        <div className="flex items-center gap-3 pb-4 mb-6 border-b border-slate-100">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-[#1F5FAD] flex items-center justify-center">
            <KeyRound className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-lg font-bold text-[#1F2937]">Alterar Palavra-passe</h1>
            <p className="text-xs text-slate-500">
              {mustChangePassword
                ? 'Primeiro acesso: é obrigatório definir uma nova palavra-passe segura.'
                : 'Defina uma nova palavra-passe segura para a sua conta.'}
            </p>
          </div>
        </div>

        {mustChangePassword && (
          <div className="mb-6 p-3.5 rounded bg-amber-50 border border-amber-200 text-xs text-amber-900 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Aviso de Política Corporativa:</span> A palavra-passe inicial temporária (<code className="bg-amber-100/70 px-1 py-0.5 rounded">123456</code>) expirou. É obrigatório criar uma palavra-passe pessoal com no mínimo 12 carateres.
            </div>
          </div>
        )}

        {errorMessage && (
          <div className="mb-5 p-3 rounded bg-red-50 border border-red-200 text-xs text-[#C0392B] flex items-start gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{errorMessage}</span>
          </div>
        )}

        {successMessage && (
          <div className="mb-5 p-3 rounded bg-emerald-50 border border-emerald-200 text-xs text-emerald-800 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5" />
            <span>{successMessage}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="current_pwd" className="block text-xs font-semibold text-slate-700 mb-1">
              Palavra-passe atual
            </label>
            <input
              id="current_pwd"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Introduza a palavra-passe atual"
              className="w-full px-3 py-2 text-sm rounded border border-[#D9E0E7] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/20 focus:border-[#1F5FAD]"
            />
          </div>

          <div>
            <label htmlFor="new_pwd" className="block text-xs font-semibold text-slate-700 mb-1">
              Nova palavra-passe (mínimo 12 carateres)
            </label>
            <input
              id="new_pwd"
              type="password"
              required
              minLength={12}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mínimo 12 carateres alfanuméricos"
              className="w-full px-3 py-2 text-sm rounded border border-[#D9E0E7] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/20 focus:border-[#1F5FAD]"
            />
          </div>

          <div>
            <label htmlFor="confirm_pwd" className="block text-xs font-semibold text-slate-700 mb-1">
              Confirmar nova palavra-passe
            </label>
            <input
              id="confirm_pwd"
              type="password"
              required
              minLength={12}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Repita a nova palavra-passe"
              className="w-full px-3 py-2 text-sm rounded border border-[#D9E0E7] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/20 focus:border-[#1F5FAD]"
            />
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 px-4 rounded text-sm font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/40 transition disabled:opacity-60 flex items-center justify-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  <span>A atualizar...</span>
                </>
              ) : (
                <span>Atualizar palavra-passe</span>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
