// Regras puras do menu lateral: item ativo, secção ativa e estado de expansão guardado.
import { matchPath } from 'react-router-dom';

export interface NavigationTarget {
  to: string;
  /** Ativo apenas no caminho exato (ex.: "/it" não deve ficar ativo em "/it/tickets"). */
  end?: boolean;
}

export type OpenSections = Partial<Record<string, boolean>>;

/** Mesma regra do NavLink: ativo no caminho exato ou, sem `end`, também nos sub-caminhos. */
export function isNavigationItemActive(item: NavigationTarget, pathname: string): boolean {
  return matchPath({ path: item.to, end: item.end ?? false }, pathname) !== null;
}

/** Secção que contém a página atual (a primeira, se várias coincidirem). */
export function findActiveSection(sections: { id: string; items: NavigationTarget[] }[], pathname: string): string | null {
  return sections.find((section) => section.items.some((item) => isNavigationItemActive(item, pathname)))?.id ?? null;
}

/** Lê o estado guardado, ignorando valores inválidos (armazenamento manipulado ou de outra versão). */
export function parseOpenSections(raw: string | null): OpenSections {
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, boolean] => typeof entry[1] === 'boolean'));
  } catch {
    return {};
  }
}
