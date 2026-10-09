import React, { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, ChevronLeft, ChevronRight, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { cancelCalendarEvent, createCalendarEvent, getCalendarItems, listWorkPeople } from '../../services/work/calendarService';
import { listDepartments } from '../../services/departmentService';
import type { CalendarItem, CalendarItemType, CalendarScope } from '../../types/work';
import { isAbsenceStatus, isEntryKind, isMeetingStatus, isOpportunityStatus, isTaskStatus } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { SelectField, TextAreaField, TextField } from '../../components/ui/FormField';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { BADGE_TONE_CLASSES } from '../../components/ui/badgeTones';
import type { BadgeTone } from '../../components/ui/badgeTones';
import { MeetingFormModal } from '../../components/work/MeetingFormModal';
import {
  addDays,
  ABSENCE_STATUS_LABELS,
  CALENDAR_ITEM_LABELS,
  combineDateTime,
  ENTRY_KIND_LABELS,
  MEETING_STATUS_LABELS,
  OPPORTUNITY_STATUS_LABELS,
  TASK_STATUS_LABELS,
  isSameDay,
  itemOccursOn,
  monthGrid,
  startOfWeek,
  toDateInput,
  validateReason,
} from '../../utils/work';
import { formatDateTime } from '../../utils/format';

type View = 'MONTH' | 'WEEK' | 'DAY';
type FilterKey = 'TASKS' | 'MEETINGS' | 'ABSENCES' | 'ACTIVITIES' | 'EVENTS' | 'OPPORTUNITIES';

const FILTERS: { key: FilterKey; label: string; types: CalendarItemType[] }[] = [
  { key: 'TASKS', label: 'Tarefas e prazos', types: ['DEADLINE', 'TASK'] },
  { key: 'MEETINGS', label: 'Reuniões', types: ['MEETING'] },
  { key: 'ABSENCES', label: 'Ausências', types: ['ABSENCE'] },
  { key: 'ACTIVITIES', label: 'Atividades', types: ['ACTIVITY'] },
  { key: 'EVENTS', label: 'Eventos internos', types: ['INTERNAL_EVENT'] },
  { key: 'OPPORTUNITIES', label: 'Oportunidades', types: ['OPPORTUNITY_ACTIVITY'] },
];

const WEEKDAYS = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'];
const monthFormatter = new Intl.DateTimeFormat('pt-PT', { month: 'long', year: 'numeric' });
const dayFormatter = new Intl.DateTimeFormat('pt-PT', { weekday: 'long', day: 'numeric', month: 'long' });
const timeFormatter = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });

function itemTone(item: CalendarItem): BadgeTone {
  if (item.isOverdue) return 'danger';
  switch (item.itemType) {
    case 'DEADLINE':
      return item.status === 'COMPLETED' ? 'success' : 'warning';
    case 'MEETING':
    case 'OPPORTUNITY_ACTIVITY':
      return 'info';
    case 'ABSENCE':
      return 'warning';
    case 'ACTIVITY':
      return 'success';
    default:
      return 'neutral';
  }
}

function itemRoute(item: CalendarItem): string | null {
  switch (item.itemType) {
    case 'DEADLINE':
    case 'TASK':
      return `/timesheet/tasks/${item.itemId}`;
    case 'MEETING':
      return `/timesheet/meetings/${item.itemId}`;
    case 'ABSENCE':
      return '/timesheet/absences';
    case 'ACTIVITY':
      return '/timesheet/activities';
    case 'OPPORTUNITY_ACTIVITY':
      return `/timesheet/opportunities/${item.itemId}`;
    default:
      return null;
  }
}

function itemStatusLabel(item: CalendarItem): string {
  const { itemType, status } = item;
  if ((itemType === 'DEADLINE' || itemType === 'TASK') && isTaskStatus(status)) return TASK_STATUS_LABELS[status];
  if (itemType === 'MEETING' && isMeetingStatus(status)) return MEETING_STATUS_LABELS[status];
  if (itemType === 'ABSENCE' && isAbsenceStatus(status)) return ABSENCE_STATUS_LABELS[status];
  if (itemType === 'OPPORTUNITY_ACTIVITY' && isOpportunityStatus(status)) return OPPORTUNITY_STATUS_LABELS[status];
  if (itemType === 'ACTIVITY' && isEntryKind(status)) return `Tempo registado · ${ENTRY_KIND_LABELS[status]}`;
  return status === 'ACTIVE' ? 'Ativo' : status;
}

function itemTime(item: CalendarItem): string {
  if (item.allDay) return 'Dia inteiro';
  const start = timeFormatter.format(new Date(item.startsAt));
  return item.startsAt === item.endsAt ? start : `${start}–${timeFormatter.format(new Date(item.endsAt))}`;
}

const ItemChip: React.FC<{ item: CalendarItem; compact?: boolean; onOpen: (item: CalendarItem) => void }> = ({ item, compact = false, onOpen }) => (
  <button
    type="button"
    onClick={() => onOpen(item)}
    className={`block w-full truncate rounded border px-1.5 py-0.5 text-left text-xs font-medium ${BADGE_TONE_CLASSES[itemTone(item)]} ${
      item.status === 'CANCELLED' ? 'line-through opacity-70' : ''
    }`}
    title={`${CALENDAR_ITEM_LABELS[item.itemType]}: ${item.title}`}
  >
    {!compact && !item.allDay && <span className="mr-1 tabular-nums">{timeFormatter.format(new Date(item.startsAt))}</span>}
    <span className="sr-only">{CALENDAR_ITEM_LABELS[item.itemType]}: </span>
    {item.reference ? `${item.reference} · ` : ''}
    {item.title}
  </button>
);

export const CalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const canSeeTeam = hasPermission('TEAM_READ') || hasPermission('ADMIN_ACCESS');
  const canManageEvents = hasPermission('TIMESHEET_CALENDAR_MANAGE');
  const canCreateMeeting = hasPermission('TIMESHEET_MEETING_CREATE');

  const [view, setView] = useState<View>('MONTH');
  const [anchor, setAnchor] = useState(() => new Date());
  const [scope, setScope] = useState<CalendarScope>('ME');
  const [enabled, setEnabled] = useState<Set<FilterKey>>(() => new Set(FILTERS.map((filter) => filter.key)));
  const [selected, setSelected] = useState<CalendarItem | null>(null);
  const [isEventFormOpen, setIsEventFormOpen] = useState(false);
  const [isMeetingFormOpen, setIsMeetingFormOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const days = useMemo(() => {
    if (view === 'MONTH') return monthGrid(anchor);
    if (view === 'WEEK') return Array.from({ length: 7 }, (_, index) => addDays(startOfWeek(anchor), index));
    return [new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())];
  }, [view, anchor]);
  const from = toDateInput(days[0] ?? anchor);
  const to = toDateInput(days[days.length - 1] ?? anchor);

  const items = useAsyncData(() => getCalendarItems(from, to, scope), [from, to, scope]);
  const people = useAsyncData(() => (canCreateMeeting ? listWorkPeople('PARTICIPANT') : Promise.resolve([])), [canCreateMeeting]);
  const allowedTypes = new Set(FILTERS.filter((filter) => enabled.has(filter.key)).flatMap((filter) => filter.types));
  const visibleItems = (items.data ?? []).filter((item) => allowedTypes.has(item.itemType));
  const itemsOn = (day: Date) =>
    visibleItems.filter((item) => itemOccursOn(item, day)).sort((first, second) => Number(second.allDay) - Number(first.allDay) || first.startsAt.localeCompare(second.startsAt));

  const move = (direction: -1 | 1) => {
    const next = new Date(anchor);
    if (view === 'MONTH') next.setMonth(next.getMonth() + direction, 1);
    else next.setDate(next.getDate() + direction * (view === 'WEEK' ? 7 : 1));
    setAnchor(next);
  };
  const capitalize = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);
  const title = view === 'MONTH' ? capitalize(monthFormatter.format(anchor)) : view === 'WEEK' ? `Semana de ${dayFormatter.format(days[0] ?? anchor)}` : dayFormatter.format(anchor);
  const today = new Date();

  const toggleFilter = (key: FilterKey) =>
    setEnabled((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });

  const dayList = (day: Date) => {
    const dayItems = itemsOn(day);
    return (
      <li key={day.toISOString()} className="px-4 py-3">
        <p className={`text-sm font-semibold ${isSameDay(day, today) ? 'text-primary-hover' : 'text-text'}`}>
          {dayFormatter.format(day)}
          {isSameDay(day, today) && <span className="ml-2 text-xs font-medium">(hoje)</span>}
        </p>
        {dayItems.length === 0 ? (
          <p className="mt-1 text-sm text-text-muted">Sem registos.</p>
        ) : (
          <ul className="mt-2 space-y-1.5">
            {dayItems.map((item) => (
              <li key={`${item.itemType}-${item.itemId}`} className="flex items-start gap-3">
                <span className="w-24 shrink-0 pt-0.5 text-xs tabular-nums text-text-muted">{itemTime(item)}</span>
                <div className="min-w-0 flex-1">
                  <ItemChip item={item} compact onOpen={setSelected} />
                  {item.personName && scope === 'TEAM' && <p className="mt-0.5 text-xs text-text-muted">{item.personName}</p>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Calendário"
        subtitle="Tarefas, prazos, reuniões, ausências, atividades e eventos num só lugar."
        actions={
          <>
            {canCreateMeeting && (
              <Button variant="secondary" icon={CalendarPlus} onClick={() => setIsMeetingFormOpen(true)} disabled={!people.data}>
                Nova reunião
              </Button>
            )}
            {canManageEvents && (
              <Button icon={Plus} onClick={() => setIsEventFormOpen(true)}>
                Evento interno
              </Button>
            )}
          </>
        }
      />
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center gap-2">
            <IconButton icon={ChevronLeft} label="Período anterior" onClick={() => move(-1)} />
            <Button size="sm" variant="secondary" onClick={() => setAnchor(new Date())}>
              Hoje
            </Button>
            <IconButton icon={ChevronRight} label="Período seguinte" onClick={() => move(1)} />
            <h2 className="ml-2 text-base font-semibold text-text" aria-live="polite">
              {title}
            </h2>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div role="group" aria-label="Vista" className="flex gap-1">
              {(['MONTH', 'WEEK', 'DAY'] as const).map((option) => (
                <Button key={option} size="sm" variant={view === option ? 'primary' : 'secondary'} aria-pressed={view === option} onClick={() => setView(option)}>
                  {option === 'MONTH' ? 'Mês' : option === 'WEEK' ? 'Semana' : 'Dia'}
                </Button>
              ))}
            </div>
            {canSeeTeam && (
              <div role="group" aria-label="Âmbito" className="flex gap-1">
                <Button size="sm" variant={scope === 'ME' ? 'primary' : 'secondary'} aria-pressed={scope === 'ME'} onClick={() => setScope('ME')}>
                  O meu
                </Button>
                <Button size="sm" variant={scope === 'TEAM' ? 'primary' : 'secondary'} aria-pressed={scope === 'TEAM'} onClick={() => setScope('TEAM')}>
                  Equipa
                </Button>
              </div>
            )}
          </div>
        </div>
        <fieldset className="flex flex-wrap gap-x-4 gap-y-2 border-b border-border px-4 py-3">
          <legend className="sr-only">Tipos de registo</legend>
          {FILTERS.map((filter) => (
            <label key={filter.key} className="flex items-center gap-2 text-sm text-text">
              <input type="checkbox" className="h-4 w-4 accent-primary-hover" checked={enabled.has(filter.key)} onChange={() => toggleFilter(filter.key)} />
              {filter.label}
            </label>
          ))}
        </fieldset>

        {items.error && (
          <div className="p-4">
            <ErrorState message={items.error} onRetry={items.reload} />
          </div>
        )}
        {items.isLoading && !items.data && <LoadingState label="A carregar calendário..." />}

        {items.data && view === 'MONTH' && (
          <>
            <div className="hidden md:block">
              <div className="grid grid-cols-7 border-b border-border bg-background text-xs font-semibold uppercase tracking-wide text-sidebar">
                {WEEKDAYS.map((weekday) => (
                  <div key={weekday} className="px-2 py-2">
                    {weekday}
                  </div>
                ))}
              </div>
              <div className="grid grid-cols-7">
                {days.map((day) => {
                  const dayItems = itemsOn(day);
                  const outside = day.getMonth() !== anchor.getMonth();
                  return (
                    <div key={day.toISOString()} className={`min-h-28 border-b border-r border-border p-1.5 ${outside ? 'bg-background' : ''}`}>
                      <button
                        type="button"
                        onClick={() => {
                          setAnchor(day);
                          setView('DAY');
                        }}
                        className={`mb-1 inline-flex h-6 min-w-6 items-center justify-center rounded px-1 text-xs font-semibold ${
                          isSameDay(day, today) ? 'bg-primary text-on-primary' : outside ? 'text-text-muted' : 'text-text'
                        }`}
                        aria-label={`Ver ${dayFormatter.format(day)}`}
                      >
                        {day.getDate()}
                      </button>
                      <div className="space-y-1">
                        {dayItems.slice(0, 3).map((item) => (
                          <ItemChip key={`${item.itemType}-${item.itemId}`} item={item} onOpen={setSelected} />
                        ))}
                        {dayItems.length > 3 && (
                          <button
                            type="button"
                            className="text-xs font-medium text-primary-hover hover:underline"
                            onClick={() => {
                              setAnchor(day);
                              setView('DAY');
                            }}
                          >
                            +{dayItems.length - 3} mais
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            <ul className="divide-y divide-border md:hidden" aria-label="Agenda do mês">
              {days.filter((day) => day.getMonth() === anchor.getMonth() && itemsOn(day).length > 0).map(dayList)}
              {days.every((day) => day.getMonth() !== anchor.getMonth() || itemsOn(day).length === 0) && (
                <li className="px-4 py-6 text-sm text-text-secondary">Sem registos neste mês.</li>
              )}
            </ul>
          </>
        )}
        {items.data && view !== 'MONTH' && <ul className="divide-y divide-border">{days.map(dayList)}</ul>}
      </Panel>

      <CalendarItemDialog
        item={selected}
        canCancelEvent={canManageEvents}
        onClose={() => setSelected(null)}
        onOpenRecord={(route) => {
          setSelected(null);
          navigate(route);
        }}
        onEventCancelled={() => {
          setSelected(null);
          setMessage('Evento cancelado.');
          items.reload();
        }}
        viewerId={currentUser?.id ?? ''}
      />
      <InternalEventFormModal
        isOpen={isEventFormOpen}
        profileId={currentUser?.id ?? ''}
        defaultDate={toDateInput(anchor)}
        onClose={() => setIsEventFormOpen(false)}
        onSaved={() => {
          setIsEventFormOpen(false);
          setMessage('Evento interno criado.');
          items.reload();
        }}
      />
      <MeetingFormModal
        isOpen={isMeetingFormOpen}
        meeting={null}
        participantIds={[]}
        people={people.data ?? []}
        defaultDate={toDateInput(anchor)}
        onClose={() => setIsMeetingFormOpen(false)}
        onSaved={(meetingId) => {
          setIsMeetingFormOpen(false);
          navigate(`/timesheet/meetings/${meetingId}`);
        }}
      />
    </div>
  );
};

interface CalendarItemDialogProps {
  item: CalendarItem | null;
  viewerId: string;
  canCancelEvent: boolean;
  onClose: () => void;
  onOpenRecord: (route: string) => void;
  onEventCancelled: () => void;
}

const CalendarItemDialog: React.FC<CalendarItemDialogProps> = ({ item, viewerId, canCancelEvent, onClose, onOpenRecord, onEventCancelled }) => {
  const [error, setError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);
  if (!item) return null;
  const route = itemRoute(item);
  const canCancel = item.itemType === 'INTERNAL_EVENT' && canCancelEvent && item.personId === viewerId;
  return (
    <Modal
      isOpen
      title={item.title}
      description={CALENDAR_ITEM_LABELS[item.itemType]}
      size="sm"
      isBusy={isCancelling}
      onClose={() => {
        setError(null);
        onClose();
      }}
      footer={
        <>
          {canCancel && (
            <Button
              variant="danger"
              isLoading={isCancelling}
              onClick={() => {
                setIsCancelling(true);
                setError(null);
                cancelCalendarEvent(item.itemId)
                  .then(onEventCancelled)
                  .catch((reason: unknown) => setError(getErrorMessage(reason, 'Não foi possível cancelar o evento.')))
                  .finally(() => setIsCancelling(false));
              }}
            >
              Cancelar evento
            </Button>
          )}
          {route && <Button onClick={() => onOpenRecord(route)}>Abrir registo</Button>}
        </>
      }
    >
      {error && <Alert variant="error">{error}</Alert>}
      <dl className="grid grid-cols-1 gap-3 text-sm">
        <div>
          <dt className="text-text-muted">Quando</dt>
          <dd className="font-medium text-text">
            {item.allDay ? `${formatDateTime(item.startsAt).split(',')[0]} (dia inteiro)` : `${formatDateTime(item.startsAt)} · ${itemTime(item)}`}
          </dd>
        </div>
        {item.reference && (
          <div>
            <dt className="text-text-muted">Referência</dt>
            <dd className="font-medium text-text">{item.reference}</dd>
          </div>
        )}
        {item.personName && (
          <div>
            <dt className="text-text-muted">{item.itemType === 'MEETING' ? 'Organizador' : 'Responsável'}</dt>
            <dd className="font-medium text-text">{item.personName}</dd>
          </div>
        )}
        <div>
          <dt className="text-text-muted">Estado</dt>
          <dd className="font-medium text-text">
            {itemStatusLabel(item)}
            {item.isOverdue && <span className="ml-2 text-danger">(em atraso)</span>}
          </dd>
        </div>
      </dl>
      {route === '/timesheet/absences' && (
        <p className="mt-3 text-xs text-text-muted">
          Os pedidos de ausência estão em <Link to="/timesheet/absences" className="text-primary-hover hover:underline">Ausências</Link>.
        </p>
      )}
    </Modal>
  );
};

interface InternalEventFormModalProps {
  isOpen: boolean;
  profileId: string;
  defaultDate: string;
  onClose: () => void;
  onSaved: () => void;
}

const InternalEventFormModal: React.FC<InternalEventFormModalProps> = ({ isOpen, profileId, defaultDate, onClose, onSaved }) => {
  const departments = useAsyncData(() => (isOpen ? listDepartments() : Promise.resolve([])), [isOpen]);
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState('09:00');
  const [endTime, setEndTime] = useState('10:00');
  const [allDay, setAllDay] = useState(false);
  const [location, setLocation] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  const [description, setDescription] = useState('');
  const [errors, setErrors] = useState<{ title?: string | null; time?: string | null }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  React.useEffect(() => {
    if (!isOpen) return;
    setTitle('');
    setDate(defaultDate);
    setStartTime('09:00');
    setEndTime('10:00');
    setAllDay(false);
    setLocation('');
    setDepartmentId('');
    setDescription('');
    setErrors({});
    setErrorMessage(null);
  }, [isOpen, defaultDate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const start = allDay ? combineDateTime(date, '00:00') : combineDateTime(date, startTime);
    const end = allDay ? combineDateTime(date, '23:59') : combineDateTime(date, endTime);
    const nextErrors = {
      title: validateReason(title, 'Indique o título', 3, 200),
      time: !start || !end || end < start ? 'O evento tem de terminar depois de começar.' : null,
    };
    setErrors(nextErrors);
    if (nextErrors.title || nextErrors.time || !start || !end) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await createCalendarEvent(profileId, {
        title: title.trim(),
        description: description.trim(),
        startsAt: start.toISOString(),
        endsAt: end.toISOString(),
        allDay,
        location: location.trim() || null,
        departmentId: departmentId || null,
      });
      onSaved();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível criar o evento.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'internal-event-form';
  return (
    <Modal
      isOpen={isOpen}
      title="Novo evento interno"
      description="Visível a toda a empresa ou apenas ao departamento escolhido."
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            Criar evento
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField label="Título" required maxLength={200} value={title} error={errors.title} onChange={(event) => setTitle(event.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label="Data" type="date" required value={date} onChange={(event) => setDate(event.target.value)} />
          <TextField label="Início" type="time" disabled={allDay} value={startTime} error={errors.time} onChange={(event) => setStartTime(event.target.value)} />
          <TextField label="Fim" type="time" disabled={allDay} value={endTime} onChange={(event) => setEndTime(event.target.value)} />
        </div>
        <label className="flex items-center gap-2 text-sm text-text">
          <input type="checkbox" className="h-4 w-4 accent-primary-hover" checked={allDay} onChange={(event) => setAllDay(event.target.checked)} />
          Dia inteiro
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Local" maxLength={200} value={location} onChange={(event) => setLocation(event.target.value)} />
          <SelectField label="Visível a" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value="">Toda a empresa</option>
            {(departments.data ?? [])
              .filter((department) => department.active)
              .map((department) => (
                <option key={department.id} value={department.id}>
                  {department.name}
                </option>
              ))}
          </SelectField>
        </div>
        <TextAreaField label="Descrição" rows={3} maxLength={5000} value={description} onChange={(event) => setDescription(event.target.value)} />
      </form>
    </Modal>
  );
};
