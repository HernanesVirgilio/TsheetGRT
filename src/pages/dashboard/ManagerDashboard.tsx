import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, CheckCircle2, ClipboardCheck, Users, XCircle } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listMyScopes, listTeamMembers, listTeamTimesheets } from '../../services/managerService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Alert } from '../../components/ui/Alert';
import { StatCard } from '../../components/ui/StatCard';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime, formatMinutesAsHours, formatPeriod, pluralize } from '../../utils/format';
import { summarizeTimesheets } from '../../utils/timesheets';

const PENDING_PREVIEW_LIMIT = 5;
const ALL_TIMESHEETS = { status: null, employeeId: null, periodFrom: null, periodTo: null };

const PanelLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-hover hover:underline">
    {children}
    <ArrowRight className="h-4 w-4" aria-hidden="true" />
  </Link>
);

export const ManagerDashboard: React.FC = () => {
  const { currentUser } = useAuth();
  const profileId = currentUser?.id ?? '';
  const overview = useAsyncData(
    () => Promise.all([listMyScopes(profileId), listTeamMembers(), listTeamTimesheets(ALL_TIMESHEETS)]),
    [profileId]
  );

  if (overview.error) return <ErrorState message={overview.error} onRetry={overview.reload} />;
  if (!overview.data) return <LoadingState label="A carregar a sua equipa..." />;

  const [scopes, members, timesheets] = overview.data;
  const totals = summarizeTimesheets(timesheets);
  // Mais antigos primeiro: são os que esperam há mais tempo.
  const pending = timesheets
    .filter((timesheet) => timesheet.status === 'SUBMITTED')
    .sort((first, second) => (first.submittedAt ?? '').localeCompare(second.submittedAt ?? ''));
  const activeMembers = members.filter((member) => member.is_active).length;

  return (
    <div className="space-y-6">
      <PageHeader title="Equipa" subtitle="Timesheets e aprovações dos colaboradores no seu âmbito de gestão." />

      {scopes.length === 0 ? (
        <Alert variant="warning" title="Sem âmbito de gestão">
          Ainda não lhe foi atribuído nenhum departamento ou colaborador. Contacte a administração.
        </Alert>
      ) : (
        <p className="text-sm text-text-secondary">
          <span className="font-medium text-text">Âmbito:</span>{' '}
          {scopes
            .map((scope) => (scope.departmentName ? `Departamento ${scope.departmentName}` : scope.employeeName ?? '—'))
            .join(' · ')}
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Colaboradores" value={members.length} supporting={pluralize(activeMembers, 'ativo', 'ativos')} icon={Users} />
        <StatCard
          label="Por aprovar"
          value={totals.submittedCount}
          supporting={`${formatMinutesAsHours(totals.pendingMinutes)} a validar`}
          icon={ClipboardCheck}
        />
        <StatCard
          label="Aprovados"
          value={totals.approvedCount}
          supporting={`${formatMinutesAsHours(totals.approvedMinutes)} aprovadas`}
          icon={CheckCircle2}
        />
        <StatCard
          label="Rejeitados"
          value={totals.rejectedCount}
          supporting="A aguardar correção do colaborador"
          icon={XCircle}
        />
      </div>

      <Panel title="A aguardar a sua decisão" actions={<PanelLink to="/approvals">Ver aprovações</PanelLink>} flush>
        {pending.length === 0 ? (
          <EmptyState bordered={false} icon={ClipboardCheck} title="Não existem timesheets pendentes para a sua equipa." />
        ) : (
          <ul className="divide-y divide-border">
            {pending.slice(0, PENDING_PREVIEW_LIMIT).map((timesheet) => (
              <li key={timesheet.id}>
                <Link
                  to={`/approvals/${timesheet.id}`}
                  className="flex flex-col gap-1 px-5 py-3 hover:bg-background sm:flex-row sm:items-center sm:justify-between"
                >
                  <span>
                    <span className="block text-sm font-semibold text-text">{timesheet.employeeName}</span>
                    <span className="block text-xs text-text-secondary">
                      {formatPeriod(timesheet.periodStart, timesheet.periodEnd)} · {formatMinutesAsHours(timesheet.totalMinutes)}
                    </span>
                  </span>
                  <span className="text-xs text-text-muted">Submetido em {formatDateTime(timesheet.submittedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Panel>
    </div>
  );
};
