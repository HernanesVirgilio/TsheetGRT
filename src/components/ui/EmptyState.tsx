import React from 'react';
import { Inbox } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

interface EmptyStateProps {
  title: string;
  message?: string;
  icon?: LucideIcon;
  action?: React.ReactNode;
  /** Desligar quando o estado vazio já está dentro de um Panel. */
  bordered?: boolean;
}

export const EmptyState: React.FC<EmptyStateProps> = ({ title, message, icon: Icon = Inbox, action, bordered = true }) => (
  <div
    className={`flex flex-col items-center justify-center px-6 py-12 text-center ${
      bordered ? 'rounded-lg border border-dashed border-border bg-surface' : ''
    }`}
  >
    <div className="mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-surface-muted text-text-muted">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </div>
    <p className="text-sm font-semibold text-text">{title}</p>
    {message && <p className="mt-1 max-w-sm text-sm text-text-secondary">{message}</p>}
    {action && <div className="mt-4">{action}</div>}
  </div>
);
