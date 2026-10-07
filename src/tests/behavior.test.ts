import { dataService, calculateMinutesBetween, formatMinutesToHours } from '../services/dataService';
import { INITIAL_PROFILES } from '../lib/supabase/mockData';

function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`FAIL: ${message}`);
  }
  console.log(`✓ PASS: ${message}`);
}

export function runAllBehaviorTests() {
  console.log('=== INICIANDO SUÍTE DE TESTES DE BEHAVIOR E REGRAS DE NEGÓCIO ===');

  // Test 1: Login validation
  const validLogin = dataService.verifyCredentials('admin@siholdings-mz.com', '123456');
  assert(validLogin !== null, 'Login com credenciais válidas tem sucesso');
  assert(validLogin?.profile.email === 'admin@siholdings-mz.com', 'Login retorna perfil correto');
  assert(validLogin?.mustChangePassword === true, 'Conta inicial de desenvolvimento exige alteração de password');

  const invalidLogin = dataService.verifyCredentials('admin@siholdings-mz.com', 'wrongpassword');
  assert(invalidLogin === null, 'Login com palavra-passe incorreta é rejeitado');

  // Test 2: Permission checks
  const employeePermissions = dataService.getUserPermissions('EMPLOYEE');
  assert(employeePermissions.includes('SELF_TIMESHEET_CREATE'), 'Colaborador tem SELF_TIMESHEET_CREATE');
  assert(!employeePermissions.includes('TEAM_TIMESHEET_APPROVE'), 'Colaborador NÃO tem TEAM_TIMESHEET_APPROVE');
  assert(!employeePermissions.includes('USERS_CREATE'), 'Colaborador NÃO tem USERS_CREATE');

  const managerPermissions = dataService.getUserPermissions('MANAGER');
  assert(managerPermissions.includes('TEAM_TIMESHEET_APPROVE'), 'Gestor tem TEAM_TIMESHEET_APPROVE');
  assert(managerPermissions.includes('TEAM_TIMESHEET_REJECT'), 'Gestor tem TEAM_TIMESHEET_REJECT');
  assert(!managerPermissions.includes('USERS_CREATE'), 'Gestor NÃO tem USERS_CREATE');

  const adminPermissions = dataService.getUserPermissions('ADMIN');
  assert(adminPermissions.includes('ADMIN_ACCESS'), 'Admin tem ADMIN_ACCESS');
  assert(adminPermissions.includes('USERS_CREATE'), 'Admin tem USERS_CREATE');

  // Test 3: Time calculation rules
  const minutesNormal = calculateMinutesBetween('08:00', '17:00', 60);
  assert(minutesNormal === 480, 'Cálculo de 08:00 às 17:00 com 60 min de pausa = 480 min (8h 00m)');
  assert(formatMinutesToHours(minutesNormal) === '8h 00m', 'Formatação para horas = 8h 00m');

  const minutesWithOvertime = calculateMinutesBetween('08:00', '17:30', 60);
  assert(minutesWithOvertime === 510, 'Cálculo de 08:00 às 17:30 com 60 min de pausa = 510 min (8h 30m)');
  assert(formatMinutesToHours(minutesWithOvertime) === '8h 30m', 'Formatação = 8h 30m');

  // Test 4: Password change validation
  let caughtPasswordTooShort = false;
  try {
    dataService.changeUserPassword('u4444444-4444-4444-4444-444444444444', '123456', 'short');
  } catch (e: any) {
    caughtPasswordTooShort = true;
  }
  assert(caughtPasswordTooShort, 'Tentativa de alteração com palavra-passe menor que 12 carateres é barrada');

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
  } catch (e: any) {
    caughtSelfApproval = true;
  }
  assert(caughtSelfApproval, 'Colaborador é IMPEDIDO de aprovar a sua própria folha de horas');

  // Test 8: Manager rejection requires mandatory reason
  const mgrUser = INITIAL_PROFILES[2]; // manager
  let caughtEmptyReasonReject = false;
  try {
    dataService.rejectTimesheet(submittedTs.id, mgrUser.id, '');
  } catch (e: any) {
    caughtEmptyReasonReject = true;
  }
  assert(caughtEmptyReasonReject, 'Rejeição sem justificação é IMPEDIDA');

  // Test 9: Manager approval works
  const approvedTs = dataService.approveTimesheet(submittedTs.id, mgrUser.id, 'Aprovado em conformidade');
  assert(approvedTs.status === 'APPROVED', 'Timesheet aprovado com sucesso pelo gestor');
  assert(approvedTs.approved_by === mgrUser.id, 'approved_by regista o ID do gestor');

  // Test 10: Admin user management & soft disable
  const adminUser = INITIAL_PROFILES[0];
  const newCreatedUser = dataService.createProfile(
    {
      full_name: 'Novo Colaborador Teste',
      email: `teste-${Date.now()}@siholdings-mz.com`,
      department_id: 'd4444444-4444-4444-4444-444444444444',
      role: 'EMPLOYEE',
    },
    adminUser.id
  );
  assert(newCreatedUser.is_active === true, 'Novo utilizador criado ativo');

  const disabledUser = dataService.toggleUserStatus(newCreatedUser.id, false, adminUser.id);
  assert(disabledUser.is_active === false, 'Utilizador desativado com sucesso (soft-disable)');

  // Test 11: Email alias support (gestor / funcionario)
  const gestorLogin = dataService.verifyCredentials('gestor@siholdings-mz.com', '123456');
  assert(gestorLogin !== null && gestorLogin.profile.email === 'manager@siholdings-mz.com', 'Alias gestor@... mapeia para manager com sucesso');

  const funcLogin = dataService.verifyCredentials('funcionario@siholdings-mz.com', '123456');
  assert(funcLogin !== null && funcLogin.profile.email === 'colaborador@siholdings-mz.com', 'Alias funcionario@... mapeia para colaborador com sucesso');

  console.log('=== TODOS OS TESTES PASSARAM COM SUCESSO (12/12) ===');
  return true;
}

// Auto-run when executed directly in CLI
if (typeof process !== 'undefined' && process.argv && process.argv[1]?.includes('behavior.test')) {
  runAllBehaviorTests();
}
