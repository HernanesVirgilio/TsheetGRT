import React, { useId, useState } from 'react';

/**
 * Gráficos simples em HTML (sem biblioteca): colunas e barras empilhadas com duas séries.
 * Regras de desenho: cores categóricas em ordem fixa (tokens chart-1/chart-2), marcas finas com
 * 2px de intervalo entre segmentos, extremidade arredondada só no fim do valor, legenda sempre
 * presente, texto em tokens de texto (nunca na cor da série), tooltip em hover e foco, e uma tabela
 * com os mesmos valores (a informação nunca depende só da cor nem do tooltip).
 */

export interface ChartSeries {
  label: string;
  /** Classe Tailwind de fundo da série (ex.: bg-chart-1). */
  swatchClass: string;
}

export interface ChartRow {
  id: string;
  label: string;
  /** Um valor por série, pela ordem das séries. */
  values: number[];
  /** Texto complementar no tooltip e na tabela (ex.: horas registadas). */
  detail?: string;
}

interface ChartProps {
  title: string;
  series: [ChartSeries, ChartSeries];
  rows: ChartRow[];
  formatValue?: (value: number) => string;
  emptyMessage: string;
}

const defaultFormat = (value: number) => new Intl.NumberFormat('pt-PT').format(value);

/** Máximo "limpo" do eixo (1, 2 ou 5 × 10ⁿ) para marcas de escala legíveis. */
export function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = [1, 2, 5, 10].find((candidate) => candidate * magnitude >= value) ?? 10;
  return step * magnitude;
}

const Legend: React.FC<{ series: ChartSeries[] }> = ({ series }) => (
  <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-secondary" aria-label="Legenda">
    {series.map((item) => (
      <li key={item.label} className="flex items-center gap-1.5">
        <span className={`h-2.5 w-2.5 rounded-sm ${item.swatchClass}`} aria-hidden="true" />
        {item.label}
      </li>
    ))}
  </ul>
);

const Tooltip: React.FC<{ row: ChartRow; series: ChartSeries[]; formatValue: (value: number) => string }> = ({ row, series, formatValue }) => (
  <div role="status" className="pointer-events-none rounded-md border border-border bg-surface px-3 py-2 text-xs shadow-md">
    <p className="mb-1 font-semibold text-text">{row.label}</p>
    {series.map((item, index) => (
      <p key={item.label} className="flex items-center gap-2 text-text-secondary">
        <span className={`h-2 w-2 rounded-sm ${item.swatchClass}`} aria-hidden="true" />
        <strong className="font-semibold text-text tabular-nums">{formatValue(row.values[index] ?? 0)}</strong>
        {item.label}
      </p>
    ))}
    {row.detail && <p className="mt-1 text-text-muted">{row.detail}</p>}
  </div>
);

const DataTableView: React.FC<{ title: string; series: ChartSeries[]; rows: ChartRow[]; formatValue: (value: number) => string }> = ({
  title,
  series,
  rows,
  formatValue,
}) => (
  <div className="overflow-x-auto">
    <table className="w-full text-left text-xs">
      <caption className="sr-only">{title}</caption>
      <thead>
        <tr className="border-b border-border text-text-muted">
          <th scope="col" className="py-1.5 pr-3 font-semibold">
            &nbsp;
          </th>
          {series.map((item) => (
            <th key={item.label} scope="col" className="py-1.5 pr-3 text-right font-semibold">
              {item.label}
            </th>
          ))}
          <th scope="col" className="py-1.5 text-right font-semibold">
            Total
          </th>
        </tr>
      </thead>
      <tbody className="divide-y divide-border">
        {rows.map((row) => (
          <tr key={row.id}>
            <th scope="row" className="py-1.5 pr-3 font-medium text-text">
              {row.label}
              {row.detail && <span className="block font-normal text-text-muted">{row.detail}</span>}
            </th>
            {row.values.map((value, index) => (
              <td key={series[index]?.label ?? index} className="py-1.5 pr-3 text-right tabular-nums text-text-secondary">
                {formatValue(value)}
              </td>
            ))}
            <td className="py-1.5 text-right font-semibold tabular-nums text-text">{formatValue(row.values.reduce((sum, value) => sum + value, 0))}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);

function ChartFrame({
  title,
  series,
  showTable,
  onToggleTable,
  children,
}: {
  title: string;
  series: ChartSeries[];
  showTable: boolean;
  onToggleTable: () => void;
  children: React.ReactNode;
}) {
  return (
    <figure className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <figcaption className="text-xs font-semibold uppercase tracking-wide text-text-secondary">{title}</figcaption>
        <button type="button" onClick={onToggleTable} className="text-xs font-semibold text-primary-hover hover:underline" aria-pressed={showTable}>
          {showTable ? 'Ver gráfico' : 'Ver tabela'}
        </button>
      </div>
      <Legend series={series} />
      {children}
    </figure>
  );
}

/** Colunas empilhadas (ex.: tarefas concluídas por semana: no prazo / com atraso). */
export const StackedColumnChart: React.FC<ChartProps> = ({ title, series, rows, formatValue = defaultFormat, emptyMessage }) => {
  const [active, setActive] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const chartId = useId();
  const totals = rows.map((row) => row.values.reduce((sum, value) => sum + value, 0));
  const max = niceMax(Math.max(0, ...totals));
  const activeRow = rows.find((row) => row.id === active) ?? null;
  const hasData = totals.some((total) => total > 0);

  return (
    <ChartFrame title={title} series={series} showTable={showTable} onToggleTable={() => setShowTable((value) => !value)}>
      {!hasData && <p className="py-6 text-center text-sm text-text-secondary">{emptyMessage}</p>}
      {hasData && showTable && <DataTableView title={title} series={series} rows={rows} formatValue={formatValue} />}
      {hasData && !showTable && (
        <div className="relative">
          <div className="flex gap-2">
            <div className="flex h-40 w-8 shrink-0 flex-col justify-between text-right text-[11px] tabular-nums text-text-muted" aria-hidden="true">
              <span>{formatValue(max)}</span>
              <span>{formatValue(max / 2)}</span>
              <span>0</span>
            </div>
            <div className="relative h-40 flex-1">
              {[0, 0.5, 1].map((ratio) => (
                <div key={ratio} className="absolute inset-x-0 h-px bg-chart-grid" style={{ top: `${ratio * 100}%` }} aria-hidden="true" />
              ))}
              <ul className="absolute inset-0 flex items-end justify-around gap-1" aria-describedby={chartId}>
                {rows.map((row, rowIndex) => {
                  const total = totals[rowIndex] ?? 0;
                  return (
                    <li key={row.id} className="flex h-full flex-1 justify-center">
                      <button
                        type="button"
                        className="group flex h-full w-full max-w-10 flex-col items-center justify-end rounded focus:outline-none focus-visible:ring-2 focus-visible:ring-focus"
                        aria-label={`${row.label}: ${series.map((item, index) => `${formatValue(row.values[index] ?? 0)} ${item.label}`).join(', ')}`}
                        onPointerEnter={() => setActive(row.id)}
                        onPointerLeave={() => setActive((current) => (current === row.id ? null : current))}
                        onFocus={() => setActive(row.id)}
                        onBlur={() => setActive(null)}
                      >
                        {total > 0 && <span className="mb-0.5 text-[11px] font-semibold tabular-nums text-text">{formatValue(total)}</span>}
                        <span className="flex w-full max-w-6 flex-col-reverse gap-[2px]" style={{ height: `${(total / max) * 100}%` }}>
                          {row.values.map((value, index) => {
                            const isTop = row.values.slice(index + 1).every((next) => next === 0);
                            return value > 0 ? (
                              <span
                                key={series[index]?.label ?? index}
                                className={`w-full ${series[index]?.swatchClass ?? ''} ${isTop ? 'rounded-t' : ''} ${active === row.id ? 'opacity-100' : active ? 'opacity-50' : ''}`}
                                style={{ flexGrow: value, flexBasis: 0 }}
                              />
                            ) : null;
                          })}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
          <div className="ml-10 mt-1 flex justify-around gap-1 text-[11px] text-text-muted" aria-hidden="true">
            {rows.map((row) => (
              <span key={row.id} className="flex-1 truncate text-center">
                {row.label}
              </span>
            ))}
          </div>
          <p id={chartId} className="sr-only">
            Use a tecla Tab para percorrer as colunas ou abra a vista em tabela.
          </p>
          {activeRow && (
            <div className="absolute right-0 top-0 z-10">
              <Tooltip row={activeRow} series={series} formatValue={formatValue} />
            </div>
          )}
        </div>
      )}
    </ChartFrame>
  );
};

/** Barras horizontais empilhadas (ex.: carga por pessoa ou por equipa: em dia / atrasadas). */
export const StackedBarChart: React.FC<ChartProps & { maxRows?: number }> = ({
  title,
  series,
  rows,
  formatValue = defaultFormat,
  emptyMessage,
  maxRows = 12,
}) => {
  const [active, setActive] = useState<string | null>(null);
  const [showTable, setShowTable] = useState(false);
  const visibleRows = rows.slice(0, maxRows);
  const totals = visibleRows.map((row) => row.values.reduce((sum, value) => sum + value, 0));
  const max = niceMax(Math.max(0, ...totals));
  const hasData = totals.some((total) => total > 0);

  return (
    <ChartFrame title={title} series={series} showTable={showTable} onToggleTable={() => setShowTable((value) => !value)}>
      {!hasData && <p className="py-6 text-center text-sm text-text-secondary">{emptyMessage}</p>}
      {hasData && showTable && <DataTableView title={title} series={series} rows={rows} formatValue={formatValue} />}
      {hasData && !showTable && (
        <ul className="space-y-2">
          {visibleRows.map((row, rowIndex) => {
            const total = totals[rowIndex] ?? 0;
            const isActive = active === row.id;
            return (
              <li key={row.id} className="relative">
                <button
                  type="button"
                  className="grid w-full grid-cols-[minmax(0,9rem)_1fr] items-center gap-3 rounded text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-focus sm:grid-cols-[minmax(0,12rem)_1fr]"
                  aria-label={`${row.label}: ${series.map((item, index) => `${formatValue(row.values[index] ?? 0)} ${item.label}`).join(', ')}`}
                  onPointerEnter={() => setActive(row.id)}
                  onPointerLeave={() => setActive((current) => (current === row.id ? null : current))}
                  onFocus={() => setActive(row.id)}
                  onBlur={() => setActive(null)}
                >
                  <span className="truncate text-xs text-text-secondary" title={row.label}>
                    {row.label}
                  </span>
                  <span className="flex items-center gap-2">
                    <span className="flex h-3.5 gap-[2px]" style={{ width: `${(total / max) * 85}%` }}>
                      {row.values.map((value, index) => {
                        const isEnd = row.values.slice(index + 1).every((next) => next === 0);
                        return value > 0 ? (
                          <span
                            key={series[index]?.label ?? index}
                            className={`h-full ${series[index]?.swatchClass ?? ''} ${isEnd ? 'rounded-r' : ''} ${active && !isActive ? 'opacity-50' : ''}`}
                            style={{ flexGrow: value, flexBasis: 0 }}
                          />
                        ) : null;
                      })}
                    </span>
                    <span className="text-[11px] font-semibold tabular-nums text-text">{formatValue(total)}</span>
                  </span>
                </button>
                {isActive && (
                  <div className="absolute right-0 top-5 z-10">
                    <Tooltip row={row} series={series} formatValue={formatValue} />
                  </div>
                )}
              </li>
            );
          })}
          {rows.length > maxRows && (
            <li className="text-xs text-text-muted">Mais {rows.length - maxRows} na vista em tabela.</li>
          )}
        </ul>
      )}
    </ChartFrame>
  );
};
