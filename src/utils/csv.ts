type CsvCell = string | number | null | undefined;

// Separador ";" e BOM UTF-8 para abrir corretamente no Excel em locale pt-PT.
const CSV_SEPARATOR = ';';
const UTF8_BOM = '﻿';

function escapeCell(value: CsvCell): string {
  const text = value === null || value === undefined ? '' : String(value);
  // Evita injeção de fórmulas ao abrir em folhas de cálculo.
  const safeText = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[";\n\r]/.test(safeText) ? `"${safeText.replace(/"/g, '""')}"` : safeText;
}

export function buildCsv(headers: string[], rows: CsvCell[][]): string {
  return [headers, ...rows].map((row) => row.map(escapeCell).join(CSV_SEPARATOR)).join('\r\n');
}

export function downloadCsv(fileName: string, csvContent: string): void {
  const blob = new Blob([UTF8_BOM + csvContent], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
