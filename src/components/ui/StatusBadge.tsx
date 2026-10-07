import React from 'react';
import { AlertCircle, CheckCircle2, Clock, Lock, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

type Tone = 'success' | 'warning' | 'danger' | 'neutral';

const TONE_CLASSES: Record<Tone, string> = {
  success: 'border-success/30 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  neutral: 'border-border bg-surface-muted text-text-secondary',
};

// O estado é sempre comunicado por texto e ícone, nunca só pela cor.
const STATUS_PRESENTATION: Record<string, { label: string; tone: Tone; icon: LucideIcon }> = {
  APPROVED: { label: 'Aprovado', tone: 'success', icon: CheckCircle2 },
  SUBMITTED: { label: 'Submetido', tone: 'warning', icon: Clock },
  PENDING: { label: 'Pendente', tone: 'warning', icon: Clock },
  DRAFT: { label: 'Rascunho', tone: 'neutral', icon: Clock },
  REJECTED: { label: 'Rejeitado', tone: 'danger', icon: XCircle },
  LOCKED: { label: 'Bloqueado', tone: 'neutral', icon: Lock },
  ACTIVE: { label: 'Ativo', tone: 'success', icon: CheckCircle2 },
  INACTIVE: { label: 'Inativo', tone: 'neutral', icon: XCircle },
  BLOCKED: { label: 'Bloqueado', tone: 'danger', icon: AlertCircle },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md' }) => {
  const presentation = STATUS_PRESENTATION[status.toUpperCase()];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (!presentation) {
    return (
      <span className={`inline-flex items-center rounded border font-medium ${TONE_CLASSES.neutral} ${sizeClasses}`}>
        {status}
      </span>
    );
  }

  const Icon = presentation.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border font-medium ${TONE_CLASSES[presentation.tone]} ${sizeClasses}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {presentation.label}
    </span>
  );
};
