import React from 'react';
import { AlertCircle, AlertTriangle, CheckCircle2, Info, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type AlertVariant = 'success' | 'error' | 'warning' | 'info';

const VARIANT_STYLES: Record<AlertVariant, { container: string; icon: LucideIcon }> = {
  success: { container: 'border-success/30 bg-success-soft text-success', icon: CheckCircle2 },
  error: { container: 'border-danger/30 bg-danger-soft text-danger', icon: AlertCircle },
  warning: { container: 'border-warning/30 bg-warning-soft text-warning', icon: AlertTriangle },
  info: { container: 'border-info/30 bg-info-soft text-info', icon: Info },
};

interface AlertProps {
  variant: AlertVariant;
  title?: string;
  children: React.ReactNode;
  onDismiss?: () => void;
  action?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({ variant, title, children, onDismiss, action }) => {
  const { container, icon: Icon } = VARIANT_STYLES[variant];
  return (
    <div
      role={variant === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-3 rounded-md border px-4 py-3 text-sm ${container}`}
    >
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1 text-text">
        {title && <p className="font-semibold">{title}</p>}
        <div className={title ? 'mt-0.5 text-text-secondary' : ''}>{children}</div>
        {action && <div className="mt-3">{action}</div>}
      </div>
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Fechar mensagem"
          className="rounded p-0.5 text-text-muted hover:text-text"
        >
          <X className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  );
};
