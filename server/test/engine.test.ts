import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { AlertEngine, alertId, type Rule, type RuleContext } from '../src/alerts/engine';
import { RuleBuffers } from '../src/alerts/buffers';
import { DAY, meta, snapshot } from './builders';

const ctx = (gameTime: number): RuleContext => ({
  snap: { ...snapshot(), meta: meta({ gameTime }) },
  gameTime,
  dayMs: DAY,
  config: DEFAULT_ALERT_CONFIG,
  buffers: new RuleBuffers(),
});

const always: Rule = () => [{ type: 'vehicle-no-path', category: 'vehicles', severity: 'critical', entityType: 'vehicle', entityId: 7, title: 'T', detail: 'D' }];
const slow: Rule = () => [{ type: 'stalled-output', category: 'supply', severity: 'warn', entityType: 'industry', entityId: 3, subKey: 'STEEL', title: 'S', detail: 'D', minDurationMs: 10 * DAY }];
const info: Rule = () => [{ type: 'low-line-load', category: 'lines', severity: 'info', entityType: 'line', entityId: 1, title: 'I', detail: 'D' }];

describe('AlertEngine', () => {
  it('buduje stabilne id', () => {
    expect(alertId({ type: 'low-reserve', entityId: null })).toBe('low-reserve:company');
    expect(alertId({ type: 'missing-input', entityId: 5, subKey: 'COAL' })).toBe('missing-input:5:COAL');
  });

  it('pamięta firstSeenGameTime między ocenami', () => {
    const e = new AlertEngine([always]);
    expect(e.evaluate(ctx(100), [])[0].firstSeenGameTime).toBe(100);
    expect(e.evaluate(ctx(900), [])[0].firstSeenGameTime).toBe(100);
  });

  it('alert z minDurationMs pojawia się dopiero po upływie czasu', () => {
    const e = new AlertEngine([slow]);
    expect(e.evaluate(ctx(0), [])).toEqual([]);
    expect(e.evaluate(ctx(9 * DAY), [])).toEqual([]);
    expect(e.evaluate(ctx(10 * DAY), [])[0].id).toBe('stalled-output:3:STEEL');
  });

  it('zapomina warunek, który zniknął', () => {
    let on = true;
    const toggled: Rule = (c) => (on ? always(c) : []);
    const e = new AlertEngine([toggled]);
    e.evaluate(ctx(100), []);
    on = false;
    expect(e.evaluate(ctx(200), [])).toEqual([]);
    on = true;
    expect(e.evaluate(ctx(300), [])[0].firstSeenGameTime).toBe(300);
  });

  it('oznacza wyciszone: Ignorowanie zawsze, Odłożenie do czasu', () => {
    const e = new AlertEngine([always]);
    const ignore = { id: 1, saveId: 'save1', alertType: 'vehicle-no-path' as const, entityId: 7, kind: 'ignore' as const, untilGameTime: null };
    expect(e.evaluate(ctx(100), [ignore])[0].muted).toEqual({ kind: 'ignore', untilGameTime: null });
    const snooze = { ...ignore, kind: 'snooze' as const, untilGameTime: 500 };
    expect(e.evaluate(ctx(400), [snooze])[0].muted).toEqual({ kind: 'snooze', untilGameTime: 500 });
    expect(e.evaluate(ctx(500), [snooze])[0].muted).toBeNull();
  });

  it('sortuje: critical, warn, info', () => {
    const e = new AlertEngine([info, always]);
    expect(e.evaluate(ctx(1), []).map((a) => a.severity)).toEqual(['critical', 'info']);
  });

  it('reset zapomina historię warunków', () => {
    const e = new AlertEngine([always]);
    e.evaluate(ctx(100), []);
    e.reset();
    expect(e.evaluate(ctx(200), [])[0].firstSeenGameTime).toBe(200);
  });
});
