const LOCALE = 'pt-PT';
const TIME_ZONE = 'Africa/Maputo';

const dateFormatter = new Intl.DateTimeFormat(LOCALE, { dateStyle: 'short', timeZone: TIME_ZONE });
const dateTimeFormatter = new Intl.DateTimeFormat(LOCALE, {
  dateStyle: 'short',
  timeStyle: 'short',
  timeZone: TIME_ZONE,
});

export function formatDate(value: string | null | undefined, emptyLabel = '—'): string {
  return value ? dateFormatter.format(new Date(value)) : emptyLabel;
}

export function formatDateTime(value: string | null | undefined, emptyLabel = '—'): string {
  return value ? dateTimeFormatter.format(new Date(value)) : emptyLabel;
}

/** Datas sem hora (colunas DATE) são formatadas sem conversão de fuso horário. */
export function formatCalendarDate(value: string): string {
  const [year, month, day] = value.split('-');
  return day && month && year ? `${day}/${month}/${year}` : value;
}

export function formatPeriod(periodStart: string, periodEnd: string): string {
  return `${formatCalendarDate(periodStart)} – ${formatCalendarDate(periodEnd)}`;
}

export function formatMinutesAsHours(totalMinutes: number): string {
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}h ${minutes.toString().padStart(2, '0')}m`;
}

export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`;
}
