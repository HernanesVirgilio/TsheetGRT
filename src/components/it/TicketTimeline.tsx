import React from 'react';
import { Lock } from 'lucide-react';
import type { TicketComment, TicketEvent } from '../../types/it';
import { describeTicketEvent } from '../../utils/it';
import { formatDateTime } from '../../utils/format';

type TimelineItem = { kind: 'comment'; at: string; comment: TicketComment } | { kind: 'event'; at: string; event: TicketEvent };

interface TicketTimelineProps {
  comments: TicketComment[];
  events: TicketEvent[];
}

/** Histórico do pedido (somente leitura): mensagens e eventos por ordem cronológica. */
export const TicketTimeline: React.FC<TicketTimelineProps> = ({ comments, events }) => {
  const items: TimelineItem[] = [
    ...comments.map((comment): TimelineItem => ({ kind: 'comment', at: comment.createdAt, comment })),
    // Os comentários já aparecem com o texto completo; o evento correspondente seria repetido.
    ...events
      .filter((event) => event.eventType !== 'COMMENTED')
      .map((event): TimelineItem => ({ kind: 'event', at: event.createdAt, event })),
  ].sort((first, second) => first.at.localeCompare(second.at));

  if (items.length === 0) {
    return <p className="px-5 py-4 text-sm text-text-secondary">Ainda não existe histórico.</p>;
  }

  return (
    <ol className="divide-y divide-border">
      {items.map((item) =>
        item.kind === 'comment' ? (
          <li key={item.comment.id} className={`px-5 py-4 ${item.comment.isInternal ? 'bg-warning-soft' : ''}`}>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm">
              <span className="font-semibold text-text">{item.comment.authorName}</span>
              <span className="text-xs text-text-muted">{formatDateTime(item.comment.createdAt)}</span>
              {item.comment.isInternal && (
                <span className="inline-flex items-center gap-1 text-xs font-medium text-warning">
                  <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                  Nota interna (não visível ao colaborador)
                </span>
              )}
            </div>
            <p className="mt-1 whitespace-pre-line text-sm text-text-secondary">{item.comment.body}</p>
          </li>
        ) : (
          <li key={item.event.id} className="px-5 py-3">
            <p className="text-sm text-text">
              {describeTicketEvent(item.event)}
              {item.event.isInternal && <span className="ml-2 text-xs text-text-muted">(interno)</span>}
            </p>
            {item.event.note && <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{item.event.note}</p>}
            <p className="mt-0.5 text-xs text-text-muted">
              {item.event.actorName ?? 'Sistema'} · {formatDateTime(item.event.createdAt)}
            </p>
          </li>
        )
      )}
    </ol>
  );
};
