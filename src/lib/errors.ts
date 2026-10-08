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
