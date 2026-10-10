import React from 'react';
import { BADGE_TONE_CLASSES } from '../ui/badgeTones';
import type { BadgeTone } from '../ui/badgeTones';
import type { ApprovalRequestStatus } from '../../types/work';
import { APPROVAL_REQUEST_STATUS_LABELS } from '../../utils/work';

const STATUS_TONES: Record<ApprovalRequestStatus, BadgeTone> = {
  PENDING: 'warning',
  APPROVED: 'success',
  REJECTED: 'danger',
  CANCELLED: 'neutral',
};

/** Estado de um pedido de aprovação (texto sempre presente, nunca só a cor). */
export const ApprovalStatusBadge: React.FC<{ status: ApprovalRequestStatus }> = ({ status }) => (
  <span className={`inline-flex whitespace-nowrap rounded border px-2 py-0.5 text-xs font-medium ${BADGE_TONE_CLASSES[STATUS_TONES[status]]}`}>
    {APPROVAL_REQUEST_STATUS_LABELS[status]}
  </span>
);
