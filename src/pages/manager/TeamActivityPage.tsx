import React, { useEffect, useState } from 'react';
import { History } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listAuditEvents } from '../../services/auditService';
import type { AuditEventWithActor } from '../../services/auditService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 25;
const TIMESHEET_ENTITY = 'timesheets';

const ACTION_LABELS: Record<string, string> = {
  'timesheet.created': 'Criado',
  'timesheet.submitted': 'Submetido',
  'timesheet.approved': 'Aprovado',
  'timesheet.rejected': 'Rejeitado',
  'timesheet.reopened': 'Reaberto',
  'timesheet.locked': 'Bloqueado',
};

const COLUMNS: DataTableColumn<AuditEventWithActor>[] = [
  { id: 'date', header: 'Data e hora', className: 'whitespace-nowrap', render: (event) => formatDateTime(event.created_at) },
  { id: 'action', header: 'Evento', render: (event) => ACTION_LABELS[event.action] ?? event.action },
  { id: 'actor', header: 'Por', render: (event) => event.actor?.full_name ?? 'Utilizador fora do seu âmbito' },
  { id: 'description', header: 'Descrição', className: 'max-w-md', render: (event) => event.description },
];

/** Registo de auditoria dos timesheets da equipa (a RLS limita os eventos ao âmbito do gestor). */
export const TeamActivityPage: React.FC = () => {
  const [action, setAction] = useState('');
  const [actorSearch, setActorSearch] = useState('');
  const [page, setPage] = useState(1);
  const debouncedActor = useDebouncedValue(actorSearch);

  useEffect(() => setPage(1), [action, debouncedActor]);

  const activity = useAsyncData(
    () => listAuditEvents({ page, pageSize: PAGE_SIZE, action, actor: debouncedActor, entityType: TIMESHEET_ENTITY }),
    [page, action, debouncedActor]
  );

  const hasFilters = Boolean(action || actorSearch);

  return (
    <div className="space-y-6">
      <PageHeader title="Atividade da equipa" subtitle="Criação, submissão e decisões sobre os timesheets da sua equipa." />

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2">
          <FilterSelect label="Filtrar por evento" value={action} onChange={(event) => setAction(event.target.value)}>
            <option value="">Todos os eventos</option>
            {Object.entries(ACTION_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </FilterSelect>
          <SearchInput label="Filtrar por utilizador" value={actorSearch} onChange={(event) => setActorSearch(event.target.value)} />
        </div>

        {activity.error && (
          <div className="p-4">
            <ErrorState message={activity.error} onRetry={activity.reload} />
          </div>
        )}
        {activity.isLoading && !activity.data && <LoadingState label="A carregar atividade..." />}
        {activity.data?.items.length === 0 && (
          <EmptyState
            bordered={false}
            icon={History}
            title={hasFilters ? 'Nenhum evento corresponde aos filtros.' : 'Ainda não existe atividade nos timesheets da sua equipa.'}
          />
        )}
        {activity.data && activity.data.items.length > 0 && (
          <div className={activity.isLoading ? 'opacity-60' : ''} aria-busy={activity.isLoading}>
            <DataTable caption="Atividade da equipa" columns={COLUMNS} rows={activity.data.items} getRowKey={(event) => event.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={activity.data.total} onPageChange={setPage} />
          </div>
        )}
      </Panel>
    </div>
  );
};
