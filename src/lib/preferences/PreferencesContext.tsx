import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../auth/AuthContext';
import { DEFAULT_LOCALE, isLocale, setLocale, t } from '../i18n';
import type { Locale } from '../i18n';
import { updateOwnPreferences } from '../../services/userService';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

export function isThemePreference(value: unknown): value is ThemePreference {
  return value === 'light' || value === 'dark' || value === 'system';
}

// Lidas também por index.html antes do primeiro desenho (evita o "flash" do tema errado).
const LOCALE_STORAGE_KEY = 'tsheetgrt.locale';
const THEME_STORAGE_KEY = 'tsheetgrt.theme';

function readStored<Value>(key: string, isValid: (value: unknown) => value is Value): Value | null {
  try {
    const value = window.localStorage.getItem(key);
    return isValid(value) ? value : null;
  } catch {
    return null;
  }
}

function store(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Armazenamento indisponível: a preferência mantém-se na sessão e, com sessão iniciada, no perfil.
  }
}

function systemTheme(): ResolvedTheme {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

interface PreferencesContextValue {
  locale: Locale;
  themePreference: ThemePreference;
  resolvedTheme: ResolvedTheme;
  changeLocale: (locale: Locale) => void;
  changeTheme: (theme: ThemePreference) => void;
  /** Erro ao guardar no perfil (a preferência continua aplicada neste browser). */
  saveError: string | null;
}

const PreferencesContext = createContext<PreferencesContextValue | undefined>(undefined);

/**
 * Idioma e tema: preferências pessoais (nunca usadas para autorização). Ordem de prioridade:
 * perfil do utilizador (persistente entre dispositivos) → este browser → português / tema do sistema.
 * Mudar de idioma volta a montar a área da aplicação para que todos os textos sejam redesenhados.
 */
export const PreferencesProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { currentUser } = useAuth();
  const [locale, setLocaleState] = useState<Locale>(() => {
    const initial = readStored(LOCALE_STORAGE_KEY, isLocale) ?? DEFAULT_LOCALE;
    setLocale(initial);
    return initial;
  });
  const [themePreference, setThemePreference] = useState<ThemePreference>(() => readStored(THEME_STORAGE_KEY, isThemePreference) ?? 'system');
  const [resolvedTheme, setResolvedTheme] = useState<ResolvedTheme>(() => (themePreference === 'system' ? systemTheme() : themePreference));
  const [saveError, setSaveError] = useState<string | null>(null);
  const appliedProfileIdRef = useRef<string | null>(null);

  const applyLocale = useCallback((next: Locale) => {
    setLocale(next);
    setLocaleState(next);
    store(LOCALE_STORAGE_KEY, next);
  }, []);

  const applyTheme = useCallback((next: ThemePreference) => {
    setThemePreference(next);
    store(THEME_STORAGE_KEY, next);
  }, []);

  // Ao entrar, o perfil prevalece sobre o browser (a mesma escolha em todos os dispositivos).
  useEffect(() => {
    if (!currentUser || appliedProfileIdRef.current === currentUser.id) return;
    appliedProfileIdRef.current = currentUser.id;
    if (isLocale(currentUser.preferred_language) && currentUser.preferred_language !== locale) applyLocale(currentUser.preferred_language);
    if (isThemePreference(currentUser.theme_preference)) applyTheme(currentUser.theme_preference);
  }, [currentUser, locale, applyLocale, applyTheme]);

  useEffect(() => {
    const update = () => setResolvedTheme(themePreference === 'system' ? systemTheme() : themePreference);
    update();
    if (themePreference !== 'system' || !window.matchMedia) return undefined;
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, [themePreference]);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
  }, [resolvedTheme]);

  const persist = useCallback(
    (preferences: Parameters<typeof updateOwnPreferences>[1]) => {
      if (!currentUser) return;
      setSaveError(null);
      updateOwnPreferences(currentUser.id, preferences).catch((error: unknown) =>
        setSaveError(error instanceof Error ? error.message : t('Não foi possível guardar as preferências.'))
      );
    },
    [currentUser]
  );

  const changeLocale = useCallback(
    (next: Locale) => {
      if (next === locale) return;
      applyLocale(next);
      persist({ preferredLanguage: next });
    },
    [locale, applyLocale, persist]
  );

  const changeTheme = useCallback(
    (next: ThemePreference) => {
      applyTheme(next);
      persist({ themePreference: next });
    },
    [applyTheme, persist]
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({ locale, themePreference, resolvedTheme, changeLocale, changeTheme, saveError }),
    [locale, themePreference, resolvedTheme, changeLocale, changeTheme, saveError]
  );

  return (
    <PreferencesContext.Provider value={value}>
      <React.Fragment key={locale}>{children}</React.Fragment>
    </PreferencesContext.Provider>
  );
};

export const usePreferences = (): PreferencesContextValue => {
  const context = useContext(PreferencesContext);
  if (!context) throw new Error('usePreferences deve ser utilizado dentro de um PreferencesProvider');
  return context;
};
