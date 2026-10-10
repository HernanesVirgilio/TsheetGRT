// Testes das regras puras da hierarquia: seleção de intervalo no calendário, grelha horária,
// aprovação de oportunidades, acompanhamento de tarefas e notificações. A autorização efetiva é
// testada contra o PostgreSQL em supabase/tests/hierarchy.security.test.ts.
import {
  CALENDAR_SLOT_COUNT,
  canRequestOpportunityApproval,
  initialMeetingValues,
  isOpportunityCleared,
  layoutTimedItems,
  nextOpportunityStatuses,
  recentPeriod,
  selectionToRange,
  slotStartTime,
  taskActions,
} from '../utils/work';
import type { TaskViewer } from '../utils/work';
import { isNotificationCategory, NOTIFICATION_CATEGORY_LABELS, safeNotificationLink } from '../utils/notifications';
import { niceMax } from '../components/charts/StackedCharts';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

console.log('\n5. Seleção de intervalo no calendário');
const day = new Date(2026, 9, 14);
assert(slotStartTime(0) === '07:00' && slotStartTime(4) === '09:00', 'fatias de 30 minutos a partir das 07:00');
const dragDown = selectionToRange(day, 4, 6);
assert(dragDown.date === '2026-10-14' && dragDown.startTime === '09:00' && dragDown.endTime === '10:30', 'arrastar das 09:00 às 10:30 preenche início 09:00 e fim 10:30');
const dragUp = selectionToRange(day, 6, 4);
assert(dragUp.startTime === '09:00' && dragUp.endTime === '10:30', 'arrastar para cima dá o mesmo intervalo');
const singleClick = selectionToRange(day, 10, 10);
assert(singleClick.startTime === '12:00' && singleClick.endTime === '12:30', 'um clique seleciona uma fatia de 30 minutos');
const clamped = selectionToRange(day, -3, CALENDAR_SLOT_COUNT + 5);
assert(clamped.startTime === '07:00' && clamped.endTime === '21:00', 'a seleção não sai do horário da grelha');
const prefilled = initialMeetingValues(null, '2026-10-01', dragDown);
assert(
  prefilled.date === '2026-10-14' && prefilled.startTime === '09:00' && prefilled.endTime === '10:30',
  'o formulário de reunião abre com a data e as horas selecionadas'
);
const fallback = initialMeetingValues(null, '2026-10-01', null);
assert(fallback.date === '2026-10-01' && fallback.startTime === '10:00', 'sem seleção, usa o dia em vista e o horário por omissão');

console.log('\nGrelha horária');
const at = (hours: number, minutes = 0) => new Date(2026, 9, 14, hours, minutes).toISOString();
const layout = layoutTimedItems(
  [
    { id: 'a', startsAt: at(9), endsAt: at(10) },
    { id: 'b', startsAt: at(9, 30), endsAt: at(11) },
    { id: 'c', startsAt: at(12), endsAt: at(12, 30) },
    { id: 'deadline', startsAt: at(17), endsAt: at(17) },
  ],
  day
);
const byId = (id: string) => layout.find((entry) => entry.item.id === id);
assert(byId('a')?.top === 120 && byId('a')?.height === 60, 'posição em minutos desde as 07:00');
assert(byId('a')?.lanes === 2 && byId('b')?.lanes === 2 && byId('a')?.lane !== byId('b')?.lane, 'itens sobrepostos ficam lado a lado');
assert(byId('c')?.lanes === 1, 'itens sem sobreposição ocupam a coluna inteira');
assert((byId('deadline')?.height ?? 0) >= 15, 'prazos pontuais têm altura mínima visível');

console.log('\n15. Aprovação de oportunidades');
assert(!isOpportunityCleared('NOT_SUBMITTED') && !isOpportunityCleared('PENDING') && !isOpportunityCleared('REJECTED'), 'sem aprovação, a oportunidade não está liberada');
assert(isOpportunityCleared('APPROVED') && isOpportunityCleared('NOT_REQUIRED'), 'aprovada (ou sem exigência) está liberada');
const blocked = nextOpportunityStatuses('QUALIFICATION', false, 'NOT_SUBMITTED');
assert(!blocked.includes('PROPOSAL') && !blocked.includes('NEGOTIATION') && !blocked.includes('WON'), 'sem aprovação, não avança para proposta, negociação ou ganha');
assert(blocked.includes('NEW') && blocked.includes('LOST'), 'pode recuar ou dar como perdida sem aprovação');
assert(nextOpportunityStatuses('QUALIFICATION', false, 'APPROVED').includes('PROPOSAL'), 'aprovada, avança para proposta');
assert(canRequestOpportunityApproval('NEW', 'NOT_SUBMITTED') && canRequestOpportunityApproval('QUALIFICATION', 'REJECTED'), 'pode pedir aprovação (ou voltar a pedir depois de rejeitada)');
assert(!canRequestOpportunityApproval('NEW', 'PENDING') && !canRequestOpportunityApproval('WON', 'NOT_SUBMITTED'), 'não pede com pedido pendente nem em oportunidade fechada');

console.log('\nAcompanhamento de tarefas');
const viewer = (overrides: Partial<TaskViewer['permissions']>, managesTask: boolean, profileId = 'gestor'): TaskViewer => ({
  profileId,
  managesTask,
  permissions: { update: true, create: true, assign: true, reopen: true, logTime: true, supervise: false, ...overrides },
});
const completed = { status: 'COMPLETED' as const, assigneeId: 'ana', requiresManagerReview: false, reviewedAt: null };
assert(taskActions(completed, viewer({}, true)).canReview, 'o gestor da tarefa valida a conclusão');
assert(!taskActions(completed, viewer({}, true, 'ana')).canReview, 'o responsável não valida a própria conclusão');
assert(!taskActions({ ...completed, reviewedAt: '2026-10-10T10:00:00Z' }, viewer({}, true)).canReview, 'uma conclusão validada não se valida de novo');
const escalated = { ...completed, requiresManagerReview: true };
assert(!taskActions(escalated, viewer({}, true)).canReview, 'o gestor não valida uma conclusão reservada ao Manager');
assert(taskActions(escalated, viewer({ supervise: true }, true, 'manager')).canReview, 'o Manager valida a conclusão que exige o seu acompanhamento');
assert(!taskActions({ ...completed, status: 'IN_PROGRESS' }, viewer({}, true)).canReview, 'só se validam tarefas concluídas');

console.log('\nNotificações');
assert(isNotificationCategory('APPROVAL_REQUEST') && !isNotificationCategory('OUTRA'), 'categorias reconhecidas');
assert(Object.keys(NOTIFICATION_CATEGORY_LABELS).length === 5, 'cinco categorias: informação, conclusão, pedido, prazo e decisão');
assert(safeNotificationLink('/timesheet/tasks/abc') === '/timesheet/tasks/abc', 'ligação interna aceite');
assert(safeNotificationLink('/timesheet/absences?tab=TEAM') === '/timesheet/absences?tab=TEAM', 'ligação interna com parâmetros aceite');
assert(safeNotificationLink('https://exemplo.com') === null && safeNotificationLink('//exemplo.com') === null, 'ligações externas recusadas');
assert(safeNotificationLink('javascript:alert(1)') === null && safeNotificationLink(null) === null, 'esquemas perigosos recusados');

console.log('\nPainéis');
const period = recentPeriod(30, new Date(2026, 9, 30));
assert(period.from === '2026-10-01' && period.to === '2026-10-30', 'período dos últimos 30 dias inclui hoje');
assert(niceMax(7) === 10 && niceMax(13) === 20 && niceMax(0) === 1 && niceMax(450) === 500, 'escala dos gráficos arredondada (1, 2, 5 × 10ⁿ)');

console.log(`\n${passed} testes passaram.`);
