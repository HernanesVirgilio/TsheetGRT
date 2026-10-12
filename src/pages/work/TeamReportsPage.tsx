import React, { useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getCompletionTrend, getSupervisionOverview, getTeamReport } from '../../services/work/teamService';
import { listDepartments } from '../../services/departmentService';
import type { TeamReportRow } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, TextField } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { OverdueBadge } from '../../components/work/WorkStatusBadge';
import { StackedBarChart, StackedColumnChart } from '../../components/charts/StackedCharts';
import { daysBetween, recentPeriod } from '../../utils/work';
import { buildCsv, downloadCsv } from '../../utils/csv';
import { formatCalendarDate, formatMinutesAsHours } from '../../utils/format';
import { t, translatedFields } from '../../lib/i18n';

const ALL = 'ALL';
type MemberFilter = 'ALL' | 'OVERDUE' | 'BLOCKED' | 'NO_TIME';

const MEMBER_FILTERS: { value: MemberFilter; label: string }[] = translatedFields([
  { value: 'ALL', label: 'Todas as pessoas' },
  { value: 'OVERDUE', label: 'Com tarefas em atraso' },
  { value: 'BLOCKED', label: 'Com tarefas bloqueadas' },
  { value: 'NO_TIME', label: 'Sem tempo registado no período' },
], ['label']);

function matchesFilter(row: TeamReportRow, filter: MemberFilter): boolean {
  switch (filter) {
    case 'OVERDUE':
      return row.tasksOverdue > 0;
    case 'BLOCKED':
      return row.tasksBlocked > 0;
    case 'NO_TIME':
      return row.minutesLogged === 0;
    default:
      return true;
  }
}

const COMPLETION_SERIES: [{ label: string; swatchClass: string }, { label: string; swatchClass: string }] = [
  { label: 'Concluídas no prazo', swatchClass: 'bg-chart-1' },
  { label: 'Concluídas com atraso', swatchClass: 'bg-chart-2' },
];

/** Relatórios operacionais da equipa do âmbito (gestor) ou das equipas supervisionadas (Manager). */
interface TeamReportsPageProps {
  /** Dentro do centro de relatórios: sem cabeçalho próprio e com o período escolhido na barra comum. */
  embedded?: boolean;
  period?: { from: string; to: string };
}

/** Resultados da equipa no período: conclusões, atrasos, carga e horas (separador "Equipa e tarefas"). */
export const TeamReportsPage: React.FC<TeamReportsPageProps> = ({ embedded = false, period }) => {
  const { hasPermission } = useAuth();
  const canSupervise = hasPermission('TEAM_SUPERVISE');
  const canExport = hasPermission('REPORTS_EXPORT');
  const initial = useMemo(() => recentPeriod(30, new Date()), []);
  const [ownFrom, setFrom] = useState(initial.from);
  const [ownTo, setTo] = useState(initial.to);
  const from = period?.from ?? ownFrom;
  const to = period?.to ?? ownTo;
  const [departmentId, setDepartmentId] = useState(ALL);
  const [leadId, setLeadId] = useState(ALL);
  const [memberFilter, setMemberFilter] = useState<MemberFilter>('ALL');

  const periodError = !from || !to || to < from ? t('A data final tem de ser igual ou posterior à inicial.') : daysBetween(from, to) > 366 ? t('O período máximo é de um ano.') : null;
  const filters = { from, to, departmentId: departmentId === ALL ? null : departmentId, leadId: leadId === ALL ? null : leadId };
  const key = [from, to, departmentId, leadId];

  const departments = useAsyncData(listDepartments, []);
  const leads = useAsyncData(() => (canSupervise && !periodError ? getSupervisionOverview(from, to) : Promise.resolve([])), [canSupervise, from, to]);
  const report = useAsyncData(() => (periodError ? Promise.resolve([]) : getTeamReport(filters)), key);
  const trend = useAsyncData(() => (periodError ? Promise.resolve([]) : getCompletionTrend(filters)), key);

  const rows = (report.data ?? []).filter((row) => matchesFilter(row, memberFilter));
  const totals = rows.reduce(
    (sum, row) => ({
      completed: sum.completed + row.tasksCompleted,
      late: sum.late + row.tasksCompletedLate,
      overdue: sum.overdue + row.tasksOverdue,
      minutes: sum.minutes + row.minutesLogged,
    }),
    { completed: 0, late: 0, overdue: 0, minutes: 0 }
  );

  const columns: DataTableColumn<TeamReportRow>[] = [
    {
      id: 'name',
      header: t('Pessoa'),
      render: (row) => (
        <span>
          <span className="block font-semibold text-text">{row.fullName}</span>
          <span className="block text-xs text-text-muted">{[row.jobTitle, row.departmentName].filter(Boolean).join(' · ') || '—'}</span>
        </span>
      ),
    },
    ...(canSupervise ? [{ id: 'lead', header: t('Gestor'), render: (row: TeamReportRow) => row.leadNames ?? <span className="text-text-muted">—</span> }] : []),
    { id: 'completed', header: t('Concluídas'), align: 'right', render: (row) => row.tasksCompleted },
    { id: 'late', header: t('Com atraso'), align: 'right', render: (row) => row.tasksCompletedLate },
    { id: 'open', header: t('Em aberto'), align: 'right', render: (row) => row.tasksOpen },
    { id: 'overdue', header: t('Atrasadas'), align: 'right', render: (row) => (row.tasksOverdue > 0 ? <OverdueBadge label={String(row.tasksOverdue)} /> : 0) },
    { id: 'blocked', header: t('Bloqueadas'), align: 'right', render: (row) => row.tasksBlocked },
    { id: 'hours', header: t('Horas registadas'), align: 'right', render: (row) => formatMinutesAsHours(row.minutesLogged) },
  ];

  const exportCsv = () => {
    const csv = buildCsv(
      [t('Pessoa'), t('Cargo'), t('Departamento'), t('Gestor'), t('Concluídas'), t('Concluídas com atraso'), t('Em aberto'), t('Atrasadas'), t('Bloqueadas'), t('Minutos registados'), t('Registos')],
      rows.map((row) => [
        row.fullName,
        row.jobTitle,
        row.departmentName,
        row.leadNames,
        row.tasksCompleted,
        row.tasksCompletedLate,
        row.tasksOpen,
        row.tasksOverdue,
        row.tasksBlocked,
        row.minutesLogged,
        row.entryCount,
      ])
    );
    downloadCsv(`relatorio_equipa_${from}_${to}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {embedded ? (
        canExport && (
          <div className="flex justify-end">
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={rows.length === 0}>
              {t('Exportar CSV')}
            </Button>
          </div>
        )
      ) : (
      <PageHeader
        title={t('Relatórios da equipa')}
        subtitle={canSupervise ? t('Resultados das equipas supervisionadas: conclusões, atrasos, carga e horas.') : t('Resultados da sua equipa: conclusões, atrasos, carga e horas.')}
        actions={
          canExport && (
            <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={rows.length === 0}>
              {t('Exportar CSV')}
            </Button>
          )
        }
      />
      )}

      <Panel>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {!period && (
            <>
              <TextField label={t('De')} type="date" value={from} error={periodError} onChange={(event) => setFrom(event.target.value)} />
              <TextField label={t('Até')} type="date" value={to} onChange={(event) => setTo(event.target.value)} />
            </>
          )}
          <label className="space-y-1 text-sm font-medium text-text">
            <span className="block">{t('Departamento')}</span>
            <FilterSelect label={t('Departamento')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
              <option value={ALL}>{t('Todos')}</option>
              {(departments.data ?? [])
                .filter((department) => department.active)
                .map((department) => (
                  <option key={department.id} value={department.id}>
                    {department.name}
                  </option>
                ))}
            </FilterSelect>
          </label>
          {canSupervise && (
            <label className="space-y-1 text-sm font-medium text-text">
              <span className="block">{t('Gestor')}</span>
              <FilterSelect label={t('Gestor')} value={leadId} onChange={(event) => setLeadId(event.target.value)}>
                <option value={ALL}>{t('Todos')}</option>
                {(leads.data ?? [])
                  .filter((row) => row.leadId !== null)
                  .map((row) => (
                    <option key={row.leadId ?? ''} value={row.leadId ?? ''}>
                      {row.leadName}
                    </option>
                  ))}
              </FilterSelect>
            </label>
          )}
          <label className="space-y-1 text-sm font-medium text-text">
            <span className="block">{t('Situação')}</span>
            <FilterSelect
              label={t('Situação')}
              value={memberFilter}
              onChange={(event) => setMemberFilter(MEMBER_FILTERS.find((option) => option.value === event.target.value)?.value ?? 'ALL')}
            >
              {MEMBER_FILTERS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
          </label>
        </div>
        {!periodError && (
          <p className="mt-3 text-xs text-text-muted">
            {formatCalendarDate(from)} a {formatCalendarDate(to)} · {rows.length} pessoas · {totals.completed} concluídas ({totals.late} com atraso) ·{' '}
            {totals.overdue} em atraso · {formatMinutesAsHours(totals.minutes)} registadas
          </p>
        )}
      </Panel>

      {(report.error || trend.error) && <ErrorState message={report.error ?? trend.error ?? ''} onRetry={() => { report.reload(); trend.reload(); }} />}
      {!periodError && (report.isLoading || trend.isLoading) && !report.data && <LoadingState label={t('A calcular o relatório...')} />}

      {report.data && trend.data && !periodError && (
        <>
          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title={t('Evolução')}>
              <StackedColumnChart
                title={t('Tarefas concluídas por semana')}
                series={COMPLETION_SERIES}
                rows={trend.data.map((point) => ({
                  id: point.weekStart,
                  label: formatCalendarDate(point.weekStart).slice(0, 5),
                  values: [Math.max(0, point.tasksCompleted - point.tasksCompletedLate), point.tasksCompletedLate],
                  detail: t('Semana de {weekStart} · {minutesLogged} registadas', { weekStart: formatCalendarDate(point.weekStart), minutesLogged: formatMinutesAsHours(point.minutesLogged) }),
                }))}
                emptyMessage={t('Nenhuma tarefa concluída no período.')}
              />
            </Panel>
            <Panel title={t('Distribuição por pessoa')}>
              <StackedBarChart
                title={t('Tarefas concluídas no período')}
                series={COMPLETION_SERIES}
                rows={[...rows]
                  .sort((first, second) => second.tasksCompleted - first.tasksCompleted)
                  .map((row) => ({
                    id: row.profileId,
                    label: row.fullName,
                    values: [Math.max(0, row.tasksCompleted - row.tasksCompletedLate), row.tasksCompletedLate],
                    detail: t('{minutesLogged} registadas · {tasksOpen} em aberto', { minutesLogged: formatMinutesAsHours(row.minutesLogged), tasksOpen: row.tasksOpen }),
                  }))}
                emptyMessage={t('Nenhuma tarefa concluída no período.')}
              />
            </Panel>
          </div>
          <Panel title={t('Detalhe por pessoa')} flush>
            {rows.length === 0 ? (
              <EmptyState bordered={false} icon={BarChart3} title={t('Sem pessoas para estes filtros.')} />
            ) : (
              <DataTable caption={t('Relatório da equipa por pessoa')} columns={columns} rows={rows} getRowKey={(row) => row.profileId} />
            )}
          </Panel>
        </>
      )}
    </div>
  );
};
