import { emptySnapshot, type Alert, type Mute, type MuteKind } from '@tflive/shared';
import { inject, reactive, type InjectionKey } from 'vue';
import type { HubState, HubStatus, WireMessage } from './types';

export type Conn = 'connecting' | 'open' | 'closed';

export interface WebSocketLike {
  onopen: (() => void) | null;
  onmessage: ((ev: { data: unknown }) => void) | null;
  onclose: (() => void) | null;
  onerror: (() => void) | null;
  close(): void;
}

export interface StoreDeps {
  url: string;
  wsFactory: (url: string) => WebSocketLike;
  fetch: (input: string, init?: RequestInit) => Promise<Response>;
  setTimeout?: (fn: () => void, ms: number) => unknown;
}

export interface AppState extends HubState {
  conn: Conn;
  mutes: Mute[];
  received: boolean;
  actionError: string | null;
}

export interface Store {
  state: AppState;
  connect(): void;
  close(): void;
  refreshMutes(): Promise<void>;
  mute(alert: Alert, kind: MuteKind): Promise<void>;
  unmute(alert: Alert): Promise<void>;
}

export const BACKOFF_MS = [1000, 2000, 5000, 10000, 30000] as const;
export const STORE_KEY: InjectionKey<Store> = Symbol('tflive-store');

const emptyStatus = (): HubStatus => ({ logPath: null, logState: 'missing', live: false, lastLineWallMs: null, paused: null, diskMBPerHour: null, saveId: null, lastError: null });

export function wsUrl(loc: { protocol: string; host: string }): string {
  return `${loc.protocol === 'https:' ? 'wss' : 'ws'}://${loc.host}/ws`;
}

function isWire(x: unknown): x is WireMessage {
  const m = x as Partial<WireMessage> | null;
  return !!m && m.type === 'state' && typeof m.snapshot === 'object' && m.snapshot !== null && Array.isArray(m.alerts) && typeof m.status === 'object' && m.status !== null;
}

export function createStore(deps: StoreDeps): Store {
  const schedule = deps.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const state = reactive<AppState>({ snapshot: emptySnapshot(), alerts: [], status: emptyStatus(), conn: 'closed', mutes: [], received: false, actionError: null });
  let ws: WebSocketLike | null = null;
  let attempt = 0;
  let stopped = false;
  let generation = 0;

  const open = () => {
    state.conn = 'connecting';
    const sock = deps.wsFactory(deps.url);
    ws = sock;
    sock.onopen = () => {
      attempt = 0;
      state.conn = 'open';
      void refreshMutes();
    };
    sock.onmessage = (ev) => {
      let msg: unknown;
      try {
        msg = JSON.parse(String(ev.data));
      } catch {
        return;
      }
      if (!isWire(msg)) return;
      state.snapshot = msg.snapshot;
      state.alerts = msg.alerts;
      state.status = msg.status;
      state.received = true;
    };
    sock.onerror = () => {};
    sock.onclose = () => {
      if (ws !== sock) return;
      state.conn = 'closed';
      ws = null;
      if (stopped) return;
      const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
      attempt += 1;
      const gen = generation;
      schedule(() => {
        if (!stopped && gen === generation) open();
      }, delay);
    };
  };

  const refreshMutes = async () => {
    try {
      const res = await deps.fetch('/api/mutes');
      if (res.ok) state.mutes = (await res.json()) as Mute[];
    } catch {
      // swallow error, keep previous mutes
    }
  };

  return {
    state,
    connect() {
      stopped = false;
      generation += 1;
      if (!ws) open();
    },
    close() {
      stopped = true;
      generation += 1;
      ws?.close();
    },
    refreshMutes,
    async mute(alert, kind) {
      try {
        const res = await deps.fetch('/api/mutes', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ alertType: alert.type, entityId: alert.entityId, kind }),
        });
        if (!res.ok) {
          state.actionError = `Nie udało się zapisać wyciszenia (HTTP ${res.status})`;
        } else {
          state.actionError = null;
        }
      } catch {
        state.actionError = 'Brak połączenia z serwerem — wyciszenie nie zostało zapisane';
      }
      await refreshMutes();
    },
    async unmute(alert) {
      const m = state.mutes.find((x) => x.alertType === alert.type && x.entityId === alert.entityId);
      if (!m) return;
      try {
        const res = await deps.fetch(`/api/mutes/${m.id}`, { method: 'DELETE' });
        if (!res.ok) {
          state.actionError = `Nie udało się zapisać wyciszenia (HTTP ${res.status})`;
        } else {
          state.actionError = null;
        }
      } catch {
        state.actionError = 'Brak połączenia z serwerem — wyciszenie nie zostało zapisane';
      }
      await refreshMutes();
    },
  };
}

export function useStore(): Store {
  const s = inject(STORE_KEY);
  if (!s) throw new Error('TFLive: brak magazynu stanu (provide STORE_KEY)');
  return s;
}
