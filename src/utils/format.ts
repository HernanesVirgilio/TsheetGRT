import { intlLocale, t } from '../lib/i18n';

const TIME_ZONE = 'Africa/Maputo';

const formatterCache = new Map<string, Intl.DateTimeFormat>();

/** Formatador de datas/horas no idioma ativo (criado uma vez por idioma e opções). */
export function dateTimeFormatter(options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const locale = intlLocale();
  const key = `${locale}|${JSON.stringify(options)}`;
  let formatter = formatterCache.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, options);
    formatterCache.set(key, formatter);
  }
  return formatter;
}

export function formatDate(value: string | null | undefined, emptyLabel = '—'): string {
  return value ? dateTimeFormatter({ dateStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value)) : emptyLabel;
}

export function formatDateTime(value: string | null | undefined, emptyLabel = '—'): string {
  return value ? dateTimeFormatter({ dateStyle: 'short', timeStyle: 'short', timeZone: TIME_ZONE }).format(new Date(value)) : emptyLabel;
}

/** Datas sem hora (colunas DATE) são formatadas sem conversão de fuso horário (dd/mm/aaaa nos dois idiomas). */
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

/** "3 pessoas": a forma singular/plural (texto português) é traduzida no idioma ativo. */
export function pluralize(count: number, singular: string, plural: string): string {
  return `${count} ${t(count === 1 ? singular : plural)}`;
}

/** Ordenação alfabética no idioma ativo. */
export function compareText(first: string, second: string): number {
  return first.localeCompare(second, intlLocale());
}
