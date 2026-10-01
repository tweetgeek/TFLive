import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { Hub } from '../src/hub';
import { DAY, finance, industry, line, metaLine, sectionLines, town, vehicle } from './builders';

function makeHub() {
  let wall = 1_000_000;
  const history = new HistoryStore(':memory:');
  const hub = new Hub({ history, config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: '/x/stdout.txt', now: () => wall });
  return { hub, history, tick: (ms: number) => (wall += ms) };
}
const read = (lines: string[], reset = false) => ({ lines, reset, missing: false });
const sections = (seq: number, gameTime: number, balance = 1_000_000) => [
  ...sectionLines('finance', finance({ balance }), { seq, gameTime }),
  ...sectionLines('lines', [], { seq, gameTime }),
  ...sectionLines('vehicles', [], { seq, gameTime }),
  ...sectionLines('towns', [], { seq, gameTime }),
  ...sectionLines('industries', [], { seq, gameTime }),
];
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
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) }), ...sections(1, 4000)]));
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) }), ...sections(2, 140_000)]));
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
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) }), ...sections(1, 4000)]));
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) }), ...sections(2, 140_000)]));
    hub.ingest(read([metaLine({ seq: 3, gameTime: 260_000, date: d(1900, 3, 5) }), ...sections(3, 260_000)]));
    hub.addMute({ alertType: 'vehicle-old', entityId: 1, kind: 'ignore' });
    hub.ingest(read([metaLine({ seq: 4, gameTime: 8000, date: d(1900, 1, 3) }), ...sections(4, 8000)]));
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

  it('Cofnięcie nie zeruje wiersza miesiąca; sekcje go aktualizują', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) }), ...sections(1, 4000, 555)]));
    expect(history.readGlobal('save1')[0].balance).toBe(555);
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) }), ...sections(2, 140_000, 600)]));
    hub.ingest(read([metaLine({ seq: 3, gameTime: 8000, date: d(1900, 1, 3) })]));
    expect(history.readGlobal('save1')).toMatchObject([{ month: 1900 * 12, balance: 555 }]);
    hub.ingest(read(sections(4, 8000, 777)));
    expect(history.readGlobal('save1')[0].balance).toBe(777);
  });

  it('nie zapisuje miesiąca, dopóki nie dotrą wszystkie sekcje', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    expect(history.readGlobal('save1')).toEqual([]);
    hub.ingest(read(sections(1, 4000, 321)));
    expect(history.readGlobal('save1')).toMatchObject([{ month: 1900 * 12, balance: 321 }]);
  });

  it('I3: jedna partia z 5 miesiącami daje 5 wierszy Historii', () => {
    const { hub, history } = makeHub();
    const batch: string[] = [];
    for (let i = 0; i < 5; i++) {
      const gt = 4000 + i * 30 * DAY;
      batch.push(metaLine({ seq: i * 10 + 1, gameTime: gt, date: d(1900, i + 1, 2) }), ...sections(i * 10 + 2, gt, 1000 + i));
    }
    hub.ingest(read(batch));
    expect(history.readGlobal('save1').map((r) => [r.month, r.balance])).toEqual([0, 1, 2, 3, 4].map((i) => [1900 * 12 + i, 1000 + i]));
  });

  it('I2: brak sekcji towns nie blokuje zapisu metrics_global i metrics_line', () => {
    const { hub, history } = makeHub();
    const noTowns = (seq: number, gt: number) => [
      ...sectionLines('finance', finance({ balance: seq }), { seq, gameTime: gt }),
      ...sectionLines('lines', [line({ id: 10 })], { seq, gameTime: gt }),
      ...sectionLines('vehicles', [vehicle()], { seq, gameTime: gt }),
      ...sectionLines('industries', [industry()], { seq, gameTime: gt }),
    ];
    hub.ingest(read([metaLine({ seq: 1, gameTime: 4000, date: d(1900, 1, 2) }), ...noTowns(2, 4000)]));
    hub.ingest(read([metaLine({ seq: 3, gameTime: 4000 + 30 * DAY, date: d(1900, 2, 2) }), ...noTowns(4, 4000 + 30 * DAY)]));
    hub.ingest(read([metaLine({ seq: 5, gameTime: 4000 + 60 * DAY, date: d(1900, 3, 2) })]));
    expect(history.readGlobal('save1').map((r) => [r.month, r.balance, r.vehicles, r.lines])).toEqual([[1900 * 12, 2, 1, 1], [1900 * 12 + 1, 4, 1, 1]]);
    expect(history.readLines('save1', 10).map((r) => r.month)).toEqual([1900 * 12, 1900 * 12 + 1]);
    expect(history.readTowns('save1')).toEqual([]);
  });

  it('I2: tabela miast zapisywana, gdy towns dotarły, nawet bez finance', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ seq: 1, gameTime: 4000, date: d(1900, 1, 2) }), ...sectionLines('towns', [town({ id: 30, population: 700 })], { seq: 2, gameTime: 4000 })]));
    hub.ingest(read([metaLine({ seq: 3, gameTime: 4000 + 30 * DAY, date: d(1900, 2, 2) })]));
    expect(history.readTowns('save1')).toEqual([{ month: 1900 * 12, townId: 30, population: 700 }]);
    expect(history.readGlobal('save1')).toEqual([]);
  });

  it('bufory obserwują każdą zastosowaną linię, nie raz na partię (Obłożenie w Historii)', () => {
    const { hub, history } = makeHub();
    const dep = (load: number, time: number) => [line({ id: 10, departureLoads: [{ stopIndex: 0, load, capacity: 40, time }] })];
    hub.ingest(read([
      metaLine({ seq: 1, gameTime: 4000, date: d(1900, 1, 2) }),
      ...sectionLines('lines', dep(10, 1000), { seq: 2, gameTime: 4000 }),
      ...sectionLines('lines', dep(30, 2000), { seq: 3, gameTime: 4000 }),
      metaLine({ seq: 4, gameTime: 4000 + 30 * DAY, date: d(1900, 2, 2) }),
    ]));
    expect(history.readLines('save1', 10)).toMatchObject([{ month: 1900 * 12, loadRatio: 0.5 }]);
  });

  const playMonths = (hub: Hub, saveId: string, from: number, to: number, sessionId = 'sess1') => {
    for (let m = from; m <= to; m++) {
      const gt = 4000 + (m - 1) * 30 * DAY;
      hub.ingest(read([
        metaLine({ saveId, sessionId, seq: m * 10, gameTime: gt, date: d(1900, m, 2) }),
        ...sections(m * 10 + 1, gt).map((l) => l.replace(' save1 ', ` ${saveId} `).replace(' sess1 ', ` ${sessionId} `)),
      ]));
    }
  };
  const months = (history: HistoryStore, saveId: string) => history.readGlobal(saveId).map((r) => r.month - 1900 * 12 + 1);

  it('I1: Cofnięcie po restarcie gry (nowy log) obcina Historię', () => {
    const { hub, history } = makeHub();
    playMonths(hub, 'save1', 1, 5);
    expect(months(history, 'save1')).toEqual([1, 2, 3, 4, 5]);
    hub.ingest(read([metaLine({ sessionId: 'sess2', seq: 1, gameTime: 4000 + 30 * DAY, date: d(1900, 2, 2) })], true));
    expect(months(history, 'save1')).toEqual([1, 2]);
  });

  it('I1: restart bez cofnięcia czasu nie obcina Historii', () => {
    const { hub, history } = makeHub();
    playMonths(hub, 'save1', 1, 3);
    hub.ingest(read([metaLine({ sessionId: 'sess2', seq: 1, gameTime: 4000 + 60 * DAY, date: d(1900, 3, 2) })], true));
    expect(months(history, 'save1')).toEqual([1, 2, 3]);
  });

  it('I1: A → B → starszy zapis A obcina Historię A, B nietknięta, Wyciszenia zostają', () => {
    const { hub, history } = makeHub();
    playMonths(hub, 'saveA', 1, 4, 'sA');
    hub.addMute({ alertType: 'vehicle-old', entityId: 1, kind: 'ignore' });
    playMonths(hub, 'saveB', 1, 3, 'sB');
    hub.ingest(read([metaLine({ saveId: 'saveA', sessionId: 'sA2', seq: 1, gameTime: 4000, date: d(1900, 1, 2) })]));
    expect(months(history, 'saveA')).toEqual([1]);
    expect(months(history, 'saveB')).toEqual([1, 2, 3]);
    expect(hub.mutes()).toHaveLength(1);
  });

  it('lastError znika po poprawnie zastosowanej linii TFLIVE', () => {
    const { hub } = makeHub();
    hub.ingest(read(['[x]  [TFLIVE] 1 save1 s 1 1 stops 1/1 [[1]]']));
    expect(hub.status().lastError).toMatch(/stop/);
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    expect(hub.status().lastError).toBeNull();
  });

  it('czas ostatniej linii pochodzi z prefiksu logu: stare linie nie są „live”', () => {
    const wall = Date.UTC(2026, 9, 1, 18, 6, 0);
    const hub = new Hub({ history: new HistoryStore(':memory:'), config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: null, now: () => wall });
    const old = metaLine({ gameTime: 4000, date: d(1900, 1, 2) }).replace('[2026-10-01 18:05:54Z', '[2020-01-01 00:00:00Z');
    hub.ingest(read([old]));
    expect(hub.status()).toMatchObject({ live: false, lastLineWallMs: Date.UTC(2020, 0, 1) });
    hub.ingest(read([metaLine({ seq: 2, gameTime: 8000, date: d(1900, 1, 3) })]));
    expect(hub.status()).toMatchObject({ live: true, lastLineWallMs: Date.UTC(2026, 9, 1, 18, 5, 54) });
  });
});
