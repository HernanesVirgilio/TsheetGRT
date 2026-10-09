export class ServiceError extends Error {
  readonly code: string | null;

  constructor(message: string, code: string | null = null) {
    super(message);
    this.name = 'ServiceError';
    this.code = code;
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

const UNIQUE_CONSTRAINT_MESSAGES: Record<string, string> = {
  profiles_email_key: 'Já existe um utilizador com este e-mail.',
  profiles_employee_number_key: 'Já existe um utilizador com este número de colaborador.',
  departments_code_key: 'Já existe um departamento com este código.',
  timesheets_period_unique: 'Já existe um timesheet para este período.',
  it_assets_asset_tag_key: 'Já existe um equipamento com este código patrimonial.',
  it_assets_serial_number_key: 'Já existe um equipamento com este número de série.',
  companies_name_unique: 'Já existe uma empresa com este nome.',
  companies_nuit_key: 'Já existe uma empresa com este NUIT.',
  absence_types_code_key: 'Já existe um tipo de ausência com este código.',
};

const CHECK_CONSTRAINT_MESSAGES: Record<string, string> = {
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
};

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
  switch (error.code) {
    case '23505':
      return findConstraintMessage(error, UNIQUE_CONSTRAINT_MESSAGES) ?? 'Já existe um registo com estes dados.';
    case '23514':
      return findConstraintMessage(error, CHECK_CONSTRAINT_MESSAGES) ?? 'Os dados indicados não são válidos.';
    case '23503':
      return 'O registo associado não existe ou não pode ser utilizado.';
    case '42501':
      return isNativePermissionMessage(error.message) ? PERMISSION_DENIED_MESSAGE : error.message;
    case 'P0001':
      // Mensagens de validação definidas nas funções e triggers do servidor (já em pt-PT).
      return error.message;
    case 'PGRST116':
      return 'O registo pedido não foi encontrado.';
    default:
      break;
  }

  if (error.message.toLowerCase().includes('failed to fetch')) {
    return NETWORK_ERROR_MESSAGE;
  }
  return fallback;
}

export function toServiceError(error: ErrorLike, fallback: string): ServiceError {
  return new ServiceError(describeSupabaseError(error, fallback), error.code ?? null);
}

/** Mensagem segura para apresentar a partir de qualquer valor apanhado num catch. */
export function getErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ServiceError) return error.message;
  if (error instanceof TypeError && error.message.toLowerCase().includes('fetch')) return NETWORK_ERROR_MESSAGE;
  if (error instanceof Error && error.message) return error.message;
  return fallback;
}
