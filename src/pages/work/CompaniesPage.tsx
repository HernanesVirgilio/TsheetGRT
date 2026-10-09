import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Building2, Pencil, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listCompanies } from '../../services/work/opportunityService';
import type { Company } from '../../types/work';
import { isCompanyStatus } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { CompanyFormModal } from '../../components/work/OpportunityModals';

export const CompaniesPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('TIMESHEET_OPPORTUNITY_CREATE') || hasPermission('TIMESHEET_OPPORTUNITY_MANAGE');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('ACTIVE');
  const [editing, setEditing] = useState<Company | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const debouncedSearch = useDebouncedValue(search);
  const companies = useAsyncData(() => listCompanies(debouncedSearch, isCompanyStatus(status) ? status : null), [debouncedSearch, status]);

  const columns: DataTableColumn<Company>[] = [
    { id: 'name', header: 'Empresa', render: (company) => <span className="font-semibold text-text">{company.name}</span> },
    { id: 'nuit', header: 'NUIT', render: (company) => company.nuit ?? '—' },
    { id: 'contact', header: 'Contacto', render: (company) => company.contactName ?? '—' },
    { id: 'phone', header: 'Telefone', render: (company) => company.phone ?? '—' },
    { id: 'email', header: 'E-mail', render: (company) => company.email ?? '—' },
    { id: 'status', header: 'Estado', render: (company) => <StatusBadge status={company.status} size="sm" /> },
    {
      id: 'actions',
      header: 'Ações',
      align: 'right',
      hideLabelOnMobile: true,
      render: (company) =>
        canEdit && (
          <IconButton
            icon={Pencil}
            label={`Editar ${company.name}`}
            onClick={() => {
              setEditing(company);
              setIsFormOpen(true);
            }}
          />
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <Link to="/timesheet/opportunities" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        Voltar às oportunidades
      </Link>
      <PageHeader
        title="Empresas"
        subtitle="Clientes e potenciais clientes. As empresas não são apagadas: ficam inativas."
        actions={
          canEdit && (
            <Button
              icon={Plus}
              onClick={() => {
                setEditing(null);
                setIsFormOpen(true);
              }}
            >
              Nova empresa
            </Button>
          )
        }
      />
      {message && (
        <Alert variant="success" onDismiss={() => setMessage(null)}>
          {message}
        </Alert>
      )}
      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2">
          <SearchInput label="Pesquisar nome, NUIT ou contacto" value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="ACTIVE">Ativas</option>
            <option value="INACTIVE">Inativas</option>
            <option value="ALL">Todas</option>
          </FilterSelect>
        </div>
        {companies.error && (
          <div className="p-4">
            <ErrorState message={companies.error} onRetry={companies.reload} />
          </div>
        )}
        {companies.isLoading && !companies.data && <LoadingState label="A carregar empresas..." />}
        {companies.data && companies.data.length === 0 && <EmptyState bordered={false} icon={Building2} title="Não existem empresas registadas com estes filtros." />}
        {companies.data && companies.data.length > 0 && <DataTable caption="Empresas" columns={columns} rows={companies.data} getRowKey={(company) => company.id} />}
      </Panel>
      <CompanyFormModal
        isOpen={isFormOpen}
        company={editing}
        onClose={() => setIsFormOpen(false)}
        onSaved={(_companyId, text) => {
          setIsFormOpen(false);
          setMessage(text);
          companies.reload();
        }}
      />
    </div>
  );
};
