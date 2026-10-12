import React, { useMemo, useState } from 'react';
import { BarChart3, ChevronLeft, ChevronRight, ClipboardCheck, Clock3, Download, Lightbulb, ListChecks, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getApprovalReport, getHoursReport, getHoursTrend } from '../../services/reportService';
import type { ApprovalMetrics, HoursRow } from '../../services/reportService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, TextField } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs';
import type { TabDefinition } from '../../components/ui/Tabs';
import { StackedBarChart, StackedColumnChart } from '../../components/charts/StackedCharts';
import { ReportsPage } from './ReportsPage';
import { TeamReportsPage } from '../work/TeamReportsPage';
import { buildCsv, downloadCsv } from '../../utils/csv';
import { dateTimeFormatter, formatCalendarDate, formatDateTime, formatMinutesAsHours } from '../../utils/format';
import {
  buildInsights,
  compareValues,
  describeChange,
  parseIsoDate,
  periodRange,
  previousRange,
  rangeLength,
  shiftAnchor,
  trendBucket,
} from '../../utils/reportPeriods';
import type { Change, DateRange, PeriodKind } from '../../utils/reportPeriods';
import { intlLocale, t, translatedFields } from '../../lib/i18n';

type ReportTab = 'hours' | 'timesheets' | 'team' | 'approvals';

const TAB_DEFINITIONS: TabDefinition<ReportTab>[] = translatedFields([
  { id: 'hours', label: 'Horas registadas', icon: Clock3 },
  { id: 'timesheets', label: 'Timesheets', icon: ListChecks },
  { id: 'team', label: 'Equipa e tarefas', icon: Users },
  { id: 'approvals', label: 'Aprovações', icon: ClipboardCheck },
], ['label']);

const PERIOD_OPTIONS: { kind: PeriodKind; label: string }[] = translatedFields([
  { kind: 'DAY', label: 'Diário' },
  { kind: 'WEEK', label: 'Semanal' },
  { kind: 'MONTH', label: 'Mensal' },
  { kind: 'QUARTER', label: 'Trimestral' },
  { kind: 'YEAR', label: 'Anual' },
  { kind: 'CUSTOM', label: 'Personalizado' },
], ['label']);

const HOURS_SERIES: [{ label: string; swatchClass: string }] = [{ label: 'Horas registadas', swatchClass: 'bg-chart-1' }];
const DECISION_SERIES: [{ label: string; swatchClass: string }, { label: string; swatchClass: string }] = [
  { label: 'Aprovadas', swatchClass: 'bg-chart-1' },
  { label: 'Rejeitadas', swatchClass: 'bg-chart-2' },
];

const ALL = '';
const formatNumber = (value: number) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(value);
const hoursValue = (minutes: number) => Math.round((minutes / 60) * 10) / 10;
const formatHours = (value: number) => formatMinutesAsHours(Math.round(value * 60));

function rangeLabel(range: DateRange): string {
  return range.from === range.to ? formatCalendarDate(range.from) : `${formatCalendarDate(range.from)} – ${formatCalendarDate(range.to)}`;
}

/** Rótulo de cada ponto da evolução, conforme o agrupamento. */
function bucketLabel(start: string, bucket: 'day' | 'week' | 'month'): string {
  const date = parseIsoDate(start);
  if (bucket === 'month') return dateTimeFormatter({ month: 'short', year: '2-digit' }).format(date);
  if (bucket === 'week') return t('Sem. {date}', { date: dateTimeFormatter({ day: '2-digit', month: '2-digit' }).format(date) });
  return dateTimeFormatter({ day: '2-digit', month: '2-digit' }).format(date);
}

// ----------------------------------------------------------------------------- barra de período
interface PeriodState {
  kind: PeriodKind;
  anchor: Date;
  custom: DateRange;
}

function resolveRange(state: PeriodState): DateRange {
  return state.kind === 'CUSTOM' ? state.custom : periodRange(state.kind, state.anchor);
}

const PeriodBar: React.FC<{ state: PeriodState; onChange: (state: PeriodState) => void; range: DateRange; error: string | null }> = ({ state, onChange, range, error }) => (
  <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-3 lg:flex-row lg:items-center lg:justify-between">
    <div role="group" aria-label={t('Período do relatório')} className="flex flex-wrap gap-1">
      {PERIOD_OPTIONS.map((option) => (
        <button
          key={option.kind}
          type="button"
          aria-pressed={state.kind === option.kind}
          onClick={() => onChange({ ...state, kind: option.kind, custom: option.kind === 'CUSTOM' && state.kind !== 'CUSTOM' ? range : state.custom })}
          className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
            state.kind === option.kind ? 'bg-primary text-on-primary' : 'text-text-secondary hover:bg-surface-muted hover:text-text'
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
    {state.kind === 'CUSTOM' ? (
      <div className="flex flex-wrap items-end gap-2">
        <TextField label={t('De')} type="date" value={state.custom.from} error={error} onChange={(event) => onChange({ ...state, custom: { ...state.custom, from: event.target.value } })} />
        <TextField label={t('Até')} type="date" value={state.custom.to} onChange={(event) => onChange({ ...state, custom: { ...state.custom, to: event.target.value } })} />
      </div>
    ) : (
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label={t('Período anterior')}
          onClick={() => state.kind !== 'CUSTOM' && onChange({ ...state, anchor: shiftAnchor(state.kind, state.anchor, -1) })}
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-muted hover:text-text"
        >
          <ChevronLeft className="h-4 w-4" aria-hidden="true" />
        </button>
        <span className="min-w-48 text-center text-sm font-semibold tabular-nums text-text" aria-live="polite">
          {rangeLabel(range)}
        </span>
        <button
          type="button"
          aria-label={t('Período seguinte')}
          onClick={() => state.kind !== 'CUSTOM' && onChange({ ...state, anchor: shiftAnchor(state.kind, state.anchor, 1) })}
          className="rounded-md p-1.5 text-text-secondary hover:bg-surface-muted hover:text-text"
        >
          <ChevronRight className="h-4 w-4" aria-hidden="true" />
        </button>
      </div>
    )}
  </div>
);

// ----------------------------------------------------------------------------- indicadores
const Metric: React.FC<{ label: string; value: string; change?: Change; formatDelta?: (value: number) => string; hint?: string }> = ({
  label,
  value,
  change,
  formatDelta = String,
  hint,
}) => (
  <div className="bg-surface px-4 py-3">
    <dt className="text-xs font-medium text-text-secondary">{label}</dt>
    <dd className="mt-0.5 text-xl font-semibold tabular-nums text-text">{value}</dd>
    {change && <dd className="mt-0.5 text-xs text-text-muted">{describeChange(change, formatDelta)}</dd>}
    {hint && <dd className="mt-0.5 text-xs text-text-muted">{hint}</dd>}
  </div>
);

const MetricStrip: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <dl className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">{children}</dl>
);

const InsightsPanel: React.FC<{ insights: ReturnType<typeof buildInsights> }> = ({ insights }) =>
  insights.length === 0 ? null : (
    <Panel title={t('Observações')} description={t('Calculadas a partir dos registos e de regras explícitas; descrevem o período, não fazem previsões.')}>
      <ul className="space-y-2 text-sm">
        {insights.map((insight) => (
          <li key={insight.text} className="flex items-start gap-2">
            <Lightbulb className={`mt-0.5 h-4 w-4 shrink-0 ${insight.tone === 'attention' ? 'text-warning' : 'text-primary-hover'}`} aria-hidden="true" />
            <span className="text-text">{insight.text}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );

// ----------------------------------------------------------------------------- horas
interface EmployeeHours {
  employeeId: string;
  employeeName: string;
  departmentName: string | null;
  minutes: number;
  previousMinutes: number;
  daysWorked: number;
  entries: number;
}

function sumBy<Key extends string>(rows: HoursRow[], key: (row: HoursRow) => Key, label: (row: HoursRow) => string) {
  const map = new Map<Key, { label: string; minutes: number }>();
  rows.forEach((row) => {
    const current = map.get(key(row)) ?? { label: label(row), minutes: 0 };
    map.set(key(row), { ...current, minutes: current.minutes + row.minutes });
  });
  return [...map.entries()].map(([id, value]) => ({ id, ...value })).sort((first, second) => second.minutes - first.minutes);
}

const HoursReport: React.FC<{ range: DateRange; previous: DateRange; canExport: boolean }> = ({ range, previous, canExport }) => {
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);
  const bucket = trendBucket(range);
  const data = useAsyncData(async () => {
    const unfiltered = { departmentId: null, employeeId: null };
    const [current, prior] = await Promise.all([getHoursReport({ ...range, ...unfiltered }), getHoursReport({ ...previous, ...unfiltered })]);
    return { current, prior };
  }, [range.from, range.to, previous.from, previous.to]);
  const trend = useAsyncData(
    () => getHoursTrend({ ...range, departmentId: departmentId || null, employeeId: employeeId || null }, bucket),
    [range.from, range.to, bucket, departmentId, employeeId]
  );

  const matches = (row: HoursRow) => (!departmentId || row.departmentId === departmentId) && (!employeeId || row.employeeId === employeeId);
  const current = (data.data?.current ?? []).filter(matches);
  const prior = (data.data?.prior ?? []).filter(matches);

  const employees = useMemo<EmployeeHours[]>(() => {
    const map = new Map<string, EmployeeHours>();
    current.forEach((row) => {
      const item = map.get(row.employeeId) ?? { employeeId: row.employeeId, employeeName: row.employeeName, departmentName: row.departmentName, minutes: 0, previousMinutes: 0, daysWorked: 0, entries: 0 };
      // Dias com registos: o maior valor entre atividades é um mínimo seguro (o servidor conta por atividade).
      map.set(row.employeeId, { ...item, minutes: item.minutes + row.minutes, entries: item.entries + row.entries, daysWorked: Math.max(item.daysWorked, row.daysWorked) });
    });
    prior.forEach((row) => {
      const item = map.get(row.employeeId);
      if (item) map.set(row.employeeId, { ...item, previousMinutes: item.previousMinutes + row.minutes });
    });
    return [...map.values()].sort((first, second) => second.minutes - first.minutes);
  }, [current, prior]);

  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data) return <LoadingState label={t('A gerar relatório...')} />;

  const options = data.data.current;
  const departmentOptions = sumBy(options, (row) => row.departmentId ?? 'none', (row) => row.departmentName ?? t('Sem departamento'));
  const employeeOptions = sumBy(options, (row) => row.employeeId, (row) => row.employeeName).sort((first, second) => first.label.localeCompare(second.label));

  const totalMinutes = current.reduce((sum, row) => sum + row.minutes, 0);
  const priorMinutes = prior.reduce((sum, row) => sum + row.minutes, 0);
  const people = new Set(current.map((row) => row.employeeId)).size;
  const priorPeople = new Set(prior.map((row) => row.employeeId)).size;
  const hoursChange = compareValues(totalMinutes, priorMinutes);
  const peopleChange = compareValues(people, priorPeople);
  const insights = buildInsights({ hours: hoursChange, people: peopleChange, pendingOverThreshold: null, thresholdDays: null, rejectionRate: null });
  const byDepartment = sumBy(current, (row) => row.departmentId ?? 'none', (row) => row.departmentName ?? t('Sem departamento'));
  const byActivity = sumBy(current, (row) => row.activityName, (row) => row.activityName);

  const columns: DataTableColumn<EmployeeHours>[] = [
    {
      id: 'name',
      header: t('Colaborador'),
      render: (row) => (
        <span>
          <span className="block font-semibold text-text">{row.employeeName}</span>
          <span className="block text-xs text-text-muted">{row.departmentName ?? t('Sem departamento')}</span>
        </span>
      ),
    },
    { id: 'hours', header: t('Horas'), align: 'right', render: (row) => <span className="tabular-nums">{formatMinutesAsHours(row.minutes)}</span> },
    {
      id: 'previous',
      header: t('Período anterior'),
      align: 'right',
      render: (row) => <span className="tabular-nums text-text-secondary">{row.previousMinutes > 0 ? formatMinutesAsHours(row.previousMinutes) : '—'}</span>,
    },
    { id: 'days', header: t('Dias com registos'), align: 'right', render: (row) => row.daysWorked },
    { id: 'entries', header: t('Registos'), align: 'right', render: (row) => row.entries },
  ];

  const exportCsv = () => {
    const csv = buildCsv(
      [t('Colaborador'), t('Departamento'), t('Atividade'), t('Minutos registados'), t('Registos'), t('Dias com registos'), t('De'), t('Até')],
      current.map((row) => [row.employeeName, row.departmentName ?? '', row.activityName, row.minutes, row.entries, row.daysWorked, range.from, range.to])
    );
    downloadCsv(`relatorio_horas_${range.from}_${range.to}.csv`, csv);
  };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-3">
          <FilterSelect label={t('Departamento')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)} className="w-auto">
            <option value={ALL}>{t('Todos os departamentos')}</option>
            {departmentOptions
              .filter((option) => option.id !== 'none')
              .map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
          </FilterSelect>
          {employeeOptions.length > 1 && (
            <FilterSelect label={t('Colaborador')} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)} className="w-auto">
              <option value={ALL}>{t('Todos os colaboradores')}</option>
              {employeeOptions.map((option) => (
                <option key={option.id} value={option.id}>
                  {option.label}
                </option>
              ))}
            </FilterSelect>
          )}
        </div>
        {canExport && (
          <Button variant="secondary" icon={Download} onClick={exportCsv} disabled={current.length === 0}>
            {t('Exportar CSV')}
          </Button>
        )}
      </div>

      <MetricStrip>
        <Metric label={t('Horas registadas')} value={formatMinutesAsHours(totalMinutes)} change={hoursChange} formatDelta={formatMinutesAsHours} />
        <Metric label={t('Pessoas com registos')} value={String(people)} change={peopleChange} />
        <Metric label={t('Média por pessoa')} value={people > 0 ? formatMinutesAsHours(Math.round(totalMinutes / people)) : '—'} />
        <Metric label={t('Período anterior')} value={formatMinutesAsHours(priorMinutes)} hint={rangeLabel(previous)} />
      </MetricStrip>

      <InsightsPanel insights={insights} />

      {current.length === 0 ? (
        <Panel>
          <EmptyState bordered={false} icon={BarChart3} title={t('Sem horas registadas neste período.')} message={t('Escolha outro período ou ajuste os filtros.')} />
        </Panel>
      ) : (
        <>
          <Panel title={t('Evolução das horas')} description={t('{range} · agrupado por {bucket}', { range: rangeLabel(range), bucket: bucket === 'day' ? t('dia') : bucket === 'week' ? t('semana') : t('mês') })}>
            {trend.error ? (
              <ErrorState message={trend.error} onRetry={trend.reload} />
            ) : !trend.data ? (
              <LoadingState label={t('A carregar...')} />
            ) : (
              <StackedColumnChart
                title={t('Horas registadas por {bucket}', { bucket: bucket === 'day' ? t('dia') : bucket === 'week' ? t('semana') : t('mês') })}
                series={HOURS_SERIES}
                rows={trend.data.map((point) => ({
                  id: point.bucketStart,
                  label: bucketLabel(point.bucketStart, bucket),
                  values: [hoursValue(point.minutes)],
                  detail: t('{people} pessoa(s) com registos', { people: point.people }),
                }))}
                formatValue={formatHours}
                emptyMessage={t('Sem horas registadas neste período.')}
              />
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
            <Panel title={t('Horas por departamento')}>
              <StackedBarChart
                title={t('Horas por departamento')}
                series={HOURS_SERIES}
                rows={byDepartment.map((item) => ({ id: item.id, label: item.label, values: [hoursValue(item.minutes)] }))}
                formatValue={formatHours}
                emptyMessage={t('Sem horas registadas neste período.')}
              />
            </Panel>
            <Panel title={t('Horas por atividade')}>
              <StackedBarChart
                title={t('Horas por atividade')}
                series={HOURS_SERIES}
                rows={byActivity.map((item) => ({ id: item.id, label: item.label, values: [hoursValue(item.minutes)] }))}
                formatValue={formatHours}
                emptyMessage={t('Sem horas registadas neste período.')}
              />
            </Panel>
          </div>

          <Panel title={t('Horas por colaborador')} description={t('Comparação com {previous}', { previous: rangeLabel(previous) })} flush>
            <DataTable caption={t('Horas por colaborador')} columns={columns} rows={employees} getRowKey={(row) => row.employeeId} />
          </Panel>
        </>
      )}
    </>
  );
};

// ----------------------------------------------------------------------------- aprovações
const rejectionRate = (metrics: ApprovalMetrics) => {
  const decisions = metrics.approved + metrics.rejected;
  return decisions > 0 ? Math.round((metrics.rejected / decisions) * 1000) / 10 : 0;
};

const ApprovalReport: React.FC<{ range: DateRange; previous: DateRange }> = ({ range, previous }) => {
  const data = useAsyncData(
    () => Promise.all([getApprovalReport(range.from, range.to, null), getApprovalReport(previous.from, previous.to, null)]),
    [range.from, range.to, previous.from, previous.to]
  );
  if (data.error) return <ErrorState message={data.error} onRetry={data.reload} />;
  if (!data.data) return <LoadingState label={t('A gerar relatório...')} />;
  const [current, prior] = data.data;
  const decisions = current.approved + current.rejected;
  const priorDecisions = prior.approved + prior.rejected;
  const rate = compareValues(rejectionRate(current), rejectionRate(prior));
  const insights = buildInsights({
    hours: compareValues(0, 0),
    people: compareValues(0, 0),
    pendingOverThreshold: current.pendingOverThreshold,
    thresholdDays: current.thresholdDays,
    // A taxa só é comparável quando os dois períodos têm decisões.
    rejectionRate: decisions > 0 && priorDecisions > 0 ? rate : null,
  });

  return (
    <>
      <MetricStrip>
        <Metric label={t('Decisões')} value={String(decisions)} change={compareValues(decisions, priorDecisions)} hint={t('{approved} aprovadas · {rejected} rejeitadas', { approved: current.approved, rejected: current.rejected })} />
        <Metric
          label={t('Taxa de rejeição')}
          value={decisions > 0 ? `${formatNumber(rejectionRate(current))}%` : '—'}
          hint={priorDecisions > 0 ? t('{rate}% no período anterior', { rate: formatNumber(rejectionRate(prior)) }) : t('Sem decisões no período anterior')}
        />
        <Metric
          label={t('Tempo médio até à decisão')}
          value={current.avgDecisionHours === null ? '—' : formatHours(current.avgDecisionHours)}
          hint={
            current.avgDecisionHours === null
              ? t('Sem decisões medidas no período')
              : prior.avgDecisionHours === null
                ? t('Sem base de comparação no período anterior')
                : t('{hours} no período anterior', { hours: formatHours(prior.avgDecisionHours) })
          }
        />
        <Metric
          label={t('Pendentes agora')}
          value={String(current.pendingNow)}
          hint={
            current.pendingNow > 0
              ? t('{count} há mais de {days} dias · mais antigo: {date}', { count: current.pendingOverThreshold, days: current.thresholdDays, date: formatDateTime(current.oldestPendingAt) })
              : t('Nenhum timesheet à espera de decisão')
          }
        />
      </MetricStrip>

      <InsightsPanel insights={insights} />

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel title={t('Decisões por período')} description={t('{current} comparado com {previous}', { current: rangeLabel(range), previous: rangeLabel(previous) })}>
          <StackedBarChart
            title={t('Decisões por período')}
            series={DECISION_SERIES}
            rows={[
              { id: 'previous', label: t('Período anterior'), values: [prior.approved, prior.rejected] },
              { id: 'current', label: t('Período atual'), values: [current.approved, current.rejected] },
            ]}
            emptyMessage={t('Sem decisões em nenhum dos períodos.')}
          />
        </Panel>
        <Panel title={t('Correções')}>
          <p className="text-3xl font-semibold tabular-nums text-text">{current.resubmittedApproved}</p>
          <p className="mt-1 text-sm text-text-secondary">{t('Timesheets aprovados no período depois de pelo menos uma rejeição e nova submissão.')}</p>
          <p className="mt-4 text-xs text-text-muted">
            {t('O tempo até à decisão mede da última submissão à decisão mais recente de cada timesheet ({count} medidos).', { count: current.decisionsMeasured })}
          </p>
        </Panel>
      </div>
    </>
  );
};

// ----------------------------------------------------------------------------- página
/**
 * Centro de relatórios: o que aconteceu num período e como mudou. O painel inicial responde ao "agora";
 * aqui analisa-se o histórico. Todos os dados respeitam o âmbito de quem consulta (RLS no servidor).
 */
export const ReportsCenterPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const available: ReportTab[] = [
    'hours',
    ...(hasPermission('REPORTS_READ') ? (['timesheets'] as const) : []),
    ...(hasPermission('TEAM_READ') ? (['team'] as const) : []),
    ...(hasPermission('TEAM_TIMESHEET_REVIEW') || hasPermission('REPORTS_READ') ? (['approvals'] as const) : []),
  ];
  const [active = 'hours', setActive] = useTabParam(available);
  const [today] = useState(() => new Date());
  const [period, setPeriod] = useState<PeriodState>(() => ({ kind: 'MONTH', anchor: today, custom: periodRange('MONTH', today) }));
  const range = resolveRange(period);
  const customError =
    period.kind !== 'CUSTOM'
      ? null
      : !range.from || !range.to || range.to < range.from
        ? t('A data final tem de ser igual ou posterior à inicial.')
        : rangeLength(range) > 366
          ? t('O período máximo é de um ano.')
          : null;
  const previous = customError ? range : previousRange(period.kind, range);
  const tabs = TAB_DEFINITIONS.filter((tab) => available.includes(tab.id));

  return (
    <div className="space-y-5">
      <PageHeader title={t('Relatórios')} subtitle={t('O que aconteceu no período, como mudou e o que os dados mostram. Os valores respeitam o seu âmbito.')} />
      <PeriodBar state={period} onChange={setPeriod} range={range} error={customError} />
      <div>
        <Tabs tabs={tabs} activeId={active} onChange={setActive} label={t('Categorias de relatório')} idPrefix="relatorios" />
        <TabPanel idPrefix="relatorios" activeId={active}>
          {customError ? (
            <EmptyState title={customError} />
          ) : (
            <>
              {active === 'hours' && <HoursReport range={range} previous={previous} canExport={hasPermission('REPORTS_EXPORT')} />}
              {active === 'timesheets' && <ReportsPage embedded period={range} />}
              {active === 'team' && <TeamReportsPage embedded period={range} />}
              {active === 'approvals' && <ApprovalReport range={range} previous={previous} />}
            </>
          )}
        </TabPanel>
      </div>
      <p className="text-xs text-text-muted">{t('Datas no fuso de Maputo. Gerado em {date}.', { date: formatDateTime(today.toISOString()) })}</p>
    </div>
  );
};
