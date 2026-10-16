import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  Ban,
  CalendarPlus,
  CheckCircle2,
  BadgeCheck,
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
  reviewTask,
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
import { t } from '../../lib/i18n';

type ModalKind = 'edit' | 'assign' | 'block' | 'cancel' | 'reopen' | 'followUp' | 'logTime' | 'meeting' | 'review' | null;

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
  const location = useLocation();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const detail = useAsyncData(() => loadTask(id), [id]);
  // Volta à lista de onde se veio (com o separador escolhido), se vier da lista de tarefas.
  const from: unknown = (location.state as { from?: unknown } | null)?.from;
  const listPath = typeof from === 'string' && from.startsWith('/timesheet/tasks') ? from : '/timesheet/tasks';
  const people = useAsyncData(
    () => (hasPermission('TIMESHEET_TASK_ASSIGN') || hasPermission('TIMESHEET_TASK_CREATE') ? listWorkPeople('ASSIGNEE') : Promise.resolve([])),
    []
  );
  // Reuniões: só quem as pode agendar obtém a lista de convidáveis (equipa e chefias).
  const participants = useAsyncData(() => (hasPermission('TIMESHEET_MEETING_CREATE') ? listWorkPeople('MEETING') : Promise.resolve([])), []);
  const [modal, setModal] = useState<ModalKind>(null);
  const [completing, setCompleting] = useState<TaskDetail | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  const backLink = (
    <Link to={listPath} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t('Voltar às tarefas')}
    </Link>
  );

  if (detail.isLoading && !detail.data) return <LoadingState label={t('A carregar tarefa...')} />;
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
        <EmptyState title={t('Tarefa não encontrada.')} message={t('A tarefa não existe ou não tem acesso a ela.')} />
      </div>
    );
  }

  const { task, events, children, entries, totals, meetings } = detail.data;
  const isAdmin = hasPermission('ADMIN_ACCESS');
  // Espelho da regra do servidor (private.manages_task) apenas para mostrar as ações certas.
  const managesTask =
    isAdmin ||
    task.createdBy === viewerId ||
    (task.assignedBy === viewerId && hasPermission('TIMESHEET_TASK_ASSIGN')) ||
    (task.assigneeId !== null && task.assigneeId !== viewerId && hasPermission('TEAM_READ'));
  const actions = taskActions(task, {
    profileId: viewerId,
    definitionReservedToOthers: task.definitionLocked && task.createdBy !== viewerId && !isAdmin,
    managesTask,
    permissions: {
      update: hasPermission('TIMESHEET_TASK_UPDATE'),
      create: hasPermission('TIMESHEET_TASK_CREATE'),
      assign: hasPermission('TIMESHEET_TASK_ASSIGN'),
      reopen: hasPermission('TIMESHEET_TASK_REOPEN'),
      logTime: hasPermission('SELF_TIMESHEET_UPDATE'),
      supervise: hasPermission('TEAM_SUPERVISE'),
      leadsTeam: hasPermission('TEAM_READ'),
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
      setActionError(getErrorMessage(error, t('Não foi possível concluir a ação.')));
    } finally {
      setIsPending(false);
    }
  };

  const entryColumns: DataTableColumn<WorkLogEntry>[] = [
    { id: 'date', header: t('Data'), render: (entry) => formatDate(entry.workDate) },
    { id: 'time', header: t('Horário'), render: (entry) => `${entry.startTime}–${entry.endTime}` },
    { id: 'duration', header: t('Duração'), render: (entry) => formatMinutesAsHours(entry.totalMinutes) },
    { id: 'activity', header: t('Atividade'), render: (entry) => entry.activityName ?? '—' },
    { id: 'description', header: t('O que foi feito'), className: 'min-w-56', render: (entry) => entry.description },
  ];
  const relatedColumns: DataTableColumn<TaskSummary>[] = [
    {
      id: 'task',
      header: t('Tarefa adicional'),
      render: (item) => (
        <Link to={`/timesheet/tasks/${item.id}`} className="font-semibold text-text hover:underline">
          {item.reference} · {item.title}
        </Link>
      ),
    },
    { id: 'assignee', header: t('Responsável'), render: (item) => item.assigneeName ?? '—' },
    { id: 'status', header: t('Estado'), render: (item) => <WorkStatusBadge kind="task" status={item.status} /> },
    { id: 'due', header: t('Prazo'), render: (item) => formatDateTime(item.dueAt, t('Sem prazo')) },
  ];

  return (
    <div className="space-y-6">
      <nav aria-label={t('Caminho')} className="text-sm text-text-muted">
        <span>{t('Trabalho')}</span>{' '}
        /{' '}
        <Link to="/timesheet/tasks" className="hover:underline">
          {t('Tarefas')}
        </Link>{' '}
        / <span className="text-text">{task.reference}</span>
      </nav>
      <PageHeader
        title={`${task.reference} · ${task.title}`}
        subtitle={t('Criada por {creatorName} em {createdAt}', { creatorName, createdAt: formatDateTime(task.createdAt) })}
        actions={
          <>
            {actions.canStart && (
              <Button icon={Play} isLoading={isPending} disabled={isStale} onClick={() => runImmediate(() => startTask(task.id), t('Tarefa iniciada.'))}>
                {t('Iniciar')}
              </Button>
            )}
            {actions.canComplete && (
              <Button icon={CheckCircle2} disabled={isStale} onClick={() => setCompleting(task)}>
                {t('Concluir')}
              </Button>
            )}
            {actions.canLogTime && (
              <Button variant="secondary" icon={Clock3} disabled={isStale} onClick={() => setModal('logTime')}>
                {t('Registar tempo')}
              </Button>
            )}
            {actions.canReview && (
              <Button icon={BadgeCheck} disabled={isStale} onClick={() => setModal('review')}>
                {t('Validar conclusão')}
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
      {task.definitionLocked && task.createdBy !== viewerId && !isAdmin && task.status !== 'CANCELLED' && (
        <p className="text-sm text-text-secondary">
          {t('Tarefa delegada por {creatorName}: só quem a criou altera a definição, o prazo, cancela ou reabre. Pode distribuí-la e acompanhar a execução.', { creatorName })}
        </p>
      )}
      {task.status === 'BLOCKED' && task.blockedReason && (
        <Alert variant="error" title={t('Tarefa bloqueada')}>
          {task.blockedReason}
        </Alert>
      )}
      {task.status === 'CANCELLED' && task.cancelReason && (
        <Alert variant="info" title={t('Tarefa cancelada')}>
          {task.cancelReason}
        </Alert>
      )}
      {task.requiresManagerReview && task.status !== 'CANCELLED' && (
        <Alert variant="info" title={t('Exige acompanhamento do Manager')}>
          {task.reviewedAt
            ? task.reviewNote ? t('Conclusão validada em {date}: {note}', { date: formatDateTime(task.reviewedAt), note: task.reviewNote }) : t('Conclusão validada em {date}.', { date: formatDateTime(task.reviewedAt) })
            : t('Quando for concluída, quem supervisiona o gestor é notificado para validar a conclusão.')}
        </Alert>
      )}
      {!task.requiresManagerReview && task.status === 'COMPLETED' && task.reviewedAt && (
        <Alert variant="success" title={t('Conclusão validada')}>
          {task.reviewNote ? t('Validada em {date}: {note}', { date: formatDateTime(task.reviewedAt), note: task.reviewNote }) : t('Validada em {date}.', { date: formatDateTime(task.reviewedAt) })}
        </Alert>
      )}
      {task.status === 'COMPLETED' && task.lateReason && (
        <Alert variant="warning" title={t('Concluída depois do prazo')}>
          {t('Motivo do atraso: {reason}', { reason: task.lateReason })}
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
            <p className="whitespace-pre-line text-sm text-text-secondary">{task.description || t('Sem descrição.')}</p>
            {task.completionNote && (
              <div className="mt-4 rounded-md border border-success/30 bg-success-soft px-4 py-3">
                <p className="text-sm font-semibold text-text">{t('Resultado')}</p>
                <p className="mt-0.5 whitespace-pre-line text-sm text-text-secondary">{task.completionNote}</p>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2 lg:grid-cols-3">
              <DetailItem label={t('Responsável')}>{task.assigneeName ?? t('Sem responsável')}</DetailItem>
              <DetailItem label={t('Departamento')}>{task.departmentName ?? '—'}</DetailItem>
              <DetailItem label={t('Prazo')}>{formatDateTime(task.dueAt, t('Sem prazo'))}</DetailItem>
              <DetailItem label={t('Início planeado')}>{formatDate(task.startDate, '—')}</DetailItem>
              <DetailItem label={t('Iniciada em')}>{formatDateTime(task.startedAt)}</DetailItem>
              <DetailItem label={t('Concluída em')}>{formatDateTime(task.completedAt)}</DetailItem>
              <DetailItem label={t('Estimativa')}>{task.estimatedMinutes ? formatMinutesAsHours(task.estimatedMinutes) : '—'}</DetailItem>
              <DetailItem label={t('Tempo registado')}>{formatMinutesAsHours(totalMinutes)}</DetailItem>
              {task.parentTask && (
                <DetailItem label={t('Tarefa de origem')}>
                  <Link to={`/timesheet/tasks/${task.parentTask.id}`} className="text-primary-hover hover:underline">
                    {task.parentTask.reference} · {task.parentTask.title}
                  </Link>
                </DetailItem>
              )}
              {task.opportunity && (
                <DetailItem label={t('Oportunidade')}>
                  <Link to={`/timesheet/opportunities/${task.opportunity.id}`} className="text-primary-hover hover:underline">
                    {task.opportunity.reference} · {task.opportunity.title}
                  </Link>
                </DetailItem>
              )}
              {task.meeting && (
                <DetailItem label={t('Reunião de origem')}>
                  <Link to={`/timesheet/meetings/${task.meeting.id}`} className="text-primary-hover hover:underline">
                    {task.meeting.title}
                  </Link>
                </DetailItem>
              )}
            </dl>
          </Panel>

          <Panel title={t('Tempo registado')} description={totals.length > 0 ? totals.map((row) => `${row.fullName}: ${formatMinutesAsHours(row.totalMinutes)}`).join(' · ') : undefined} flush>
            {entries.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">{t('Ainda não foi registado tempo nesta tarefa.')}</p>
            ) : (
              <DataTable caption={t('Tempo registado na tarefa')} columns={entryColumns} rows={entries} getRowKey={(entry) => entry.id} />
            )}
          </Panel>

          {(children.length > 0 || actions.canCreateFollowUp) && (
            <Panel
              title={t('Tarefas adicionais')}
              description={t('Trabalho acrescentado depois: cada uma é uma nova tarefa, sem alterar esta.')}
              actions={
                actions.canCreateFollowUp && (
                  <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setModal('followUp')}>
                    {t('Tarefa adicional')}
                  </Button>
                )
              }
              flush
            >
              {children.length === 0 ? (
                <p className="px-5 py-4 text-sm text-text-secondary">{t('Sem tarefas adicionais.')}</p>
              ) : (
                <DataTable caption={t('Tarefas adicionais')} columns={relatedColumns} rows={children} getRowKey={(item) => item.id} />
              )}
            </Panel>
          )}

          <Panel title={t('Histórico e comentários')} description={t('Registo só de leitura: quem alterou, quando, o quê e porquê.')} flush>
            <WorkTimeline events={events} />
            {actions.canComment && (
              <TicketCommentForm
                label={t('Novo comentário')}
                allowInternal={false}
                onSubmit={async (body) => {
                  await addTaskComment(task.id, body);
                  afterAction(t('Comentário registado.'));
                }}
              />
            )}
          </Panel>
        </div>

        <div className="order-first space-y-6 lg:order-none">
          <Panel title={t('Ações')}>
            <div className="flex flex-col gap-2">
              {actions.canBlock && (
                <Button variant="secondary" icon={PauseCircle} className="justify-start" onClick={() => setModal('block')}>
                  {t('Registar bloqueio')}
                </Button>
              )}
              {actions.canUnblock && (
                <Button
                  variant="secondary"
                  icon={Play}
                  className="justify-start"
                  isLoading={isPending}
                  onClick={() => runImmediate(() => unblockTask(task.id, null), t('Tarefa desbloqueada.'))}
                >
                  {t('Desbloquear')}
                </Button>
              )}
              {actions.canEdit && (
                <Button variant="secondary" icon={Pencil} className="justify-start" onClick={() => setModal('edit')}>
                  {t('Editar planeamento')}
                </Button>
              )}
              {actions.canAssign && (
                <Button variant="secondary" icon={UserPlus} className="justify-start" disabled={!people.data} onClick={() => setModal('assign')}>
                  {task.assigneeId ? t('Alterar responsável') : 'Atribuir'}
                </Button>
              )}
              {hasPermission('TIMESHEET_MEETING_CREATE') && task.status !== 'CANCELLED' && (
                <Button variant="secondary" icon={CalendarPlus} className="justify-start" disabled={!participants.data} onClick={() => setModal('meeting')}>
                  {t('Marcar reunião')}
                </Button>
              )}
              {actions.canReopen && (
                <Button variant="secondary" icon={RotateCcw} className="justify-start" onClick={() => setModal('reopen')}>
                  {t('Reabrir')}
                </Button>
              )}
              {actions.canCancel && (
                <Button variant="ghost" icon={Ban} className="justify-start text-danger" onClick={() => setModal('cancel')}>
                  {t('Cancelar tarefa')}
                </Button>
              )}
              {!Object.values(actions).some(Boolean) && <p className="text-sm text-text-secondary">{t('Sem ações disponíveis para si nesta tarefa.')}</p>}
            </div>
          </Panel>

          {meetings.length > 0 && (
            <Panel title={t('Reuniões')} flush>
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
        canRequestManagerReview={hasPermission('TIMESHEET_TASK_ASSIGN') && !hasPermission('TEAM_SUPERVISE')}
        contextLabel={t('Tarefa adicional de {reference}. A tarefa original não é alterada.', { reference: task.reference })}
        onClose={() => setModal(null)}
        onSaved={(taskId) => {
          setModal(null);
          navigate(`/timesheet/tasks/${taskId}`);
        }}
      />
      <TicketSelectModal
        isOpen={modal === 'assign'}
        title={task.assigneeId ? t('Alterar responsável') : t('Atribuir tarefa')}
        fieldLabel={t('Responsável')}
        options={(people.data ?? []).map((person) => ({ value: person.profileId, label: person.departmentName ? `${person.fullName} · ${person.departmentName}` : person.fullName }))}
        initialValue={task.assigneeId ?? ''}
        emptyOptionLabel={task.status === 'ASSIGNED' && managesTask ? t('Sem responsável (volta a planeada)') : undefined}
        optionalNote={{ label: task.status === 'COMPLETED' ? t('Motivo (obrigatório numa tarefa concluída)') : t('Nota (opcional)'), maxLength: 1000 }}
        confirmLabel={t('Guardar')}
        onClose={() => setModal(null)}
        onConfirm={async (assigneeId, note) => {
          await assignTask(task.id, assigneeId, note);
          afterAction(assigneeId ? t('Responsável atualizado. O colaborador foi notificado.') : t('Responsável retirado.'));
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'block'}
        title={t('Registar bloqueio')}
        description={t('Quem gere a tarefa é notificado.')}
        note={{ label: t('O que está a bloquear a tarefa'), minLength: 5, maxLength: 1000 }}
        confirmLabel={t('Registar bloqueio')}
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await blockTask(task.id, reason ?? '');
          afterAction(t('Bloqueio registado.'));
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'cancel'}
        title={t('Cancelar {reference}', { reference: task.reference })}
        description={t('Uma tarefa cancelada não volta a estar em curso. O motivo fica no histórico.')}
        note={{ label: t('Motivo do cancelamento'), minLength: 5, maxLength: 1000 }}
        confirmLabel={t('Cancelar tarefa')}
        variant="danger"
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await cancelTask(task.id, reason ?? '');
          afterAction(t('Tarefa cancelada.'));
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'reopen'}
        title={t('Reabrir {reference}', { reference: task.reference })}
        description={t('A conclusão anterior fica no histórico. Reveja o prazo depois de reabrir.')}
        note={{ label: t('Motivo da reabertura'), minLength: 5, maxLength: 1000 }}
        confirmLabel={t('Reabrir tarefa')}
        onClose={() => setModal(null)}
        onConfirm={async (reason) => {
          await reopenTask(task.id, reason ?? '', null);
          afterAction(t('Tarefa reaberta.'));
        }}
      />
      <TicketNoteModal
        isOpen={modal === 'review'}
        title={t('Validar a conclusão de {reference}', { reference: task.reference })}
        description={t('Confirma que o resultado foi verificado. O responsável é notificado e a validação fica no histórico.')}
        note={{ label: t('Nota (opcional)'), maxLength: 1000 }}
        confirmLabel={t('Validar conclusão')}
        onClose={() => setModal(null)}
        onConfirm={async (note) => {
          await reviewTask(task.id, note);
          afterAction(t('Conclusão validada.'));
        }}
      />
      <CompleteTaskModal task={completing} onClose={() => setCompleting(null)} onCompleted={() => afterAction(t('Tarefa concluída.'))} />
      <WorkLogFormModal
        isOpen={modal === 'logTime'}
        employeeId={viewerId}
        preset={{ kind: 'TASK', contextId: task.id, contextLabel: `${task.reference} · ${task.title}` }}
        onClose={() => setModal(null)}
        onSaved={() => afterAction(t('Tempo registado na tarefa.'))}
      />
      <MeetingFormModal
        isOpen={modal === 'meeting'}
        meeting={null}
        participantIds={task.assigneeId && task.assigneeId !== viewerId ? [task.assigneeId] : []}
        people={participants.data ?? []}
        links={{ taskId: task.id, opportunityId: task.opportunity?.id ?? null }}
        contextLabel={t('Reunião relacionada com {reference}.', { reference: task.reference })}
        onClose={() => setModal(null)}
        onSaved={(meetingId) => {
          setModal(null);
          navigate(`/timesheet/meetings/${meetingId}`);
        }}
      />
    </div>
  );
};
