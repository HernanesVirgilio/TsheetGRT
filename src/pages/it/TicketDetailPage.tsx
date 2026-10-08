import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CheckCircle2,
  FolderTree,
  Gauge,
  Hand,
  Laptop,
  Lock,
  PauseCircle,
  Play,
  RotateCcw,
  UserPlus,
  Wrench,
} from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import {
  addTicketComment,
  assignTicket,
  changeTicketStatus,
  closeTicket,
  getTicket,
  getTicketTimeline,
  listTechnicians,
  listTicketCategories,
  reopenTicket,
  resolveTicket,
  setTicketAsset,
  takeTicket,
  updateTicketCategory,
  updateTicketPriority,
} from '../../services/itTicketService';
import { listAssets, listInterventions } from '../../services/itAssetService';
import { isTicketPriority, TICKET_PRIORITIES } from '../../types/it';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { TicketInfoPanel } from '../../components/it/TicketInfoPanel';
import { TicketTimeline } from '../../components/it/TicketTimeline';
import { TicketCommentForm } from '../../components/it/TicketCommentForm';
import { TicketNoteModal, TicketSelectModal } from '../../components/it/TicketActionModals';
import type { SelectOption } from '../../components/it/TicketActionModals';
import { InterventionFormModal } from '../../components/it/InterventionFormModal';
import { InterventionsTable } from '../../components/it/InterventionsTable';
import {
  ASSET_TYPE_LABELS,
  currentAssigneeName,
  requesterActions,
  technicianActions,
  TICKET_PRIORITY_LABELS,
} from '../../utils/it';
import { isUuid } from '../../utils/validation';

type ModalKind = 'resolve' | 'wait' | 'close' | 'reopen' | 'assign' | 'priority' | 'category' | 'asset' | 'intervention';

interface TicketDetailPageProps {
  /** "support": vista do colaborador (próprios pedidos); "it": vista da equipa de IT. */
  context: 'support' | 'it';
}

const NO_OPTIONS: SelectOption[] = [];

async function loadTicket(ticketId: string) {
  if (!isUuid(ticketId)) return null;
  const ticket = await getTicket(ticketId);
  if (!ticket) return null;
  const timeline = await getTicketTimeline(ticketId);
  return { ticket, timeline };
}

/**
 * Detalhe de um pedido de suporte. As ações apresentadas dependem das permissões e do estado,
 * mas cada uma é validada de novo pelas funções do servidor (permissão, transição e âmbito).
 */
export const TicketDetailPage: React.FC<TicketDetailPageProps> = ({ context }) => {
  const { id = '' } = useParams<{ id: string }>();
  const { currentUser, hasPermission } = useAuth();
  const isItView = context === 'it';
  const canManage = isItView && hasPermission('IT_TICKETS_MANAGE');
  const canAssign = isItView && hasPermission('IT_TICKETS_ASSIGN');
  const canReadAssets = isItView && hasPermission('IT_ASSETS_READ');

  const detail = useAsyncData(() => loadTicket(id), [id]);
  const interventions = useAsyncData(
    () =>
      isItView && isUuid(id)
        ? listInterventions({ page: 1, pageSize: 50, ticketId: id, assetId: null, outcome: null })
        : Promise.resolve(null),
    [id, isItView]
  );
  const referenceData = useAsyncData(
    () =>
      canManage
        ? Promise.all([
            listTechnicians(),
            listTicketCategories(),
            canReadAssets ? listAssets({ search: '', status: null, assetType: null }) : Promise.resolve([]),
          ])
        : Promise.resolve(null),
    [canManage, canReadAssets]
  );

  const [activeModal, setActiveModal] = useState<ModalKind | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isActionPending, setIsActionPending] = useState(false);

  const backLink = isItView ? { to: '/it/tickets', label: 'Voltar às solicitações' } : { to: '/support', label: 'Voltar aos meus pedidos' };
  const BackLink = (
    <Link to={backLink.to} className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
      <ArrowLeft className="h-4 w-4" aria-hidden="true" />
      {backLink.label}
    </Link>
  );

  if (detail.isLoading && !detail.data) return <LoadingState label="A carregar pedido..." />;
  if (detail.error && !detail.data) {
    return (
      <div className="space-y-4">
        {BackLink}
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="space-y-4">
        {BackLink}
        <EmptyState title="Pedido não encontrado." message="O pedido não existe ou não tem acesso a ele." />
      </div>
    );
  }

  const { ticket, timeline } = detail.data;
  const viewerId = currentUser?.id ?? '';
  const isRequester = ticket.requesterId === viewerId;
  const [technicians, categories, assets] = referenceData.data ?? [[], [], []];

  // Enquanto recarrega após uma ação, os dados podem estar desatualizados: não oferecer ações.
  const isStale = detail.isLoading;
  const tech = technicianActions(ticket, viewerId, { manage: canManage && !isStale, assign: canAssign });
  const requester = requesterActions(ticket.status);
  const requesterCanAct = !isItView && isRequester && !isStale;

  const assigneeName = ticket.assignedTo
    ? (technicians.find((technician) => technician.profileId === ticket.assignedTo)?.fullName ??
      currentAssigneeName(timeline.events))
    : null;

  const afterAction = (message: string) => {
    setActiveModal(null);
    setActionError(null);
    setSuccessMessage(message);
    detail.reload();
    interventions.reload();
  };

  const runImmediate = async (action: () => Promise<unknown>, message: string) => {
    setIsActionPending(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      await action();
      afterAction(message);
    } catch (error) {
      setActionError(getErrorMessage(error, 'Não foi possível concluir a ação.'));
    } finally {
      setIsActionPending(false);
    }
  };

  const technicianOptions: SelectOption[] = technicians.map((technician) => ({
    value: technician.profileId,
    label: technician.jobTitle ? `${technician.fullName} · ${technician.jobTitle}` : technician.fullName,
  }));
  const priorityOptions: SelectOption[] = TICKET_PRIORITIES.map((priority) => ({
    value: priority,
    label: TICKET_PRIORITY_LABELS[priority],
  }));
  const categoryOptions: SelectOption[] = categories.map((category) => ({ value: category.id, label: category.name }));
  const assetOptions: SelectOption[] = assets
    .filter((asset) => asset.status !== 'RETIRED' || asset.id === ticket.assetId)
    .map((asset) => ({
      value: asset.id,
      label: [
        asset.assetTag,
        ASSET_TYPE_LABELS[asset.assetType],
        [asset.brand, asset.model].filter(Boolean).join(' '),
        asset.assignedToName,
      ]
        .filter(Boolean)
        .join(' · '),
    }));

  // take_it_ticket atribui ao técnico e, se o pedido estiver aberto, inicia o atendimento.
  const takeLabel =
    ticket.status !== 'OPEN' ? 'Assumir pedido' : ticket.assignedTo === viewerId ? 'Iniciar atendimento' : 'Assumir e iniciar';
  const commentAllowed = isItView ? tech.canComment : requesterCanAct && requester.canReply;

  return (
    <div className="space-y-6">
      {BackLink}
      <PageHeader
        title={`${ticket.reference} · ${ticket.title}`}
        subtitle={isItView ? `Aberto por ${ticket.requesterName ?? '—'}` : 'O seu pedido de suporte à equipa de IT.'}
        actions={
          <>
            {requesterCanAct && requester.canConfirmResolution && (
              <Button icon={CheckCircle2} onClick={() => setActiveModal('close')}>
                Confirmar resolução
              </Button>
            )}
            {requesterCanAct && requester.canReopen && (
              <Button variant="secondary" icon={RotateCcw} onClick={() => setActiveModal('reopen')}>
                Reabrir
              </Button>
            )}
            {!isItView && hasPermission('IT_TICKETS_READ') && (
              <Link to={`/it/tickets/${ticket.id}`} className="text-sm font-medium text-primary-hover hover:underline">
                Abrir na fila do IT
              </Link>
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
      {detail.error && <ErrorState message={detail.error} onRetry={detail.reload} />}
      {referenceData.error && <ErrorState message={referenceData.error} onRetry={referenceData.reload} />}
      {!isItView && ticket.status === 'WAITING_USER' && (
        <Alert variant="warning" title="A equipa de IT aguarda a sua resposta">
          Responda no histórico abaixo. Ao responder, o pedido volta para a equipa de IT.
        </Alert>
      )}
      {!isItView && ticket.status === 'RESOLVED' && (
        <Alert variant="info">
          A equipa de IT deu este pedido como resolvido. Confirme a resolução para o fechar ou reabra-o se o problema persistir.
        </Alert>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TicketInfoPanel
            ticket={ticket}
            assigneeName={assigneeName}
            assetLink={canReadAssets && ticket.assetId ? `/it/assets/${ticket.assetId}` : undefined}
          />

          <Panel title="Histórico" description="Mensagens, alterações de estado e responsáveis (registo só de leitura)." flush>
            <TicketTimeline comments={timeline.comments} events={timeline.events} />
            {commentAllowed && (
              <TicketCommentForm
                label={isItView ? 'Nova mensagem' : 'Responder à equipa de IT'}
                hint={
                  !isItView && ticket.status === 'WAITING_USER'
                    ? 'A sua resposta devolve o pedido à equipa de IT.'
                    : isItView
                      ? 'As mensagens sem a opção de nota interna são visíveis para o colaborador.'
                      : undefined
                }
                allowInternal={isItView}
                onSubmit={async (body, isInternal) => {
                  await addTicketComment(ticket.id, body, isInternal);
                  afterAction(isInternal ? 'Nota interna registada.' : 'Mensagem enviada.');
                }}
              />
            )}
            {ticket.status === 'CLOSED' && (
              <p className="flex items-center gap-2 border-t border-border px-5 py-3 text-sm text-text-muted">
                <Lock className="h-4 w-4" aria-hidden="true" />
                Pedido fechado: já não aceita mensagens.
              </p>
            )}
          </Panel>

          {isItView && (
            <Panel
              title="Intervenções técnicas"
              actions={
                canManage && (
                  <Button size="sm" variant="secondary" icon={Wrench} onClick={() => setActiveModal('intervention')}>
                    Registar intervenção
                  </Button>
                )
              }
              flush
            >
              {interventions.error && (
                <div className="p-4">
                  <ErrorState message={interventions.error} onRetry={interventions.reload} />
                </div>
              )}
              {interventions.isLoading && !interventions.data && <LoadingState label="A carregar intervenções..." />}
              {interventions.data && interventions.data.items.length === 0 && (
                <p className="px-5 py-4 text-sm text-text-secondary">Ainda não foram registadas intervenções.</p>
              )}
              {interventions.data && interventions.data.items.length > 0 && (
                <InterventionsTable
                  interventions={interventions.data.items}
                  hideTicket
                  canOpenTickets
                  canOpenAssets={canReadAssets}
                />
              )}
            </Panel>
          )}
        </div>

        {canManage && (
          // No telemóvel as ações aparecem antes do histórico.
          <div className="order-first lg:order-none">
            <Panel title="Ações do técnico">
              <div className="flex flex-col gap-2">
                {tech.canTake && (
                  <Button icon={Hand} isLoading={isActionPending} onClick={() => runImmediate(() => takeTicket(ticket.id), 'Pedido atribuído a si.')}>
                    {takeLabel}
                  </Button>
                )}
                {tech.canStartWork && ticket.status === 'WAITING_USER' && (
                  <Button
                    variant="secondary"
                    icon={Play}
                    isLoading={isActionPending}
                    onClick={() => runImmediate(() => changeTicketStatus(ticket.id, 'IN_PROGRESS', null), 'Pedido em atendimento.')}
                  >
                    Retomar atendimento
                  </Button>
                )}
                {tech.canWaitForUser && (
                  <Button variant="secondary" icon={PauseCircle} onClick={() => setActiveModal('wait')}>
                    Pedir informação ao colaborador
                  </Button>
                )}
                {tech.canResolve && (
                  <Button icon={CheckCircle2} onClick={() => setActiveModal('resolve')}>
                    Resolver
                  </Button>
                )}
                {tech.canClose && (
                  <Button variant="secondary" icon={Lock} onClick={() => setActiveModal('close')}>
                    Fechar
                  </Button>
                )}
                {tech.canReopen && (
                  <Button variant="secondary" icon={RotateCcw} onClick={() => setActiveModal('reopen')}>
                    Reabrir
                  </Button>
                )}
              </div>

              {tech.canEditClassification && (
                <div className="mt-5 flex flex-col gap-2 border-t border-border pt-5">
                  <p className="text-xs font-semibold uppercase tracking-wide text-text-secondary">Classificação</p>
                  {tech.canAssign && (
                    <Button variant="ghost" icon={UserPlus} className="justify-start" disabled={!referenceData.data} onClick={() => setActiveModal('assign')}>
                      Atribuir técnico
                    </Button>
                  )}
                  <Button variant="ghost" icon={Gauge} className="justify-start" onClick={() => setActiveModal('priority')}>
                    Alterar prioridade
                  </Button>
                  <Button variant="ghost" icon={FolderTree} className="justify-start" disabled={!referenceData.data} onClick={() => setActiveModal('category')}>
                    Alterar categoria
                  </Button>
                  {canReadAssets && (
                    <Button variant="ghost" icon={Laptop} className="justify-start" disabled={!referenceData.data} onClick={() => setActiveModal('asset')}>
                      {ticket.assetId ? 'Alterar equipamento' : 'Associar equipamento'}
                    </Button>
                  )}
                </div>
              )}
            </Panel>
          </div>
        )}
      </div>

      <TicketNoteModal
        isOpen={activeModal === 'resolve'}
        title={`Resolver ${ticket.reference}`}
        description="O colaborador é notificado e pode confirmar a resolução ou reabrir o pedido."
        note={{ label: 'Resolução', minLength: 5, maxLength: 2000, hint: 'Visível para o colaborador.' }}
        confirmLabel="Marcar como resolvido"
        onClose={() => setActiveModal(null)}
        onConfirm={async (note) => {
          await resolveTicket(ticket.id, note ?? '');
          afterAction('Pedido marcado como resolvido.');
        }}
      />
      <TicketNoteModal
        isOpen={activeModal === 'wait'}
        title="Pedir informação ao colaborador"
        description="O pedido fica a aguardar o colaborador, que é notificado com esta mensagem."
        note={{ label: 'Informação pedida', minLength: 5, maxLength: 2000 }}
        confirmLabel="Aguardar colaborador"
        onClose={() => setActiveModal(null)}
        onConfirm={async (note) => {
          await changeTicketStatus(ticket.id, 'WAITING_USER', note);
          afterAction('O pedido aguarda resposta do colaborador.');
        }}
      />
      <TicketNoteModal
        isOpen={activeModal === 'close'}
        title={isItView ? `Fechar ${ticket.reference}` : 'Confirmar resolução'}
        description={
          isItView
            ? 'Um pedido fechado só pode ser reaberto pela equipa de IT.'
            : 'O pedido é fechado. Se o problema voltar a acontecer, abra um novo pedido.'
        }
        note={{ label: 'Comentário (opcional)', maxLength: 1000 }}
        confirmLabel={isItView ? 'Fechar pedido' : 'Confirmar e fechar'}
        onClose={() => setActiveModal(null)}
        onConfirm={async (note) => {
          await closeTicket(ticket.id, note);
          afterAction('Pedido fechado.');
        }}
      />
      <TicketNoteModal
        isOpen={activeModal === 'reopen'}
        title={`Reabrir ${ticket.reference}`}
        description="O pedido volta à equipa de IT com um novo prazo de resolução."
        note={{ label: 'Motivo da reabertura', minLength: 5, maxLength: 1000 }}
        confirmLabel="Reabrir pedido"
        onClose={() => setActiveModal(null)}
        onConfirm={async (note) => {
          await reopenTicket(ticket.id, note ?? '');
          afterAction('Pedido reaberto.');
        }}
      />
      <TicketSelectModal
        isOpen={activeModal === 'assign'}
        title="Atribuir técnico"
        fieldLabel="Técnico responsável"
        options={referenceData.data ? technicianOptions : NO_OPTIONS}
        initialValue={ticket.assignedTo ?? ''}
        confirmLabel="Atribuir"
        onClose={() => setActiveModal(null)}
        onConfirm={async (technicianId) => {
          if (!technicianId) return;
          await assignTicket(ticket.id, technicianId);
          afterAction('Técnico atribuído.');
        }}
      />
      <TicketSelectModal
        isOpen={activeModal === 'priority'}
        title="Alterar prioridade"
        fieldLabel="Prioridade"
        options={priorityOptions}
        initialValue={ticket.priority}
        optionalNote={{ label: 'Motivo (opcional)', maxLength: 1000 }}
        confirmLabel="Alterar prioridade"
        onClose={() => setActiveModal(null)}
        onConfirm={async (priority, reason) => {
          if (!priority || !isTicketPriority(priority)) return;
          await updateTicketPriority(ticket.id, priority, reason);
          afterAction('Prioridade alterada. O prazo de resolução foi recalculado.');
        }}
      />
      <TicketSelectModal
        isOpen={activeModal === 'category'}
        title="Alterar categoria"
        fieldLabel="Categoria"
        options={categoryOptions}
        initialValue={ticket.categoryId}
        confirmLabel="Alterar categoria"
        onClose={() => setActiveModal(null)}
        onConfirm={async (categoryId) => {
          if (!categoryId) return;
          await updateTicketCategory(ticket.id, categoryId);
          afterAction('Categoria alterada.');
        }}
      />
      <TicketSelectModal
        isOpen={activeModal === 'asset'}
        title="Equipamento associado"
        fieldLabel="Equipamento"
        options={assetOptions}
        initialValue={ticket.assetId ?? ''}
        emptyOptionLabel="Sem equipamento"
        confirmLabel="Guardar"
        onClose={() => setActiveModal(null)}
        onConfirm={async (assetId) => {
          await setTicketAsset(ticket.id, assetId);
          afterAction(assetId ? 'Equipamento associado.' : 'Equipamento removido do pedido.');
        }}
      />
      <InterventionFormModal
        isOpen={activeModal === 'intervention'}
        ticketId={ticket.id}
        assetId={ticket.assetId}
        targetLabel={ticket.assetTag ? `${ticket.reference} · ${ticket.assetTag}` : ticket.reference}
        onClose={() => setActiveModal(null)}
        onSaved={() => afterAction('Intervenção registada.')}
      />
    </div>
  );
};
