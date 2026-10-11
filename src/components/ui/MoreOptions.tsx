import React, { useEffect, useId, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { t } from '../../lib/i18n';

interface MoreOptionsProps {
  /** Título da secção (por omissão "Opções adicionais"). */
  title?: string;
  /** Resumo do que está configurado, visível com a secção fechada (ex.: "Prioridade média"). */
  summary?: string;
  /** Aberta ao entrar (ex.: na edição, quando já há valores preenchidos). */
  defaultOpen?: boolean;
  /** Abre automaticamente (ex.: há um erro num campo interior), para nunca esconder um erro. */
  forceOpen?: boolean;
  children: React.ReactNode;
}

/**
 * Secção recolhível para campos opcionais ou avançados de um formulário. Os campos continuam no
 * formulário (os valores mantêm-se ao fechar) e são validados da mesma forma.
 */
export const MoreOptions: React.FC<MoreOptionsProps> = ({ title, summary, defaultOpen = false, forceOpen = false, children }) => {
  const [isOpen, setIsOpen] = useState(defaultOpen || forceOpen);
  const contentId = useId();

  useEffect(() => {
    if (forceOpen) setIsOpen(true);
  }, [forceOpen]);

  return (
    <div className="rounded-md border border-border">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        aria-expanded={isOpen}
        aria-controls={contentId}
        className="flex w-full items-center gap-2 rounded-md px-3 py-2.5 text-left hover:bg-surface-muted"
      >
        <ChevronRight className={`h-4 w-4 shrink-0 text-text-muted transition-transform ${isOpen ? 'rotate-90' : ''}`} aria-hidden="true" />
        <span className="text-sm font-semibold text-text">{title ?? t('Opções adicionais')}</span>
        {!isOpen && summary && <span className="min-w-0 truncate text-xs text-text-muted">· {summary}</span>}
      </button>
      <div id={contentId} hidden={!isOpen} className="space-y-4 border-t border-border px-3 py-4">
        {children}
      </div>
    </div>
  );
};
