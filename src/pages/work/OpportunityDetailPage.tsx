import React, { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, Clock3, GitBranch, ListPlus, Pencil, UserMinus, UserPlus, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import {
  addOpportunityComment,
  addOpportunityMember,
  getOpportunity,
  getOpportunityPeople,
  listCompanies,
  listOpportunityEvents,
  removeOpportunityMember,
  setOpportunityOwner,
} from '../../services/work/opportunityService';
import { listRelatedTasks } from '../../services/work/taskService';
import { listRelatedMeetings } from '../../services/work/meetingService';
import { getWorkTimeTotals } from '../../services/work/workLogService';
import { listWorkPeople } from '../../services/work/calendarService';
import type { OpportunityDetail } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { TicketCommentForm } from '../../components/it/TicketCommentForm';
import { TicketSelectModal } from '../../components/it/TicketActionModals';
import { WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { WorkTimeline } from '../../components/work/WorkTimeline';
import { AttachmentsPanel } from '../../components/work/AttachmentsPanel';
import { OpportunityFormModal, OpportunityStatusModal } from '../../components/work/OpportunityModals';
import { TaskFormModal } from '../../components/work/TaskFormModal';
import { MeetingFormModal } from '../../components/work/MeetingFormModal';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import { formatMoney, isOpportunityActive } from '../../utils/work';
import { formatDate, formatDateTime, formatMinutesAsHours } from '../../utils/format';
import { isUuid } from '../../utils/validation';

type ModalKind = 'edit' | 'owner' | 'member' | 'task' | 'meeting' | 'logTime' | null;

async function loadOpportunity(opportunityId: string) {
  if (!isUuid(opportunityId)) return null;
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) return null;
  const [people, events, tasks, meetings, totals] = await Promise.all([
    getOpportunityPeople(opportunityId),
    listOpportunityEvents(opportunityId),
    listRelatedTasks('opportunity_id', opportunityId),
    listRelatedMeetings('opportunity_id', opportunityId),
    getWorkTimeTotals('OPPORTUNITY', opportunityId),
  ]);
  return { opportunity, people, events, tasks, meetings, totals };
}

const Field: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 whitespace-pre-line text-sm font-medium text-text">{children}</dd>
  </div>
);

export const OpportunityDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const detail = useAsyncData(() => loadOpportunity(id), [id]);
  const participants = useAsyncData(() => listWorkPeople('PARTICIPANT'), []);
  const assignees = useAsyncData(() => (hasPermission('TIMESHEET_TASK_CREATE') || hasPermission('TIMESHEET_OPPORTUNITY_MANAGE') ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), []);
  const companies = useAsyncData(() => listCompanies('', null), []);
  const [modal, setModal] = useState<ModalKind>(null);
  const [statusFor, setStatusFor] = useState<OpportunityDetail | null>(null);
  const [message, setMessage] = useState<{ variant: 'success' | 'error'; text: string } | null>(null);

  const backLink = (
    <Link to="/timesheet/opportunities" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      Voltar às oportunidades
    </Link>
  );
  if (detail.isLoading && !detail.data) return <LoadingState label="A carregar oportunidade..." />;
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
        <EmptyState title="Oportunidade não encontrada." message="A oportunidade não existe ou não participa nela." />
      </div>
    );
  }

  const { opportunity, people, events, tasks, meetings, totals } = detail.data;
  const isOwner = opportunity.ownerId === viewerId;
  const isMember = people.some((person) => person.profileId === viewerId && !person.isOwner);
  // Espelho de private.manages_opportunity: responsável, criador, gestor do responsável ou administração.
  const manages = isOwner || opportunity.createdBy === viewerId || hasPermission('ADMIN_ACCESS') || (!isMember && hasPermission('TEAM_READ'));
  const canUpdate = hasPermission('TIMESHEET_OPPORTUNITY_UPDATE') && manages;
  const canManage = hasPermission('TIMESHEET_OPPORTUNITY_MANAGE');
  const active = isOpportunityActive(opportunity.status);
  const totalMinutes = totals.reduce((sum, row) => sum + row.totalMinutes, 0);

  const afterAction = (text: string) => {
    setModal(null);
    setStatusFor(null);
    setMessage({ variant: 'success', text });
    detail.reload();
  };

  const memberCandidates = (participants.data ?? []).filter((person) => !people.some((existing) => existing.profileId === person.profileId));

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={`${opportunity.reference} · ${opportunity.title}`}
        subtitle={`${opportunity.companyName ?? '—'} · responsável: ${opportunity.ownerName ?? '—'}`}
        actions={
          <>
            {canUpdate && (active || canManage) && (
              <Button icon={GitBranch} onClick={() => setStatusFor(opportunity)}>
                Alterar etapa
              </Button>
            )}
            {canUpdate && (
              <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')} disabled={!companies.data}>
                Editar
              </Button>
            )}
            {(isOwner || isMember) && hasPermission('SELF_TIMESHEET_UPDATE') && opportunity.status !== 'CANCELLED' && (
              <Button variant="secondary" icon={Clock3} onClick={() => setModal('logTime')}>
                Registar tempo
              </Button>
            )}
          </>
        }
      />
      {message && (
        <Alert variant={message.variant} onDismiss={() => setMessage(null)}>
          {message.text}
        </Alert>
      )}
      {opportunity.status === 'LOST' && opportunity.lostReason && (
        <Alert variant="warning" title="Oportunidade perdida">
          {opportunity.lostReason}
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <Panel>
            <div className="mb-4 flex flex-wrap items-center gap-2">
              <WorkStatusBadge kind="opportunity" status={opportunity.status} />
              {opportunity.probability !== null && <span className="text-sm text-text-secondary">Probabilidade {opportunity.probability}%</span>}
            </div>
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <Field label="Valor inicial">{formatMoney(opportunity.initialValue, opportunity.currency)}</Field>
              <Field label="Valor estimado">{formatMoney(opportunity.estimatedValue, opportunity.currency)}</Field>
              <Field label="Data esperada">{formatDate(opportunity.expectedCloseDate)}</Field>
              <Field label="Contacto">{opportunity.contactName ?? '—'}</Field>
              <Field label="Telefone">{opportunity.contactPhone ?? '—'}</Field>
              <Field label="E-mail">{opportunity.contactEmail ?? '—'}</Field>
              <Field label="Próximo passo">{opportunity.nextStep ?? '—'}</Field>
              <Field label="Data do próximo passo">{formatDate(opportunity.nextStepDate)}</Field>
              <Field label="Tempo dedicado">{formatMinutesAsHours(totalMinutes)}</Field>
            </dl>
            <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5">
              {opportunity.description && <Field label="Descrição">{opportunity.description}</Field>}
              {opportunity.problem && <Field label="Problema / oportunidade identificada">{opportunity.problem}</Field>}
              {opportunity.proposal && <Field label="Proposta">{opportunity.proposal}</Field>}
              {opportunity.notes && <Field label="Observações">{opportunity.notes}</Field>}
            </dl>
          </Panel>

          <Panel
            title="Tarefas"
            actions={
              hasPermission('TIMESHEET_TASK_CREATE') &&
              opportunity.status !== 'CANCELLED' && (
                <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setModal('task')}>
                  Criar tarefa
                </Button>
              )
            }
            flush
          >
            {tasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Nenhuma tarefa ligada a esta oportunidade.</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <Link to={`/timesheet/tasks/${task.id}`} className="text-sm font-medium text-text hover:underline">
                      {task.reference} · {task.title}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {task.assigneeName ?? 'Sem responsável'} <WorkStatusBadge kind="task" status={task.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title="Reuniões"
            actions={
              hasPermission('TIMESHEET_MEETING_CREATE') &&
              opportunity.status !== 'CANCELLED' && (
                <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setModal('meeting')} disabled={!participants.data}>
                  Marcar reunião
                </Button>
              )
            }
            flush
          >
            {meetings.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">Nenhuma reunião ligada a esta oportunidade.</p>
            ) : (
              <ul className="divide-y divide-border">
                {meetings.map((meeting) => (
                  <li key={meeting.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <Link to={`/timesheet/meetings/${meeting.id}`} className="text-sm font-medium text-text hover:underline">
                      {meeting.title}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {formatDateTime(meeting.startsAt)} <WorkStatusBadge kind="meeting" status={meeting.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Histórico e comentários" flush>
            <WorkTimeline events={events} />
            {hasPermission('TIMESHEET_OPPORTUNITY_UPDATE') && opportunity.status !== 'CANCELLED' && (
              <TicketCommentForm
                label="Novo comentário"
                allowInternal={false}
                onSubmit={async (body) => {
                  await addOpportunityComment(opportunity.id, body);
                  afterAction('Comentário registado.');
                }}
              />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel
            title="Equipa"
            actions={
              canUpdate &&
              opportunity.status !== 'CANCELLED' && (
                <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setModal('member')} disabled={!participants.data}>
                  Membro
                </Button>
              )
            }
            flush
          >
            <ul className="divide-y divide-border">
              {people.map((person) => (
                <li key={person.profileId} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="block font-medium text-text">{person.fullName}</span>
                    <span className="block text-xs text-text-muted">{person.isOwner ? 'Responsável' : 'Membro'}</span>
                  </span>
                  {canUpdate && !person.isOwner && (
                    <IconButton
                      icon={UserMinus}
                      tone="danger"
                      label={`Retirar ${person.fullName}`}
                      onClick={() =>
                        removeOpportunityMember(opportunity.id, person.profileId)
                          .then(() => afterAction('Membro retirado.'))
                          .catch((error: unknown) => setMessage({ variant: 'error', text: error instanceof Error ? error.message : 'Não foi possível retirar o membro.' }))
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
            {canManage && manages && (
              <div className="border-t border-border p-4">
                <Button size="sm" variant="ghost" icon={Users} onClick={() => setModal('owner')} disabled={!assignees.data}>
                  Alterar responsável
                </Button>
              </div>
            )}
          </Panel>
          {totals.length > 0 && (
            <Panel title="Tempo por pessoa">
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
            entityType="OPPORTUNITY"
            entityId={opportunity.id}
            viewerId={viewerId}
            canUpload={hasPermission('TIMESHEET_ATTACHMENT_CREATE') && opportunity.status !== 'CANCELLED' && (manages || isMember)}
            canRemoveOthers={hasPermission('TIMESHEET_ATTACHMENT_DELETE') && manages}
            onChanged={detail.reload}
          />
        </div>
      </div>

      <OpportunityFormModal
        isOpen={modal === 'edit'}
        opportunity={opportunity}
        companies={companies.data ?? []}
        owners={[]}
        onClose={() => setModal(null)}
        onSaved={(_opportunityId, text) => afterAction(text)}
      />
      <OpportunityStatusModal opportunity={statusFor} canManage={canManage} onClose={() => setStatusFor(null)} onSaved={afterAction} />
      <TicketSelectModal
        isOpen={modal === 'owner'}
        title="Alterar responsável"
        fieldLabel="Novo responsável"
        options={(assignees.data ?? []).map((person) => ({ value: person.profileId, label: person.fullName }))}
        initialValue={opportunity.ownerId}
        optionalNote={{ label: 'Nota (opcional)', maxLength: 1000 }}
        confirmLabel="Alterar"
        onClose={() => setModal(null)}
        onConfirm={async (ownerId, note) => {
          if (!ownerId) return;
          await setOpportunityOwner(opportunity.id, ownerId, note);
          afterAction('Responsável alterado. O novo responsável foi notificado.');
        }}
      />
      <TicketSelectModal
        isOpen={modal === 'member'}
        title="Acrescentar membro"
        fieldLabel="Colaborador"
        options={memberCandidates.map((person) => ({ value: person.profileId, label: person.departmentName ? `${person.fullName} · ${person.departmentName}` : person.fullName }))}
        initialValue=""
        confirmLabel="Acrescentar"
        onClose={() => setModal(null)}
        onConfirm={async (profileId) => {
          if (!profileId) return;
          await addOpportunityMember(opportunity.id, profileId);
          afterAction('Membro acrescentado e notificado.');
        }}
      />
      <TaskFormModal
        isOpen={modal === 'task'}
        task={null}
        assignees={assignees.data ?? []}
        links={{ opportunityId: opportunity.id }}
        contextLabel={`Tarefa da oportunidade ${opportunity.reference}.`}
        onClose={() => setModal(null)}
        onSaved={(taskId) => {
          setModal(null);
          navigate(`/timesheet/tasks/${taskId}`);
        }}
      />
      <MeetingFormModal
        isOpen={modal === 'meeting'}
        meeting={null}
        participantIds={people.filter((person) => person.profileId !== viewerId).map((person) => person.profileId)}
        people={participants.data ?? []}
        links={{ opportunityId: opportunity.id }}
        contextLabel={`Reunião da oportunidade ${opportunity.reference}.`}
        onClose={() => setModal(null)}
        onSaved={(meetingId) => {
          setModal(null);
          navigate(`/timesheet/meetings/${meetingId}`);
        }}
      />
      <WorkLogFormModal
        isOpen={modal === 'logTime'}
        employeeId={viewerId}
        preset={{ kind: 'OPPORTUNITY', contextId: opportunity.id, contextLabel: `${opportunity.reference} · ${opportunity.title}` }}
        onClose={() => setModal(null)}
        onSaved={() => afterAction('Tempo registado na oportunidade.')}
      />
    </div>
  );
};
