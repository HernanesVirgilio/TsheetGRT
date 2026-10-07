import React from 'react';

interface BrandMarkProps {
  /** Variante para fundos escuros (sidebar). */
  inverted?: boolean;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ inverted = false }) => (
  <div className="flex items-center gap-3">
    <span
      aria-hidden="true"
      className="flex h-9 w-9 items-center justify-center rounded-md bg-primary text-sm font-bold tracking-wide text-on-primary"
    >
      SI
    </span>
    <span className="leading-tight">
      <span className={`block text-xs font-semibold uppercase tracking-widest ${inverted ? 'text-sidebar-muted' : 'text-text-secondary'}`}>
        SI Holdings
      </span>
      <span className={`block text-sm font-bold tracking-tight ${inverted ? 'text-white' : 'text-sidebar'}`}>
        TsheetGRT
      </span>
    </span>
  </div>
);
