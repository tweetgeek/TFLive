import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { Hub } from '../src/hub';
import { makeDemoLog } from '../scripts/make-demo-log';

describe('dane demo', () => {
  it('przechodzą przez Hub bez błędów i wywołują alerty każdej kategorii', () => {
    const hub = new Hub({ history: new HistoryStore(':memory:'), config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: 'demo' });
    hub.ingest({ lines: makeDemoLog(), reset: false, missing: false });
    const s = hub.state();
    expect(s.status.lastError).toBeNull();
    expect(s.snapshot.vehicles.length).toBeGreaterThanOrEqual(8);
    const cats = new Set(s.alerts.map((a) => a.category));
    expect([...cats].sort()).toEqual(['finance', 'lines', 'supply', 'towns', 'vehicles']);
  });
});
