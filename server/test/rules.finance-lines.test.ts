import { monthMs } from '@tflive/shared';
import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import type { RuleContext } from '../src/alerts/engine';
import { lowReserve, negativeOperatingResult } from '../src/alerts/finance';
import { lineWithoutVehicles, lowLineLoad, overloadedStop, unprofitableLine } from '../src/alerts/lines';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { DAY, finance, line, meta, snapshot, stop } from './builders';

const M = monthMs(DAY);
function ctx(p: Partial<RuleContext['snap']>, gameTime = 24 * M, buffers = new RuleBuffers()): RuleContext {
  return { snap: { ...snapshot(p), meta: meta({ gameTime }) }, gameTime, dayMs: DAY, config: DEFAULT_ALERT_CONFIG, buffers };
}

describe('lowReserve', () => {
  it('warn poniżej 3 miesięcy, critical poniżej 1', () => {
    expect(lowReserve(ctx({ finance: finance({ balance: 250, runningCosts12m: 1200 }) }))[0].severity).toBe('warn');
    expect(lowReserve(ctx({ finance: finance({ balance: 50, runningCosts12m: 1200 }) }))[0].severity).toBe('critical');
    expect(lowReserve(ctx({ finance: finance({ balance: 300, runningCosts12m: 1200 }) }))).toEqual([]);
  });
  it('brak finansów lub kosztów — brak alertu', () => {
    expect(lowReserve(ctx({ finance: null }))).toEqual([]);
    expect(lowReserve(ctx({ finance: finance({ runningCosts12m: 0 }) }))).toEqual([]);
  });
});

describe('negativeOperatingResult', () => {
  it('suma 3 ostatnich miesięcy < 0', () => {
    const opsM = [{ month: 1, value: 100 }, { month: 2, value: -50 }, { month: 3, value: -40 }, { month: 4, value: -20 }];
    expect(negativeOperatingResult(ctx({ finance: finance({ operatingResultByMonth: opsM }) }))).toHaveLength(1);
  });
  it('mniej niż 3 miesiące danych — brak alertu', () => {
    expect(negativeOperatingResult(ctx({ finance: finance({ operatingResultByMonth: [{ month: 1, value: -5 }] }) }))).toEqual([]);
  });
});

describe('unprofitableLine', () => {
  it('alert po Rozruchu przy ujemnym wyniku', () => {
    expect(unprofitableLine(ctx({ lines: [line({ operatingResult12m: -1, firstLedgerTime: 0 })] }, 7 * M))).toHaveLength(1);
  });
  it('brak alertu w Rozruchu', () => {
    expect(unprofitableLine(ctx({ lines: [line({ operatingResult12m: -1, firstLedgerTime: 2 * M })] }, 7 * M))).toEqual([]);
  });
  it('bez firstLedgerTime używa pierwszego zobaczenia przez serwer', () => {
    const b = new RuleBuffers();
    const l = line({ operatingResult12m: -1, firstLedgerTime: null });
    b.observe(snapshot({ meta: meta({ gameTime: 5 * M }), lines: [l] }));
    expect(unprofitableLine(ctx({ lines: [l] }, 7 * M, b))).toEqual([]);
    expect(unprofitableLine(ctx({ lines: [l] }, 11 * M, b))).toHaveLength(1);
  });
});

describe('lowLineLoad', () => {
  it('info przy średnim obłożeniu < 25%', () => {
    const b = new RuleBuffers();
    const l = line({ id: 10, departureLoads: [{ stopIndex: 0, load: 4, capacity: 40, time: 24 * M - DAY }] });
    b.observe(snapshot({ lines: [l] }));
    const r = lowLineLoad(ctx({ lines: [l] }, 24 * M, b));
    expect(r[0]).toMatchObject({ type: 'low-line-load', severity: 'info', entityId: 10 });
  });
  it('brak danych — brak alertu', () => {
    expect(lowLineLoad(ctx({ lines: [line()] }))).toEqual([]);
  });
});

describe('lineWithoutVehicles', () => {
  it('linia bez pojazdów', () => {
    expect(lineWithoutVehicles(ctx({ lines: [line({ vehicleIds: [] }), line({ id: 11 })] })).map((a) => a.entityId)).toEqual([10]);
  });
});

describe('overloadedStop', () => {
  const w = (count: number, bad: number) => [{ cargo: 'passengers', count, bad }];
  it('alert, gdy gra oznacza przystanek jako bardzo zły', () => {
    expect(overloadedStop(ctx({ stops: [stop({ waiting: w(10, 0), veryBad: true })] }))).toHaveLength(1);
  });
  it('alert, gdy ≥ 25% oczekujących jest źle obsłużonych', () => {
    expect(overloadedStop(ctx({ stops: [stop({ waiting: [...w(70, 20), { cargo: 'coal', count: 30, bad: 5 }] })] }))).toHaveLength(1);
    expect(overloadedStop(ctx({ stops: [stop({ waiting: w(100, 24) })] }))).toEqual([]);
  });
  it('brak oczekujących — brak alertu', () => {
    expect(overloadedStop(ctx({ stops: [stop()] }))).toEqual([]);
  });
});
