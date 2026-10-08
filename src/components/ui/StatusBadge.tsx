import React from 'react';
import { AlertCircle, CheckCircle2, Clock, CircleDot, Lock, PauseCircle, Wrench, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BADGE_TONE_CLASSES } from './badgeTones';
import type { BadgeTone } from './badgeTones';

// O estado é sempre comunicado por texto e ícone, nunca só pela cor.
const STATUS_PRESENTATION: Record<string, { label: string; tone: BadgeTone; icon: LucideIcon }> = {
  APPROVED: { label: 'Aprovado', tone: 'success', icon: CheckCircle2 },
  SUBMITTED: { label: 'Submetido', tone: 'warning', icon: Clock },
  PENDING: { label: 'Pendente', tone: 'warning', icon: Clock },
  DRAFT: { label: 'Rascunho', tone: 'neutral', icon: Clock },
  REJECTED: { label: 'Rejeitado', tone: 'danger', icon: XCircle },
  LOCKED: { label: 'Bloqueado', tone: 'neutral', icon: Lock },
  ACTIVE: { label: 'Ativo', tone: 'success', icon: CheckCircle2 },
  INACTIVE: { label: 'Inativo', tone: 'neutral', icon: XCircle },
  BLOCKED: { label: 'Bloqueado', tone: 'danger', icon: AlertCircle },
  // Pedidos de suporte IT
  OPEN: { label: 'Aberto', tone: 'warning', icon: CircleDot },
  IN_PROGRESS: { label: 'Em atendimento', tone: 'info', icon: Wrench },
  WAITING_USER: { label: 'A aguardar colaborador', tone: 'warning', icon: PauseCircle },
  RESOLVED: { label: 'Resolvido', tone: 'success', icon: CheckCircle2 },
  CLOSED: { label: 'Fechado', tone: 'neutral', icon: Lock },
  // Equipamentos de IT
  IN_REPAIR: { label: 'Em reparação', tone: 'warning', icon: Wrench },
  IN_STOCK: { label: 'Em stock', tone: 'neutral', icon: CircleDot },
  RETIRED: { label: 'Abatido', tone: 'neutral', icon: XCircle },
  LOST: { label: 'Perdido', tone: 'danger', icon: AlertCircle },
};

interface StatusBadgeProps {
  status: string;
  size?: 'sm' | 'md';
  /** Substitui o texto quando o mesmo estado tem outro nome no contexto (ex.: equipamento "Em uso"). */
  label?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({ status, size = 'md', label }) => {
  const presentation = STATUS_PRESENTATION[status.toUpperCase()];
  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  if (!presentation) {
    return (
      <span className={`inline-flex items-center rounded border font-medium ${BADGE_TONE_CLASSES.neutral} ${sizeClasses}`}>
        {label ?? status}
      </span>
    );
  }

  const Icon = presentation.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border font-medium ${BADGE_TONE_CLASSES[presentation.tone]} ${sizeClasses}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label ?? presentation.label}
    </span>
  );
};
