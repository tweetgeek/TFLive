import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AlertType, MuteKind } from '@tflive/shared';
import type { Hub, HubState } from './hub';

const ALERT_TYPES: AlertType[] = ['low-reserve', 'negative-operating-result', 'unprofitable-line', 'low-line-load', 'line-without-vehicles', 'overloaded-stop', 'vehicle-no-path', 'vehicle-waiting', 'vehicle-idle', 'vehicle-old', 'vehicle-low-condition', 'missing-input', 'stalled-output', 'closure-threat', 'supply-drop'];
const KINDS: MuteKind[] = ['ignore', 'snooze'];

interface MuteBody {
  alertType?: unknown;
  entityId?: unknown;
  kind?: unknown;
  untilGameTime?: unknown;
}

export async function buildServer(opts: { hub: Hub; webDir?: string | null }): Promise<FastifyInstance> {
  const { hub } = opts;
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  app.get('/api/health', async () => hub.status());
  app.get('/api/state', async () => hub.state());
  app.get('/api/mutes', async () => hub.mutes());

  app.post<{ Body: MuteBody }>('/api/mutes', async (req, reply) => {
    const b = req.body ?? {};
    const validEntity = b.entityId === null || (typeof b.entityId === 'number' && Number.isInteger(b.entityId));
    const validUntil = b.untilGameTime === undefined || b.untilGameTime === null || typeof b.untilGameTime === 'number';
    if (!ALERT_TYPES.includes(b.alertType as AlertType) || !KINDS.includes(b.kind as MuteKind) || !validEntity || !validUntil) {
      return reply.code(400).send({ error: 'Niepoprawne dane Wyciszenia' });
    }
    try {
      const mute = hub.addMute({ alertType: b.alertType as AlertType, entityId: b.entityId as number | null, kind: b.kind as MuteKind, untilGameTime: (b.untilGameTime as number | null | undefined) ?? null });
      return reply.code(201).send(mute);
    } catch (e) {
      return reply.code(409).send({ error: (e as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/mutes/:id', async (req, reply) => {
    return hub.removeMute(Number(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ error: 'Nie znaleziono' });
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (s: HubState) => socket.send(JSON.stringify({ type: 'state', ...s }));
    send(hub.state());
    hub.on('update', send);
    socket.on('close', () => hub.off('update', send));
  });

  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir });
  }

  return app;
}
