import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, CalendarCheck2, Gauge, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { getTeamWorkOverview } from '../../services/work/calendarService';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs';
import type { TabDefinition } from '../../components/ui/Tabs';
import { TeamAvailabilityPanel } from '../../components/work/TeamAvailabilityPanel';
import { TeamPage } from '../manager/TeamPage';
import { TeamWorkPage } from '../work/TeamWorkPage';
import { TeamActivityPage } from '../manager/TeamActivityPage';
import { formatMinutesAsHours } from '../../utils/format';
import { t, translatedFields } from '../../lib/i18n';

type TeamTab = 'people' | 'workload' | 'availability' | 'activity';

const TAB_DEFINITIONS: TabDefinition<TeamTab>[] = translatedFields([
  { id: 'people', label: 'Pessoas', icon: Users },
  { id: 'workload', label: 'Carga de trabalho', icon: Gauge },
  { id: 'availability', label: 'Disponibilidade', icon: CalendarCheck2 },
  { id: 'activity', label: 'Atividade', icon: Activity },
], ['label']);

/** Resumo da equipa no topo do módulo: quatro números reais, sem repetir as tabelas dos separadores. */
const TeamSummary: React.FC = () => {
  const overview = useAsyncData(getTeamWorkOverview, []);
  if (!overview.data || overview.data.length === 0) return null;
  const members = overview.data;
  const items = [
    { label: t('Pessoas'), value: String(members.length) },
    { label: t('Tarefas em aberto'), value: String(members.reduce((sum, member) => sum + member.tasksOpen, 0)) },
    { label: t('Em atraso'), value: String(members.reduce((sum, member) => sum + member.tasksOverdue, 0)), tone: 'danger' as const },
    { label: t('Ausentes hoje'), value: String(members.filter((member) => member.absenceToday).length) },
    { label: t('Horas esta semana'), value: formatMinutesAsHours(members.reduce((sum, member) => sum + member.minutesThisWeek, 0)) },
  ];
  return (
    <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3 lg:grid-cols-5">
      {items.map((item) => (
        <div key={item.label} className="bg-surface px-4 py-3">
          <dt className="text-xs font-medium text-text-secondary">{item.label}</dt>
          <dd className={`mt-0.5 text-xl font-semibold tabular-nums ${item.tone === 'danger' && item.value !== '0' ? 'text-danger' : 'text-text'}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
};

/**
 * Equipa: pessoas, carga de trabalho, disponibilidade e atividade num só módulo. Os dados são sempre
 * limitados ao âmbito de quem consulta (manager_scopes, aplicado pelo servidor).
 */
export const TeamHubPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const available: TeamTab[] = ['people', 'workload', 'availability', ...(hasPermission('TEAM_TIMESHEET_READ') ? (['activity'] as const) : [])];
  const [active = 'people', setActive] = useTabParam(available);
  const tabs = TAB_DEFINITIONS.filter((tab) => available.includes(tab.id));

  return (
    <div className="space-y-5">
      <PageHeader
        title={t('Equipa')}
        subtitle={t('As pessoas no seu âmbito: quem são, o que têm em mãos e quando estão disponíveis.')}
        actions={
          hasPermission('TIMESHEET_TASK_READ') && (
            <Link to="/timesheet/tasks?scope=TEAM" className="text-sm font-medium text-primary-hover hover:underline">
              {t('Tarefas da equipa')}
            </Link>
          )
        }
      />
      <TeamSummary />
      <div>
        <Tabs tabs={tabs} activeId={active} onChange={setActive} label={t('Secções da equipa')} idPrefix="equipa" />
        <TabPanel idPrefix="equipa" activeId={active}>
          {active === 'people' && <TeamPage embedded />}
          {active === 'workload' && <TeamWorkPage embedded />}
          {active === 'availability' && <TeamAvailabilityPanel viewerId={viewerId} />}
          {active === 'activity' && <TeamActivityPage embedded />}
        </TabPanel>
      </div>
    </div>
  );
};
