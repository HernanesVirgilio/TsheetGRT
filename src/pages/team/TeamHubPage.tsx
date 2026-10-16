import React from 'react';
import { Link } from 'react-router-dom';
import { Activity, CalendarCheck2, Gauge, Users } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs';
import type { TabDefinition } from '../../components/ui/Tabs';
import { TeamAvailabilityPanel } from '../../components/work/TeamAvailabilityPanel';
import { TeamPage } from '../manager/TeamPage';
import { TeamWorkPage } from '../work/TeamWorkPage';
import { TeamActivityPage } from '../manager/TeamActivityPage';
import { t, translatedFields } from '../../lib/i18n';

type TeamTab = 'people' | 'workload' | 'availability' | 'activity';

const TAB_DEFINITIONS: TabDefinition<TeamTab>[] = translatedFields([
  { id: 'people', label: 'Pessoas', icon: Users },
  { id: 'workload', label: 'Carga de trabalho', icon: Gauge },
  { id: 'availability', label: 'Disponibilidade', icon: CalendarCheck2 },
  { id: 'activity', label: 'Atividade', icon: Activity },
], ['label']);

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
