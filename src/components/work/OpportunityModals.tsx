import React, { useEffect, useState } from 'react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { InlineCompanyForm } from './InlineCompanyForm';
import { MoreOptions } from '../ui/MoreOptions';
import { PeoplePicker } from './PeoplePicker';
import { getErrorMessage } from '../../lib/errors';
import { assignProjectTeam, changeOpportunityStatus, createCompany, createOpportunity, updateCompany, updateOpportunity } from '../../services/work/opportunityService';
import type { Company, OpportunityDetail, OpportunityStatus, WorkPerson } from '../../types/work';
import type { CompanyFormField, CompanyFormValues, OpportunityFormField, OpportunityFormValues } from '../../utils/work';
import {
  OPPORTUNITY_STATUS_LABELS,
  isOpportunityActive,
  isOpportunityCleared,
  nextOpportunityStatuses,
  opportunityStatusNeedsNote,
  parseAmount,
  validateCompanyForm,
  validateOpportunityForm,
  validateReason,
} from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors, optionalText } from '../../utils/validation';
import { t } from '../../lib/i18n';

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
        onSaved(company.id, t('Empresa atualizada.'));
      } else {
        onSaved(await createCompany(input), t('Empresa registada.'));
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar a empresa.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'company-form';
  return (
    <Modal
      isOpen={isOpen}
      title={company ? t('Editar {name}', { name: company.name }) : t('Nova empresa')}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {company ? t('Guardar alterações') : t('Registar empresa')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label={t('Nome')} required maxLength={200} value={values.name} error={fieldErrors.name} onChange={(event) => updateValue('name', event.target.value)} />
          <TextField label="NUIT" inputMode="numeric" maxLength={9} value={values.nuit} error={fieldErrors.nuit} onChange={(event) => updateValue('nuit', event.target.value)} />
          <TextField label={t('Contacto')} maxLength={150} value={values.contactName} onChange={(event) => updateValue('contactName', event.target.value)} />
          <TextField label={t('Telefone')} type="tel" maxLength={30} value={values.phone} onChange={(event) => updateValue('phone', event.target.value)} />
          <TextField label={t('E-mail')} type="email" maxLength={255} value={values.email} error={fieldErrors.email} onChange={(event) => updateValue('email', event.target.value)} />
          <TextField label={t('Site')} type="url" maxLength={255} value={values.website} error={fieldErrors.website} placeholder="https://" onChange={(event) => updateValue('website', event.target.value)} />
        </div>
        <TextField label={t('Endereço')} maxLength={500} value={values.address} onChange={(event) => updateValue('address', event.target.value)} />
        <TextAreaField label={t('Notas')} rows={3} maxLength={5000} value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} />
        {company && (
          <label className="flex items-center gap-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-primary-hover" checked={active} onChange={(event) => setActive(event.target.checked)} />
            {t('Empresa ativa (as inativas não aceitam novas oportunidades)')}
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
  /** Permite registar a empresa sem sair do formulário (TIMESHEET_OPPORTUNITY_CREATE). */
  canCreateCompany?: boolean;
  /** Só na criação: candidatos a gestor de execução (perfis de gestão de equipa). */
  teamLeads?: WorkPerson[];
  /** Só na criação: colaboradores que podem integrar a equipa do projeto. */
  people?: WorkPerson[];
  onClose: () => void;
  /** `warning` quando a oportunidade foi registada mas parte da equipa não ficou associada. */
  onSaved: (opportunityId: string, message: string, variant?: 'success' | 'warning') => void;
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

export const OpportunityFormModal: React.FC<OpportunityFormModalProps> = ({
  isOpen,
  opportunity,
  companies,
  owners,
  canCreateCompany = false,
  teamLeads = [],
  people = [],
  onClose,
  onSaved,
}) => {
  const [values, setValues] = useState<OpportunityFormValues>(() => initialOpportunityValues(opportunity));
  const [executionLeadId, setExecutionLeadId] = useState('');
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const [createdCompanies, setCreatedCompanies] = useState<Company[]>([]);
  const [isCompanyFormOpen, setIsCompanyFormOpen] = useState(false);
  const [companyNotice, setCompanyNotice] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<OpportunityFormField | 'reason'>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const isClosed = opportunity !== null && ['WON', 'LOST', 'CANCELLED'].includes(opportunity.status);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialOpportunityValues(opportunity));
    setCreatedCompanies([]);
    setIsCompanyFormOpen(false);
    setCompanyNotice(null);
    setReason('');
    setExecutionLeadId('');
    setMemberIds([]);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen, opportunity]);

  const updateValue = (field: OpportunityFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
    // O responsável comercial não pode ser também gestor de execução nem membro.
    if (field === 'ownerId' && value) {
      setExecutionLeadId((current) => (current === value ? '' : current));
      setMemberIds((current) => current.filter((id) => id !== value));
    }
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage(null);
    const errors: FieldErrors<OpportunityFormField | 'reason'> = validateOpportunityForm(values);
    const reasonError = isClosed ? validateReason(reason, t('Indique o motivo da alteração de uma oportunidade fechada')) : null;
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
        onSaved(opportunity.id, t('Oportunidade atualizada.'));
      } else {
        const opportunityId = await createOpportunity(input, values.ownerId || null);
        const hasTeam = Boolean(executionLeadId) || memberIds.length > 0;
        const failures = hasTeam ? await assignProjectTeam(opportunityId, executionLeadId || null, memberIds) : [];
        if (failures.length > 0) {
          const nameOf = (profileId: string) => [...teamLeads, ...people].find((person) => person.profileId === profileId)?.fullName ?? 'Colaborador';
          onSaved(
            opportunityId,
            t('Oportunidade registada, mas não foi possível associar: {people}. Pode acrescentá-los na secção Equipa do projeto.', {
              people: failures.map((failure) => `${nameOf(failure.profileId)} (${failure.error})`).join('; '),
            }),
            'warning'
          );
        } else {
          onSaved(opportunityId, hasTeam ? t('Oportunidade registada. A equipa do projeto foi associada e notificada.') : t('Oportunidade registada.'));
        }
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar a oportunidade.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const allCompanies = [...createdCompanies.filter((created) => !companies.some((company) => company.id === created.id)), ...companies];
  const selectableCompanies = allCompanies
    .filter((company) => company.status === 'ACTIVE' || company.id === opportunity?.companyId)
    .sort((first, second) => first.name.localeCompare(second.name, 'pt'));
  const formId = 'opportunity-form';
  return (
    <Modal
      isOpen={isOpen}
      title={opportunity ? t('Editar {reference}', { reference: opportunity.reference }) : t('Nova oportunidade')}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            {opportunity ? t('Guardar alterações') : t('Registar oportunidade')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField label={t('Título')} required maxLength={200} value={values.title} error={fieldErrors.title} onChange={(event) => updateValue('title', event.target.value)} />
        {isCompanyFormOpen && (
          <InlineCompanyForm
            onCancel={() => setIsCompanyFormOpen(false)}
            onSelected={(company, notice) => {
              setCreatedCompanies((current) => (current.some((existing) => existing.id === company.id) ? current : [company, ...current]));
              updateValue('companyId', company.id);
              setCompanyNotice(notice);
              setIsCompanyFormOpen(false);
            }}
          />
        )}
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <div className="space-y-1">
            <SelectField label={t('Empresa')} required value={values.companyId} error={fieldErrors.companyId} onChange={(event) => updateValue('companyId', event.target.value)}>
              <option value="">{t('Selecione…')}</option>
              {selectableCompanies.map((company) => (
                <option key={company.id} value={company.id}>
                  {company.name}
                </option>
              ))}
            </SelectField>
            {canCreateCompany && !isCompanyFormOpen && (
              <button type="button" onClick={() => setIsCompanyFormOpen(true)} className="text-xs font-semibold text-primary-hover hover:underline">
                {t('A empresa não existe? Criar empresa')}
              </button>
            )}
            {companyNotice && <p className="text-xs text-success">{companyNotice}</p>}
          </div>
          {!opportunity && owners.length > 0 && (
            <SelectField
              label={t('Responsável comercial')}
              value={values.ownerId}
              hint={t('Acompanha a relação com o cliente. Por omissão, fica consigo. A execução é coordenada pelo gestor responsável (Equipa do projeto).')}
              onChange={(event) => updateValue('ownerId', event.target.value)}
            >
              <option value="">{t('Eu próprio')}</option>
              {owners.map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.fullName}
                </option>
              ))}
            </SelectField>
          )}
          <TextField
            label={t('Valor estimado')}
            inputMode="decimal"
            value={values.estimatedValue}
            error={fieldErrors.estimatedValue}
            hint={t('Ex.: 500 000,00. Aparece no pedido de aprovação.')}
            onChange={(event) => updateValue('estimatedValue', event.target.value)}
          />
          <TextField label={t('Moeda')} maxLength={3} value={values.currency} error={fieldErrors.currency} onChange={(event) => updateValue('currency', event.target.value.toUpperCase())} />
        </div>

        <MoreOptions
          title={t('Previsão comercial')}
          summary={[values.probability ? `${values.probability}%` : null, values.expectedCloseDate || null, values.initialValue ? 'valor inicial' : null].filter(Boolean).join(' · ') || 'opcional'}
          defaultOpen={Boolean(values.probability || values.expectedCloseDate || values.initialValue)}
          forceOpen={Boolean(fieldErrors.initialValue || fieldErrors.probability)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField label={t('Valor inicial')} inputMode="decimal" value={values.initialValue} error={fieldErrors.initialValue} onChange={(event) => updateValue('initialValue', event.target.value)} />
            <TextField label={t('Probabilidade (%)')} type="number" min={0} max={100} value={values.probability} error={fieldErrors.probability} onChange={(event) => updateValue('probability', event.target.value)} />
            <TextField label={t('Data esperada de fecho')} type="date" value={values.expectedCloseDate} onChange={(event) => updateValue('expectedCloseDate', event.target.value)} />
          </div>
        </MoreOptions>

        <MoreOptions
          title={t('Contacto do cliente')}
          summary={values.contactName.trim() || 'opcional'}
          defaultOpen={Boolean(values.contactName || values.contactPhone || values.contactEmail)}
          forceOpen={Boolean(fieldErrors.contactEmail)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <TextField label={t('Contacto')} maxLength={150} value={values.contactName} onChange={(event) => updateValue('contactName', event.target.value)} />
            <TextField label={t('Telefone do contacto')} type="tel" maxLength={30} value={values.contactPhone} onChange={(event) => updateValue('contactPhone', event.target.value)} />
            <TextField label={t('E-mail do contacto')} type="email" maxLength={255} value={values.contactEmail} error={fieldErrors.contactEmail} onChange={(event) => updateValue('contactEmail', event.target.value)} />
          </div>
        </MoreOptions>

        <MoreOptions
          title={t('Necessidade e proposta')}
          summary={values.description.trim() || values.problem.trim() || values.proposal.trim() ? 'preenchidas' : 'opcionais'}
          defaultOpen={Boolean(values.description || values.problem || values.proposal)}
        >
          <TextAreaField label={t('Descrição')} rows={2} maxLength={5000} value={values.description} onChange={(event) => updateValue('description', event.target.value)} />
          <TextAreaField label={t('Necessidade identificada')} rows={2} maxLength={5000} value={values.problem} onChange={(event) => updateValue('problem', event.target.value)} />
          <TextAreaField label={t('Proposta')} rows={2} maxLength={5000} value={values.proposal} onChange={(event) => updateValue('proposal', event.target.value)} />
        </MoreOptions>

        <MoreOptions
          title={t('Seguimento')}
          summary={values.nextStep.trim() || 'opcional'}
          defaultOpen={Boolean(values.nextStep || values.nextStepDate || values.notes)}
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <TextField label={t('Próxima atividade')} maxLength={300} value={values.nextStep} onChange={(event) => updateValue('nextStep', event.target.value)} />
            <TextField label={t('Data da próxima atividade')} type="date" value={values.nextStepDate} hint={t('Aparece no calendário.')} onChange={(event) => updateValue('nextStepDate', event.target.value)} />
          </div>
          <TextAreaField label={t('Observações')} rows={2} maxLength={5000} value={values.notes} onChange={(event) => updateValue('notes', event.target.value)} />
        </MoreOptions>

        {!opportunity && (teamLeads.length > 0 || people.length > 0) && (
          <MoreOptions
            title={t('Equipa do projeto')}
            summary={executionLeadId || memberIds.length > 0 ? `${memberIds.length + (executionLeadId ? 1 : 0)} pessoa(s)` : 'opcional'}
            defaultOpen
          >
            {teamLeads.length > 0 && (
              <SelectField
                label={t('Gestor responsável pela execução')}
                value={executionLeadId}
                hint={t('Gestor que coordena a execução e distribui as tarefas pela equipa do projeto; pode ser de outro departamento. Não altera os dados comerciais.')}
                onChange={(event) => {
                  setExecutionLeadId(event.target.value);
                  setMemberIds((current) => current.filter((id) => id !== event.target.value));
                }}
              >
                <option value="">{t('Sem gestor de execução')}</option>
                {teamLeads
                  .filter((person) => person.profileId !== values.ownerId)
                  .map((person) => (
                    <option key={person.profileId} value={person.profileId}>
                      {person.departmentName ? `${person.fullName} · ${person.departmentName}` : person.fullName}
                    </option>
                  ))}
              </SelectField>
            )}
            {people.length > 0 && (
              <PeoplePicker
                label={t('Colaboradores do projeto')}
                people={people.filter((person) => person.profileId !== values.ownerId && person.profileId !== executionLeadId)}
                selectedIds={memberIds}
                onChange={setMemberIds}
                hint={t('Colaboradores (não gestores). Passam a ver a oportunidade, comentar e registar tempo, e o gestor responsável pode atribuir-lhes tarefas. Cada pessoa é notificada.')}
              />
            )}
          </MoreOptions>
        )}
        {isClosed && (
          <TextAreaField label={t('Motivo da alteração')} required rows={2} maxLength={1000} value={reason} error={fieldErrors.reason} onChange={(event) => setReason(event.target.value)} />
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
  const options = opportunity ? nextOpportunityStatuses(opportunity.status, canManage, opportunity.approvalStatus) : [];
  const awaitingApproval = opportunity !== null && isOpportunityActive(opportunity.status) && !isOpportunityCleared(opportunity.approvalStatus);
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
      setErrorMessage(t('Selecione o novo estado.'));
      return;
    }
    const validation = needsNote ? validateReason(note, status === 'LOST' ? t('Indique o motivo da perda') : t('Indique o motivo')) : null;
    setNoteError(validation);
    if (validation) return;
    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      await changeOpportunityStatus(opportunity.id, status, note.trim() || null);
      onSaved(t('Oportunidade: {status}.', { status: OPPORTUNITY_STATUS_LABELS[status].toLowerCase() }));
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível alterar o estado.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'opportunity-status-form';
  return (
    <Modal
      isOpen={opportunity !== null}
      title={t('Alterar etapa')}
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} variant={status === 'LOST' || status === 'CANCELLED' ? 'danger' : 'primary'} isLoading={isSubmitting}>
            {t('Confirmar')}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {awaitingApproval && (
          <Alert variant="info">{t('Proposta, Negociação e Ganha ficam disponíveis depois da aprovação do Manager.')}</Alert>
        )}
        <SelectField
          label={t('Novo estado')}
          required
          value={status}
          onChange={(event) => {
            const value = options.find((option) => option === event.target.value);
            setStatus(value ?? '');
          }}
        >
          <option value="">{t('Selecione…')}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {OPPORTUNITY_STATUS_LABELS[option]}
            </option>
          ))}
        </SelectField>
        <TextAreaField
          label={needsNote ? 'Motivo' : t('Nota (opcional)')}
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
