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
      { section: 'lines', data: [{ id: 1, name: 'L1', mode: 'ROAD', color: '#ff0000', stopIds: [5, 6], vehicleIds: [9], firstLedgerTime: 0, operatingResult12m: -7, investments12m: null, operatingResultByMonth: [{ month: 22800, value: -2 }], departureLoads: [{ stopIndex: 0, load: 10, capacity: 40, time: 4000 }] }] },
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
  describe('literalny format linii (kolejność pól)', () => {
    it('finance', () => {
      expect(decodeSection('finance', { bal: 100, loan: 20, ops12: -30, run12: 40, inv12: null, opsM: [[22800, -5], [22801, 7]] })).toEqual({
        section: 'finance',
        data: { balance: 100, loan: 20, operatingResult12m: -30, runningCosts12m: 40, investments12m: null, operatingResultByMonth: [{ month: 22800, value: -5 }, { month: 22801, value: 7 }] },
      });
    });

    it('lines: 11 pól, opsM jako 11. pole', () => {
      const row = [7, 'IC 1', 'RAIL', '#1f6feb', [101, 102], [11, 12], 4000, 850, -300, [[0, 180, 200, 8000]], [[22800, 10], [22801, -20]]];
      expect(decodeSection('lines', [row])).toEqual({
        section: 'lines',
        data: [{
          id: 7, name: 'IC 1', mode: 'RAIL', color: '#1f6feb', stopIds: [101, 102], vehicleIds: [11, 12], firstLedgerTime: 4000,
          operatingResult12m: 850, investments12m: -300, departureLoads: [{ stopIndex: 0, load: 180, capacity: 200, time: 8000 }],
          operatingResultByMonth: [{ month: 22800, value: 10 }, { month: 22801, value: -20 }],
        }],
      });
    });

    it('lines: odrzuca starą krotkę 10-polową', () => {
      expect(() => decodeSection('lines', [[7, 'IC 1', 'RAIL', null, [], [], null, 0, null, []]])).toThrow(/11 pól/);
    });

    it('industries', () => {
      const row = [3, 'Huta', 'steel_mill', 2, 7, 96000, 0.25, [['COAL', 5, null], ['IRON_ORE', 9, 4000]], [['STEEL', 10, 100]], 8000];
      expect(decodeSection('industries', [row])).toEqual({
        section: 'industries',
        data: [{
          id: 3, name: 'Huta', type: 'steel_mill', level: 2, maxLevel: 7, closureTime: 96000, upgradeProgress: 0.25,
          inputs: [{ cargo: 'COAL', stock: 5, lastReceivedTime: null }, { cargo: 'IRON_ORE', stock: 9, lastReceivedTime: 4000 }],
          outputs: [{ cargo: 'STEEL', stock: 10, capacity: 100 }], lastServedTime: 8000,
        }],
      });
    });

    it('towns', () => {
      const row = [4, 'Ełk', 900, 1, 50, 2, [['COMMERCIAL', 'FOOD', 100, 40], ['INDUSTRIAL', 'TOOLS', 50, null]], null];
      expect(decodeSection('towns', [row])).toEqual({
        section: 'towns',
        data: [{
          id: 4, name: 'Ełk', population: 900, developmentActive: true, noise: 50, pollution: 2,
          needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied: 40 }, { district: 'INDUSTRIAL', cargo: 'TOOLS', demand: 50, supplied: null }],
          lastServedTime: null,
        }],
      });
    });

    it('stops', () => {
      expect(decodeSection('stops', [[5, 'Dworzec', [['PASSENGERS', 12], ['MAIL', 3]], 1000]])).toEqual({
        section: 'stops',
        data: [{ id: 5, name: 'Dworzec', waiting: [{ cargo: 'PASSENGERS', count: 12 }, { cargo: 'MAIL', count: 3 }], longestWaitStartTime: 1000 }],
      });
    });

    it('backfill', () => {
      expect(decodeSection('backfill', { scope: 'global', id: null, months: [[22790, -100], [22791, 250]] })).toEqual({
        section: 'backfill',
        data: { scope: 'global', entityId: null, months: [{ month: 22790, value: -100 }, { month: 22791, value: 250 }] },
      });
      expect(decodeSection('backfill', { scope: 'line', id: 7, months: [] })).toEqual({ section: 'backfill', data: { scope: 'line', entityId: 7, months: [] } });
    });
  });
});
