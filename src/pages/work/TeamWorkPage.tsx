import React from 'react';
import { Link } from 'react-router-dom';
import { Users } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTeamWorkOverview } from '../../services/work/calendarService';
import type { TeamMemberWorkload } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { OverdueBadge } from '../../components/work/WorkStatusBadge';
import { formatMinutesAsHours } from '../../utils/format';

/** Carga de trabalho da equipa do âmbito (dados agregados pelo servidor, sem expor detalhes). */
export const TeamWorkPage: React.FC = () => {
  const overview = useAsyncData(getTeamWorkOverview, []);
  const members = [...(overview.data ?? [])].sort(
    (first, second) => second.tasksOverdue - first.tasksOverdue || second.tasksBlocked - first.tasksBlocked || second.tasksOpen - first.tasksOpen
  );
  const absent = members.filter((member) => member.absenceToday);

  const columns: DataTableColumn<TeamMemberWorkload>[] = [
    {
      id: 'name',
      header: 'Colaborador',
      render: (member) => (
        <span>
          <span className="block font-semibold text-text">{member.fullName}</span>
          <span className="block text-xs text-text-muted">{[member.jobTitle, member.departmentName].filter(Boolean).join(' · ') || '—'}</span>
        </span>
      ),
    },
    { id: 'open', header: 'Em aberto', align: 'right', render: (member) => member.tasksOpen },
    { id: 'progress', header: 'Em curso', align: 'right', render: (member) => member.tasksInProgress },
    { id: 'blocked', header: 'Bloqueadas', align: 'right', render: (member) => member.tasksBlocked },
    {
      id: 'overdue',
      header: 'Atrasadas',
      align: 'right',
      render: (member) => (member.tasksOverdue > 0 ? <OverdueBadge label={String(member.tasksOverdue)} /> : 0),
    },
    { id: 'due', header: 'Prazo em 7 dias', align: 'right', render: (member) => member.tasksDueNext7Days },
    { id: 'hours', header: 'Horas na semana', align: 'right', render: (member) => formatMinutesAsHours(member.minutesThisWeek) },
    { id: 'absence', header: 'Hoje', render: (member) => member.absenceToday ?? <span className="text-text-muted">Presente</span> },
    { id: 'pending', header: 'Ausências por decidir', align: 'right', render: (member) => member.pendingAbsenceRequests },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Carga da equipa"
        subtitle="O que a equipa tem em mãos: tarefas em aberto, atrasos, bloqueios, horas e ausências."
        actions={
          <Link to="/timesheet/tasks?scope=TEAM" className="text-sm font-medium text-primary-hover hover:underline">
            Tarefas da equipa
          </Link>
        }
      />
      {absent.length > 0 && (
        <Panel title="Ausentes hoje">
          <p className="text-sm text-text-secondary">{absent.map((member) => `${member.fullName} (${member.absenceToday})`).join(' · ')}</p>
        </Panel>
      )}
      <Panel flush>
        {overview.error && (
          <div className="p-4">
            <ErrorState message={overview.error} onRetry={overview.reload} />
          </div>
        )}
        {overview.isLoading && !overview.data && <LoadingState label="A carregar a equipa..." />}
        {overview.data && members.length === 0 && (
          <EmptyState bordered={false} icon={Users} title="Ainda não tem colaboradores no seu âmbito." message="O âmbito de gestão é atribuído pela administração." />
        )}
        {members.length > 0 && <DataTable caption="Carga de trabalho da equipa" columns={columns} rows={members} getRowKey={(member) => member.profileId} />}
      </Panel>
    </div>
  );
};
