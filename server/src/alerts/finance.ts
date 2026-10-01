import { reserveMonths } from '../derive';
import type { Rule } from './engine';

const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');

export const lowReserve: Rule = ({ snap, config }) => {
  const f = snap.finance;
  if (!f) return [];
  const r = reserveMonths(f);
  if (r === null || r >= config.reserveWarnMonths) return [];
  return [{
    type: 'low-reserve',
    category: 'finance',
    severity: r < config.reserveCriticalMonths ? 'critical' : 'warn',
    entityType: 'company',
    entityId: null,
    title: 'Niska rezerwa',
    detail: `Rezerwa: ${r.toFixed(1)} mies. Kosztów bieżących`,
  }];
};

export const negativeOperatingResult: Rule = ({ snap }) => {
  const f = snap.finance;
  if (!f || f.operatingResultByMonth.length < 3) return [];
  const last3 = [...f.operatingResultByMonth].sort((a, b) => a.month - b.month).slice(-3);
  const sum = last3.reduce((s, m) => s + m.value, 0);
  if (sum >= 0) return [];
  return [{
    type: 'negative-operating-result',
    category: 'finance',
    severity: 'warn',
    entityType: 'company',
    entityId: null,
    title: 'Ujemny Wynik operacyjny',
    detail: `Ostatnie 3 miesiące: ${fmt(sum)}`,
  }];
};
