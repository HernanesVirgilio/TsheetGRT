import { t, tIfKnown, translated } from './i18n';

/**
 * Natureza de uma falha, para escolher a mensagem e a ação de recuperação:
 * schema (função/coluna/tabela em falta: tentar de novo não resolve), permission, network (tentar de novo),
 * validation (dados recusados pelo servidor), not_found e unknown.
 */
export type ErrorKind = 'schema' | 'permission' | 'network' | 'validation' | 'not_found' | 'unknown';

export class ServiceError extends Error {
  readonly code: string | null;
  readonly kind: ErrorKind;

  constructor(message: string, code: string | null = null, kind: ErrorKind = 'unknown') {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
    this.kind = kind;
  }
}

/** Forma mínima comum a PostgrestError, AuthError e FunctionsError. */
export interface ErrorLike {
  message: string;
  code?: string;
  details?: string | null;
}

const PERMISSION_DENIED_MESSAGE = 'Não tem permissão para realizar esta operação.';
const NETWORK_ERROR_MESSAGE = 'Não foi possível contactar o servidor. Verifique a ligação à internet e tente novamente.';
const SCHEMA_MISSING_MESSAGE =
  'Esta funcionalidade precisa de uma atualização da base de dados que ainda não foi aplicada (função ou coluna em falta). Contacte o administrador do sistema.';

/**
 * Códigos de um esquema desatualizado: função, coluna ou tabela inexistente (migração por aplicar).
 * PostgREST: PGRST202 (função), PGRST204 (coluna), PGRST205 (tabela). PostgreSQL: 42883, 42703, 42P01.
 */
const SCHEMA_MISSING_CODES: readonly string[] = ['PGRST202', 'PGRST204', 'PGRST205', '42883', '42703', '42P01'];

/** O erro indica que a base de dados não tem o esquema esperado pela aplicação. */
export function isSchemaMissingError(error: ErrorLike): boolean {
  return Boolean(error.code && SCHEMA_MISSING_CODES.includes(error.code));
}

/** Classifica um erro do Supabase (PostgREST ou PostgreSQL). */
export function getErrorKind(error: ErrorLike): ErrorKind {
  if (isSchemaMissingError(error)) return 'schema';
  switch (error.code) {
    case '42501':
      return 'permission';
    case '23505':
    case '23514':
    case '23503':
    case '22023':
    case 'P0001':
      return 'validation';
    case 'PGRST116':
      return 'not_found';
    default:
      return error.message.toLowerCase().includes('failed to fetch') ? 'network' : 'unknown';
  }
}

/** Natureza de qualquer valor apanhado num catch. */
export function errorKindOf(error: unknown): ErrorKind {
  if (error instanceof ServiceError) return error.kind;
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) return 'network';
  return 'unknown';
}

/**
 * Regista os detalhes técnicos só em desenvolvimento: código e mensagem do servidor (nomes de objetos),
 * nunca `details`, que pode conter valores dos registos.
 */
export function logDevError(context: string, error: unknown): void {
  if (!import.meta.env?.DEV) return;
  const { code, message } = (error ?? {}) as { code?: unknown; message?: unknown };
  console.warn(`[${context}]`, typeof code === 'string' ? code : '', typeof message === 'string' ? message : String(error));
}

const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = translated({
  profiles_email_key: 'Já existe um utilizador com este e-mail.',
  profiles_employee_number_key: 'Já existe um utilizador com este número de colaborador.',
  departments_code_key: 'Já existe um departamento com este código.',
  timesheets_period_unique: 'Já existe um timesheet para este período.',
  it_assets_asset_tag_key: 'Já existe um equipamento com este código patrimonial.',
  it_assets_serial_number_key: 'Já existe um equipamento com este número de série.',
  companies_name_unique: 'Já existe uma empresa com este nome.',
  companies_nuit_key: 'Já existe uma empresa com este NUIT.',
  absence_types_code_key: 'Já existe um tipo de ausência com este código.',
  approval_requests_one_pending: 'Já existe um pedido de aprovação pendente para esta oportunidade.',
});

const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = translated({
  departments_code_format: 'O código deve ter entre 2 e 20 carateres (letras maiúsculas, números, "-" ou "_").',
  departments_name_not_blank: 'O nome do departamento é obrigatório.',
  profiles_full_name_not_blank: 'O nome completo deve ter pelo menos 2 carateres.',
  profiles_email_normalized: 'O endereço de e-mail não é válido.',
  it_tickets_title_length: 'O título deve ter pelo menos 5 carateres.',
  it_tickets_description_length: 'A descrição deve ter entre 10 e 5000 carateres.',
  it_ticket_comments_body_length: 'A mensagem deve ter entre 1 e 5000 carateres.',
  it_assets_asset_tag_format: 'O código patrimonial deve ter 3 a 30 carateres (letras maiúsculas, números ou "-").',
  it_assets_assignment_status: 'Apenas equipamentos em uso, em reparação ou perdidos podem ter utilizador responsável.',
  it_interventions_problem_length: 'Descreva o problema (5 a 2000 carateres).',
  it_interventions_work_length: 'Descreva o trabalho realizado (5 a 4000 carateres).',
  tasks_title_length: 'O título da tarefa deve ter pelo menos 3 carateres.',
  tasks_description_length: 'A descrição não pode exceder 5000 carateres.',
  tasks_estimate_range: 'A estimativa tem de estar entre 1 minuto e 100 000 minutos.',
  tasks_late_reason: 'A tarefa foi concluída depois do prazo: indique o motivo do atraso.',
  meetings_title_length: 'O título da reunião deve ter pelo menos 3 carateres.',
  meetings_time_range: 'A reunião tem de terminar depois de começar (máximo de 24 horas).',
  meetings_url_format: 'A ligação tem de começar por http:// ou https://.',
  companies_name_length: 'O nome da empresa deve ter pelo menos 2 carateres.',
  companies_nuit_format: 'O NUIT tem 9 dígitos.',
  companies_email_format: 'O e-mail da empresa não é válido.',
  companies_website_format: 'O site tem de começar por http:// ou https://.',
  opportunities_title_length: 'O título da oportunidade deve ter pelo menos 3 carateres.',
  opportunities_contact_email_format: 'O e-mail do contacto não é válido.',
  opportunities_probability_range: 'A probabilidade tem de estar entre 0 e 100.',
  opportunities_currency_format: 'A moeda tem de ser um código de 3 letras (ex.: MZN).',
  opportunities_initial_value_positive: 'O valor inicial não pode ser negativo.',
  opportunities_estimated_value_positive: 'O valor estimado não pode ser negativo.',
  absence_requests_period_valid: 'O período de ausência é inválido (máximo de um ano).',
  calendar_events_title_length: 'O título do evento deve ter pelo menos 3 carateres.',
  calendar_events_time_range: 'O evento tem de terminar depois de começar (máximo de 31 dias).',
  timesheet_entries_context: 'Selecione o registo a que o tempo se refere.',
  timesheet_entries_unplanned_description: 'Descreva a atividade extraordinária (mínimo 5 carateres).',
  profiles_job_description_length: 'A descrição da função não pode exceder 2000 carateres.',
  absence_requests_no_self_validation: 'Não pode validar o seu próprio pedido de ausência.',
  absence_requests_validation_comment_length: 'O parecer não pode exceder 1000 carateres.',
  approval_requests_justification_length: 'Explique o que deve ser aprovado (5 a 2000 carateres).',
  approval_requests_no_self_decision: 'Quem pede a aprovação não a pode decidir.',
  approval_requests_rejection_reason: 'A rejeição exige um motivo (mínimo 5 carateres).',
  tasks_review_consistency: 'Só é possível validar tarefas concluídas.',
  tasks_review_note_length: 'A nota não pode exceder 1000 carateres.',
  meetings_request_rejection_reason: 'A recusa exige um motivo (mínimo 5 carateres).',
  meetings_request_not_self: 'Não pode pedir a sua própria participação.',
  meetings_request_proposal_consistency: 'O novo horário proposto é inválido (máximo de 24 horas).',
  meeting_participants_response_comment_length: 'O comentário não pode exceder 500 carateres.',
  absence_requests_notice_consistency: 'Uma ausência comunicada não pode ser validada nem aprovada.',
});

function findConstraintMessage(error: ErrorLike, messages: Record<string, string>): string | null {
  const haystack = `${error.message} ${error.details ?? ''}`;
  const constraint = Object.keys(messages).find((name) => haystack.includes(name));
  return constraint ? messages[constraint] : null;
}

function isNativePermissionMessage(message: string): boolean {
  const normalized = message.toLowerCase();
  return normalized.startsWith('permission denied') || normalized.includes('row-level security');
}

/** Traduz um erro do Supabase numa mensagem compreensível para o utilizador. */
export function describeSupabaseError(error: ErrorLike, fallback: string): string {
  if (isSchemaMissingError(error)) {
    // Diagnóstico para quem administra (sem dados sensíveis): que objeto falta na base de dados.
    console.error(`[base de dados] Esquema desatualizado (${error.code}): ${error.message}`);
    return t(SCHEMA_MISSING_MESSAGE);
  }
  switch (error.code) {
    case '23505':
      return findConstraintMessage(error, UNIQUE_CONSTRAINT_MESSAGES) ?? t('Já existe um registo com estes dados.');
    case '23514':
      return findConstraintMessage(error, CHECK_CONSTRAINT_MESSAGES) ?? t('Os dados indicados não são válidos.');
    case '23503':
      return t('O registo associado não existe ou não pode ser utilizado.');
    case '42501':
      return isNativePermissionMessage(error.message) ? t(PERMISSION_DENIED_MESSAGE) : tIfKnown(error.message);
    case 'P0001':
      // Mensagens de validação definidas nas funções e triggers do servidor (em pt-PT): traduzidas
      // quando existe entrada no dicionário; as que incluem dados variáveis ficam em português.
      return tIfKnown(error.message);
    case 'PGRST116':
      return t('O registo pedido não foi encontrado.');
    default:
      break;
  }

  if (error.message.toLowerCase().includes('failed to fetch')) {
    return t(NETWORK_ERROR_MESSAGE);
  }
  return fallback;
}

export function toServiceError(error: ErrorLike, fallback: string): ServiceError {
  const kind = getErrorKind(error);
  if (kind !== 'schema' && kind !== 'validation') logDevError('supabase', error);
  return new ServiceError(describeSupabaseError(error, fallback), error.code ?? null, kind);
}

/** Mensagem segura para apresentar a partir de qualquer valor apanhado num catch. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) return t(NETWORK_ERROR_MESSAGE);
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
