import React from 'react';
import { Check, Circle, Lock, Send, X } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTimesheetHistory } from '../../services/timesheetService';
import type { TimesheetHistoryEvent } from '../../services/timesheetService';
import type { TimesheetSummary } from '../../types';
import { Panel } from '../ui/Panel';
import { LoadingState } from '../ui/States';
import { formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

type StepState = 'done' | 'current' | 'rejected' | 'pending';

interface FlowStep {
  id: string;
  label: string;
  state: StepState;
  /** Estado em texto (a cor nunca é a única indicação). */
  stateLabel: string;
  detail?: string | null;
  note?: string | null;
}

const lastOf = (events: TimesheetHistoryEvent[], action: TimesheetHistoryEvent['action']) =>
  [...events].reverse().find((event) => event.action === action) ?? null;

const describe = (event: TimesheetHistoryEvent | null) =>
  event ? [event.actorName, formatDateTime(event.createdAt)].filter(Boolean).join(' · ') : null;

/** Etapas do ciclo de aprovação a partir do estado atual e do histórico guardado. */
export function buildApprovalSteps(status: TimesheetSummary['status'], events: TimesheetHistoryEvent[]): FlowStep[] {
  const created = lastOf(events, 'timesheet.created');
  const submitted = lastOf(events, 'timesheet.submitted');
  const submissions = events.filter((event) => event.action === 'timesheet.submitted').length;
  const approved = lastOf(events, 'timesheet.approved');
  const rejected = lastOf(events, 'timesheet.rejected');
  const isSubmitted = status !== 'DRAFT';
  const isApproved = status === 'APPROVED' || status === 'LOCKED';

  return [
    { id: 'draft', label: t('Rascunho'), state: 'done', stateLabel: t('Criado'), detail: describe(created) },
    {
      id: 'submitted',
      label: t('Submetido'),
      state: isSubmitted ? 'done' : 'current',
      stateLabel: isSubmitted ? (submissions > 1 ? t('Submetido {count} vezes', { count: submissions }) : t('Concluído')) : t('Por submeter'),
      detail: isSubmitted ? describe(submitted) : t('O colaborador regista as horas e submete.'),
    },
    {
      id: 'review',
      label: t('Análise do gestor'),
      state: status === 'SUBMITTED' ? 'current' : status === 'REJECTED' ? 'rejected' : isApproved ? 'done' : 'pending',
      stateLabel:
        status === 'SUBMITTED' ? t('Em análise') : status === 'REJECTED' ? t('Rejeitado') : isApproved ? t('Aprovado') : t('Pendente'),
      detail: status === 'REJECTED' ? describe(rejected) : isApproved ? describe(approved) : null,
      note: status === 'REJECTED' ? (rejected?.comment ?? null) : null,
    },
    {
      id: 'locked',
      label: t('Aprovado e bloqueado'),
      state: isApproved ? 'done' : 'pending',
      stateLabel: isApproved ? t('Fechado para edição') : status === 'REJECTED' ? t('Corrigir e submeter novamente') : t('Pendente'),
      detail: isApproved ? (approved?.comment ?? null) : null,
    },
  ];
}

const STEP_STYLES: Record<StepState, { circle: string; icon: LucideIcon; label: string }> = {
  done: { circle: 'border-primary bg-primary text-on-primary', icon: Check, label: 'text-text' },
  current: { circle: 'border-primary bg-surface text-primary-hover ring-4 ring-primary-soft', icon: Send, label: 'text-text' },
  rejected: { circle: 'border-danger bg-danger text-on-danger', icon: X, label: 'text-danger' },
  pending: { circle: 'border-border-input bg-surface text-text-muted', icon: Circle, label: 'text-text-secondary' },
};

/**
 * Ciclo de aprovação: horizontal em ecrãs largos, vertical em ecrãs estreitos. Verde para o que está
 * concluído, cinzento para o que falta, vermelho contido para a rejeição; cada etapa tem texto.
 */
export const ApprovalFlow: React.FC<{ steps: FlowStep[] }> = ({ steps }) => (
  <ol className="flex flex-col gap-4 md:flex-row md:gap-0" aria-label={t('Ciclo de aprovação')}>
    {steps.map((step, index) => {
      const style = STEP_STYLES[step.state];
      const Icon = step.id === 'locked' && step.state === 'done' ? Lock : style.icon;
      const isLast = index === steps.length - 1;
      return (
        <li key={step.id} className="relative flex gap-3 md:flex-1 md:flex-col md:gap-2 md:pr-4" aria-current={step.state === 'current' ? 'step' : undefined}>
          {!isLast && (
            <span
              aria-hidden="true"
              className={`absolute left-4 top-9 h-[calc(100%-1.5rem)] w-0.5 md:left-9 md:right-0 md:top-4 md:h-0.5 md:w-auto ${step.state === 'done' ? 'bg-primary' : 'bg-border'}`}
            />
          )}
          <span className={`relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 ${style.circle}`}>
            <Icon className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className={`block text-sm font-semibold ${style.label}`}>{step.label}</span>
            <span className={`block text-xs font-medium ${step.state === 'rejected' ? 'text-danger' : 'text-text-secondary'}`}>{step.stateLabel}</span>
            {step.detail && <span className="mt-0.5 block text-xs text-text-muted">{step.detail}</span>}
            {step.note && <span className="mt-1 block rounded-md bg-danger-soft px-2 py-1 text-xs text-danger">{t('Motivo: {reason}', { reason: step.note })}</span>}
          </span>
        </li>
      );
    })}
  </ol>
);

const HISTORY_LABELS = (event: TimesheetHistoryEvent, submissionIndex: number): string => {
  switch (event.action) {
    case 'timesheet.created':
      return t('Timesheet criado');
    case 'timesheet.submitted':
      return submissionIndex > 1 ? t('Submetido novamente') : t('Submetido pelo colaborador');
    case 'timesheet.approved':
      return t('Aprovado pelo gestor');
    case 'timesheet.rejected':
      return t('Rejeitado com motivo');
    case 'timesheet.reopened':
      return t('Reaberto');
    case 'timesheet.locked':
      return t('Bloqueado');
  }
};

const HistoryList: React.FC<{ events: TimesheetHistoryEvent[] }> = ({ events }) => {
  let submissions = 0;
  return (
    <ol className="space-y-3">
      {events.map((event) => {
        if (event.action === 'timesheet.submitted') submissions += 1;
        const isRejection = event.action === 'timesheet.rejected';
        return (
          <li key={event.id} className="flex gap-3 text-sm">
            <span aria-hidden="true" className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${isRejection ? 'bg-danger' : event.action === 'timesheet.approved' ? 'bg-primary' : 'bg-border-input'}`} />
            <span className="min-w-0">
              <span className={`block font-medium ${isRejection ? 'text-danger' : 'text-text'}`}>{HISTORY_LABELS(event, submissions)}</span>
              <span className="block text-xs text-text-muted">{[event.actorName, formatDateTime(event.createdAt)].filter(Boolean).join(' · ')}</span>
              {event.comment && <span className="mt-0.5 block text-xs text-text-secondary">“{event.comment}”</span>}
            </span>
          </li>
        );
      })}
    </ol>
  );
};

/** Ciclo de aprovação e histórico real de um timesheet (para o colaborador e para quem revê). */
export const TimesheetApprovalPanel: React.FC<{ summary: TimesheetSummary }> = ({ summary }) => {
  const history = useAsyncData(() => getTimesheetHistory(summary.id), [summary.id, summary.status, summary.submittedAt]);
  return (
    <Panel title={t('Aprovação')}>
      {history.error && <p className="text-sm text-danger">{history.error}</p>}
      {!history.data && !history.error && <LoadingState label={t('A carregar histórico...')} />}
      {history.data && (
        <div className="space-y-6">
          <ApprovalFlow steps={buildApprovalSteps(summary.status, history.data)} />
          <div className="border-t border-border pt-4">
            <h3 className="mb-3 text-xs font-semibold uppercase tracking-wide text-text-secondary">{t('Histórico')}</h3>
            {history.data.length === 0 ? <p className="text-sm text-text-secondary">{t('Sem eventos registados.')}</p> : <HistoryList events={history.data} />}
          </div>
        </div>
      )}
    </Panel>
  );
};
