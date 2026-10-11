import React from 'react';
import { Moon, Sun } from 'lucide-react';
import { LOCALES, t } from '../../lib/i18n';
import { usePreferences } from '../../lib/preferences/PreferencesContext';

/** Alternância PT / EN. Mudar de idioma não termina a sessão; a escolha fica no perfil e neste browser. */
export const LanguageSwitcher: React.FC = () => {
  const { locale, changeLocale } = usePreferences();
  return (
    <div role="group" aria-label={t('Idioma')} className="flex items-center rounded-md border border-border p-0.5">
      {LOCALES.map((option) => (
        <button
          key={option}
          type="button"
          lang={option}
          aria-pressed={locale === option}
          title={option === 'pt' ? 'Português' : 'English'}
          onClick={() => changeLocale(option)}
          className={`rounded px-2 py-1 text-xs font-semibold uppercase ${
            locale === option ? 'bg-primary text-on-primary' : 'text-text-secondary hover:bg-surface-muted hover:text-text'
          }`}
        >
          {option}
        </button>
      ))}
    </div>
  );
};

/** Alterna entre claro e escuro (a opção "igual ao sistema" está no perfil). */
export const ThemeToggle: React.FC = () => {
  const { resolvedTheme, changeTheme } = usePreferences();
  const isDark = resolvedTheme === 'dark';
  const label = isDark ? t('Mudar para o tema claro') : t('Mudar para o tema escuro');
  return (
    <button
      type="button"
      onClick={() => changeTheme(isDark ? 'light' : 'dark')}
      aria-label={label}
      title={label}
      className="rounded-md p-2 text-text-secondary hover:bg-surface-muted hover:text-text"
    >
      {isDark ? <Sun className="h-5 w-5" aria-hidden="true" /> : <Moon className="h-5 w-5" aria-hidden="true" />}
    </button>
  );
};
