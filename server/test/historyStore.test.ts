import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../src/history/historyStore';
import { finance, industry, line, snapshot, town, vehicle } from './builders';

const snap = () => snapshot({
  finance: finance({ balance: 500, loan: 10, operatingResult12m: 70, runningCosts12m: 30, operatingResultByMonth: [{ month: 99, value: 6 }, { month: 100, value: 7 }] }),
  lines: [line({ id: 10, operatingResult12m: -5, vehicleIds: [1, 2], operatingResultByMonth: [{ month: 100, value: -1 }] })],
  vehicles: [vehicle({ id: 1 }), vehicle({ id: 2 })],
  towns: [town({ id: 30, population: 1200 })],
  industries: [industry({ id: 20, level: 3 })],
});

describe('HistoryStore', () => {
  it('zapisuje miesiąc i nadpisuje przy ponownym zapisie (upsert)', () => {
    const h = new HistoryStore(':memory:');
    h.recordMonth('s', 100, snap(), () => 0.4);
    h.recordMonth('s', 100, snapshot({ finance: finance({ balance: 999 }) }), () => null);
    expect(h.readGlobal('s')).toEqual([
      { month: 99, balance: null, loan: null, operatingResult: 6, runningCosts12m: null, vehicles: null, lines: null },
      { month: 100, balance: 999, loan: 0, operatingResult: 7, runningCosts12m: 120_000, vehicles: 0, lines: 0 },
    ]);
    expect(h.readLines('s', 10)).toEqual([{ month: 100, lineId: 10, operatingResult: -1, loadRatio: 0.4, vehicles: 2 }]);
    expect(h.readTowns('s')).toEqual([{ month: 100, townId: 30, population: 1200 }]);
  });

  it('rozdziela Rozgrywki po saveId', () => {
    const h = new HistoryStore(':memory:');
    h.recordMonth('a', 100, snap(), () => null);
    h.recordMonth('b', 100, snap(), () => null);
    h.truncateAfter('a', 0);
    expect(h.readGlobal('a')).toEqual([]);
    expect(h.readGlobal('b').map((r) => r.month)).toEqual([99, 100]);
  });

  it('Cofnięcie usuwa miesiące po wskazanym, Wyciszenia zostają', () => {
    const h = new HistoryStore(':memory:');
    for (const m of [10, 11, 12]) h.recordMonth('s', m, snap(), () => null);
    h.addMute({ saveId: 's', alertType: 'vehicle-old', entityId: 1, kind: 'ignore', untilGameTime: null });
    h.truncateAfter('s', 10);
    expect(h.readGlobal('s').map((r) => r.month)).toEqual([10]);
    expect(h.readLines('s', 10).map((r) => r.month)).toEqual([10]);
    expect(h.listMutes('s')).toHaveLength(1);
  });

  it('Uzupełnienie historii uzupełnia tylko Wynik operacyjny i nie kasuje innych kolumn', () => {
    const h = new HistoryStore(':memory:');
    h.recordMonth('s', 5, snapshot({ ...snap(), finance: finance({ balance: 500, loan: 10, runningCosts12m: 30 }), lines: [line({ id: 10, vehicleIds: [1, 2] })] }), () => null);
    h.applyBackfill('s', { scope: 'global', entityId: null, months: [{ month: 4, value: -7 }, { month: 5, value: 33 }] });
    h.applyBackfill('s', { scope: 'line', entityId: 10, months: [{ month: 4, value: 2 }, { month: 5, value: -5 }] });
    expect(h.readGlobal('s')).toEqual([
      { month: 4, balance: null, loan: null, operatingResult: -7, runningCosts12m: null, vehicles: null, lines: null },
      { month: 5, balance: 500, loan: 10, operatingResult: 33, runningCosts12m: 30, vehicles: 2, lines: 1 },
    ]);
    expect(h.readLines('s', 10).map((r) => [r.month, r.operatingResult])).toEqual([[4, 2], [5, -5]]);
  });

  it('dodaje, listuje i usuwa Wyciszenia w obrębie Rozgrywki', () => {
    const h = new HistoryStore(':memory:');
    const m = h.addMute({ saveId: 's', alertType: 'missing-input', entityId: 20, kind: 'snooze', untilGameTime: 999 });
    expect(m.id).toBeGreaterThan(0);
    expect(h.listMutes('s')).toEqual([m]);
    expect(h.listMutes('inna')).toEqual([]);
    expect(h.removeMute('inna', m.id)).toBe(false);
    expect(h.removeMute('s', m.id)).toBe(true);
    expect(h.listMutes('s')).toEqual([]);
  });

  it('obsługuje Wyciszenie alertu firmowego (entityId null)', () => {
    const h = new HistoryStore(':memory:');
    h.addMute({ saveId: 's', alertType: 'low-reserve', entityId: null, kind: 'ignore', untilGameTime: null });
    expect(h.listMutes('s')[0].entityId).toBeNull();
  });

  it('recordMonth z pustym finance nie kasuje istniejących wartości', () => {
    const h = new HistoryStore(':memory:');
    h.applyBackfill('s', { scope: 'global', entityId: null, months: [{ month: 5, value: 33 }] });
    h.recordMonth('s', 5, snapshot({ finance: null }), () => null);
    expect(h.readGlobal('s')[0].operatingResult).toBe(33);
  });

  it('C1: Uzupełnienie + zapis na żywo dają czysto miesięczną serię Wyniku operacyjnego (bez wartości 12m)', () => {
    const h = new HistoryStore(':memory:');
    h.applyBackfill('s', { scope: 'global', entityId: null, months: [{ month: 1, value: 10 }, { month: 2, value: 20 }, { month: 3, value: 30 }] });
    const live = (month: number, byMonth: { month: number; value: number }[]) =>
      h.recordMonth('s', month, snapshot({ finance: finance({ operatingResult12m: 999_999, operatingResultByMonth: byMonth }) }), () => null);
    live(3, [{ month: 1, value: 10 }, { month: 2, value: 20 }, { month: 3, value: 31 }]);
    live(4, [{ month: 2, value: 20 }, { month: 3, value: 32 }, { month: 4, value: 40 }]);
    const rows = h.readGlobal('s');
    expect(rows.map((r) => [r.month, r.operatingResult])).toEqual([[1, 10], [2, 20], [3, 32], [4, 40]]);
    expect(rows.some((r) => r.operatingResult === 999_999)).toBe(false);
    expect(rows.find((r) => r.month === 4)?.runningCosts12m).toBe(120_000);
  });

  it('C1: seria linii pochodzi z operatingResultByMonth linii, nie z operatingResult12m', () => {
    const h = new HistoryStore(':memory:');
    h.applyBackfill('s', { scope: 'line', entityId: 10, months: [{ month: 1, value: -3 }] });
    const l = line({ id: 10, operatingResult12m: 888_888, operatingResultByMonth: [{ month: 1, value: -4 }, { month: 2, value: 5 }] });
    h.recordMonth('s', 2, snapshot({ lines: [l] }), () => 0.5);
    expect(h.readLines('s', 10)).toEqual([
      { month: 1, lineId: 10, operatingResult: -4, loadRatio: null, vehicles: null },
      { month: 2, lineId: 10, operatingResult: 5, loadRatio: 0.5, vehicles: 1 },
    ]);
  });
});
