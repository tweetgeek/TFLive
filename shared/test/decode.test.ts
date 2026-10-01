import { describe, expect, it } from 'vitest';
import { decodeSection, DecodeError, encodeSection, type DecodedSection } from '@tflive/shared';

describe('decodeSection', () => {
  it('dekoduje meta z flagami 0/1', () => {
    const d = decodeSection('meta', { date: [1903, 7, 18], dayMs: 4000, paused: 1, speed: 2, map: null, bytes: 1234, errors: ['x'] });
    expect(d).toEqual({
      section: 'meta',
      data: { date: { y: 1903, m: 7, d: 18 }, dayMs: 4000, paused: true, speed: 2, mapName: null, bytesWritten: 1234, errors: ['x'] },
    });
  });

  it('dekoduje pojazd z częściami i null-ami', () => {
    const row = [51559, 'Pociąg 1', null, 'RAIL', 'EN_ROUTE', 0, 1, 3, 0, 120, 200, null, [['loco_a', 2241600, 29220, 0.57]]];
    const d = decodeSection('vehicles', [row]);
    expect(d).toEqual({
      section: 'vehicles',
      data: [{
        id: 51559, name: 'Pociąg 1', lineId: null, mode: 'RAIL', state: 'EN_ROUTE', userStopped: false, noPath: true,
        daysAtTerminal: 3, daysInDepot: 0, load: 120, capacity: 200, operatingResult12m: null,
        parts: [{ model: 'loco_a', purchaseTime: 2241600, lifespanSec: 29220, maintenanceState: 0.57 }],
      }],
    });
  });

  it('odrzuca wiersz o złej liczbie pól', () => {
    expect(() => decodeSection('stops', [[1, 'A', []]])).toThrow(DecodeError);
  });

  it('odrzuca nieznany stan pojazdu', () => {
    const row = [1, 'V', null, 'ROAD', 'FLYING', 0, 0, 0, 0, 0, 0, null, []];
    expect(() => decodeSection('vehicles', [row])).toThrow(/state/);
  });

  it('odrzuca tekst w polu liczbowym', () => {
    expect(() => decodeSection('finance', { bal: 'x', loan: 0, ops12: 0, run12: 0, inv12: null, opsM: [] })).toThrow(/bal/);
  });

  it('encodeSection jest odwrotnością decodeSection dla wszystkich sekcji', () => {
    const samples: DecodedSection[] = [
      { section: 'meta', data: { date: { y: 1900, m: 2, d: 3 }, dayMs: 4000, paused: false, speed: 1, mapName: 'Europa', bytesWritten: 9, errors: [] } },
      { section: 'finance', data: { balance: 1, loan: 2, operatingResult12m: 3, runningCosts12m: 4, investments12m: null, operatingResultByMonth: [{ month: 22800, value: -5 }] } },
      { section: 'lines', data: [{ id: 1, name: 'L1', mode: 'ROAD', color: '#ff0000', stopIds: [5, 6], vehicleIds: [9], firstLedgerTime: 0, operatingResult12m: -7, investments12m: null, departureLoads: [{ stopIndex: 0, load: 10, capacity: 40, time: 4000 }] }] },
      { section: 'vehicles', data: [{ id: 9, name: 'Bus', lineId: 1, mode: 'ROAD', state: 'AT_TERMINAL', userStopped: true, noPath: false, daysAtTerminal: 1, daysInDepot: 0, load: 3, capacity: 40, operatingResult12m: 100, parts: [] }] },
      { section: 'industries', data: [{ id: 3, name: 'Huta', type: 'steel_mill', level: 1, maxLevel: 7, closureTime: null, upgradeProgress: 0.5, inputs: [{ cargo: 'COAL', stock: 0, lastReceivedTime: null }], outputs: [{ cargo: 'STEEL', stock: 10, capacity: 100 }], lastServedTime: 8000 }] },
      { section: 'towns', data: [{ id: 4, name: 'Ełk', population: 900, developmentActive: true, noise: 50, pollution: 2, needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied: 40 }], lastServedTime: null }] },
      { section: 'stops', data: [{ id: 5, name: 'Dworzec', waiting: [{ cargo: 'PASSENGERS', count: 12 }], longestWaitStartTime: 1000 }] },
      { section: 'backfill', data: { scope: 'line', entityId: 1, months: [{ month: 22801, value: 50 }] } },
    ];
    for (const s of samples) {
      expect(decodeSection(s.section, JSON.parse(JSON.stringify(encodeSection(s))))).toEqual(s);
    }
  });
});
