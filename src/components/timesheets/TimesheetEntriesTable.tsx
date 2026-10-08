import React from 'react';
import { Clock3 } from 'lucide-react';
import { DataTable } from '../ui/DataTable';
import type { DataTableColumn } from '../ui/DataTable';
import { EmptyState } from '../ui/EmptyState';
import type { TimesheetEntryDetail } from '../../services/timesheetService';
import { formatCalendarDate, formatMinutesAsHours } from '../../utils/format';

interface TimesheetEntriesTableProps {
  entries: TimesheetEntryDetail[];
  /** Ações por linha (apenas no timesheet próprio editável). */
  renderActions?: (entry: TimesheetEntryDetail) => React.ReactNode;
  emptyMessage: string;
}

export const TimesheetEntriesTable: React.FC<TimesheetEntriesTableProps> = ({ entries, renderActions, emptyMessage }) => {
  if (entries.length === 0) {
    return <EmptyState bordered={false} icon={Clock3} title="Sem registos de horas." message={emptyMessage} />;
  }

  const columns: DataTableColumn<TimesheetEntryDetail>[] = [
    { id: 'date', header: 'Data', className: 'whitespace-nowrap', render: (entry) => formatCalendarDate(entry.workDate) },
    { id: 'activity', header: 'Atividade', render: (entry) => entry.activityName ?? '—' },
    {
      id: 'time',
      header: 'Horário',
      className: 'whitespace-nowrap',
      render: (entry) => <span className="font-mono">{entry.startTime}–{entry.endTime}</span>,
    },
    { id: 'break', header: 'Pausa', render: (entry) => `${entry.breakMinutes} min` },
    {
      id: 'hours',
      header: 'Horas',
      render: (entry) => <span className="font-semibold text-text">{formatMinutesAsHours(entry.totalMinutes)}</span>,
    },
    { id: 'description', header: 'Descrição', className: 'max-w-md', render: (entry) => entry.description },
  ];

  if (renderActions) {
    columns.push({ id: 'actions', header: 'Ações', align: 'right', hideLabelOnMobile: true, render: renderActions });
  }

  return <DataTable caption="Registos de horas" columns={columns} rows={entries} getRowKey={(entry) => entry.id} />;
};
