import type { Alert, Finance, GameDate, Line, Meta, Town, Vehicle } from '@tflive/shared';

export const RAMP_UP_DAYS = 180;
export const SERVED_DAYS = 365;

export function reserveMonths(f: Finance | null): number | null {
  if (!f || f.runningCosts12m <= 0) return null;
  return f.balance / (f.runningCosts12m / 12);
}

export function populationTotal(towns: Town[]): number {
  return towns.reduce((s, t) => s + t.population, 0);
}

export function bestVehicle(vs: Vehicle[]): Vehicle | null {
  let best: Vehicle | null = null;
  for (const v of vs) {
    if (v.operatingResult12m === null) continue;
    if (!best || v.operatingResult12m > (best.operatingResult12m ?? -Infinity)) best = v;
  }
  return best;
}

export function vehicleAgeYears(v: Vehicle, gameTime: number, dayMs: number): number | null {
  if (!v.parts.length || dayMs <= 0) return null;
  const oldest = Math.min(...v.parts.map((p) => p.purchaseTime));
  return (gameTime - oldest) / (365 * dayMs);
}

export function vehicleCondition(v: Vehicle): number | null {
  return v.parts.length ? Math.min(...v.parts.map((p) => p.maintenanceState)) : null;
}

export function lifespanUsage(v: Vehicle, gameTime: number): number | null {
  const xs = v.parts.filter((p) => p.lifespanSec > 0).map((p) => (gameTime - p.purchaseTime) / (p.lifespanSec * 1000));
  return xs.length ? Math.max(...xs) : null;
}

export function lineLoadNow(line: Line, vehicles: Vehicle[]): number | null {
  let load = 0;
  let cap = 0;
  for (const v of vehicles) {
    if (v.lineId !== line.id) continue;
    load += v.load;
    cap += v.capacity;
  }
  return cap > 0 ? load / cap : null;
}

export function isRampUp(line: Line, gameTime: number, dayMs: number): boolean {
  return line.firstLedgerTime !== null && gameTime - line.firstLedgerTime < RAMP_UP_DAYS * dayMs;
}

export function isServed(lastServedTime: number | null, gameTime: number, dayMs: number): boolean {
  return lastServedTime !== null && gameTime - lastServedTime <= SERVED_DAYS * dayMs;
}

export function gameDateAt(t: number, meta: Meta): GameDate {
  const daysBack = Math.floor(meta.gameTime / meta.dayMs) - Math.floor(t / meta.dayMs);
  const d = new Date(Date.UTC(meta.date.y, meta.date.m - 1, meta.date.d - daysBack));
  return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate() };
}

export function alertsFor(alerts: Alert[], entityType: Alert['entityType'], entityId: number): Alert[] {
  return alerts.filter((a) => a.entityType === entityType && a.entityId === entityId);
}
