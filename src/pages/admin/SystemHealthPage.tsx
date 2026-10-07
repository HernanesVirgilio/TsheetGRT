import React from 'react';
import { CheckCircle2, Database, KeyRound, RefreshCw, ShieldCheck, XCircle } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getSystemHealth } from '../../services/systemHealthService';
import type { HealthCheck } from '../../services/systemHealthService';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { StatCard } from '../../components/ui/StatCard';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { formatDateTime } from '../../utils/format';

interface CheckCardProps {
  title: string;
  icon: LucideIcon;
  check: HealthCheck;
}

const CheckCard: React.FC<CheckCardProps> = ({ title, icon: Icon, check }) => {
  const isOk = check.status === 'ok';
  const StatusIcon = isOk ? CheckCircle2 : XCircle;
  return (
    <div className="rounded-lg border border-border bg-surface p-5">
      <div className="flex items-center justify-between">
        <p className="flex items-center gap-2 text-sm font-semibold text-text">
          <Icon className="h-4 w-4 text-sidebar" aria-hidden="true" />
          {title}
        </p>
        <span
          className={`inline-flex items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium ${
            isOk ? 'border-success/30 bg-success-soft text-success' : 'border-danger/30 bg-danger-soft text-danger'
          }`}
        >
          <StatusIcon className="h-3.5 w-3.5" aria-hidden="true" />
          {isOk ? 'Operacional' : 'Com falhas'}
        </span>
      </div>
      <p className="mt-3 text-sm text-text-secondary">{check.message}</p>
      <p className="mt-1 text-xs text-text-muted">
        Latência: {check.latencyMs === null ? 'indisponível' : `${check.latencyMs} ms`}
      </p>
    </div>
  );
};

function formatMetric(value: number | null): string {
  return value === null ? 'Indisponível' : String(value);
}

export const SystemHealthPage: React.FC = () => {
  const health = useAsyncData(getSystemHealth, []);
  const report = health.data;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Saúde do sistema"
        subtitle="Verificações em tempo real da ligação ao Supabase e indicadores de utilização."
        actions={
          <Button variant="secondary" icon={RefreshCw} isLoading={health.isLoading} onClick={health.reload}>
            Verificar novamente
          </Button>
        }
      />

      {health.error && <ErrorState message={health.error} onRetry={health.reload} />}
      {health.isLoading && !report && <LoadingState label="A executar verificações..." />}

      {report && (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <CheckCard title="Base de dados" icon={Database} check={report.database} />
            <CheckCard title="Autenticação" icon={KeyRound} check={report.authentication} />
            <CheckCard title="Sessão atual" icon={ShieldCheck} check={report.session} />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <StatCard label="Utilizadores ativos" value={formatMetric(report.activeUsers)} />
            <StatCard label="Eventos de auditoria (24 h)" value={formatMetric(report.auditEventsLast24h)} />
            <StatCard label="Inícios de sessão (24 h)" value={formatMetric(report.loginsLast24h)} />
          </div>

          <Panel title="Ambiente">
            <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-3">
              <div>
                <dt className="text-text-muted">Projeto Supabase</dt>
                <dd className="mt-0.5 font-mono text-text">{report.projectHost}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Modo de execução</dt>
                <dd className="mt-0.5 font-mono text-text">{report.environment}</dd>
              </div>
              <div>
                <dt className="text-text-muted">Última verificação</dt>
                <dd className="mt-0.5 text-text">{formatDateTime(report.checkedAt)}</dd>
              </div>
            </dl>
          </Panel>
        </>
      )}
    </div>
  );
};
