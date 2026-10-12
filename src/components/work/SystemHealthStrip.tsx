import React from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getSystemHealth } from '../../services/systemHealthService';
import type { HealthCheck } from '../../services/systemHealthService';
import { Panel } from '../ui/Panel';
import { LoadingState } from '../ui/States';
import { t } from '../../lib/i18n';

const CheckRow: React.FC<{ label: string; check: HealthCheck }> = ({ label, check }) => {
  const isOk = check.status === 'ok';
  const Icon = isOk ? CheckCircle2 : AlertTriangle;
  return (
    <li className="flex items-center justify-between gap-3 py-2 text-sm first:pt-0 last:pb-0">
      <span className="flex items-center gap-2">
        <Icon className={`h-4 w-4 ${isOk ? 'text-success' : 'text-danger'}`} aria-hidden="true" />
        <span className="font-medium text-text">{label}</span>
      </span>
      <span className={`text-xs ${isOk ? 'text-text-muted' : 'font-semibold text-danger'}`}>
        {isOk ? t('Operacional') : t('Com falhas')}
        {check.latencyMs !== null ? ` · ${check.latencyMs} ms` : ''}
      </span>
    </li>
  );
};

/** Verificações reais (base de dados, autenticação, sessão) feitas no momento; sem métricas inventadas. */
export const SystemHealthStrip: React.FC = () => {
  const health = useAsyncData(getSystemHealth, []);
  return (
    <Panel
      title={t('Saúde do sistema')}
      actions={
        <Link to="/system-health" className="text-sm font-medium text-primary-hover hover:underline">
          {t('Ver detalhes')}
        </Link>
      }
    >
      {health.error && <p className="text-sm text-danger">{health.error}</p>}
      {!health.data && !health.error && <LoadingState label={t('A verificar os serviços...')} />}
      {health.data && (
        <ul className="divide-y divide-border">
          <CheckRow label={t('Base de dados')} check={health.data.database} />
          <CheckRow label={t('Autenticação')} check={health.data.authentication} />
          <CheckRow label={t('Sessão')} check={health.data.session} />
        </ul>
      )}
    </Panel>
  );
};
