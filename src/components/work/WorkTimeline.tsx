import React from 'react';
import { History, MessageSquare } from 'lucide-react';
import type { WorkEvent } from '../../types/work';
import { describeWorkEvent, isCommentEvent } from '../../utils/work';
import { formatDateTime } from '../../utils/format';

interface WorkTimelineProps {
  events: WorkEvent[];
  emptyMessage?: string;
}

/** Valor anterior → novo; só o novo (ex.: anexo adicionado) ou só o anterior (ex.: removido). */
const ValueChange: React.FC<{ oldValue: string | null; newValue: string | null }> = ({ oldValue, newValue }) => {
  if (oldValue === null && newValue === null) return null;
  if (oldValue === null) return <p className="mt-0.5 text-sm text-text-secondary">{newValue}</p>;
  if (newValue === null) return <p className="mt-0.5 text-sm text-text-secondary">{oldValue} (removido)</p>;
  return (
    <p className="mt-0.5 text-sm text-text-secondary">
      {oldValue} <span aria-hidden="true">→</span>
      <span className="sr-only">passou a</span> {newValue}
    </p>
  );
};

/** Histórico append-only (só de leitura): quem, quando, o quê, valor anterior e novo, motivo. */
export const WorkTimeline: React.FC<WorkTimelineProps> = ({ events, emptyMessage = 'Ainda não existe histórico.' }) => {
  if (events.length === 0) {
    return <p className="px-5 py-4 text-sm text-text-secondary">{emptyMessage}</p>;
  }
  return (
    <ol className="divide-y divide-border">
      {events.map((event) =>
        isCommentEvent(event.eventType) ? (
          <li key={event.id} className="px-5 py-4">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <MessageSquare className="h-4 w-4 text-sidebar" aria-hidden="true" />
              <span className="font-semibold text-text">{event.actorName ?? 'Sistema'}</span>
              <span className="text-xs text-text-muted">{formatDateTime(event.createdAt)}</span>
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">{event.note}</p>
          </li>
        ) : (
          <li key={event.id} className="px-5 py-3">
            <p className="flex flex-wrap items-center gap-2 text-sm text-text">
              <History className="h-4 w-4 shrink-0 text-text-muted" aria-hidden="true" />
              <span className="font-medium">{describeWorkEvent(event)}</span>
              {event.afterClosure && (
                <span className="rounded border border-warning/40 bg-warning-soft px-1.5 py-0.5 text-xs font-medium text-warning">
                  após encerramento
                </span>
              )}
            </p>
            {event.field !== 'description' && !event.eventType.endsWith('_CREATED') && <ValueChange oldValue={event.oldValue} newValue={event.newValue} />}
            {event.field === 'description' && <p className="mt-0.5 text-sm text-text-secondary">Descrição atualizada.</p>}
            {event.note && <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">Motivo / nota: {event.note}</p>}
            <p className="mt-0.5 text-xs text-text-muted">
              {event.actorName ?? 'Sistema'} · {formatDateTime(event.createdAt)}
            </p>
          </li>
        )
      )}
    </ol>
  );
};
