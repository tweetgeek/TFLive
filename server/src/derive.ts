import type { Finance, Vehicle, VehiclePart } from '@tflive/shared';

export function partLifespanUsage(p: VehiclePart, gameTime: number): number | null {
  if (p.lifespanSec <= 0) return null;
  return (gameTime - p.purchaseTime) / (p.lifespanSec * 1000);
}

export function maxLifespanUsage(v: Vehicle, gameTime: number): number | null {
  const values = v.parts.map((p) => partLifespanUsage(p, gameTime)).filter((x): x is number => x !== null);
  return values.length ? Math.max(...values) : null;
}

export function vehicleAgeMs(v: Vehicle, gameTime: number): number | null {
  if (!v.parts.length) return null;
  return gameTime - Math.min(...v.parts.map((p) => p.purchaseTime));
}

export function vehicleCondition(v: Vehicle): number | null {
  if (!v.parts.length) return null;
  return Math.min(...v.parts.map((p) => p.maintenanceState));
}

export function reserveMonths(f: Finance): number | null {
  if (f.runningCosts12m <= 0) return null;
  return f.balance / (f.runningCosts12m / 12);
}
