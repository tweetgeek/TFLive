import { monthMs } from '@tflive/shared';
import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import type { RuleContext } from '../src/alerts/engine';
import { ALL_RULES } from '../src/alerts/index';
import { closureThreat, isServed, missingInput, stalledOutput } from '../src/alerts/supply';
import { supplyDrop } from '../src/alerts/towns';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { DAY, industry, meta, snapshot, town } from './builders';

const M = monthMs(DAY);
const G = 30 * M;
const date = { y: 1902, m: 7, d: 1 };
function ctx(p: Partial<RuleContext['snap']>, buffers = new RuleBuffers()): RuleContext {
  return { snap: { ...snapshot(p), meta: meta({ gameTime: G, date }) }, gameTime: G, dayMs: DAY, config: DEFAULT_ALERT_CONFIG, buffers };
}

describe('isServed', () => {
  it('obsłużona w ostatnich 12 miesiącach', () => {
    expect(isServed(G - 11 * M, G, DAY, 12)).toBe(true);
    expect(isServed(G - 13 * M, G, DAY, 12)).toBe(false);
    expect(isServed(null, G, DAY, 12)).toBe(false);
  });
});

describe('reguły przemysłu', () => {
  it('Niedostarczony surowiec: osobny alert dla każdego surowca, tylko Obsługiwana fabryka', () => {
    const ind = industry({ lastServedTime: G - M, inputs: [
      { cargo: 'COAL', stock: 0, lastReceivedTime: G - 3 * M },
      { cargo: 'IRON_ORE', stock: 5, lastReceivedTime: G - M },
    ] });
    const r = missingInput(ctx({ industries: [ind] }));
    expect(r.map((a) => a.subKey)).toEqual(['COAL']);
    expect(missingInput(ctx({ industries: [{ ...ind, lastServedTime: null }] }))).toEqual([]);
  });

  it('Zalegająca produkcja: magazyn ≥ 80% z minDuration 1 miesiąc', () => {
    const ind = industry({ lastServedTime: G, outputs: [{ cargo: 'STEEL', stock: 80, capacity: 100 }, { cargo: 'X', stock: 1, capacity: 0 }] });
    const r = stalledOutput(ctx({ industries: [ind] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ subKey: 'STEEL', minDurationMs: M });
  });

  it('Groźba zamknięcia: critical, z liczbą dni', () => {
    const r = closureThreat(ctx({ industries: [industry({ lastServedTime: G, closureTime: G + 45 * DAY })] }));
    expect(r[0]).toMatchObject({ severity: 'critical' });
    expect(r[0].detail).toContain('45');
    expect(closureThreat(ctx({ industries: [industry({ lastServedTime: G, closureTime: 0 })] }))).toEqual([]);
  });
});

describe('Spadek dostaw', () => {
  const need = (supplied: number | null) => [{ district: 'COMMERCIAL' as const, cargo: 'FOOD', demand: 100, supplied }];

  it('dostarczany towar < 50% potrzeby', () => {
    const t = town({ lastServedTime: G, needs: need(40) });
    expect(supplyDrop(ctx({ towns: [t] }))[0]).toMatchObject({ type: 'supply-drop', subKey: 'COMMERCIAL:FOOD' });
  });

  it('spadek > 30% względem stanu sprzed 3 miesięcy', () => {
    const b = new RuleBuffers();
    b.observe(snapshot({ meta: meta({ date: { y: 1902, m: 4, d: 1 } }), towns: [town({ needs: need(100) })] }));
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(60) })] }, b))).toHaveLength(1);
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(80) })] }, b))).toEqual([]);
  });

  it('Niezaspokojona potrzeba (nigdy nie dostarczana) nie jest alertem', () => {
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(0) })] }))).toEqual([]);
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(null) })] }))).toEqual([]);
  });

  it('miasto nieobsługiwane nie dostaje alertów', () => {
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: null, needs: need(10) })] }))).toEqual([]);
  });
});

describe('ALL_RULES', () => {
  it('zawiera wszystkie 15 reguł', () => {
    expect(ALL_RULES).toHaveLength(15);
  });
});
