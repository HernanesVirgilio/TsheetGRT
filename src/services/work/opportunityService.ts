import { supabase } from '../../lib/supabase/client';
import { toServiceError } from '../../lib/errors';
import type {
  Company,
  CompanyStatus,
  OpportunityDetail,
  OpportunityPerson,
  OpportunityStatus,
  OpportunitySummary,
  WorkEvent,
} from '../../types/work';
import { isCompanyStatus, isOpportunityStatus } from '../../types/work';
import { isPresent } from '../mappers';
import { toIlikePattern } from '../../utils/validation';
import { mapWorkEvent, WORK_EVENT_COLUMNS } from './workEvents';

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
  if (error) throw toServiceError(error, 'Não foi possível carregar as empresas.');
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
  if (error) throw toServiceError(error, 'Não foi possível registar a empresa.');
  return data.id;
}

export async function updateCompany(companyId: string, input: CompanyInput): Promise<void> {
  const { error } = await supabase.from('companies').update(toCompanyPayload(input)).eq('id', companyId);
  if (error) throw toServiceError(error, 'Não foi possível guardar a empresa.');
}

// ---------------------------------------------------------------------------- oportunidades

const OPPORTUNITY_SELECT =
  'id, reference, title, company_id, owner_id, status, estimated_value, initial_value, currency, probability, expected_close_date, next_step, next_step_date, contact_name, contact_phone, contact_email, description, problem, proposal, notes, lost_reason, created_by, closed_at, updated_at, company:companies(name), owner:profiles!opportunities_owner_id_fkey(full_name)' as const;

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
  updated_at: string;
  company: { name: string } | null;
  owner: { full_name: string } | null;
}

function mapOpportunity(row: OpportunityRow): OpportunityDetail | null {
  if (!isOpportunityStatus(row.status)) return null;
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
  if (error) throw toServiceError(error, 'Não foi possível carregar as oportunidades.');
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
  if (error) throw toServiceError(error, 'Não foi possível carregar as oportunidades.');
  return data.map(mapOpportunity).filter(isPresent);
}

export async function getOpportunity(opportunityId: string): Promise<OpportunityDetail | null> {
  const { data, error } = await supabase.from('opportunities').select(OPPORTUNITY_SELECT).eq('id', opportunityId).maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar a oportunidade.');
  return data ? mapOpportunity(data) : null;
}

export async function listOpportunityEvents(opportunityId: string): Promise<WorkEvent[]> {
  const { data, error } = await supabase
    .from('opportunity_events')
    .select(`${WORK_EVENT_COLUMNS}, after_closure`)
    .eq('opportunity_id', opportunityId)
    .order('created_at');
  if (error) throw toServiceError(error, 'Não foi possível carregar o histórico da oportunidade.');
  return data.map(mapWorkEvent);
}

export async function getOpportunityPeople(opportunityId: string): Promise<OpportunityPerson[]> {
  const { data, error } = await supabase.rpc('get_opportunity_people', { p_opportunity_id: opportunityId });
  if (error) throw toServiceError(error, 'Não foi possível carregar a equipa da oportunidade.');
  return data.map((row) => ({ profileId: row.profile_id, fullName: row.full_name, jobTitle: row.job_title, isOwner: row.is_owner }));
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
  if (error) throw toServiceError(error, 'Não foi possível registar a oportunidade.');
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
  if (error) throw toServiceError(error, 'Não foi possível guardar a oportunidade.');
}

export async function changeOpportunityStatus(opportunityId: string, status: OpportunityStatus, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('change_opportunity_status', { p_opportunity_id: opportunityId, p_status: status, p_note: note });
  if (error) throw toServiceError(error, 'Não foi possível alterar o estado da oportunidade.');
}

export async function setOpportunityOwner(opportunityId: string, ownerId: string, note: string | null): Promise<void> {
  const { error } = await supabase.rpc('set_opportunity_owner', { p_opportunity_id: opportunityId, p_owner_id: ownerId, p_note: note });
  if (error) throw toServiceError(error, 'Não foi possível alterar o responsável.');
}

export async function addOpportunityMember(opportunityId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('add_opportunity_member', { p_opportunity_id: opportunityId, p_profile_id: profileId });
  if (error) throw toServiceError(error, 'Não foi possível acrescentar o membro.');
}

export async function removeOpportunityMember(opportunityId: string, profileId: string): Promise<void> {
  const { error } = await supabase.rpc('remove_opportunity_member', { p_opportunity_id: opportunityId, p_profile_id: profileId });
  if (error) throw toServiceError(error, 'Não foi possível retirar o membro.');
}

export async function addOpportunityComment(opportunityId: string, body: string): Promise<void> {
  const { error } = await supabase.rpc('add_opportunity_comment', { p_opportunity_id: opportunityId, p_body: body });
  if (error) throw toServiceError(error, 'Não foi possível enviar o comentário.');
}
