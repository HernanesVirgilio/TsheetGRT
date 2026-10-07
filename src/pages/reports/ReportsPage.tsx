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

type ReportTab = 'BY_EMPLOYEE' | 'BY_DEPARTMENT' | 'BY_PERIOD' | 'PENDING_APPROVALS' | 'MISSING_SUBMISSIONS';

const TABS: { id: ReportTab; label: string; description: string }[] = [
  { id: 'BY_EMPLOYEE', label: 'Por colaborador', description: 'Horas e estado dos timesheets agregados por colaborador.' },
  { id: 'BY_DEPARTMENT', label: 'Por departamento', description: 'Horas e estado dos timesheets agregados por departamento.' },
  { id: 'BY_PERIOD', label: 'Horas por período', description: 'Consolidação por período de apuração.' },
  { id: 'PENDING_APPROVALS', label: 'Aprovações pendentes', description: 'Timesheets submetidos a aguardar decisão.' },
  { id: 'MISSING_SUBMISSIONS', label: 'Submissões em falta', description: 'Timesheets em rascunho ou devolvidos para correção.' },
];

const STATUS_LABELS: Record<TimesheetStatus, string> = {
  DRAFT: 'Rascunho',
  SUBMITTED: 'Submetido',
  APPROVED: 'Aprovado',
  REJECTED: 'Rejeitado',
  LOCKED: 'Bloqueado',
};

const ALL = '';

const GROUP_COLUMNS = (groupHeader: string): DataTableColumn<ReportGroup>[] => [
  { id: 'label', header: groupHeader, render: (group) => <span className="font-medium text-text">{group.label}</span> },
  { id: 'count', header: 'Timesheets', render: (group) => group.timesheetCount },
  { id: 'hours', header: 'Horas', render: (group) => formatMinutesAsHours(group.totalMinutes) },
  { id: 'approved', header: 'Aprovados', render: (group) => group.approvedCount },
  { id: 'submitted', header: 'Submetidos', render: (group) => group.submittedCount },
  { id: 'open', header: 'Rascunho / rejeitados', render: (group) => group.openCount },
];

const TIMESHEET_COLUMNS: DataTableColumn<ReportTimesheet>[] = [
  { id: 'employee', header: 'Colaborador', render: (row) => <span className="font-medium text-text">{row.employeeName}</span> },
  { id: 'department', header: 'Departamento', render: (row) => row.departmentName ?? NO_DEPARTMENT_LABEL },
  { id: 'period', header: 'Período', render: (row) => formatPeriod(row.periodStart, row.periodEnd) },
  { id: 'status', header: 'Estado', render: (row) => <StatusBadge status={row.status} size="sm" /> },
  { id: 'hours', header: 'Horas', render: (row) => formatMinutesAsHours(row.totalMinutes) },
  { id: 'submitted', header: 'Submetido em', render: (row) => formatDate(row.submittedAt) },
];

function groupsFor(tab: ReportTab, timesheets: ReportTimesheet[]): ReportGroup[] {
  switch (tab) {
    case 'BY_EMPLOYEE':
      return groupTimesheets(timesheets, (row) => row.employeeId, (row) => row.employeeName);
    case 'BY_DEPARTMENT':
      return groupTimesheets(
        timesheets,
        (row) => row.departmentId ?? 'none',
        (row) => row.departmentName ?? NO_DEPARTMENT_LABEL
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

export const ReportsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canExport = hasPermission('REPORTS_EXPORT');

  const [activeTab, setActiveTab] = useState<ReportTab>('BY_EMPLOYEE');
  const [departmentId, setDepartmentId] = useState(ALL);
  const [employeeId, setEmployeeId] = useState(ALL);
  const [status, setStatus] = useState(ALL);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');

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

  const groupHeader = GROUP_HEADERS[activeTab];
  const rows = useMemo(() => timesheetsFor(activeTab, report.data ?? []), [activeTab, report.data]);
  const groups = useMemo(() => groupsFor(activeTab, rows), [activeTab, rows]);
  const totalMinutes = sumMinutes(rows);
  const activeTabInfo = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const isEmpty = report.data !== null && rows.length === 0;

  const handleExport = () => {
    const today = new Date().toISOString().slice(0, 10);
    const csv = groupHeader
      ? buildCsv(
          [groupHeader, 'Timesheets', 'Horas', 'Aprovados', 'Submetidos', 'Rascunho/Rejeitados'],
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
          ['Colaborador', 'Departamento', 'Início do período', 'Fim do período', 'Estado', 'Horas', 'Submetido em'],
          rows.map((row) => [
            row.employeeName,
            row.departmentName ?? NO_DEPARTMENT_LABEL,
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
      <PageHeader
        title="Relatórios"
        subtitle="Consolidação dos timesheets visíveis para o seu perfil."
        actions={
          canExport && (
            <Button variant="secondary" icon={Download} onClick={handleExport} disabled={rows.length === 0}>
              Exportar CSV
            </Button>
          )
        }
      />

      <div role="tablist" aria-label="Tipo de relatório" className="flex gap-1 overflow-x-auto border-b border-border custom-scrollbar">
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
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
          <SelectField label="Departamento" value={departmentId} onChange={(event) => setDepartmentId(event.target.value)}>
            <option value={ALL}>Todos</option>
            {departments.map((department) => (
              <option key={department.id} value={department.id}>
                {department.name}
              </option>
            ))}
          </SelectField>
          <SelectField label="Colaborador" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value={ALL}>Todos</option>
            {employees.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.full_name}
              </option>
            ))}
          </SelectField>
          <SelectField
            label="Estado"
            value={isStatusFixed ? ALL : status}
            disabled={isStatusFixed}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value={ALL}>{isStatusFixed ? 'Definido pelo relatório' : 'Todos'}</option>
            {Object.entries(STATUS_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </SelectField>
          <TextField label="Período a partir de" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
          <TextField label="Período até" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
        </div>
        {filterOptions.error && <p className="mt-3 text-sm text-danger">{filterOptions.error}</p>}
      </Panel>

      <Panel title={activeTabInfo.label} description={activeTabInfo.description} flush>
        {report.data && (
          <div className="grid grid-cols-2 gap-4 border-b border-border px-5 py-4 text-sm">
            <div>
              <p className="text-text-muted">Timesheets</p>
              <p className="text-lg font-semibold text-text">{rows.length}</p>
            </div>
            <div>
              <p className="text-text-muted">Horas consolidadas</p>
              <p className="text-lg font-semibold text-text">{formatMinutesAsHours(totalMinutes)}</p>
            </div>
          </div>
        )}

        {report.error && (
          <div className="p-4">
            <ErrorState message={report.error} onRetry={report.reload} />
          </div>
        )}
        {report.isLoading && !report.data && <LoadingState label="A gerar relatório..." />}
        {isEmpty && (
          <EmptyState
            bordered={false}
            icon={BarChart3}
            title="Sem timesheets para este relatório."
            message="Ajuste os filtros ou aguarde o registo de timesheets pelos colaboradores."
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
