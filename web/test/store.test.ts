import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BACKOFF_MS, WATCHDOG_MS, browserWebSocket, createStore, wsUrl, type StoreDeps, type WebSocketLike } from '../src/state/store';
import { fixtureState } from './fixture';

class FakeWS implements WebSocketLike {
  static all: FakeWS[] = [];
  onopen: (() => void) | null = null;
  onmessage: ((ev: { data: unknown }) => void) | null = null;
  onclose: (() => void) | null = null;
  onerror: (() => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FakeWS.all.push(this); }
  close() { this.closed = true; this.onclose?.(); }
}

class FakeConstructorWS {
  static instances: FakeConstructorWS[] = [];
  onopen: ((ev?: Event) => void) | null = null;
  onmessage: ((ev: MessageEvent) => void) | null = null;
  onclose: ((ev?: Event) => void) | null = null;
  onerror: ((ev?: Event) => void) | null = null;
  closed = false;
  constructor(readonly url: string) { FakeConstructorWS.instances.push(this); }
  close() { this.closed = true; }
}

function setup(fetchImpl: StoreDeps['fetch'] = async () => new Response('[]', { status: 200 })) {
  FakeWS.all = [];
  const store = createStore({ url: 'ws://h/ws', wsFactory: (u) => new FakeWS(u), fetch: fetchImpl });
  return { store, fetchImpl };
}

describe('browserWebSocket', () => {
  it('forwards real WebSocket events to adapter handlers', () => {
    FakeConstructorWS.instances = [];
    const adapter = browserWebSocket('ws://x/ws', FakeConstructorWS as unknown as new (url: string) => WebSocket);
    expect(FakeConstructorWS.instances).toHaveLength(1);
    const fake = FakeConstructorWS.instances[0];

    const openSpy = vi.fn();
    const messageSpy = vi.fn();
    const closeSpy = vi.fn();
    const errorSpy = vi.fn();

    adapter.onopen = openSpy;
    adapter.onmessage = messageSpy;
    adapter.onclose = closeSpy;
    adapter.onerror = errorSpy;

    // Trigger real WebSocket handlers
    fake.onopen?.();
    expect(openSpy).toHaveBeenCalledTimes(1);

    fake.onmessage?.(new MessageEvent('message', { data: 'abc' }));
    expect(messageSpy).toHaveBeenCalledWith({ data: 'abc' });

    fake.onclose?.();
    expect(closeSpy).toHaveBeenCalledTimes(1);

    fake.onerror?.();
    expect(errorSpy).toHaveBeenCalledTimes(1);
  });

  it('adapter.close() closes real WebSocket', () => {
    FakeConstructorWS.instances = [];
    const adapter = browserWebSocket('ws://x/ws', FakeConstructorWS as unknown as new (url: string) => WebSocket);
    const fake = FakeConstructorWS.instances[0];
    adapter.close();
    expect(fake.closed).toBe(true);
  });

  it('createStore with browserWebSocket receives real socket events', () => {
    FakeConstructorWS.instances = [];
    const store = createStore({
      url: 'ws://h/ws',
      wsFactory: (u) => browserWebSocket(u, FakeConstructorWS as unknown as new (url: string) => WebSocket),
      fetch: async () => new Response('[]', { status: 200 }),
    });
    store.connect();
    expect(store.state.conn).toBe('connecting');

    const fake = FakeConstructorWS.instances[0];
    fake.onopen?.();
    expect(store.state.conn).toBe('open');

    fake.onmessage?.(new MessageEvent('message', { data: JSON.stringify({ type: 'state', ...fixtureState() }) }));
    expect(store.state.received).toBe(true);
    expect(store.state.snapshot.vehicles).toHaveLength(3);
  });
});

describe('store', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('wsUrl wg protokołu strony', () => {
    expect(wsUrl({ protocol: 'http:', host: '10.0.0.5:8787' })).toBe('ws://10.0.0.5:8787/ws');
    expect(wsUrl({ protocol: 'https:', host: 'x' })).toBe('wss://x/ws');
  });

  it('łączy się, przyjmuje stan i oznacza połączenie', () => {
    const { store } = setup();
    store.connect();
    expect(store.state.conn).toBe('connecting');
    const ws = FakeWS.all[0];
    ws.onopen?.();
    expect(store.state.conn).toBe('open');
    ws.onmessage?.({ data: JSON.stringify({ type: 'state', ...fixtureState() }) });
    expect(store.state.received).toBe(true);
    expect(store.state.snapshot.vehicles).toHaveLength(3);
    expect(store.state.status.live).toBe(true);
  });

  it('ignoruje uszkodzone wiadomości', () => {
    const { store } = setup();
    store.connect();
    FakeWS.all[0].onmessage?.({ data: '{zepsute' });
    FakeWS.all[0].onmessage?.({ data: JSON.stringify({ type: 'inne' }) });
    expect(store.state.received).toBe(false);
  });

  it('po zerwaniu łączy ponownie z rosnącym odstępem, reset po udanym połączeniu', () => {
    const { store } = setup();
    store.connect();
    FakeWS.all[0].onclose?.();
    expect(store.state.conn).toBe('closed');
    vi.advanceTimersByTime(BACKOFF_MS[0] - 1);
    expect(FakeWS.all).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(FakeWS.all).toHaveLength(2);
    FakeWS.all[1].onclose?.();
    vi.advanceTimersByTime(BACKOFF_MS[1]);
    expect(FakeWS.all).toHaveLength(3);
    FakeWS.all[2].onopen?.();
    FakeWS.all[2].onclose?.();
    vi.advanceTimersByTime(BACKOFF_MS[0]);
    expect(FakeWS.all).toHaveLength(4);
  });

  it('close() zatrzymuje ponowne łączenie', () => {
    const { store } = setup();
    store.connect();
    store.close();
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.all).toHaveLength(1);
  });

  it('mute wysyła POST i odświeża listę; unmute usuwa pasujące Wyciszenie', async () => {
    const mutes = [{ id: 7, saveId: 's', alertType: 'low-line-load', entityId: 56357, kind: 'snooze', untilGameTime: 1 }];
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) =>
      new Response(init?.method ? '{}' : JSON.stringify(mutes), { status: init?.method === 'POST' ? 201 : 200 }));
    const { store } = setup(fetchImpl);
    const alert = fixtureState().alerts.find((a) => a.type === 'low-line-load')!;
    await store.mute(alert, 'ignore');
    expect(fetchImpl).toHaveBeenCalledWith('/api/mutes', expect.objectContaining({ method: 'POST', body: JSON.stringify({ alertType: 'low-line-load', entityId: 56357, kind: 'ignore' }) }));
    expect(store.state.mutes).toHaveLength(1);
    await store.unmute(alert);
    expect(fetchImpl).toHaveBeenCalledWith('/api/mutes/7', expect.objectContaining({ method: 'DELETE' }));
  });

  it('close() potem connect() nie tworzy dwóch socketów — timer nie odpalany', () => {
    const { store } = setup();
    store.connect();
    expect(FakeWS.all).toHaveLength(1);
    FakeWS.all[0].onclose?.();
    store.close();
    store.connect();
    expect(FakeWS.all).toHaveLength(2);
    vi.advanceTimersByTime(60_000);
    expect(FakeWS.all).toHaveLength(2);
  });

  it('POST 409 zwraca actionError, nie rzuca', async () => {
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) =>
      new Response('{}', { status: init?.method === 'POST' ? 409 : 200 }));
    const { store } = setup(fetchImpl);
    const alert = fixtureState().alerts.find((a) => a.type === 'low-line-load')!;
    expect(store.state.actionError).toBe(null);
    await store.mute(alert, 'ignore');
    expect(store.state.actionError).toContain('409');
  });

  it('fetch reject zwraca actionError o braku połączenia, nie rzuca', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network'); });
    const { store } = setup(fetchImpl);
    const alert = fixtureState().alerts.find((a) => a.type === 'low-line-load')!;
    await store.mute(alert, 'ignore');
    expect(store.state.actionError).toContain('Brak połączenia');
  });

  it('isWire odrzuca snapshot:null', () => {
    const { store } = setup();
    store.connect();
    FakeWS.all[0].onmessage?.({ data: JSON.stringify({ type: 'state', snapshot: null, alerts: [], status: {} }) });
    expect(store.state.received).toBe(false);
  });

  it('refreshMutes rejekt nie rzuca, mutes niezmienione', async () => {
    const fetchImpl = vi.fn(async () => { throw new Error('network'); });
    const { store } = setup(fetchImpl);
    store.state.mutes = [{ id: 1, saveId: 's', alertType: 'low-line-load', entityId: 56357, kind: 'ignore', untilGameTime: null }];
    await store.refreshMutes();
    expect(store.state.mutes).toHaveLength(1);
  });

  it('onopen odświeża mutes', async () => {
    const mutes = [{ id: 1, saveId: 's', alertType: 'low-line-load', entityId: 56357, kind: 'ignore', untilGameTime: null }];
    const fetchImpl = vi.fn(async (input: string, init?: RequestInit) =>
      new Response(JSON.stringify(mutes), { status: 200 }));
    const { store } = setup(fetchImpl);
    expect(store.state.mutes).toHaveLength(0);
    store.connect();
    FakeWS.all[0].onopen?.();
    await vi.runAllTimersAsync();
    expect(store.state.mutes).toHaveLength(1);
  });

  it('watchdog: brak wiadomości przez 15 s zamyka socket i planuje ponowne łączenie', () => {
    const { store } = setup();
    store.connect();
    const ws = FakeWS.all[0];
    ws.onopen?.();
    ws.onmessage?.({ data: JSON.stringify({ type: 'state', ...fixtureState() }) });
    vi.advanceTimersByTime(WATCHDOG_MS - 1000);
    expect(ws.closed).toBe(false);
    vi.advanceTimersByTime(1000);
    expect(ws.closed).toBe(true);
    expect(store.state.conn).toBe('closed');
    expect(FakeWS.all).toHaveLength(1);
    vi.advanceTimersByTime(BACKOFF_MS[0]);
    expect(FakeWS.all).toHaveLength(2);
  });

  it('watchdog: wiadomości co 5 s nie zamykają socketu', () => {
    const { store } = setup();
    store.connect();
    const ws = FakeWS.all[0];
    ws.onopen?.();
    for (let i = 0; i < 10; i++) {
      vi.advanceTimersByTime(5000);
      ws.onmessage?.({ data: JSON.stringify({ type: 'state', ...fixtureState() }) });
    }
    expect(ws.closed).toBe(false);
    expect(store.state.conn).toBe('open');
  });

  it('watchdog: close() nie zostawia timerów, stary watchdog nie zamyka nowego socketu', () => {
    const { store } = setup();
    store.connect();
    FakeWS.all[0].onopen?.();
    store.close();
    expect(vi.getTimerCount()).toBe(0);
    store.connect();
    const ws2 = FakeWS.all[1];
    ws2.onopen?.();
    vi.advanceTimersByTime(WATCHDOG_MS - 1000);
    ws2.onmessage?.({ data: JSON.stringify({ type: 'state', ...fixtureState() }) });
    vi.advanceTimersByTime(WATCHDOG_MS - 1000);
    expect(ws2.closed).toBe(false);
    expect(FakeWS.all).toHaveLength(2);
  });

  it('unmute bez pasującego Wyciszenia odświeża listę i znajduje je', async () => {
    const mutes = [{ id: 9, saveId: 's', alertType: 'low-line-load', entityId: 56357, kind: 'ignore', untilGameTime: null }];
    const fetchImpl = vi.fn(async (_i: string, init?: RequestInit) => new Response(init?.method === 'DELETE' ? '{}' : JSON.stringify(mutes), { status: 200 }));
    const { store } = setup(fetchImpl);
    const alert = fixtureState().alerts.find((a) => a.type === 'low-line-load')!;
    await store.unmute(alert);
    expect(fetchImpl).toHaveBeenCalledWith('/api/mutes/9', expect.objectContaining({ method: 'DELETE' }));
  });

  it('unmute bez Wyciszenia nawet po odświeżeniu ustawia actionError', async () => {
    const { store } = setup();
    const alert = fixtureState().alerts.find((a) => a.type === 'low-line-load')!;
    await store.unmute(alert);
    expect(store.state.actionError).toBe('Nie znaleziono wyciszenia do usunięcia — odśwież stronę');
  });

  it('zmiana saveId (poprzednie nie-null) odświeża mutes', async () => {
    const fetchImpl = vi.fn(async () => new Response('[]', { status: 200 }));
    const { store } = setup(fetchImpl);
    store.connect();
    const ws = FakeWS.all[0];
    const send = (saveId: string | null) => {
      const s = fixtureState();
      s.status = { ...s.status, saveId };
      ws.onmessage?.({ data: JSON.stringify({ type: 'state', ...s }) });
    };
    send('a');
    await vi.runAllTimersAsync();
    fetchImpl.mockClear();
    send('a');
    await vi.runAllTimersAsync();
    expect(fetchImpl).not.toHaveBeenCalled();
    send('b');
    await vi.runAllTimersAsync();
    expect(fetchImpl).toHaveBeenCalledWith('/api/mutes');
  });
});
