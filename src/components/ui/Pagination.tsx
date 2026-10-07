import React from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { IconButton } from './Button';

interface PaginationProps {
  page: number;
  pageSize: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

export const Pagination: React.FC<PaginationProps> = ({ page, pageSize, totalItems, onPageChange }) => {
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const firstItem = totalItems === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastItem = Math.min(page * pageSize, totalItems);

  return (
    <nav
      aria-label="Paginação"
      className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-sm text-text-secondary"
    >
      <span>
        {firstItem}–{lastItem} de {totalItems}
      </span>
      <div className="flex items-center gap-1">
        <IconButton
          icon={ChevronLeft}
          label="Página anterior"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        />
        <span className="px-2" aria-current="page">
          Página {page} de {pageCount}
        </span>
        <IconButton
          icon={ChevronRight}
          label="Página seguinte"
          disabled={page >= pageCount}
          onClick={() => onPageChange(page + 1)}
        />
      </div>
    </nav>
  );
};
