import React from 'react';
import { ArrowDown, ArrowUp, ChevronsUp, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BADGE_TONE_CLASSES } from '../ui/badgeTones';
import type { BadgeTone } from '../ui/badgeTones';
import type { TicketPriority } from '../../types/it';
import { TICKET_PRIORITY_LABELS } from '../../utils/it';

const PRIORITY_PRESENTATION: Record<TicketPriority, { tone: BadgeTone; icon: LucideIcon }> = {
  LOW: { tone: 'neutral', icon: ArrowDown },
  MEDIUM: { tone: 'info', icon: Minus },
  HIGH: { tone: 'warning', icon: ArrowUp },
  CRITICAL: { tone: 'danger', icon: ChevronsUp },
};

/** A prioridade é sempre comunicada por texto e ícone, nunca só pela cor. */
export const PriorityBadge: React.FC<{ priority: TicketPriority }> = ({ priority }) => {
  const { tone, icon: Icon } = PRIORITY_PRESENTATION[priority];
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${BADGE_TONE_CLASSES[tone]}`}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {TICKET_PRIORITY_LABELS[priority]}
    </span>
  );
};
