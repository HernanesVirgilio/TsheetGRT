import React, { useEffect, useId, useRef, useState } from 'react';
import { dateTimeFormatter } from '../../utils/format';
import type { CalendarItem } from '../../types/work';
import {
  CALENDAR_DAY_START_HOUR,
  CALENDAR_SLOT_COUNT,
  CALENDAR_SLOT_MINUTES,
  isSameDay,
  layoutTimedItems,
  selectionToRange,
  slotStartTime,
} from '../../utils/work';
import type { SlotSelection } from '../../utils/work';
import { t } from '../../lib/i18n';

const SLOT_HEIGHT = 22;
const GRID_HEIGHT = SLOT_HEIGHT * CALENDAR_SLOT_COUNT;
const SLOTS_PER_HOUR = 60 / CALENDAR_SLOT_MINUTES;
const SCROLL_TO_HOUR = 8;

const weekdayFormatter = () => dateTimeFormatter({ weekday: 'short', day: 'numeric' });
const longDayFormatter = () => dateTimeFormatter({ weekday: 'long', day: 'numeric', month: 'long' });

interface Selection {
  day: number;
  anchor: number;
  focus: number;
}

interface CalendarTimeGridProps {
  days: Date[];
  /** Itens com hora (reuniões, atividades, eventos, prazos). */
  timedItems: CalendarItem[];
  /** Itens de dia inteiro, mostrados na faixa superior. */
  allDayItemsFor: (day: Date) => CalendarItem[];
  renderItem: (item: CalendarItem, compact: boolean) => React.ReactNode;
  /** Só quem pode agendar reuniões seleciona horários; para os restantes a grelha é apenas de leitura. */
  canSelect: boolean;
  onSelect: (selection: SlotSelection) => void;
}

/**
 * Grelha horária com seleção de intervalo:
 *   * rato/caneta: clicar na hora inicial e arrastar até à final (ao largar, abre o formulário);
 *   * ecrã tátil: tocar na hora inicial e depois na final (o arrastamento continua a deslocar a página);
 *   * teclado: setas para mover, Shift+setas para alargar, Enter para confirmar, Escape para anular.
 * A seleção nunca atravessa dias; os itens existentes continuam clicáveis e não iniciam seleções.
 */
export const CalendarTimeGrid: React.FC<CalendarTimeGridProps> = ({ days, timedItems, allDayItemsFor, renderItem, canSelect, onSelect }) => {
  const [selection, setSelection] = useState<Selection | null>(null);
  const [cursor, setCursor] = useState<{ day: number; slot: number }>({ day: 0, slot: (SCROLL_TO_HOUR + 1 - CALENDAR_DAY_START_HOUR) * SLOTS_PER_HOUR });
  const [isDragging, setIsDragging] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const [touchAnchor, setTouchAnchor] = useState<{ day: number; slot: number } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const hintId = useId();
  const today = new Date();

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = (SCROLL_TO_HOUR - CALENDAR_DAY_START_HOUR) * SLOTS_PER_HOUR * SLOT_HEIGHT;
  }, []);

  useEffect(() => {
    setSelection(null);
    setTouchAnchor(null);
    setCursor((current) => ({ day: Math.min(current.day, days.length - 1), slot: current.slot }));
  }, [days.length, days[0]?.getTime()]);

  const slotFromEvent = (event: React.PointerEvent<HTMLElement>, column: HTMLElement) => {
    const rect = column.getBoundingClientRect();
    return Math.min(CALENDAR_SLOT_COUNT - 1, Math.max(0, Math.floor((event.clientY - rect.top) / SLOT_HEIGHT)));
  };

  const confirm = (next: Selection) => {
    const day = days[next.day];
    if (!day) return;
    setSelection(null);
    setTouchAnchor(null);
    setIsDragging(false);
    onSelect(selectionToRange(day, next.anchor, next.focus));
  };

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>, dayIndex: number) => {
    if (!canSelect || event.button !== 0 || event.pointerType === 'touch') return;
    const slot = slotFromEvent(event, event.currentTarget);
    event.currentTarget.setPointerCapture(event.pointerId);
    setIsDragging(true);
    setSelection({ day: dayIndex, anchor: slot, focus: slot });
    setCursor({ day: dayIndex, slot });
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>, dayIndex: number) => {
    if (!isDragging || !selection || selection.day !== dayIndex) return;
    const slot = slotFromEvent(event, event.currentTarget);
    if (slot !== selection.focus) setSelection({ ...selection, focus: slot });
  };

  const onPointerUp = (event: React.PointerEvent<HTMLDivElement>, dayIndex: number) => {
    if (event.pointerType === 'touch') {
      if (!canSelect) return;
      // Dois toques: o primeiro marca o início, o segundo (no mesmo dia) o fim.
      const slot = slotFromEvent(event, event.currentTarget);
      if (!touchAnchor || touchAnchor.day !== dayIndex) {
        setTouchAnchor({ day: dayIndex, slot });
        setSelection({ day: dayIndex, anchor: slot, focus: slot });
        return;
      }
      confirm({ day: dayIndex, anchor: touchAnchor.slot, focus: slot });
      return;
    }
    if (isDragging && selection && selection.day === dayIndex) confirm(selection);
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!canSelect) return;
    const move = (dayDelta: number, slotDelta: number) => {
      event.preventDefault();
      const day = Math.min(days.length - 1, Math.max(0, cursor.day + dayDelta));
      const slot = Math.min(CALENDAR_SLOT_COUNT - 1, Math.max(0, cursor.slot + slotDelta));
      setCursor({ day, slot });
      if (event.shiftKey && dayDelta === 0) {
        setSelection((current) => (current && current.day === day ? { ...current, focus: slot } : { day, anchor: cursor.slot, focus: slot }));
      } else {
        setSelection(null);
      }
      const container = scrollRef.current;
      if (container) {
        const top = slot * SLOT_HEIGHT;
        if (top < container.scrollTop) container.scrollTop = top;
        else if (top + SLOT_HEIGHT > container.scrollTop + container.clientHeight) container.scrollTop = top + SLOT_HEIGHT - container.clientHeight;
      }
    };
    switch (event.key) {
      case 'ArrowUp':
        move(0, -1);
        break;
      case 'ArrowDown':
        move(0, 1);
        break;
      case 'ArrowLeft':
        move(-1, 0);
        break;
      case 'ArrowRight':
        move(1, 0);
        break;
      case 'Enter':
      case ' ':
        event.preventDefault();
        confirm(selection && selection.day === cursor.day ? selection : { day: cursor.day, anchor: cursor.slot, focus: cursor.slot });
        break;
      case 'Escape':
        setSelection(null);
        setTouchAnchor(null);
        break;
      default:
        break;
    }
  };

  const cursorDay = days[cursor.day];
  const activeRange = selection ? selectionToRange(days[selection.day] ?? days[0] ?? today, selection.anchor, selection.focus) : null;
  const columns = `3.25rem repeat(${days.length}, minmax(0, 1fr))`;

  return (
    <div className="select-none">
      {/* Cabeçalho dos dias e faixa de dia inteiro */}
      <div className="grid border-b border-border bg-background" style={{ gridTemplateColumns: columns }}>
        <div />
        {days.map((day) => (
          <div key={day.toISOString()} className="border-l border-border px-2 py-2">
            <p className={`text-xs font-semibold uppercase tracking-wide ${isSameDay(day, today) ? 'text-primary-hover' : 'text-sidebar'}`}>
              {days.length === 1 ? longDayFormatter().format(day) : weekdayFormatter().format(day)}
            </p>
            <div className="mt-1 space-y-1">{allDayItemsFor(day).map((item) => <div key={`${item.itemType}-${item.itemId}`}>{renderItem(item, true)}</div>)}</div>
          </div>
        ))}
      </div>

      {canSelect && (
        <p id={hintId} className="border-b border-border px-4 py-2 text-xs text-text-muted">
          {touchAnchor
            ? t('Início às {slot}. Toque na hora final para abrir o formulário.', { slot: slotStartTime(touchAnchor.slot) })
            : t('Arraste sobre as horas para marcar uma reunião (no ecrã tátil, toque na hora inicial e depois na final). Teclado: setas, Shift+setas e Enter.')}
        </p>
      )}

      <div ref={scrollRef} className="max-h-[34rem] overflow-y-auto custom-scrollbar">
        <div
          ref={gridRef}
          className="relative grid focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-focus"
          style={{ gridTemplateColumns: columns, height: GRID_HEIGHT }}
          role={canSelect ? 'application' : undefined}
          tabIndex={canSelect ? 0 : undefined}
          aria-label={canSelect ? t('Grelha horária: selecione um intervalo para agendar uma reunião') : t('Grelha horária')}
          aria-describedby={canSelect ? hintId : undefined}
          onKeyDown={onKeyDown}
          onFocus={() => setIsFocused(true)}
          onBlur={() => setIsFocused(false)}
        >
          {/* Horas */}
          <div className="relative">
            {Array.from({ length: CALENDAR_SLOT_COUNT / SLOTS_PER_HOUR }, (_, hour) => (
              <span
                key={hour}
                className="absolute right-2 -translate-y-1/2 text-[11px] tabular-nums text-text-muted"
                style={{ top: hour * SLOTS_PER_HOUR * SLOT_HEIGHT }}
                aria-hidden="true"
              >
                {hour === 0 ? '' : `${String(CALENDAR_DAY_START_HOUR + hour).padStart(2, '0')}:00`}
              </span>
            ))}
          </div>

          {days.map((day, dayIndex) => {
            const layout = layoutTimedItems(
              timedItems.filter((item) => isSameDay(new Date(item.startsAt), day)),
              day
            );
            const showSelection = selection && selection.day === dayIndex;
            const first = showSelection ? Math.min(selection.anchor, selection.focus) : 0;
            const last = showSelection ? Math.max(selection.anchor, selection.focus) : 0;
            const showCursor = canSelect && isFocused && cursor.day === dayIndex;
            return (
              <div
                key={day.toISOString()}
                className={`relative border-l border-border ${canSelect ? 'cursor-crosshair' : ''} ${isSameDay(day, today) ? 'bg-primary-soft/40' : ''}`}
                onPointerDown={(event) => onPointerDown(event, dayIndex)}
                onPointerMove={(event) => onPointerMove(event, dayIndex)}
                onPointerUp={(event) => onPointerUp(event, dayIndex)}
                onPointerCancel={() => {
                  if (!isDragging) return;
                  setIsDragging(false);
                  setSelection(null);
                }}
              >
                {Array.from({ length: CALENDAR_SLOT_COUNT }, (_, slot) => (
                  <div
                    key={slot}
                    className={`absolute inset-x-0 border-t ${slot % SLOTS_PER_HOUR === 0 ? 'border-border' : 'border-border/40'}`}
                    style={{ top: slot * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                    aria-hidden="true"
                  />
                ))}
                {showCursor && (
                  <div
                    className="pointer-events-none absolute inset-x-0.5 rounded border-2 border-focus"
                    style={{ top: cursor.slot * SLOT_HEIGHT, height: SLOT_HEIGHT }}
                    aria-hidden="true"
                  />
                )}
                {layout.map(({ item, top, height, lane, lanes }) => (
                  <div
                    key={`${item.itemType}-${item.itemId}`}
                    className="absolute z-10 overflow-hidden px-0.5"
                    style={{
                      top: (top / CALENDAR_SLOT_MINUTES) * SLOT_HEIGHT,
                      height: Math.max(SLOT_HEIGHT - 2, (height / CALENDAR_SLOT_MINUTES) * SLOT_HEIGHT - 2),
                      left: `${(lane / lanes) * 100}%`,
                      width: `${100 / lanes}%`,
                    }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onPointerUp={(event) => event.stopPropagation()}
                  >
                    {renderItem(item, false)}
                  </div>
                ))}
                {showSelection && (
                  <div
                    className="pointer-events-none absolute inset-x-1 z-20 rounded border-2 border-primary-hover bg-primary/25"
                    style={{ top: first * SLOT_HEIGHT, height: (last - first + 1) * SLOT_HEIGHT }}
                  >
                    <span className="m-1 inline-block rounded bg-surface px-1 text-[11px] font-semibold tabular-nums text-text">
                      {slotStartTime(first)}–{slotStartTime(last + 1)}
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      <p className="sr-only" aria-live="polite">
        {activeRange && cursorDay ? t('Selecionado de {startTime} a {endTime}.', { startTime: activeRange.startTime, endTime: activeRange.endTime }) : ''}
      </p>
    </div>
  );
};
