import { dataService, calculateMinutesBetween, formatMinutesToHours } from '../services/dataService';
import { INITIAL_PROFILES } from '../lib/supabase/mockData';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
}

export function runAllBehaviorTests() {
  console.log('=== REGRAS DE TIMESHEET (camada mock, fora do âmbito Admin) ===');

  // Test 3: Time calculation rules
  const minutesNormal = calculateMinutesBetween('08:00', '17:00', 60);
  assert(minutesNormal === 480, 'Cálculo de 08:00 às 17:00 com 60 min de pausa = 480 min (8h 00m)');
  assert(formatMinutesToHours(minutesNormal) === '8h 00m', 'Formatação para horas = 8h 00m');

  const minutesWithOvertime = calculateMinutesBetween('08:00', '17:30', 60);
  assert(minutesWithOvertime === 510, 'Cálculo de 08:00 às 17:30 com 60 min de pausa = 510 min (8h 30m)');
  assert(formatMinutesToHours(minutesWithOvertime) === '8h 30m', 'Formatação = 8h 30m');

  // Test 5: Timesheet creation & entry validation
  const colabUser = INITIAL_PROFILES[3]; // colaborador
  const newTs = dataService.createTimesheet(colabUser.id, '2026-12-01', '2026-12-31');
  assert(newTs.status === 'DRAFT', 'Novo timesheet é criado em estado DRAFT');

  const newEntry = dataService.saveTimesheetEntry({
    timesheet_id: newTs.id,
    employee_id: colabUser.id,
    work_date: '2026-12-01',
    activity_id: 'act-01',
    start_time: '08:00',
    end_time: '17:00',
    break_minutes: 60,
    description: 'Teste de apontamento operacional',
  });
  assert(newEntry.total_minutes === 480, 'Registo gravado com 480 minutos calculados');

  // Test 6: Timesheet submission
  const submittedTs = dataService.submitTimesheet(newTs.id, colabUser.id);
  assert(submittedTs.status === 'SUBMITTED', 'Timesheet após envio passa a estado SUBMITTED');
  assert(submittedTs.submitted_at !== null, 'Data de submissão é preenchida');

  // Test 7: Employee cannot approve own timesheet
  let caughtSelfApproval = false;
  try {
    dataService.approveTimesheet(submittedTs.id, colabUser.id);
  } catch {
    caughtSelfApproval = true;
  }
  assert(caughtSelfApproval, 'Colaborador é IMPEDIDO de aprovar a sua própria folha de horas');

  // Test 8: Manager rejection requires mandatory reason
  const mgrUser = INITIAL_PROFILES[2]; // manager
  let caughtEmptyReasonReject = false;
  try {
    dataService.rejectTimesheet(submittedTs.id, mgrUser.id, '');
  } catch {
    caughtEmptyReasonReject = true;
  }
  assert(caughtEmptyReasonReject, 'Rejeição sem justificação é IMPEDIDA');

  // Test 9: Manager approval works
  const approvedTs = dataService.approveTimesheet(submittedTs.id, mgrUser.id, 'Aprovado em conformidade');
  assert(approvedTs.status === 'APPROVED', 'Timesheet aprovado com sucesso pelo gestor');
  assert(approvedTs.approved_by === mgrUser.id, 'approved_by regista o ID do gestor');

  console.log('=== TODOS OS TESTES DE TIMESHEET (MOCK) PASSARAM ===');
  return true;
}

// Auto-run when executed directly in CLI
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('behavior.test')) {
  runAllBehaviorTests();
}
