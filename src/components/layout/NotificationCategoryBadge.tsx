import React from 'react';
import { BADGE_TONE_CLASSES } from '../ui/badgeTones';
import {
  isNotificationCategory,
  NOTIFICATION_CATEGORY_LABELS,
  NOTIFICATION_CATEGORY_TONES,
} from '../../utils/notifications';

/** Distingue informação, conclusão, pedido de aprovação, alerta de prazo e decisão tomada. */
export const NotificationCategoryBadge: React.FC<{ category: string }> = ({ category }) => {
  const known = isNotificationCategory(category) ? category : 'INFO';
  return (
    <span
      className={`inline-flex shrink-0 items-center whitespace-nowrap rounded border px-1.5 py-0.5 text-[11px] font-medium ${BADGE_TONE_CLASSES[NOTIFICATION_CATEGORY_TONES[known]]}`}
    >
      {NOTIFICATION_CATEGORY_LABELS[known]}
    </span>
  );
};
