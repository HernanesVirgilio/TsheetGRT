import React, { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AlertCircle, BarChart3, CalendarPlus, CheckCircle2, ClipboardCheck, Network, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyScopes, listTeamTimesheets } from '../../services/managerService';
import { getSupervisionOverview, getTeamDashboard } from '../../services/work/teamService';
import { getTeamWorkOverview } from '../../services/work/calendarService';
import { listTeamAbsences } from '../../services/work/absenceService';
import { listApprovalRequests } from '../../services/work/opportunityService';
import { listDepartments } from '../../services/departmentService';
import type { SupervisionRow } from '../../types/work';
import { DashboardHeader } from '../../components/layout/DashboardHeader';
import { HeaderLink, ReviewApprovalsLink } from '../../components/work/ReviewApprovalsLink';
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
import { t, translatedFields } from '../../lib/i18n';

const PERIODS = translatedFields([
  { days: 7, label: 'Últimos 7 dias' },
  { days: 30, label: 'Últimos 30 dias' },
  { days: 90, label: 'Últimos 90 dias' },
], ['label']);
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
    <Panel title={t('Decisões pendentes')} description={isLoading ? undefined : pluralize(total, 'pedido aguarda a sua decisão', 'pedidos aguardam a sua decisão')} flush>
      {error && <p className="px-5 py-4 text-sm text-danger">{error}</p>}
      {!error && isLoading && <LoadingState label={t('A carregar decisões...')} />}
      {!error && !isLoading && total === 0 && <EmptyState bordered={false} icon={ClipboardCheck} title={t('Não há decisões pendentes.')} />}
      {!error && !isLoading && total > 0 && (
        <div className="divide-y divide-border">
          {(absences.data ?? []).length > 0 && (
            <section className="px-5 py-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t('Ausências validadas pelos gestores')} <PanelLink to="/approvals?tab=absences">{t('Decidir')}</PanelLink>
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
                {t('Oportunidades para aprovar')} <PanelLink to="/approvals?tab=opportunities">{t('Decidir')}</PanelLink>
              </h3>
              <ul className="space-y-1.5 text-sm">
                {myApprovals.slice(0, PREVIEW).map((request) => (
                  <li key={request.id} className="flex flex-wrap justify-between gap-2">
                    <Link to={`/timesheet/opportunities/${request.opportunityId ?? ''}`} className="font-medium text-text hover:underline">
                      {request.title}
                    </Link>
                    <span className="text-text-secondary">{request.amount === null ? t('Sem valor') : formatMoney(request.amount, request.currency ?? '')}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {directTimesheets.length > 0 && (
            <section className="px-5 py-3">
              <h3 className="mb-2 flex items-center justify-between text-xs font-semibold uppercase tracking-wide text-text-secondary">
                {t('Timesheets dos gestores e da equipa direta')} <PanelLink to="/approvals">{t('Rever')}</PanelLink>
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
  if (!dashboard.data) return <LoadingState label={t('A carregar a supervisão...')} />;
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
      header: t('Gestor / equipa'),
      render: (row) => (
        <span>
          {row.leadId ? (
            <Link to={`/team/${row.leadId}`} className="block font-semibold text-text hover:underline">
              {row.leadName}
            </Link>
          ) : (
            <span className="block font-semibold text-text">{row.leadName}</span>
          )}
          <span className="block text-xs text-text-muted">{row.departments ?? (row.leadId ? t('Equipa por colaborador') : t('Sem gestor intermédio'))}</span>
        </span>
      ),
    },
    { id: 'size', header: t('Pessoas'), align: 'right', render: (row) => row.teamSize },
    {
      id: 'completed',
      header: t('Concluídas'),
      align: 'right',
      render: (row) => (
        <span className="whitespace-nowrap">
          {row.tasksCompleted}
          {row.tasksCompletedLate > 0 && <span className="text-xs text-text-muted"> ({row.tasksCompletedLate} com atraso)</span>}
        </span>
      ),
    },
    { id: 'open', header: t('Em aberto'), align: 'right', render: (row) => row.tasksOpen },
    { id: 'overdue', header: t('Atrasadas'), align: 'right', render: (row) => (row.tasksOverdue > 0 ? <OverdueBadge label={String(row.tasksOverdue)} /> : 0) },
    { id: 'blocked', header: t('Bloqueadas'), align: 'right', render: (row) => row.tasksBlocked },
    { id: 'hours', header: t('Horas'), align: 'right', render: (row) => formatMinutesAsHours(row.minutesLogged) },
    { id: 'pending', header: t('Pedidos pendentes'), align: 'right', render: (row) => row.absencesPending + row.approvalsPending },
  ];

  return (
    <div className="space-y-6">
      <DashboardHeader
        message={t('As decisões que lhe competem, o estado das equipas supervisionadas e os resultados do período.')}
        actions={
          <>
            <HeaderLink to="/timesheet/meetings" icon={CalendarPlus}>
              {t('Agendar reunião')}
            </HeaderLink>
            <HeaderLink to="/team" icon={Users}>
              {t('Ver equipa')}
            </HeaderLink>
            <HeaderLink to="/reports" icon={BarChart3}>
              {t('Relatórios')}
            </HeaderLink>
            <ReviewApprovalsLink />
          </>
        }
      />

      {scopes.data && scopes.data.length === 0 && (
        <Alert variant="warning" title={t('Sem equipa configurada')}>
          {t('Ainda não lhe foram atribuídos gestores nem colaboradores. A atribuição é feita por um administrador autorizado.')}
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-3" role="group" aria-label={t('Filtros do painel')}>
        <FilterSelect label={t('Período')} value={String(periodDays)} onChange={(event) => setPeriodDays(Number(event.target.value))} className="w-auto">
          {PERIODS.map((option) => (
            <option key={option.days} value={option.days}>
              {option.label}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect label={t('Departamento')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="w-auto">
          <option value={ALL}>{t('Todos os departamentos')}</option>
          {(departments.data ?? [])
            .filter((department) => department.active)
            .map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
        </FilterSelect>
        <FilterSelect label={t('Gestor')} value={leadId} onChange={(event) => setLeadId(event.target.value)} className="w-auto">
          <option value={ALL}>{t('Todos os gestores')}</option>
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
        <StatCard label={t('Gestores')} value={leads.length} supporting={pluralize(summary.teamSize, 'pessoa supervisionada', 'pessoas supervisionadas')} icon={Network} />
        <StatCard label={t('Concluídas')} value={summary.tasksCompleted} supporting={pluralize(summary.tasksCompletedLate, 'com atraso', 'com atraso')} icon={CheckCircle2} />
        <StatCard label={t('Em atraso')} value={summary.tasksOverdue} supporting={pluralize(summary.tasksBlocked, 'bloqueada', 'bloqueadas')} icon={AlertCircle} />
        <StatCard label={t('Horas registadas')} value={formatMinutesAsHours(summary.minutesLogged)} supporting={t('Equipas supervisionadas, no período')} icon={Users} />
      </div>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <div className="space-y-6 xl:col-span-2">
          <Panel title={t('Gestores e equipas')} actions={<PanelLink to="/team?tab=workload">{t('Carga de trabalho')}</PanelLink>} flush>
            {supervision.error && (
              <div className="p-4">
                <ErrorState message={supervision.error} onRetry={supervision.reload} />
              </div>
            )}
            {supervision.isLoading && !supervision.data && <LoadingState label={t('A carregar as equipas...')} />}
            {supervision.data && supervision.data.length === 0 && (
              <EmptyState bordered={false} icon={Network} title={t('Sem equipas configuradas.')} message={t('A atribuição de gestores e colaboradores é feita por um administrador autorizado.')} />
            )}
            {supervision.data && supervision.data.length > 0 && (
              <DataTable caption={t('Gestores e equipas supervisionadas')} columns={supervisionColumns} rows={supervision.data} getRowKey={(row) => row.leadId ?? 'direct'} />
            )}
          </Panel>
          {supervision.data && supervision.data.length > 0 && (
            <Panel title={t('Distribuição da carga')}>
              <StackedBarChart
                title={t('Tarefas em aberto por equipa')}
                series={WORKLOAD_SERIES}
                rows={supervision.data.map((row) => ({
                  id: row.leadId ?? 'direct',
                  label: row.leadName,
                  values: [Math.max(0, row.tasksOpen - row.tasksOverdue), row.tasksOverdue],
                  detail: t('{people} · {hours} no período', { people: pluralize(row.teamSize, 'pessoa', 'pessoas'), hours: formatMinutesAsHours(row.minutesLogged) }),
                }))}
                emptyMessage={t('As equipas não têm tarefas em aberto.')}
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
