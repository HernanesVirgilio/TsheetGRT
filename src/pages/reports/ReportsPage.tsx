import React, { useMemo, useState } from 'react';
import { BarChart3, Download } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listReportTimesheets } from '../../services/reportService';
import type { ReportFilters } from '../../services/reportService';
import { listDepartments } from '../../services/departmentService';
import { listUsers } from '../../services/userService';
import type { TimesheetStatus } from '../../types';
import { isTimesheetStatus } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { buildCsv, downloadCsv } from '../../utils/csv';
import { formatDate, formatMinutesAsHours, formatPeriod } from '../../utils/format';
import type { ReportGroup, ReportTimesheet } from '../../utils/reports';
import { groupTimesheets, isOpenTimesheet, NO_DEPARTMENT_LABEL, sumMinutes } from '../../utils/reports';
import { t, translated, translatedFields } from '../../lib/i18n';

type ReportTab = 'BY_EMPLOYEE' | 'BY_DEPARTMENT' | 'BY_PERIOD' | 'PENDING_APPROVALS' | 'MISSING_SUBMISSIONS';

const TABS: { id: ReportTab; label: string; description: string }[] = translatedFields([
  { id: 'BY_EMPLOYEE', label: 'Por colaborador', description: 'Horas e estado dos timesheets agregados por colaborador.' },
  { id: 'BY_DEPARTMENT', label: 'Por departamento', description: 'Horas e estado dos timesheets agregados por departamento.' },
  { id: 'BY_PERIOD', label: 'Horas por período', description: 'Consolidação por período de apuração.' },
  { id: 'PENDING_APPROVALS', label: 'Aprovações pendentes', description: 'Timesheets submetidos a aguardar decisão.' },
  { id: 'MISSING_SUBMISSIONS', label: 'Submissões em falta', description: 'Timesheets em rascunho ou devolvidos para correção.' },
], ['label', 'description']);

const STATUS_LABELS: Record<TimesheetStatus, string> = translated({
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetido',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  LOCKED: 'Bloqueado',
});

const ALL = '';

const GROUP_COLUMNS = (groupHeader: string): DataTableColumn<ReportGroup>[] => [
  { id: 'label', header: groupHeader, render: (group) => <span className="font-medium text-text">{group.label}</span> },
  { id: 'count', header: t('Timesheets'), render: (group) => group.timesheetCount },
  { id: 'hours', header: t('Horas'), render: (group) => formatMinutesAsHours(group.totalMinutes) },
  { id: 'approved', header: t('Aprovados'), render: (group) => group.approvedCount },
  { id: 'submitted', header: t('Submetidos'), render: (group) => group.submittedCount },
  { id: 'open', header: t('Rascunho / rejeitados'), render: (group) => group.openCount },
];

const TIMESHEET_COLUMNS: DataTableColumn<ReportTimesheet>[] = translatedFields([
  { id: 'employee', header: 'Colaborador', render: (row) => <span className="font-medium text-text">{row.employeeName}</span> },
  { id: 'department', header: 'Departamento', render: (row) => row.departmentName ?? t(NO_DEPARTMENT_LABEL) },
  { id: 'period', header: 'Período', render: (row) => formatPeriod(row.periodStart, row.periodEnd) },
  { id: 'status', header: 'Estado', render: (row) => <StatusBadge status={row.status} size="sm" /> },
  { id: 'hours', header: 'Horas', render: (row) => formatMinutesAsHours(row.totalMinutes) },
  { id: 'submitted', header: 'Submetido em', render: (row) => formatDate(row.submittedAt) },
], ['header']);

function groupsFor(tab: ReportTab, timesheets: ReportTimesheet[]): ReportGroup[] {
  switch (tab) {
    case 'BY_EMPLOYEE':
      return groupTimesheets(timesheets, (row) => row.employeeId, (row) => row.employeeName);
    case 'BY_DEPARTMENT':
      return groupTimesheets(
        timesheets,
        (row) => row.departmentId ?? 'none',
        (row) => row.departmentName ?? t(NO_DEPARTMENT_LABEL)
      );
    case 'BY_PERIOD':
      return groupTimesheets(
        timesheets,
        (row) => `${row.periodStart}|${row.periodEnd}`,
        (row) => formatPeriod(row.periodStart, row.periodEnd)
      ).sort((first, second) => second.key.localeCompare(first.key));
    default:
      return [];
  }
}

function timesheetsFor(tab: ReportTab, timesheets: ReportTimesheet[]): ReportTimesheet[] {
  if (tab === 'PENDING_APPROVALS') return timesheets.filter((row) => row.status === 'SUBMITTED');
  if (tab === 'MISSING_SUBMISSIONS') return timesheets.filter(isOpenTimesheet);
  return timesheets;
}

const GROUP_HEADERS: Partial<Record<ReportTab, string>> = {
  BY_EMPLOYEE: 'Colaborador',
  BY_DEPARTMENT: 'Departamento',
  BY_PERIOD: 'Período',
};

interface ReportsPageProps {
  /** Dentro do centro de relatórios: sem cabeçalho próprio e com o período escolhido na barra comum. */
  embedded?: boolean;
  period?: { from: string; to: string };
}

/** Timesheets do período por colaborador, departamento e estado (separador "Timesheets"). */
export const ReportsPage: React.FC<ReportsPageProps> = ({ embedded = false, period }) => {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('REPORTS_EXPORT');

  const [activeTab, setActiveTab] = useState<ReportTab>('BY_EMPLOYEE');
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [ownFrom, setPeriodFrom] = useState('');
  const [ownTo, setPeriodTo] = useState('');
  const periodFrom = period?.from ?? ownFrom;
  const periodTo = period?.to ?? ownTo;

  const isStatusFixed = activeTab === 'PENDING_APPROVALS' || activeTab === 'MISSING_SUBMISSIONS';
  const filters: ReportFilters = {
    status: !isStatusFixed && isTimesheetStatus(status) ? status : null,
    employeeId: employeeId || null,
    departmentId: departmentId || null,
    periodFrom: periodFrom || null,
    periodTo: periodTo || null,
  };

  const report = useAsyncData(() => listReportTimesheets(filters), [
    filters.status,
    filters.employeeId,
    filters.departmentId,
    filters.periodFrom,
    filters.periodTo,
  ]);
  const filterOptions = useAsyncData(() => Promise.all([listDepartments(), listUsers()]), []);
  const [departments, employees] = filterOptions.data ?? [[], []];

  const groupHeaderSource = GROUP_HEADERS[activeTab];
  const groupHeader = groupHeaderSource ? t(groupHeaderSource) : undefined;
  const rows = useMemo(() => timesheetsFor(activeTab, report.data ?? []), [activeTab, report.data]);
  const groups = useMemo(() => groupsFor(activeTab, rows), [activeTab, rows]);
  const totalMinutes = sumMinutes(rows);
  const activeTabInfo = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const isEmpty = report.data !== null && rows.length === 0;

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const csv = groupHeader
      ? buildCsv(
          [groupHeader, t('Timesheets'), t('Horas'), t('Aprovados'), t('Submetidos'), t('Rascunho/Rejeitados')],
          groups.map((group) => [
            group.label,
            group.timesheetCount,
            formatMinutesAsHours(group.totalMinutes),
            group.approvedCount,
            group.submittedCount,
            group.openCount,
          ])
        )
      : buildCsv(
          [t('Colaborador'), t('Departamento'), t('Início do período'), t('Fim do período'), t('Estado'), t('Horas'), t('Submetido em')],
          rows.map((row) => [
            row.employeeName,
            row.departmentName ?? t(NO_DEPARTMENT_LABEL),
            row.periodStart,
            row.periodEnd,
            STATUS_LABELS[row.status],
            formatMinutesAsHours(row.totalMinutes),
            row.submittedAt ? formatDate(row.submittedAt) : '',
          ])
        );
    downloadCsv(`relatorio_${activeTab.toLowerCase()}_${today}.csv`, csv);
  };

  return (
    <div className="space-y-6">
      {embedded ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-text-secondary">{t('Timesheets cujo período coincide com o período escolhido.')}</p>
          {canExport && (
            <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
              {t('Exportar CSV')}
            </Button>
          )}
        </div>
      ) : (
        <PageHeader
          title={t('Relatórios')}
          subtitle={t('Consolidação dos timesheets visíveis para o seu perfil.')}
          actions={
            canExport && (
              <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
                {t('Exportar CSV')}
              </Button>
            )
          }
        />
      )}

      <div role="tablist" aria-label={t('Tipo de relatório')} className="flex gap-1 overflow-x-auto border-b border-border custom-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
              activeTab === tab.id
                ? 'border-primary-hover text-text'
                : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Panel>
        <div className={`grid grid-cols-1 gap-4 sm:grid-cols-2 ${period ? 'lg:grid-cols-3' : 'lg:grid-cols-5'}`}>
          <SelectField label={t('Departamento')} value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value={ALL}>{t('Todos')}</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectField>
          <SelectField label={t('Colaborador')} value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value={ALL}>{t('Todos')}</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label={t('Estado')}
            value={isStatusFixed ? ALL : status}
            disabled={isStatusFixed}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value={ALL}>{isStatusFixed ? t('Definido pelo relatório') : t('Todos')}</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          {!period && (
            <>
              <TextField label={t('Período a partir de')} type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
              <TextField label={t('Período até')} type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
            </>
          )}
        </div>
        {filterOptions.error && <p className="mt-3 text-sm text-danger">{filterOptions.error}</p>}
      </Panel>

      <Panel title={activeTabInfo.label} description={activeTabInfo.description} flush>
        {report.data && (
          <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4 text-sm">
            <div>
              <p className="text-text-muted">{t('Timesheets')}</p>
              <p className="text-lg font-semibold text-text">{rows.length}</p>
            </div>
            <div>
              <p className="text-text-muted">{t('Horas consolidadas')}</p>
              <p className="text-lg font-semibold text-text">{formatMinutesAsHours(totalMinutes)}</p>
            </div>
          </div>
        )}

        {report.error && (
          <div className="p-4">
            <ErrorState message={report.error} kind={report.errorKind} onRetry={report.reload} />
          </div>
        )}
        {report.isLoading && !report.data && <LoadingState label={t('A gerar relatório...')} />}
        {isEmpty && (
          <EmptyState
            bordered={false}
            icon={BarChart3}
            title={t('Sem timesheets para este relatório.')}
            message={t('Ajuste os filtros ou aguarde o registo de timesheets pelos colaboradores.')}
          />
        )}

        {!isEmpty && report.data && (
          <div className={report.isLoading ? 'opacity-60' : ''} aria-busy={report.isLoading}>
            {groupHeader ? (
              <DataTable
                caption={activeTabInfo.label}
                columns={GROUP_COLUMNS(groupHeader)}
                rows={groups}
                getRowKey={(group) => group.key}
              />
            ) : (
              <DataTable
                caption={activeTabInfo.label}
                columns={TIMESHEET_COLUMNS}
                rows={rows}
                getRowKey={(row) => row.id}
              />
            )}
          </div>
        )}
      </Panel>
    </div>
  );
};
