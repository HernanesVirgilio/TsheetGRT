import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listTeamMembers, listTeamTimesheets } from '../../services/managerService';
import type { Profile, TimesheetSummary } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn, SortState } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { compareText, formatDateTime, formatPeriod } from '../../utils/format';
import { lastActivityAt, latestTimesheetByEmployee } from '../../utils/timesheets';
import { t } from '../../lib/i18n';

const ALL = '';
const NO_TIMESHEET = 'NONE';

type TeamSortKey = 'name' | 'activity';

interface TeamRow {
  member: Profile;
  latestTimesheet: TimesheetSummary | null;
  lastActivity: string | null;
}

const ALL_TIMESHEETS = { status: null, employeeId: null, periodFrom: null, periodTo: null };

export const TeamPage: React.FC = () => {
  const team = useAsyncData(() => Promise.all([listTeamMembers(), listTeamTimesheets(ALL_TIMESHEETS)]), []);
  const [search, setSearch] = useState('');
  const [departmentId, setDepartmentId] = useState(ALL);
  const [timesheetStatus, setTimesheetStatus] = useState(ALL);
  const [sort, setSort] = useState<SortState<TeamSortKey>>({ key: 'name', direction: 'asc' });

  const rows = useMemo<TeamRow[]>(() => {
    if (!team.data) return [];
    const [members, timesheets] = team.data;
    const latest = latestTimesheetByEmployee(timesheets);
    return members.map((member) => {
      const latestTimesheet = latest.get(member.id) ?? null;
      return { member, latestTimesheet, lastActivity: latestTimesheet ? lastActivityAt(latestTimesheet) : null };
    });
  }, [team.data]);

  const departments = useMemo(() => {
    const byId = new Map<string, string>();
    for (const { member } of rows) if (member.department) byId.set(member.department.id, member.department.name);
    return [...byId.entries()].sort((first, second) => compareText(first[1], second[1]));
  }, [rows]);

  const term = search.trim().toLowerCase();
  const visible = rows
    .filter(({ member, latestTimesheet }) => {
      const matchesSearch =
        !term ||
        member.full_name.toLowerCase().includes(term) ||
        member.email.toLowerCase().includes(term) ||
        (member.employee_number ?? '').toLowerCase().includes(term);
      const matchesDepartment = !departmentId || member.department_id === departmentId;
      const matchesStatus =
        !timesheetStatus ||
        (timesheetStatus === NO_TIMESHEET ? latestTimesheet === null : latestTimesheet?.status === timesheetStatus);
      return matchesSearch && matchesDepartment && matchesStatus;
    })
    .sort((first, second) => {
      const direction = sort.direction === 'asc' ? 1 : -1;
      if (sort.key === 'name') return compareText(first.member.full_name, second.member.full_name) * direction;
      return (first.lastActivity ?? '').localeCompare(second.lastActivity ?? '') * direction;
    });

  const hasFilters = Boolean(term || departmentId || timesheetStatus);

  const columns: DataTableColumn<TeamRow, TeamSortKey>[] = [
    {
      id: 'name',
      header: t('Colaborador'),
      sortKey: 'name',
      render: ({ member }) => (
        <Link to={`/team/${member.id}`} className="flex items-center gap-3 hover:underline">
          <UserAvatar name={member.full_name} size="sm" />
          <span>
            <span className="block font-semibold text-text">{member.full_name}</span>
            <span className="block text-xs text-text-muted">{member.employee_number}</span>
          </span>
        </Link>
      ),
    },
    { id: 'department', header: t('Departamento'), render: ({ member }) => member.department?.name ?? t('Sem departamento') },
    {
      id: 'job',
      header: t('Cargo e função'),
      className: 'min-w-48',
      render: ({ member }) => (
        <span>
          <span className="block">{member.job_title ?? '—'}</span>
          <span className="line-clamp-2 block text-xs text-text-muted">{member.job_description ?? t('Descrição por preencher')}</span>
        </span>
      ),
    },
    { id: 'contact', header: t('Contacto'), render: ({ member }) => member.phone ?? member.email },
    {
      id: 'account',
      header: t('Conta'),
      render: ({ member }) => <StatusBadge status={member.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />,
    },
    {
      id: 'timesheet',
      header: t('Último timesheet'),
      render: ({ latestTimesheet }) =>
        latestTimesheet ? (
          <span className="flex flex-col items-end gap-1 md:items-start">
            <StatusBadge status={latestTimesheet.status} size="sm" />
            <span className="text-xs text-text-muted">{formatPeriod(latestTimesheet.periodStart, latestTimesheet.periodEnd)}</span>
          </span>
        ) : (
          t('Sem timesheets')
        ),
    },
    {
      id: 'activity',
      header: t('Última atividade'),
      sortKey: 'activity',
      render: ({ lastActivity }) => formatDateTime(lastActivity, t('Sem submissões')),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title={t('Minha Equipa')} subtitle={t('Colaboradores no seu âmbito de gestão e o estado dos respetivos timesheets.')} />

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-3">
          <SearchInput label={t('Pesquisar nome, e-mail ou nº')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label={t('Filtrar por departamento')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value={ALL}>{t('Todos os departamentos')}</option>
            {departments.map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect
            label={t('Filtrar por estado do último timesheet')}
            value={timesheetStatus}
            onChange={(event) => setTimesheetStatus(event.target.value)}
          >
            <option value={ALL}>{t('Todos os estados de timesheet')}</option>
            <option value="SUBMITTED">{t('Por aprovar')}</option>
            <option value="REJECTED">{t('Rejeitado')}</option>
            <option value="DRAFT">{t('Em rascunho')}</option>
            <option value="APPROVED">{t('Aprovado')}</option>
            <option value={NO_TIMESHEET}>{t('Sem timesheets')}</option>
          </FilterSelect>
        </div>

        {team.error && (
          <div className="p-4">
            <ErrorState message={team.error} onRetry={team.reload} />
          </div>
        )}
        {team.isLoading && !team.data && <LoadingState label={t('A carregar equipa...')} />}
        {team.data && visible.length === 0 && (
          <EmptyState
            bordered={false}
            icon={Users}
            title={hasFilters ? t('Nenhum colaborador corresponde aos filtros.') : t('Não tem colaboradores no seu âmbito de gestão.')}
            message={hasFilters ? undefined : t('A atribuição de equipas é feita pela administração.')}
            action={
              hasFilters && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setSearch('');
                    setDepartmentId(ALL);
                    setTimesheetStatus(ALL);
                  }}
                >
                  {t('Limpar filtros')}
                </Button>
              )
            }
          />
        )}
        {visible.length > 0 && (
          <DataTable
            caption={t('Colaboradores da equipa')}
            columns={columns}
            rows={visible}
            getRowKey={(row) => row.member.id}
            sort={sort}
            onSortChange={(key) =>
              setSort((current) => ({ key, direction: current.key === key && current.direction === 'asc' ? 'desc' : 'asc' }))
            }
          />
        )}
      </Panel>
    </div>
  );
};
