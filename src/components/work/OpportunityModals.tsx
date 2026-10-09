import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { getErrorMessage } from '../../lib/errors';
import { changeOpportunityStatus, createCompany, createOpportunity, updateCompany, updateOpportunity } from '../../services/work/opportunityService';
import type { Company, OpportunityDetail, OpportunityStatus, WorkPerson } from '../../types/work';
import type { CompanyFormField, CompanyFormValues, OpportunityFormField, OpportunityFormValues } from '../../utils/work';
import {
  OPPORTUNITY_STATUS_LABELS,
  nextOpportunityStatuses,
  opportunityStatusNeedsNote,
  parseAmount,
  validateCompanyForm,
  validateOpportunityForm,
  validateReason,
} from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors, optionalText } from '../../utils/validation';

// ---------------------------------------------------------------------------- empresa

interface CompanyFormModalProps {
  isOpen: boolean;
  company: Company | null;
  onClose: () => void;
  onSaved: (companyId: string, message: string) => void;
}

export const CompanyFormModal: React.FC<CompanyFormModalProps> = ({ isOpen, company, onClose, onSaved }) => {
  const [values, setValues] = useState<CompanyFormValues>({ name: '', nuit: '', contactName: '', phone: '', email: '', address: '', website: '', notes: '' });
  const [active, setActive] = useState(true);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<CompanyFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    setValues({
      name: company?.name ?? '',
      nuit: company?.nuit ?? '',
      contactName: company?.contactName ?? '',
      phone: company?.phone ?? '',
      email: company?.email ?? '',
      address: company?.address ?? '',
      website: company?.website ?? '',
      notes: company?.notes ?? '',
    });
    setActive(company ? company.status === 'ACTIVE' : true);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, company]);

  const updateValue = (field: CompanyFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors = validateCompanyForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;
    const input = {
      name: values.name.trim(),
      nuit: optionalText(values.nuit),
      contactName: optionalText(values.contactName),
      phone: optionalText(values.phone),
      email: optionalText(values.email),
      address: optionalText(values.address),
      website: optionalText(values.website),
      notes: values.notes.trim(),
      status: active ? ('ACTIVE' as const) : ('INACTIVE' as const),
    };
    setIsSubmitting(true);
    try {
      if (company) {
        await updateCompany(company.id, input);
        onSaved(company.id, 'Empresa atualizada.');
      } else {
        onSaved(await createCompany(input), 'Empresa registada.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar a empresa.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'company-form';
  return (
    <Modal
      isOpen={isOpen}
      title={company ? `Editar ${company.name}` : 'Nova empresa'}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {company ? 'Guardar alterações' : 'Registar empresa'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Nome" required maxLength={200} value={values.name} error={fieldErrors.name} onChange={(event) => updateValue('name', event.target.value)} />
          <TextField label="NUIT" inputMode="numeric" maxLength={9} value={values.nuit} error={fieldErrors.nuit} onChange={(event) => updateValue('nuit', event.target.value)} />
          <TextField label="Contacto" maxLength={150} value={values.contactName} onChange={(event) => updateValue('contactName', event.target.value)} />
          <TextField label="Telefone" type="tel" maxLength={30} value={values.phone} onChange={(event) => updateValue('phone', event.target.value)} />
          <TextField label="E-mail" type="email" maxLength={255} value={values.email} error={fieldErrors.email} onChange={(event) => updateValue('email', event.target.value)} />
          <TextField label="Site" type="url" maxLength={255} value={values.website} error={fieldErrors.website} placeholder="https://" onChange={(event) => updateValue('website', event.target.value)} />
        </div>
        <TextField label="Endereço" maxLength={500} value={values.address} onChange={(event) => updateValue('address', event.target.value)} />
        <TextAreaField label="Notas" rows={3} maxLength={5000} value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} />
        {company && (
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-primary-hover" checked={active} onChange={(event) => setActive(event.target.checked)} />
            Empresa ativa (as inativas não aceitam novas oportunidades)
          </label>
        )}
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------- oportunidade

interface OpportunityFormModalProps {
  isOpen: boolean;
  opportunity: OpportunityDetail | null;
  companies: Company[];
  /** Responsáveis possíveis (só na criação; a mudança de responsável é uma ação própria). */
  owners: WorkPerson[];
  onClose: () => void;
  onSaved: (opportunityId: string, message: string) => void;
}

function amountText(value: number | null): string {
  return value === null ? '' : String(value).replace('.', ',');
}

function initialOpportunityValues(opportunity: OpportunityDetail | null): OpportunityFormValues {
  return {
    title: opportunity?.title ?? '',
    companyId: opportunity?.companyId ?? '',
    ownerId: '',
    contactName: opportunity?.contactName ?? '',
    contactPhone: opportunity?.contactPhone ?? '',
    contactEmail: opportunity?.contactEmail ?? '',
    description: opportunity?.description ?? '',
    problem: opportunity?.problem ?? '',
    proposal: opportunity?.proposal ?? '',
    initialValue: amountText(opportunity?.initialValue ?? null),
    estimatedValue: amountText(opportunity?.estimatedValue ?? null),
    currency: opportunity?.currency ?? 'MZN',
    probability: opportunity?.probability === null || opportunity?.probability === undefined ? '' : String(opportunity.probability),
    expectedCloseDate: opportunity?.expectedCloseDate ?? '',
    nextStep: opportunity?.nextStep ?? '',
    nextStepDate: opportunity?.nextStepDate ?? '',
    notes: opportunity?.notes ?? '',
  };
}

export const OpportunityFormModal: React.FC<OpportunityFormModalProps> = ({ isOpen, opportunity, companies, owners, onClose, onSaved }) => {
  const [values, setValues] = useState<OpportunityFormValues>(() => initialOpportunityValues(opportunity));
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<OpportunityFormField | 'reason'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isClosed = opportunity !== null && ['WON', 'LOST', 'CANCELLED'].includes(opportunity.status);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialOpportunityValues(opportunity));
    setReason('');
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, opportunity]);

  const updateValue = (field: OpportunityFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors: FieldErrors<OpportunityFormField | 'reason'> = validateOpportunityForm(values);
    const reasonError = isClosed ? validateReason(reason, 'Indique o motivo da alteração de uma oportunidade fechada') : null;
    if (reasonError) errors.reason = reasonError;
    setFieldErrors(errors);
    if (hasErrors(errors)) return;
    const input = {
      title: values.title.trim(),
      companyId: values.companyId,
      contactName: optionalText(values.contactName),
      contactPhone: optionalText(values.contactPhone),
      contactEmail: optionalText(values.contactEmail),
      description: values.description.trim(),
      problem: values.problem.trim(),
      proposal: values.proposal.trim(),
      initialValue: parseAmount(values.initialValue),
      estimatedValue: parseAmount(values.estimatedValue),
      currency: values.currency.trim().toUpperCase(),
      probability: values.probability.trim() ? Number(values.probability) : null,
      expectedCloseDate: values.expectedCloseDate || null,
      nextStep: optionalText(values.nextStep),
      nextStepDate: values.nextStepDate || null,
      notes: values.notes.trim(),
    };
    setIsSubmitting(true);
    try {
      if (opportunity) {
        await updateOpportunity(opportunity.id, input, reason.trim() || null, opportunity.updatedAt);
        onSaved(opportunity.id, 'Oportunidade atualizada.');
      } else {
        onSaved(await createOpportunity(input, values.ownerId || null), 'Oportunidade registada.');
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível guardar a oportunidade.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const selectableCompanies = companies.filter((company) => company.status === 'ACTIVE' || company.id === opportunity?.companyId);
  const formId = 'opportunity-form';
  return (
    <Modal
      isOpen={isOpen}
      title={opportunity ? `Editar ${opportunity.reference}` : 'Nova oportunidade'}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {opportunity ? 'Guardar alterações' : 'Registar oportunidade'}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField label="Título" required maxLength={200} value={values.title} error={fieldErrors.title} onChange={(event) => updateValue('title', event.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <SelectField label="Empresa" required value={values.companyId} error={fieldErrors.companyId} onChange={(event) => updateValue('companyId', event.target.value)}>
            <option value="">Selecione…</option>
            {selectableCompanies.map((company) => (
              <option key={company.id} value={company.id}>
                {company.name}
              </option>
            ))}
          </SelectField>
          {!opportunity && owners.length > 0 && (
            <SelectField label="Responsável" value={values.ownerId} hint="Por omissão, fica consigo." onChange={(event) => updateValue('ownerId', event.target.value)}>
              <option value="">Eu próprio</option>
              {owners.map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.fullName}
                </option>
              ))}
            </SelectField>
          )}
          <TextField label="Contacto" maxLength={150} value={values.contactName} onChange={(event) => updateValue('contactName', event.target.value)} />
          <TextField label="Telefone do contacto" type="tel" maxLength={30} value={values.contactPhone} onChange={(event) => updateValue('contactPhone', event.target.value)} />
          <TextField label="E-mail do contacto" type="email" maxLength={255} value={values.contactEmail} error={fieldErrors.contactEmail} onChange={(event) => updateValue('contactEmail', event.target.value)} />
          <TextField label="Data esperada de fecho" type="date" value={values.expectedCloseDate} onChange={(event) => updateValue('expectedCloseDate', event.target.value)} />
          <TextField label="Valor inicial" inputMode="decimal" value={values.initialValue} error={fieldErrors.initialValue} hint="Ex.: 500 000,00" onChange={(event) => updateValue('initialValue', event.target.value)} />
          <TextField label="Valor estimado" inputMode="decimal" value={values.estimatedValue} error={fieldErrors.estimatedValue} onChange={(event) => updateValue('estimatedValue', event.target.value)} />
          <TextField label="Moeda" maxLength={3} value={values.currency} error={fieldErrors.currency} onChange={(event) => updateValue('currency', event.target.value.toUpperCase())} />
          <TextField label="Probabilidade (%)" type="number" min={0} max={100} value={values.probability} error={fieldErrors.probability} onChange={(event) => updateValue('probability', event.target.value)} />
        </div>
        <TextAreaField label="Descrição" rows={2} maxLength={5000} value={values.description} onChange={(event) => updateValue('description', event.target.value)} />
        <TextAreaField label="Problema / oportunidade identificada" rows={2} maxLength={5000} value={values.problem} onChange={(event) => updateValue('problem', event.target.value)} />
        <TextAreaField label="Proposta" rows={2} maxLength={5000} value={values.proposal} onChange={(event) => updateValue('proposal', event.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label="Próximo passo" maxLength={300} value={values.nextStep} onChange={(event) => updateValue('nextStep', event.target.value)} />
          <TextField label="Data do próximo passo" type="date" value={values.nextStepDate} hint="Aparece no calendário." onChange={(event) => updateValue('nextStepDate', event.target.value)} />
        </div>
        <TextAreaField label="Observações" rows={2} maxLength={5000} value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} />
        {isClosed && (
          <TextAreaField label="Motivo da alteração" required rows={2} maxLength={1000} value={reason} error={fieldErrors.reason} onChange={(event) => setReason(event.target.value)} />
        )}
      </form>
    </Modal>
  );
};

// ---------------------------------------------------------------------------- etapa

interface OpportunityStatusModalProps {
  opportunity: OpportunityDetail | null;
  canManage: boolean;
  onClose: () => void;
  onSaved: (message: string) => void;
}

export const OpportunityStatusModal: React.FC<OpportunityStatusModalProps> = ({ opportunity, canManage, onClose, onSaved }) => {
  const [status, setStatus] = useState<OpportunityStatus | ''>('');
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const options = opportunity ? nextOpportunityStatuses(opportunity.status, canManage) : [];
  const needsNote = opportunity !== null && status !== '' && opportunityStatusNeedsNote(opportunity.status, status);

  useEffect(() => {
    setStatus('');
    setNote('');
    setNoteError(null);
    setErrorMessage(null);
  }, [opportunity]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!opportunity || !status) {
      setErrorMessage('Selecione o novo estado.');
      return;
    }
    const validation = needsNote ? validateReason(note, status === 'LOST' ? 'Indique o motivo da perda' : 'Indique o motivo') : null;
    setNoteError(validation);
    if (validation) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await changeOpportunityStatus(opportunity.id, status, note.trim() || null);
      onSaved(`Oportunidade: ${OPPORTUNITY_STATUS_LABELS[status].toLowerCase()}.`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível alterar o estado.'));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'opportunity-status-form';
  return (
    <Modal
      isOpen={opportunity !== null}
      title="Alterar etapa"
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} variant={status === 'LOST' || status === 'CANCELLED' ? 'danger' : 'primary'} isLoading={isSubmitting}>
            Confirmar
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <SelectField
          label="Novo estado"
          required
          value={status}
          onChange={(event) => {
            const value = options.find((option) => option === event.target.value);
            setStatus(value ?? '');
          }}
        >
          <option value="">Selecione…</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {OPPORTUNITY_STATUS_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label={needsNote ? 'Motivo' : 'Nota (opcional)'}
          required={needsNote}
          rows={3}
          maxLength={1000}
          value={note}
          error={noteError}
          onChange={(event) => {
            setNote(event.target.value);
            setNoteError(null);
          }}
        />
      </form>
    </Modal>
  );
};
