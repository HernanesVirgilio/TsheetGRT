import React from 'react';
import { AlertCircle, Ban, CheckCircle2, CircleDot, Clock, Lock, PauseCircle, PlayCircle, Trophy, UserCheck, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { BADGE_TONE_CLASSES } from '../ui/badgeTones';
import type { BadgeTone } from '../ui/badgeTones';
import type { AbsenceStatus, MeetingStatus, OpportunityStatus, TaskStatus } from '../../types/work';
import {
  ABSENCE_STATUS_LABELS,
  MEETING_STATUS_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  TASK_STATUS_LABELS,
} from '../../utils/work';

interface Presentation {
  tone: BadgeTone;
  icon: LucideIcon;
}

const TASK: Record<TaskStatus, Presentation> = {
  PLANNED: { tone: 'neutral', icon: CircleDot },
  ASSIGNED: { tone: 'info', icon: UserCheck },
  IN_PROGRESS: { tone: 'info', icon: PlayCircle },
  BLOCKED: { tone: 'danger', icon: PauseCircle },
  COMPLETED: { tone: 'success', icon: CheckCircle2 },
  CANCELLED: { tone: 'neutral', icon: Ban },
};

const MEETING: Record<MeetingStatus, Presentation> = {
  PLANNED: { tone: 'neutral', icon: Clock },
  CONFIRMED: { tone: 'info', icon: CheckCircle2 },
  COMPLETED: { tone: 'success', icon: CheckCircle2 },
  CANCELLED: { tone: 'neutral', icon: Ban },
};

const ABSENCE: Record<AbsenceStatus, Presentation> = {
  DRAFT: { tone: 'neutral', icon: Clock },
  SUBMITTED: { tone: 'warning', icon: Clock },
  APPROVED: { tone: 'success', icon: CheckCircle2 },
  REJECTED: { tone: 'danger', icon: XCircle },
  CANCELLED: { tone: 'neutral', icon: Ban },
};

const OPPORTUNITY: Record<OpportunityStatus, Presentation> = {
  NEW: { tone: 'neutral', icon: CircleDot },
  QUALIFICATION: { tone: 'info', icon: CircleDot },
  PROPOSAL: { tone: 'info', icon: CircleDot },
  NEGOTIATION: { tone: 'warning', icon: CircleDot },
  WON: { tone: 'success', icon: Trophy },
  LOST: { tone: 'danger', icon: XCircle },
  CANCELLED: { tone: 'neutral', icon: Lock },
};

type WorkStatusBadgeProps =
  | { kind: 'task'; status: TaskStatus }
  | { kind: 'meeting'; status: MeetingStatus }
  | { kind: 'absence'; status: AbsenceStatus }
  | { kind: 'opportunity'; status: OpportunityStatus };

function resolve(props: WorkStatusBadgeProps): { presentation: Presentation; label: string } {
  switch (props.kind) {
    case 'task':
      return { presentation: TASK[props.status], label: TASK_STATUS_LABELS[props.status] };
    case 'meeting':
      return { presentation: MEETING[props.status], label: MEETING_STATUS_LABELS[props.status] };
    case 'absence':
      return { presentation: ABSENCE[props.status], label: ABSENCE_STATUS_LABELS[props.status] };
    case 'opportunity':
      return { presentation: OPPORTUNITY[props.status], label: OPPORTUNITY_STATUS_LABELS[props.status] };
  }
}

/** O estado é comunicado por texto e ícone, nunca só pela cor. */
export const WorkStatusBadge: React.FC<WorkStatusBadgeProps> = (props) => {
  const { presentation, label } = resolve(props);
  const Icon = presentation.icon;
  return (
    <span
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${BADGE_TONE_CLASSES[presentation.tone]}`}
    >
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </span>
  );
};

/** Indicador de atraso (calculado, não é um estado). */
export const OverdueBadge: React.FC<{ label?: string }> = ({ label = 'Atrasada' }) => (
  <span className={`inline-flex items-center gap-1 whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${BADGE_TONE_CLASSES.danger}`}>
    <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
    {label}
  </span>
);
