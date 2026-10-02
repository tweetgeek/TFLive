import { monthMs } from '@tflive/shared';
import type { Rule } from './engine';

export function isServed(lastServedTime: number | null, gameTime: number, dayMs: number, servedWindowMonths: number): boolean {
  return lastServedTime !== null && gameTime - lastServedTime <= servedWindowMonths * monthMs(dayMs);
}

export const missingInput: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.industries.flatMap((i) => {
    if (!isServed(i.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    return i.inputs
      .filter((x) => x.lastReceivedTime !== null && gameTime - x.lastReceivedTime > config.missingInputMonths * monthMs(dayMs))
      .map((x) => ({
        type: 'missing-input' as const,
        category: 'supply' as const,
        severity: 'warn' as const,
        entityType: 'industry' as const,
        entityId: i.id,
        subKey: x.cargo,
        title: `${i.name}: brak ${x.cargo}`,
        detail: `Niedostarczony surowiec od ${Math.floor((gameTime - (x.lastReceivedTime as number)) / dayMs)} dni`,
      }));
  });

export const stalledOutput: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.industries.flatMap((i) => {
    if (!isServed(i.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    return i.outputs
      .filter((o) => o.capacity > 0 && o.stock / o.capacity >= config.stalledOutputRatio)
      .map((o) => ({
        type: 'stalled-output' as const,
        category: 'supply' as const,
        severity: 'warn' as const,
        entityType: 'industry' as const,
        entityId: i.id,
        subKey: o.cargo,
        title: `${i.name}: Zalegająca produkcja`,
        detail: `${o.cargo}: magazyn ${Math.round((o.stock / o.capacity) * 100)}%`,
        minDurationMs: config.stalledOutputMonths * monthMs(dayMs),
      }));
  });

export const closureThreat: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.industries.flatMap((i) => {
    if (!isServed(i.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    if (i.closureTime === null || i.closureTime <= 0) return [];
    const days = Math.max(0, Math.floor((i.closureTime - gameTime) / dayMs));
    return [{
      type: 'closure-threat' as const,
      category: 'supply' as const,
      severity: 'critical' as const,
      entityType: 'industry' as const,
      entityId: i.id,
      title: `Groźba zamknięcia: ${i.name}`,
      detail: `Do zamknięcia zostało ${days} dni`,
    }];
  });
