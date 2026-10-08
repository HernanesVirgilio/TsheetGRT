import { supabase } from '../lib/supabase/client';
import { toServiceError } from '../lib/errors';
import type { Asset, AssetStatus, AssetType, Intervention, InterventionOutcome } from '../types/it';
import { isAssetStatus, isAssetType, isInterventionOutcome } from '../types/it';
import { isPresent } from './mappers';
import { toIlikePattern } from '../utils/validation';

/**
 * Equipamentos e intervenções técnicas. O inventário é lido e gerido sob RLS
 * (IT_ASSETS_READ / IT_ASSETS_MANAGE); o colaborador só vê os equipamentos que lhe estão atribuídos.
 * As intervenções são registadas por add_it_intervention (técnico = utilizador da sessão).
 */

const ASSET_SELECT =
  '*, assignee:profiles!it_assets_assigned_to_fkey(full_name), department:departments(name)' as const;

interface AssetRow {
  id: string;
  asset_tag: string;
  asset_type: string;
  brand: string | null;
  model: string | null;
  serial_number: string | null;
  status: string;
  assigned_to: string | null;
  department_id: string | null;
  location: string | null;
  acquired_on: string | null;
  notes: string;
  created_at: string;
  updated_at: string;
  assignee: { full_name: string } | null;
  department: { name: string } | null;
}

function mapAsset(row: AssetRow): Asset | null {
  if (!isAssetType(row.asset_type) || !isAssetStatus(row.status)) return null;
  return {
    id: row.id,
    assetTag: row.asset_tag,
    assetType: row.asset_type,
    brand: row.brand,
    model: row.model,
    serialNumber: row.serial_number,
    status: row.status,
    assignedTo: row.assigned_to,
    assignedToName: row.assignee?.full_name ?? null,
    departmentId: row.department_id,
    departmentName: row.department?.name ?? null,
    location: row.location,
    acquiredOn: row.acquired_on,
    notes: row.notes,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface AssetQuery {
  search: string;
  status: AssetStatus | null;
  assetType: AssetType | null;
}

export async function listAssets(query: AssetQuery): Promise<Asset[]> {
  let request = supabase.from('it_assets').select(ASSET_SELECT).order('asset_tag');
  if (query.status) request = request.eq('status', query.status);
  if (query.assetType) request = request.eq('asset_type', query.assetType);
  const search = query.search.trim();
  if (search) {
    const pattern = toIlikePattern(search);
    request = request.or(`asset_tag.ilike.${pattern},serial_number.ilike.${pattern},brand.ilike.${pattern},model.ilike.${pattern}`);
  }
  const { data, error } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar os equipamentos.');
  return data.map(mapAsset).filter(isPresent);
}

/** Equipamentos atribuídos ao utilizador (para associar a um pedido de suporte). */
export async function listMyAssets(profileId: string): Promise<Asset[]> {
  const { data, error } = await supabase.from('it_assets').select(ASSET_SELECT).eq('assigned_to', profileId).order('asset_tag');
  if (error) throw toServiceError(error, 'Não foi possível carregar os seus equipamentos.');
  return data.map(mapAsset).filter(isPresent);
}

export async function getAsset(assetId: string): Promise<Asset | null> {
  const { data, error } = await supabase.from('it_assets').select(ASSET_SELECT).eq('id', assetId).maybeSingle();
  if (error) throw toServiceError(error, 'Não foi possível carregar o equipamento.');
  return data ? mapAsset(data) : null;
}

export interface AssetInput {
  assetTag: string | null;
  assetType: AssetType;
  brand: string | null;
  model: string | null;
  serialNumber: string | null;
  status: AssetStatus;
  assignedTo: string | null;
  departmentId: string | null;
  location: string | null;
  acquiredOn: string | null;
  notes: string;
}

function toAssetPayload(input: AssetInput) {
  return {
    asset_type: input.assetType,
    brand: input.brand,
    model: input.model,
    serial_number: input.serialNumber,
    status: input.status,
    assigned_to: input.assignedTo,
    department_id: input.departmentId,
    location: input.location,
    acquired_on: input.acquiredOn,
    notes: input.notes,
  };
}

/** O código patrimonial é gerado pelo servidor quando não é indicado. */
export async function createAsset(input: AssetInput): Promise<string> {
  const payload = input.assetTag ? { ...toAssetPayload(input), asset_tag: input.assetTag } : toAssetPayload(input);
  const { data, error } = await supabase.from('it_assets').insert(payload).select('id').single();
  if (error) throw toServiceError(error, 'Não foi possível registar o equipamento.');
  return data.id;
}

export async function updateAsset(assetId: string, input: AssetInput): Promise<void> {
  const payload = input.assetTag ? { ...toAssetPayload(input), asset_tag: input.assetTag } : toAssetPayload(input);
  const { error } = await supabase.from('it_assets').update(payload).eq('id', assetId);
  if (error) throw toServiceError(error, 'Não foi possível guardar o equipamento.');
}

// ---------------------------------------------------------------------------- intervenções

const INTERVENTION_SELECT = '*, ticket:it_tickets(reference), asset:it_assets(asset_tag)' as const;

interface InterventionRow {
  id: string;
  ticket_id: string | null;
  asset_id: string | null;
  technician_name: string;
  performed_at: string;
  problem_description: string;
  work_performed: string;
  outcome: string;
  notes: string;
  ticket: { reference: string } | null;
  asset: { asset_tag: string } | null;
}

function mapIntervention(row: InterventionRow): Intervention | null {
  if (!isInterventionOutcome(row.outcome)) return null;
  return {
    id: row.id,
    ticketId: row.ticket_id,
    ticketReference: row.ticket?.reference ?? null,
    assetId: row.asset_id,
    assetTag: row.asset?.asset_tag ?? null,
    technicianName: row.technician_name,
    performedAt: row.performed_at,
    problemDescription: row.problem_description,
    workPerformed: row.work_performed,
    outcome: row.outcome,
    notes: row.notes,
  };
}

export interface InterventionQuery {
  page: number;
  pageSize: number;
  ticketId: string | null;
  assetId: string | null;
  outcome: InterventionOutcome | null;
}

export interface InterventionPage {
  items: Intervention[];
  total: number;
}

export async function listInterventions(query: InterventionQuery): Promise<InterventionPage> {
  const from = (query.page - 1) * query.pageSize;
  let request = supabase
    .from('it_interventions')
    .select(INTERVENTION_SELECT, { count: 'exact' })
    .order('performed_at', { ascending: false })
    .range(from, from + query.pageSize - 1);
  if (query.ticketId) request = request.eq('ticket_id', query.ticketId);
  if (query.assetId) request = request.eq('asset_id', query.assetId);
  if (query.outcome) request = request.eq('outcome', query.outcome);
  const { data, error, count } = await request;
  if (error) throw toServiceError(error, 'Não foi possível carregar as intervenções.');
  return { items: data.map(mapIntervention).filter(isPresent), total: count ?? data.length };
}

export interface InterventionInput {
  ticketId: string | null;
  assetId: string | null;
  performedAt: string;
  problemDescription: string;
  workPerformed: string;
  outcome: InterventionOutcome;
  notes: string;
}

export async function addIntervention(input: InterventionInput): Promise<string> {
  const { data, error } = await supabase.rpc('add_it_intervention', {
    p_ticket_id: input.ticketId,
    p_asset_id: input.assetId,
    p_performed_at: input.performedAt,
    p_problem_description: input.problemDescription,
    p_work_performed: input.workPerformed,
    p_outcome: input.outcome,
    p_notes: input.notes,
  });
  if (error) throw toServiceError(error, 'Não foi possível registar a intervenção.');
  return data;
}
