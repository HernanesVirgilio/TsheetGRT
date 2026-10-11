import React from 'react';
import { Alert } from '../ui/Alert';
import type { TimesheetSummary } from '../../types';
import type { TimesheetDecision } from '../../services/timesheetService';
import { formatDateTime } from '../../utils/format';
import { describeReviewer } from '../../utils/timesheets';
import { t } from '../../lib/i18n';

interface TimesheetStatusNoticeProps {
  summary: TimesheetSummary;
  /** Histórico de decisões (mais recente primeiro), para indicar quem decidiu. */
  decisions: TimesheetDecision[];
  /** Perspetiva de quem lê: o próprio colaborador ou quem revê. */
  audience: 'owner' | 'reviewer';
}

export const TimesheetStatusNotice: React.FC<TimesheetStatusNoticeProps> = ({ summary, decisions, audience }) => {
  const latestDecision = decisions.find((decision) => decision.status === summary.status) ?? null;

  switch (summary.status) {
    case 'REJECTED':
      return (
        <Alert variant="error" title={t('Rejeitado por: {reviewer}', { reviewer: describeReviewer(latestDecision?.reviewer ?? null) })}>
          {t('Motivo: {reason} ({date}).', { reason: summary.rejectionReason ?? '—', date: formatDateTime(summary.rejectedAt) })}
          {audience === 'owner' && ' Corrija os registos e submeta novamente.'}
        </Alert>
      );
    case 'SUBMITTED':
      return (
        <Alert variant="warning" title={audience === 'owner' ? t('A aguardar aprovação') : t('Por aprovar')}>
          {t('Submetido em {date}.', { date: formatDateTime(summary.submittedAt) })}
          {audience === 'owner' && ` ${t('A edição está bloqueada até à decisão do gestor.')}`}
        </Alert>
      );
    case 'APPROVED':
      return (
        <Alert variant="success" title={t('Aprovado por: {reviewer}', { reviewer: describeReviewer(latestDecision?.reviewer ?? null) })}>
          {t('Aprovado em {date}.', { date: formatDateTime(summary.approvedAt) })}
        </Alert>
      );
    default:
      return null;
  }
};
