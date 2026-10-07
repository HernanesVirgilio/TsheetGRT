import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface ErrorPageLayoutProps {
  code: string;
  title: string;
  message: string;
  icon: LucideIcon;
}

export const ErrorPageLayout: React.FC<ErrorPageLayoutProps> = ({ code, title, message, icon: Icon }) => (
  <div className="flex min-h-[70vh] flex-col items-center justify-center px-4 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-surface-muted text-text-muted">
      <Icon className="h-7 w-7" aria-hidden="true" />
    </div>
    <p className="mb-1 text-xs font-semibold uppercase tracking-wider text-text-muted">Erro {code}</p>
    <h1 className="mb-2 text-2xl font-semibold text-text">{title}</h1>
    <p className="mb-6 max-w-md text-sm text-text-secondary">{message}</p>
    <Link
      to="/dashboard"
      className="inline-flex h-10 items-center gap-2 rounded-md bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover hover:text-white"
    >
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar ao dashboard
    </Link>
  </div>
);
