import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock3, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import { deleteWorkLog, listWorkLog } from '../../services/work/workLogService';
import { listApprovedAbsences } from '../../services/work/absenceService';
import type { EntryKind, WorkLogEntry } from '../../types/work';
import { ENTRY_KINDS, isEntryKind } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { FilterSelect, TextField } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { WorkLogFormModal } from '../../components/work/WorkLogFormModal';
import { addDays, ENTRY_KIND_LABELS, startOfWeek, toDateInput } from '../../utils/work';
import { formatDate, formatMinutesAsHours } from '../../utils/format';

const ALL = 'ALL';
const EDITABLE_TIMESHEET_STATUSES = ['DRAFT', 'REJECTED'];

function contextLink(entry: WorkLogEntry): React.ReactNode {
  if (entry.task) return <Link to={`/timesheet/tasks/${entry.task.id}`} className="text-primary-hover hover:underline">{`${entry.task.reference} · ${entry.task.title}`}</Link>;
  if (entry.meeting) return <Link to={`/timesheet/meetings/${entry.meeting.id}`} className="text-primary-hover hover:underline">{entry.meeting.title}</Link>;
  if (entry.opportunity) {
    return <Link to={`/timesheet/opportunities/${entry.opportunity.id}`} className="text-primary-hover hover:underline">{`${entry.opportunity.reference} · ${entry.opportunity.title}`}</Link>;
  }
  return <span className="text-text-muted">—</span>;
}

export const WorkLogPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const employeeId = currentUser?.id ?? '';
  const today = new Date();
  const [from, setFrom] = useState(toDateInput(startOfWeek(today)));
  const [to, setTo] = useState(toDateInput(today));
  const [kind, setKind] = useState(ALL);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [toDelete, setToDelete] = useState<WorkLogEntry | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const validRange = Boolean(from && to && from <= to);

  const data = useAsyncData(
    () =>
      validRange
        ? Promise.all([
            listWorkLog({ employeeId, from, to, kind: isEntryKind(kind) ? kind : null }),
            listApprovedAbsences(employeeId, from, to),
          ])
        : Promise.resolve(null),
    [employeeId, from, to, kind, validRange]
  );
  const [entries, absences] = data.data ?? [[], []];
  const total = entries.reduce((sum, entry) => sum + entry.totalMinutes, 0);
  const byKind = ENTRY_KINDS.map((entryKind: EntryKind) => ({
    kind: entryKind,
    minutes: entries.filter((entry) => entry.kind === entryKind).reduce((sum, entry) => sum + entry.totalMinutes, 0),
  })).filter((row) => row.minutes > 0);

  const setPreset = (preset: 'THIS_WEEK' | 'LAST_WEEK' | 'THIS_MONTH') => {
    if (preset === 'THIS_WEEK') {
      setFrom(toDateInput(startOfWeek(today)));
      setTo(toDateInput(today));
    } else if (preset === 'LAST_WEEK') {
      const start = addDays(startOfWeek(today), -7);
      setFrom(toDateInput(start));
      setTo(toDateInput(addDays(start, 6)));
    } else {
      setFrom(toDateInput(new Date(today.getFullYear(), today.getMonth(), 1)));
      setTo(toDateInput(today));
    }
  };

  const columns: DataTableColumn<WorkLogEntry>[] = [
    { id: 'date', header: 'Data', render: (entry) => <span className="whitespace-nowrap">{formatDate(entry.workDate)}</span> },
    { id: 'time', header: 'Horário', render: (entry) => `${entry.startTime}–${entry.endTime}` },
    { id: 'duration', header: 'Duração', render: (entry) => <span className="font-medium text-text">{formatMinutesAsHours(entry.totalMinutes)}</span> },
    { id: 'kind', header: 'Contexto', render: (entry) => ENTRY_KIND_LABELS[entry.kind] },
    { id: 'context', header: 'Registo', className: 'min-w-48', render: contextLink },
    { id: 'description', header: 'O que foi feito', className: 'min-w-56', render: (entry) => entry.description },
    {
      id: 'actions',
      header: 'Ações',
      align: 'right',
      hideLabelOnMobile: true,
      render: (entry) =>
        EDITABLE_TIMESHEET_STATUSES.includes(entry.timesheetStatus) ? (
          <IconButton icon={Trash2} tone="danger" label={`Eliminar o registo de ${formatDate(entry.workDate)}`} onClick={() => setToDelete(entry)} />
        ) : (
          <span className="text-xs text-text-muted">Período submetido</span>
        ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Atividades"
        subtitle="Tempo registado com contexto: tarefas, reuniões, oportunidades e atividades extraordinárias."
        actions={
          hasPermission('SELF_TIMESHEET_UPDATE') && (
            <Button icon={Plus} onClick={() => setIsFormOpen(true)}>
              Registar atividade
            </Button>
          )
        }
      />
      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}

      <Panel flush>
        <div className="flex flex-col gap-3 border-b border-border p-4 lg:flex-row lg:items-end">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => setPreset('THIS_WEEK')}>
              Esta semana
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPreset('LAST_WEEK')}>
              Semana anterior
            </Button>
            <Button size="sm" variant="secondary" onClick={() => setPreset('THIS_MONTH')}>
              Este mês
            </Button>
          </div>
          <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-3">
            <TextField label="De" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
            <TextField label="Até" type="date" value={to} error={validRange ? null : 'Intervalo inválido.'} onChange={(event) => setTo(event.target.value)} />
            <FilterSelect label="Contexto" value={kind} onChange={(event) => setKind(event.target.value)}>
              <option value={ALL}>Todos os contextos</option>
              {ENTRY_KINDS.map((value) => (
                <option key={value} value={value}>
                  {ENTRY_KIND_LABELS[value]}
                </option>
              ))}
            </FilterSelect>
          </div>
        </div>

        {data.data && (
          <div className="flex flex-wrap gap-x-6 gap-y-2 border-b border-border px-4 py-3 text-sm">
            <span className="font-semibold text-text">Total: {formatMinutesAsHours(total)}</span>
            {byKind.map((row) => (
              <span key={row.kind} className="text-text-secondary">
                {ENTRY_KIND_LABELS[row.kind]}: {formatMinutesAsHours(row.minutes)}
              </span>
            ))}
          </div>
        )}
        {absences.length > 0 && (
          <div className="border-b border-border px-4 py-3">
            <Alert variant="info" title="Ausências aprovadas no intervalo">
              {absences.map((absence) => `${absence.absenceTypeName}: ${formatDate(absence.startDate)} a ${formatDate(absence.endDate)}`).join(' · ')}
            </Alert>
          </div>
        )}

        {data.error && (
          <div className="p-4">
            <ErrorState message={data.error} onRetry={data.reload} />
          </div>
        )}
        {data.isLoading && !data.data && <LoadingState label="A carregar atividades..." />}
        {data.data && entries.length === 0 && (
          <EmptyState bordered={false} icon={Clock3} title="Não existem atividades registadas neste intervalo." message="Registe o tempo a partir de uma tarefa, de uma reunião ou com o botão Registar atividade." />
        )}
        {entries.length > 0 && <DataTable caption="Atividades registadas" columns={columns} rows={entries} getRowKey={(entry) => entry.id} />}
      </Panel>

      <WorkLogFormModal
        isOpen={isFormOpen}
        employeeId={employeeId}
        onClose={() => setIsFormOpen(false)}
        onSaved={() => {
          setIsFormOpen(false);
          setSuccessMessage('Atividade registada.');
          data.reload();
        }}
      />
      <ConfirmDialog
        isOpen={toDelete !== null}
        title="Eliminar registo de tempo"
        message={toDelete ? `O registo de ${formatDate(toDelete.workDate)} (${toDelete.startTime}–${toDelete.endTime}) será eliminado do período em rascunho.` : ''}
        confirmLabel="Eliminar"
        variant="danger"
        isLoading={isDeleting}
        errorMessage={deleteError}
        onCancel={() => {
          setToDelete(null);
          setDeleteError(null);
        }}
        onConfirm={() => {
          if (!toDelete) return;
          setIsDeleting(true);
          setDeleteError(null);
          deleteWorkLog(toDelete.id)
            .then(() => {
              setToDelete(null);
              setSuccessMessage('Registo eliminado.');
              data.reload();
            })
            .catch((error: unknown) => setDeleteError(getErrorMessage(error, 'Não foi possível eliminar o registo.')))
            .finally(() => setIsDeleting(false));
        }}
      />
    </div>
  );
};
