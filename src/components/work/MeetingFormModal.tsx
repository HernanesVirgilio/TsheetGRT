import React, { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, UsersRound, X } from 'lucide-react';
import { Modal } from '../ui/Modal';
import { Button } from '../ui/Button';
import { Alert } from '../ui/Alert';
import { SelectField, TextAreaField, TextField } from '../ui/FormField';
import { MoreOptions } from '../ui/MoreOptions';
import { PeoplePicker } from './PeoplePicker';
import { useAuth } from '../../lib/auth/AuthContext';
import { getErrorMessage } from '../../lib/errors';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useAsyncData } from '../../hooks/useAsyncData';
import { createMeeting, getScheduleConflicts, listMyLeads, updateMeeting } from '../../services/work/meetingService';
import type { MeetingDetail, ScheduleConflict, WorkPerson } from '../../types/work';
import type { MeetingFormField, MeetingFormValues, SlotSelection } from '../../utils/work';
import { combineDateTime, describeConflict, initialMeetingValues, scheduleSignature, validateMeetingForm } from '../../utils/work';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';
import { pluralize } from '../../utils/format';
import { t } from '../../lib/i18n';

/** Identificador aleatório (UUID v4) para a chave de idempotência. */
function newRequestId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface MeetingFormModalProps {
  isOpen: boolean;
  /** Null = nova reunião. */
  meeting: MeetingDetail | null;
  participantIds: string[];
  people: WorkPerson[];
  links?: { taskId?: string | null; opportunityId?: string | null };
  contextLabel?: string;
  defaultDate?: string;
  /** Intervalo escolhido no calendário (data, início e fim já preenchidos). */
  initialRange?: SlotSelection | null;
  /** Abre já com a opção de pedir a participação de uma chefia ativa (só em reuniões novas). */
  startWithLeadRequest?: boolean;
  onClose: () => void;
  onSaved: (meetingId: string, message: string) => void;
}

/** Resultado da verificação de disponibilidade para um horário e um conjunto de pessoas. */
type Availability =
  | { status: 'idle' }
  | { status: 'checking'; signature: string }
  | { status: 'checked'; signature: string; conflicts: ScheduleConflict[] }
  | { status: 'failed'; signature: string; error: string };

const AVAILABILITY_DELAY_MS = 500;

const AvailabilityNotice: React.FC<{ availability: Availability; signature: string | null; nameOf: (profileId: string, fallback: string) => string }> = ({
  availability,
  signature,
  nameOf,
}) => {
  if (!signature || availability.status === 'idle' || availability.signature !== signature) return null;
  if (availability.status === 'checking') {
    return <p className="text-sm text-text-muted" role="status">{t('A verificar a disponibilidade dos participantes…')}</p>;
  }
  if (availability.status === 'failed') {
    return (
      <Alert variant="warning" title={t('Não foi possível verificar a disponibilidade')}>
        {availability.error} Pode guardar a reunião na mesma.
      </Alert>
    );
  }
  if (availability.conflicts.length === 0) {
    return (
      <p className="flex items-center gap-2 text-sm text-success" role="status">
        <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
        {t('Sem conflitos de agenda neste horário.')}
      </p>
    );
  }
  const byPerson = new Map<string, ScheduleConflict[]>();
  availability.conflicts.forEach((conflict) => byPerson.set(conflict.profileId, [...(byPerson.get(conflict.profileId) ?? []), conflict]));
  return (
    <Alert variant="warning" title={t('{people} outro compromisso neste horário', { people: pluralize(byPerson.size, 'pessoa tem', 'pessoas têm') })}>
      <ul className="mt-1 space-y-1">
        {[...byPerson.entries()].map(([profileId, conflicts]) => (
          <li key={profileId}>
            <span className="font-semibold">{nameOf(profileId, conflicts[0]?.fullName ?? '—')}</span>: {conflicts.map(describeConflict).join('; ')}
          </li>
        ))}
      </ul>
      <p className="mt-2">{t('As reuniões podem sobrepor-se: confirme se pretende manter este horário ou ajuste-o.')}</p>
    </Alert>
  );
};

export const MeetingFormModal: React.FC<MeetingFormModalProps> = ({
  isOpen,
  meeting,
  participantIds,
  people,
  links,
  contextLabel,
  defaultDate,
  initialRange,
  startWithLeadRequest = false,
  onClose,
  onSaved,
}) => {
  const { currentUser, hasPermission } = useAuth();
  const isNew = meeting === null;
  // Pedido de participação de uma chefia: opção explícita, só ao criar; a chefia não é convidada diretamente.
  const [requestLead, setRequestLead] = useState(false);
  const [leadId, setLeadId] = useState('');
  const [departmentId, setDepartmentId] = useState('');
  // Uma chave por tentativa de criação: mantém-se em duplo clique e em nova tentativa após falha de rede, para que o
  // servidor devolva a mesma reunião em vez de criar outra; muda quando o formulário é aberto de novo.
  const [clientRequestId, setClientRequestId] = useState(newRequestId);
  const leads = useAsyncData(() => (isOpen && isNew ? listMyLeads() : Promise.resolve([])), [isOpen, isNew]);
  const leadLabel = hasPermission('TEAM_READ') ? t('Solicitar participação de outro gestor') : t('Solicitar participação do gestor');
  const [values, setValues] = useState<MeetingFormValues>(() => initialMeetingValues(meeting, defaultDate, initialRange));
  const [selected, setSelected] = useState<string[]>(participantIds);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<MeetingFormField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [availability, setAvailability] = useState<Availability>({ status: 'idle' });
  /** Horário cujos conflitos já foram mostrados ao enviar: um segundo envio com o mesmo horário confirma. */
  const [warnedSignature, setWarnedSignature] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    setValues(initialMeetingValues(meeting, defaultDate, initialRange));
    setSelected(participantIds);
    setFieldErrors({});
    setErrorMessage(null);
    setAvailability({ status: 'idle' });
    setWarnedSignature(null);
    setRequestLead(startWithLeadRequest && meeting === null);
    setClientRequestId(newRequestId());
    setLeadId('');
    setDepartmentId('');
  }, [isOpen, meeting, participantIds, defaultDate, initialRange, startWithLeadRequest]);

  useEffect(() => {
    if (!leadId && leads.data && leads.data.length > 0) setLeadId(leads.data[0].profileId);
  }, [leadId, leads.data]);

  // Departamentos das pessoas que quem organiza pode convidar (dados reais do diretório, nunca inventados).
  const departments = [...new Map(
    people.filter((person) => person.departmentId && person.departmentName).map((person) => [person.departmentId as string, person.departmentName as string])
  ).entries()].sort((first, second) => first[1].localeCompare(second[1]));
  const departmentMembers = people.filter((person) => person.departmentId === departmentId).map((person) => person.profileId);
  const departmentToAdd = departmentMembers.filter((id) => !selected.includes(id));
  const addDepartment = () => setSelected((current) => [...new Set([...current, ...departmentMembers])]);
  const removeParticipant = (profileId: string) => setSelected((current) => current.filter((id) => id !== profileId));
  const requestedLeadId = isNew && requestLead && leadId ? leadId : null;

  const organizerId = meeting?.organizerId ?? currentUser?.id ?? null;
  const startsAt = combineDateTime(values.date, values.startTime);
  const endsAt = combineDateTime(values.date, values.endTime);
  const hasValidRange = Boolean(startsAt && endsAt && endsAt > startsAt);
  const checkedPeople = organizerId ? [organizerId, ...selected] : selected;
  const signature = hasValidRange && startsAt && endsAt ? scheduleSignature(startsAt.toISOString(), endsAt.toISOString(), checkedPeople) : null;
  const debouncedSignature = useDebouncedValue(isOpen ? signature : null, AVAILABILITY_DELAY_MS);

  const checkAvailability = async (requestSignature: string): Promise<Availability> => {
    const [requestStart = '', requestEnd = '', ids = ''] = requestSignature.split('|');
    setAvailability({ status: 'checking', signature: requestSignature });
    try {
      const conflicts = await getScheduleConflicts({
        profileIds: ids ? ids.split(',') : [],
        startsAt: requestStart,
        endsAt: requestEnd,
        excludeMeetingId: meeting?.id ?? null,
        links: meeting ? undefined : links,
      });
      const result: Availability = { status: 'checked', signature: requestSignature, conflicts };
      setAvailability((current) => (current.status === 'checking' && current.signature === requestSignature ? result : current));
      return result;
    } catch (error) {
      const result: Availability = { status: 'failed', signature: requestSignature, error: getErrorMessage(error, t('Erro de comunicação.')) };
      setAvailability((current) => (current.status === 'checking' && current.signature === requestSignature ? result : current));
      return result;
    }
  };

  // Verifica enquanto o organizador escolhe o horário e os participantes (com atraso para não pedir a cada tecla).
  useEffect(() => {
    if (!isOpen || !debouncedSignature) return;
    checkAvailability(debouncedSignature);
    // checkAvailability lê os valores atuais; só a assinatura deve disparar um novo pedido.
  }, [isOpen, debouncedSignature]);

  const updateValue = (field: MeetingFormField, value: string) => {
    setValues((current) => ({ ...current, [field]: value }));
    setFieldErrors((current) => ({ ...current, [field]: undefined }));
  };

  const nameOf = (profileId: string, fallback: string) =>
    profileId === organizerId && profileId === currentUser?.id ? t('Você (organizador)') : people.find((person) => person.profileId === profileId)?.fullName ?? fallback;

  const currentConflicts = availability.status === 'checked' && availability.signature === signature ? availability.conflicts : [];
  const isConfirmingConflicts = currentConflicts.length > 0 && warnedSignature === signature;

  // Guarda síncrona contra envios repetidos (duplo clique): o estado React só muda depois do primeiro await.
  const submittingRef = useRef(false);
  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    try {
      await submit();
    } finally {
      submittingRef.current = false;
    }
  };

  const submit = async () => {
    setErrorMessage(null);
    const errors = validateMeetingForm(values);
    setFieldErrors(errors);
    if (hasErrors(errors) || !startsAt || !endsAt || !signature) return;
    if (isNew && requestLead && !requestedLeadId) {
      setErrorMessage(t('Escolha a chefia cuja participação pretende pedir, ou desative o pedido.'));
      return;
    }
    if (requestedLeadId && startsAt.getTime() <= Date.now()) {
      setErrorMessage(t('Só se pede a participação de uma chefia para uma reunião futura.'));
      return;
    }

    // Os conflitos apresentados têm de corresponder ao horário atual; à primeira vez, pede-se confirmação.
    const isCurrent = (availability.status === 'checked' || availability.status === 'failed') && availability.signature === signature;
    const latest = isCurrent ? availability : await checkAvailability(signature);
    if (latest.status === 'checked' && latest.conflicts.length > 0 && warnedSignature !== signature) {
      setWarnedSignature(signature);
      return;
    }

    const input = {
      title: values.title.trim(),
      startsAt: startsAt.toISOString(),
      endsAt: endsAt.toISOString(),
      description: values.description.trim(),
      objective: values.objective.trim(),
      location: values.location.trim() || null,
      meetingUrl: values.meetingUrl.trim() || null,
      // A chefia pedida não entra como convidada: só participa se aceitar o pedido.
      participantIds: selected.filter((id) => id !== requestedLeadId),
    };
    setIsSubmitting(true);
    try {
      if (meeting) {
        await updateMeeting(meeting.id, input, meeting.updatedAt);
        onSaved(meeting.id, t('Reunião atualizada. Os participantes afetados foram notificados das alterações.'));
      } else {
        const meetingId = await createMeeting(input, links, requestedLeadId, clientRequestId);
        const invited = input.participantIds.filter((id) => id !== organizerId).length;
        const leadName = leads.data?.find((lead) => lead.profileId === requestedLeadId)?.fullName ?? '';
        const created =
          invited > 0 ? t('Reunião criada. {participants} o convite por notificação.', { participants: pluralize(invited, 'participante recebeu', 'participantes receberam') }) : t('Reunião criada.');
        onSaved(meetingId, requestedLeadId ? `${created} ${t('Pedido de participação enviado a {name}.', { name: leadName })}` : created);
      }
    } catch (error) {
      setErrorMessage(getErrorMessage(error, t('Não foi possível guardar a reunião.')));
    } finally {
      setIsSubmitting(false);
    }
  };

  const formId = 'meeting-form';
  const confirmLabel = meeting ? t('Guardar alterações') : t('Criar reunião');
  return (
    <Modal
      isOpen={isOpen}
      title={meeting ? t('Editar reunião') : t('Agendar reunião')}
      description={contextLabel}
      size="lg"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            {t('Cancelar')}
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting} icon={isConfirmingConflicts ? AlertTriangle : undefined}>
            {isConfirmingConflicts ? `${confirmLabel} mesmo assim` : confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        {isConfirmingConflicts && (
          <Alert variant="warning" title={t('Confirme o horário')}>
            {t('Há participantes com outro compromisso neste horário (detalhe no fim do formulário). Escolha «{action}» para manter a reunião ou ajuste o horário.', {
              action: t('{label} mesmo assim', { label: confirmLabel }),
            })}
          </Alert>
        )}
        <TextField label={t('Título')} required maxLength={200} value={values.title} error={fieldErrors.title} onChange={(event) => updateValue('title', event.target.value)} />
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <TextField label={t('Data')} type="date" required value={values.date} error={fieldErrors.date} onChange={(event) => updateValue('date', event.target.value)} />
          <TextField label={t('Início')} type="time" required value={values.startTime} error={fieldErrors.startTime} onChange={(event) => updateValue('startTime', event.target.value)} />
          <TextField label={t('Fim')} type="time" required value={values.endTime} error={fieldErrors.endTime} onChange={(event) => updateValue('endTime', event.target.value)} />
        </div>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TextField label={t('Local')} maxLength={200} value={values.location} error={fieldErrors.location} onChange={(event) => updateValue('location', event.target.value)} />
          <TextField
            label={t('Ligação (videoconferência)')}
            type="url"
            maxLength={500}
            value={values.meetingUrl}
            error={fieldErrors.meetingUrl}
            placeholder="https://"
            onChange={(event) => updateValue('meetingUrl', event.target.value)}
          />
        </div>
        <MoreOptions
          title={t('Objetivo e agenda')}
          summary={values.objective.trim() || values.description.trim() ? 'preenchidos' : 'opcionais'}
          defaultOpen={Boolean(meeting && (meeting.objective || meeting.description))}
        >
          <TextAreaField label={t('Objetivo')} rows={2} maxLength={2000} value={values.objective} onChange={(event) => updateValue('objective', event.target.value)} />
          <TextAreaField label={t('Descrição / agenda')} rows={3} maxLength={5000} value={values.description} onChange={(event) => updateValue('description', event.target.value)} />
        </MoreOptions>
        {departments.length > 0 && (
          <div className="flex flex-col gap-2 rounded-md border border-border bg-background p-3 sm:flex-row sm:items-end">
            <div className="min-w-0 flex-1">
              <SelectField label={t('Convidar um departamento')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
                <option value="">{t('Escolha um departamento…')}</option>
                {departments.map(([id, name]) => (
                  <option key={id} value={id}>
                    {name}
                  </option>
                ))}
              </SelectField>
            </div>
            <Button variant="secondary" icon={UsersRound} disabled={departmentToAdd.length === 0} onClick={addDepartment}>
              {departmentId
                ? departmentToAdd.length > 0
                  ? t('Adicionar {people}', { people: pluralize(departmentToAdd.length, 'pessoa', 'pessoas') })
                  : t('Já incluído')
                : t('Adicionar')}
            </Button>
          </div>
        )}
        <PeoplePicker
          label={t('Participantes')}
          people={people}
          selectedIds={selected}
          onChange={setSelected}
          hint={t('Colegas do departamento ou da mesma equipa, a sua equipa e as suas chefias. Ninguém é convidado duas vezes; cada pessoa recebe um convite por notificação.')}
        />
        {selected.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-medium text-text-secondary">{t('Convidados ({count})', { count: selected.length })}</p>
            <ul className="flex flex-wrap gap-1.5" aria-label={t('Lista final de convidados')}>
              {selected.map((profileId) => (
                <li key={profileId} className="inline-flex items-center gap-1 rounded-full border border-border bg-surface-muted py-0.5 pl-2.5 pr-1 text-xs text-text">
                  {nameOf(profileId, t('Participante'))}
                  <button
                    type="button"
                    onClick={() => removeParticipant(profileId)}
                    aria-label={t('Retirar {name}', { name: nameOf(profileId, t('Participante')) })}
                    className="rounded-full p-0.5 text-text-muted hover:bg-border hover:text-text"
                  >
                    <X className="h-3 w-3" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        {isNew && (
          <fieldset className="space-y-3 rounded-md border border-border p-3">
            <label className="flex items-start gap-3 text-sm text-text">
              <input type="checkbox" className="mt-0.5 h-4 w-4 accent-primary-hover" checked={requestLead} onChange={(event) => setRequestLead(event.target.checked)} />
              <span>
                <span className="block font-medium">{leadLabel}</span>
                <span className="block text-xs text-text-muted">
                  {t('A chefia recebe um pedido e só passa a participante se aceitar. Pode também recusar ou propor outro horário. Os restantes convidados recebem o convite normalmente.')}
                </span>
              </span>
            </label>
            {requestLead && leads.isLoading && !leads.data && <p className="text-sm text-text-muted">{t('A carregar as suas chefias...')}</p>}
            {requestLead && leads.error && <Alert variant="error">{leads.error}</Alert>}
            {requestLead && leads.data && leads.data.length === 0 && (
              <Alert variant="info" title={t('Ainda não tem uma chefia configurada.')}>
                {t('A relação com a chefia é configurada por um administrador autorizado. Pode criar a reunião sem este pedido.')}
              </Alert>
            )}
            {requestLead && leads.data && leads.data.length > 0 && (
              <SelectField label={t('Pedir a participação de')} value={leadId} onChange={(event) => setLeadId(event.target.value)}>
                {leads.data.map((lead) => (
                  <option key={lead.profileId} value={lead.profileId}>
                    {lead.fullName}
                    {lead.jobTitle ? ` · ${lead.jobTitle}` : ''}
                  </option>
                ))}
              </SelectField>
            )}
          </fieldset>
        )}
        <div aria-live="polite">
          <AvailabilityNotice availability={availability} signature={signature} nameOf={nameOf} />
        </div>
      </form>
    </Modal>
  );
};
