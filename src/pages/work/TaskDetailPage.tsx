import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  CheckCircle2,
  Clock3,
  ListPlus,
  PauseCircle,
  Pencil,
  Play,
  RotateCcw,
  UserPlus,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import {
  addTaskComment,
  assignTask,
  blockTask,
  cancelTask,
  getTask,
  listRelatedTasks,
  listTaskEvents,
  reopenTask,
  startTask,
  unblockTask,
} from '../../services/work/taskService';
import { getWorkTimeTotals, listContextEntries } from '../../services/work/workLogService';
import { listRelatedMeetings } from '../../services/work/meetingService';
import { listWorkPeople } from '../../services/work/calendarService';
import type { TaskDetail, TaskSummary, WorkLogEntry } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { TicketCommentForm } from '../../components/it/TicketCommentForm';
import { TicketNoteModal, TicketSelectModal } from '../../components/it/TicketActionModals';
import { OverdueBadge, WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { WorkTimeline } from '../../components/work/WorkTimeline';
import { AttachmentsPanel } from '../../components/work/AttachmentsPanel';
import { TaskFormModal } from '../../components/work/TaskFormModal';
import { CompleteTaskModal } from '../../components/work/CompleteTaskModal';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import { MeetingFormModal } from '../../components/work/MeetingFormModal';
import { isTaskOverdue, taskActions } from '../../utils/work';
import { formatDate, formatDateTime, formatMinutesAsHours } from '../../utils/format';
import { isUuid } from '../../utils/validation';

type ModalKind = 'edit' | 'assign' | 'block' | 'cancel' | 'reopen' | 'followUp' | 'logTime' | 'meeting' | null;

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

async function loadTask(taskId: string) {
  if (!isUuid(taskId)) return null;
  const task = await getTask(taskId);
  if (!task) return null;
  const [events, children, entries, totals, meetings] = await Promise.all([
    listTaskEvents(taskId),
    listRelatedTasks('parent_task_id', taskId),
    listContextEntries('task_id', taskId),
    getWorkTimeTotals('TASK', taskId),
    listRelatedMeetings('task_id', taskId),
  ]);
  return { task, events, children, entries, totals, meetings };
}

export const TaskDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const detail = useAsyncData(() => loadTask(id), [id]);
  const people = useAsyncData(
    () => (hasPermission('TIMESHEET_TASK_ASSIGN') || hasPermission('TIMESHEET_TASK_CREATE') ? listWorkPeople('ASSIGNEE') : Promise.resolve([])),
    []
  );
  const participants = useAsyncData(() => (hasPermission('TIMESHEET_MEETING_CREATE') ? listWorkPeople('PARTICIPANT') : Promise.resolve([])), []);
  const [modal, setModal] = useState<ModalKind>(null);
  const [completing, setCompleting] = useState<TaskDetail | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const backLink = (
    <Link to="/timesheet/tasks" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar às tarefas
    </Link>
  );

  if (detail.isLoading && !detail.data) return <LoadingState label="A carregar tarefa..." />;
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
        <EmptyState title="Tarefa não encontrada." message="A tarefa não existe ou não tem acesso a ela." />
      </div>
    );
  }

  const { task, events, children, entries, totals, meetings } = detail.data;
  const isAdmin = hasPermission('ADMIN_ACCESS');
  // Espelho da regra do servidor (private.manages_task) apenas para mostrar as ações certas.
  const managesTask = isAdmin || task.createdBy === viewerId || (task.assigneeId !== null && task.assigneeId !== viewerId && hasPermission('TEAM_READ'));
  const actions = taskActions(task, {
    profileId: viewerId,
    managesTask,
    permissions: {
      update: hasPermission('TIMESHEET_TASK_UPDATE'),
      create: hasPermission('TIMESHEET_TASK_CREATE'),
      assign: hasPermission('TIMESHEET_TASK_ASSIGN'),
      reopen: hasPermission('TIMESHEET_TASK_REOPEN'),
      logTime: hasPermission('SELF_TIMESHEET_UPDATE'),
    },
  });
  const isStale = detail.isLoading;
  const overdue = isTaskOverdue(task, new Date());
  const creatorName = task.creatorName ?? events.find((event) => event.eventType === 'TASK_CREATED')?.actorName ?? '—';
  const totalMinutes = totals.reduce((sum, row) => sum + row.totalMinutes, 0);

  const afterAction = (message: string) => {
    setModal(null);
    setCompleting(null);
    setActionError(null);
    setSuccessMessage(message);
    detail.reload();
  };

  const runImmediate = async (action: () => Promise<void>, message: string) => {
    setIsPending(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await action();
      afterAction(message);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Não foi possível concluir a ação.'));
    } finally {
      setIsPending(false);
    }
  };

  const entryColumns: DataTableColumn<WorkLogEntry>[] = [
    { id: 'date', header: 'Data', render: (entry) => formatDate(entry.workDate) },
    { id: 'time', header: 'Horário', render: (entry) => `${entry.startTime}–${entry.endTime}` },
    { id: 'duration', header: 'Duração', render: (entry) => formatMinutesAsHours(entry.totalMinutes) },
    { id: 'activity', header: 'Atividade', render: (entry) => entry.activityName ?? '—' },
    { id: 'description', header: 'O que foi feito', className: 'min-w-56', render: (entry) => entry.description },
  ];
  const relatedColumns: DataTableColumn<TaskSummary>[] = [
    {
      id: 'task',
      header: 'Tarefa adicional',
      render: (item) => (
        <Link to={`/timesheet/tasks/${item.id}`} className="font-semibold text-text hover:underline">
          {item.reference} · {item.title}
        </Link>
      ),
    },
    { id: 'assignee', header: 'Responsável', render: (item) => item.assigneeName ?? '—' },
    { id: 'status', header: 'Estado', render: (item) => <WorkStatusBadge kind="task" status={item.status} /> },
    { id: 'due', header: 'Prazo', render: (item) => formatDateTime(item.dueAt, 'Sem prazo') },
  ];

  return (
    <div className="space-y-6">
      <nav aria-label="Caminho" className="text-sm text-text-muted">
        <Link to="/timesheet" className="hover:underline">
          Trabalho
        </Link>{' '}
        /{' '}
        <Link to="/timesheet/tasks" className="hover:underline">
          Tarefas
        </Link>{' '}
        / <span className="text-text">{task.reference}</span>
      </nav>
      <PageHeader
        title={`${task.reference} · ${task.title}`}
        subtitle={`Criada por ${creatorName} em ${formatDateTime(task.createdAt)}`}
        actions={
          <>
            {actions.canStart && (
              <Button icon={Play} isLoading={isPending} disabled={isStale} onClick={() => runImmediate(() => startTask(task.id), 'Tarefa iniciada.')}>
                Iniciar
              </Button>
            )}
            {actions.canComplete && (
              <Button icon={CheckCircle2} disabled={isStale} onClick={() => setCompleting(task)}>
                Concluir
              </Button>
            )}
            {actions.canLogTime && (
              <Button variant="secondary" icon={Clock3} disabled={isStale} onClick={() => setModal('logTime')}>
                Registar tempo
              </Button>
            )}
          </>
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {actionError && (
        <Alert variant="error" onDismiss={() => setActionError(null)}>
          {actionError}
        </Alert>
      )}
      {task.status === 'BLOCKED' && task.blockedReason && (
        <Alert variant="error" title="Tarefa bloqueada">
          {task.blockedReason}
        </Alert>
      )}
      {task.status === 'CANCELLED' && task.cancelReason && (
        <Alert variant="info" title="Tarefa cancelada">
          {task.cancelReason}
        </Alert>
      )}
      {task.status === 'COMPLETED' && task.lateReason && (
        <Alert variant="warning" title="Concluída depois do prazo">
          Motivo do atraso: {task.lateReason}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <WorkStatusBadge kind="task" status={task.status} />
              <PriorityBadge priority={task.priority} />
              {overdue && <OverdueBadge />}
            </div>
            <p className="whitespace-pre-line text-sm text-text-secondary">{task.description || 'Sem descrição.'}</p>
            {task.completionNote && (
              <div className="mt-4 rounded-md border border-success/30 bg-success-soft px-4 py-3">
                <p className="text-sm font-semibold text-text">Resultado</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{task.completionNote}</p>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label="Responsável">{task.assigneeName ?? 'Sem responsável'}</DetailItem>
              <DetailItem label="Departamento">{task.departmentName ?? '—'}</DetailItem>
              <DetailItem label="Prazo">{formatDateTime(task.dueAt, 'Sem prazo')}</DetailItem>
              <DetailItem label="Início planeado">{formatDate(task.startDate, '—')}</DetailItem>
              <DetailItem label="Iniciada em">{formatDateTime(task.startedAt)}</DetailItem>
              <DetailItem label="Concluída em">{formatDateTime(task.completedAt)}</DetailItem>
              <DetailItem label="Estimativa">{task.estimatedMinutes ? formatMinutesAsHours(task.estimatedMinutes) : '—'}</DetailItem>
              <DetailItem label="Tempo registado">{formatMinutesAsHours(totalMinutes)}</DetailItem>
              {task.parentTask && (
                <DetailItem label="Tarefa de origem">
                  <Link to={`/timesheet/tasks/${task.parentTask.id}`} className="text-primary-hover hover:underline">
                    {task.parentTask.reference} · {task.parentTask.title}
                  </Link>
                </DetailItem>
              )}
              {task.opportunity && (
                <DetailItem label="Oportunidade">
                  <Link to={`/timesheet/opportunities/${task.opportunity.id}`} className="text-primary-hover hover:underline">
                    {task.opportunity.reference} · {task.opportunity.title}
                  </Link>
                </DetailItem>
              )}
              {task.meeting && (
                <DetailItem label="Reunião de origem">
                  <Link to={`/timesheet/meetings/${task.meeting.id}`} className="text-primary-hover hover:underline">
                    {task.meeting.title}
                  </Link>
                </DetailItem>
              )}
            </dl>
          </Panel>

          <Panel title="Tempo registado" description={totals.length > 0 ? totals.map((row) => `${row.fullName}: ${formatMinutesAsHours(row.totalMinutes)}`).join(' · ') : undefined} flush>
            {entries.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Ainda não foi registado tempo nesta tarefa.</p>
            ) : (
              <DataTable caption="Tempo registado na tarefa" columns={entryColumns} rows={entries} getRowKey={(entry) => entry.id} />
            )}
          </Panel>

          {(children.length > 0 || actions.canCreateFollowUp) && (
            <Panel
              title="Tarefas adicionais"
              description="Trabalho acrescentado depois: cada uma é uma nova tarefa, sem alterar esta."
              actions={
                actions.canCreateFollowUp && (
                  <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setModal('followUp')}>
                    Tarefa adicional
                  </Button>
                )
              }
              flush
            >
              {children.length === 0 ? (
                <p className="px-5 py-4 text-sm text-text-secondary">Sem tarefas adicionais.</p>
              ) : (
                <DataTable caption="Tarefas adicionais" columns={relatedColumns} rows={children} getRowKey={(item) => item.id} />
              )}
            </Panel>
          )}

          <Panel title="Histórico e comentários" description="Registo só de leitura: quem alterou, quando, o quê e porquê." flush>
            <WorkTimeline events={events} />
            {actions.canComment && (
              <TicketCommentForm
                label="Novo comentário"
                allowInternal={false}
                onSubmit={async (body) => {
                  await addTaskComment(task.id, body);
                  afterAction('Comentário registado.');
                }}
              />
            )}
          </Panel>
        </div>

        <div className="order-first space-y-6 lg:order-none">
          <Panel title="Ações">
            <div className="flex flex-col gap-2">
              {actions.canBlock && (
                <Button variant="secondary" icon={PauseCircle} className="justify-start" onClick={() => setModal('block')}>
                  Registar bloqueio
                </Button>
              )}
              {actions.canUnblock && (
                <Button
                  variant="secondary"
                  icon={Play}
                  className="justify-start"
                  isLoading={isPending}
                  onClick={() => runImmediate(() => unblockTask(task.id, null), 'Tarefa desbloqueada.')}
                >
                  Desbloquear
                </Button>
              )}
              {actions.canEdit && (
                <Button variant="secondary" icon={Pencil} className="justify-start" onClick={() => setModal('edit')}>
                  Editar planeamento
                </Button>
              )}
              {actions.canAssign && (
                <Button variant="secondary" icon={UserPlus} className="justify-start" disabled={!people.data} onClick={() => setModal('assign')}>
                  {task.assigneeId ? 'Alterar responsável' : 'Atribuir'}
                </Button>
              )}
              {hasPermission('TIMESHEET_MEETING_CREATE') && task.status !== 'CANCELLED' && (
                <Button variant="secondary" icon={CalendarPlus} className="justify-start" disabled={!participants.data} onClick={() => setModal('meeting')}>
                  Marcar reunião
                </Button>
              )}
              {actions.canReopen && (
                <Button variant="secondary" icon={RotateCcw} className="justify-start" onClick={() => setModal('reopen')}>
                  Reabrir
                </Button>
              )}
              {actions.canCancel && (
                <Button variant="ghost" icon={Ban} className="justify-start text-danger" onClick={() => setModal('cancel')}>
                  Cancelar tarefa
                </Button>
              )}
              {!Object.values(actions).some(Boolean) && <p className="text-sm text-text-secondary">Sem ações disponíveis para si nesta tarefa.</p>}
            </div>
          </Panel>

          {meetings.length > 0 && (
            <Panel title="Reuniões" flush>
              <ul className="divide-y divide-border">
                {meetings.map((meeting) => (
                  <li key={meeting.id} className="px-5 py-3">
                    <Link to={`/timesheet/meetings/${meeting.id}`} className="text-sm font-medium text-text hover:underline">
                      {meeting.title}
                    </Link>
                    <p className="text-xs text-text-muted">{formatDateTime(meeting.startsAt)}</p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}

          <AttachmentsPanel
            entityType="TASK"
            entityId={task.id}
            viewerId={viewerId}
            canUpload={hasPermission('TIMESHEET_ATTACHMENT_CREATE') && task.status !== 'CANCELLED' && (task.assigneeId === viewerId || managesTask)}
            canRemoveOthers={hasPermission('TIMESHEET_ATTACHMENT_DELETE') && managesTask}
            onChanged={detail.reload}
          />
        </div>
      </div>

      <TaskFormModal isOpen={modal === 'edit'} task={task} assignees={[]} onClose={() => setModal(null)} onSaved={(_taskId, message) => afterAction(message)} />
      <TaskFormModal
        isOpen={modal === 'followUp'}
        task={null}
        assignees={people.data ?? []}
        links={{ parentTaskId: task.id, opportunityId: task.opportunity?.id ?? null }}
        contextLabel={`Tarefa adicional de ${task.reference}. A tarefa original não é alterada.`}
        onClose={() => setModal(null)}
        onSaved={(taskId) => {
          setModal(null);
          navigate(`/timesheet/tasks/${taskId}`);
        }}
      />
      <TicketSelectModal
        isOpen={modal === 'assign'}
        title={task.assigneeId ? 'Alterar responsável' : 'Atribuir tarefa'}
        fieldLabel="Responsável"
        options={(people.data ?? []).map((person) => ({ value: person.profileId, label: person.departmentName ? `${person.fullName} · ${person.departmentName}` : person.fullName }))}
        initialValue={task.assigneeId ?? ''}
        emptyOptionLabel={task.status === 'ASSIGNED' ? 'Sem responsável (volta a planeada)' : undefined}
        optionalNote={{ label: task.status === 'COMPLETED' ? 'Motivo (obrigatório numa tarefa concluída)' : 'Nota (opcional)', maxLength: 1000 }}
        confirmLabel="Guardar"
        onClose={() => setModal(null)}
        onConfirm={async (assigneeId, note) => {
          await assignTask(task.id, assigneeId, note);
          afterAction(assigneeId ? 'Responsável atualizado. O colaborador foi notificado.' : 'Responsável retirado.');
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'block'}
        title="Registar bloqueio"
        description="Quem gere a tarefa é notificado."
        note={{ label: 'O que está a bloquear a tarefa', minLength: 5, maxLength: 1000 }}
        confirmLabel="Registar bloqueio"
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await blockTask(task.id, reason ?? '');
          afterAction('Bloqueio registado.');
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'cancel'}
        title={`Cancelar ${task.reference}`}
        description="Uma tarefa cancelada não volta a estar em curso. O motivo fica no histórico."
        note={{ label: 'Motivo do cancelamento', minLength: 5, maxLength: 1000 }}
        confirmLabel="Cancelar tarefa"
        variant="danger"
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await cancelTask(task.id, reason ?? '');
          afterAction('Tarefa cancelada.');
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'reopen'}
        title={`Reabrir ${task.reference}`}
        description="A conclusão anterior fica no histórico. Reveja o prazo depois de reabrir."
        note={{ label: 'Motivo da reabertura', minLength: 5, maxLength: 1000 }}
        confirmLabel="Reabrir tarefa"
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await reopenTask(task.id, reason ?? '', null);
          afterAction('Tarefa reaberta.');
        }}
      />
      <CompleteTaskModal task={completing} onClose={() => setCompleting(null)} onCompleted={() => afterAction('Tarefa concluída.')} />
      <WorkLogFormModal
        isOpen={modal === 'logTime'}
        employeeId={viewerId}
        preset={{ kind: 'TASK', contextId: task.id, contextLabel: `${task.reference} · ${task.title}` }}
        onClose={() => setModal(null)}
        onSaved={() => afterAction('Tempo registado na tarefa.')}
      />
      <MeetingFormModal
        isOpen={modal === 'meeting'}
        meeting={null}
        participantIds={task.assigneeId && task.assigneeId !== viewerId ? [task.assigneeId] : []}
        people={participants.data ?? []}
        links={{ taskId: task.id, opportunityId: task.opportunity?.id ?? null }}
        contextLabel={`Reunião relacionada com ${task.reference}.`}
        onClose={() => setModal(null)}
        onSaved={(meetingId) => {
          setModal(null);
          navigate(`/timesheet/meetings/${meetingId}`);
        }}
      />
    </div>
  );
};
