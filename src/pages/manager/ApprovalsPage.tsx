import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { CheckCheck, CheckCircle2, ClipboardCheck, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { listTeamMembers, listTeamTimesheets } from '../../services/managerService';
import { approveTimesheets } from '../../services/approvalService';
import type { BulkApprovalResult, ReviewDecision } from '../../services/approvalService';
import type { TimesheetStatus, TimesheetSummary } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { SelectField, TextField } from '../../components/ui/FormField';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { ReviewDecisionModal } from '../../components/manager/ReviewDecisionModal';
import { formatDate, formatMinutesAsHours, formatPeriod, pluralize } from '../../utils/format';

type ApprovalTab = 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'DRAFT' | 'ALL';

const TABS: { id: ApprovalTab; label: string; emptyMessage: string }[] = [
  { id: 'SUBMITTED', label: 'Por aprovar', emptyMessage: 'Não existem timesheets pendentes para a sua equipa.' },
  { id: 'APPROVED', label: 'Aprovados', emptyMessage: 'Ainda não existem timesheets aprovados.' },
  { id: 'REJECTED', label: 'Rejeitados', emptyMessage: 'Não existem timesheets rejeitados a aguardar correção.' },
  { id: 'DRAFT', label: 'Em rascunho', emptyMessage: 'Não existem timesheets em rascunho na equipa.' },
  { id: 'ALL', label: 'Todos', emptyMessage: 'Ainda não existem timesheets da sua equipa.' },
];

const ALL = '';

function tabStatus(tab: ApprovalTab): TimesheetStatus | null {
  return tab === 'ALL' ? null : tab;
}

interface BulkOutcome {
  approved: number;
  failures: (BulkApprovalResult & { label: string })[];
}

export const ApprovalsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const canApprove = hasPermission('TEAM_TIMESHEET_APPROVE');
  const canReject = hasPermission('TEAM_TIMESHEET_REJECT');

  const [activeTab, setActiveTab] = useState<ApprovalTab>('SUBMITTED');
  const [employeeId, setEmployeeId] = useState(ALL);
  const [periodFrom, setPeriodFrom] = useState('');
  const [periodTo, setPeriodTo] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const [decisionTarget, setDecisionTarget] = useState<{ timesheet: TimesheetSummary; decision: ReviewDecision } | null>(null);
  const [isBulkConfirmOpen, setIsBulkConfirmOpen] = useState(false);
  const [isBulkRunning, setIsBulkRunning] = useState(false);
  const [bulkOutcome, setBulkOutcome] = useState<BulkOutcome | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const members = useAsyncData(listTeamMembers, []);
  const timesheets = useAsyncData(
    () =>
      listTeamTimesheets({
        status: tabStatus(activeTab),
        employeeId: employeeId || null,
        periodFrom: periodFrom || null,
        periodTo: periodTo || null,
      }),
    [activeTab, employeeId, periodFrom, periodTo]
  );

  useEffect(() => setSelectedIds(new Set()), [activeTab, employeeId, periodFrom, periodTo]);

  const rows = timesheets.data ?? [];
  const activeTabInfo = TABS.find((tab) => tab.id === activeTab) ?? TABS[0];
  const selectedRows = rows.filter((row) => selectedIds.has(row.id));
  const hasFilters = Boolean(employeeId || periodFrom || periodTo);

  const handleDecisionDone = (message: string) => {
    setDecisionTarget(null);
    setBulkOutcome(null);
    setSuccessMessage(message);
    timesheets.reload();
  };

  const handleBulkApprove = async () => {
    setIsBulkRunning(true);
    setActionError(null);
    setSuccessMessage(null);
    try {
      const results = await approveTimesheets([...selectedIds], null);
      const labelById = new Map(rows.map((row) => [row.id, `${row.employeeName} · ${formatPeriod(row.periodStart, row.periodEnd)}`]));
      setBulkOutcome({
        approved: results.filter((result) => result.approved).length,
        failures: results
          .filter((result) => !result.approved)
          .map((result) => ({ ...result, label: labelById.get(result.timesheetId) ?? result.timesheetId })),
      });
      setSelectedIds(new Set());
      timesheets.reload();
    } catch (error) {
      setActionError(getErrorMessage(error, 'Não foi possível aprovar os timesheets selecionados.'));
    } finally {
      setIsBulkRunning(false);
      setIsBulkConfirmOpen(false);
    }
  };

  const columns: DataTableColumn<TimesheetSummary>[] = [
    {
      id: 'employee',
      header: 'Colaborador',
      render: (row) => (
        <span>
          <span className="block font-semibold text-text">{row.employeeName}</span>
          <span className="block text-xs text-text-muted">{row.departmentName ?? 'Sem departamento'}</span>
        </span>
      ),
    },
    { id: 'period', header: 'Período', className: 'whitespace-nowrap', render: (row) => formatPeriod(row.periodStart, row.periodEnd) },
    { id: 'hours', header: 'Horas', render: (row) => `${formatMinutesAsHours(row.totalMinutes)} (${row.entryCount})` },
    { id: 'status', header: 'Estado', render: (row) => <StatusBadge status={row.status} size="sm" /> },
    { id: 'submitted', header: 'Submetido em', render: (row) => formatDate(row.submittedAt) },
    {
      id: 'actions',
      header: 'Ações',
      align: 'right',
      hideLabelOnMobile: true,
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Link
            to={`/approvals/${row.id}`}
            className="inline-flex h-8 items-center rounded-md px-2 text-sm font-semibold text-primary-hover hover:bg-surface-muted"
          >
            Rever
          </Link>
          {row.status === 'SUBMITTED' && canApprove && (
            <IconButton
              icon={CheckCircle2}
              label={`Aprovar timesheet de ${row.employeeName}`}
              onClick={() => setDecisionTarget({ timesheet: row, decision: 'APPROVED' })}
            />
          )}
          {row.status === 'SUBMITTED' && canReject && (
            <IconButton
              icon={XCircle}
              tone="danger"
              label={`Rejeitar timesheet de ${row.employeeName}`}
              onClick={() => setDecisionTarget({ timesheet: row, decision: 'REJECTED' })}
            />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Aprovações"
        subtitle="Timesheets dos colaboradores no seu âmbito de gestão."
        actions={
          canApprove &&
          activeTab === 'SUBMITTED' && (
            <Button icon={CheckCheck} disabled={selectedIds.size === 0} onClick={() => setIsBulkConfirmOpen(true)}>
              Aprovar selecionados ({selectedIds.size})
            </Button>
          )
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {actionError && <Alert variant="error">{actionError}</Alert>}
      {bulkOutcome && (
        <Alert
          variant={bulkOutcome.failures.length === 0 ? 'success' : 'warning'}
          title={`${pluralize(bulkOutcome.approved, 'timesheet aprovado', 'timesheets aprovados')}${
            bulkOutcome.failures.length > 0 ? `, ${pluralize(bulkOutcome.failures.length, 'recusado', 'recusados')}` : ''
          }.`}
          onDismiss={() => setBulkOutcome(null)}
        >
          {bulkOutcome.failures.length > 0 && (
            <ul className="mt-1 list-disc space-y-0.5 pl-5">
              {bulkOutcome.failures.map((failure) => (
                <li key={failure.timesheetId}>
                  {failure.label}: {failure.message}
                </li>
              ))}
            </ul>
          )}
        </Alert>
      )}

      <div role="tablist" aria-label="Estado dos timesheets" className="flex gap-1 overflow-x-auto border-b border-border custom-scrollbar">
        {TABS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium ${
              activeTab === tab.id ? 'border-primary-hover text-text' : 'border-transparent text-text-secondary hover:text-text'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <Panel flush>
        <div className="grid grid-cols-1 gap-4 border-b border-border p-4 sm:grid-cols-3">
          <SelectField label="Colaborador" value={employeeId} onChange={(event) => setEmployeeId(event.target.value)}>
            <option value={ALL}>Todos</option>
            {(members.data ?? []).map((member) => (
              <option key={member.id} value={member.id}>
                {member.full_name}
              </option>
            ))}
          </SelectField>
          <TextField label="Período a partir de" type="date" value={periodFrom} onChange={(event) => setPeriodFrom(event.target.value)} />
          <TextField label="Período até" type="date" value={periodTo} onChange={(event) => setPeriodTo(event.target.value)} />
        </div>

        {timesheets.error && (
          <div className="p-4">
            <ErrorState message={timesheets.error} onRetry={timesheets.reload} />
          </div>
        )}
        {timesheets.isLoading && !timesheets.data && <LoadingState label="A carregar timesheets..." />}
        {timesheets.data && rows.length === 0 && (
          <EmptyState
            bordered={false}
            icon={ClipboardCheck}
            title={hasFilters ? 'Nenhum timesheet corresponde aos filtros.' : activeTabInfo.emptyMessage}
          />
        )}
        {rows.length > 0 && (
          <div className={timesheets.isLoading ? 'opacity-60' : ''} aria-busy={timesheets.isLoading}>
            <DataTable
              caption={`Timesheets: ${activeTabInfo.label}`}
              columns={columns}
              rows={rows}
              getRowKey={(row) => row.id}
              selection={
                canApprove && activeTab === 'SUBMITTED'
                  ? {
                      selectedKeys: selectedIds,
                      onChange: setSelectedIds,
                      isSelectable: (row) => row.status === 'SUBMITTED',
                      getLabel: (row) => `Selecionar timesheet de ${row.employeeName}, ${formatPeriod(row.periodStart, row.periodEnd)}`,
                    }
                  : undefined
              }
            />
          </div>
        )}
      </Panel>

      <ReviewDecisionModal
        timesheet={decisionTarget?.timesheet ?? null}
        decision={decisionTarget?.decision ?? 'APPROVED'}
        onClose={() => setDecisionTarget(null)}
        onDone={handleDecisionDone}
      />

      <ConfirmDialog
        isOpen={isBulkConfirmOpen}
        title="Aprovar timesheets selecionados?"
        message={
          <>
            <p>
              Vai aprovar {pluralize(selectedRows.length, 'timesheet', 'timesheets')} (
              {formatMinutesAsHours(selectedRows.reduce((total, row) => total + row.totalMinutes, 0))}). Cada timesheet é
              validado no servidor; os que não puderem ser aprovados são indicados no resultado.
            </p>
          </>
        }
        confirmLabel="Aprovar"
        variant="primary"
        isLoading={isBulkRunning}
        onConfirm={handleBulkApprove}
        onCancel={() => setIsBulkConfirmOpen(false)}
      />
    </div>
  );
};
