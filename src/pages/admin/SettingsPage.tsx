import React, { useEffect, useState } from 'react';
import { Save } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { listSystemSettings, updateSystemSettings } from '../../services/settingsService';
import type { SystemSetting } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/FormField';
import { ErrorState, LoadingState } from '../../components/ui/States';
import type { FieldErrors, SettingsFormField, SettingsFormValues } from '../../utils/validation';
import {
  hasErrors,
  MAX_DAILY_TARGET_HOURS,
  MIN_DAILY_TARGET_HOURS,
  validateSettingsForm,
} from '../../utils/validation';

const SETTING_KEYS = {
  companyName: 'COMPANY_NAME',
  timezone: 'DEFAULT_TIMEZONE',
  language: 'DEFAULT_LANGUAGE',
  periodType: 'TIMESHEET_PERIOD_TYPE',
  dailyTargetHours: 'TIMESHEET_DAILY_TARGET_HOURS',
  allowWeekendEntries: 'ALLOW_WEEKEND_ENTRIES',
} as const;

const PERIOD_TYPE_LABELS: Record<string, string> = {
  MONTHLY: 'Mensal',
  BIWEEKLY: 'Quinzenal',
  WEEKLY: 'Semanal',
};

function settingValue(settings: SystemSetting[], key: string): string {
  return settings.find((setting) => setting.key === key)?.value ?? '';
}

function toFormValues(settings: SystemSetting[]): SettingsFormValues {
  return {
    companyName: settingValue(settings, SETTING_KEYS.companyName),
    periodType: settingValue(settings, SETTING_KEYS.periodType),
    dailyTargetHours: settingValue(settings, SETTING_KEYS.dailyTargetHours),
    allowWeekendEntries: settingValue(settings, SETTING_KEYS.allowWeekendEntries) === 'true',
  };
}

function changedSettings(original: SettingsFormValues, current: SettingsFormValues): Record<string, string> {
  const changes: Record<string, string> = {};
  if (current.companyName.trim() !== original.companyName) changes[SETTING_KEYS.companyName] = current.companyName.trim();
  if (current.periodType !== original.periodType) changes[SETTING_KEYS.periodType] = current.periodType;
  if (current.dailyTargetHours !== original.dailyTargetHours) {
    changes[SETTING_KEYS.dailyTargetHours] = current.dailyTargetHours;
  }
  if (current.allowWeekendEntries !== original.allowWeekendEntries) {
    changes[SETTING_KEYS.allowWeekendEntries] = String(current.allowWeekendEntries);
  }
  return changes;
}

export const SettingsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canManage = hasPermission('SYSTEM_SETTINGS_MANAGE');
  const settings = useAsyncData(listSystemSettings, []);

  const [values, setValues] = useState<SettingsFormValues | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<SettingsFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (settings.data) setValues(toFormValues(settings.data));
  }, [settings.data]);

  if (settings.error) return <ErrorState message={settings.error} onRetry={settings.reload} />;
  if (!settings.data || !values) return <LoadingState label="A carregar configurações..." />;

  const originalValues = toFormValues(settings.data);
  const changes = changedSettings(originalValues, values);
  const hasChanges = Object.keys(changes).length > 0;

  const updateValue = <Field extends SettingsFormField>(field: Field, value: SettingsFormValues[Field]) => {
    setValues((current) => (current ? { ...current, [field]: value } : current));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    setSuccessMessage(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateSettingsForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors) || !hasChanges) return;

    setIsSaving(true);
    try {
      await updateSystemSettings(changes);
      setSuccessMessage('Configurações guardadas com sucesso.');
      settings.reload();
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar as configurações.'));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="max-w-4xl space-y-6">
      <PageHeader title="Configurações" subtitle="Parâmetros institucionais e regras de registo de horas." />

      {!canManage && <Alert variant="info">Tem acesso apenas de leitura às configurações.</Alert>}
      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}

      <form onSubmit={handleSubmit} className="space-y-6" noValidate>
        <Panel title="Identidade institucional">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Nome da empresa"
              required
              disabled={!canManage}
              value={values.companyName}
              error={fieldErrors.companyName}
              onChange={(event) => updateValue('companyName', event.target.value)}
            />
            <TextField
              label="Idioma"
              disabled
              value={settingValue(settings.data, SETTING_KEYS.language)}
              hint="A plataforma está disponível apenas em português (pt-PT)."
            />
          </div>
        </Panel>

        <Panel title="Regras de timesheet">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField
              label="Fuso horário"
              disabled
              value={settingValue(settings.data, SETTING_KEYS.timezone)}
              hint="Fuso horário oficial de operação (CAT, UTC+2)."
            />
            <SelectField
              label="Ciclo de apuração"
              required
              disabled={!canManage}
              value={values.periodType}
              error={fieldErrors.periodType}
              onChange={(event) => updateValue('periodType', event.target.value)}
            >
              {Object.entries(PERIOD_TYPE_LABELS).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Meta diária de horas"
              type="number"
              inputMode="numeric"
              min={MIN_DAILY_TARGET_HOURS}
              max={MAX_DAILY_TARGET_HOURS}
              required
              disabled={!canManage}
              value={values.dailyTargetHours}
              error={fieldErrors.dailyTargetHours}
              hint={`Entre ${MIN_DAILY_TARGET_HOURS} e ${MAX_DAILY_TARGET_HOURS} horas.`}
              onChange={(event) => updateValue('dailyTargetHours', event.target.value)}
            />
            <div className="flex items-start gap-3 pt-7">
              <input
                id="allow-weekend-entries"
                type="checkbox"
                disabled={!canManage}
                checked={values.allowWeekendEntries}
                onChange={(event) => updateValue('allowWeekendEntries', event.target.checked)}
                className="mt-0.5 h-4 w-4 accent-primary-hover"
              />
              <label htmlFor="allow-weekend-entries" className="text-sm text-text">
                Permitir registo de horas ao fim de semana
              </label>
            </div>
          </div>
        </Panel>

        {canManage && (
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              variant="secondary"
              disabled={!hasChanges || isSaving}
              onClick={() => {
                setValues(originalValues);
                setFieldErrors({});
              }}
            >
              Cancelar alterações
            </Button>
            <Button type="submit" icon={Save} isLoading={isSaving} disabled={!hasChanges}>
              Guardar configurações
            </Button>
          </div>
        )}
      </form>
    </div>
  );
};
