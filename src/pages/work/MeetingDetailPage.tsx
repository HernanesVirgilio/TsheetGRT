import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Ban, CheckCircle2, Clock3, ClipboardCheck, ExternalLink, ListPlus, Pencil } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { cancelMeeting, confirmMeeting, getMeeting, getMeetingPeople, listMeetingEvents } from '../../services/work/meetingService';
import { listRelatedTasks } from '../../services/work/taskService';
import { getWorkTimeTotals } from '../../services/work/workLogService';
import { listWorkPeople } from '../../services/work/calendarService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { TicketNoteModal } from '../../components/it/TicketActionModals';
import { WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { WorkTimeline } from '../../components/work/WorkTimeline';
import { AttachmentsPanel } from '../../components/work/AttachmentsPanel';
import { MeetingFormModal } from '../../components/work/MeetingFormModal';
import { MeetingOutcomeModal } from '../../components/work/MeetingOutcomeModal';
import { TaskFormModal } from '../../components/work/TaskFormModal';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import type { MeetingDetail } from '../../types/work';
import { toDateInput, toTimeInput } from '../../utils/work';
import { formatDateTime, formatMinutesAsHours } from '../../utils/format';
import { isUuid } from '../../utils/validation';

type ModalKind = 'edit' | 'cancel' | 'task' | 'logTime' | null;

async function loadMeeting(meetingId: string) {
  if (!isUuid(meetingId)) return null;
  const meeting = await getMeeting(meetingId);
  if (!meeting) return null;
  const [people, events, tasks, totals] = await Promise.all([
    getMeetingPeople(meetingId),
    listMeetingEvents(meetingId),
    listRelatedTasks('meeting_id', meetingId),
    getWorkTimeTotals('MEETING', meetingId),
  ]);
  return { meeting, people, events, tasks, totals };
}

const timeFormatter = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });

export const MeetingDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const detail = useAsyncData(() => loadMeeting(id), [id]);
  const participants = useAsyncData(() => (hasPermission('TIMESHEET_MEETING_CREATE') ? listWorkPeople('PARTICIPANT') : Promise.resolve([])), []);
  const assignees = useAsyncData(() => (hasPermission('TIMESHEET_TASK_CREATE') ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), []);
  const [modal, setModal] = useState<ModalKind>(null);
  const [outcomeFor, setOutcomeFor] = useState<MeetingDetail | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const backLink = (
    <Link to="/timesheet/meetings" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar às reuniões
    </Link>
  );
  if (detail.isLoading && !detail.data) return <LoadingState label="A carregar reunião..." />;
  if (detail.error && !detail.data) {
    return (
      <div className="space-y-4">
        {backLink}
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="space-y-4">
        {backLink}
        <EmptyState title="Reunião não encontrada." message="A reunião não existe ou não participa nela." />
      </div>
    );
  }

  const { meeting, people, events, tasks, totals } = detail.data;
  const isOrganizer = meeting.organizerId === viewerId;
  const isParticipant = people.some((person) => person.profileId === viewerId);
  // Espelho de private.manages_meeting (organizador, administração ou gestor do organizador).
  const managesMeeting = isOrganizer || hasPermission('ADMIN_ACCESS') || (!isParticipant && hasPermission('TEAM_READ'));
  const isOpen = meeting.status === 'PLANNED' || meeting.status === 'CONFIRMED';
  const hasStarted = new Date(meeting.startsAt).getTime() <= Date.now();
  const canLogTime = hasPermission('SELF_TIMESHEET_UPDATE') && (isOrganizer || isParticipant) && meeting.status !== 'CANCELLED' && hasStarted;
  const durationMinutes = Math.round((new Date(meeting.endsAt).getTime() - new Date(meeting.startsAt).getTime()) / 60000);

  const afterAction = (text: string) => {
    setModal(null);
    setOutcomeFor(null);
    setActionError(null);
    setMessage(text);
    detail.reload();
  };

  const runConfirm = async () => {
    setIsPending(true);
    setActionError(null);
    try {
      await confirmMeeting(meeting.id);
      afterAction('Reunião confirmada.');
    } catch (error) {
      setActionError(getErrorMessage(error, 'Não foi possível confirmar a reunião.'));
    } finally {
      setIsPending(false);
    }
  };

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={meeting.title}
        subtitle={`${formatDateTime(meeting.startsAt)}–${timeFormatter.format(new Date(meeting.endsAt))} · ${formatMinutesAsHours(durationMinutes)}`}
        actions={
          <>
            {managesMeeting && meeting.status === 'PLANNED' && (
              <Button variant="secondary" icon={CheckCircle2} isLoading={isPending} onClick={runConfirm}>
                Confirmar
              </Button>
            )}
            {managesMeeting && isOpen && hasStarted && (
              <Button icon={ClipboardCheck} onClick={() => setOutcomeFor(meeting)}>
                Registar resultado
              </Button>
            )}
            {canLogTime && (
              <Button variant="secondary" icon={Clock3} onClick={() => setModal('logTime')}>
                Registar tempo
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
      {actionError && (
        <Alert variant="error" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {meeting.status === 'CANCELLED' && meeting.cancelReason && (
        <Alert variant="info" title="Reunião cancelada">
          {meeting.cancelReason}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <WorkStatusBadge kind="meeting" status={meeting.status} />
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <dt className="text-sm text-text-muted">Local</dt>
                <dd className="text-sm font-medium text-text">{meeting.location ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-sm text-text-muted">Ligação</dt>
                <dd className="text-sm font-medium text-text">
                  {meeting.meetingUrl ? (
                    <a href={meeting.meetingUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary-hover hover:underline">
                      Abrir ligação <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
                    </a>
                  ) : (
                    '—'
                  )}
                </dd>
              </div>
              {meeting.task && (
                <div>
                  <dt className="text-sm text-text-muted">Tarefa</dt>
                  <dd className="text-sm font-medium">
                    <Link to={`/timesheet/tasks/${meeting.task.id}`} className="text-primary-hover hover:underline">
                      {meeting.task.reference} · {meeting.task.title}
                    </Link>
                  </dd>
                </div>
              )}
              {meeting.opportunity && (
                <div>
                  <dt className="text-sm text-text-muted">Oportunidade</dt>
                  <dd className="text-sm font-medium">
                    <Link to={`/timesheet/opportunities/${meeting.opportunity.id}`} className="text-primary-hover hover:underline">
                      {meeting.opportunity.reference} · {meeting.opportunity.title}
                    </Link>
                  </dd>
                </div>
              )}
            </dl>
            {meeting.objective && (
              <div className="mt-4 border-t border-border pt-4">
                <p className="text-sm font-semibold text-text">Objetivo</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{meeting.objective}</p>
              </div>
            )}
            {meeting.description && (
              <div className="mt-4">
                <p className="text-sm font-semibold text-text">Agenda</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{meeting.description}</p>
              </div>
            )}
          </Panel>

          {meeting.status === 'COMPLETED' && (
            <Panel
              title="Resultado"
              actions={
                managesMeeting && (
                  <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setOutcomeFor(meeting)}>
                    Corrigir
                  </Button>
                )
              }
            >
              <dl className="space-y-3 text-sm">
                <div>
                  <dt className="font-semibold text-text">Resultado</dt>
                  <dd className="whitespace-pre-line text-text-secondary">{meeting.outcome}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-text">Decisões</dt>
                  <dd className="whitespace-pre-line text-text-secondary">{meeting.decisions ?? '—'}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-text">Próximos passos</dt>
                  <dd className="whitespace-pre-line text-text-secondary">{meeting.nextSteps ?? '—'}</dd>
                </div>
              </dl>
            </Panel>
          )}

          <Panel
            title="Tarefas geradas"
            actions={
              hasPermission('TIMESHEET_TASK_CREATE') &&
              meeting.status !== 'CANCELLED' && (
                <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setModal('task')}>
                  Criar tarefa
                </Button>
              )
            }
            flush
          >
            {tasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Nenhuma tarefa criada a partir desta reunião.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((task) => (
                  <li key={task.id} className="flex items-center justify-between gap-3 px-5 py-3">
                    <Link to={`/timesheet/tasks/${task.id}`} className="text-sm font-medium text-text hover:underline">
                      {task.reference} · {task.title}
                    </Link>
                    <WorkStatusBadge kind="task" status={task.status} />
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Histórico" flush>
            <WorkTimeline events={events} />
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Participantes"
            actions={
              managesMeeting &&
              isOpen && (
                <Button size="sm" variant="secondary" icon={Pencil} onClick={() => setModal('edit')} disabled={!participants.data}>
                  Editar
                </Button>
              )
            }
            flush
          >
            <ul className="divide-y divide-border">
              {people.map((person) => (
                <li key={person.profileId} className="px-5 py-3 text-sm">
                  <p className="font-medium text-text">
                    {person.fullName} {person.isOrganizer && <span className="text-xs font-normal text-text-muted">(organização)</span>}
                  </p>
                  {person.jobTitle && <p className="text-xs text-text-muted">{person.jobTitle}</p>}
                </li>
              ))}
            </ul>
          </Panel>
          {totals.length > 0 && (
            <Panel title="Tempo registado">
              <ul className="space-y-1 text-sm">
                {totals.map((row) => (
                  <li key={row.profileId} className="flex justify-between gap-3">
                    <span className="text-text-secondary">{row.fullName}</span>
                    <span className="font-medium text-text">{formatMinutesAsHours(row.totalMinutes)}</span>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          <AttachmentsPanel
            entityType="MEETING"
            entityId={meeting.id}
            viewerId={viewerId}
            canUpload={hasPermission('TIMESHEET_ATTACHMENT_CREATE') && meeting.status !== 'CANCELLED' && (managesMeeting || isParticipant)}
            canRemoveOthers={hasPermission('TIMESHEET_ATTACHMENT_DELETE') && managesMeeting}
            onChanged={detail.reload}
          />
          {managesMeeting && isOpen && (
            <Button variant="ghost" icon={Ban} className="w-full justify-start text-danger" onClick={() => setModal('cancel')}>
              Cancelar reunião
            </Button>
          )}
        </div>
      </div>

      <MeetingFormModal
        isOpen={modal === 'edit'}
        meeting={meeting}
        participantIds={people.filter((person) => !person.isOrganizer).map((person) => person.profileId)}
        people={participants.data ?? []}
        onClose={() => setModal(null)}
        onSaved={(_meetingId, text) => afterAction(text)}
      />
      <MeetingOutcomeModal meeting={outcomeFor} onClose={() => setOutcomeFor(null)} onSaved={afterAction} />
      <TicketNoteModal
        isOpen={modal === 'cancel'}
        title="Cancelar reunião"
        description="Os participantes são notificados."
        note={{ label: 'Motivo do cancelamento', minLength: 5, maxLength: 1000 }}
        confirmLabel="Cancelar reunião"
        variant="danger"
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await cancelMeeting(meeting.id, reason ?? '');
          afterAction('Reunião cancelada.');
        }}
      />
      <TaskFormModal
        isOpen={modal === 'task'}
        task={null}
        assignees={assignees.data ?? []}
        links={{ meetingId: meeting.id, opportunityId: meeting.opportunity?.id ?? null }}
        contextLabel={`Tarefa gerada a partir da reunião "${meeting.title}".`}
        onClose={() => setModal(null)}
        onSaved={(taskId) => {
          setModal(null);
          navigate(`/timesheet/tasks/${taskId}`);
        }}
      />
      <WorkLogFormModal
        isOpen={modal === 'logTime'}
        employeeId={viewerId}
        preset={{
          kind: 'MEETING',
          contextId: meeting.id,
          contextLabel: meeting.title,
          workDate: toDateInput(new Date(meeting.startsAt)),
          startTime: toTimeInput(new Date(meeting.startsAt)),
          endTime: toTimeInput(new Date(meeting.endsAt)),
          description: `Reunião: ${meeting.title}`,
        }}
        onClose={() => setModal(null)}
        onSaved={() => afterAction('Tempo da reunião registado.')}
      />
    </div>
  );
};
