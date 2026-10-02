import { describe, expect, it } from 'vitest';
import { maxLifespanUsage, partLifespanUsage, reserveMonths, vehicleAgeMs, vehicleCondition } from '../src/derive';
import { finance, vehicle } from './builders';

describe('derive', () => {
  it('wykorzystanie żywotności: lifespan w sekundach gry', () => {
    expect(partLifespanUsage({ model: 'a', purchaseTime: 0, lifespanSec: 29220, maintenanceState: 1 }, 29_220_000)).toBe(1);
    expect(partLifespanUsage({ model: 'a', purchaseTime: 0, lifespanSec: 0, maintenanceState: 1 }, 5)).toBeNull();
  });
  it('wiek i stan pojazdu wg najstarszej / najgorszej części', () => {
    const v = vehicle({ parts: [
      { model: 'loco', purchaseTime: 1000, lifespanSec: 10, maintenanceState: 0.4 },
      { model: 'wagon', purchaseTime: 5000, lifespanSec: 1, maintenanceState: 0.9 },
    ] });
    expect(vehicleAgeMs(v, 11_000)).toBe(10_000);
    expect(vehicleCondition(v)).toBe(0.4);
    expect(maxLifespanUsage(v, 11_000)).toBe(6);
  });
  it('pojazd bez części nie ma wieku ani stanu', () => {
    const v = vehicle({ parts: [] });
    expect(vehicleAgeMs(v, 1)).toBeNull();
    expect(vehicleCondition(v)).toBeNull();
    expect(maxLifespanUsage(v, 1)).toBeNull();
  });
  it('rezerwa w miesiącach kosztów bieżących', () => {
    expect(reserveMonths(finance({ balance: 300, runningCosts12m: 1200 }))).toBe(3);
    expect(reserveMonths(finance({ runningCosts12m: 0 }))).toBeNull();
  });
});
