import React from 'react';
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

export interface SortState<SortKey extends string> {
  key: SortKey;
  direction: SortDirection;
}

export interface DataTableColumn<Row, SortKey extends string = string> {
  id: string;
  header: string;
  render: (row: Row) => React.ReactNode;
  sortKey?: SortKey;
  align?: 'left' | 'right';
  /** Não mostrar o rótulo da coluna na vista de cartão (ex.: coluna de ações). */
  hideLabelOnMobile?: boolean;
  className?: string;
}

interface DataTableProps<Row, SortKey extends string> {
  caption: string;
  columns: DataTableColumn<Row, SortKey>[];
  rows: Row[];
  getRowKey: (row: Row) => string;
  /** Conteúdo principal do cartão em ecrãs pequenos (ex.: nome + e-mail). */
  renderMobileHeader?: (row: Row) => React.ReactNode;
  sort?: SortState<SortKey>;
  onSortChange?: (key: SortKey) => void;
}

function ariaSort<SortKey extends string>(
  sortKey: SortKey | undefined,
  sort?: SortState<SortKey>
): 'ascending' | 'descending' | 'none' | undefined {
  if (!sortKey) return undefined;
  if (sort?.key !== sortKey) return 'none';
  return sort.direction === 'asc' ? 'ascending' : 'descending';
}

/**
 * Tabela administrativa: tabela completa a partir de md; em ecrãs pequenos cada linha
 * passa a cartão com pares rótulo/valor, evitando deslocamento horizontal.
 */
export function DataTable<Row, SortKey extends string = string>({
  caption,
  columns,
  rows,
  getRowKey,
  renderMobileHeader,
  sort,
  onSortChange,
}: DataTableProps<Row, SortKey>): React.ReactElement {
  return (
    <>
      <div className="hidden overflow-x-auto md:block custom-scrollbar">
        <table className="w-full text-left text-sm">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr className="border-b border-border bg-background">
              {columns.map((column) => {
                const SortIcon =
                  sort?.key === column.sortKey ? (sort?.direction === 'asc' ? ArrowUp : ArrowDown) : ArrowUpDown;
                return (
                  <th
                    key={column.id}
                    scope="col"
                    aria-sort={ariaSort(column.sortKey, sort)}
                    className={`whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wide text-sidebar ${
                      column.align === 'right' ? 'text-right' : ''
                    }`}
                  >
                    {column.sortKey && onSortChange ? (
                      <button
                        type="button"
                        onClick={() => column.sortKey && onSortChange(column.sortKey)}
                        className="inline-flex items-center gap-1 uppercase hover:text-text"
                      >
                        {column.header}
                        <SortIcon className="h-3.5 w-3.5" aria-hidden="true" />
                      </button>
                    ) : (
                      column.header
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {rows.map((row) => (
              <tr key={getRowKey(row)} className="hover:bg-background">
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={`px-4 py-3 align-middle text-text-secondary ${column.align === 'right' ? 'text-right' : ''} ${
                      column.className ?? ''
                    }`}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="divide-y divide-border md:hidden" aria-label={caption}>
        {rows.map((row) => (
          <li key={getRowKey(row)} className="space-y-3 px-4 py-4">
            {renderMobileHeader && <div>{renderMobileHeader(row)}</div>}
            <dl className="grid grid-cols-1 gap-2 text-sm">
              {columns.map((column) =>
                column.hideLabelOnMobile ? (
                  <div key={column.id} className="pt-1">
                    {column.render(row)}
                  </div>
                ) : (
                  <div key={column.id} className="flex items-start justify-between gap-4">
                    <dt className="text-text-muted">{column.header}</dt>
                    <dd className="text-right text-text-secondary">{column.render(row)}</dd>
                  </div>
                )
              )}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
