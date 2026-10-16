import React from 'react';
import { useAuth } from '../../lib/auth/AuthContext';
import { intlLocale, t } from '../../lib/i18n';

interface DashboardHeaderProps {
  /** Ação principal e secundárias do perfil (a principal primeiro). */
  actions?: React.ReactNode;
}

/**
 * Cabeçalho dos painéis iniciais: a data e o departamento numa linha discreta e as ações do perfil. Sem saudação
 * nem frase de apresentação: o espaço fica para o que exige ação. O título existe para leitores de ecrã.
 */
export const DashboardHeader: React.FC<DashboardHeaderProps> = ({ actions }) => {
  const { currentUser } = useAuth();
  const today = new Intl.DateTimeFormat(intlLocale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  const context = [today, currentUser?.department?.name].filter(Boolean).join(' · ');

  return (
    <header className="flex flex-col gap-3 border-b border-border pb-4 sm:flex-row sm:items-center sm:justify-between">
      <h1 className="sr-only">{t('Painel')}</h1>
      <p className="text-xs font-semibold uppercase tracking-wider text-text-secondary first-letter:uppercase">{context}</p>
      {actions && (
        <div className="flex flex-wrap items-center gap-2" aria-label={t('Ações principais')} role="group">
          {actions}
        </div>
      )}
    </header>
  );
};
