// Validação de formulários no frontend. As mesmas regras são reforçadas no servidor
// (constraints, triggers e Edge Function); estas servem para dar feedback imediato.

export const MIN_PASSWORD_LENGTH = 12;
export const DEPARTMENT_CODE_PATTERN = /^[A-Z0-9][A-Z0-9_-]{1,19}$/;
export const MAX_DAILY_TARGET_HOURS = 12;
export const MIN_DAILY_TARGET_HOURS = 1;

const EMAIL_PATTERN = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type FieldErrors<Field extends string> = Partial<Record<Field, string>>;

export function hasErrors<Field extends string>(errors: FieldErrors<Field>): boolean {
  return Object.values(errors).some(Boolean);
}

export function isValidEmail(value: string): boolean {
  return EMAIL_PATTERN.test(value.trim());
}

export function isUuid(value: string): boolean {
  return UUID_PATTERN.test(value);
}

/** Converte texto livre num padrão ILIKE seguro para filtros PostgREST (sem curingas nem separadores). */
export function toIlikePattern(search: string): string {
  const sanitized = search.replace(/[%_*,()\\"]/g, ' ').replace(/\s+/g, ' ').trim();
  return `%${sanitized}%`;
}

export function optionalText(value: string): string | null {
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export interface UserFormValues {
  fullName: string;
  email: string;
  phone: string;
  departmentId: string;
  jobTitle: string;
}

export type UserFormField = keyof UserFormValues;

export function validateUserForm(values: UserFormValues, options: { requireEmail: boolean }): FieldErrors<UserFormField> {
  const errors: FieldErrors<UserFormField> = {};
  const fullName = values.fullName.trim();

  if (fullName.length < 2) errors.fullName = 'Indique o nome completo (mínimo 2 carateres).';
  else if (fullName.length > 255) errors.fullName = 'O nome não pode exceder 255 carateres.';

  if (options.requireEmail) {
    if (!values.email.trim()) errors.email = 'O e-mail é obrigatório.';
    else if (!isValidEmail(values.email)) errors.email = 'Indique um endereço de e-mail válido.';
  }

  if (!values.departmentId) errors.departmentId = 'Selecione o departamento.';
  if (values.jobTitle.trim().length > 150) errors.jobTitle = 'O cargo não pode exceder 150 carateres.';
  if (values.phone.trim().length > 50) errors.phone = 'O telefone não pode exceder 50 carateres.';

  return errors;
}

export interface DepartmentFormValues {
  code: string;
  name: string;
  description: string;
}

export type DepartmentFormField = keyof DepartmentFormValues;

export function normalizeDepartmentCode(value: string): string {
  return value.trim().toUpperCase();
}

export function validateDepartmentForm(values: DepartmentFormValues): FieldErrors<DepartmentFormField> {
  const errors: FieldErrors<DepartmentFormField> = {};
  if (!DEPARTMENT_CODE_PATTERN.test(normalizeDepartmentCode(values.code))) {
    errors.code = 'Use 2 a 20 carateres: letras maiúsculas, números, "-" ou "_".';
  }
  const name = values.name.trim();
  if (!name) errors.name = 'O nome do departamento é obrigatório.';
  else if (name.length > 150) errors.name = 'O nome não pode exceder 150 carateres.';
  return errors;
}

export interface SettingsFormValues {
  companyName: string;
  periodType: string;
  dailyTargetHours: string;
  allowWeekendEntries: boolean;
}

export type SettingsFormField = keyof SettingsFormValues;

export const PERIOD_TYPES = ['MONTHLY', 'BIWEEKLY', 'WEEKLY'] as const;

export function validateSettingsForm(values: SettingsFormValues): FieldErrors<SettingsFormField> {
  const errors: FieldErrors<SettingsFormField> = {};
  const companyName = values.companyName.trim();
  if (companyName.length < 2 || companyName.length > 150) {
    errors.companyName = 'O nome da empresa deve ter entre 2 e 150 carateres.';
  }
  if (!(PERIOD_TYPES as readonly string[]).includes(values.periodType)) {
    errors.periodType = 'Selecione um ciclo de apuração válido.';
  }
  const hours = Number(values.dailyTargetHours);
  if (!/^\d{1,2}$/.test(values.dailyTargetHours) || hours < MIN_DAILY_TARGET_HOURS || hours > MAX_DAILY_TARGET_HOURS) {
    errors.dailyTargetHours = `Indique um número inteiro entre ${MIN_DAILY_TARGET_HOURS} e ${MAX_DAILY_TARGET_HOURS}.`;
  }
  return errors;
}

export interface NewPasswordValues {
  newPassword: string;
  confirmPassword: string;
}

export type NewPasswordField = keyof NewPasswordValues;

export function validateNewPassword(values: NewPasswordValues): FieldErrors<NewPasswordField> {
  const errors: FieldErrors<NewPasswordField> = {};
  if (values.newPassword.length < MIN_PASSWORD_LENGTH) {
    errors.newPassword = `A palavra-passe deve ter pelo menos ${MIN_PASSWORD_LENGTH} carateres.`;
  }
  if (values.confirmPassword !== values.newPassword) {
    errors.confirmPassword = 'A confirmação não coincide com a nova palavra-passe.';
  }
  return errors;
}
