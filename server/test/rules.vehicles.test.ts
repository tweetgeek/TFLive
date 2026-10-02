import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import type { RuleContext } from '../src/alerts/engine';
import { vehicleIdle, vehicleLowCondition, vehicleNoPath, vehicleOld, vehicleWaiting } from '../src/alerts/vehicles';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { DAY, meta, snapshot, vehicle } from './builders';

function ctx(vehicles: ReturnType<typeof vehicle>[], gameTime = 1000 * DAY): RuleContext {
  return { snap: { ...snapshot({ vehicles }), meta: meta({ gameTime }) }, gameTime, dayMs: DAY, config: DEFAULT_ALERT_CONFIG, buffers: new RuleBuffers() };
}

describe('reguły pojazdów', () => {
  it('Pojazd bez trasy: critical', () => {
    expect(vehicleNoPath(ctx([vehicle({ noPath: true })]))[0]).toMatchObject({ type: 'vehicle-no-path', severity: 'critical', entityId: 1 });
    expect(vehicleNoPath(ctx([vehicle()]))).toEqual([]);
  });

  it('Pojazd czekający: > 30 dni na przystanku', () => {
    expect(vehicleWaiting(ctx([vehicle({ daysAtTerminal: 31 })]))).toHaveLength(1);
    expect(vehicleWaiting(ctx([vehicle({ daysAtTerminal: 30 })]))).toEqual([]);
  });

  it('Bezczynny pojazd: w zajezdni > 30 dni albo bez linii (z minDuration)', () => {
    expect(vehicleIdle(ctx([vehicle({ daysInDepot: 31 })]))[0].minDurationMs).toBeUndefined();
    expect(vehicleIdle(ctx([vehicle({ lineId: null })]))[0].minDurationMs).toBe(30 * DAY);
    expect(vehicleIdle(ctx([vehicle()]))).toEqual([]);
  });

  it('Pojazd zatrzymany przez gracza nie jest czekający ani bezczynny', () => {
    const v = vehicle({ userStopped: true, daysAtTerminal: 99, daysInDepot: 99, lineId: null });
    expect(vehicleWaiting(ctx([v]))).toEqual([]);
    expect(vehicleIdle(ctx([v]))).toEqual([]);
  });

  it('Stary pojazd: dowolna część ≥ 100% żywotności', () => {
    const parts = [{ model: 'a', purchaseTime: 0, lifespanSec: 1000, maintenanceState: 1 }];
    expect(vehicleOld(ctx([vehicle({ parts })], 1_000_000))).toHaveLength(1);
    expect(vehicleOld(ctx([vehicle({ parts })], 999_999))).toEqual([]);
  });

  it('Niski stan pojazdu: < 50%', () => {
    const parts = [{ model: 'a', purchaseTime: 0, lifespanSec: 1e9, maintenanceState: 0.49 }];
    expect(vehicleLowCondition(ctx([vehicle({ parts })]))).toHaveLength(1);
    expect(vehicleLowCondition(ctx([vehicle({ parts: [] })]))).toEqual([]);
  });
});
