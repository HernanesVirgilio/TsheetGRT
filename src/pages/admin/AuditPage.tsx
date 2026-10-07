import React, { useEffect, useState } from 'react';
import { FileClock } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listAuditEvents } from '../../services/auditService';
import type { AuditEventWithActor } from '../../services/auditService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 25;

const COLUMNS: DataTableColumn<AuditEventWithActor>[] = [
  {
    id: 'date',
    header: 'Data e hora',
    className: 'whitespace-nowrap',
    render: (event) => formatDateTime(event.created_at),
  },
  {
    id: 'actor',
    header: 'Utilizador',
    render: (event) =>
      event.actor ? (
        <span>
          <span className="block font-medium text-text">{event.actor.full_name}</span>
          <span className="block text-xs text-text-muted">{event.actor.email}</span>
        </span>
      ) : (
        'Sistema'
      ),
  },
  {
    id: 'action',
    header: 'Ação',
    render: (event) => <span className="font-mono text-xs font-semibold text-sidebar">{event.action}</span>,
  },
  { id: 'description', header: 'Descrição', className: 'max-w-md', render: (event) => event.description },
  {
    id: 'ip',
    header: 'Endereço IP',
    render: (event) => <span className="font-mono text-xs">{event.ip_address ?? '—'}</span>,
  },
];

export const AuditPage: React.FC = () => {
  const [actionFilter, setActionFilter] = useState('');
  const [actorFilter, setActorFilter] = useState('');
  const [page, setPage] = useState(1);
  const debouncedAction = useDebouncedValue(actionFilter);
  const debouncedActor = useDebouncedValue(actorFilter);

  useEffect(() => setPage(1), [debouncedAction, debouncedActor]);

  const audit = useAsyncData(
    () => listAuditEvents({ page, pageSize: PAGE_SIZE, action: debouncedAction, actor: debouncedActor }),
    [page, debouncedAction, debouncedActor]
  );

  const hasFilters = Boolean(actionFilter || actorFilter);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Auditoria"
        subtitle="Registo imutável de autenticação, alterações administrativas e ciclo de vida dos timesheets."
      />

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-center">
          <SearchInput
            label="Filtrar por ação (ex.: user, auth.login)"
            value={actionFilter}
            onChange={(event) => setActionFilter(event.target.value)}
            className="sm:max-w-xs"
          />
          <SearchInput
            label="Filtrar por utilizador (nome ou e-mail)"
            value={actorFilter}
            onChange={(event) => setActorFilter(event.target.value)}
            className="sm:max-w-xs"
          />
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setActionFilter('');
                setActorFilter('');
              }}
            >
              Limpar filtros
            </Button>
          )}
        </div>

        {audit.error && (
          <div className="p-4">
            <ErrorState message={audit.error} onRetry={audit.reload} />
          </div>
        )}
        {audit.isLoading && !audit.data && <LoadingState label="A carregar eventos..." />}
        {audit.data?.items.length === 0 && (
          <EmptyState
            bordered={false}
            icon={FileClock}
            title={hasFilters ? 'Nenhum evento corresponde aos filtros.' : 'Ainda não existem eventos de auditoria.'}
          />
        )}
        {audit.data && audit.data.items.length > 0 && (
          <div className={audit.isLoading ? 'opacity-60' : ''} aria-busy={audit.isLoading}>
            <DataTable
              caption="Eventos de auditoria"
              columns={COLUMNS}
              rows={audit.data.items}
              getRowKey={(event) => event.id}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={audit.data.total} onPageChange={setPage} />
          </div>
        )}
      </Panel>
    </div>
  );
};
