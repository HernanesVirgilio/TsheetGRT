import React from 'react';
import { Briefcase, CalendarOff, Clock3, MessagesSquare } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { availableApprovalKinds, getApprovalCounts, totalPending } from '../../services/approvalCenterService';
import type { ApprovalKind } from '../../services/approvalCenterService';
import { PageHeader } from '../../components/ui/PageHeader';
import { TabPanel, Tabs, useTabParam } from '../../components/ui/Tabs';
import type { TabDefinition } from '../../components/ui/Tabs';
import { EmptyState } from '../../components/ui/EmptyState';
import { AbsenceApprovalsPanel } from '../../components/work/AbsenceApprovalsPanel';
import { MeetingRequestsPanel } from '../../components/work/MeetingRequestsPanel';
import { ApprovalsPage } from '../manager/ApprovalsPage';
import { ApprovalRequestsPage } from '../work/ApprovalRequestsPage';
import { pluralize } from '../../utils/format';
import { t, translatedFields } from '../../lib/i18n';

const TAB_DEFINITIONS: TabDefinition<ApprovalKind>[] = translatedFields([
  { id: 'timesheets', label: 'Timesheets', icon: Clock3 },
  { id: 'absences', label: 'Ausências', icon: CalendarOff },
  { id: 'opportunities', label: 'Oportunidades', icon: Briefcase },
  { id: 'meetings', label: 'Reuniões', icon: MessagesSquare },
], ['label']);

/**
 * Centro de aprovações: um único destino para tudo o que espera uma decisão de quem consulta.
 * Cada separador só aparece se o utilizador puder decidir esse tipo de pedido; os números vêm do servidor.
 */
export const ApprovalsCenterPage: React.FC = () => {
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const kinds = availableApprovalKinds(hasPermission);
  const [active, setActive] = useTabParam(kinds);
  const counts = useAsyncData(() => getApprovalCounts(viewerId, hasPermission), [viewerId]);

  const tabs = TAB_DEFINITIONS.filter((tab) => kinds.includes(tab.id)).map((tab) => ({ ...tab, count: counts.data?.[tab.id] }));
  const pending = totalPending(counts.data);

  return (
    <div className="space-y-2">
      <PageHeader
        title={t('Aprovações')}
        subtitle={
          counts.data
            ? pending > 0
              ? t('{pending} à espera da sua decisão.', { pending: pluralize(pending, 'pedido', 'pedidos') })
              : t('Não há pedidos à espera da sua decisão.')
            : t('Pedidos que aguardam a sua decisão, por tipo.')
        }
      />
      {!active ? (
        <EmptyState title={t('Não decide nenhum tipo de pedido.')} message={t('As permissões de aprovação são atribuídas pela administração.')} />
      ) : (
        <>
          <Tabs tabs={tabs} activeId={active} onChange={setActive} label={t('Tipos de pedido')} idPrefix="aprovacoes" />
          <TabPanel idPrefix="aprovacoes" activeId={active}>
            {active === 'timesheets' && <ApprovalsPage embedded />}
            {active === 'absences' && (
              <AbsenceApprovalsPanel
                viewerId={viewerId}
                canApprove={hasPermission('TIMESHEET_ABSENCE_APPROVE')}
                canValidate={hasPermission('TIMESHEET_ABSENCE_VALIDATE') && !hasPermission('TIMESHEET_ABSENCE_APPROVE')}
                onChanged={counts.reload}
              />
            )}
            {active === 'opportunities' && <ApprovalRequestsPage embedded />}
            {active === 'meetings' && <MeetingRequestsPanel viewerId={viewerId} onChanged={counts.reload} />}
          </TabPanel>
        </>
      )}
    </div>
  );
};
