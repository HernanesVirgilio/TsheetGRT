import React from 'react';
import { Panel } from '../ui/Panel';
import { StatusBadge } from '../ui/StatusBadge';
import type { TimesheetDecision } from '../../services/timesheetService';
import { formatDateTime } from '../../utils/format';
import { describeReviewer } from '../../utils/timesheets';

const DECISION_VERBS: Record<TimesheetDecision['status'], string> = {
  APPROVED: 'Aprovado por',
  REJECTED: 'Rejeitado por',
  PENDING: 'Registado por',
};

export const DecisionHistory: React.FC<{ decisions: TimesheetDecision[] }> = ({ decisions }) => (
  <Panel title="Histórico de decisões" flush>
    {decisions.length === 0 ? (
      <p className="px-5 py-4 text-sm text-text-secondary">Ainda não existem decisões sobre este timesheet.</p>
    ) : (
      <ul className="divide-y divide-border">
        {decisions.map((decision) => (
          <li key={decision.id} className="flex flex-col gap-2 px-5 py-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-text">
                {DECISION_VERBS[decision.status]}: <strong>{describeReviewer(decision.reviewer)}</strong>
              </p>
              {decision.reviewer?.email && <p className="text-xs text-text-muted">{decision.reviewer.email}</p>}
              <p className="mt-1 text-sm text-text-secondary">{decision.comment ?? 'Sem comentário.'}</p>
              <p className="mt-0.5 text-xs text-text-muted">{formatDateTime(decision.createdAt)}</p>
            </div>
            <StatusBadge status={decision.status} size="sm" />
          </li>
        ))}
      </ul>
    )}
  </Panel>
);
