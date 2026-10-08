import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Clock3, Plus } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { createTimesheet, listMyTimesheets } from '../../services/timesheetService';
import type { TimesheetSummary } from '../../types';
import { isTimesheetStatus } from '../../types';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { FilterSelect, TextField } from '../../components/ui/FormField';
import { Modal } from '../../components/ui/Modal';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { formatDate, formatMinutesAsHours, formatPeriod } from '../../utils/format';
import type { PeriodField } from '../../utils/timesheets';
import { validatePeriod } from '../../utils/timesheets';
import type { FieldErrors } from '../../utils/validation';
import { hasErrors } from '../../utils/validation';

const ALL = '';

const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'DRAFT', label: 'Rascunho' },
  { value: 'SUBMITTED', label: 'Submetido' },
  { value: 'APPROVED', label: 'Aprovado' },
  { value: 'REJECTED', label: 'Rejeitado' },
];

/** Período sugerido: o mês corrente (datas de calendário locais). */
function currentMonthPeriod(): { start: string; end: string } {
  const today = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const lastDay = new Date(year, month, 0).getDate();
  return { start: `${year}-${pad(month)}-01`, end: `${year}-${pad(month)}-${pad(lastDay)}` };
}

const COLUMNS: DataTableColumn<TimesheetSummary>[] = [
  {
    id: 'period',
    header: 'Período',
    render: (timesheet) => (
      <Link to={`/timesheets/${timesheet.id}`} className="font-semibold text-primary-hover hover:underline">
        {formatPeriod(timesheet.periodStart, timesheet.periodEnd)}
      </Link>
    ),
  },
  { id: 'status', header: 'Estado', render: (timesheet) => <StatusBadge status={timesheet.status} size="sm" /> },
  { id: 'entries', header: 'Registos', render: (timesheet) => timesheet.entryCount },
  { id: 'hours', header: 'Horas', render: (timesheet) => formatMinutesAsHours(timesheet.totalMinutes) },
  { id: 'submitted', header: 'Submetido em', render: (timesheet) => formatDate(timesheet.submittedAt) },
];

interface NewPeriodModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const NewPeriodModal: React.FC<NewPeriodModalProps> = ({ isOpen, onClose }) => {
  const { currentUser } = useAuth();
  const navigate = useNavigate();
  const [periodStart, setPeriodStart] = useState('');
  const [periodEnd, setPeriodEnd] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors<PeriodField>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const period = currentMonthPeriod();
    setPeriodStart(period.start);
    setPeriodEnd(period.end);
    setFieldErrors({});
    setErrorMessage(null);
  }, [isOpen]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!currentUser) return;
    const errors = validatePeriod(periodStart, periodEnd);
    setFieldErrors(errors);
    if (hasErrors(errors)) return;

    setIsSubmitting(true);
    setErrorMessage(null);
    try {
      const timesheetId = await createTimesheet(currentUser.id, periodStart, periodEnd);
      navigate(`/timesheets/${timesheetId}`);
    } catch (error) {
      setErrorMessage(getErrorMessage(error, 'Não foi possível criar o período.'));
      setIsSubmitting(false);
    }
  };

  const formId = 'new-period-form';

  return (
    <Modal
      isOpen={isOpen}
      title="Novo período"
      description="Indique o intervalo de datas do timesheet."
      size="sm"
      isBusy={isSubmitting}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={isSubmitting}>
            Cancelar
          </Button>
          <Button type="submit" form={formId} isLoading={isSubmitting}>
            Criar período
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={handleSubmit} className="space-y-4" noValidate>
        {errorMessage && <Alert variant="error">{errorMessage}</Alert>}
        <TextField
          label="Data de início"
          type="date"
          required
          value={periodStart}
          error={fieldErrors.periodStart}
          onChange={(event) => setPeriodStart(event.target.value)}
        />
        <TextField
          label="Data de fim"
          type="date"
          required
          value={periodEnd}
          error={fieldErrors.periodEnd}
          onChange={(event) => setPeriodEnd(event.target.value)}
        />
      </form>
    </Modal>
  );
};

export const TimesheetListPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const profileId = currentUser?.id ?? '';
  const timesheets = useAsyncData(() => listMyTimesheets(profileId), [profileId]);
  const [statusFilter, setStatusFilter] = useState(ALL);
  const [isNewPeriodOpen, setIsNewPeriodOpen] = useState(false);
  const canCreate = hasPermission('SELF_TIMESHEET_CREATE');

  const visible = (timesheets.data ?? []).filter(
    (timesheet) => !isTimesheetStatus(statusFilter) || timesheet.status === statusFilter
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="Meu Timesheet"
        subtitle="Os seus períodos de registo de horas e o respetivo estado de aprovação."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setIsNewPeriodOpen(true)}>
              Novo período
            </Button>
          )
        }
      />

      <Panel flush>
        <div className="border-b border-border p-4">
          <FilterSelect
            label="Filtrar por estado"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
            className="sm:max-w-xs"
          >
            <option value={ALL}>Todos os estados</option>
            {STATUS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </FilterSelect>
        </div>

        {timesheets.error && (
          <div className="p-4">
            <ErrorState message={timesheets.error} onRetry={timesheets.reload} />
          </div>
        )}
        {timesheets.isLoading && !timesheets.data && <LoadingState label="A carregar timesheets..." />}
        {timesheets.data && visible.length === 0 && (
          <EmptyState
            bordered={false}
            icon={Clock3}
            title={statusFilter ? 'Nenhum timesheet neste estado.' : 'Ainda não tem timesheets.'}
            message={canCreate && !statusFilter ? 'Crie um período para começar a registar horas.' : undefined}
            action={
              canCreate &&
              !statusFilter && (
                <Button size="sm" icon={Plus} onClick={() => setIsNewPeriodOpen(true)}>
                  Novo período
                </Button>
              )
            }
          />
        )}
        {visible.length > 0 && (
          <DataTable caption="Os meus timesheets" columns={COLUMNS} rows={visible} getRowKey={(timesheet) => timesheet.id} />
        )}
      </Panel>

      <NewPeriodModal isOpen={isNewPeriodOpen} onClose={() => setIsNewPeriodOpen(false)} />
    </div>
  );
};
