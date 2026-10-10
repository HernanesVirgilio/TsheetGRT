import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, CheckCircle2, ClipboardCheck, Network, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyScopes, listTeamTimesheets } from '../../services/managerService';
import { getSupervisionOverview, getTeamDashboard } from '../../services/work/teamService';
import { getTeamWorkOverview } from '../../services/work/calendarService';
import { listTeamAbsences } from '../../services/work/absenceService';
import { listApprovalRequests } from '../../services/work/opportunityService';
import { listDepartments } from '../../services/departmentService';
import type { SupervisionRow } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { StatCard } from '../../components/ui/StatCard';
import { FilterSelect } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { OverdueBadge } from '../../components/work/WorkStatusBadge';
import { StackedBarChart } from '../../components/charts/StackedCharts';
import { MyTasksPanel, PanelLink, PipelinePanel, ReportSummaryPanel, UpcomingMeetingsPanel } from '../../components/work/DashboardPanels';
import { formatMoney, recentPeriod } from '../../utils/work';
import { formatCalendarDate, formatDateTime, formatMinutesAsHours, formatPeriod, pluralize } from '../../utils/format';

const PERIODS = [
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 90, label: 'Últimos 90 dias' },
];
const ALL = 'ALL';
const PREVIEW = 5;

/** Decisões que competem ao Manager: ausências validadas, oportunidades e timesheets da equipa direta. */
const PendingDecisionsPanel: React.FC<{ viewerId: string; directIds: Set<string> }> = ({ viewerId, directIds }) => {
  const absences = useAsyncData(() => listTeamAbsences(viewerId, ['PENDING_APPROVAL']), [viewerId]);
  const approvals = useAsyncData(() => listApprovalRequests(['PENDING']), []);
  const timesheets = useAsyncData(() => listTeamTimesheets({ status: 'SUBMITTED', employeeId: null, periodFrom: null, periodTo: null }), []);
  const myApprovals = (approvals.data ?? []).filter((request) => request.requestedBy !== viewerId);
  const directTimesheets = (timesheets.data ?? []).filter((timesheet) => directIds.has(timesheet.employeeId));
  const isLoading = !absences.data || !approvals.data || !timesheets.data;
  const error = absences.error ?? approvals.error ?? timesheets.error;
  const total = (absences.data?.length ?? 0) + myApprovals.length + directTimesheets.length;

  return (
    <Panel title="Decisões pendentes" description={isLoading ? undefined : pluralize(total, 'pedido aguarda a sua decisão', 'pedidos aguardam a sua decisão')} flush>
      {error && <p className="px-5 py-4 text-sm text-danger">{error}</p>}
      {!error && isLoading && <LoadingState label="A carregar decisões..." />}
      {!error && !isLoading && total === 0 && <EmptyState bordered={false} icon={ClipboardCheck} title="Não há decisões pendentes." />}
      {!error && !isLoading && total > 0 && (
        <div className="divide-y divide-border">
          {(absences.data ?? []).length > 0 && (
            <section className="px-5 py-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Ausências validadas pelos gestores <PanelLink to="/timesheet/absences?tab=TEAM">Decidir</PanelLink>
              </h3>
              <ul className="space-y-1.5 text-sm">
                {(absences.data ?? []).slice(0, PREVIEW).map((request) => (
                  <li key={request.id} className="flex flex-wrap justify-between gap-2">
                    <span className="font-medium text-text">{request.employeeName ?? '—'}</span>
                    <span className="text-text-secondary">
                      {request.absenceTypeName} · {formatPeriod(request.startDate, request.endDate)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {myApprovals.length > 0 && (
            <section className="px-5 py-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Oportunidades para aprovar <PanelLink to="/timesheet/approvals">Decidir</PanelLink>
              </h3>
              <ul className="space-y-1.5 text-sm">
                {myApprovals.slice(0, PREVIEW).map((request) => (
                  <li key={request.id} className="flex flex-wrap justify-between gap-2">
                    <Link to={`/timesheet/opportunities/${request.opportunityId ?? ''}`} className="font-medium text-text hover:underline">
                      {request.title}
                    </Link>
                    <span className="text-text-secondary">{request.amount === null ? 'Sem valor' : formatMoney(request.amount, request.currency ?? '')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {directTimesheets.length > 0 && (
            <section className="px-5 py-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
                Timesheets dos gestores e da equipa direta <PanelLink to="/approvals">Rever</PanelLink>
              </h3>
              <ul className="space-y-1.5 text-sm">
                {directTimesheets.slice(0, PREVIEW).map((timesheet) => (
                  <li key={timesheet.id}>
                    <Link to={`/approvals/${timesheet.id}`} className="flex flex-wrap justify-between gap-2 hover:underline">
                      <span className="font-medium text-text">{timesheet.employeeName}</span>
                      <span className="text-text-secondary">Submetido em {formatDateTime(timesheet.submittedAt)}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </Panel>
  );
};

const WORKLOAD_SERIES: [{ label: string; swatchClass: string }, { label: string; swatchClass: string }] = [
  { label: 'Em aberto, no prazo', swatchClass: 'bg-chart-1' },
  { label: 'Em atraso', swatchClass: 'bg-chart-2' },
];

/** Painel de supervisão do Manager: gestores, equipas, decisões e resultados por período. */
export const ManagerDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const [periodDays, setPeriodDays] = useState(30);
  const [departmentId, setDepartmentId] = useState(ALL);
  const [leadId, setLeadId] = useState(ALL);
  const period = useMemo(() => recentPeriod(periodDays, new Date()), [periodDays]);
  const reportFilters = useMemo(
    () => ({ ...period, departmentId: departmentId === ALL ? null : departmentId, leadId: leadId === ALL ? null : leadId }),
    [period, departmentId, leadId]
  );

  const scopes = useAsyncData(() => listMyScopes(viewerId), [viewerId]);
  const departments = useAsyncData(listDepartments, []);
  const dashboard = useAsyncData(() => getTeamDashboard(period.from, period.to), [period.from, period.to]);
  const supervision = useAsyncData(() => getSupervisionOverview(period.from, period.to), [period.from, period.to]);
  const team = useAsyncData(getTeamWorkOverview, []);

  if (dashboard.error) return <ErrorState message={dashboard.error} onRetry={dashboard.reload} />;
  if (!dashboard.data) return <LoadingState label="A carregar a supervisão..." />;
  const summary = dashboard.data;
  const leads = (supervision.data ?? []).filter((row) => row.leadId !== null);
  const members = (team.data ?? []).filter((member) => {
    if (departmentId !== ALL && !(departments.data ?? []).some((department) => department.id === departmentId && department.name === member.departmentName)) return false;
    if (leadId === ALL) return true;
    const lead = leads.find((row) => row.leadId === leadId);
    return member.profileId === leadId || (lead !== undefined && (member.leadNames ?? '').split(', ').includes(lead.leadName));
  });
  const directIds = new Set((team.data ?? []).filter((member) => member.isDirect).map((member) => member.profileId));

  const supervisionColumns: DataTableColumn<SupervisionRow>[] = [
    {
      id: 'lead',
      header: 'Gestor / equipa',
      render: (row) => (
        <span>
          {row.leadId ? (
            <Link to={`/team/${row.leadId}`} className="block font-semibold text-text hover:underline">
              {row.leadName}
            </Link>
          ) : (
            <span className="block font-semibold text-text">{row.leadName}</span>
          )}
          <span className="block text-xs text-text-muted">{row.departments ?? (row.leadId ? 'Equipa por colaborador' : 'Sem gestor intermédio')}</span>
        </span>
      ),
    },
    { id: 'size', header: 'Pessoas', align: 'right', render: (row) => row.teamSize },
    {
      id: 'completed',
      header: 'Concluídas',
      align: 'right',
      render: (row) => (
        <span className="whitespace-nowrap">
          {row.tasksCompleted}
          {row.tasksCompletedLate > 0 && <span className="text-xs text-text-muted"> ({row.tasksCompletedLate} com atraso)</span>}
        </span>
      ),
    },
    { id: 'open', header: 'Em aberto', align: 'right', render: (row) => row.tasksOpen },
    { id: 'overdue', header: 'Atrasadas', align: 'right', render: (row) => (row.tasksOverdue > 0 ? <OverdueBadge label={String(row.tasksOverdue)} /> : 0) },
    { id: 'blocked', header: 'Bloqueadas', align: 'right', render: (row) => row.tasksBlocked },
    { id: 'hours', header: 'Horas', align: 'right', render: (row) => formatMinutesAsHours(row.minutesLogged) },
    { id: 'pending', header: 'Pedidos pendentes', align: 'right', render: (row) => row.absencesPending + row.approvalsPending },
  ];

  return (
    <div className="space-y-6">
      <PageHeader title="Supervisão" subtitle="Gestores, equipas supervisionadas, decisões que lhe competem e resultados do período." />

      {scopes.data && scopes.data.length === 0 && (
        <Alert variant="warning" title="Sem gestores atribuídos">
          Ainda não lhe foram atribuídos gestores ou equipas. Contacte a administração.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3" role="group" aria-label="Filtros do painel">
        <FilterSelect label="Período" value={String(periodDays)} onChange={(event) => setPeriodDays(Number(event.target.value))} className="w-auto">
          {PERIODS.map((option) => (
            <option key={option.days} value={option.days}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label="Departamento" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="w-auto">
          <option value={ALL}>Todos os departamentos</option>
          {(departments.data ?? [])
            .filter((department) => department.active)
            .map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
        </FilterSelect>
        <FilterSelect label="Gestor" value={leadId} onChange={(event) => setLeadId(event.target.value)} className="w-auto">
          <option value={ALL}>Todos os gestores</option>
          {leads.map((row) => (
            <option key={row.leadId ?? 'direct'} value={row.leadId ?? ''}>
              {row.leadName}
            </option>
          ))}
        </FilterSelect>
        <span className="text-xs text-text-muted">
          {formatCalendarDate(period.from)} a {formatCalendarDate(period.to)}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Gestores" value={leads.length} supporting={pluralize(summary.teamSize, 'pessoa supervisionada', 'pessoas supervisionadas')} icon={Network} />
        <StatCard label="Concluídas" value={summary.tasksCompleted} supporting={pluralize(summary.tasksCompletedLate, 'com atraso', 'com atraso')} icon={CheckCircle2} />
        <StatCard label="Em atraso" value={summary.tasksOverdue} supporting={pluralize(summary.tasksBlocked, 'bloqueada', 'bloqueadas')} icon={AlertCircle} />
        <StatCard label="Horas registadas" value={formatMinutesAsHours(summary.minutesLogged)} supporting="Equipas supervisionadas, no período" icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title="Gestores e equipas" actions={<PanelLink to="/timesheet/team">Carga da equipa</PanelLink>} flush>
            {supervision.error && (
              <div className="p-4">
                <ErrorState message={supervision.error} onRetry={supervision.reload} />
              </div>
            )}
            {supervision.isLoading && !supervision.data && <LoadingState label="A carregar as equipas..." />}
            {supervision.data && supervision.data.length === 0 && (
              <EmptyState bordered={false} icon={Network} title="Ainda não supervisiona gestores." message="A atribuição de gestores é feita pela administração." />
            )}
            {supervision.data && supervision.data.length > 0 && (
              <DataTable caption="Gestores e equipas supervisionadas" columns={supervisionColumns} rows={supervision.data} getRowKey={(row) => row.leadId ?? 'direct'} />
            )}
          </Panel>
          {supervision.data && supervision.data.length > 0 && (
            <Panel title="Distribuição da carga">
              <StackedBarChart
                title="Tarefas em aberto por equipa"
                series={WORKLOAD_SERIES}
                rows={supervision.data.map((row) => ({
                  id: row.leadId ?? 'direct',
                  label: row.leadName,
                  values: [Math.max(0, row.tasksOpen - row.tasksOverdue), row.tasksOverdue],
                  detail: `${pluralize(row.teamSize, 'pessoa', 'pessoas')} · ${formatMinutesAsHours(row.minutesLogged)} no período`,
                }))}
                emptyMessage="As equipas não têm tarefas em aberto."
              />
            </Panel>
          )}
        </div>
        <div className="space-y-6">
          <PendingDecisionsPanel viewerId={viewerId} directIds={directIds} />
          <UpcomingMeetingsPanel viewerId={viewerId} />
        </div>
      </div>

      <ReportSummaryPanel filters={reportFilters} members={members} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <MyTasksPanel viewerId={viewerId} />
        <PipelinePanel />
      </div>
    </div>
  );
};
