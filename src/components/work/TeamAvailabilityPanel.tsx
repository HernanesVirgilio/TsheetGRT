import React from 'react';
import { CalendarCheck2 } from 'lucide-react';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listTeamAbsences } from '../../services/work/absenceService';
import type { AbsenceRequest } from '../../types/work';
import { Panel } from '../ui/Panel';
import { EmptyState } from '../ui/EmptyState';
import { ErrorState, LoadingState } from '../ui/States';
import { WorkStatusBadge } from './WorkStatusBadge';
import { absencePeriodLabel } from './AbsenceDetailModal';
import { toDateInput } from '../../utils/work';
import { t } from '../../lib/i18n';

const AbsenceList: React.FC<{ items: AbsenceRequest[] }> = ({ items }) => (
  <ul className="divide-y divide-border">
    {items.map((request) => (
      <li key={request.id} className="flex flex-col gap-1 px-5 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
        <span className="min-w-0">
          <span className="block font-medium text-text">{request.employeeName ?? '—'}</span>
          <span className="block text-text-secondary">
            {request.absenceTypeName} · {absencePeriodLabel(request)}
          </span>
        </span>
        <WorkStatusBadge kind="absence" status={request.status} />
      </li>
    ))}
  </ul>
);

/**
 * Disponibilidade da equipa: quem está ausente hoje e as ausências seguintes (aprovadas ou comunicadas).
 * Os pedidos por decidir ficam no centro de aprovações; aqui só se mostra a disponibilidade efetiva.
 */
export const TeamAvailabilityPanel: React.FC<{ viewerId: string }> = ({ viewerId }) => {
  const today = toDateInput(new Date());
  const absences = useAsyncData(() => listTeamAbsences(viewerId, ['APPROVED', 'COMMUNICATED'], today), [viewerId, today]);

  if (absences.error) return <ErrorState message={absences.error} onRetry={absences.reload} />;
  if (!absences.data) return <LoadingState label={t('A carregar a disponibilidade...')} />;

  const current = absences.data.filter((request) => request.startDate <= today && request.endDate >= today);
  const upcoming = absences.data.filter((request) => request.startDate > today).sort((first, second) => first.startDate.localeCompare(second.startDate));

  if (current.length === 0 && upcoming.length === 0) {
    return (
      <Panel>
        <EmptyState bordered={false} icon={CalendarCheck2} title={t('Toda a equipa está disponível.')} message={t('Sem ausências aprovadas ou comunicadas, hoje ou nas próximas datas.')} />
      </Panel>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <Panel title={t('Ausentes hoje')} description={t('{count} pessoa(s)', { count: current.length })} flush>
        {current.length === 0 ? <p className="px-5 py-4 text-sm text-text-secondary">{t('Ninguém está ausente hoje.')}</p> : <AbsenceList items={current} />}
      </Panel>
      <Panel title={t('Próximas ausências')} description={t('Aprovadas ou comunicadas')} flush>
        {upcoming.length === 0 ? <p className="px-5 py-4 text-sm text-text-secondary">{t('Sem ausências futuras registadas.')}</p> : <AbsenceList items={upcoming} />}
      </Panel>
    </div>
  );
};
