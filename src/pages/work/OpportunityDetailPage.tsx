import React, { useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, CalendarPlus, CheckCircle2, Clock3, GitBranch, ListPlus, Pencil, Send, Undo2, UserCog, UserMinus, UserPlus, Users, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import {
  addOpportunityComment,
  addOpportunityMember,
  cancelOpportunityApproval,
  getOpportunity,
  getOpportunityPeople,
  listCompanies,
  listOpportunityApprovals,
  listOpportunityEvents,
  removeOpportunityMember,
  setOpportunityExecutionLead,
  setOpportunityOwner,
} from '../../services/work/opportunityService';
import { listRelatedTasks } from '../../services/work/taskService';
import { listRelatedMeetings } from '../../services/work/meetingService';
import { getWorkTimeTotals } from '../../services/work/workLogService';
import { listWorkPeople } from '../../services/work/calendarService';
import type { ApprovalRequest, OpportunityDetail, OpportunityRole, WorkPerson } from '../../types/work';
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
import { ApprovalDecisionModal, RequestApprovalModal } from '../../components/work/ApprovalModals';
import { ApprovalStatusBadge } from '../../components/work/ApprovalStatusBadge';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import { canRequestOpportunityApproval, formatMoney, isOpportunityActive, OPPORTUNITY_APPROVAL_LABELS } from '../../utils/work';
import { formatDate, formatDateTime, formatMinutesAsHours } from '../../utils/format';
import { isUuid } from '../../utils/validation';
import { t, translated } from '../../lib/i18n';

type ModalKind = 'edit' | 'owner' | 'member' | 'lead' | 'task' | 'meeting' | 'logTime' | null;
type Notice = { variant: 'success' | 'warning' | 'error'; text: string };

const ROLE_LABELS: Record<OpportunityRole, string> = translated({
  OWNER: 'Responsável comercial',
  EXECUTION_LEAD: 'Gestor de execução',
  MEMBER: 'Membro',
});

/** Aviso enviado pela página anterior (ex.: equipa associada na criação). */
function readNotice(state: unknown): Notice | null {
  if (typeof state !== 'object' || state === null || !('notice' in state)) return null;
  const notice: unknown = state.notice;
  if (typeof notice !== 'object' || notice === null || !('text' in notice) || typeof notice.text !== 'string') return null;
  const variant = 'variant' in notice && (notice.variant === 'warning' || notice.variant === 'error') ? notice.variant : 'success';
  return { variant, text: notice.text };
}

async function loadOpportunity(opportunityId: string) {
  if (!isUuid(opportunityId)) return null;
  const opportunity = await getOpportunity(opportunityId);
  if (!opportunity) return null;
  const [people, events, tasks, meetings, totals, approvals] = await Promise.all([
    getOpportunityPeople(opportunityId),
    listOpportunityEvents(opportunityId),
    listRelatedTasks('opportunity_id', opportunityId),
    listRelatedMeetings('opportunity_id', opportunityId),
    getWorkTimeTotals('OPPORTUNITY', opportunityId),
    listOpportunityApprovals(opportunityId),
  ]);
  return { opportunity, people, events, tasks, meetings, totals, approvals };
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
  const location = useLocation();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const detail = useAsyncData(() => loadOpportunity(id), [id]);
  const participants = useAsyncData(() => listWorkPeople('PARTICIPANT'), []);
  const teamLeads = useAsyncData(() => (hasPermission('TIMESHEET_OPPORTUNITY_UPDATE') ? listWorkPeople('TEAM_LEAD') : Promise.resolve([])), []);
  // Convidáveis para reuniões: equipa e chefias de quem organiza (os envolvidos na oportunidade juntam-se abaixo).
  const meetingPeople = useAsyncData(() => (hasPermission('TIMESHEET_MEETING_CREATE') ? listWorkPeople('MEETING') : Promise.resolve([])), []);
  // Responsáveis de tarefas e responsável comercial são listas distintas (regras próprias no servidor).
  const assignees = useAsyncData(() => (hasPermission('TIMESHEET_TASK_CREATE') ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), []);
  const owners = useAsyncData(() => (hasPermission('TIMESHEET_OPPORTUNITY_MANAGE') ? listWorkPeople('SCOPE') : Promise.resolve([])), []);
  const companies = useAsyncData(() => listCompanies('', null), []);
  const [modal, setModal] = useState<ModalKind>(null);
  const [statusFor, setStatusFor] = useState<OpportunityDetail | null>(null);
  const [approvalFor, setApprovalFor] = useState<OpportunityDetail | null>(null);
  const [decision, setDecision] = useState<{ request: ApprovalRequest; decision: 'APPROVED' | 'REJECTED' } | null>(null);
  const [message, setMessage] = useState<Notice | null>(() => readNotice(location.state));

  const backLink = (
    <Link to="/timesheet/opportunities" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {t('Voltar às oportunidades')}
    </Link>
  );
  if (detail.isLoading && !detail.data) return <LoadingState label={t('A carregar oportunidade...')} />;
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
        <EmptyState title={t('Oportunidade não encontrada.')} message={t('A oportunidade não existe ou não participa nela.')} />
      </div>
    );
  }

  const { opportunity, people, events, tasks, meetings, totals, approvals } = detail.data;
  const pendingApproval = approvals.find((request) => request.status === 'PENDING') ?? null;
  const isOwner = opportunity.ownerId === viewerId;
  const isMember = people.some((person) => person.profileId === viewerId && !person.isOwner);
  // Espelho de private.manages_opportunity: responsável, criador, gestor do responsável ou administração.
  const manages = isOwner || opportunity.createdBy === viewerId || hasPermission('ADMIN_ACCESS') || (!isMember && hasPermission('TEAM_READ'));
  const canUpdate = hasPermission('TIMESHEET_OPPORTUNITY_UPDATE') && manages;
  const canManage = hasPermission('TIMESHEET_OPPORTUNITY_MANAGE');
  const active = isOpportunityActive(opportunity.status);
  const totalMinutes = totals.reduce((sum, row) => sum + row.totalMinutes, 0);

  const canRequestApproval = canUpdate && canRequestOpportunityApproval(opportunity.status, opportunity.approvalStatus);
  // Quem pediu e o responsável nunca decidem (o servidor confirma o âmbito do Manager).
  const canDecideApproval =
    pendingApproval !== null && hasPermission('TIMESHEET_OPPORTUNITY_APPROVE') && pendingApproval.requestedBy !== viewerId && !isOwner;
  const canCancelApproval = pendingApproval !== null && (pendingApproval.requestedBy === viewerId || canUpdate);
  const opportunityPeopleAsWorkPeople: WorkPerson[] = people
    .filter((person) => person.profileId !== viewerId)
    .map((person) => ({ profileId: person.profileId, fullName: person.fullName, jobTitle: person.jobTitle, departmentName: null }));
  const invitable = [
    ...(meetingPeople.data ?? []),
    ...opportunityPeopleAsWorkPeople.filter((person) => !(meetingPeople.data ?? []).some((existing) => existing.profileId === person.profileId)),
  ];

  const afterAction = (text: string) => {
    setModal(null);
    setStatusFor(null);
    setApprovalFor(null);
    setDecision(null);
    setMessage({ variant: 'success', text });
    detail.reload();
  };

  const memberCandidates = (participants.data ?? []).filter((person) => !people.some((existing) => existing.profileId === person.profileId));
  const executionLead = people.find((person) => person.role === 'EXECUTION_LEAD') ?? null;
  const leadCandidates = (teamLeads.data ?? []).filter((person) => person.profileId !== opportunity.ownerId);

  return (
    <div className="space-y-6">
      {backLink}
      <PageHeader
        title={`${opportunity.reference} · ${opportunity.title}`}
        subtitle={t('{companyName} · responsável: {ownerName}', { companyName: opportunity.companyName ?? '—', ownerName: opportunity.ownerName ?? '—' })}
        actions={
          <>
            {canUpdate && (active || canManage) && (
              <Button icon={GitBranch} onClick={() => setStatusFor(opportunity)}>
                {t('Alterar etapa')}
              </Button>
            )}
            {canUpdate && (
              <Button variant="secondary" icon={Pencil} onClick={() => setModal('edit')} disabled={!companies.data}>
                {t('Editar')}
              </Button>
            )}
            {(isOwner || isMember) && hasPermission('SELF_TIMESHEET_UPDATE') && opportunity.status !== 'CANCELLED' && (
              <Button variant="secondary" icon={Clock3} onClick={() => setModal('logTime')}>
                {t('Registar tempo')}
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
      {opportunity.approvalStatus === 'NOT_SUBMITTED' && active && (
        <Alert variant="info" title={t('Aprovação do Manager por pedir')}>
          {t('A oportunidade só avança para Proposta, Negociação ou Ganha depois de aprovada.')}
        </Alert>
      )}
      {opportunity.status === 'LOST' && opportunity.lostReason && (
        <Alert variant="warning" title={t('Oportunidade perdida')}>
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
              <Field label={t('Valor inicial')}>{formatMoney(opportunity.initialValue, opportunity.currency)}</Field>
              <Field label={t('Valor estimado')}>{formatMoney(opportunity.estimatedValue, opportunity.currency)}</Field>
              <Field label={t('Data esperada')}>{formatDate(opportunity.expectedCloseDate)}</Field>
              <Field label={t('Contacto')}>{opportunity.contactName ?? '—'}</Field>
              <Field label={t('Telefone')}>{opportunity.contactPhone ?? '—'}</Field>
              <Field label={t('E-mail')}>{opportunity.contactEmail ?? '—'}</Field>
              <Field label={t('Próximo passo')}>{opportunity.nextStep ?? '—'}</Field>
              <Field label={t('Data do próximo passo')}>{formatDate(opportunity.nextStepDate)}</Field>
              <Field label={t('Tempo dedicado')}>{formatMinutesAsHours(totalMinutes)}</Field>
            </dl>
            <dl className="mt-5 grid grid-cols-1 gap-4 border-t border-border pt-5">
              {opportunity.description && <Field label={t('Descrição')}>{opportunity.description}</Field>}
              {opportunity.problem && <Field label={t('Problema / oportunidade identificada')}>{opportunity.problem}</Field>}
              {opportunity.proposal && <Field label={t('Proposta')}>{opportunity.proposal}</Field>}
              {opportunity.notes && <Field label={t('Observações')}>{opportunity.notes}</Field>}
            </dl>
          </Panel>

          <Panel
            title={t('Tarefas')}
            actions={
              hasPermission('TIMESHEET_TASK_CREATE') &&
              opportunity.status !== 'CANCELLED' && (
                <Button size="sm" variant="secondary" icon={ListPlus} onClick={() => setModal('task')}>
                  {t('Criar tarefa')}
                </Button>
              )
            }
            flush
          >
            {tasks.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">{t('Nenhuma tarefa ligada a esta oportunidade.')}</p>
            ) : (
              <ul className="divide-y divide-border">
                {tasks.map((task) => (
                  <li key={task.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-3">
                    <Link to={`/timesheet/tasks/${task.id}`} className="text-sm font-medium text-text hover:underline">
                      {task.reference} · {task.title}
                    </Link>
                    <span className="flex items-center gap-2 text-xs text-text-muted">
                      {task.assigneeName ?? t('Sem responsável')} <WorkStatusBadge kind="task" status={task.status} />
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel
            title={t('Reuniões')}
            actions={
              hasPermission('TIMESHEET_MEETING_CREATE') &&
              opportunity.status !== 'CANCELLED' && (
                <Button size="sm" variant="secondary" icon={CalendarPlus} onClick={() => setModal('meeting')} disabled={!meetingPeople.data}>
                  {t('Marcar reunião')}
                </Button>
              )
            }
            flush
          >
            {meetings.length === 0 ? (
              <p className="px-5 py-4 text-sm text-text-secondary">{t('Nenhuma reunião ligada a esta oportunidade.')}</p>
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

          <Panel title={t('Histórico e comentários')} flush>
            <WorkTimeline events={events} />
            {hasPermission('TIMESHEET_OPPORTUNITY_UPDATE') && opportunity.status !== 'CANCELLED' && (
              <TicketCommentForm
                label={t('Novo comentário')}
                allowInternal={false}
                onSubmit={async (body) => {
                  await addOpportunityComment(opportunity.id, body);
                  afterAction(t('Comentário registado.'));
                }}
              />
            )}
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title={t('Aprovação')} flush>
            <div className="space-y-3 px-5 py-4">
              <p className="text-sm font-medium text-text">{OPPORTUNITY_APPROVAL_LABELS[opportunity.approvalStatus]}</p>
              {pendingApproval && (
                <p className="text-xs text-text-secondary">
                  {pendingApproval.reference} · {pendingApproval.amount === null ? 'sem valor' : formatMoney(pendingApproval.amount, pendingApproval.currency ?? '')} · pedido em{' '}
                  {formatDateTime(pendingApproval.createdAt)}
                </p>
              )}
              <div className="flex flex-wrap gap-2">
                {canRequestApproval && (
                  <Button size="sm" icon={Send} onClick={() => setApprovalFor(opportunity)}>
                    {t('Pedir aprovação')}
                  </Button>
                )}
                {canDecideApproval && pendingApproval && (
                  <>
                    <Button size="sm" icon={CheckCircle2} onClick={() => setDecision({ request: pendingApproval, decision: 'APPROVED' })}>
                      {t('Aprovar')}
                    </Button>
                    <Button size="sm" variant="danger" icon={XCircle} onClick={() => setDecision({ request: pendingApproval, decision: 'REJECTED' })}>
                      {t('Rejeitar')}
                    </Button>
                  </>
                )}
                {canCancelApproval && pendingApproval && (
                  <Button
                    size="sm"
                    variant="ghost"
                    icon={Undo2}
                    onClick={() =>
                      cancelOpportunityApproval(pendingApproval.id, null)
                        .then(() => afterAction(t('Pedido de aprovação anulado.')))
                        .catch((error: unknown) => setMessage({ variant: 'error', text: error instanceof Error ? error.message : t('Não foi possível anular o pedido.') }))
                    }
                  >
                    {t('Anular pedido')}
                  </Button>
                )}
              </div>
            </div>
            {approvals.length > 0 && (
              <ul className="divide-y divide-border border-t border-border">
                {approvals.map((request) => (
                  <li key={request.id} className="space-y-1 px-5 py-3 text-xs">
                    <span className="flex flex-wrap items-center justify-between gap-2">
                      <span className="font-semibold text-text">{request.reference}</span>
                      <ApprovalStatusBadge status={request.status} />
                    </span>
                    <span className="block whitespace-pre-line text-text-secondary">{request.justification}</span>
                    {request.decidedAt && (
                      <span className="block text-text-muted">
                        {request.deciderName ?? 'Manager'} · {formatDateTime(request.decidedAt)}
                        {request.decisionComment ? ` · ${request.decisionComment}` : ''}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Panel>
          <Panel
            title={t('Equipa do projeto')}
            actions={
              canUpdate &&
              opportunity.status !== 'CANCELLED' && (
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" icon={UserCog} onClick={() => setModal('lead')} disabled={!teamLeads.data}>
                    {t('Gestor de execução')}
                  </Button>
                  <Button size="sm" variant="secondary" icon={UserPlus} onClick={() => setModal('member')} disabled={!participants.data}>
                    {t('Membro')}
                  </Button>
                </div>
              )
            }
            flush
          >
            <ul className="divide-y divide-border">
              {people.map((person) => (
                <li key={person.profileId} className="flex items-center justify-between gap-2 px-5 py-3 text-sm">
                  <span>
                    <span className="block font-medium text-text">{person.fullName}</span>
                    <span className={`block text-xs ${person.role === 'MEMBER' ? 'text-text-muted' : 'font-semibold text-primary-hover'}`}>
                      {ROLE_LABELS[person.role]}
                      {person.jobTitle ? ` · ${person.jobTitle}` : ''}
                    </span>
                  </span>
                  {canUpdate && !person.isOwner && (
                    <IconButton
                      icon={UserMinus}
                      tone="danger"
                      label={t('Retirar {fullName}', { fullName: person.fullName })}
                      onClick={() =>
                        removeOpportunityMember(opportunity.id, person.profileId)
                          .then(() => afterAction(t('Membro retirado.')))
                          .catch((error: unknown) => setMessage({ variant: 'error', text: error instanceof Error ? error.message : t('Não foi possível retirar o membro.') }))
                      }
                    />
                  )}
                </li>
              ))}
            </ul>
            {!executionLead && (
              <p className="border-t border-border px-5 py-3 text-xs text-text-muted">
                {t('Sem gestor de execução: a execução é coordenada pelo responsável comercial e pela sua chefia.')}
              </p>
            )}
            {canManage && manages && (
              <div className="border-t border-border p-4">
                <Button size="sm" variant="ghost" icon={Users} onClick={() => setModal('owner')} disabled={!owners.data}>
                  {t('Alterar responsável')}
                </Button>
              </div>
            )}
          </Panel>
          {totals.length > 0 && (
            <Panel title={t('Tempo por pessoa')}>
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
      <RequestApprovalModal opportunity={approvalFor} onClose={() => setApprovalFor(null)} onRequested={afterAction} />
      <ApprovalDecisionModal
        request={decision?.request ?? null}
        decision={decision?.decision ?? null}
        onClose={() => setDecision(null)}
        onDecided={afterAction}
      />
      <TicketSelectModal
        isOpen={modal === 'owner'}
        title={t('Alterar responsável')}
        fieldLabel={t('Novo responsável')}
        options={(owners.data ?? []).map((person) => ({ value: person.profileId, label: person.fullName }))}
        initialValue={opportunity.ownerId}
        optionalNote={{ label: t('Nota (opcional)'), maxLength: 1000 }}
        confirmLabel={t('Alterar')}
        onClose={() => setModal(null)}
        onConfirm={async (ownerId, note) => {
          if (!ownerId) return;
          await setOpportunityOwner(opportunity.id, ownerId, note);
          afterAction(t('Responsável alterado. O novo responsável foi notificado.'));
        }}
      />
      <TicketSelectModal
        isOpen={modal === 'lead'}
        title={t('Gestor de execução')}
        fieldLabel={t('Gestor responsável pela execução')}
        options={leadCandidates.map((person) => ({ value: person.profileId, label: person.departmentName ? `${person.fullName} · ${person.departmentName}` : person.fullName }))}
        initialValue={executionLead?.profileId ?? ''}
        emptyOptionLabel={t('Sem gestor de execução')}
        optionalNote={{ label: t('Nota (opcional)'), maxLength: 1000 }}
        confirmLabel={t('Guardar')}
        onClose={() => setModal(null)}
        onConfirm={async (profileId, note) => {
          await setOpportunityExecutionLead(opportunity.id, profileId || null, note);
          afterAction(
            profileId
              ? executionLead ? t('Gestor de execução definido e notificado. {name} continua na equipa como membro.', { name: executionLead.fullName }) : t('Gestor de execução definido e notificado.')
              : t('Gestor de execução retirado. A pessoa continua na equipa como membro.')
          );
        }}
      />
      <TicketSelectModal
        isOpen={modal === 'member'}
        title={t('Acrescentar membro')}
        fieldLabel={t('Colaborador')}
        options={memberCandidates.map((person) => ({ value: person.profileId, label: person.departmentName ? `${person.fullName} · ${person.departmentName}` : person.fullName }))}
        initialValue=""
        confirmLabel={t('Acrescentar')}
        onClose={() => setModal(null)}
        onConfirm={async (profileId) => {
          if (!profileId) return;
          await addOpportunityMember(opportunity.id, profileId);
          afterAction(t('Membro acrescentado e notificado.'));
        }}
      />
      <TaskFormModal
        isOpen={modal === 'task'}
        task={null}
        assignees={assignees.data ?? []}
        links={{ opportunityId: opportunity.id }}
        canRequestManagerReview={hasPermission('TIMESHEET_TASK_ASSIGN') && !hasPermission('TEAM_SUPERVISE')}
        contextLabel={t('Tarefa da oportunidade {reference}.', { reference: opportunity.reference })}
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
        people={invitable}
        links={{ opportunityId: opportunity.id }}
        contextLabel={t('Reunião da oportunidade {reference}.', { reference: opportunity.reference })}
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
        onSaved={() => afterAction(t('Tempo registado na oportunidade.'))}
      />
    </div>
  );
};
