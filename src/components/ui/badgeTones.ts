export type BadgeTone = 'success' | 'warning' | 'danger' | 'info' | 'neutral';

/** Cores semânticas dos badges (estado, prioridade), partilhadas pelo Design System. */
export const BADGE_TONE_CLASSES: Record<BadgeTone, string> = {
  success: 'border-success/30 bg-success-soft text-success',
  warning: 'border-warning/30 bg-warning-soft text-warning',
  danger: 'border-danger/30 bg-danger-soft text-danger',
  info: 'border-info/30 bg-info-soft text-info',
  neutral: 'border-border bg-surface-muted text-text-secondary',
};
