// Internacionalização: cada texto da interface tem tradução para inglês (com os mesmos parâmetros) e o
// motor de tradução, os mapas traduzidos e a formatação seguem o idioma ativo.
// Com I18N_MISSING=<ficheiro>, escreve as chaves em falta (uma por linha) para facilitar a tradução.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { EN } from '../lib/i18n/en';
import { getLocale, intlLocale, setLocale, t, tIfKnown, translated, translatedFields } from '../lib/i18n';
import { formatDate, pluralize } from '../utils/format';
import { greetingFor } from '../utils/dashboard';

let passed = 0;

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(`FALHOU: ${message}`);
  passed += 1;
  console.log(`✓ ${message}`);
}

// ----------------------------------------------------------------------------- extração das chaves
const ROOT = join(process.cwd(), 'src');

function sourceFiles(directory: string): string[] {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const STRING = String.raw`'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"`;
const unescape = (value: string) => value.replace(/\\'/g, "'").replace(/\\"/g, '"');
const literalValue = (match: RegExpMatchArray, offset = 1) => unescape(match[offset] ?? match[offset + 1] ?? '');

/** Bloco a partir de um índice até fechar o parêntese/chaveta/parêntese reto de abertura. */
function blockFrom(source: string, start: number): string {
  let depth = 0;
  for (let index = start; index < source.length; index += 1) {
    const char = source[index];
    if (char === '(' || char === '[' || char === '{') depth += 1;
    else if (char === ')' || char === ']' || char === '}') {
      depth -= 1;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }
  return source.slice(start);
}

/** Constantes com texto português traduzido no ponto de utilização (ficheiro → constante → campos). */
const TRANSLATED_AT_USE: { file: string; constant: string; fields: string[] | 'values' }[] = [
  { file: 'pages/profile/ProfilePage.tsx', constant: 'THEME_OPTIONS', fields: ['label'] },
  { file: 'pages/reports/ReportsPage.tsx', constant: 'GROUP_HEADERS', fields: 'values' },
  { file: 'lib/errors.ts', constant: '_MESSAGE', fields: 'values' },
  { file: 'utils/reports.ts', constant: 'NO_DEPARTMENT_LABEL', fields: 'values' },
];

const keys = new Map<string, string>();
const addKey = (key: string, file: string) => {
  if (key && !keys.has(key)) keys.set(key, file);
};

for (const path of sourceFiles(ROOT)) {
  const file = relative(ROOT, path).split(sep).join('/');
  if (file.startsWith('tests/') || file.startsWith('lib/i18n/') || file === 'main.tsx') continue;
  const source = readFileSync(path, 'utf-8');

  for (const match of source.matchAll(new RegExp(String.raw`\bt\((?:${STRING})`, 'g'))) addKey(literalValue(match), file);
  for (const match of source.matchAll(new RegExp(String.raw`\bpluralize\([^,]+,\s*(?:${STRING}),\s*(?:${STRING})`, 'g'))) {
    addKey(literalValue(match, 1), file);
    addKey(literalValue(match, 3), file);
  }
  // Mapas traduzidos na leitura: translated({ ... }) traduz todos os valores; translatedFields(..., [campos]).
  for (const match of source.matchAll(/translated\(\{/g)) {
    const block = blockFrom(source, (match.index ?? 0) + 'translated('.length);
    for (const value of block.matchAll(new RegExp(String.raw`:\s*(?:${STRING})`, 'g'))) addKey(literalValue(value), file);
  }
  for (const match of source.matchAll(/translatedFields\(/g)) {
    const call = blockFrom(source, (match.index ?? 0) + 'translatedFields'.length);
    const fields = [...(call.match(/\],\s*\[([^\]]*)\]\)$|\},\s*\[([^\]]*)\]\)$/)?.slice(1).join('') ?? '').matchAll(/'(\w+)'/g)].map((field) => field[1]);
    for (const field of fields) {
      for (const value of call.matchAll(new RegExp(String.raw`\b${field}:\s*(?:${STRING})`, 'g'))) addKey(literalValue(value), file);
    }
  }
  // Séries dos gráficos: o rótulo é traduzido pelo componente do gráfico.
  for (const match of source.matchAll(/const \w+_SERIES\b[^=]*=\s*\[/g)) {
    const block = blockFrom(source, (match.index ?? 0) + match[0].length - 1);
    for (const value of block.matchAll(new RegExp(String.raw`\blabel:\s*(?:${STRING})`, 'g'))) addKey(literalValue(value), file);
  }
  for (const entry of TRANSLATED_AT_USE.filter((item) => item.file === file)) {
    for (const match of source.matchAll(new RegExp(String.raw`const \w*${entry.constant}\b[^=]*=\s*`, 'g'))) {
      const start = (match.index ?? 0) + match[0].length;
      const block = /['"]/.test(source[start] ?? '') ? source.slice(start, source.indexOf('\n', start)) : blockFrom(source, start);
      const pattern =
        entry.fields === 'values'
          ? new RegExp(String.raw`(?:^|:\s*)(?:${STRING})`, 'g')
          : new RegExp(String.raw`\b(?:${entry.fields.join('|')}):\s*(?:${STRING})`, 'g');
      for (const value of block.matchAll(pattern)) addKey(literalValue(value), file);
    }
  }
}

// ----------------------------------------------------------------------------- cobertura
console.log('\nCobertura das traduções');
const missing = [...keys.keys()].filter((key) => EN[key] === undefined);
if (process.env.I18N_MISSING) writeFileSync(process.env.I18N_MISSING, missing.join('\n'), 'utf-8');
if (missing.length > 0) console.log(missing.slice(0, 25).map((key) => `  em falta: "${key}" (${keys.get(key)})`).join('\n'));
assert(keys.size > 1000, `textos da interface encontrados (${keys.size})`);
assert(missing.length === 0, `todos os textos têm tradução para inglês (${missing.length} em falta)`);

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort().join(',');
const mismatched = [...keys.keys()].filter((key) => EN[key] !== undefined && placeholders(key) !== placeholders(EN[key] ?? ''));
if (mismatched.length > 0) console.log(mismatched.slice(0, 10).map((key) => `  parâmetros diferentes: "${key}" → "${EN[key]}"`).join('\n'));
assert(mismatched.length === 0, 'as traduções usam os mesmos parâmetros {…} que o original');
const empty = Object.entries(EN).filter(([, value]) => !value.trim());
assert(empty.length === 0, 'nenhuma tradução vazia');
const unused = Object.keys(EN).filter((key) => !keys.has(key));
if (unused.length > 0) console.log(`  (informação) ${unused.length} entradas do dicionário sem uso estático (ex.: mensagens do servidor)`);

// ----------------------------------------------------------------------------- comportamento
console.log('\nMotor de tradução');
assert(getLocale() === 'pt' && t('Guardar alterações') === 'Guardar alterações', 'português por omissão: o texto original');
assert(t('Página {page} de {pageCount}', { page: 2, pageCount: 5 }) === 'Página 2 de 5', 'parâmetros inseridos');
assert(t('Olá, {name}', { name: null }) === 'Olá, ', 'parâmetros nulos ficam vazios');
setLocale('en');
assert(intlLocale() === 'en-GB', 'inglês usa o formato en-GB');
assert(t('Guardar alterações') === EN['Guardar alterações'], 'inglês: texto traduzido');
assert(t('Página {page} de {pageCount}', { page: 2, pageCount: 5 }) === (EN['Página {page} de {pageCount}'] ?? '').replace('{page}', '2').replace('{pageCount}', '5'), 'inglês: parâmetros no texto traduzido');
assert(t('Texto que não existe no dicionário') === 'Texto que não existe no dicionário', 'sem tradução, mantém o original (nunca fica vazio)');
const labels = translated({ OPEN: 'Em aberto' });
assert(labels.OPEN === EN['Em aberto'], 'mapa traduzido no momento da leitura');
const tabs = translatedFields([{ id: 'a', label: 'Em aberto', count: 3 }], ['label']);
assert(tabs.map((tab) => tab.label)[0] === EN['Em aberto'] && tabs[0]?.id === 'a' && tabs[0]?.count === 3, 'campos indicados traduzidos, restantes intactos');
assert(pluralize(2, 'pessoa', 'pessoas') === `2 ${EN['pessoas']}`, 'plural traduzido');
assert(greetingFor(new Date(2026, 9, 11, 9)) === EN['Bom dia'], 'saudação no idioma ativo');
assert(tIfKnown('Mensagem do servidor desconhecida') === 'Mensagem do servidor desconhecida', 'mensagens do servidor sem tradução ficam em português');
assert(/^\d{2}\/\d{2}\/\d{4}$/.test(formatDate('2026-10-11T10:00:00Z')), 'datas em formato dia/mês/ano (en-GB)');
setLocale('pt');
assert(labels.OPEN === 'Em aberto' && t('Guardar alterações') === 'Guardar alterações', 'voltar ao português');

console.log(`\n${passed} testes passaram.`);
