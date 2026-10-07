import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Mail, ArrowLeft, CheckCircle2 } from 'lucide-react';

export const ForgotPasswordPage: React.FC = () => {
  const [email, setEmail] = useState('');
  const [submitted, setSubmitted] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    // Simulate Supabase password reset request
    setTimeout(() => {
      setIsSubmitting(false);
      setSubmitted(true);
    }, 600);
  };

  return (
    <div className="min-h-screen bg-[#F5F7FA] flex flex-col justify-between py-12 px-4 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex flex-col items-center mb-6">
          <div className="w-12 h-12 rounded-lg bg-[#1F5FAD] flex items-center justify-center text-white font-bold text-xl mb-3">
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
            Recuperar palavra-passe
          </h2>
          <p className="text-xs text-[#64748B] mb-6">
            Indique o seu endereço de e-mail institucional para receber as instruções de recuperação.
          </p>

          {submitted ? (
            <div className="space-y-4">
              <div className="p-4 rounded bg-blue-50 border border-blue-200 text-xs text-blue-900 flex items-start gap-3">
                <CheckCircle2 className="w-5 h-5 text-[#1F5FAD] shrink-0 mt-0.5" />
                <div>
                  <p className="font-semibold text-sm mb-1">Pedido submetido</p>
                  <p className="leading-relaxed">
                    Se o endereço de e-mail estiver registado no sistema corporativo, receberá em breve instruções para redefinir a sua palavra-passe.
                  </p>
                </div>
              </div>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-[#1F5FAD] hover:underline"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Voltar ao ecrã de início de sessão
                </Link>
              </div>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="reset_email" className="block text-xs font-semibold text-slate-700 mb-1">
                  E-mail institucional
                </label>
                <div className="relative">
                  <input
                    id="reset_email"
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="utilizador@siholdings-mz.com"
                    className="w-full px-3 py-2 pl-9 text-sm rounded border border-[#D9E0E7] bg-white text-slate-900 focus:outline-none focus:ring-2 focus:ring-[#1F5FAD]/20 focus:border-[#1F5FAD]"
                  />
                  <Mail className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                </div>
              </div>

              <button
                type="submit"
                disabled={isSubmitting}
                className="w-full py-2.5 px-4 rounded text-sm font-semibold text-white bg-[#1F5FAD] hover:bg-[#184d8f] focus:outline-none transition disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {isSubmitting ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    <span>A enviar...</span>
                  </>
                ) : (
                  <span>Enviar instruções</span>
                )}
              </button>

              <div className="pt-2 text-center">
                <Link
                  to="/login"
                  className="inline-flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800"
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
