import { describe, expect, it } from 'vitest';
import { alertsFor, bestVehicle, gameDateAt, isRampUp, isServed, lifespanUsage, lineLoadNow, populationTotal, reserveMonths, vehicleAgeYears, vehicleCondition } from '../src/lib/derive';
import { fixtureState } from './fixture';

const s = fixtureState();
const sn = s.snapshot;
const meta = sn.meta!;

describe('derive', () => {
  it('Rezerwa w miesiącach Kosztów bieżących', () => {
    expect(reserveMonths(sn.finance)).toBeCloseTo(2263578 / (3218127 / 12), 5);
    expect(reserveMonths(null)).toBeNull();
    expect(reserveMonths({ ...sn.finance!, runningCosts12m: 0 })).toBeNull();
  });
  it('ludność, najlepszy pojazd', () => {
    expect(populationTotal(sn.towns)).toBe(806);
    expect(bestVehicle(sn.vehicles)?.name).toBe('Pociąg 2');
    expect(bestVehicle([])).toBeNull();
  });
  it('wiek, stan i wykorzystanie żywotności pojazdu', () => {
    const v = sn.vehicles[0];
    expect(vehicleAgeYears(v, meta.gameTime, meta.dayMs)).toBeCloseTo((meta.gameTime - 2241600) / (365 * 4000), 5);
    expect(vehicleCondition(v)).toBe(0.686);
    expect(lifespanUsage(sn.vehicles[1], meta.gameTime)).toBeGreaterThan(1);
    expect(vehicleAgeYears(sn.vehicles[2], meta.gameTime, meta.dayMs)).toBeNull();
    expect(vehicleCondition(sn.vehicles[2])).toBeNull();
  });
  it('obłożenie linii teraz', () => {
    expect(lineLoadNow(sn.lines[0], sn.vehicles)).toBe(1);
    expect(lineLoadNow(sn.lines[2], sn.vehicles)).toBeCloseTo(4 / 60, 5);
    expect(lineLoadNow(sn.lines[1], sn.vehicles)).toBeNull();
  });
  it('Rozruch i obsługa', () => {
    expect(isRampUp(sn.lines[2], meta.gameTime, meta.dayMs)).toBe(true);
    expect(isRampUp(sn.lines[0], meta.gameTime, meta.dayMs)).toBe(false);
    expect(isRampUp(sn.lines[1], meta.gameTime, meta.dayMs)).toBe(false);
    expect(isServed(sn.industries[0].lastServedTime, meta.gameTime, meta.dayMs)).toBe(true);
    expect(isServed(null, meta.gameTime, meta.dayMs)).toBe(false);
  });
  it('data gry dla czasu wstecz', () => {
    expect(gameDateAt(meta.gameTime - 26 * 4000, meta)).toEqual({ y: 1906, m: 12, d: 31 });
    expect(gameDateAt(meta.gameTime, meta)).toEqual({ y: 1907, m: 1, d: 26 });
  });
  it('alerty encji', () => {
    expect(alertsFor(s.alerts, 'line', 60555).map((a) => a.type)).toEqual(['unprofitable-line']);
  });
});
