import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Monitor, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listAssets } from '../../services/itAssetService';
import { listUsers } from '../../services/userService';
import { listDepartments } from '../../services/departmentService';
import type { Asset } from '../../types/it';
import { ASSET_STATUSES, ASSET_TYPES, isAssetStatus, isAssetType } from '../../types/it';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { AssetFormModal } from '../../components/it/AssetFormModal';
import { ASSET_STATUS_LABELS, ASSET_TYPE_LABELS } from '../../utils/it';

const PAGE_SIZE = 20;
const ALL = 'ALL';

export const AssetsPage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canManage = hasPermission('IT_ASSETS_MANAGE');

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(ALL);
  const [assetType, setAssetType] = useState(ALL);
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const assets = useAsyncData(
    () =>
      listAssets({
        search: debouncedSearch,
        status: isAssetStatus(status) ? status : null,
        assetType: isAssetType(assetType) ? assetType : null,
      }),
    [debouncedSearch, status, assetType]
  );
  // Utilizadores e departamentos só são necessários para registar equipamentos.
  const referenceData = useAsyncData(
    () => (canManage ? Promise.all([listUsers(), listDepartments()]) : Promise.resolve(null)),
    [canManage]
  );
  const [users, departments] = referenceData.data ?? [[], []];

  useEffect(() => setPage(1), [debouncedSearch, status, assetType]);

  const items = assets.data ?? [];
  const pageItems = items.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const hasFilters = search.trim() !== '' || status !== ALL || assetType !== ALL;

  const columns: DataTableColumn<Asset>[] = [
    {
      id: 'tag',
      header: 'Código',
      render: (asset) => (
        <Link to={`/it/assets/${asset.id}`} className="font-semibold text-text hover:underline">
          {asset.assetTag}
        </Link>
      ),
    },
    {
      id: 'equipment',
      header: 'Equipamento',
      render: (asset) => (
        <span>
          <span className="block text-text">{ASSET_TYPE_LABELS[asset.assetType]}</span>
          <span className="block text-xs text-text-muted">{[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}</span>
        </span>
      ),
    },
    { id: 'serial', header: 'Nº de série', render: (asset) => asset.serialNumber ?? '—' },
    {
      id: 'status',
      header: 'Estado',
      render: (asset) => <StatusBadge status={asset.status} label={ASSET_STATUS_LABELS[asset.status]} size="sm" />,
    },
    { id: 'user', header: 'Utilizador', render: (asset) => asset.assignedToName ?? <span className="text-text-muted">Sem utilizador</span> },
    { id: 'department', header: 'Departamento', render: (asset) => asset.departmentName ?? '—' },
    { id: 'location', header: 'Localização', render: (asset) => asset.location ?? '—' },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Ativos"
        subtitle="Inventário de equipamentos informáticos, responsáveis e localização."
        actions={
          canManage && (
            <Button icon={Plus} onClick={() => setIsCreateOpen(true)} disabled={!referenceData.data}>
              Novo equipamento
            </Button>
          )
        }
      />

      {referenceData.error && <ErrorState message={referenceData.error} onRetry={referenceData.reload} />}

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-3">
          <SearchInput label="Pesquisar código, nº de série, marca ou modelo" value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ALL}>Todos os estados</option>
            {ASSET_STATUSES.map((value) => (
              <option key={value} value={value}>
                {ASSET_STATUS_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Filtrar por tipo" value={assetType} onChange={(event) => setAssetType(event.target.value)}>
            <option value={ALL}>Todos os tipos</option>
            {ASSET_TYPES.map((value) => (
              <option key={value} value={value}>
                {ASSET_TYPE_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
        </div>

        {assets.error && (
          <div className="p-4">
            <ErrorState message={assets.error} onRetry={assets.reload} />
          </div>
        )}
        {assets.isLoading && !assets.data && <LoadingState label="A carregar equipamentos..." />}

        {assets.data && items.length === 0 && (
          <EmptyState
            bordered={false}
            icon={Monitor}
            title={hasFilters ? 'Nenhum equipamento corresponde aos filtros.' : 'Ainda não existem equipamentos registados.'}
            action={
              hasFilters && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setStatus(ALL);
                    setAssetType(ALL);
                  }}
                >
                  Limpar filtros
                </Button>
              )
            }
          />
        )}

        {items.length > 0 && (
          <>
            <DataTable caption="Equipamentos" columns={columns} rows={pageItems} getRowKey={(asset) => asset.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={items.length} onPageChange={setPage} />
          </>
        )}
      </Panel>

      <AssetFormModal
        isOpen={isCreateOpen}
        asset={null}
        users={users}
        departments={departments}
        onClose={() => setIsCreateOpen(false)}
        onSaved={(_message, assetId) => {
          setIsCreateOpen(false);
          navigate(`/it/assets/${assetId}`);
        }}
      />
    </div>
  );
};
