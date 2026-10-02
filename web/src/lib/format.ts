import type { GameDate } from '@tflive/shared';

export const MONTHS_SHORT = ['sty', 'lut', 'mar', 'kwi', 'maj', 'cze', 'lip', 'sie', 'wrz', 'paź', 'lis', 'gru'] as const;
const intFmt = new Intl.NumberFormat('pl-PL', { maximumFractionDigits: 0, useGrouping: 'always' } as Intl.NumberFormatOptions);

const ok = (n: number | null | undefined): n is number => typeof n === 'number' && Number.isFinite(n);

export function fmtInt(n: number | null | undefined): string {
  return ok(n) ? intFmt.format(Math.round(n)) : '—';
}

export function fmtSigned(n: number | null | undefined): string {
  if (!ok(n)) return '—';
  const r = Math.round(n);
  if (r === 0) return '0';
  return (r > 0 ? '+' : '−') + intFmt.format(Math.abs(r));
}

export function fmtPct(r: number | null | undefined): string {
  return ok(r) ? `${Math.round(r * 100)}%` : '—';
}

export function fmtDecimal(n: number | null | undefined, digits = 1): string {
  return ok(n) ? n.toFixed(digits).replace('.', ',') : '—';
}

export function fmtGameDate(d: GameDate | null | undefined): string {
  return d ? `${d.d} ${MONTHS_SHORT[d.m - 1]} ${d.y}` : '—';
}

export function fmtMonthIndex(i: number): string {
  return `${MONTHS_SHORT[i % 12]} ${Math.floor(i / 12)}`;
}

export function fmtMBh(n: number | null | undefined): string {
  return `${fmtDecimal(n)} MB/h`;
}
