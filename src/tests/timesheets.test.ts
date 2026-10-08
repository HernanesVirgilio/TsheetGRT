// Testes das regras puras de timesheets (formulários, agregações da equipa).
// As regras de autorização e de estado são testadas contra o PostgreSQL em supabase/tests.
import type { TimesheetSummary } from '../types';
import {
  calculateEntryMinutes,
  describeReviewer,
  lastActivityAt,
  latestTimesheetByEmployee,
  summarizeTimesheets,
  validateEntryForm,
  validatePeriod,
  validateRejectionReason,
} from '../utils/timesheets';
import { hasErrors } from '../utils/validation';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

console.log('\nCálculo de horas');
assert(calculateEntryMinutes('08:00', '17:00', 60) === 480, '08:00–17:00 com 60 min de pausa = 480 min');
assert(calculateEntryMinutes('08:00', '17:30', 60) === 510, '08:00–17:30 com 60 min de pausa = 510 min');
assert(calculateEntryMinutes('08:00:00', '12:00:00', 0) === 240, 'aceita HH:MM:SS (formato da coluna TIME)');
assert(calculateEntryMinutes('', '12:00', 0) === 0, 'horas em falta resultam em 0');

console.log('\nFormulário de registo de horas');
const period = { start: '2026-10-01', end: '2026-10-31' };
const validEntry = {
  workDate: '2026-10-05',
  activityId: 'a1',
  startTime: '08:00',
  endTime: '17:00',
  breakMinutes: '60',
  description: 'Reconciliação bancária',
};
assert(!hasErrors(validateEntryForm(validEntry, period)), 'registo válido');
assert(Boolean(validateEntryForm({ ...validEntry, workDate: '2026-11-01' }, period).workDate), 'data fora do período rejeitada');
assert(Boolean(validateEntryForm({ ...validEntry, endTime: '07:00' }, period).endTime), 'fim antes do início rejeitado');
assert(Boolean(validateEntryForm({ ...validEntry, breakMinutes: '600' }, period).breakMinutes), 'pausa maior que o trabalho rejeitada');
assert(Boolean(validateEntryForm({ ...validEntry, breakMinutes: '-5' }, period).breakMinutes), 'pausa negativa rejeitada');
assert(Boolean(validateEntryForm({ ...validEntry, description: '  ' }, period).description), 'descrição obrigatória');
assert(Boolean(validateEntryForm({ ...validEntry, activityId: '' }, period).activityId), 'atividade obrigatória');

console.log('\nPeríodo e rejeição');
assert(!hasErrors(validatePeriod('2026-10-01', '2026-10-31')), 'período válido');
assert(Boolean(validatePeriod('2026-10-31', '2026-10-01').periodEnd), 'fim anterior ao início rejeitado');
assert(validateRejectionReason('   ') !== null, 'motivo de rejeição obrigatório');
assert(validateRejectionReason('x'.repeat(1001)) !== null, 'motivo de rejeição limitado a 1000 carateres');
assert(validateRejectionReason('Falta o dia 6') === null, 'motivo válido');

console.log('\nAgregações da equipa');
const base: TimesheetSummary = {
  id: 't1',
  employeeId: 'ana',
  employeeName: 'Ana',
  employeeNumber: 'SIH-0001',
  departmentId: 'ops',
  departmentName: 'Operações',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  status: 'APPROVED',
  submittedAt: '2026-10-01T08:00:00Z',
  approvedAt: '2026-10-02T09:00:00Z',
  rejectedAt: null,
  rejectionReason: null,
  entryCount: 20,
  totalMinutes: 9600,
};
const team: TimesheetSummary[] = [
  base,
  { ...base, id: 't2', periodStart: '2026-10-01', periodEnd: '2026-10-31', status: 'SUBMITTED', approvedAt: null, submittedAt: '2026-11-01T08:00:00Z', totalMinutes: 480 },
  { ...base, id: 't3', employeeId: 'bruno', employeeName: 'Bruno', status: 'REJECTED', approvedAt: null, rejectedAt: '2026-10-03T10:00:00Z', totalMinutes: 240 },
  { ...base, id: 't4', employeeId: 'carla', employeeName: 'Carla', status: 'DRAFT', submittedAt: null, approvedAt: null, totalMinutes: 60 },
];
const totals = summarizeTimesheets(team);
assert(totals.submittedCount === 1 && totals.approvedCount === 1 && totals.rejectedCount === 1 && totals.draftCount === 1, 'contagem por estado');
assert(totals.totalMinutes === 10380, 'total de minutos registados');
assert(totals.approvedMinutes === 9600 && totals.pendingMinutes === 480, 'minutos aprovados e por validar');
assert(summarizeTimesheets([]).totalMinutes === 0, 'equipa sem timesheets resulta em zeros');

const latest = latestTimesheetByEmployee(team);
assert(latest.get('ana')?.id === 't2', 'timesheet mais recente por colaborador');
assert(latest.size === 3, 'um timesheet por colaborador');
assert(lastActivityAt(team[2]) === '2026-10-03T10:00:00Z', 'última atividade = data mais recente de submissão/decisão');
assert(lastActivityAt(team[3]) === null, 'rascunho sem submissão não tem atividade');

console.log('\nGestor responsável');
assert(
  describeReviewer({ name: 'Gestora Operações', jobTitle: 'Diretora', email: 'g@x.com' }) === 'Gestora Operações (Diretora)',
  'nome e cargo de quem decidiu'
);
assert(describeReviewer({ name: 'Gestora Operações', jobTitle: null, email: null }) === 'Gestora Operações', 'sem cargo mostra só o nome');
assert(describeReviewer(null) === 'gestor responsável', 'sem dados do decisor usa texto neutro');

console.log(`\n${passed} testes passaram.`);
