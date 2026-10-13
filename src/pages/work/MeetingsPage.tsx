import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Plus, UserCheck } from 'lucide-react';
import { useAuth } from '../../lib/auth/AuthContext';
import { useAsyncData } from '../../hooks/useAsyncData';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { listMeetings } from '../../services/work/meetingService';
import { listWorkPeople } from '../../services/work/calendarService';
import type { MeetingSummary } from '../../types/work';
import { isMeetingStatus, MEETING_STATUSES } from '../../types/work';
import { PageHeader } from '../../components/ui/PageHeader';
import { Panel } from '../../components/ui/Panel';
import { Button } from '../../components/ui/Button';
import { FilterSelect, SearchInput } from '../../components/ui/FormField';
import { DataTable } from '../../components/ui/DataTable';
import type { DataTableColumn } from '../../components/ui/DataTable';
import { Pagination } from '../../components/ui/Pagination';
import { EmptyState } from '../../components/ui/EmptyState';
import { ErrorState, LoadingState } from '../../components/ui/States';
import { WorkStatusBadge } from '../../components/work/WorkStatusBadge';
import { MeetingFormModal } from '../../components/work/MeetingFormModal';
import { MEETING_STATUS_LABELS } from '../../utils/work';
import { formatDateTime, dateTimeFormatter } from '../../utils/format';
import { t } from '../../lib/i18n';

const PAGE_SIZE = 20;
const ALL = 'ALL';
const timeFormatter = () => dateTimeFormatter({ hour: '2-digit', minute: '2-digit' });

export const MeetingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { currentUser, hasPermission } = useAuth();
  const viewerId = currentUser?.id ?? '';
  const canSeeTeam = hasPermission('TEAM_READ') || hasPermission('ADMIN_ACCESS');
  const canCreate = hasPermission('TIMESHEET_MEETING_CREATE');
  const [scope, setScope] = useState<'MINE' | 'TEAM'>('MINE');
  const [when, setWhen] = useState<'UPCOMING' | 'PAST'>('UPCOMING');
  const [status, setStatus] = useState(ALL);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  // Abre o mesmo formulário com o pedido de participação de uma chefia já ativo.
  const [withLeadRequest, setWithLeadRequest] = useState(false);
  const debouncedSearch = useDebouncedValue(search);

  const meetings = useAsyncData(
    () =>
      listMeetings({ scope, viewerId, when, status: isMeetingStatus(status) ? status : null, search: debouncedSearch, page, pageSize: PAGE_SIZE }),
    [scope, viewerId, when, status, debouncedSearch, page]
  );
  const people = useAsyncData(() => (canCreate ? listWorkPeople('MEETING') : Promise.resolve([])), [canCreate]);
  useEffect(() => setPage(1), [scope, when, status, debouncedSearch]);

  const columns: DataTableColumn<MeetingSummary>[] = [
    {
      id: 'title',
      header: t('Reunião'),
      render: (meeting) => (
        <Link to={`/timesheet/meetings/${meeting.id}`} className="font-semibold text-text hover:underline">
          {meeting.title}
        </Link>
      ),
    },
    {
      id: 'when',
      header: t('Quando'),
      render: (meeting) => (
        <span className="whitespace-nowrap">
          {formatDateTime(meeting.startsAt)}–{timeFormatter().format(new Date(meeting.endsAt))}
        </span>
      ),
    },
    { id: 'location', header: t('Local'), render: (meeting) => meeting.location ?? '—' },
    { id: 'organizer', header: t('Organização'), render: (meeting) => (meeting.organizerId === viewerId ? t('Eu') : (meeting.organizerName ?? '—')) },
    {
      id: 'status',
      header: t('Estado'),
      render: (meeting) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <WorkStatusBadge kind="meeting" status={meeting.status} />
          {meeting.requestStatus === 'PENDING' && meeting.status === 'PLANNED' && (
            <span className="text-xs font-medium text-warning">{meeting.requestedWith === viewerId ? t('Pedido para si') : t('Pedido pendente')}</span>
          )}
          {meeting.requestStatus === 'REJECTED' && <span className="text-xs font-medium text-danger">{t('Pedido recusado')}</span>}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title={t('Reuniões')}
        subtitle={t('Reuniões com colegas, uma equipa ou um departamento não precisam de aprovação. A participação de uma chefia é pedida explicitamente.')}
        actions={
          canCreate && (
            <>
              <Button
                variant="secondary"
                icon={UserCheck}
                disabled={!people.data}
                onClick={() => {
                  setWithLeadRequest(true);
                  setIsCreateOpen(true);
                }}
              >
                {hasPermission('TEAM_READ') ? t('Solicitar participação de outro gestor') : t('Solicitar participação do gestor')}
              </Button>
              <Button
                icon={Plus}
                disabled={!people.data}
                onClick={() => {
                  setWithLeadRequest(false);
                  setIsCreateOpen(true);
                }}
              >
                {t('Agendar reunião')}
              </Button>
            </>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label={t('Período')} className="flex gap-1">
          <Button size="sm" variant={when === 'UPCOMING' ? 'primary' : 'secondary'} aria-pressed={when === 'UPCOMING'} onClick={() => setWhen('UPCOMING')}>
            {t('Próximas')}
          </Button>
          <Button size="sm" variant={when === 'PAST' ? 'primary' : 'secondary'} aria-pressed={when === 'PAST'} onClick={() => setWhen('PAST')}>
            {t('Anteriores')}
          </Button>
        </div>
        {canSeeTeam && (
          <div role="group" aria-label={t('Âmbito')} className="flex gap-1">
            <Button size="sm" variant={scope === 'MINE' ? 'primary' : 'secondary'} aria-pressed={scope === 'MINE'} onClick={() => setScope('MINE')}>
              {t('As minhas')}
            </Button>
            <Button size="sm" variant={scope === 'TEAM' ? 'primary' : 'secondary'} aria-pressed={scope === 'TEAM'} onClick={() => setScope('TEAM')}>
              {t('Equipa')}
            </Button>
          </div>
        )}
      </div>

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2">
          <SearchInput label={t('Pesquisar pelo título')} value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label={t('Filtrar por estado')} value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ALL}>{t('Todos os estados')}</option>
            {MEETING_STATUSES.map((value) => (
              <option key={value} value={value}>
                {MEETING_STATUS_LABELS[value]}
              </option>
            ))}
          </FilterSelect>
        </div>
        {meetings.error && (
          <div className="p-4">
            <ErrorState message={meetings.error} onRetry={meetings.reload} />
          </div>
        )}
        {meetings.isLoading && !meetings.data && <LoadingState label={t('A carregar reuniões...')} />}
        {meetings.data && meetings.data.items.length === 0 && (
          <EmptyState bordered={false} icon={CalendarDays} title={when === 'UPCOMING' ? t('Não existem reuniões agendadas.') : t('Não existem reuniões anteriores com estes filtros.')} />
        )}
        {meetings.data && meetings.data.items.length > 0 && (
          <>
            <DataTable caption={t('Reuniões')} columns={columns} rows={meetings.data.items} getRowKey={(meeting) => meeting.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={meetings.data.total} onPageChange={setPage} />
          </>
        )}
      </Panel>

      <MeetingFormModal
        isOpen={isCreateOpen}
        meeting={null}
        participantIds={[]}
        people={people.data ?? []}
        startWithLeadRequest={withLeadRequest}
        onClose={() => setIsCreateOpen(false)}
        onSaved={(meetingId) => {
          setIsCreateOpen(false);
          navigate(`/timesheet/meetings/${meetingId}`);
        }}
      />
    </div>
  );
};
