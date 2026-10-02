import { monthIndex } from '@tflive/shared';
import type { Rule } from './engine';
import { isServed } from './supply';

export const supplyDrop: Rule = ({ snap, gameTime, dayMs, config, buffers }) => {
  const month = monthIndex(snap.meta.date);
  return snap.towns.flatMap((t) => {
    if (!isServed(t.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    return t.needs.flatMap((n) => {
      if (n.supplied === null || n.demand <= 0) return [];
      const past = buffers.townSupplyAt(t.id, n.district, n.cargo, month - config.supplyDropWindowMonths);
      const delivered = n.supplied > 0 || (past !== null && past > 0);
      if (!delivered) return [];
      const low = n.supplied / n.demand < config.supplyLowRatio;
      const dropped = past !== null && past > 0 && n.supplied < past * (1 - config.supplyDropRatio);
      if (!low && !dropped) return [];
      return [{
        type: 'supply-drop' as const,
        category: 'towns' as const,
        severity: 'warn' as const,
        entityType: 'town' as const,
        entityId: t.id,
        subKey: `${n.district}:${n.cargo}`,
        title: `Spadek dostaw: ${t.name}`,
        detail: `${n.cargo}: ${Math.round((n.supplied / n.demand) * 100)}% potrzeby${dropped ? `, było ${Math.round(((past as number) / n.demand) * 100)}%` : ''}`,
      }];
    });
  });
};
