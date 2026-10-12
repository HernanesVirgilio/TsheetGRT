import React, { useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { LucideIcon } from 'lucide-react';

export interface TabDefinition<Id extends string> {
  id: Id;
  label: string;
  icon?: LucideIcon;
  /** Pendentes a destacar no separador (0 ou indefinido: sem destaque). */
  count?: number;
}

interface TabsProps<Id extends string> {
  tabs: TabDefinition<Id>[];
  activeId: Id;
  onChange: (id: Id) => void;
  label: string;
  /** Prefixo dos ids, para ligar cada separador ao seu painel (aria-controls). */
  idPrefix: string;
}

/**
 * Separadores acessíveis (padrão WAI-ARIA): setas, Home e End movem o foco e ativam o separador.
 * Em ecrãs pequenos deslocam-se na horizontal dentro do próprio contentor.
 */
export function Tabs<Id extends string>({ tabs, activeId, onChange, label, idPrefix }: TabsProps<Id>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  const handleKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === 'ArrowRight' ? (index === last ? 0 : index + 1)
      : event.key === 'ArrowLeft' ? (index === 0 ? last : index - 1)
      : event.key === 'Home' ? 0
      : event.key === 'End' ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    refs.current[next]?.focus();
    onChange(tabs[next].id);
  };

  return (
    <div role="tablist" aria-label={label} className="flex gap-1 overflow-x-auto border-b border-border custom-scrollbar">
      {tabs.map((tab, index) => {
        const isActive = tab.id === activeId;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              refs.current[index] = element;
            }}
            id={`${idPrefix}-tab-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={`${idPrefix}-panel`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => handleKeyDown(event, index)}
            className={`-mb-px inline-flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
              isActive ? 'border-primary text-text' : 'border-transparent text-text-secondary hover:border-border-input hover:text-text'
            }`}
          >
            {Icon && <Icon className={`h-4 w-4 ${isActive ? 'text-primary-hover' : 'text-text-muted'}`} aria-hidden="true" />}
            {tab.label}
            {(tab.count ?? 0) > 0 && (
              <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary-soft px-1.5 text-[11px] font-bold text-primary-hover">
                {(tab.count ?? 0) > 99 ? '99+' : tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/** Painel do separador ativo, ligado ao separador pelo id. */
export const TabPanel: React.FC<{ idPrefix: string; activeId: string; children: React.ReactNode }> = ({ idPrefix, activeId, children }) => (
  <div id={`${idPrefix}-panel`} role="tabpanel" aria-labelledby={`${idPrefix}-tab-${activeId}`} className="space-y-6 pt-5">
    {children}
  </div>
);

/**
 * Separador ativo guardado no endereço (?tab=), para que ligações, notificações e o botão "voltar"
 * abram o separador certo. Um valor desconhecido ou indisponível cai no primeiro separador.
 */
export function useTabParam<Id extends string>(available: readonly Id[]): [Id | undefined, (id: Id) => void] {
  const [searchParams, setSearchParams] = useSearchParams();
  const requested = searchParams.get('tab');
  const active = available.find((id) => id === requested) ?? available[0];
  const setActive = (id: Id) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        next.set('tab', id);
        return next;
      },
      { replace: true }
    );
  return [active, setActive];
}
