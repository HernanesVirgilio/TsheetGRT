import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Briefcase, Building2, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listCompanies, listOpportunities } from '../../services/work/opportunityService';
import { listWorkPeople } from '../../services/work/calendarService';
import type { OpportunityStatus, OpportunitySummary } from '../../types/work';
import { ACTIVE_OPPORTUNITY_STATUSES, isOpportunityStatus, OPPORTUNITY_STATUSES } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { OpportunityFormModal } from '../../components/work/OpportunityModals';
import { formatMoney, OPPORTUNITY_STATUS_LABELS } from '../../utils/work';
import { formatDate } from '../../utils/format';

const PAGE_SIZE = 20;
const ACTIVE = 'ACTIVE';
const ALL = 'ALL';

function toStatuses(value: string): OpportunityStatus[] {
  if (value === ACTIVE) return [...ACTIVE_OPPORTUNITY_STATUSES];
  return isOpportunityStatus(value) ? [value] : [];
}

export const OpportunitiesPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canCreate = hasPermission('TIMESHEET_OPPORTUNITY_CREATE');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ACTIVE);
  const [ownerId, setOwnerId] = useState(ALL);
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const opportunities = useAsyncData(
    () => listOpportunities({ search: debouncedSearch, statuses: toStatuses(status), ownerId: ownerId === ALL ? null : ownerId, page, pageSize: PAGE_SIZE }),
    [debouncedSearch, status, ownerId, page]
  );
  const owners = useAsyncData(() => (canCreate ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), [canCreate]);
  const companies = useAsyncData(() => (canCreate ? listCompanies('', 'ACTIVE') : Promise.resolve([])), [canCreate]);
  useEffect(() => setPage(1), [debouncedSearch, status, ownerId]);

  const columns: DataTableColumn<OpportunitySummary>[] = [
    {
      id: 'title',
      header: 'Oportunidade',
      render: (item) => (
        <Link to={`/timesheet/opportunities/${item.id}`} className="block hover:underline">
          <span className="block font-semibold text-text">{item.reference}</span>
          <span className="block max-w-xs truncate text-xs text-text-secondary">{item.title}</span>
        </Link>
      ),
    },
    { id: 'company', header: 'Empresa', render: (item) => item.companyName ?? '—' },
    { id: 'owner', header: 'Responsável', render: (item) => item.ownerName ?? '—' },
    { id: 'status', header: 'Etapa', render: (item) => <WorkStatusBadge kind="opportunity" status={item.status} /> },
    { id: 'value', header: 'Valor estimado', align: 'right', render: (item) => formatMoney(item.estimatedValue, item.currency) },
    { id: 'probability', header: 'Prob.', align: 'right', render: (item) => (item.probability === null ? '—' : `${item.probability}%`) },
    {
      id: 'next',
      header: 'Próximo passo',
      className: 'min-w-48',
      render: (item) => (item.nextStep ? `${item.nextStep}${item.nextStepDate ? ` · ${formatDate(item.nextStepDate)}` : ''}` : '—'),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Oportunidades"
        subtitle="Negócios em curso, ligados às reuniões, tarefas e tempo dedicado."
        actions={
          <>
            <Link
              to="/timesheet/companies"
              className="inline-flex h-10 items-center gap-2 rounded-md border border-border-input bg-surface px-4 text-sm font-semibold text-text hover:bg-surface-muted"
            >
              <Building2 className="h-4 w-4" aria-hidden="true" />
              Empresas
            </Link>
            {canCreate && (
              <Button icon={Plus} onClick={() => setIsCreateOpen(true)} disabled={!companies.data}>
                Nova oportunidade
              </Button>
            )}
          </>
        }
      />
      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-3">
          <SearchInput label="Pesquisar referência, título ou contacto" value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label="Filtrar por etapa" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ACTIVE}>Em curso</option>
            <option value={ALL}>Todas</option>
            {OPPORTUNITY_STATUSES.map((value) => (
              <option key={value} value={value}>
                {OPPORTUNITY_STATUS_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
          {(owners.data ?? []).length > 1 && (
            <FilterSelect label="Filtrar por responsável" value={ownerId} onChange={(event) => setOwnerId(event.target.value)}>
              <option value={ALL}>Todos os responsáveis</option>
              {(owners.data ?? []).map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.fullName}
                </option>
              ))}
            </FilterSelect>
          )}
        </div>
        {opportunities.error && (
          <div className="p-4">
            <ErrorState message={opportunities.error} onRetry={opportunities.reload} />
          </div>
        )}
        {opportunities.isLoading && !opportunities.data && <LoadingState label="A carregar oportunidades..." />}
        {opportunities.data && opportunities.data.items.length === 0 && (
          <EmptyState bordered={false} icon={Briefcase} title={status === ACTIVE ? 'Não existem oportunidades em curso.' : 'Não existem oportunidades registadas com estes filtros.'} />
        )}
        {opportunities.data && opportunities.data.items.length > 0 && (
          <>
            <DataTable caption="Oportunidades" columns={columns} rows={opportunities.data.items} getRowKey={(item) => item.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={opportunities.data.total} onPageChange={setPage} />
          </>
        )}
      </Panel>
      <OpportunityFormModal
        isOpen={isCreateOpen}
        opportunity={null}
        companies={companies.data ?? []}
        owners={owners.data ?? []}
        onClose={() => setIsCreateOpen(false)}
        onSaved={(opportunityId) => {
          setIsCreateOpen(false);
          navigate(`/timesheet/opportunities/${opportunityId}`);
        }}
      />
    </div>
  );
};
