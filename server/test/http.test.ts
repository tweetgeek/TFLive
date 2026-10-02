import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it, vi } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { buildServer } from '../src/http';
import { Hub } from '../src/hub';
import { DAY, metaLine, sectionLines, vehicle } from './builders';

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function start() {
  const hub = new Hub({ history: new HistoryStore(':memory:'), config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: '/x' });
  const app = await buildServer({ hub });
  await app.listen({ port: 0, host: '127.0.0.1' });
  closers.push(() => app.close());
  const { port } = app.server.address() as AddressInfo;
  return { hub, app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

const feed = (hub: Hub) =>
  hub.ingest({
    lines: [metaLine({ gameTime: 100 * DAY, date: { y: 1900, m: 4, d: 1 } }), ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 100 * DAY })],
    reset: false,
    missing: false,
  });

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(String(d)))));
}

describe('HTTP', () => {
  it('GET /api/health i /api/state', async () => {
    const { hub, base } = await start();
    feed(hub);
    expect((await (await fetch(`${base}/api/health`)).json()).saveId).toBe('save1');
    const state = await (await fetch(`${base}/api/state`)).json();
    expect(state.snapshot.vehicles[0].id).toBe(5);
    expect(state.alerts[0].id).toBe('vehicle-no-path:5');
  });

  it('POST /api/mutes: 409 bez Rozgrywki, 400 przy złych danych, 201 i DELETE', async () => {
    const { hub, base } = await start();
    const post = (body: unknown) => fetch(`${base}/api/mutes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ alertType: 'vehicle-no-path', entityId: 5, kind: 'ignore' })).status).toBe(409);
    feed(hub);
    expect((await post({ alertType: 'vehicle-no-path', entityId: 5, kind: 'forever' })).status).toBe(400);
    const res = await post({ alertType: 'vehicle-no-path', entityId: 5, kind: 'ignore' });
    expect(res.status).toBe(201);
    const mute = await res.json();
    expect((await (await fetch(`${base}/api/mutes`)).json())).toEqual([mute]);
    expect((await fetch(`${base}/api/mutes/${mute.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(`${base}/api/mutes/${mute.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('WS wysyła stan przy połączeniu i po każdej zmianie', async () => {
    const { hub, ws } = await start();
    const client = new WebSocket(ws);
    closers.push(async () => client.close());
    const first = await nextMessage(client);
    expect(first).toMatchObject({ type: 'state', snapshot: { vehicles: [] } });
    const next = nextMessage(client);
    feed(hub);
    expect((await next).snapshot.vehicles[0].id).toBe(5);
  });

  it('WS: jeden listener nawet z 12 klientami', async () => {
    const { hub, ws } = await start();
    const clients: WebSocket[] = [];
    for (let i = 0; i < 12; i++) {
      const client = new WebSocket(ws);
      clients.push(client);
      closers.push(async () => client.close());
      await nextMessage(client);
    }
    expect(hub.listenerCount('update')).toBe(1);
    for (const client of clients) {
      client.close();
    }
    await new Promise((resolve) => setTimeout(resolve, 50));
    const reconnect = new WebSocket(ws);
    closers.push(async () => reconnect.close());
    const msg = await nextMessage(reconnect);
    expect(msg).toMatchObject({ type: 'state' });
  });

  it('POST /api/mutes: 500 gdy hub.addMute rzuca innym błędem', async () => {
    const { hub, base } = await start();
    feed(hub);
    vi.spyOn(hub, 'addMute').mockImplementation(() => {
      throw new Error('db down');
    });
    const res = await fetch(`${base}/api/mutes`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ alertType: 'vehicle-no-path', entityId: 5, kind: 'ignore' }),
    });
    expect(res.status).toBe(500);
  });
});
