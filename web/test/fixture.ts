import { emptySnapshot, type Alert, type Industry, type Line, type Stop, type Town, type Vehicle } from '@tflive/shared';
import type { HubState } from '../src/state/types';

const DAY = 4000;
const NOW = 10324200;

const lines: Line[] = [
  { id: 60555, name: 'TC - Drewno,Deski - Uxbridge-Preesall IC', mode: 'RAIL', color: '#ffb266', stopIds: [49496, 60416], vehicleIds: [51559], firstLedgerTime: 4748250, operatingResult12m: -34126, investments12m: null, departureLoads: [], operatingResultByMonth: [{ month: 22882, value: -1600 }, { month: 22883, value: -1584 }, { month: 22884, value: 2168 }] },
  { id: 55014, name: 'WP - Pasażerski - Uxbridge LO', mode: 'WATER', color: null, stopIds: [], vehicleIds: [], firstLedgerTime: null, operatingResult12m: 0, investments12m: null, departureLoads: [], operatingResultByMonth: [] },
  { id: 56357, name: 'Bus - Pasażerski - Eccles LO', mode: 'ROAD', color: '#66b2ff', stopIds: [50210], vehicleIds: [52001, 52002], firstLedgerTime: NOW - 30 * DAY, operatingResult12m: -5463, investments12m: null, departureLoads: [], operatingResultByMonth: [] },
];
const part = (purchaseTime: number, lifespanSec: number, maintenanceState: number) => ({ model: 'mogul_2_6_0', purchaseTime, lifespanSec, maintenanceState });
const vehicles: Vehicle[] = [
  { id: 51559, name: 'Pociąg 2', lineId: 60555, mode: 'RAIL', state: 'EN_ROUTE', userStopped: false, noPath: false, daysAtTerminal: 0, daysInDepot: 0, load: 32, capacity: 32, operatingResult12m: 580475, parts: [part(2241600, 29220, 0.686)] },
  { id: 52001, name: 'Autobus 1', lineId: 56357, mode: 'ROAD', state: 'AT_TERMINAL', userStopped: false, noPath: true, daysAtTerminal: 34, daysInDepot: 0, load: 4, capacity: 30, operatingResult12m: -2000, parts: [part(100000, 1000, 0.44)] },
  { id: 52002, name: 'Autobus 2', lineId: 56357, mode: 'ROAD', state: 'IN_DEPOT', userStopped: true, noPath: false, daysAtTerminal: 0, daysInDepot: 41, load: 0, capacity: 30, operatingResult12m: null, parts: [] },
];
const stops: Stop[] = [
  { id: 49496, name: 'Dworzec Uxbridge Południe', waiting: [{ cargo: 'passengers', count: 36, bad: 0 }], veryBad: false },
  { id: 60416, name: 'Dworzec Preesall', waiting: [], veryBad: false },
  { id: 50210, name: 'Kings Road', waiting: [{ cargo: 'passengers', count: 11, bad: 0 }], veryBad: false },
];
const industries: Industry[] = [
  { id: 61423, name: 'Brentford Platforma wiertnicza Północ', type: 'oil_platform', level: 5, maxLevel: 7, closureTime: NOW + 45 * DAY, upgradeProgress: 0, inputs: [{ cargo: 'machines', stock: 0, lastReceivedTime: null }], outputs: [{ cargo: 'crude_oil', stock: 168, capacity: 400 }], lastServedTime: NOW - 20 * DAY },
  { id: 61500, name: 'Eccles Poręba', type: 'forest', level: 2, maxLevel: 5, closureTime: null, upgradeProgress: 0, inputs: [], outputs: [{ cargo: 'logs', stock: 200, capacity: 200 }], lastServedTime: NOW - 10 * DAY },
  { id: 61600, name: 'Kopalnia nieobsługiwana', type: 'coal_mine', level: 1, maxLevel: 4, closureTime: null, upgradeProgress: 0, inputs: [], outputs: [{ cargo: 'coal', stock: 10, capacity: 400 }], lastServedTime: null },
];
const towns: Town[] = [
  { id: 30171, name: 'Brentford', population: 214, developmentActive: true, noise: 64.02, pollution: 1894, needs: [{ district: 'COMMERCIAL', cargo: 'vegetables', demand: 99, supplied: 0 }, { district: 'INDUSTRIAL', cargo: 'planks', demand: 80, supplied: null }], lastServedTime: NOW - 5 * DAY },
  { id: 30200, name: 'Uxbridge', population: 512, developmentActive: true, noise: 58.5, pollution: 900, needs: [{ district: 'INDUSTRIAL', cargo: 'planks', demand: 100, supplied: 18 }], lastServedTime: NOW - DAY },
  { id: 30300, name: 'Wioska', population: 80, developmentActive: true, noise: 30, pollution: 10, needs: [], lastServedTime: null },
];
const alerts: Alert[] = [
  { id: 'unprofitable-line:60555', type: 'unprofitable-line', category: 'lines', severity: 'warn', entityType: 'line', entityId: 60555, title: 'Nierentowna linia: TC - Drewno,Deski - Uxbridge-Preesall IC', detail: 'Wynik operacyjny (12 mies.): −34 126', firstSeenGameTime: NOW - 90 * DAY, muted: null },
  { id: 'vehicle-no-path:52001', type: 'vehicle-no-path', category: 'vehicles', severity: 'critical', entityType: 'vehicle', entityId: 52001, title: 'Pojazd bez trasy: Autobus 1', detail: 'Gra nie potrafi wyznaczyć drogi do następnego celu', firstSeenGameTime: NOW - 2 * DAY, muted: null },
  { id: 'stalled-output:61500:logs', type: 'stalled-output', category: 'supply', severity: 'warn', entityType: 'industry', entityId: 61500, title: 'Eccles Poręba: Zalegająca produkcja', detail: 'logs: magazyn 100%', firstSeenGameTime: NOW - 40 * DAY, muted: null },
  { id: 'supply-drop:30200:INDUSTRIAL:planks', type: 'supply-drop', category: 'towns', severity: 'warn', entityType: 'town', entityId: 30200, title: 'Spadek dostaw: Uxbridge', detail: 'planks: 18% potrzeby', firstSeenGameTime: NOW - 10 * DAY, muted: null },
  { id: 'line-without-vehicles:55014', type: 'line-without-vehicles', category: 'lines', severity: 'warn', entityType: 'line', entityId: 55014, title: 'Linia bez pojazdów: WP - Pasażerski - Uxbridge LO', detail: 'Do Linii nie jest przypisany żaden Pojazd', firstSeenGameTime: NOW - 5 * DAY, muted: null },
  { id: 'low-line-load:56357', type: 'low-line-load', category: 'lines', severity: 'info', entityType: 'line', entityId: 56357, title: 'Niskie obłożenie: Bus - Pasażerski - Eccles LO', detail: 'Obłożenie linii: 13% — rozważ mniej Pojazdów', firstSeenGameTime: NOW - 60 * DAY, muted: { kind: 'snooze', untilGameTime: NOW + 90 * DAY } },
];

export function fixtureState(): HubState {
  return {
    snapshot: {
      meta: { saveId: '1eb85cfc5a7483aa', sessionId: '42a63a0061cd2dff', gameTime: NOW, date: { y: 1907, m: 1, d: 26 }, dayMs: DAY, paused: false, speed: 1, mapName: 'MnicH Transport', bytesWritten: 26728, errors: [] },
      finance: { balance: 2263578, loan: 14908337, operatingResult12m: 2715326, runningCosts12m: 3218127, investments12m: null, operatingResultByMonth: [{ month: 22882, value: -111174 }, { month: 22883, value: -201446 }, { month: 22884, value: 488573 }] },
      lines, vehicles, industries, towns, stops,
    },
    alerts,
    status: { logPath: '/x/stdout.txt', logState: 'ok', live: true, lastLineWallMs: 1, paused: false, diskMBPerHour: 1.02, saveId: '1eb85cfc5a7483aa', lastError: null },
  };
}

export function emptyState(): HubState {
  return {
    snapshot: emptySnapshot(),
    alerts: [],
    status: { logPath: null, logState: 'missing', live: false, lastLineWallMs: null, paused: null, diskMBPerHour: null, saveId: null, lastError: null },
  };
}
