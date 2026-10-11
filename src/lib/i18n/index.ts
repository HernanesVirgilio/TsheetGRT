// Internacionalização (português e inglês).
//
// O texto português é a chave: t('Guardar') devolve "Guardar" em português e a entrada de EN em inglês.
// Assim o código continua legível, o português nunca fica por traduzir e um teste verifica que cada
// t('...') e cada valor de mapa traduzido tem entrada em inglês (src/tests/i18n.test.ts).
//
// O idioma ativo é um estado do módulo: t() funciona em componentes, serviços e utilitários. Ao mudar
// de idioma, o PreferencesProvider volta a montar a área da aplicação para que tudo seja redesenhado.
// Dados introduzidos pelos utilizadores (nomes, títulos, descrições) nunca passam por t().
import { EN } from './en';

export type Locale = 'pt' | 'en';

export const LOCALES: readonly Locale[] = ['pt', 'en'];

export const LOCALE_NAMES: Record<Locale, string> = { pt: 'Português', en: 'English' };

export const DEFAULT_LOCALE: Locale = 'pt';

let currentLocale: Locale = DEFAULT_LOCALE;
const reportedMissing = new Set<string>();

export function isLocale(value: unknown): value is Locale {
  return value === 'pt' || value === 'en';
}

export function getLocale(): Locale {
  return currentLocale;
}

/** Locale para Intl (datas, horas, números). */
export function intlLocale(locale: Locale = currentLocale): string {
  return locale === 'en' ? 'en-GB' : 'pt-PT';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
  if (typeof document !== 'undefined') document.documentElement.lang = intlLocale(locale);
}

/** Valores a inserir no texto; null/undefined aparecem vazios. */
type Params = Record<string, string | number | null | undefined>;

function interpolate(template: string, params?: Params): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => (name in params ? String(params[name] ?? '') : match));
}

/** Traduz um texto da interface. Parâmetros entre chavetas: t('Olá, {name}', { name }). */
export function t(source: string, params?: Params): string {
  if (currentLocale === 'pt') return interpolate(source, params);
  const translation = EN[source];
  if (translation === undefined && import.meta.env?.DEV && !reportedMissing.has(source)) {
    reportedMissing.add(source);
    console.warn(`[i18n] Sem tradução para inglês: "${source}"`);
  }
  return interpolate(translation ?? source, params);
}

/** Traduz se existir entrada (mensagens do servidor, títulos de notificações); caso contrário, mantém. */
export function tIfKnown(source: string): string {
  return currentLocale === 'en' && EN[source] !== undefined ? EN[source] : source;
}

/**
 * Lista ou mapa de objetos de configuração (abas, filtros, colunas, atalhos) cujos campos de texto
 * indicados são traduzidos no momento da leitura: TABS.map((tab) => tab.label) devolve o idioma ativo.
 * Os restantes campos (ids, funções de render, ícones) ficam intactos.
 */
export function translatedFields<Value extends object>(value: Value, fields: readonly string[]): Value {
  return new Proxy(value, {
    get(target, property, receiver) {
      const result: unknown = Reflect.get(target, property, receiver);
      if (typeof result === 'string' && typeof property === 'string' && fields.includes(property)) return t(result);
      if (result !== null && typeof result === 'object') return translatedFields(result, fields);
      return result;
    },
  });
}

/**
 * Mapa de rótulos traduzido no momento da leitura: LABELS[status] devolve o texto no idioma ativo,
 * sem alterar os pontos de utilização. Object.keys/entries continuam a funcionar.
 */
export function translated<Map extends Record<string, string>>(labels: Map): Map {
  return new Proxy(labels, {
    get(target, property, receiver) {
      const value: unknown = Reflect.get(target, property, receiver);
      return typeof value === 'string' ? t(value) : value;
    },
  });
}
