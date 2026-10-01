import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import { DAY, line, meta, snapshot, town } from './builders';

describe('RuleBuffers', () => {
  it('liczy średnie obłożenie z odjazdów, bez duplikatów i w oknie czasu', () => {
    const b = new RuleBuffers();
    const l = line({ id: 1, departureLoads: [{ stopIndex: 0, load: 10, capacity: 40, time: 1000 }, { stopIndex: 1, load: 30, capacity: 40, time: 2000 }] });
    b.observe(snapshot({ meta: meta({ gameTime: 3000 }), lines: [l] }));
    b.observe(snapshot({ meta: meta({ gameTime: 4000 }), lines: [l] }));
    expect(b.lineLoadAvg(1, 3000, 10_000)).toBe(0.5);
    expect(b.lineLoadAvg(1, 100_000, 10_000)).toBeNull();
    expect(b.lineLoadAvg(2, 3000, 10_000)).toBeNull();
  });

  it('pomija odjazdy z pojemnością 0', () => {
    const b = new RuleBuffers();
    b.observe(snapshot({ lines: [line({ id: 1, departureLoads: [{ stopIndex: 0, load: 0, capacity: 0, time: 1 }] })] }));
    expect(b.lineLoadAvg(1, 1, 10)).toBeNull();
  });

  it('zapamiętuje pierwsze zobaczenie linii', () => {
    const b = new RuleBuffers();
    b.observe(snapshot({ meta: meta({ gameTime: 50 * DAY }), lines: [line({ id: 1 })] }));
    b.observe(snapshot({ meta: meta({ gameTime: 90 * DAY }), lines: [line({ id: 1 })] }));
    expect(b.lineFirstSeen(1)).toBe(50 * DAY);
  });

  it('trzyma miesięczne próbki dostaw do miast', () => {
    const b = new RuleBuffers();
    const t = (supplied: number) => town({ id: 3, needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied }] });
    b.observe(snapshot({ meta: meta({ date: { y: 1900, m: 1, d: 5 } }), towns: [t(80)] }));
    b.observe(snapshot({ meta: meta({ date: { y: 1900, m: 4, d: 5 } }), towns: [t(20)] }));
    expect(b.townSupplyAt(3, 'COMMERCIAL', 'FOOD', 1900 * 12)).toBe(80);
    expect(b.townSupplyAt(3, 'COMMERCIAL', 'FOOD', 1900 * 12 + 3)).toBe(20);
    expect(b.townSupplyAt(3, 'COMMERCIAL', 'FOOD', 1900 * 12 + 1)).toBeNull();
  });
});
