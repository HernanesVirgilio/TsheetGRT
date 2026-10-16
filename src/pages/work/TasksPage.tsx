import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { ListTodo, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listTasks } from '../../services/work/taskService';
import type { TaskScope } from '../../services/work/taskService';
import { listWorkPeople } from '../../services/work/calendarService';
import type { TaskStatus, TaskSummary } from '../../types/work';
import { isTaskStatus, isWorkPriority, TASK_STATUSES, WORK_PRIORITIES } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { PriorityBadge } from '../../components/it/PriorityBadge';
import { OverdueBadge, WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { TaskFormModal } from '../../components/work/TaskFormModal';
import { isTaskOverdue, TASK_STATUS_LABELS, WORK_PRIORITY_LABELS } from '../../utils/work';
import { formatDateTime } from '../../utils/format';
import { t } from '../../lib/i18n';

const PAGE_SIZE = 20;
const OPEN = 'OPEN';
const ALL = 'ALL';
const OPEN_STATUSES: TaskStatus[] = ['PLANNED', 'ASSIGNED', 'IN_PROGRESS', 'BLOCKED'];

function toStatuses(value: string): TaskStatus[] {
  if (value === OPEN) return OPEN_STATUSES;
  return isTaskStatus(value) ? [value] : [];
}

export const TasksPage: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const canSeeTeam = hasPermission('TEAM_READ');
  const canCreate = hasPermission('TIMESHEET_TASK_CREATE');
  const canFollowUp = canSeeTeam && hasPermission('TIMESHEET_TASK_ASSIGN');

  const initialScope = searchParams.get('scope');
  const initialStatus = searchParams.get('status');
  const [scope, setScope] = useState<TaskScope>(
    initialScope === 'TEAM' && canSeeTeam
      ? 'TEAM'
      : initialScope === 'CREATED' && canCreate
        ? 'CREATED'
        : initialScope === 'FOLLOW_UP' && canFollowUp
          ? 'FOLLOW_UP'
          : 'MINE'
  );
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState(initialStatus && isTaskStatus(initialStatus) ? initialStatus : OPEN);
  const [priority, setPriority] = useState(ALL);
  const [assigneeId, setAssigneeId] = useState(ALL);
  const [overdueOnly, setOverdueOnly] = useState(searchParams.get('overdue') === '1');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  // Responsáveis possíveis de uma tarefa nova (regra do servidor) e, à parte, as pessoas do âmbito para o filtro.
  const people = useAsyncData(() => (canCreate ? listWorkPeople('ASSIGNEE') : Promise.resolve([])), [canCreate]);
  const scopePeople = useAsyncData(() => (canSeeTeam ? listWorkPeople('SCOPE') : Promise.resolve([])), [canSeeTeam]);
  const tasks = useAsyncData(
    () =>
      listTasks({
        scope,
        viewerId,
        search: debouncedSearch,
        // "Por acompanhar" são sempre tarefas concluídas por validar.
        statuses: scope === 'FOLLOW_UP' ? [] : toStatuses(status),
        priority: isWorkPriority(priority) ? priority : null,
        assigneeId: scope !== 'MINE' && assigneeId !== ALL ? assigneeId : null,
        overdueOnly,
        page,
        pageSize: PAGE_SIZE,
      }),
    [scope, viewerId, debouncedSearch, status, priority, assigneeId, overdueOnly, page]
  );

  useEffect(() => setPage(1), [scope, debouncedSearch, status, priority, assigneeId, overdueOnly]);

  // O separador fica no URL: ao voltar do detalhe de uma tarefa, a lista reabre no mesmo separador.
  const changeScope = (next: TaskScope) => {
    setScope(next);
    setSearchParams(
      (params) => {
        params.set('scope', next);
        return params;
      },
      { replace: true }
    );
  };
  const listPath = `${location.pathname}${location.search}`;

  const now = new Date();
  const columns: DataTableColumn<TaskSummary>[] = [
    {
      id: 'task',
      header: t('Tarefa'),
      render: (task) => (
        <Link to={`/timesheet/tasks/${task.id}`} state={{ from: listPath }} className="block hover:underline">
          <span className="block font-semibold text-text">{task.reference}</span>
          <span className="block max-w-xs truncate text-xs text-text-secondary">{task.title}</span>
        </Link>
      ),
    },
    { id: 'assignee', header: t('Responsável'), render: (task) => task.assigneeName ?? <span className="text-text-muted">{t('Sem responsável')}</span> },
    { id: 'priority', header: t('Prioridade'), render: (task) => <PriorityBadge priority={task.priority} /> },
    {
      id: 'status',
      header: t('Estado'),
      render: (task) => (
        <span className="flex flex-wrap gap-1">
          <WorkStatusBadge kind="task" status={task.status} />
          {isTaskOverdue(task, now) && <OverdueBadge />}
        </span>
      ),
    },
    { id: 'due', header: t('Prazo'), render: (task) => <span className="whitespace-nowrap">{formatDateTime(task.dueAt, t('Sem prazo'))}</span> },
    { id: 'updated', header: t('Atualizada'), render: (task) => <span className="whitespace-nowrap">{formatDateTime(task.updatedAt)}</span> },
  ];

  const scopes: { value: TaskScope; label: string; visible: boolean }[] = [
    { value: 'MINE', label: t('As minhas'), visible: true },
    { value: 'TEAM', label: t('Equipa'), visible: canSeeTeam },
    { value: 'CREATED', label: t('Criadas por mim'), visible: canCreate },
    { value: 'FOLLOW_UP', label: t('Por acompanhar'), visible: canFollowUp },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Tarefas')}
        subtitle={t('Trabalho planeado e atribuído, com prazos, estado e histórico.')}
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setIsCreateOpen(true)}>
              {t('Nova tarefa')}
            </Button>
          )
        }
      />

      <div role="group" aria-label={t('Âmbito das tarefas')} className="flex flex-wrap gap-2">
        {scopes
          .filter((option) => option.visible)
          .map((option) => (
            <Button key={option.value} size="sm" variant={scope === option.value ? 'primary' : 'secondary'} aria-pressed={scope === option.value} onClick={() => changeScope(option.value)}>
              {option.label}
            </Button>
          ))}
      </div>

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2 lg:grid-cols-5">
          <SearchInput label={t('Pesquisar referência ou título')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label={t('Filtrar por estado')} value={status} disabled={scope === 'FOLLOW_UP'} onChange={(event) => setStatus(event.target.value)}>
            <option value={OPEN}>{t('Em aberto')}</option>
            <option value={ALL}>{t('Todos os estados')}</option>
            {TASK_STATUSES.map((value) => (
              <option key={value} value={value}>
                {TASK_STATUS_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label={t('Filtrar por prioridade')} value={priority} onChange={(event) => setPriority(event.target.value)}>
            <option value={ALL}>{t('Todas as prioridades')}</option>
            {WORK_PRIORITIES.map((value) => (
              <option key={value} value={value}>
                {WORK_PRIORITY_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
          {scope !== 'MINE' ? (
            <FilterSelect label={t('Filtrar por responsável')} value={assigneeId} onChange={(event) => setAssigneeId(event.target.value)}>
              <option value={ALL}>{t('Todos os responsáveis')}</option>
              {(scopePeople.data ?? []).map((person) => (
                <option key={person.profileId} value={person.profileId}>
                  {person.fullName}
                </option>
              ))}
            </FilterSelect>
          ) : (
            <span className="hidden lg:block" />
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-text">
            <input type="checkbox" className="h-4 w-4 accent-primary-hover" checked={overdueOnly} onChange={(event) => setOverdueOnly(event.target.checked)} />
            {t('Só atrasadas')}
          </label>
        </div>

        {tasks.error && (
          <div className="p-4">
            <ErrorState message={tasks.error} onRetry={tasks.reload} />
          </div>
        )}
        {tasks.isLoading && !tasks.data && <LoadingState label={t('A carregar tarefas...')} />}
        {tasks.data && tasks.data.items.length === 0 && (
          <EmptyState
            bordered={false}
            icon={ListTodo}
            title={overdueOnly ? t('Não existem tarefas atrasadas.') : scope === 'MINE' ? t('Não tem tarefas atribuídas com estes filtros.') : t('Não existem tarefas com estes filtros.')}
          />
        )}
        {tasks.data && tasks.data.items.length > 0 && (
          <>
            <DataTable caption={t('Tarefas')} columns={columns} rows={tasks.data.items} getRowKey={(task) => task.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={tasks.data.total} onPageChange={setPage} />
          </>
        )}
      </Panel>

      <TaskFormModal
        isOpen={isCreateOpen}
        task={null}
        assignees={people.data ?? []}
        canRequestManagerReview={hasPermission('TIMESHEET_TASK_ASSIGN') && !hasPermission('TEAM_SUPERVISE')}
        onClose={() => setIsCreateOpen(false)}
        onSaved={(taskId) => {
          setIsCreateOpen(false);
          // Uma tarefa atribuída a outra pessoa não aparece em "As minhas": a lista para onde se volta é
          // "Criadas por mim", onde qualquer tarefa criada pelo próprio aparece sempre.
          const createdPath = '/timesheet/tasks?scope=CREATED';
          navigate(createdPath, { replace: true });
          navigate(`/timesheet/tasks/${taskId}`, { state: { from: createdPath } });
        }}
      />
    </div>
  );
};
