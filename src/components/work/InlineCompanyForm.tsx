import React, { useState } from 'react';
import { Building2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { createCompany, findSimilarCompanies } from '../../services/work/opportunityService';
import type { Company } from '../../types/work';
import type { CompanyFormField, CompanyFormValues } from '../../utils/work';
import { validateCompanyForm } from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors, optionalText } from '../../utils/validation';

interface InlineCompanyFormProps {
  /** Empresa criada ou existente escolhida: fica selecionada na oportunidade. */
  onSelected: (company: Company, message: string) => void;
  onCancel: () => void;
}

const EMPTY: CompanyFormValues = { name: '', nuit: '', contactName: '', phone: '', email: '', address: '', website: '', notes: '' };

/**
 * Registo de uma empresa sem sair do formulário da oportunidade. Antes de criar, mostra as empresas
 * parecidas (mesmo NUIT ou nome semelhante): nada é duplicado em silêncio. O NUIT e o nome exato
 * são também únicos na base de dados.
 */
export const InlineCompanyForm: React.FC<InlineCompanyFormProps> = ({ onSelected, onCancel }) => {
  const [values, setValues] = useState<CompanyFormValues>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<CompanyFormField>>({});
  const [similar, setSimilar] = useState<Company[] | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const updateValue = (field: CompanyFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    if (field === 'name' || field === 'nuit') setSimilar(null);
  };

  const nuit = values.nuit.trim();
  const sameNuit = similar?.find((company) => nuit !== '' && company.nuit === nuit) ?? null;

  const create = async () => {
    setIsSaving(true);
    setErrorMessage(null);
    try {
      const input = {
        name: values.name.trim(),
        nuit: optionalText(values.nuit),
        contactName: optionalText(values.contactName),
        phone: optionalText(values.phone),
        email: optionalText(values.email),
        address: optionalText(values.address),
        website: optionalText(values.website),
        notes: values.notes.trim(),
        status: 'ACTIVE' as const,
      };
      const companyId = await createCompany(input);
      onSelected({ id: companyId, ...input }, `Empresa ${input.name} registada e selecionada.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível registar a empresa.'));
    } finally {
      setIsSaving(false);
    }
  };

  const handleSave = async () => {
    setErrorMessage(null);
    const errors = validateCompanyForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;
    if (similar !== null) {
      // Já viu as empresas semelhantes e escolheu criar mesmo assim.
      await create();
      return;
    }
    setIsSaving(true);
    try {
      const matches = await findSimilarCompanies(values.name, optionalText(values.nuit));
      if (matches.length > 0) {
        setSimilar(matches);
        return;
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível verificar empresas semelhantes.'));
      return;
    } finally {
      setIsSaving(false);
    }
    await create();
  };

  // Enter num campo da empresa guarda a empresa, não a oportunidade.
  const onKeyDown = (event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (event.target as HTMLElement).tagName === 'INPUT') {
      event.preventDefault();
      handleSave();
    }
  };

  return (
    <section className="space-y-3 rounded-md border border-border bg-background p-4" aria-label="Nova empresa" onKeyDown={onKeyDown}>
      <h3 className="flex items-center gap-2 text-sm font-semibold text-text">
        <Building2 className="h-4 w-4 text-sidebar" aria-hidden="true" />
        Nova empresa
      </h3>
      {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <TextField label="Nome da empresa" required maxLength={200} value={values.name} error={fieldErrors.name} onChange={(event) => updateValue('name', event.target.value)} />
        <TextField label="NUIT" inputMode="numeric" maxLength={9} value={values.nuit} error={fieldErrors.nuit} hint="9 dígitos, quando aplicável" onChange={(event) => updateValue('nuit', event.target.value)} />
        <TextField label="Contacto principal" maxLength={150} value={values.contactName} onChange={(event) => updateValue('contactName', event.target.value)} />
        <TextField label="Telefone" type="tel" maxLength={30} value={values.phone} onChange={(event) => updateValue('phone', event.target.value)} />
        <TextField label="E-mail" type="email" maxLength={255} value={values.email} error={fieldErrors.email} onChange={(event) => updateValue('email', event.target.value)} />
        <TextField label="Website" type="url" maxLength={255} value={values.website} error={fieldErrors.website} placeholder="https://" onChange={(event) => updateValue('website', event.target.value)} />
      </div>
      <TextField label="Endereço" maxLength={500} value={values.address} onChange={(event) => updateValue('address', event.target.value)} />
      <TextAreaField label="Observações" rows={2} maxLength={5000} value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} />
      <p className="text-xs text-text-muted">Estado: ativa (pode ser inativada mais tarde em Empresas).</p>

      {similar !== null && (
        <div role="status" className="space-y-2 rounded-md border border-warning/30 bg-warning-soft p-3">
          <p className="text-sm font-medium text-warning">
            {sameNuit ? 'Já existe uma empresa com este NUIT.' : 'Encontrámos empresas parecidas. Confirme se não é uma delas.'}
          </p>
          <ul className="space-y-1">
            {similar.map((company) => (
              <li key={company.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                <span className="text-text">
                  {company.name}
                  {company.nuit ? ` · NUIT ${company.nuit}` : ''}
                  {company.status === 'INACTIVE' ? ' · inativa' : ''}
                </span>
                {company.status === 'ACTIVE' && (
                  <Button size="sm" variant="secondary" onClick={() => onSelected(company, `Empresa ${company.name} selecionada.`)}>
                    Usar esta
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="secondary" onClick={onCancel} disabled={isSaving}>
          Cancelar
        </Button>
        {!sameNuit && (
          <Button onClick={handleSave} isLoading={isSaving}>
            {similar !== null ? 'Criar mesmo assim' : 'Guardar empresa'}
          </Button>
        )}
      </div>
    </section>
  );
};
