import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { intlLocale, t } from '../../lib/i18n';
import { firstName, greetingFor } from '../../utils/dashboard';

interface DashboardHeaderProps {
  /** Frase curta sobre o que este painel ajuda a fazer (já traduzida). */
  message: string;
  /** Ação principal e secundárias do perfil (a principal primeiro). */
  actions?: React.ReactNode;
}

/**
 * Cabeçalho dos painéis iniciais: data e contexto, saudação pelo nome preferido, uma frase sobre o painel e
 * as ações do perfil. Sem fotografia: o que interessa (ações e indicadores) fica acima da dobra.
 */
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ message, actions }) => {
  const { currentUser } = useAuth();
  const now = new Date();
  const name = currentUser ? (currentUser.display_name ?? firstName(currentUser.full_name)) : '';
  const today = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(now);
  const context = [today, currentUser?.department?.name].filter(Boolean).join(' · ');

  return (
    <header className="flex flex-col gap-4 border-b border-border pb-5 lg:flex-row lg:items-end lg:justify-between">
      <div className="min-w-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-primary-hover first-letter:uppercase">{context}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-text">
          {greetingFor(now)}
          {name ? `, ${name}` : ''}
        </h1>
        <p className="mt-1 text-sm text-text-secondary">{message}</p>
      </div>
      {actions && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('Ações principais')} role="group">
          {actions}
        </div>
      )}
    </header>
  );
};
