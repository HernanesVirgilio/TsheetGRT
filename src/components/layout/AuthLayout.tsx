import React from 'react';
import { BrandMark } from './BrandMark';

interface AuthLayoutProps {
  title: string;
  subtitle?: string;
  children: React.ReactNode;
}

export const AuthLayout: React.FC<AuthLayoutProps> = ({ title, subtitle, children }) => (
  <div className="flex min-h-screen flex-col justify-between bg-background px-4 py-10">
    <main className="mx-auto w-full max-w-md">
      <div className="mb-6 flex justify-center">
        <BrandMark />
      </div>
      <div className="rounded-lg border border-border bg-surface px-6 py-8 sm:px-8">
        <h1 className="text-xl font-semibold text-text">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-text-secondary">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
    </main>
    <p className="mt-8 text-center text-xs text-text-muted">
      Sistema interno · utilização reservada a colaboradores da SI Holdings.
    </p>
  </div>
);
