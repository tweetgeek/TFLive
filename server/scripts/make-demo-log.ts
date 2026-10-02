import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeSection, formatLine, type DecodedSection, type Industry, type Line, type Stop, type Town, type Vehicle } from '@tflive/shared';

const PREFIX = '[2026-10-01 18:00:00Z - MESSAGE  - Sim Pool 1       - Main           ]  ';
const DAY = 4000;
const SAVE = 'demo0000';
const SESSION = 'demo-session';

function dateAt(day: number) {
  const y = 1900 + Math.floor(day / 365);
  const doy = day % 365;
  return { y, m: Math.min(12, Math.floor(doy / 30) + 1), d: (doy % 30) + 1 };
}

export function makeDemoLog(): string[] {
  const out: string[] = [];
  let seq = 0;
  const emit = (gameTime: number, s: DecodedSection) => {
    seq += 1;
    out.push(PREFIX + formatLine({ saveId: SAVE, sessionId: SESSION, seq, gameTime, section: s.section, part: 1, parts: 1 }, encodeSection(s)));
  };
  const startDay = 2 * 365;
  for (let step = 0; step < 36; step++) {
    const day = startDay + step * 5;
    const g = day * DAY;
    const month = dateAt(day).y * 12 + dateAt(day).m - 1;
    emit(g, { section: 'meta', data: { date: dateAt(day), dayMs: DAY, paused: false, speed: 1, mapName: 'Demo', bytesWritten: step * 40_000, errors: [] } });
    emit(g, { section: 'finance', data: {
      balance: 60_000 - step * 1_000, loan: 500_000, operatingResult12m: -40_000, runningCosts12m: 400_000, investments12m: -90_000,
      operatingResultByMonth: [{ month: month - 2, value: -9_000 }, { month: month - 1, value: -4_000 }, { month, value: 2_000 }],
    } });
    if (step % 2 !== 0) continue;
    const opsM = (a: number, b: number, c: number) => [{ month: month - 2, value: a }, { month: month - 1, value: b }, { month, value: c }];
    const lines: Line[] = [
      { id: 1, name: 'IC Północ', mode: 'RAIL', color: '#1f6feb', stopIds: [101, 102], vehicleIds: [11, 12, 13], firstLedgerTime: 0, operatingResult12m: 850_000, investments12m: -300_000, departureLoads: [{ stopIndex: 0, load: 180, capacity: 200, time: g - DAY }], operatingResultByMonth: opsM(70_000, 72_000, 25_000) },
      { id: 2, name: 'Bus Ełk', mode: 'ROAD', color: '#d29922', stopIds: [103, 104], vehicleIds: [21, 22, 23], firstLedgerTime: 0, operatingResult12m: -35_000, investments12m: null, departureLoads: [{ stopIndex: 0, load: 4, capacity: 40, time: g - DAY }], operatingResultByMonth: opsM(-3_000, -2_500, -1_000) },
      { id: 3, name: 'Węgiel – Huta', mode: 'ROAD', color: null, stopIds: [105, 106], vehicleIds: [], firstLedgerTime: 0, operatingResult12m: 0, investments12m: null, departureLoads: [], operatingResultByMonth: opsM(0, 0, 0) },
    ];
    const part = (purchaseDay: number, lifespanYears: number, maint: number) => ({ model: 'demo_model', purchaseTime: purchaseDay * DAY, lifespanSec: (lifespanYears * 365 * DAY) / 1000, maintenanceState: maint });
    const v = (id: number, name: string, lineId: number | null, o: Partial<Vehicle> = {}): Vehicle => ({
      id, name, lineId, mode: lineId === 1 ? 'RAIL' : 'ROAD', state: 'EN_ROUTE', userStopped: false, noPath: false, daysAtTerminal: 0, daysInDepot: 0,
      load: 20, capacity: 40, operatingResult12m: 10_000, parts: [part(startDay - 100, 20, 0.85)], ...o,
    });
    const vehicles: Vehicle[] = [
      v(11, 'Lok 11', 1), v(12, 'Lok 12', 1, { parts: [part(0, 1, 0.3)] }), v(13, 'Lok 13', 1),
      v(21, 'Autobus 21', 2, { noPath: true }), v(22, 'Autobus 22', 2, { daysAtTerminal: 45, state: 'AT_TERMINAL' }), v(23, 'Autobus 23', 2),
      v(31, 'Ciężarówka 31', null, { daysInDepot: 60, state: 'IN_DEPOT' }), v(32, 'Ciężarówka 32', null, { userStopped: true }),
    ];
    const industries: Industry[] = [
      { id: 201, name: 'Huta Katowice', type: 'steel_mill', level: 2, maxLevel: 7, closureTime: g + 120 * DAY, upgradeProgress: 0.1,
        inputs: [{ cargo: 'COAL', stock: 0, lastReceivedTime: g - 80 * DAY }, { cargo: 'IRON_ORE', stock: 20, lastReceivedTime: g - 5 * DAY }],
        outputs: [{ cargo: 'STEEL', stock: 90, capacity: 100 }], lastServedTime: g - 10 * DAY },
      { id: 202, name: 'Kopalnia Wieliczka', type: 'coal_mine', level: 1, maxLevel: 5, closureTime: null, upgradeProgress: 0, inputs: [], outputs: [{ cargo: 'COAL', stock: 30, capacity: 200 }], lastServedTime: null },
    ];
    const towns: Town[] = [
      { id: 301, name: 'Ełk', population: 4200 + step * 10, developmentActive: true, noise: 41, pollution: 3, lastServedTime: g - DAY,
        needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied: 35 }, { district: 'INDUSTRIAL', cargo: 'TOOLS', demand: 50, supplied: 0 }] },
      { id: 302, name: 'Suwałki', population: 2600, developmentActive: true, noise: 30, pollution: 1, lastServedTime: null, needs: [] },
    ];
    const stops: Stop[] = [
      { id: 101, name: 'Dworzec Główny', waiting: [{ cargo: 'passengers', count: 640, bad: 300 }], veryBad: false },
      { id: 103, name: 'Ełk Rynek', waiting: [{ cargo: 'passengers', count: 12, bad: 0 }], veryBad: false },
    ];
    emit(g, { section: 'lines', data: lines });
    emit(g, { section: 'vehicles', data: vehicles });
    emit(g, { section: 'industries', data: industries });
    emit(g, { section: 'towns', data: towns });
    emit(g, { section: 'stops', data: stops });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = fileURLToPath(new URL('../fixtures/demo.log', import.meta.url));
  writeFileSync(target, makeDemoLog().join('\n') + '\n');
  console.log(`Zapisano ${target}`);
}
