import React from 'react';
import { Alert } from '../ui/Alert';
import type { TimesheetSummary } from '../../types';
import type { TimesheetDecision } from '../../services/timesheetService';
import { formatDateTime } from '../../utils/format';
import { describeReviewer } from '../../utils/timesheets';

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
        <Alert variant="error" title={`Rejeitado por: ${describeReviewer(latestDecision?.reviewer ?? null)}`}>
          Motivo: {summary.rejectionReason ?? '—'} ({formatDateTime(summary.rejectedAt)}).
          {audience === 'owner' && ' Corrija os registos e submeta novamente.'}
        </Alert>
      );
    case 'SUBMITTED':
      return (
        <Alert variant="warning" title={audience === 'owner' ? 'A aguardar aprovação' : 'Por aprovar'}>
          Submetido em {formatDateTime(summary.submittedAt)}.
          {audience === 'owner' && ' A edição está bloqueada até à decisão do gestor.'}
        </Alert>
      );
    case 'APPROVED':
      return (
        <Alert variant="success" title={`Aprovado por: ${describeReviewer(latestDecision?.reviewer ?? null)}`}>
          Aprovado em {formatDateTime(summary.approvedAt)}.
        </Alert>
      );
    default:
      return null;
  }
};
