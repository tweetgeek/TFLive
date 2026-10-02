import { monthMs } from '@tflive/shared';
import type { Rule } from './engine';

const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');

export const unprofitableLine: Rule = ({ snap, gameTime, dayMs, config, buffers }) =>
  snap.lines.flatMap((l) => {
    const start = l.firstLedgerTime ?? buffers.lineFirstSeen(l.id) ?? gameTime;
    if (gameTime - start < config.rampUpMonths * monthMs(dayMs) || l.operatingResult12m >= 0) return [];
    return [{
      type: 'unprofitable-line' as const,
      category: 'lines' as const,
      severity: 'warn' as const,
      entityType: 'line' as const,
      entityId: l.id,
      title: `Nierentowna linia: ${l.name}`,
      detail: `Wynik operacyjny (12 mies.): ${fmt(l.operatingResult12m)}`,
    }];
  });

export const lowLineLoad: Rule = ({ snap, gameTime, dayMs, config, buffers }) =>
  snap.lines.flatMap((l) => {
    const avg = buffers.lineLoadAvg(l.id, gameTime, config.lowLoadWindowMonths * monthMs(dayMs));
    if (avg === null || avg >= config.lowLoadRatio) return [];
    return [{
      type: 'low-line-load' as const,
      category: 'lines' as const,
      severity: 'info' as const,
      entityType: 'line' as const,
      entityId: l.id,
      title: `Niskie obłożenie: ${l.name}`,
      detail: `Obłożenie linii: ${Math.round(avg * 100)}% — rozważ mniej Pojazdów`,
    }];
  });

export const lineWithoutVehicles: Rule = ({ snap }) =>
  snap.lines
    .filter((l) => l.vehicleIds.length === 0)
    .map((l) => ({
      type: 'line-without-vehicles' as const,
      category: 'lines' as const,
      severity: 'warn' as const,
      entityType: 'line' as const,
      entityId: l.id,
      title: `Linia bez pojazdów: ${l.name}`,
      detail: 'Do Linii nie jest przypisany żaden Pojazd',
    }));

export const overloadedStop: Rule = ({ snap, config }) =>
  snap.stops.flatMap((s) => {
    const total = s.waiting.reduce((sum, w) => sum + w.count, 0);
    const bad = s.waiting.reduce((sum, w) => sum + w.bad, 0);
    const ratio = total > 0 ? bad / total : 0;
    if (!s.veryBad && (total < config.overloadedMinWaiting || ratio < config.overloadedBadRatio)) return [];
    return [{
      type: 'overloaded-stop' as const,
      category: 'lines' as const,
      severity: 'warn' as const,
      entityType: 'stop' as const,
      entityId: s.id,
      title: `Przeciążony przystanek: ${s.name}`,
      detail: s.veryBad ? 'Gra ocenia obsługę oczekujących jako bardzo złą' : `Źle obsłużeni: ${Math.round(ratio * 100)}% oczekujących`,
    }];
  });
