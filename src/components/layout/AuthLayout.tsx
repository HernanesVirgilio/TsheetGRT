import React from 'react';
import { t } from '../../lib/i18n';
import { BrandMark } from './BrandMark';
import { LanguageSwitcher, ThemeToggle } from './PreferenceControls';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

/**
 * Páginas de autenticação. Em ecrãs grandes mostra a imagem institucional de boas-vindas ao lado do
 * formulário (JPEG otimizado; com loading="lazy" não é descarregado
 * quando está oculta). Em ecrãs pequenos fica só o formulário.
 */
export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => (
  <div className="flex min-h-screen flex-col bg-background">
    <div className="flex justify-end gap-2 px-4 pt-4">
      <LanguageSwitcher />
      <ThemeToggle />
    </div>
    <main className="mx-auto flex w-full max-w-6xl flex-1 items-center gap-8 px-4 py-8">
      <img
        src="/images/welcome-enviroment.jpg"
        alt={t('Bem-vindo ao TimesheetGRT: gestão de operações, equipas e timesheets de forma simples, segura e eficiente.')}
        loading="lazy"
        decoding="async"
        className="hidden aspect-[16/9] min-w-0 flex-[1.6] rounded-lg border border-border object-cover lg:block"
      />
      <div className="mx-auto w-full max-w-md lg:mx-0 lg:flex-1">
        <div className="mb-6 flex justify-center lg:justify-start">
          <BrandMark />
        </div>
        <div className="rounded-lg border border-border bg-surface px-6 py-8 sm:px-8">
          <h1 className="text-xl font-semibold text-text">{title}</h1>
          {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
          <div className="mt-6">{children}</div>
        </div>
      </div>
    </main>
    <p className="px-4 pb-6 text-center text-xs text-text-muted">{t('Sistema interno · utilização reservada a colaboradores da SI Holdings.')}</p>
  </div>
);
