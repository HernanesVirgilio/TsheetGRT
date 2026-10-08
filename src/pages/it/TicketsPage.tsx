import React, { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { LifeBuoy } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listTechnicians, listTicketCategories, listTickets } from '../../services/itTicketService';
import type { AssigneeFilter } from '../../services/itTicketService';
import type { TicketStatus, TicketSummary } from '../../types/it';
import { isTicketPriority, isTicketStatus, TICKET_PRIORITIES, TICKET_STATUSES } from '../../types/it';
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
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { isTicketOverdue, TICKET_PRIORITY_LABELS, TICKET_STATUS_LABELS } from '../../utils/it';
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 20;
const ALL = 'ALL';
const ACTIVE = 'ACTIVE';
const UNASSIGNED = 'UNASSIGNED';
const MINE = 'MINE';
const ACTIVE_STATUSES: TicketStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING_USER'];

interface TicketFilters {
  search: string;
  /** ACTIVE (abertos, em atendimento e a aguardar), ALL ou um estado. */
  status: string;
  priority: string;
  categoryId: string;
  /** ALL, UNASSIGNED, MINE ou o id de um técnico. */
  assignee: string;
}

const DEFAULT_FILTERS: TicketFilters = { search: '', status: ACTIVE, priority: ALL, categoryId: ALL, assignee: ALL };

/** Filtros iniciais a partir do URL (ligações do painel do IT, ex.: ?assignee=UNASSIGNED). */
function filtersFromSearchParams(params: URLSearchParams): TicketFilters {
  const status = params.get('status') ?? ACTIVE;
  const priority = params.get('priority') ?? ALL;
  return {
    ...DEFAULT_FILTERS,
    status: status === ALL || status === ACTIVE || isTicketStatus(status) ? status : ACTIVE,
    priority: isTicketPriority(priority) ? priority : ALL,
    assignee: params.get('assignee') ?? ALL,
  };
}

function toAssigneeFilter(value: string, viewerId: string): AssigneeFilter {
  if (value === UNASSIGNED) return { kind: 'unassigned' };
  if (value === MINE) return { kind: 'technician', technicianId: viewerId };
  if (value === ALL) return { kind: 'any' };
  return { kind: 'technician', technicianId: value };
}

function toStatuses(value: string): TicketStatus[] {
  if (value === ACTIVE) return ACTIVE_STATUSES;
  return isTicketStatus(value) ? [value] : [];
}

export const TicketsPage: React.FC = () => {
  const { currentUser } = useAuth();
  const [searchParams] = useSearchParams();
  const [filters, setFilters] = useState<TicketFilters>(() => filtersFromSearchParams(searchParams));
  const [page, setPage] = useState(1);
  const debouncedSearch = useDebouncedValue(filters.search);
  const viewerId = currentUser?.id ?? '';

  const referenceData = useAsyncData(() => Promise.all([listTechnicians(), listTicketCategories()]), []);
  const [technicians, categories] = referenceData.data ?? [[], []];

  const tickets = useAsyncData(
    () =>
      listTickets({
        page,
        pageSize: PAGE_SIZE,
        search: debouncedSearch,
        statuses: toStatuses(filters.status),
        priority: isTicketPriority(filters.priority) ? filters.priority : null,
        categoryId: filters.categoryId === ALL ? null : filters.categoryId,
        assignee: toAssigneeFilter(filters.assignee, viewerId),
      }),
    [page, debouncedSearch, filters.status, filters.priority, filters.categoryId, filters.assignee, viewerId]
  );

  useEffect(() => setPage(1), [debouncedSearch, filters.status, filters.priority, filters.categoryId, filters.assignee]);

  const updateFilter = (field: keyof TicketFilters, value: string) => setFilters((current) => ({ ...current, [field]: value }));
  const hasCustomFilters =
    filters.search.trim() !== '' ||
    filters.status !== DEFAULT_FILTERS.status ||
    filters.priority !== ALL ||
    filters.categoryId !== ALL ||
    filters.assignee !== ALL;

  const now = new Date();
  const columns: DataTableColumn<TicketSummary>[] = [
    {
      id: 'reference',
      header: 'Pedido',
      render: (ticket) => (
        <Link to={`/it/tickets/${ticket.id}`} className="block hover:underline">
          <span className="block font-semibold text-text">{ticket.reference}</span>
          <span className="block max-w-xs truncate text-xs text-text-secondary">{ticket.title}</span>
        </Link>
      ),
    },
    {
      id: 'requester',
      header: 'Solicitante',
      render: (ticket) => (
        <span>
          <span className="block text-text">{ticket.requesterName ?? '—'}</span>
          <span className="block text-xs text-text-muted">{ticket.departmentName ?? 'Sem departamento'}</span>
        </span>
      ),
    },
    { id: 'category', header: 'Categoria', render: (ticket) => ticket.categoryName ?? '—' },
    { id: 'priority', header: 'Prioridade', render: (ticket) => <PriorityBadge priority={ticket.priority} /> },
    { id: 'status', header: 'Estado', render: (ticket) => <StatusBadge status={ticket.status} size="sm" /> },
    {
      id: 'assignee',
      header: 'Técnico',
      render: (ticket) =>
        ticket.assignedTo ? (ticket.assigneeName ?? 'Responsável atribuído') : <span className="text-text-muted">Sem técnico</span>,
    },
    {
      id: 'due',
      header: 'Prazo',
      render: (ticket) =>
        isTicketOverdue(ticket, now) ? (
          <span className="font-medium text-danger">Em atraso · {formatDateTime(ticket.dueAt)}</span>
        ) : (
          <span className="whitespace-nowrap">{formatDateTime(ticket.dueAt)}</span>
        ),
    },
    { id: 'updated', header: 'Atualizado', render: (ticket) => <span className="whitespace-nowrap">{formatDateTime(ticket.updatedAt)}</span> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Solicitações" subtitle="Fila de pedidos de suporte da equipa de IT." />

      {referenceData.error && <ErrorState message={referenceData.error} onRetry={referenceData.reload} />}

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput
            label="Pesquisar referência, título ou solicitante"
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
          />
          <FilterSelect label="Filtrar por estado" value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value={ACTIVE}>Em curso</option>
            <option value={ALL}>Todos os estados</option>
            {TICKET_STATUSES.map((status) => (
              <option key={status} value={status}>
                {TICKET_STATUS_LABELS[status]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Filtrar por prioridade" value={filters.priority} onChange={(event) => updateFilter('priority', event.target.value)}>
            <option value={ALL}>Todas as prioridades</option>
            {TICKET_PRIORITIES.map((priority) => (
              <option key={priority} value={priority}>
                {TICKET_PRIORITY_LABELS[priority]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Filtrar por categoria" value={filters.categoryId} onChange={(event) => updateFilter('categoryId', event.target.value)}>
            <option value={ALL}>Todas as categorias</option>
            {categories.map((category) => (
              <option key={category.id} value={category.id}>
                {category.name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Filtrar por técnico" value={filters.assignee} onChange={(event) => updateFilter('assignee', event.target.value)}>
            <option value={ALL}>Todos os técnicos</option>
            <option value={MINE}>Atribuídos a mim</option>
            <option value={UNASSIGNED}>Sem técnico</option>
            {technicians.map((technician) => (
              <option key={technician.profileId} value={technician.profileId}>
                {technician.fullName}
              </option>
            ))}
          </FilterSelect>
        </div>

        {tickets.error && (
          <div className="p-4">
            <ErrorState message={tickets.error} onRetry={tickets.reload} />
          </div>
        )}
        {tickets.isLoading && !tickets.data && <LoadingState label="A carregar pedidos..." />}

        {tickets.data && tickets.data.items.length === 0 && (
          <EmptyState
            bordered={false}
            icon={LifeBuoy}
            title={hasCustomFilters ? 'Nenhum pedido corresponde aos filtros.' : 'Não há pedidos em curso.'}
            action={
              hasCustomFilters && (
                <Button variant="secondary" size="sm" onClick={() => setFilters(DEFAULT_FILTERS)}>
                  Limpar filtros
                </Button>
              )
            }
          />
        )}

        {tickets.data && tickets.data.items.length > 0 && (
          <>
            <DataTable
              caption="Pedidos de suporte"
              columns={columns}
              rows={tickets.data.items}
              getRowKey={(ticket) => ticket.id}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={tickets.data.total} onPageChange={setPage} />
          </>
        )}
      </Panel>
    </div>
  );
};
