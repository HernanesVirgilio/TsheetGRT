// Testes das regras puras da área Admin (validação, mensagens de erro, CSV, relatórios, formatação).
// As regras de autorização são testadas contra o PostgreSQL (ver docs/supabase-setup.md, secção Validação).
import { describeSupabaseError, getErrorMessage, ServiceError } from '../lib/errors';
import { buildCsv } from '../utils/csv';
import { formatCalendarDate, formatMinutesAsHours, formatPeriod, pluralize } from '../utils/format';
import type { ReportTimesheet } from '../utils/reports';
import { groupTimesheets, isOpenTimesheet, sumMinutes } from '../utils/reports';
import {
  hasErrors,
  isUuid,
  normalizeDepartmentCode,
  toIlikePattern,
  validateDepartmentForm,
  validateNewPassword,
  validateSettingsForm,
  validateUserForm,
} from '../utils/validation';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

section('Formulário de utilizador');
const validUser = { fullName: 'Maria Fernandes', email: 'maria@siholdings-mz.com', phone: '', departmentId: 'd1', jobTitle: '' };
assert(!hasErrors(validateUserForm(validUser, { requireEmail: true })), 'utilizador válido não tem erros');
const invalidUser = validateUserForm({ ...validUser, fullName: ' ', email: 'maria', departmentId: '' }, { requireEmail: true });
assert(Boolean(invalidUser.fullName && invalidUser.email && invalidUser.departmentId), 'nome, e-mail e departamento são obrigatórios');
assert(!validateUserForm({ ...validUser, email: '' }, { requireEmail: false }).email, 'e-mail não é exigido na edição');

section('Formulário de departamento');
assert(!hasErrors(validateDepartmentForm({ code: 'fin', name: 'Finanças', description: '' })), 'código em minúsculas é aceite após normalização');
assert(normalizeDepartmentCode(' ops ') === 'OPS', 'código é normalizado para maiúsculas');
assert(Boolean(validateDepartmentForm({ code: 'A', name: 'X', description: '' }).code), 'código com 1 carater é rejeitado');
assert(Boolean(validateDepartmentForm({ code: 'R H', name: 'X', description: '' }).code), 'código com espaço é rejeitado');
assert(Boolean(validateDepartmentForm({ code: 'RH', name: '  ', description: '' }).name), 'nome vazio é rejeitado');

section('Configurações');
const validSettings = { companyName: 'SI Holdings', periodType: 'MONTHLY', dailyTargetHours: '8', allowWeekendEntries: true };
assert(!hasErrors(validateSettingsForm(validSettings)), 'configurações válidas');
assert(Boolean(validateSettingsForm({ ...validSettings, dailyTargetHours: '13' }).dailyTargetHours), 'meta acima de 12 horas é rejeitada');
assert(Boolean(validateSettingsForm({ ...validSettings, dailyTargetHours: '7.5' }).dailyTargetHours), 'meta decimal é rejeitada');
assert(Boolean(validateSettingsForm({ ...validSettings, periodType: 'DAILY' }).periodType), 'ciclo desconhecido é rejeitado');

section('Palavra-passe');
assert(Boolean(validateNewPassword({ newPassword: 'curta', confirmPassword: 'curta' }).newPassword), 'menos de 12 carateres é rejeitado');
assert(Boolean(validateNewPassword({ newPassword: 'umapalavrapasse', confirmPassword: 'outra' }).confirmPassword), 'confirmação diferente é rejeitada');
assert(!hasErrors(validateNewPassword({ newPassword: 'umapalavrapasse', confirmPassword: 'umapalavrapasse' })), 'palavra-passe válida');

section('Segurança de filtros');
assert(toIlikePattern('ana,silva)') === '%ana silva%', 'separadores de filtro PostgREST são removidos');
assert(toIlikePattern('100%_x') === '%100 x%', 'curingas SQL são neutralizados');
assert(isUuid('3f2b8c1e-9d4a-4b7e-8c2f-1a2b3c4d5e6f'), 'UUID válido é aceite');
assert(!isUuid('1,actor_user_id.neq.0'), 'texto arbitrário não passa como UUID');

section('Mensagens de erro do Supabase');
assert(
  describeSupabaseError({ code: '23505', message: 'duplicate key value violates unique constraint "profiles_email_key"' }, 'x') ===
    'Já existe um utilizador com este e-mail.',
  'e-mail duplicado tem mensagem própria'
);
assert(
  describeSupabaseError({ code: '42501', message: 'new row violates row-level security policy for table "departments"' }, 'x') ===
    'Não tem permissão para realizar esta operação.',
  'violação de RLS é traduzida'
);
assert(
  describeSupabaseError({ code: 'P0001', message: 'Operação recusada: tem de existir pelo menos um administrador ativo no sistema.' }, 'x').startsWith('Operação recusada'),
  'mensagens de validação do servidor são mantidas'
);
assert(describeSupabaseError({ code: 'XX000', message: 'internal' }, 'Mensagem de recurso') === 'Mensagem de recurso', 'erro desconhecido usa a mensagem de recurso');
assert(getErrorMessage(new ServiceError('Erro claro'), 'x') === 'Erro claro', 'ServiceError mantém a mensagem');
assert(getErrorMessage('texto', 'Recurso') === 'Recurso', 'valores não-Error usam a mensagem de recurso');

section('CSV');
const csv = buildCsv(['Nome', 'Nota'], [['Ana; Silva', 'diz "olá"'], ['=SUM(A1)', null]]);
assert(csv.split('\r\n')[1] === '"Ana; Silva";"diz ""olá"""', 'separadores e aspas são escapados');
assert(csv.split('\r\n')[2] === "'=SUM(A1);", 'fórmulas são neutralizadas e nulos ficam vazios');

section('Relatórios');
const baseTimesheet: ReportTimesheet = {
  id: 't1',
  employeeId: 'e1',
  employeeName: 'Ana',
  employeeNumber: 'SIH-0001',
  departmentId: 'd1',
  departmentName: 'Finanças',
  periodStart: '2026-09-01',
  periodEnd: '2026-09-30',
  status: 'APPROVED',
  submittedAt: null,
  approvedAt: null,
  rejectedAt: null,
  rejectionReason: null,
  entryCount: 2,
  totalMinutes: 480,
};
const sample: ReportTimesheet[] = [
  baseTimesheet,
  { ...baseTimesheet, id: 't2', status: 'SUBMITTED', totalMinutes: 120, periodStart: '2026-10-01', periodEnd: '2026-10-31' },
  { ...baseTimesheet, id: 't3', employeeId: 'e2', employeeName: 'Bruno', departmentId: null, departmentName: null, status: 'REJECTED', totalMinutes: 60 },
];
const byEmployee = groupTimesheets(sample, (row) => row.employeeId, (row) => row.employeeName);
assert(byEmployee.length === 2 && byEmployee[0].label === 'Ana', 'agrupa por colaborador e ordena por nome');
assert(byEmployee[0].totalMinutes === 600 && byEmployee[0].approvedCount === 1 && byEmployee[0].submittedCount === 1, 'soma horas e conta estados');
assert(byEmployee[1].openCount === 1, 'rejeitados contam como submissão em falta');
assert(sumMinutes(sample) === 660, 'total de minutos');
assert(sample.filter(isOpenTimesheet).length === 1, 'filtro de submissões em falta');

section('Formatação');
assert(formatMinutesAsHours(510) === '8h 30m', 'minutos para horas');
assert(formatCalendarDate('2026-10-07') === '07/10/2026', 'datas DATE sem conversão de fuso');
assert(formatPeriod('2026-10-01', '2026-10-31') === '01/10/2026 – 31/10/2026', 'período');
assert(pluralize(1, 'utilizador', 'utilizadores') === '1 utilizador' && pluralize(3, 'utilizador', 'utilizadores') === '3 utilizadores', 'plural');

console.log(`\n${passed} testes passaram.`);
