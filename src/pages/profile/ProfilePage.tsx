import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { KeyRound, Monitor, Moon, Sun } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import { LOCALE_NAMES, LOCALES, t } from '../../lib/i18n';
import { usePreferences } from '../../lib/preferences/PreferencesContext';
import type { ThemePreference } from '../../lib/preferences/PreferencesContext';
import { updateOwnProfileDetails } from '../../services/userService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/FormField';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { formatDateTime } from '../../utils/format';
import { optionalText } from '../../utils/validation';

const MAX_PHONE_LENGTH = 50;
const MAX_DISPLAY_NAME_LENGTH = 80;

const THEME_OPTIONS: { value: ThemePreference; label: string; icon: LucideIcon }[] = [
  { value: 'light', label: 'Claro', icon: Sun },
  { value: 'dark', label: 'Escuro', icon: Moon },
  { value: 'system', label: 'Igual ao sistema', icon: Monitor },
];

const DetailItem: React.FC<{ label: string; children: React.ReactNode }> = ({ label, children }) => (
  <div>
    <dt className="text-sm text-text-muted">{label}</dt>
    <dd className="mt-0.5 text-sm font-medium text-text">{children}</dd>
  </div>
);

/** Escolha exclusiva acessível (grupo de botões com aria-pressed), aplicada de imediato. */
const ChoiceGroup = <Value extends string>({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { value: Value; label: string; icon?: LucideIcon; lang?: string }[];
  value: Value;
  onChange: (value: Value) => void;
}) => (
  <div>
    <p className="mb-1.5 text-sm font-medium text-text" id={`choice-${label}`}>
      {label}
    </p>
    <div role="group" aria-labelledby={`choice-${label}`} className="flex flex-wrap gap-2">
      {options.map(({ value: option, label: optionLabel, icon: Icon, lang }) => (
        <button
          key={option}
          type="button"
          lang={lang}
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`inline-flex h-10 items-center gap-2 rounded-md border px-3 text-sm font-medium ${
            value === option ? 'border-primary bg-primary-soft text-text' : 'border-border-input bg-surface text-text-secondary hover:bg-surface-muted'
          }`}
        >
          {Icon && <Icon className="h-4 w-4" aria-hidden="true" />}
          {optionLabel}
        </button>
      ))}
    </div>
  </div>
);

/**
 * Perfil pessoal. Os dados institucionais (nome completo, departamento, cargo, perfil de acesso)
 * são geridos pela administração e só aparecem para consulta; o servidor recusa outras alterações.
 * Nome de apresentação, telefone e preferências são opcionais e podem ser preenchidos aos poucos.
 */
export const ProfilePage: React.FC = () => {
  const { currentUser, refreshProfile } = useAuth();
  const { locale, themePreference, changeLocale, changeTheme, saveError } = usePreferences();
  const [displayName, setDisplayName] = useState(currentUser?.display_name ?? '');
  const [phone, setPhone] = useState(currentUser?.phone ?? '');
  const [fieldErrors, setFieldErrors] = useState<{ displayName?: string; phone?: string }>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!currentUser) return null;

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (isSubmitting) return;
    setErrorMessage(null);
    setSuccessMessage(null);
    const errors: { displayName?: string; phone?: string } = {};
    const trimmedName = displayName.trim();
    if (trimmedName && (trimmedName.length < 2 || trimmedName.length > MAX_DISPLAY_NAME_LENGTH)) {
      errors.displayName = t('O nome de apresentação deve ter entre 2 e {max} carateres.', { max: MAX_DISPLAY_NAME_LENGTH });
    }
    if (phone.trim().length > MAX_PHONE_LENGTH) errors.phone = t('O telefone não pode exceder {max} carateres.', { max: MAX_PHONE_LENGTH });
    setFieldErrors(errors);
    if (errors.displayName || errors.phone) return;

    setIsSubmitting(true);
    try {
      await updateOwnProfileDetails(currentUser.id, { displayName: optionalText(displayName), phone: optionalText(phone) });
      await refreshProfile();
      setSuccessMessage(t('Dados pessoais guardados.'));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar os dados pessoais.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader
        title={t('Perfil')}
        subtitle={t('Os seus dados, contactos e preferências.')}
        actions={
          <Link
            to="/alterar-palavra-passe"
            className="inline-flex h-10 items-center gap-2 rounded-md border border-border-input bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted"
          >
            <KeyRound className="h-4 w-4" aria-hidden="true" />
            {t('Alterar palavra-passe')}
          </Link>
        }
      />

      <Panel title={t('Dados institucionais')} description={t('Geridos pela administração. Se algum estiver incorreto, contacte o administrador.')}>
        <div className="mb-5 flex items-center gap-4">
          <UserAvatar name={currentUser.full_name} size="lg" />
          <div className="min-w-0">
            <p className="truncate text-base font-semibold text-text">{currentUser.full_name}</p>
            <p className="truncate text-sm text-text-secondary">{currentUser.job_title ?? t('Sem cargo definido')}</p>
          </div>
          <div className="ml-auto">
            <StatusBadge status={currentUser.is_active ? 'ACTIVE' : 'INACTIVE'} />
          </div>
        </div>
        <dl className="grid grid-cols-1 gap-4 border-t border-border pt-5 sm:grid-cols-2">
          <DetailItem label={t('E-mail')}>{currentUser.email}</DetailItem>
          <DetailItem label={t('Nº de colaborador')}>{currentUser.employee_number ?? '—'}</DetailItem>
          <DetailItem label={t('Departamento')}>{currentUser.department?.name ?? t('Sem departamento')}</DetailItem>
          <DetailItem label={t('Perfil de acesso')}>{currentUser.role?.name ?? t('Sem perfil')}</DetailItem>
          <DetailItem label={t('Último acesso')}>{formatDateTime(currentUser.last_login_at, t('Sessão atual'))}</DetailItem>
        </dl>
      </Panel>

      <Panel title={t('Dados pessoais')} description={t('Opcionais. Pode completá-los quando quiser.')}>
        <form onSubmit={handleSubmit} className="max-w-xl space-y-4" noValidate>
          {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
          {successMessage && (
            <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
              {successMessage}
            </Alert>
          )}
          <TextField
            label={t('Nome de apresentação')}
            autoComplete="nickname"
            maxLength={MAX_DISPLAY_NAME_LENGTH}
            value={displayName}
            error={fieldErrors.displayName}
            placeholder={currentUser.full_name.split(' ')[0]}
            hint={t('Como prefere ser tratado na saudação e no cabeçalho. O nome completo oficial não muda.')}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          <TextField
            label={t('Telefone')}
            type="tel"
            autoComplete="tel"
            maxLength={MAX_PHONE_LENGTH}
            value={phone}
            error={fieldErrors.phone}
            onChange={(event) => setPhone(event.target.value)}
          />
          <Button type="submit" isLoading={isSubmitting}>
            {t('Guardar dados pessoais')}
          </Button>
        </form>
      </Panel>

      <Panel title={t('Preferências')} description={t('Aplicadas de imediato e guardadas no seu perfil (valem em qualquer dispositivo).')}>
        <div className="space-y-5">
          {saveError && <Alert variant="warning">{t('A preferência foi aplicada neste browser, mas não foi guardada no perfil: {error}', { error: saveError })}</Alert>}
          <ChoiceGroup
            label={t('Idioma')}
            options={LOCALES.map((option) => ({ value: option, label: LOCALE_NAMES[option], lang: option }))}
            value={locale}
            onChange={changeLocale}
          />
          <ChoiceGroup
            label={t('Tema')}
            options={THEME_OPTIONS.map((option) => ({ ...option, label: t(option.label) }))}
            value={themePreference}
            onChange={changeTheme}
          />
        </div>
      </Panel>
    </div>
  );
};
