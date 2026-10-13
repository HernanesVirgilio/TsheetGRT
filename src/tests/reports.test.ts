// Contrato do centro de relatórios com a base de dados e tratamento de erros.
//   * Os argumentos enviados por RPC coincidem com as assinaturas das funções nas migrations (nomes, sem extras).
//   * As colunas pedidas a `meetings` são criadas por alguma migration.
//   * Função/coluna em falta (PGRST202, 42703), permissão e rede são distinguidas; sem "Tentar novamente" quando
//     repetir não resolve; uma resposta sem linhas nunca é apresentada como zeros.
// Não contacta o Supabase: valida o código local contra as migrations locais.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describeSupabaseError, errorKindOf, getErrorKind, ServiceError, toServiceError } from '../lib/errors';
import { approvalReportArgs, hoursReportArgs, hoursTrendArgs, mapApprovalMetrics, mapHoursRow, mapTrendPoint } from '../services/reportContract';
import { ErrorState } from '../components/ui/States';

let passed = 0;
function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}
function section(title: string): void {
  console.log(`\n${title}`);
}

const ROOT = join(import.meta.dirname, '..', '..');
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations');
const migrations = readdirSync(MIGRATIONS_DIR)
  .filter((name) => name.endsWith('.sql'))
  .sort()
  .map((name) => ({ name, sql: readFileSync(join(MIGRATIONS_DIR, name), 'utf8') }));
const source = (path: string) => readFileSync(join(ROOT, path), 'utf8');

/** Última definição da função nas migrations (a que fica em vigor): ficheiro e nomes dos parâmetros. */
function signature(fn: string): { file: string; params: string[] } | null {
  let found: { file: string; params: string[] } | null = null;
  const pattern = new RegExp(`CREATE (?:OR REPLACE )?FUNCTION public\\.${fn}\\s*\\(([^)]*)\\)`, 'g');
  for (const { name, sql } of migrations) {
    for (const match of sql.matchAll(pattern)) {
      const params = match[1].split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
      found = { file: name, params };
    }
  }
  return found;
}
const sameNames = (first: string[], second: string[]) => [...first].sort().join() === [...second].sort().join();

// =============================================================================
section('Contrato RPC: argumentos enviados = assinatura SQL');
const filters = { from: '2026-09-01', to: '2026-09-30', departmentId: null, employeeId: null };
const contracts = [
  { fn: 'get_hours_report', args: hoursReportArgs(filters) },
  { fn: 'get_hours_trend', args: hoursTrendArgs(filters, 'week') },
  { fn: 'get_approval_report', args: approvalReportArgs(filters.from, filters.to, null) },
];
for (const { fn, args } of contracts) {
  const sql = signature(fn);
  assert(sql?.file === '20261015000001_reporting_centre.sql', `${fn} é definida em 20261015000001_reporting_centre.sql`);
  assert(sameNames(Object.keys(args), sql?.params ?? []), `${fn}: argumentos ${Object.keys(args).join(', ')} coincidem com a assinatura SQL`);
}
const reminders = signature('refresh_approval_reminders');
assert(reminders?.file === '20261015000000_collaboration_availability_reminders.sql' && reminders.params.length === 0, 'refresh_approval_reminders() é definida, sem parâmetros, em 20261015000000');
assert(/rpc\('refresh_approval_reminders'\)/.test(source('src/services/notificationService.ts')), 'o frontend chama refresh_approval_reminders sem argumentos');
const reportService = source('src/services/reportService.ts');
assert(
  reportService.includes("rpc('get_hours_report', hoursReportArgs(") && reportService.includes("rpc('get_hours_trend', hoursTrendArgs(") && reportService.includes("rpc('get_approval_report', approvalReportArgs("),
  'o serviço de relatórios usa os argumentos do contrato'
);
assert(hoursReportArgs(filters).p_department_id === null && 'p_employee_id' in hoursReportArgs(filters), 'filtros vazios são enviados como NULL explícito (todos, dentro do âmbito)');
assert(hoursTrendArgs(filters, 'month').p_bucket === 'month', 'o agrupamento é enviado tal como escolhido');

// =============================================================================
section('Colunas de meetings pedidas pelo frontend existem nas migrations');
const meetingSelect = /const MEETING_SELECT =\s*'([^']+)'/.exec(source('src/services/work/meetingService.ts'))?.[1] ?? '';
// Só as colunas da própria tabela: as relações embutidas (ex.: task:tasks!…(id, reference, title)) são retiradas.
const meetingColumns = meetingSelect.replace(/\([^)]*\)/g, '').split(',').map((part) => part.trim()).filter((part) => /^[a-z_]+$/.test(part));
const allSql = migrations.map(({ sql }) => sql).join('\n');
const createTable = /CREATE TABLE public\.meetings \(([\s\S]*?)\n\);/.exec(allSql)?.[1] ?? '';
const declared = new Set<string>([
  ...[...createTable.matchAll(/^\s+([a-z_]+)\s+[A-Z]/gm)].map((match) => match[1]),
  ...[...allSql.matchAll(/ALTER TABLE public\.meetings[\s\S]*?;/g)].flatMap((statement) => [...statement[0].matchAll(/ADD COLUMN (?:IF NOT EXISTS )?([a-z_]+)/g)].map((match) => match[1])),
]);
const missing = meetingColumns.filter((column) => !declared.has(column));
assert(meetingColumns.length >= 20 && missing.length === 0, `todas as ${meetingColumns.length} colunas de MEETING_SELECT são criadas por migrations${missing.length ? ` (em falta: ${missing.join(', ')})` : ''}`);
assert(/ADD COLUMN IF NOT EXISTS request_proposed_starts_at/.test(source('supabase/migrations/20261015000000_collaboration_availability_reminders.sql')), 'request_proposed_starts_at é criada por 20261015000000 (nome correto no frontend)');

// =============================================================================
section('Classificação dos erros');
const missingFunction = { code: 'PGRST202', message: 'Could not find the function public.get_hours_trend(p_bucket, p_department_id, p_employee_id, p_from, p_to) in the schema cache' };
const missingColumn = { code: '42703', message: 'column meetings.request_proposed_starts_at does not exist' };
const originalError = console.error;
console.error = () => undefined;
const schemaFunctionError = toServiceError(missingFunction, 'Não foi possível gerar o relatório.');
const schemaColumnError = toServiceError(missingColumn, 'x');
console.error = originalError;
assert(getErrorKind(missingFunction) === 'schema' && schemaFunctionError.kind === 'schema' && schemaFunctionError.code === 'PGRST202', 'PGRST202 (função em falta) → esquema');
assert(getErrorKind(missingColumn) === 'schema' && schemaColumnError.kind === 'schema', '42703 (coluna em falta) → esquema');
assert(schemaFunctionError.message.includes('atualização da base de dados') && !schemaFunctionError.message.includes('get_hours_trend'), 'a mensagem ao utilizador explica o problema sem detalhes técnicos');
assert(getErrorKind({ code: '42501', message: 'permission denied for function get_hours_report' }) === 'permission', '42501 → permissão');
assert(getErrorKind({ code: '42501', message: 'Departamento fora do seu âmbito.' }) === 'permission', 'âmbito recusado pela função → permissão');
assert(getErrorKind({ message: 'TypeError: Failed to fetch' }) === 'network' && errorKindOf(new TypeError('Failed to fetch')) === 'network', 'falha de rede → rede');
assert(getErrorKind({ code: 'P0001', message: 'O período de um relatório não pode exceder 366 dias (um ano).' }) === 'validation', 'validação do servidor → validação');
assert(getErrorKind({ code: 'XX000', message: 'internal' }) === 'unknown' && errorKindOf(new Error('x')) === 'unknown', 'outros erros → desconhecido');
assert(describeSupabaseError({ code: '42501', message: 'permission denied for function get_hours_report' }, 'x').includes('permissão'), 'permissão recusada não é apresentada como esquema em falta');

// =============================================================================
section('Estado de erro: mensagem e ação de recuperação');
const render = (props: React.ComponentProps<typeof ErrorState>) => renderToStaticMarkup(React.createElement(ErrorState, props));
const retry = () => undefined;
const schemaView = render({ message: schemaFunctionError.message, kind: 'schema', onRetry: retry });
assert(schemaView.includes('Base de dados por atualizar') && !schemaView.includes('Tentar novamente'), 'esquema em falta: título próprio e sem "Tentar novamente" (repetir não resolve)');
const permissionView = render({ message: 'Sem permissão', kind: 'permission', onRetry: retry });
assert(permissionView.includes('Sem acesso a estes dados') && !permissionView.includes('Tentar novamente'), 'permissão: título próprio e sem repetição');
const networkView = render({ message: 'Sem rede', kind: 'network', onRetry: retry });
assert(networkView.includes('Sem ligação ao servidor') && networkView.includes('Tentar novamente'), 'rede: "Tentar novamente" disponível');
const unknownView = render({ message: 'Erro', onRetry: retry });
assert(unknownView.includes('Não foi possível carregar os dados') && unknownView.includes('Tentar novamente'), 'sem natureza conhecida: comportamento anterior preservado');
assert(/<button[^>]*disabled/.test(render({ message: 'Erro', kind: 'network', onRetry: retry, isRetrying: true })), 'durante a repetição o botão fica desativado');

// =============================================================================
section('Respostas convertidas sem inventar dados');
assert(mapApprovalMetrics([]) === null && mapApprovalMetrics(null) === null, 'relatório de aprovações sem linhas → falha (nunca zeros)');
const metrics = mapApprovalMetrics([
  { approved_count: 4, rejected_count: 1, avg_decision_hours: null, decisions_measured: 5, resubmitted_approved: 1, pending_now: 2, pending_over_threshold: 1, threshold_days: 5, oldest_pending_at: null },
]);
assert(metrics?.thresholdDays === 5 && metrics.avgDecisionHours === null && metrics.approved === 4, 'o prazo vem do servidor (sem valor por omissão inventado)');
assert(mapTrendPoint({ bucket_start: '2026-09-07T00:00:00', minutes: 90, people: 2 }).bucketStart === '2026-09-07', 'início do grupo normalizado para a data');
assert(mapHoursRow({ employee_id: 'e', employee_name: null, department_id: null, department_name: null, activity_name: 'A', minutes: 30, entries: 1, days_worked: 1 }).employeeName === '—', 'colaborador sem nome mostrado como —');
assert(new ServiceError('x').kind === 'unknown', 'ServiceError sem natureza indicada mantém o comportamento anterior');

console.log(`\n${passed} testes passaram.`);
