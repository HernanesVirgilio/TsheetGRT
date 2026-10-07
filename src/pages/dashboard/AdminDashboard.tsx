import React from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, Building2, CheckCircle2, ClipboardCheck, Users } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getAdminOverview } from '../../services/dashboardService';
import type { AdminOverview } from '../../services/dashboardService';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatCard } from '../../components/ui/StatCard';
import { Panel } from '../../components/ui/Panel';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { EmptyState } from '../../components/ui/EmptyState';
import { StatusBadge } from '../../components/ui/StatusBadge';
import { UserAvatar } from '../../components/ui/UserAvatar';
import { formatDateTime, pluralize } from '../../utils/format';

interface AttentionItem {
  id: string;
  message: string;
  to: string;
  linkLabel: string;
}

function buildAttentionItems(overview: AdminOverview): AttentionItem[] {
  const items: AttentionItem[] = [];
  if (overview.submittedTimesheets > 0) {
    items.push({
      id: 'submitted',
      message: `${pluralize(overview.submittedTimesheets, 'timesheet aguarda', 'timesheets aguardam')} aprovação.`,
      to: '/reports',
      linkLabel: 'Ver relatório',
    });
  }
  if (overview.usersNeverSignedIn > 0) {
    items.push({
      id: 'never-signed-in',
      message: `${pluralize(overview.usersNeverSignedIn, 'utilizador ativo ainda não iniciou', 'utilizadores ativos ainda não iniciaram')} sessão (convite pendente).`,
      to: '/users',
      linkLabel: 'Ver utilizadores',
    });
  }
  if (overview.activeUsersWithoutDepartment > 0) {
    items.push({
      id: 'without-department',
      message: `${pluralize(overview.activeUsersWithoutDepartment, 'utilizador ativo não tem', 'utilizadores ativos não têm')} departamento atribuído.`,
      to: '/users',
      linkLabel: 'Corrigir',
    });
  }
  return items;
}

const PanelLink: React.FC<{ to: string; children: React.ReactNode }> = ({ to, children }) => (
  <Link to={to} className="inline-flex items-center gap-1 text-sm font-semibold text-primary-hover hover:underline">
    {children}
    <ArrowRight className="h-4 w-4" aria-hidden="true" />
  </Link>
);

export const AdminDashboard: React.FC = () => {
  const { data: overview, error, isLoading, reload } = useAsyncData(getAdminOverview, []);
  const attentionItems = overview ? buildAttentionItems(overview) : [];

  return (
    <div className="space-y-6">
      <PageHeader title="Administração" subtitle="Estado atual de utilizadores, departamentos e timesheets." />

      {error && <ErrorState message={error} onRetry={reload} />}
      {isLoading && !overview && <LoadingState label="A carregar indicadores..." />}

      {overview && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard
              label="Utilizadores ativos"
              value={overview.activeUsers}
              supporting={`${pluralize(overview.totalUsers, 'conta registada', 'contas registadas')}`}
              icon={Users}
            />
            <StatCard label="Departamentos ativos" value={overview.activeDepartments} icon={Building2} />
            <StatCard
              label="Timesheets por aprovar"
              value={overview.submittedTimesheets}
              supporting="Submetidos, a aguardar decisão"
              icon={ClipboardCheck}
            />
            <StatCard
              label="Timesheets aprovados"
              value={overview.approvedTimesheets}
              supporting={`${pluralize(overview.rejectedTimesheets, 'rejeitado', 'rejeitados')} a aguardar correção`}
              icon={CheckCircle2}
            />
          </div>

          <Panel title="Pontos de atenção">
            {attentionItems.length === 0 ? (
              <p className="text-sm text-text-secondary">Sem pontos de atenção de momento.</p>
            ) : (
              <ul className="divide-y divide-border">
                {attentionItems.map((item) => (
                  <li key={item.id} className="flex flex-col gap-1 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <span className="text-sm text-text">{item.message}</span>
                    <PanelLink to={item.to}>{item.linkLabel}</PanelLink>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            <Panel title="Utilizadores recentes" actions={<PanelLink to="/users">Ver todos</PanelLink>} flush>
              {overview.recentUsers.length === 0 ? (
                <EmptyState bordered={false} title="Nenhum utilizador registado." icon={Users} />
              ) : (
                <ul className="divide-y divide-border">
                  {overview.recentUsers.map((user) => (
                    <li key={user.id}>
                      <Link
                        to={`/users/${user.id}`}
                        className="flex items-center justify-between gap-3 px-5 py-3 hover:bg-background"
                      >
                        <span className="flex min-w-0 items-center gap-3">
                          <UserAvatar name={user.full_name} size="sm" />
                          <span className="min-w-0">
                            <span className="block truncate text-sm font-semibold text-text">{user.full_name}</span>
                            <span className="block truncate text-xs text-text-secondary">
                              {user.role?.name ?? 'Sem perfil'} · {user.department?.name ?? 'Sem departamento'}
                            </span>
                          </span>
                        </span>
                        <StatusBadge status={user.is_active ? 'ACTIVE' : 'INACTIVE'} size="sm" />
                      </Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>

            <Panel title="Auditoria recente" actions={<PanelLink to="/audit">Ver auditoria</PanelLink>} flush>
              {overview.recentAuditEvents.length === 0 ? (
                <EmptyState bordered={false} title="Ainda não existem eventos de auditoria." />
              ) : (
                <ul className="divide-y divide-border">
                  {overview.recentAuditEvents.map((event) => (
                    <li key={event.id} className="px-5 py-3">
                      <p className="text-sm text-text">{event.description}</p>
                      <p className="mt-0.5 text-xs text-text-muted">
                        {event.actor?.full_name ?? 'Sistema'} · {formatDateTime(event.created_at)}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        </>
      )}
    </div>
  );
};
