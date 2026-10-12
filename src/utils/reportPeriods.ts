// Regras puras do centro de relatórios: períodos (diário a anual e personalizado), período anterior
// para comparação, agrupamento da evolução, variações sem divisões por zero e observações por regra.
// As datas são locais (o fuso operacional é Africa/Maputo; work_date já é uma data local).
import { intlLocale, t } from '../lib/i18n';

const formatPercent = (value: number) => new Intl.NumberFormat(intlLocale(), { maximumFractionDigits: 1 }).format(value);

export const PERIOD_KINDS = ['DAY', 'WEEK', 'MONTH', 'QUARTER', 'YEAR', 'CUSTOM'] as const;
export type PeriodKind = (typeof PERIOD_KINDS)[number];

export interface DateRange {
  from: string;
  to: string;
}

export type TrendBucket = 'day' | 'week' | 'month';

const pad = (value: number) => String(value).padStart(2, '0');

export function toIsoDate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function parseIsoDate(value: string): Date {
  const [year, month, day] = value.split('-').map(Number);
  return new Date(year ?? 1970, (month ?? 1) - 1, day ?? 1);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

/** Número de dias do intervalo, inclusivo. */
export function rangeLength(range: DateRange): number {
  return Math.round((parseIsoDate(range.to).getTime() - parseIsoDate(range.from).getTime()) / 86_400_000) + 1;
}

/** Período que contém a data de referência. As semanas começam à segunda-feira (ISO). */
export function periodRange(kind: Exclude<PeriodKind, 'CUSTOM'>, anchor: Date): DateRange {
  const year = anchor.getFullYear();
  const month = anchor.getMonth();
  switch (kind) {
    case 'DAY':
      return { from: toIsoDate(anchor), to: toIsoDate(anchor) };
    case 'WEEK': {
      const monday = addDays(anchor, -((anchor.getDay() + 6) % 7));
      return { from: toIsoDate(monday), to: toIsoDate(addDays(monday, 6)) };
    }
    case 'MONTH':
      return { from: toIsoDate(new Date(year, month, 1)), to: toIsoDate(new Date(year, month + 1, 0)) };
    case 'QUARTER': {
      const first = Math.floor(month / 3) * 3;
      return { from: toIsoDate(new Date(year, first, 1)), to: toIsoDate(new Date(year, first + 3, 0)) };
    }
    case 'YEAR':
      return { from: `${year}-01-01`, to: `${year}-12-31` };
  }
}

/** Avança ou recua a data de referência um período inteiro. */
export function shiftAnchor(kind: Exclude<PeriodKind, 'CUSTOM'>, anchor: Date, direction: -1 | 1): Date {
  switch (kind) {
    case 'DAY':
      return addDays(anchor, direction);
    case 'WEEK':
      return addDays(anchor, 7 * direction);
    case 'MONTH':
      return new Date(anchor.getFullYear(), anchor.getMonth() + direction, 1);
    case 'QUARTER':
      return new Date(anchor.getFullYear(), anchor.getMonth() + 3 * direction, 1);
    case 'YEAR':
      return new Date(anchor.getFullYear() + direction, 0, 1);
  }
}

/**
 * Período anterior equivalente: o mês anterior para um mês (mesmo que tenha outro número de dias), o ano
 * anterior para um ano; num intervalo personalizado, o mesmo número de dias imediatamente antes.
 */
export function previousRange(kind: PeriodKind, range: DateRange): DateRange {
  if (kind === 'CUSTOM') {
    const days = rangeLength(range);
    const to = addDays(parseIsoDate(range.from), -1);
    return { from: toIsoDate(addDays(to, -(days - 1))), to: toIsoDate(to) };
  }
  return periodRange(kind, shiftAnchor(kind, parseIsoDate(range.from), -1));
}

/** Agrupamento legível da evolução: dias até ~1 mês, semanas até ~3 meses, meses acima disso. */
export function trendBucket(range: DateRange): TrendBucket {
  const days = rangeLength(range);
  if (days <= 31) return 'day';
  if (days <= 98) return 'week';
  return 'month';
}

export interface Change {
  current: number;
  previous: number;
  delta: number;
  /** Variação percentual; null quando o período anterior não tem base (zero), para nunca dividir por zero. */
  percent: number | null;
}

export function compareValues(current: number, previous: number): Change {
  return {
    current,
    previous,
    delta: current - previous,
    percent: previous > 0 ? Math.round(((current - previous) / previous) * 1000) / 10 : null,
  };
}

/** Texto curto da variação ("+12,5% face ao período anterior" ou "Sem base de comparação"). */
export function describeChange(change: Change, formatDelta: (value: number) => string): string {
  if (change.percent === null) return change.current === 0 ? t('Sem registos em nenhum dos períodos') : t('Sem base de comparação no período anterior');
  if (change.delta === 0) return t('Igual ao período anterior');
  const sign = change.delta > 0 ? '+' : '−';
  return t('{sign}{percent}% ({delta}) face ao período anterior', {
    sign,
    percent: formatPercent(Math.abs(change.percent)),
    delta: `${sign}${formatDelta(Math.abs(change.delta))}`,
  });
}

export interface InsightInput {
  hours: Change;
  people: Change;
  pendingOverThreshold: number | null;
  thresholdDays: number | null;
  rejectionRate: Change | null;
}

/** Variação mínima (em %) para uma observação: abaixo disto é ruído, não tendência. */
export const INSIGHT_MIN_CHANGE = 5;

/**
 * Observações calculadas por regras explícitas, só quando há dados e a comparação é válida.
 * Descrevem o histórico; não fazem previsões.
 */
export function buildInsights(input: InsightInput): { tone: 'positive' | 'attention' | 'neutral'; text: string }[] {
  const insights: { tone: 'positive' | 'attention' | 'neutral'; text: string }[] = [];
  const { hours, people } = input;
  if (hours.percent !== null && Math.abs(hours.percent) >= INSIGHT_MIN_CHANGE) {
    insights.push({
      tone: hours.delta < 0 ? 'attention' : 'positive',
      text:
        hours.delta < 0
          ? t('Foram registadas menos {percent}% horas do que no período anterior.', { percent: formatPercent(Math.abs(hours.percent)) })
          : t('Foram registadas mais {percent}% horas do que no período anterior.', { percent: formatPercent(hours.percent) }),
    });
  }
  if (people.percent !== null && people.delta < 0) {
    insights.push({ tone: 'attention', text: t('Menos {count} pessoa(s) registaram horas do que no período anterior.', { count: Math.abs(people.delta) }) });
  }
  if (input.pendingOverThreshold !== null && input.thresholdDays !== null && input.pendingOverThreshold > 0) {
    insights.push({
      tone: 'attention',
      text: t('Existem {count} timesheet(s) pendente(s) de aprovação há mais de {days} dias.', { count: input.pendingOverThreshold, days: input.thresholdDays }),
    });
  }
  const rejection = input.rejectionRate;
  if (rejection && rejection.previous > 0 && Math.abs(rejection.delta) >= INSIGHT_MIN_CHANGE) {
    insights.push({
      tone: rejection.delta > 0 ? 'attention' : 'positive',
      text:
        rejection.delta > 0
          ? t('A taxa de rejeição subiu {points} pontos percentuais face ao período anterior.', { points: Math.round(rejection.delta) })
          : t('A taxa de rejeição desceu {points} pontos percentuais face ao período anterior.', { points: Math.round(Math.abs(rejection.delta)) }),
    });
  }
  return insights;
}
