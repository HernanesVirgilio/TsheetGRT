// Testes das regras puras do Timesheet Core (atraso, ações visíveis, formulários, calendário).
// A autorização e as transições de estado são testadas contra o PostgreSQL em
// supabase/tests/timesheet-core.security.test.ts.
import type { TaskStatus } from '../types/work';
import {
  combineDateTime,
  compareTasksForToday,
  describeWorkEvent,
  formatFileSize,
  formatMoney,
  isCommentEvent,
  isTaskDueWithin,
  isTaskOverdue,
  itemOccursOn,
  monthGrid,
  nextOpportunityStatuses,
  opportunityStatusNeedsNote,
  parseAmount,
  requiresLateReason,
  startOfWeek,
  taskActions,
  toDateInput,
  validateAbsenceForm,
  validateCompanyForm,
  validateMeetingForm,
  validateOpportunityForm,
  validateReason,
  validateTaskForm,
  validateWorkLogForm,
} from '../utils/work';
import type { TaskViewer } from '../utils/work';
import { hasErrors } from '../utils/validation';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

const now = new Date('2026-10-08T10:00:00Z');
const past = '2026-10-07T17:00:00Z';
const future = '2026-10-09T17:00:00Z';

console.log('\nAtraso (calculado, sem estado OVERDUE)');
assert(isTaskOverdue({ status: 'IN_PROGRESS', dueAt: past }, now), 'em curso com prazo ultrapassado está atrasada');
assert(isTaskOverdue({ status: 'BLOCKED', dueAt: past }, now), 'bloqueada com prazo ultrapassado está atrasada');
assert(!isTaskOverdue({ status: 'COMPLETED', dueAt: past }, now), 'concluída não está atrasada');
assert(!isTaskOverdue({ status: 'CANCELLED', dueAt: past }, now), 'cancelada não está atrasada');
assert(!isTaskOverdue({ status: 'IN_PROGRESS', dueAt: null }, now), 'sem prazo nunca está atrasada');
assert(!isTaskOverdue({ status: 'ASSIGNED', dueAt: future }, now), 'prazo futuro não está atrasada');
assert(isTaskDueWithin({ status: 'ASSIGNED', dueAt: '2026-10-08T12:00:00Z' }, now, 4), 'prazo dentro de 4 h');
assert(!isTaskDueWithin({ status: 'ASSIGNED', dueAt: past }, now, 4), 'prazo ultrapassado não conta como "a terminar"');
assert(requiresLateReason({ dueAt: past }, now) && !requiresLateReason({ dueAt: future }, now), 'motivo de atraso só depois do prazo');

console.log('\nOrdem de trabalho do dia');
const ordered = [
  { id: 'low-future', status: 'ASSIGNED' as TaskStatus, dueAt: '2026-10-20T10:00:00Z', priority: 'LOW' as const },
  { id: 'no-due', status: 'IN_PROGRESS' as TaskStatus, dueAt: null, priority: 'CRITICAL' as const },
  { id: 'overdue', status: 'IN_PROGRESS' as TaskStatus, dueAt: past, priority: 'LOW' as const },
  { id: 'soon', status: 'ASSIGNED' as TaskStatus, dueAt: future, priority: 'MEDIUM' as const },
].sort((first, second) => compareTasksForToday(first, second, now));
assert(ordered.map((task) => task.id).join(',') === 'overdue,soon,low-future,no-due', 'atrasadas primeiro, depois prazo mais próximo, sem prazo no fim');

console.log('\nAções visíveis por papel e estado');
const viewer = (overrides: Partial<TaskViewer['permissions']> = {}, managesTask = false): TaskViewer => ({
  profileId: 'ana',
  managesTask,
  permissions: { update: true, create: false, assign: false, reopen: false, logTime: true, ...overrides },
});
const employeeOnAssigned = taskActions({ status: 'ASSIGNED', assigneeId: 'ana' }, viewer());
assert(employeeOnAssigned.canStart && !employeeOnAssigned.canComplete, 'responsável inicia antes de concluir');
assert(!employeeOnAssigned.canAssign && !employeeOnAssigned.canCancel && !employeeOnAssigned.canReopen, 'colaborador não atribui, cancela nem reabre');
const employeeInProgress = taskActions({ status: 'IN_PROGRESS', assigneeId: 'ana' }, viewer());
assert(employeeInProgress.canComplete && employeeInProgress.canBlock && employeeInProgress.canLogTime, 'em curso: concluir, bloquear, registar tempo');
const colleague = taskActions({ status: 'IN_PROGRESS', assigneeId: 'rui' }, viewer());
assert(!colleague.canStart && !colleague.canComplete && !colleague.canLogTime, 'colega não executa a tarefa de outro');
const managerView = viewer({ create: true, assign: true, reopen: true }, true);
const completedForManager = taskActions({ status: 'COMPLETED', assigneeId: 'rui' }, managerView);
assert(completedForManager.canReopen && completedForManager.canEdit && !completedForManager.canCancel, 'concluída: o gestor reabre ou edita (com motivo), não cancela');
const cancelled = taskActions({ status: 'CANCELLED', assigneeId: 'rui' }, managerView);
assert(Object.values(cancelled).every((allowed) => !allowed), 'cancelada: nenhuma ação');

console.log('\nOportunidades');
assert(nextOpportunityStatuses('PROPOSAL', false).join(',') === 'NEW,QUALIFICATION,NEGOTIATION,WON,LOST', 'responsável avança etapas, ganha ou perde');
assert(nextOpportunityStatuses('PROPOSAL', true).includes('CANCELLED'), 'gestão também cancela');
assert(nextOpportunityStatuses('WON', false).length === 0 && nextOpportunityStatuses('WON', true).join() === 'QUALIFICATION', 'fechada só reabre com gestão');
assert(opportunityStatusNeedsNote('PROPOSAL', 'LOST') && !opportunityStatusNeedsNote('PROPOSAL', 'NEGOTIATION'), 'perda exige motivo; mudança de etapa não');
assert(parseAmount('500 000,50') === 500000.5 && parseAmount('') === null && Number.isNaN(parseAmount('abc') ?? 0), 'valores em formato pt-PT');
assert(formatMoney(500000, 'MZN').endsWith('MZN') && formatMoney(null, 'MZN') === '—', 'valores com moeda');

console.log('\nFormulários');
const task = { title: 'Preparar relatório', description: '', priority: 'MEDIUM', assigneeId: '', dueDate: '2026-10-20', dueTime: '17:00', startDate: '', estimatedHours: '' };
assert(!hasErrors(validateTaskForm(task, now, { isCompleted: false, dueChanged: true })), 'tarefa válida');
assert(Boolean(validateTaskForm({ ...task, title: 'ab' }, now, { isCompleted: false, dueChanged: true }).title), 'título curto');
assert(Boolean(validateTaskForm({ ...task, dueDate: '2026-10-01' }, now, { isCompleted: false, dueChanged: true }).dueDate), 'prazo passado recusado');
assert(!hasErrors(validateTaskForm({ ...task, dueDate: '2026-10-01' }, now, { isCompleted: true, dueChanged: true })), 'tarefa concluída aceita prazo passado (correção com motivo)');
assert(Boolean(validateTaskForm({ ...task, startDate: '2026-10-25' }, now, { isCompleted: false, dueChanged: true }).startDate), 'início depois do prazo recusado');
assert(Boolean(validateTaskForm({ ...task, estimatedHours: '-1' }, now, { isCompleted: false, dueChanged: true }).estimatedHours), 'estimativa negativa recusada');
assert(validateReason('  ok  ', 'Motivo') !== null && validateReason('Prazo do cliente', 'Motivo') === null, 'motivo com mínimo de 5 carateres');

const meeting = { title: 'Apresentação', date: '2026-10-10', startTime: '10:00', endTime: '11:00', location: '', meetingUrl: '', objective: '', description: '' };
assert(!hasErrors(validateMeetingForm(meeting)), 'reunião válida');
assert(Boolean(validateMeetingForm({ ...meeting, endTime: '09:00' }).endTime), 'reunião que termina antes de começar');
assert(Boolean(validateMeetingForm({ ...meeting, meetingUrl: 'javascript:alert(1)' }).meetingUrl), 'ligação não http(s) recusada');

assert(Boolean(validateAbsenceForm({ absenceTypeId: 't', startDate: '2026-10-10', endDate: '2026-10-09', reason: '' }).endDate), 'ausência com período invertido');
assert(Boolean(validateAbsenceForm({ absenceTypeId: 't', startDate: '2026-01-01', endDate: '2027-06-01', reason: '' }).endDate), 'ausência acima de um ano');
assert(!hasErrors(validateAbsenceForm({ absenceTypeId: 't', startDate: '2026-10-10', endDate: '2026-10-10', reason: '' })), 'ausência de um dia');

assert(Boolean(validateCompanyForm({ name: 'ABC', nuit: '12345', contactName: '', phone: '', email: '', address: '', website: '', notes: '' }).nuit), 'NUIT com 9 dígitos');
const opportunity = {
  title: 'Sistema de RH', companyId: 'c', ownerId: '', contactName: '', contactPhone: '', contactEmail: '', description: '', problem: '', proposal: '',
  initialValue: '500 000', estimatedValue: '', currency: 'MZN', probability: '60', expectedCloseDate: '', nextStep: '', nextStepDate: '', notes: '',
};
assert(!hasErrors(validateOpportunityForm(opportunity)), 'oportunidade válida');
assert(Boolean(validateOpportunityForm({ ...opportunity, probability: '120' }).probability), 'probabilidade acima de 100');
assert(Boolean(validateOpportunityForm({ ...opportunity, currency: 'MT' }).currency), 'moeda com 3 letras');

const log = { workDate: '2026-10-08', startTime: '09:00', endTime: '10:30', breakMinutes: '0', activityId: 'a', kind: 'TASK', contextId: 't', description: 'Desenvolvimento' };
assert(!hasErrors(validateWorkLogForm(log, '2026-10-08')), 'registo de tempo válido');
assert(Boolean(validateWorkLogForm({ ...log, workDate: '2026-10-09' }, '2026-10-08').workDate), 'tempo em data futura recusado');
assert(Boolean(validateWorkLogForm({ ...log, contextId: '' }, '2026-10-08').contextId), 'tempo de tarefa exige a tarefa');
assert(Boolean(validateWorkLogForm({ ...log, breakMinutes: '90' }, '2026-10-08').breakMinutes), 'pausa não pode anular o tempo');
assert(Boolean(validateWorkLogForm({ ...log, kind: 'UNPLANNED', contextId: '', description: 'x' }, '2026-10-08').description), 'atividade extraordinária exige descrição');

console.log('\nCalendário');
const monday = startOfWeek(new Date(2026, 9, 8));
assert(toDateInput(monday) === '2026-10-05', 'semana começa à segunda-feira');
const grid = monthGrid(new Date(2026, 9, 15));
assert(grid.length === 42 && toDateInput(grid[0] ?? new Date()) === '2026-09-28', 'grelha mensal de 6 semanas a começar na segunda');
const allDay = { startsAt: new Date(2026, 9, 10).toISOString(), endsAt: new Date(2026, 9, 12).toISOString(), allDay: true };
assert(itemOccursOn(allDay, new Date(2026, 9, 11)) && !itemOccursOn(allDay, new Date(2026, 9, 12)), 'ausência de dia inteiro termina no início do dia seguinte');
const deadline = new Date(2026, 9, 10, 17, 0).toISOString();
assert(itemOccursOn({ startsAt: deadline, endsAt: deadline, allDay: false }, new Date(2026, 9, 10)), 'prazo pontual aparece no seu dia');
assert(combineDateTime('', '10:00') === null && combineDateTime('2026-10-10', '10:30')?.getHours() === 10, 'data e hora locais');

console.log('\nHistórico e anexos');
assert(describeWorkEvent({ eventType: 'TASK_UPDATED', field: 'due_at' }) === 'Tarefa alterada: Prazo', 'alteração descreve o campo');
assert(describeWorkEvent({ eventType: 'TASK_COMPLETED_LATE', field: 'late_reason' }) === 'Tarefa concluída com atraso', 'conclusão atrasada legível');
assert(isCommentEvent('TASK_COMMENT_ADDED') && !isCommentEvent('TASK_UPDATED'), 'comentários distinguidos dos eventos');
assert(formatFileSize(2048) === '2 KB' && formatFileSize(5 * 1024 * 1024) === '5,0 MB', 'tamanho legível');

console.log(`\n${passed} testes passaram.`);
