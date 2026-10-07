import React from 'react';

interface PanelProps {
  title?: string;
  description?: string;
  actions?: React.ReactNode;
  /** Remove o espaçamento interno (útil para tabelas que ocupam toda a largura). */
  flush?: boolean;
  children: React.ReactNode;
}

export const Panel: React.FC<PanelProps> = ({ title, description, actions, flush = false, children }) => (
  <section className="rounded-lg border border-border bg-surface">
    {(title || actions) && (
      <header className="flex flex-col gap-3 border-b border-border px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          {title && <h2 className="text-sm font-semibold text-text">{title}</h2>}
          {description && <p className="mt-0.5 text-sm text-text-secondary">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </header>
    )}
    <div className={flush ? '' : 'p-5'}>{children}</div>
  </section>
);
