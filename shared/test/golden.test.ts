import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { decodeSection, parseLine, SECTIONS, type Finance, type Line, type Vehicle, type Stop, type Industry, type Town, type Backfill } from '@tflive/shared';

const file = fileURLToPath(new URL('../../mod/test/golden.log', import.meta.url));

describe('kontrakt mod → serwer (golden.log)', () => {
  const lines = readFileSync(file, 'utf8').split('\n').filter((l) => l.length > 0);

  it('każda linia parsuje się i dekoduje', () => {
    expect(lines.length).toBeGreaterThan(0);
    for (const raw of lines) {
      const r = parseLine(raw);
      expect(r.ok, raw.slice(0, 120)).toBe(true);
      if (!r.ok) continue;
      if (r.line.header.parts === 1) expect(() => decodeSection(r.line.header.section, r.line.payload), raw.slice(0, 120)).not.toThrow();
    }
  });

  it('obejmuje wszystkie sekcje i zaczyna się od meta', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok ? [r.line] : []));
    expect(parsed[0].header.section).toBe('meta');
    expect(new Set(parsed.map((p) => p.header.section))).toEqual(new Set(SECTIONS));
  });

  it('części jednej partii mają ten sam seq i sklejone dekodują się', () => {
    const veh = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'vehicles' ? [r.line] : []));
    expect(veh.length).toBeGreaterThanOrEqual(2);
    expect(new Set(veh.map((v) => v.header.seq)).size).toBe(1);
    const partsCount = veh[0].header.parts;
    expect(new Set(veh.map((v) => v.header.parts)).size).toBe(1);
    expect(partsCount).toBeGreaterThanOrEqual(2);
    const rows = veh.sort((a, b) => a.header.part - b.header.part).flatMap((v) => v.payload as unknown[]);
    expect(rows.length).toBe(80);
    expect(() => decodeSection('vehicles', rows)).not.toThrow();
  });

  it('asercje konkretnych wartości sekcji — finance', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'finance' ? [r.line] : []));
    expect(parsed.length).toBe(1);
    const decoded = decodeSection('finance', parsed[0].payload);
    expect(decoded.section).toBe('finance');
    const fin = decoded.data as Finance;
    expect(fin.balance).toBe(1155058);
    expect(fin.loan).toBe(13554171);
    expect(fin.operatingResult12m).toBe(3947992);
    expect(fin.runningCosts12m).toBe(3058214);
    expect(fin.investments12m).toBe(null);
    expect(fin.operatingResultByMonth).toHaveLength(3);
    expect(fin.operatingResultByMonth[0]).toEqual({ month: 22883, value: -227439 });
    expect(fin.operatingResultByMonth[2]).toEqual({ month: 22885, value: 5000 });
  });

  it('asercje konkretnych wartości sekcji — lines', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'lines' ? [r.line] : []));
    expect(parsed.length).toBe(1);
    const decoded = decodeSection('lines', parsed[0].payload);
    expect(decoded.section).toBe('lines');
    const linesList = decoded.data as Line[];
    expect(linesList).toHaveLength(2);

    const line1 = linesList[0];
    expect(line1.id).toBe(60555);
    expect(line1.name).toBe('TC - Drewno');
    expect(line1.mode).toBe('ROAD');
    expect(line1.color).toBe('#ffb266');
    expect(line1.stopIds).toEqual([49496, 60416]);
    expect(line1.vehicleIds).toEqual([51559]);
    expect(line1.firstLedgerTime).toBe(4748250);
    expect(line1.operatingResult12m).toBe(-81812);
    expect(line1.investments12m).toBe(null);
    expect(line1.departureLoads).toHaveLength(1);
    expect(line1.departureLoads[0]).toEqual({ stopIndex: 0, load: 20, capacity: 32, time: 9778000 });
    expect(line1.operatingResultByMonth).toHaveLength(2);

    const line2 = linesList[1];
    expect(line2.id).toBe(55014);
    expect(line2.operatingResult12m).toBe(1000);
    expect(line2.firstLedgerTime).toBe(null);
  });

  it('asercje konkretnych wartości sekcji — vehicles', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'vehicles' ? [r.line] : []));
    expect(parsed.length).toBeGreaterThanOrEqual(2);
    const veh = parsed.sort((a, b) => a.header.part - b.header.part).flatMap((v) => v.payload as unknown[]);
    const decoded = decodeSection('vehicles', veh);
    const vehicles = decoded.data as Vehicle[];
    expect(vehicles.length).toBe(80);

    const v1 = vehicles[0];
    expect(v1.id).toBe(51001);
    expect(v1.name).toBe('Pojazd 1');
    expect(v1.lineId).toBe(60555);
    expect(v1.mode).toBe('ROAD');
    expect(v1.state).toBe('EN_ROUTE');
    expect(v1.userStopped).toBe(false);
    expect(v1.noPath).toBe(false);
    expect(v1.daysAtTerminal).toBe(6);
    expect(v1.daysInDepot).toBe(11);
    expect(v1.load).toBe(21);
    expect(v1.capacity).toBe(41);
    expect(v1.operatingResult12m).toBe(1500);
    expect(v1.parts).toHaveLength(1);
    expect(v1.parts[0]).toEqual({ model: 'bus_a', purchaseTime: 2241600, lifespanSec: 29220, maintenanceState: expect.closeTo(0.57302629947662, 5) });

    const v7 = vehicles[6];
    expect(v7.noPath).toBe(true);
  });

  it('asercje konkretnych wartości sekcji — stops', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'stops' ? [r.line] : []));
    expect(parsed.length).toBe(1);
    const decoded = decodeSection('stops', parsed[0].payload);
    const stops = decoded.data as Stop[];
    expect(stops).toHaveLength(2);

    const stop1 = stops[0];
    expect(stop1.id).toBe(49496);
    expect(stop1.name).toBe('Dworzec Uxbridge');
    expect(stop1.waiting).toHaveLength(1);
    expect(stop1.waiting[0]).toEqual({ cargo: 'passengers', count: 27, bad: 3 });
    expect(stop1.veryBad).toBe(false);

    const stop2 = stops[1];
    expect(stop2.id).toBe(60416);
    expect(stop2.waiting).toHaveLength(1);
    expect(stop2.waiting[0]).toEqual({ cargo: 'cargo', count: 15, bad: 2 });
    expect(stop2.veryBad).toBe(true);
  });

  it('asercje konkretnych wartości sekcji — industries', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'industries' ? [r.line] : []));
    expect(parsed.length).toBe(1);
    const decoded = decodeSection('industries', parsed[0].payload);
    const industries = decoded.data as Industry[];
    expect(industries).toHaveLength(2);

    const ind1 = industries[0];
    expect(ind1.id).toBe(61423);
    expect(ind1.name).toBe('Platforma wiertnicza');
    expect(ind1.type).toBe('oil_well');
    expect(ind1.level).toBe(5);
    expect(ind1.maxLevel).toBe(7);
    expect(ind1.closureTime).toBe(null);
    expect(ind1.outputs).toEqual([{ cargo: 'crude', stock: 154, capacity: 400 }]);
    expect(ind1.lastServedTime).toBe(null);

    const ind2 = industries[1];
    expect(ind2.level).toBe(1);
    expect(ind2.maxLevel).toBe(5);
    expect(ind2.closureTime).toBe(10200000);
    expect(ind2.inputs).toHaveLength(1);
    expect(ind2.inputs[0]).toEqual({ cargo: 'crude', stock: 0, lastReceivedTime: null });
    expect(ind2.outputs).toEqual([{ cargo: 'fuel', stock: 3, capacity: 200 }]);
    expect(ind2.lastServedTime).toBe(9000000);
  });

  it('asercje konkretnych wartości sekcji — towns', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'towns' ? [r.line] : []));
    expect(parsed.length).toBe(1);
    const decoded = decodeSection('towns', parsed[0].payload);
    const towns = decoded.data as Town[];
    expect(towns).toHaveLength(1);

    const town = towns[0];
    expect(town.id).toBe(30171);
    expect(town.name).toBe('Uxbridge');
    expect(town.population).toBe(214);
    expect(town.developmentActive).toBe(true);
    expect(town.noise).toBeCloseTo(64.923797607422);
    expect(town.pollution).toBeCloseTo(1905.9814453125);
    expect(town.needs).toHaveLength(2);
    expect(town.needs[0]).toEqual({ district: 'COMMERCIAL', cargo: 'food', demand: 99, supplied: 0 });
    expect(town.needs[1]).toEqual({ district: 'INDUSTRIAL', cargo: 'tools', demand: 80, supplied: null });
    expect(town.lastServedTime).toBe(null);
  });

  it('asercje konkretnych wartości sekcji — backfill', () => {
    const parsed = lines.map((l) => parseLine(l)).flatMap((r) => (r.ok && r.line.header.section === 'backfill' ? [r.line] : []));
    expect(parsed.length).toBe(2);

    const bf1 = decodeSection('backfill', parsed[0].payload) as any;
    expect(bf1.data.scope).toBe('global');
    expect(bf1.data.entityId).toBe(null);
    expect(bf1.data.months).toHaveLength(2);
    expect(bf1.data.months[0]).toEqual({ month: 22800, value: 100 });
    expect(bf1.data.months[1]).toEqual({ month: 22801, value: -50 });

    const bf2 = decodeSection('backfill', parsed[1].payload) as any;
    expect(bf2.data.scope).toBe('line');
    expect(bf2.data.entityId).toBe(60555);
    expect(bf2.data.months).toEqual([{ month: 22884, value: -1600 }]);
  });
});
