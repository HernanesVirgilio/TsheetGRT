import React, { useEffect, useState } from 'react';
import { Wrench } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { listInterventions } from '../../services/itAssetService';
import { INTERVENTION_OUTCOMES, isInterventionOutcome } from '../../types/it';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { FilterSelect } from '../../components/ui/FormField';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { InterventionsTable } from '../../components/it/InterventionsTable';
import { INTERVENTION_OUTCOME_LABELS } from '../../utils/it';

const PAGE_SIZE = 20;
const ALL = 'ALL';

/** Registo de intervenções técnicas (só de leitura; cada intervenção é registada no pedido ou no equipamento). */
export const InterventionsPage: React.FC = () => {
  const { hasPermission } = useAuth();
  const [outcome, setOutcome] = useState(ALL);
  const [page, setPage] = useState(1);

  const interventions = useAsyncData(
    () =>
      listInterventions({
        page,
        pageSize: PAGE_SIZE,
        ticketId: null,
        assetId: null,
        outcome: isInterventionOutcome(outcome) ? outcome : null,
      }),
    [page, outcome]
  );

  useEffect(() => setPage(1), [outcome]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Intervenções"
        subtitle="Trabalho técnico realizado em pedidos e equipamentos. Para registar, abra o pedido ou o equipamento."
      />

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-3">
          <FilterSelect label="Filtrar por resultado" value={outcome} onChange={(event) => setOutcome(event.target.value)}>
            <option value={ALL}>Todos os resultados</option>
            {INTERVENTION_OUTCOMES.map((value) => (
              <option key={value} value={value}>
                {INTERVENTION_OUTCOME_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
        </div>

        {interventions.error && (
          <div className="p-4">
            <ErrorState message={interventions.error} onRetry={interventions.reload} />
          </div>
        )}
        {interventions.isLoading && !interventions.data && <LoadingState label="A carregar intervenções..." />}

        {interventions.data && interventions.data.items.length === 0 && (
          <EmptyState
            bordered={false}
            icon={Wrench}
            title={outcome === ALL ? 'Ainda não foram registadas intervenções.' : 'Nenhuma intervenção com este resultado.'}
          />
        )}

        {interventions.data && interventions.data.items.length > 0 && (
          <>
            <InterventionsTable
              interventions={interventions.data.items}
              canOpenTickets={hasPermission('IT_TICKETS_READ')}
              canOpenAssets={hasPermission('IT_ASSETS_READ')}
            />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={interventions.data.total} onPageChange={setPage} />
          </>
        )}
      </Panel>
    </div>
  );
};
