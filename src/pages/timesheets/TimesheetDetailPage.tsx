import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, Pencil, Plus, Send, Trash2 } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getErrorMessage } from '../../lib/errors';
import {
  deleteTimesheetEntry,
  getTimesheetDetail,
  listActiveActivities,
  submitTimesheet,
} from '../../services/timesheetService';
import type { TimesheetEntryDetail } from '../../services/timesheetService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatCard } from '../../components/ui/StatCard';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TimesheetEntriesTable } from '../../components/timesheets/TimesheetEntriesTable';
import { TimesheetStatusNotice } from '../../components/timesheets/TimesheetStatusNotice';
import { DecisionHistory } from '../../components/timesheets/DecisionHistory';
import { EntryFormModal } from '../../components/timesheets/EntryFormModal';
import { formatMinutesAsHours, formatPeriod, pluralize } from '../../utils/format';
import { isUuid } from '../../utils/validation';

const BackLink: React.FC = () => (
  <Link to="/timesheets" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    Voltar a Meu Timesheet
  </Link>
);

/** Timesheet do próprio utilizador: registo de horas e submissão. */
export const TimesheetDetailPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { currentUser, hasPermission } = useAuth();
  const detail = useAsyncData(() => (isUuid(id) ? getTimesheetDetail(id) : Promise.resolve(null)), [id]);
  const activities = useAsyncData(listActiveActivities, []);

  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [isEntryFormOpen, setIsEntryFormOpen] = useState(false);
  const [entryToEdit, setEntryToEdit] = useState<TimesheetEntryDetail | null>(null);
  const [entryToDelete, setEntryToDelete] = useState<TimesheetEntryDetail | null>(null);
  const [isSubmitConfirmOpen, setIsSubmitConfirmOpen] = useState(false);
  const [isWorking, setIsWorking] = useState(false);

  if (detail.isLoading && !detail.data) return <LoadingState label="A carregar timesheet..." />;
  if (detail.error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  // Esta página é apenas para o próprio timesheet; os gestores reveem em /approvals/:id.
  if (!detail.data || detail.data.summary.employeeId !== currentUser?.id) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title="Timesheet não encontrado." message="O timesheet não existe ou não lhe pertence." />
      </div>
    );
  }

  const { summary, entries, decisions } = detail.data;
  // Enquanto recarrega após uma ação, os dados podem estar desatualizados: não oferecer edição.
  const isEditable =
    (summary.status === 'DRAFT' || summary.status === 'REJECTED') && hasPermission('SELF_TIMESHEET_UPDATE') && !detail.isLoading;
  const canSubmit = isEditable && hasPermission('SELF_TIMESHEET_SUBMIT');
  const workedDays = new Set(entries.map((entry) => entry.workDate)).size;

  const handleSaved = (message: string) => {
    setIsEntryFormOpen(false);
    setEntryToEdit(null);
    setSuccessMessage(message);
    detail.reload();
  };

  const runAction = async (action: () => Promise<void>, message: string, fallback: string) => {
    setIsWorking(true);
    setActionError(null);
    try {
      await action();
      setSuccessMessage(message);
      detail.reload();
    } catch (error) {
      setActionError(getErrorMessage(error, fallback));
    } finally {
      setIsWorking(false);
      setEntryToDelete(null);
      setIsSubmitConfirmOpen(false);
    }
  };

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={formatPeriod(summary.periodStart, summary.periodEnd)}
        subtitle={`${summary.employeeName} · ${summary.employeeNumber ?? ''}`}
        actions={
          <>
            <StatusBadge status={summary.status} />
            {isEditable && (
              <Button
                variant="secondary"
                icon={Plus}
                onClick={() => {
                  setEntryToEdit(null);
                  setIsEntryFormOpen(true);
                }}
                disabled={!activities.data}
              >
                Adicionar registo
              </Button>
            )}
            {canSubmit && (
              <Button icon={Send} onClick={() => setIsSubmitConfirmOpen(true)} disabled={entries.length === 0}>
                Submeter
              </Button>
            )}
          </>
        }
      />

      {successMessage && (
        <Alert variant="success" onDismiss={() => setSuccessMessage(null)}>
          {successMessage}
        </Alert>
      )}
      {actionError && <Alert variant="error">{actionError}</Alert>}
      {activities.error && <ErrorState message={activities.error} onRetry={activities.reload} />}
      <TimesheetStatusNotice summary={summary} decisions={decisions} audience="owner" />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Horas registadas" value={formatMinutesAsHours(summary.totalMinutes)} />
        <StatCard label="Dias com registos" value={workedDays} />
        <StatCard label="Registos" value={entries.length} />
      </div>

      <Panel title="Registos de horas" flush>
        <TimesheetEntriesTable
          entries={entries}
          emptyMessage={isEditable ? 'Adicione os registos diários antes de submeter.' : 'Este timesheet não tem registos.'}
          renderActions={
            isEditable
              ? (entry) => (
                  <div className="flex justify-end gap-1">
                    <IconButton
                      icon={Pencil}
                      label={`Editar registo de ${entry.workDate}`}
                      onClick={() => {
                        setEntryToEdit(entry);
                        setIsEntryFormOpen(true);
                      }}
                    />
                    <IconButton
                      icon={Trash2}
                      tone="danger"
                      label={`Eliminar registo de ${entry.workDate}`}
                      onClick={() => setEntryToDelete(entry)}
                    />
                  </div>
                )
              : undefined
          }
        />
      </Panel>

      <DecisionHistory decisions={decisions} />

      {activities.data && (
        <EntryFormModal
          isOpen={isEntryFormOpen}
          timesheet={summary}
          entry={entryToEdit}
          activities={activities.data}
          onClose={() => {
            setIsEntryFormOpen(false);
            setEntryToEdit(null);
          }}
          onSaved={handleSaved}
        />
      )}

      <ConfirmDialog
        isOpen={Boolean(entryToDelete)}
        title="Eliminar registo?"
        message="O registo de horas será removido deste timesheet."
        confirmLabel="Eliminar"
        isLoading={isWorking}
        onConfirm={() =>
          entryToDelete &&
          runAction(() => deleteTimesheetEntry(entryToDelete.id), 'Registo eliminado.', 'Não foi possível eliminar o registo.')
        }
        onCancel={() => setEntryToDelete(null)}
      />

      <ConfirmDialog
        isOpen={isSubmitConfirmOpen}
        title="Submeter timesheet?"
        message={`Vai submeter ${formatMinutesAsHours(summary.totalMinutes)} em ${pluralize(entries.length, 'registo', 'registos')}. Depois de submetido, o timesheet fica bloqueado até à decisão do gestor.`}
        confirmLabel="Submeter"
        variant="primary"
        isLoading={isWorking}
        onConfirm={() =>
          runAction(
            () => submitTimesheet(summary.id),
            'Timesheet submetido para aprovação.',
            'Não foi possível submeter o timesheet.'
          )
        }
        onCancel={() => setIsSubmitConfirmOpen(false)}
      />
    </div>
  );
};
