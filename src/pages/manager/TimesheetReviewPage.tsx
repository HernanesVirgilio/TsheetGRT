import React, { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, CheckCircle2, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTimesheetDetail } from '../../services/timesheetService';
import type { ReviewDecision } from '../../services/approvalService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { TimesheetEntriesTable } from '../../components/timesheets/TimesheetEntriesTable';
import { TimesheetStatusNotice } from '../../components/timesheets/TimesheetStatusNotice';
import { PeriodAbsencesNotice } from '../../components/work/PeriodAbsencesNotice';
import { TimesheetApprovalPanel } from '../../components/timesheets/ApprovalFlow';
import { ReviewDecisionModal } from '../../components/manager/ReviewDecisionModal';
import { formatMinutesAsHours, formatPeriod } from '../../utils/format';
import { isUuid } from '../../utils/validation';
import { t } from '../../lib/i18n';

const BackLink: React.FC = () => (
  <Link to="/approvals" className="inline-flex items-center gap-1.5 text-sm font-medium text-primary-hover hover:underline">
    <ArrowLeft className="h-4 w-4" aria-hidden="true" />
    {t('Voltar às aprovações')}
  </Link>
);

/** Revisão de um timesheet da equipa. A visibilidade e a decisão são validadas no servidor. */
export const TimesheetReviewPage: React.FC = () => {
  const { id = '' } = useParams<{ id: string }>();
  const { currentUser, hasPermission } = useAuth();
  const detail = useAsyncData(() => (isUuid(id) ? getTimesheetDetail(id) : Promise.resolve(null)), [id]);
  const [decision, setDecision] = useState<ReviewDecision | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (detail.isLoading && !detail.data) return <LoadingState label={t('A carregar timesheet...')} />;
  if (detail.error) {
    return (
      <div className="space-y-4">
        <BackLink />
        <ErrorState message={detail.error} onRetry={detail.reload} />
      </div>
    );
  }
  if (!detail.data) {
    return (
      <div className="space-y-4">
        <BackLink />
        <EmptyState title={t('Timesheet não encontrado.')} message={t('O timesheet não existe ou está fora do seu âmbito de gestão.')} />
      </div>
    );
  }

  const { summary, entries, decisions } = detail.data;
  const isOwnTimesheet = summary.employeeId === currentUser?.id;
  // Enquanto recarrega após uma decisão, os dados podem estar desatualizados: não oferecer ações.
  const canDecide = summary.status === 'SUBMITTED' && !isOwnTimesheet && !detail.isLoading;
  const workedDays = new Set(entries.map((entry) => entry.workDate)).size;

  return (
    <div className="space-y-6">
      <BackLink />
      <PageHeader
        title={summary.employeeName}
        subtitle={`${formatPeriod(summary.periodStart, summary.periodEnd)} · ${summary.departmentName ?? t('Sem departamento')}`}
        actions={
          <>
            <StatusBadge status={summary.status} />
            {canDecide && hasPermission('TEAM_TIMESHEET_REJECT') && (
              <Button variant="danger" icon={XCircle} onClick={() => setDecision('REJECTED')}>
                {t('Rejeitar')}
              </Button>
            )}
            {canDecide && hasPermission('TEAM_TIMESHEET_APPROVE') && (
              <Button icon={CheckCircle2} onClick={() => setDecision('APPROVED')}>
                {t('Aprovar')}
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
      {isOwnTimesheet && (
        <Alert variant="info">
          {t('Este é o seu próprio timesheet e não pode ser decidido por si.')}{' '}
          <Link to={`/timesheets/${summary.id}`} className="font-semibold underline">
            {t('Abrir em Meu Timesheet')}
          </Link>
        </Alert>
      )}
      <TimesheetStatusNotice summary={summary} decisions={decisions} audience="reviewer" />
      <TimesheetApprovalPanel summary={summary} />
      <PeriodAbsencesNotice employeeId={summary.employeeId} from={summary.periodStart} to={summary.periodEnd} />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label={t('Horas registadas')} value={formatMinutesAsHours(summary.totalMinutes)} />
        <StatCard label={t('Dias com registos')} value={workedDays} />
        <StatCard label={t('Registos')} value={entries.length} />
      </div>

      <Panel title={t('Registos de horas')} flush>
        <TimesheetEntriesTable entries={entries} emptyMessage={t('Este timesheet não tem registos.')} />
      </Panel>


      <ReviewDecisionModal
        timesheet={decision ? summary : null}
        decision={decision ?? 'APPROVED'}
        onClose={() => setDecision(null)}
        onDone={(message) => {
          setDecision(null);
          setSuccessMessage(message);
          detail.reload();
        }}
      />
    </div>
  );
};
