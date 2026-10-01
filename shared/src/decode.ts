import { DISTRICTS, VEHICLE_STATES, type Backfill, type District, type Finance, type Industry, type Line, type MetaPayload, type MonthValue, type Stop, type Town, type Vehicle, type VehicleState } from './model';
import type { SectionName } from './wire';

export class DecodeError extends Error {}

export type DecodedSection =
  | { section: 'meta'; data: MetaPayload }
  | { section: 'finance'; data: Finance }
  | { section: 'lines'; data: Line[] }
  | { section: 'vehicles'; data: Vehicle[] }
  | { section: 'industries'; data: Industry[] }
  | { section: 'towns'; data: Town[] }
  | { section: 'stops'; data: Stop[] }
  | { section: 'backfill'; data: Backfill };

function num(v: unknown, f: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DecodeError(`${f}: oczekiwano liczby`);
  return v;
}
function nnum(v: unknown, f: string): number | null {
  return v === null ? null : num(v, f);
}
function str(v: unknown, f: string): string {
  if (typeof v !== 'string') throw new DecodeError(`${f}: oczekiwano tekstu`);
  return v;
}
function nstr(v: unknown, f: string): string | null {
  return v === null ? null : str(v, f);
}
function bool(v: unknown, f: string): boolean {
  if (v === 0 || v === false) return false;
  if (v === 1 || v === true) return true;
  throw new DecodeError(`${f}: oczekiwano 0/1`);
}
function arr(v: unknown, f: string, len?: number): unknown[] {
  if (!Array.isArray(v)) throw new DecodeError(`${f}: oczekiwano tablicy`);
  if (len !== undefined && v.length !== len) throw new DecodeError(`${f}: oczekiwano ${len} pól, jest ${v.length}`);
  return v;
}
function obj(v: unknown, f: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new DecodeError(`${f}: oczekiwano obiektu`);
  return v as Record<string, unknown>;
}
function months(v: unknown, f: string): MonthValue[] {
  return arr(v, f).map((r, i) => {
    const t = arr(r, `${f}[${i}]`, 2);
    return { month: num(t[0], `${f}.month`), value: num(t[1], `${f}.value`) };
  });
}
function state(v: unknown): VehicleState {
  const s = str(v, 'vehicle.state');
  if (!(VEHICLE_STATES as readonly string[]).includes(s)) throw new DecodeError(`vehicle.state: nieznany stan ${s}`);
  return s as VehicleState;
}
function district(v: unknown): District {
  const s = str(v, 'town.need.district');
  if (!(DISTRICTS as readonly string[]).includes(s)) throw new DecodeError(`town.need.district: nieznana dzielnica ${s}`);
  return s as District;
}

function line(r: unknown): Line {
  const t = arr(r, 'line', 10);
  return {
    id: num(t[0], 'line.id'),
    name: str(t[1], 'line.name'),
    mode: str(t[2], 'line.mode'),
    color: nstr(t[3], 'line.color'),
    stopIds: arr(t[4], 'line.stopIds').map((x) => num(x, 'line.stopId')),
    vehicleIds: arr(t[5], 'line.vehicleIds').map((x) => num(x, 'line.vehicleId')),
    firstLedgerTime: nnum(t[6], 'line.firstLedgerTime'),
    operatingResult12m: num(t[7], 'line.ops12'),
    investments12m: nnum(t[8], 'line.inv12'),
    departureLoads: arr(t[9], 'line.departureLoads').map((d) => {
      const x = arr(d, 'line.departureLoad', 4);
      return { stopIndex: num(x[0], 'dl.stopIndex'), load: num(x[1], 'dl.load'), capacity: num(x[2], 'dl.capacity'), time: num(x[3], 'dl.time') };
    }),
  };
}

function vehicle(r: unknown): Vehicle {
  const t = arr(r, 'vehicle', 13);
  return {
    id: num(t[0], 'vehicle.id'),
    name: str(t[1], 'vehicle.name'),
    lineId: nnum(t[2], 'vehicle.lineId'),
    mode: str(t[3], 'vehicle.mode'),
    state: state(t[4]),
    userStopped: bool(t[5], 'vehicle.userStopped'),
    noPath: bool(t[6], 'vehicle.noPath'),
    daysAtTerminal: num(t[7], 'vehicle.daysAtTerminal'),
    daysInDepot: num(t[8], 'vehicle.daysInDepot'),
    load: num(t[9], 'vehicle.load'),
    capacity: num(t[10], 'vehicle.capacity'),
    operatingResult12m: nnum(t[11], 'vehicle.ops12'),
    parts: arr(t[12], 'vehicle.parts').map((p) => {
      const x = arr(p, 'vehicle.part', 4);
      return { model: str(x[0], 'part.model'), purchaseTime: num(x[1], 'part.purchaseTime'), lifespanSec: num(x[2], 'part.lifespanSec'), maintenanceState: num(x[3], 'part.maintenanceState') };
    }),
  };
}

function industry(r: unknown): Industry {
  const t = arr(r, 'industry', 10);
  return {
    id: num(t[0], 'industry.id'),
    name: str(t[1], 'industry.name'),
    type: str(t[2], 'industry.type'),
    level: num(t[3], 'industry.level'),
    maxLevel: num(t[4], 'industry.maxLevel'),
    closureTime: nnum(t[5], 'industry.closure'),
    upgradeProgress: num(t[6], 'industry.upgrade'),
    inputs: arr(t[7], 'industry.inputs').map((i) => {
      const x = arr(i, 'industry.input', 3);
      return { cargo: str(x[0], 'input.cargo'), stock: num(x[1], 'input.stock'), lastReceivedTime: nnum(x[2], 'input.lastReceivedTime') };
    }),
    outputs: arr(t[8], 'industry.outputs').map((o) => {
      const x = arr(o, 'industry.output', 3);
      return { cargo: str(x[0], 'output.cargo'), stock: num(x[1], 'output.stock'), capacity: num(x[2], 'output.capacity') };
    }),
    lastServedTime: nnum(t[9], 'industry.lastServed'),
  };
}

function town(r: unknown): Town {
  const t = arr(r, 'town', 8);
  return {
    id: num(t[0], 'town.id'),
    name: str(t[1], 'town.name'),
    population: num(t[2], 'town.population'),
    developmentActive: bool(t[3], 'town.developmentActive'),
    noise: num(t[4], 'town.noise'),
    pollution: num(t[5], 'town.pollution'),
    needs: arr(t[6], 'town.needs').map((n) => {
      const x = arr(n, 'town.need', 4);
      return { district: district(x[0]), cargo: str(x[1], 'need.cargo'), demand: num(x[2], 'need.demand'), supplied: nnum(x[3], 'need.supplied') };
    }),
    lastServedTime: nnum(t[7], 'town.lastServed'),
  };
}

function stop(r: unknown): Stop {
  const t = arr(r, 'stop', 4);
  return {
    id: num(t[0], 'stop.id'),
    name: str(t[1], 'stop.name'),
    waiting: arr(t[2], 'stop.waiting').map((w) => {
      const x = arr(w, 'stop.waiting', 2);
      return { cargo: str(x[0], 'waiting.cargo'), count: num(x[1], 'waiting.count') };
    }),
    longestWaitStartTime: nnum(t[3], 'stop.longestWaitStart'),
  };
}

export function decodeSection(section: SectionName, payload: unknown): DecodedSection {
  switch (section) {
    case 'meta': {
      const o = obj(payload, 'meta');
      const d = arr(o.date, 'meta.date', 3);
      return {
        section,
        data: {
          date: { y: num(d[0], 'meta.date.y'), m: num(d[1], 'meta.date.m'), d: num(d[2], 'meta.date.d') },
          dayMs: num(o.dayMs, 'meta.dayMs'),
          paused: bool(o.paused, 'meta.paused'),
          speed: nnum(o.speed, 'meta.speed'),
          mapName: nstr(o.map, 'meta.map'),
          bytesWritten: num(o.bytes, 'meta.bytes'),
          errors: arr(o.errors, 'meta.errors').map((e) => str(e, 'meta.error')),
        },
      };
    }
    case 'finance': {
      const o = obj(payload, 'finance');
      return {
        section,
        data: {
          balance: num(o.bal, 'finance.bal'),
          loan: num(o.loan, 'finance.loan'),
          operatingResult12m: num(o.ops12, 'finance.ops12'),
          runningCosts12m: num(o.run12, 'finance.run12'),
          investments12m: nnum(o.inv12, 'finance.inv12'),
          operatingResultByMonth: months(o.opsM, 'finance.opsM'),
        },
      };
    }
    case 'lines': return { section, data: arr(payload, 'lines').map(line) };
    case 'vehicles': return { section, data: arr(payload, 'vehicles').map(vehicle) };
    case 'industries': return { section, data: arr(payload, 'industries').map(industry) };
    case 'towns': return { section, data: arr(payload, 'towns').map(town) };
    case 'stops': return { section, data: arr(payload, 'stops').map(stop) };
    case 'backfill': {
      const o = obj(payload, 'backfill');
      const scope = str(o.scope, 'backfill.scope');
      if (scope !== 'global' && scope !== 'line') throw new DecodeError(`backfill.scope: nieznany zakres ${scope}`);
      return { section, data: { scope, entityId: nnum(o.id, 'backfill.id'), months: months(o.months, 'backfill.months') } };
    }
  }
}
