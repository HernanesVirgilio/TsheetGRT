// Testes das regras puras do módulo IT (prazos, histórico, ações visíveis, formulários).
// A autorização e as transições de estado são testadas contra o PostgreSQL em supabase/tests/it.security.test.ts.
import type { TicketEvent, TicketSummary } from '../types/it';
import {
  compareTicketsByUrgency,
  currentAssigneeName,
  describeTicketEvent,
  isTicketActive,
  isTicketDueSoon,
  isTicketOverdue,
  isWaitingTooLong,
  requesterActions,
  technicianActions,
  toLocalDateInput,
  toLocalDateTimeInput,
  validateAssetForm,
  validateComment,
  validateInterventionForm,
  validateRequiredText,
  validateTicketForm,
} from '../utils/it';
import { hasErrors } from '../utils/validation';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

function ticket(overrides: Partial<TicketSummary>): TicketSummary {
  return {
    id: 't1',
    reference: 'IT-0001',
    title: 'Computador não liga',
    status: 'OPEN',
    priority: 'MEDIUM',
    categoryId: 'c1',
    categoryName: 'Hardware',
    requesterId: 'emp',
    requesterName: 'Colaborador',
    departmentName: null,
    assignedTo: null,
    assigneeName: null,
    assetId: null,
    assetTag: null,
    dueAt: '2026-10-10T12:00:00Z',
    statusChangedAt: '2026-10-08T12:00:00Z',
    createdAt: '2026-10-08T12:00:00Z',
    updatedAt: '2026-10-08T12:00:00Z',
    ...overrides,
  };
}

function event(overrides: Partial<TicketEvent>): TicketEvent {
  return {
    id: 'e1',
    actorId: null,
    actorName: 'Técnico',
    eventType: 'CREATED',
    oldValue: null,
    newValue: null,
    note: null,
    isInternal: false,
    createdAt: '2026-10-08T12:00:00Z',
    ...overrides,
  };
}

console.log('\nEstados e prazos');
assert(isTicketActive('OPEN') && isTicketActive('IN_PROGRESS') && isTicketActive('WAITING_USER'), 'aberto, em atendimento e a aguardar estão em curso');
assert(!isTicketActive('RESOLVED') && !isTicketActive('CLOSED'), 'resolvido e fechado não estão em curso');
const afterDue = new Date('2026-10-11T00:00:00Z');
const beforeDue = new Date('2026-10-09T00:00:00Z');
assert(isTicketOverdue(ticket({ status: 'OPEN' }), afterDue), 'aberto após o prazo está em atraso');
assert(isTicketOverdue(ticket({ status: 'IN_PROGRESS' }), afterDue), 'em atendimento após o prazo está em atraso');
assert(!isTicketOverdue(ticket({ status: 'OPEN' }), beforeDue), 'antes do prazo não está em atraso');
assert(!isTicketOverdue(ticket({ status: 'WAITING_USER' }), afterDue), 'a aguardar o colaborador não conta como atraso do IT');
assert(!isTicketOverdue(ticket({ status: 'RESOLVED' }), afterDue), 'resolvido não está em atraso');
assert(isTicketDueSoon(ticket({ status: 'OPEN' }), new Date('2026-10-10T09:00:00Z')), 'prazo a terminar dentro de 4 h é sinalizado');
assert(!isTicketDueSoon(ticket({ status: 'OPEN' }), new Date('2026-10-10T07:00:00Z')), 'prazo a mais de 4 h não é sinalizado');
assert(!isTicketDueSoon(ticket({ status: 'OPEN' }), afterDue), 'prazo já ultrapassado não conta como "a terminar"');
assert(!isTicketDueSoon(ticket({ status: 'WAITING_USER' }), new Date('2026-10-10T09:00:00Z')), 'a aguardar o colaborador não é sinalizado pelo prazo');
assert(isWaitingTooLong(ticket({ status: 'WAITING_USER' }), 3, new Date('2026-10-12T12:00:01Z')), 'espera acima do limite de dias é sinalizada');
assert(!isWaitingTooLong(ticket({ status: 'WAITING_USER' }), 3, new Date('2026-10-11T12:00:00Z')), 'espera dentro do limite não é sinalizada');
assert(!isWaitingTooLong(ticket({ status: 'IN_PROGRESS' }), 3, new Date('2026-10-20T00:00:00Z')), 'só pedidos a aguardar o colaborador contam');

console.log('\nOrdenação da fila');
const queue = [
  ticket({ id: 'low', priority: 'LOW', createdAt: '2026-10-01T00:00:00Z' }),
  ticket({ id: 'crit-new', priority: 'CRITICAL', createdAt: '2026-10-05T00:00:00Z' }),
  ticket({ id: 'crit-old', priority: 'CRITICAL', createdAt: '2026-10-02T00:00:00Z' }),
  ticket({ id: 'high', priority: 'HIGH', createdAt: '2026-10-01T00:00:00Z' }),
].sort(compareTicketsByUrgency);
assert(queue.map((item) => item.id).join(',') === 'crit-old,crit-new,high,low', 'mais urgente primeiro; na mesma prioridade, o mais antigo');

console.log('\nHistórico');
assert(describeTicketEvent(event({ eventType: 'ASSIGNED', newValue: 'Técnico IT' })) === 'Atribuído a Técnico IT', 'atribuição mostra o técnico');
assert(
  describeTicketEvent(event({ eventType: 'STATUS_CHANGED', oldValue: 'Aberto', newValue: 'Em atendimento' })) === 'Estado: Aberto → Em atendimento',
  'mudança de estado mostra valor anterior e novo'
);
assert(describeTicketEvent(event({ eventType: 'COMMENTED', isInternal: true })) === 'Nota interna adicionada', 'nota interna identificada');
const assignments = [
  event({ id: 'a', eventType: 'ASSIGNED', newValue: 'Primeiro' }),
  event({ id: 'b', eventType: 'STATUS_CHANGED' }),
  event({ id: 'c', eventType: 'ASSIGNED', newValue: 'Segundo' }),
  event({ id: 'd', eventType: 'COMMENTED' }),
];
assert(currentAssigneeName(assignments) === 'Segundo', 'técnico atual = última atribuição');
assert(currentAssigneeName([event({})]) === null, 'sem atribuições não há técnico');

console.log('\nAções do técnico');
const manage = { manage: true, assign: true };
const openActions = technicianActions(ticket({ status: 'OPEN' }), 'tech', manage);
assert(openActions.canTake && openActions.canResolve && openActions.canWaitForUser, 'pedido aberto: assumir, resolver, pedir informação');
assert(!openActions.canClose && !openActions.canReopen, 'pedido aberto não se fecha nem reabre');
const mine = technicianActions(ticket({ status: 'IN_PROGRESS', assignedTo: 'tech' }), 'tech', manage);
assert(!mine.canTake, 'não assume um pedido em que já é responsável');
const resolved = technicianActions(ticket({ status: 'RESOLVED', assignedTo: 'tech' }), 'tech', manage);
assert(resolved.canClose && resolved.canReopen && !resolved.canResolve && !resolved.canEditClassification, 'resolvido: fechar ou reabrir');
const closed = technicianActions(ticket({ status: 'CLOSED' }), 'tech', manage);
assert(closed.canReopen && !closed.canComment && !closed.canClose, 'fechado: só reabrir, sem comentários');
const readOnly = technicianActions(ticket({ status: 'OPEN' }), 'tech', { manage: false, assign: false });
assert(Object.values(readOnly).every((value) => !value), 'sem permissão de gestão não há ações');
assert(!technicianActions(ticket({ status: 'OPEN' }), 'tech', { manage: true, assign: false }).canAssign, 'atribuir exige permissão própria');

console.log('\nAções do colaborador');
assert(requesterActions('RESOLVED').canConfirmResolution && requesterActions('RESOLVED').canReopen, 'resolvido: confirmar ou reabrir');
assert(!requesterActions('CLOSED').canReopen && !requesterActions('CLOSED').canReply, 'fechado: sem reabertura nem respostas');
assert(requesterActions('WAITING_USER').canReply && !requesterActions('WAITING_USER').canReopen, 'a aguardar: pode responder');

console.log('\nFormulário de pedido');
const validTicket = { title: 'Impressora não imprime', description: 'Desde ontem que fica em fila.', categoryId: 'c1', priority: 'MEDIUM' };
assert(!hasErrors(validateTicketForm(validTicket)), 'pedido válido');
assert(Boolean(validateTicketForm({ ...validTicket, title: 'Ups ' }).title), 'título com menos de 5 carateres');
assert(Boolean(validateTicketForm({ ...validTicket, description: 'curta' }).description), 'descrição com menos de 10 carateres');
assert(Boolean(validateTicketForm({ ...validTicket, description: 'x'.repeat(5001) }).description), 'descrição acima de 5000 carateres');
assert(Boolean(validateTicketForm({ ...validTicket, categoryId: '' }).categoryId), 'categoria obrigatória');

console.log('\nTextos das ações');
assert(validateRequiredText('   ok   ', 'Resolução', 5, 2000) !== null, 'espaços não contam para o mínimo');
assert(validateRequiredText('Trocado o cabo', 'Resolução', 5, 2000) === null, 'texto válido');
assert(validateRequiredText('x'.repeat(1001), 'Motivo', 5, 1000) !== null, 'máximo respeitado');
assert(validateComment('   ') !== null && validateComment('Obrigado') === null, 'comentário não pode estar vazio');

console.log('\nFormulário de equipamento');
const validAsset = {
  assetTag: '',
  assetType: 'LAPTOP',
  brand: 'Lenovo',
  model: 'ThinkPad',
  serialNumber: 'SN1',
  status: 'ACTIVE',
  assignedTo: 'emp',
  departmentId: '',
  location: '',
  acquiredOn: '2026-01-10',
  notes: '',
};
const today = '2026-10-08';
assert(!hasErrors(validateAssetForm(validAsset, today)), 'equipamento válido (código gerado pelo servidor)');
assert(Boolean(validateAssetForm({ ...validAsset, assetTag: 'si it 1' }, today).assetTag), 'código com espaços é recusado');
assert(!hasErrors(validateAssetForm({ ...validAsset, assetTag: 'si-it-0100' }, today)), 'código em minúsculas é normalizado');
assert(Boolean(validateAssetForm({ ...validAsset, status: 'IN_STOCK' }, today).assignedTo), 'equipamento em stock não tem utilizador');
assert(!hasErrors(validateAssetForm({ ...validAsset, status: 'LOST' }, today)), 'equipamento perdido mantém o responsável');
assert(Boolean(validateAssetForm({ ...validAsset, acquiredOn: '2026-10-09' }, today).acquiredOn), 'data de aquisição futura');

console.log('\nFormulário de intervenção');
const now = new Date('2026-10-08T15:00:00');
const validIntervention = {
  performedAt: '2026-10-08T14:00',
  problemDescription: 'Disco cheio',
  workPerformed: 'Limpeza de ficheiros temporários',
  outcome: 'RESOLVED',
  notes: '',
};
assert(!hasErrors(validateInterventionForm(validIntervention, now)), 'intervenção válida');
assert(Boolean(validateInterventionForm({ ...validIntervention, performedAt: '2026-10-08T16:00' }, now).performedAt), 'data futura recusada');
assert(Boolean(validateInterventionForm({ ...validIntervention, workPerformed: 'ok' }, now).workPerformed), 'trabalho realizado obrigatório');
assert(Boolean(validateInterventionForm({ ...validIntervention, outcome: '' }, now).outcome), 'resultado obrigatório');

console.log('\nDatas locais dos formulários');
const local = new Date(2026, 0, 5, 9, 7);
assert(toLocalDateInput(local) === '2026-01-05', 'data local AAAA-MM-DD');
assert(toLocalDateTimeInput(local) === '2026-01-05T09:07', 'data e hora local AAAA-MM-DDTHH:MM');

console.log(`\n${passed} testes passaram.`);
