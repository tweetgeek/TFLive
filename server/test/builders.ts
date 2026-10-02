import { encodeSection, formatLine, parseLine, type DecodedSection, type Finance, type GameDate, type Industry, type Line, type Meta, type ParsedLine, type SectionName, type Snapshot, type Stop, type Town, type Vehicle } from '@tflive/shared';

export const PREFIX = '[2026-10-01 18:05:54Z - MESSAGE  - Sim Pool 2       - Main           ]  ';
export const DAY = 4000;

export function metaLine(o: { saveId?: string; sessionId?: string; seq?: number; gameTime: number; date: GameDate; dayMs?: number; paused?: boolean; bytes?: number }): string {
  const data = { date: o.date, dayMs: o.dayMs ?? DAY, paused: o.paused ?? false, speed: 1, mapName: 'Test', bytesWritten: o.bytes ?? 0, errors: [] };
  return PREFIX + formatLine({ saveId: o.saveId ?? 'save1', sessionId: o.sessionId ?? 'sess1', seq: o.seq ?? 1, gameTime: o.gameTime, section: 'meta', part: 1, parts: 1 }, encodeSection({ section: 'meta', data }));
}

export function sectionLines(section: SectionName, data: unknown, o: { saveId?: string; sessionId?: string; seq: number; gameTime: number; parts?: number }): string[] {
  const encoded = encodeSection({ section, data } as DecodedSection);
  const parts = o.parts ?? 1;
  const rows = Array.isArray(encoded) ? encoded : null;
  const header = (part: number) => ({ saveId: o.saveId ?? 'save1', sessionId: o.sessionId ?? 'sess1', seq: o.seq, gameTime: o.gameTime, section, part, parts });
  if (!rows || parts === 1) return [PREFIX + formatLine(header(1), encoded)];
  const size = Math.ceil(rows.length / parts);
  return Array.from({ length: parts }, (_, i) => PREFIX + formatLine(header(i + 1), rows.slice(i * size, (i + 1) * size)));
}

export function parsed(raw: string): ParsedLine {
  const r = parseLine(raw);
  if (!r.ok) throw new Error(`parseLine: ${r.reason} for ${raw}`);
  return r.line;
}

export function vehicle(p: Partial<Vehicle> = {}): Vehicle {
  return { id: 1, name: 'Pojazd 1', lineId: 10, mode: 'ROAD', state: 'EN_ROUTE', userStopped: false, noPath: false, daysAtTerminal: 0, daysInDepot: 0, load: 10, capacity: 40, operatingResult12m: 1000, parts: [{ model: 'bus_a', purchaseTime: 0, lifespanSec: 29220, maintenanceState: 0.9 }], ...p };
}
export function line(p: Partial<Line> = {}): Line {
  return { id: 10, name: 'Linia 10', mode: 'ROAD', color: null, stopIds: [100, 101], vehicleIds: [1], firstLedgerTime: 0, operatingResult12m: 5000, investments12m: null, departureLoads: [], operatingResultByMonth: [], ...p };
}
export function industry(p: Partial<Industry> = {}): Industry {
  return { id: 20, name: 'Huta', type: 'steel_mill', level: 1, maxLevel: 7, closureTime: null, upgradeProgress: 0, inputs: [{ cargo: 'COAL', stock: 5, lastReceivedTime: null }], outputs: [{ cargo: 'STEEL', stock: 0, capacity: 100 }], lastServedTime: null, ...p };
}
export function town(p: Partial<Town> = {}): Town {
  return { id: 30, name: 'Ełk', population: 1000, developmentActive: true, noise: 0, pollution: 0, needs: [], lastServedTime: null, ...p };
}
export function stop(p: Partial<Stop> = {}): Stop {
  return { id: 100, name: 'Dworzec', waiting: [], veryBad: false, ...p };
}
export function finance(p: Partial<Finance> = {}): Finance {
  return { balance: 1_000_000, loan: 0, operatingResult12m: 120_000, runningCosts12m: 120_000, investments12m: null, operatingResultByMonth: [], ...p };
}
export function meta(p: Partial<Meta> = {}): Meta {
  return { saveId: 'save1', sessionId: 'sess1', gameTime: 1000 * DAY, date: { y: 1902, m: 9, d: 28 }, dayMs: DAY, paused: false, speed: 1, mapName: 'Test', bytesWritten: 0, errors: [], ...p };
}
export function snapshot(p: Partial<Snapshot> = {}): Snapshot {
  return { meta: meta(), finance: null, lines: [], vehicles: [], industries: [], towns: [], stops: [], ...p };
}
