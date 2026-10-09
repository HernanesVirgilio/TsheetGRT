import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, Plus } from 'lucide-react';
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
import { formatDateTime } from '../../utils/format';

const PAGE_SIZE = 20;
const ALL = 'ALL';
const timeFormatter = new Intl.DateTimeFormat('pt-PT', { hour: '2-digit', minute: '2-digit' });

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
  const debouncedSearch = useDebouncedValue(search);

  const meetings = useAsyncData(
    () =>
      listMeetings({ scope, viewerId, when, status: isMeetingStatus(status) ? status : null, search: debouncedSearch, page, pageSize: PAGE_SIZE }),
    [scope, viewerId, when, status, debouncedSearch, page]
  );
  const people = useAsyncData(() => (canCreate ? listWorkPeople('PARTICIPANT') : Promise.resolve([])), [canCreate]);
  useEffect(() => setPage(1), [scope, when, status, debouncedSearch]);

  const columns: DataTableColumn<MeetingSummary>[] = [
    {
      id: 'title',
      header: 'Reunião',
      render: (meeting) => (
        <Link to={`/timesheet/meetings/${meeting.id}`} className="font-semibold text-text hover:underline">
          {meeting.title}
        </Link>
      ),
    },
    {
      id: 'when',
      header: 'Quando',
      render: (meeting) => (
        <span className="whitespace-nowrap">
          {formatDateTime(meeting.startsAt)}–{timeFormatter.format(new Date(meeting.endsAt))}
        </span>
      ),
    },
    { id: 'location', header: 'Local', render: (meeting) => meeting.location ?? '—' },
    { id: 'organizer', header: 'Organização', render: (meeting) => (meeting.organizerId === viewerId ? 'Eu' : (meeting.organizerName ?? '—')) },
    { id: 'status', header: 'Estado', render: (meeting) => <WorkStatusBadge kind="meeting" status={meeting.status} /> },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reuniões"
        subtitle="Reuniões em que participa, com objetivo, resultado, decisões e próximos passos."
        actions={
          canCreate && (
            <Button icon={Plus} onClick={() => setIsCreateOpen(true)} disabled={!people.data}>
              Nova reunião
            </Button>
          )
        }
      />
      <div className="flex flex-wrap gap-2">
        <div role="group" aria-label="Período" className="flex gap-1">
          <Button size="sm" variant={when === 'UPCOMING' ? 'primary' : 'secondary'} aria-pressed={when === 'UPCOMING'} onClick={() => setWhen('UPCOMING')}>
            Próximas
          </Button>
          <Button size="sm" variant={when === 'PAST' ? 'primary' : 'secondary'} aria-pressed={when === 'PAST'} onClick={() => setWhen('PAST')}>
            Anteriores
          </Button>
        </div>
        {canSeeTeam && (
          <div role="group" aria-label="Âmbito" className="flex gap-1">
            <Button size="sm" variant={scope === 'MINE' ? 'primary' : 'secondary'} aria-pressed={scope === 'MINE'} onClick={() => setScope('MINE')}>
              As minhas
            </Button>
            <Button size="sm" variant={scope === 'TEAM' ? 'primary' : 'secondary'} aria-pressed={scope === 'TEAM'} onClick={() => setScope('TEAM')}>
              Equipa
            </Button>
          </div>
        )}
      </div>

      <Panel flush>
        <div className="grid grid-cols-1 gap-3 border-b border-border p-4 sm:grid-cols-2">
          <SearchInput label="Pesquisar pelo título" value={search} onChange={(event) => setSearch(event.target.value)} />
          <FilterSelect label="Filtrar por estado" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value={ALL}>Todos os estados</option>
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
        {meetings.isLoading && !meetings.data && <LoadingState label="A carregar reuniões..." />}
        {meetings.data && meetings.data.items.length === 0 && (
          <EmptyState bordered={false} icon={CalendarDays} title={when === 'UPCOMING' ? 'Não existem reuniões agendadas.' : 'Não existem reuniões anteriores com estes filtros.'} />
        )}
        {meetings.data && meetings.data.items.length > 0 && (
          <>
            <DataTable caption="Reuniões" columns={columns} rows={meetings.data.items} getRowKey={(meeting) => meeting.id} />
            <Pagination page={page} pageSize={PAGE_SIZE} totalItems={meetings.data.total} onPageChange={setPage} />
          </>
        )}
      </Panel>

      <MeetingFormModal
        isOpen={isCreateOpen}
        meeting={null}
        participantIds={[]}
        people={people.data ?? []}
        onClose={() => setIsCreateOpen(false)}
        onSaved={(meetingId) => {
          setIsCreateOpen(false);
          navigate(`/timesheet/meetings/${meetingId}`);
        }}
      />
    </div>
  );
};
