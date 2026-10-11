import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { intlLocale, t } from '../../lib/i18n';
import { firstName, greetingFor } from '../../utils/dashboard';

interface WelcomeBannerProps {
  /** Frase curta sobre o que este painel ajuda a fazer (já traduzida). */
  message: string;
}

/**
 * Boas-vindas no topo dos painéis: saudação pela hora local, nome preferido e contexto.
 * O texto é HTML sobre a superfície (contraste garantido nos dois temas); a fotografia é decorativa,
 * fica ao lado do texto e desaparece em ecrãs pequenos para não empurrar as tarefas para baixo.
 */
export const WelcomeBanner: React.FC<WelcomeBannerProps> = ({ message }) => {
  const { currentUser } = useAuth();
  if (!currentUser) return null;
  const now = new Date();
  const name = currentUser.display_name ?? firstName(currentUser.full_name);
  const today = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long' }).format(now);
  const context = [today, currentUser.department?.name].filter(Boolean).join(' · ');

  return (
    <section aria-label={t('Boas-vindas')} className="flex overflow-hidden rounded-lg border border-border bg-surface">
      <div className="min-w-0 flex-1 px-5 py-4 sm:py-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-hover first-letter:uppercase">{context}</p>
        <p className="mt-1 text-lg font-semibold tracking-tight text-text sm:text-xl">
          {greetingFor(now)}, {name}
        </p>
        <p className="mt-0.5 text-sm text-text-secondary">{message}</p>
      </div>
      <div className="relative hidden w-2/5 max-w-sm shrink-0 sm:block" aria-hidden="true">
        <img src="/images/welcome-banner.jpg" alt="" className="absolute inset-0 h-full w-full object-cover object-[50%_35%]" />
        {/* Transição suave entre a superfície e a fotografia (sem texto sobre a imagem). */}
        <div className="absolute inset-y-0 left-0 w-12 bg-gradient-to-r from-surface to-transparent" />
      </div>
    </section>
  );
};
