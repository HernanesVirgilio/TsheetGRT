import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type {
  ApprovalRequest,
  ApprovalRequestStatus,
  Company,
  CompanyStatus,
  OpportunityDetail,
  OpportunityPerson,
  OpportunityStatus,
  OpportunitySummary,
  WorkEvent,
} from '../../types/work';
import { isApprovalRequestStatus, isCompanyStatus, isOpportunityApprovalStatus, isOpportunityStatus } from '../../types/work';
import { isPresent } from '../mappers';
import { toIlikePattern } from '../../utils/validation';
import { mapWorkEvent, WORK_EVENT_COLUMNS } from './workEvents';
import { t } from '../../lib/i18n';

// ---------------------------------------------------------------------------- empresas

const COMPANY_SELECT = 'id, name, nuit, contact_name, phone, email, address, website, notes, status' as const;

interface CompanyRow {
  id: string;
  name: string;
  nuit: string | null;
  contact_name: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string;
  status: string;
}

function mapCompany(row: CompanyRow): Company | null {
  if (!isCompanyStatus(row.status)) return null;
  return {
    id: row.id,
    name: row.name,
    nuit: row.nuit,
    contactName: row.contact_name,
    phone: row.phone,
    email: row.email,
    address: row.address,
    website: row.website,
    notes: row.notes,
    status: row.status,
  };
}

export async function listCompanies(search: string, status: CompanyStatus | null): Promise<Company[]> {
  let request = supabase.from('companies').select(COMPANY_SELECT).order('name').limit(500);
  if (status) request = request.eq('status', status);
  const term = search.trim();
  if (term) {
    const pattern = toIlikePattern(term);
    request = request.or(`name.ilike.${pattern},nuit.ilike.${pattern},contact_name.ilike.${pattern}`);
  }
  const { data, error } = await request;
  if (error) throw toServiceError(error, t('Não foi possível carregar as empresas.'));
  return data.map(mapCompany).filter(isPresent);
}

export interface CompanyInput {
  name: string;
  nuit: string | null;
  contactName: string | null;
  phone: string | null;
  email: string | null;
  address: string | null;
  website: string | null;
  notes: string;
  status: CompanyStatus;
}

function toCompanyPayload(input: CompanyInput) {
  return {
    name: input.name,
    nuit: input.nuit,
    contact_name: input.contactName,
    phone: input.phone,
    email: input.email,
    address: input.address,
    website: input.website,
    notes: input.notes,
    status: input.status,
  };
}

/** Escrita direta sob RLS; o servidor define o autor e audita a operação. */
export async function createCompany(input: CompanyInput): Promise<string> {
  const { data, error } = await supabase.from('companies').insert(toCompanyPayload(input)).select('id').single();
  if (error) throw toServiceError(error, t('Não foi possível registar a empresa.'));
  return data.id;
}

const COMPANY_STOP_WORDS = ['lda', 'limitada', 'sociedade', 'empresa', 'grupo', 'comercial'];

/**
 * Empresas parecidas (mesmo NUIT ou nome semelhante) antes de registar uma nova: evita duplicados
 * silenciosos. Os duplicados exatos são também recusados pela base de dados.
 */
export async function findSimilarCompanies(name: string, nuit: string | null): Promise<Company[]> {
  const words = name
    .trim()
    .toLowerCase()
    .split(/[\s,.;()-]+/)
    .filter((word) => word.length >= 4 && !COMPANY_STOP_WORDS.includes(word));
  const filters = words.slice(0, 3).map((word) => `name.ilike.${toIlikePattern(word)}`);
  if (nuit) filters.push(`nuit.eq.${nuit}`);
  if (filters.length === 0) filters.push(`name.ilike.${toIlikePattern(name.trim())}`);
  const { data, error } = await supabase.from('companies').select(COMPANY_SELECT).or(filters.join(',')).order('name').limit(10);
  if (error) throw toServiceError(error, t('Não foi possível verificar empresas semelhantes.'));
  return data.map(mapCompany).filter(isPresent);
}

export async function updateCompany(companyId: string, input: CompanyInput): Promise<void> {
  const { error } = await supabase.from('companies').update(toCompanyPayload(input)).eq('id', companyId);
  if (error) throw toServiceError(error, t('Não foi possível guardar a empresa.'));
}

// ---------------------------------------------------------------------------- oportunidades

const OPPORTUNITY_SELECT =
  'id, reference, title, company_id, owner_id, status, estimated_value, initial_value, currency, probability, expected_close_date, next_step, next_step_date, contact_name, contact_phone, contact_email, description, problem, proposal, notes, lost_reason, created_by, closed_at, approval_status, updated_at, company:companies(name), owner:profiles!opportunities_owner_id_fkey(full_name)' as const;

interface OpportunityRow {
  id: string;
  reference: string;
  title: string;
  company_id: string;
  owner_id: string;
  status: string;
  estimated_value: number | null;
  initial_value: number | null;
  currency: string;
  probability: number | null;
  expected_close_date: string | null;
  next_step: string | null;
  next_step_date: string | null;
  contact_name: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  description: string;
  problem: string;
  proposal: string;
  notes: string;
  lost_reason: string | null;
  created_by: string | null;
  closed_at: string | null;
  approval_status: string;
  updated_at: string;
  company: { name: string } | null;
  owner: { full_name: string } | null;
}

function mapOpportunity(row: OpportunityRow): OpportunityDetail | null {
  if (!isOpportunityStatus(row.status) || !isOpportunityApprovalStatus(row.approval_status)) return null;
  return {
    id: row.id,
    reference: row.reference,
    title: row.title,
    companyId: row.company_id,
    companyName: row.company?.name ?? null,
    ownerId: row.owner_id,
    ownerName: row.owner?.full_name ?? null,
    status: row.status,
    estimatedValue: row.estimated_value === null ? null : Number(row.estimated_value),
    initialValue: row.initial_value === null ? null : Number(row.initial_value),
    currency: row.currency,
    probability: row.probability,
    expectedCloseDate: row.expected_close_date,
    nextStep: row.next_step,
    nextStepDate: row.next_step_date,
    contactName: row.contact_name,
    contactPhone: row.contact_phone,
    contactEmail: row.contact_email,
    description: row.description,
    problem: row.problem,
    proposal: row.proposal,
    notes: row.notes,
    lostReason: row.lost_reason,
    createdBy: row.created_by,
    closedAt: row.closed_at,
    approvalStatus: row.approval_status,
    updatedAt: row.updated_at,
  };
}

export interface OpportunityQuery {
  search: string;
  statuses: OpportunityStatus[];
  ownerId: string | null;
  page: number;
  pageSize: number;
}

export async function listOpportunities(query: OpportunityQuery): Promise<{ items: OpportunitySummary[]; total: number }> {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from('opportunities')
    .select(OPPORTUNITY_SELECT, { count: 'exact' })
    .order('updated_at', { ascending: false })
    .range(from, from + query.pageSize - 1);
  if (query.statuses.length > 0) request = request.in('status', query.statuses);
  if (query.ownerId) request = request.eq('owner_id', query.ownerId);
  const search = query.search.trim();
  if (search) {
    const pattern = toIlikePattern(search);
    request = request.or(`reference.ilike.${pattern},title.ilike.${pattern},contact_name.ilike.${pattern}`);
  }
  const { data, error, count } = await request;
  if (error) throw toServiceError(error, t('Não foi possível carregar as oportunidades.'));
  return { items: data.map(mapOpportunity).filter(isPresent), total: count ?? data.length };
}

/** Oportunidades ativas visíveis (para associar tempo, tarefas e reuniões). */
export async function listActiveOpportunities(): Promise<OpportunitySummary[]> {
  const { data, error } = await supabase
    .from('opportunities')
    .select(OPPORTUNITY_SELECT)
    .in('status', ['NEW', 'QUALIFICATION', 'PROPOSAL', 'NEGOTIATION'])
    .order('title')
    .limit(200);
  if (error) throw toServiceError(error, t('Não foi possível carregar as oportunidades.'));
  return data.map(mapOpportunity).filter(isPresent);
}

export async function getOpportunity(opportunityId: string): Promise<OpportunityDetail | null> {
  const { data, error } = await supabase.from('opportunities').select(OPPORTUNITY_SELECT).eq('id', opportunityId).maybeSingle();
  if (error) throw toServiceError(error, t('Não foi possível carregar a oportunidade.'));
  return data ? mapOpportunity(data) : null;
}

export async function listOpportunityEvents(opportunityId: string): Promise<WorkEvent[]> {
  const { data, error } = await supabase
    .from('opportunity_events')
    .select(`${WORK_EVENT_COLUMNS}, after_closure`)
    .eq('opportunity_id', opportunityId)
    .order('created_at');
  if (error) throw toServiceError(error, t('Não foi possível carregar o histórico da oportunidade.'));
  return data.map(mapWorkEvent);
}

export async function getOpportunityPeople(opportunityId: string): Promise<OpportunityPerson[]> {
  const { data, error } = await supabase.rpc('get_opportunity_people', { p_opportunity_id: opportunityId });
  if (error) throw toServiceError(error, t('Não foi possível carregar a equipa da oportunidade.'));
  return data.map((row) => ({
    profileId: row.profile_id,
    fullName: row.full_name,
    jobTitle: row.job_title,
    isOwner: row.is_owner,
    role: row.is_owner ? 'OWNER' : row.member_role === 'EXECUTION_LEAD' ? 'EXECUTION_LEAD' : 'MEMBER',
  }));
}

export interface OpportunityInput {
  title: string;
  companyId: string;
  contactName: string | null;
  contactPhone: string | null;
  contactEmail: string | null;
  description: string;
  problem: string;
  proposal: string;
  initialValue: number | null;
  estimatedValue: number | null;
  currency: string;
  probability: number | null;
  expectedCloseDate: string | null;
  nextStep: string | null;
  nextStepDate: string | null;
  notes: string;
}

export async function createOpportunity(input: OpportunityInput, ownerId: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('create_opportunity', {
    p_title: input.title,
    p_company_id: input.companyId,
    p_owner_id: ownerId,
    p_contact_name: input.contactName,
    p_contact_phone: input.contactPhone,
    p_contact_email: input.contactEmail,
    p_description: input.description,
    p_problem: input.problem,
    p_proposal: input.proposal,
    p_initial_value: input.initialValue,
    p_estimated_value: input.estimatedValue,
    p_currency: input.currency,
    p_probability: input.probability,
    p_expected_close_date: input.expectedCloseDate,
    p_next_step: input.nextStep,
    p_next_step_date: input.nextStepDate,
    p_notes: input.notes,
  });
  if (error) throw toServiceError(error, t('Não foi possível registar a oportunidade.'));
  return data;
}

export async function updateOpportunity(opportunityId: string, input: OpportunityInput, reason: string | null, expectedUpdatedAt: string): Promise<void> {
  const { error } = await supabase.rpc('update_opportunity', {
    p_opportunity_id: opportunityId,
    p_title: input.title,
    p_company_id: input.companyId,
    p_contact_name: input.contactName,
    p_contact_phone: input.contactPhone,
    p_contact_email: input.contactEmail,
    p_description: input.description,
    p_problem: input.problem,
    p_proposal: input.proposal,
    p_initial_value: input.initialValue,
    p_estimated_value: input.estimatedValue,
    p_currency: input.currency,
    p_probability: input.probability,
    p_expected_close_date: input.expectedCloseDate,
    p_next_step: input.nextStep,
    p_next_step_date: input.nextStepDate,
    p_notes: input.notes,
    p_reason: reason,
    p_expected_updated_at: expectedUpdatedAt,
  });
  if (error) throw toServiceError(error, t('Não foi possível guardar a oportunidade.'));
}

export async function changeOpportunityStatus(opportunityId: string, status: OpportunityStatus, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('change_opportunity_status', { p_opportunity_id: opportunityId, p_status: status, p_note: note });
  if (error) throw toServiceError(error, t('Não foi possível alterar o estado da oportunidade.'));
}

export async function setOpportunityOwner(opportunityId: string, ownerId: string, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_opportunity_owner', { p_opportunity_id: opportunityId, p_owner_id: ownerId, p_note: note });
  if (error) throw toServiceError(error, t('Não foi possível alterar o responsável.'));
}

export async function addOpportunityMember(opportunityId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('add_opportunity_member', { p_opportunity_id: opportunityId, p_profile_id: profileId });
  if (error) throw toServiceError(error, t('Não foi possível acrescentar o membro.'));
}

export async function removeOpportunityMember(opportunityId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_opportunity_member', { p_opportunity_id: opportunityId, p_profile_id: profileId });
  if (error) throw toServiceError(error, t('Não foi possível retirar o membro.'));
}

/** Define, substitui ou retira (null) o gestor de execução; o anterior continua na equipa como membro. */
export async function setOpportunityExecutionLead(opportunityId: string, profileId: string | null, note: string | null = null): Promise<void> {
  const { error } = await supabase.rpc('set_opportunity_execution_lead', { p_opportunity_id: opportunityId, p_profile_id: profileId, p_note: note });
  if (error) throw toServiceError(error, t('Não foi possível definir o gestor de execução.'));
}

/**
 * Equipa inicial de uma oportunidade acabada de criar: primeiro o gestor de execução, depois os membros.
 * Cada associação é validada, registada e notificada no servidor; devolve as que falharam (com o motivo)
 * para que a interface nunca indique uma equipa que não ficou guardada.
 */
export async function assignProjectTeam(
  opportunityId: string,
  executionLeadId: string | null,
  memberIds: string[]
): Promise<{ profileId: string; error: string }[]> {
  const failures: { profileId: string; error: string }[] = [];
  const attempt = async (profileId: string, action: () => Promise<void>) => {
    try {
      await action();
    } catch (error) {
      failures.push({ profileId, error: error instanceof Error ? error.message : t('Erro desconhecido.') });
    }
  };
  if (executionLeadId) await attempt(executionLeadId, () => setOpportunityExecutionLead(opportunityId, executionLeadId));
  for (const memberId of memberIds.filter((id) => id !== executionLeadId)) {
    await attempt(memberId, () => addOpportunityMember(opportunityId, memberId));
  }
  return failures;
}

export async function addOpportunityComment(opportunityId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('add_opportunity_comment', { p_opportunity_id: opportunityId, p_body: body });
  if (error) throw toServiceError(error, t('Não foi possível enviar o comentário.'));
}

// ---------------------------------------------------------------------------- pedidos de aprovação

const APPROVAL_SELECT =
  'id, reference, opportunity_id, requested_by, title, amount, currency, justification, status, decided_at, decision_comment, created_at, requester:profiles!approval_requests_requested_by_fkey(full_name), decider:profiles!approval_requests_decided_by_fkey(full_name), opportunity:opportunities(reference, title, owner:profiles!opportunities_owner_id_fkey(full_name))' as const;

interface ApprovalRow {
  id: string;
  reference: string;
  opportunity_id: string | null;
  requested_by: string;
  title: string;
  amount: number | null;
  currency: string | null;
  justification: string;
  status: string;
  decided_at: string | null;
  decision_comment: string | null;
  created_at: string;
  requester: { full_name: string } | null;
  decider: { full_name: string } | null;
  opportunity: { reference: string; title: string; owner: { full_name: string } | null } | null;
}

function mapApproval(row: ApprovalRow): ApprovalRequest | null {
  if (!isApprovalRequestStatus(row.status)) return null;
  return {
    id: row.id,
    reference: row.reference,
    opportunityId: row.opportunity_id,
    opportunityReference: row.opportunity?.reference ?? null,
    opportunityTitle: row.opportunity?.title ?? null,
    opportunityOwnerName: row.opportunity?.owner?.full_name ?? null,
    requestedBy: row.requested_by,
    // Os nomes só aparecem a quem pode ler esses perfis (RLS de profiles).
    requesterName: row.requester?.full_name ?? null,
    title: row.title,
    amount: row.amount === null ? null : Number(row.amount),
    currency: row.currency,
    justification: row.justification,
    status: row.status,
    deciderName: row.decider?.full_name ?? null,
    decidedAt: row.decided_at,
    decisionComment: row.decision_comment,
    createdAt: row.created_at,
  };
}

/** Pedidos visíveis (RLS: quem vê a oportunidade). Os pendentes vêm do mais antigo para o mais recente. */
export async function listApprovalRequests(statuses: ApprovalRequestStatus[], limit = 100): Promise<ApprovalRequest[]> {
  const pendingOnly = statuses.length === 1 && statuses[0] === 'PENDING';
  let request = supabase.from('approval_requests').select(APPROVAL_SELECT).order('created_at', { ascending: pendingOnly }).limit(limit);
  if (statuses.length > 0) request = request.in('status', statuses);
  const { data, error } = await request;
  if (error) throw toServiceError(error, t('Não foi possível carregar os pedidos de aprovação.'));
  return data.map(mapApproval).filter(isPresent);
}

export async function listOpportunityApprovals(opportunityId: string): Promise<ApprovalRequest[]> {
  const { data, error } = await supabase
    .from('approval_requests')
    .select(APPROVAL_SELECT)
    .eq('opportunity_id', opportunityId)
    .order('created_at', { ascending: false });
  if (error) throw toServiceError(error, t('Não foi possível carregar os pedidos de aprovação.'));
  return data.map(mapApproval).filter(isPresent);
}

export async function requestOpportunityApproval(opportunityId: string, justification: string): Promise<string> {
  const { data, error } = await supabase.rpc('request_opportunity_approval', { p_opportunity_id: opportunityId, p_justification: justification });
  if (error) throw toServiceError(error, t('Não foi possível pedir a aprovação.'));
  return data;
}

export async function decideOpportunityApproval(requestId: string, decision: 'APPROVED' | 'REJECTED', comment: string | null): Promise<void> {
  const { error } = await supabase.rpc('decide_opportunity_approval', { p_request_id: requestId, p_decision: decision, p_comment: comment });
  if (error) throw toServiceError(error, t('Não foi possível registar a decisão.'));
}

export async function cancelOpportunityApproval(requestId: string, reason: string | null): Promise<void> {
  const { error } = await supabase.rpc('cancel_opportunity_approval', { p_request_id: requestId, p_reason: reason });
  if (error) throw toServiceError(error, t('Não foi possível anular o pedido.'));
}
