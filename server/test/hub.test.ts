import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { Hub } from '../src/hub';
import { DAY, metaLine, sectionLines, vehicle } from './builders';

function makeHub() {
  let wall = 1_000_000;
  const history = new HistoryStore(':memory:');
  const hub = new Hub({ history, config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: '/x/stdout.txt', now: () => wall });
  return { hub, history, tick: (ms: number) => (wall += ms) };
}
const read = (lines: string[], reset = false) => ({ lines, reset, missing: false });
const d = (y: number, m: number, day = 1) => ({ y, m, d: day });

describe('Hub', () => {
  it('składa stan z linii logu i liczy alerty', () => {
    const { hub } = makeHub();
    hub.ingest(read([
      metaLine({ gameTime: 100 * DAY, date: d(1900, 4) }),
      ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 100 * DAY }),
    ]));
    const s = hub.state();
    expect(s.snapshot.vehicles[0].id).toBe(5);
    expect(s.alerts.map((a) => a.id)).toContain('vehicle-no-path:5');
    expect(s.status).toMatchObject({ logState: 'ok', live: true, saveId: 'save1' });
  });

  it('emituje update tylko, gdy coś się zmieniło', () => {
    const { hub } = makeHub();
    let n = 0;
    hub.on('update', () => n++);
    hub.ingest(read(['zwykła linia gry']));
    expect(n).toBe(0);
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    expect(n).toBe(1);
  });

  it('status live wygasa po staleMs', () => {
    const { hub, tick } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    tick(16_000);
    expect(hub.status().live).toBe(false);
  });

  it('zapisuje miesiąc w Historii przy nowym miesiącu', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) })]));
    expect(history.readGlobal('save1').map((r) => r.month)).toEqual([1900 * 12, 1900 * 12 + 1]);
  });

  it('druga Rozgrywka w tym samym logu: osobny stan i alerty', () => {
    const { hub } = makeHub();
    hub.ingest(read([
      metaLine({ gameTime: 4000, date: d(1900, 1, 2) }),
      ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 4000 }),
    ]));
    hub.ingest(read([metaLine({ saveId: 'save2', gameTime: 8000, date: d(1950, 1, 2) })]));
    const s = hub.state();
    expect(s.snapshot.vehicles).toEqual([]);
    expect(s.alerts).toEqual([]);
    expect(s.status.saveId).toBe('save2');
  });

  it('Cofnięcie obcina Historię, zachowuje Wyciszenia', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) })]));
    hub.ingest(read([metaLine({ seq: 3, gameTime: 260_000, date: d(1900, 3, 5) })]));
    hub.addMute({ alertType: 'vehicle-old', entityId: 1, kind: 'ignore' });
    hub.ingest(read([metaLine({ seq: 4, gameTime: 8000, date: d(1900, 1, 3) })]));
    expect(history.readGlobal('save1').map((r) => r.month)).toEqual([1900 * 12]);
    expect(hub.mutes()).toHaveLength(1);
  });

  it('Wyciszenie oznacza alert jako wyciszony; Odłożenie domyślnie +3 miesiące', () => {
    const { hub } = makeHub();
    hub.ingest(read([
      metaLine({ gameTime: 100 * DAY, date: d(1900, 4) }),
      ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 100 * DAY }),
    ]));
    const m = hub.addMute({ alertType: 'vehicle-no-path', entityId: 5, kind: 'snooze' });
    expect(m.untilGameTime).toBe(100 * DAY + 90 * DAY);
    expect(hub.state().alerts[0].muted).toEqual({ kind: 'snooze', untilGameTime: 190 * DAY });
    expect(hub.removeMute(m.id)).toBe(true);
    expect(hub.state().alerts[0].muted).toBeNull();
  });

  it('addMute bez Rozgrywki rzuca błąd', () => {
    const { hub } = makeHub();
    expect(() => hub.addMute({ alertType: 'low-reserve', entityId: null, kind: 'ignore' })).toThrow(/Rozgrywki/);
  });

  it('reset logu (restart gry) czyści stan bieżący', () => {
    const { hub } = makeHub();
    hub.ingest(read([...sectionLines('vehicles', [vehicle()], { seq: 1, gameTime: 4000 })]));
    hub.ingest(read([], true));
    expect(hub.state().snapshot.vehicles).toEqual([]);
    expect(hub.status().saveId).toBeNull();
  });

  it('liczy MB/h z bytesWritten po minucie', () => {
    const { hub, tick } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2), bytes: 0 })]));
    tick(30_000);
    hub.ingest(read([metaLine({ seq: 2, gameTime: 8000, date: d(1900, 1, 3), bytes: 1_000_000 })]));
    expect(hub.status().diskMBPerHour).toBeNull();
    tick(30_000);
    hub.ingest(read([metaLine({ seq: 3, gameTime: 12000, date: d(1900, 1, 4), bytes: 2_000_000 })]));
    expect(hub.status().diskMBPerHour).toBeCloseTo(120, 5);
  });

  it('zgłasza brak logu i ostatni błąd dekodowania', () => {
    const { hub } = makeHub();
    hub.ingest({ lines: [], reset: false, missing: true });
    expect(hub.status().logState).toBe('missing');
    hub.ingest(read(['[x]  [TFLIVE] 1 save1 s 1 1 stops 1/1 [[1]]']));
    expect(hub.status().lastError).toMatch(/stop/);
  });
});
