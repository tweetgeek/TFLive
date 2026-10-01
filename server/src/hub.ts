import { EventEmitter } from 'node:events';
import { monthMs, parseLine, type Alert, type AlertType, type Mute, type MuteKind, type Snapshot } from '@tflive/shared';
import { RuleBuffers } from './alerts/buffers';
import { AlertEngine } from './alerts/engine';
import { ALL_RULES } from './alerts/index';
import type { AlertConfig } from './config';
import type { HistoryStore } from './history/historyStore';
import type { LogReadResult } from './source/types';
import { GameStore, type StoreEvent } from './store/gameStore';

export interface HubStatus {
  logPath: string | null;
  logState: 'missing' | 'ok';
  live: boolean;
  lastLineWallMs: number | null;
  paused: boolean | null;
  diskMBPerHour: number | null;
  saveId: string | null;
  lastError: string | null;
}

export interface HubState {
  snapshot: Snapshot;
  alerts: Alert[];
  status: HubStatus;
}

export interface MuteInput {
  alertType: AlertType;
  entityId: number | null;
  kind: MuteKind;
  untilGameTime?: number | null;
}

const RATE_MIN_MS = 60_000;

export class Hub extends EventEmitter {
  private store = new GameStore();
  private engine = new AlertEngine(ALL_RULES);
  private buffers = new RuleBuffers();
  private alerts: Alert[] = [];
  private logState: 'missing' | 'ok' = 'missing';
  private lastLineWallMs: number | null = null;
  private lastError: string | null = null;
  private rate: { sessionId: string; wall0: number; bytes0: number; mbPerHour: number | null } | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: { history: HistoryStore; config: AlertConfig; staleMs: number; logPath: string | null; now?: () => number }) {
    super();
    this.now = deps.now ?? Date.now;
  }

  ingest(r: LogReadResult): void {
    this.logState = r.missing ? 'missing' : 'ok';
    let dirty = false;
    if (r.reset) {
      this.store.reset();
      this.engine.reset();
      this.buffers.reset();
      this.alerts = [];
      this.rate = null;
      dirty = true;
    }
    for (const raw of r.lines) {
      const p = parseLine(raw);
      if (!p.ok) {
        if (p.reason !== 'not-tflive') this.lastError = `Linia odrzucona: ${p.reason}${p.version ? ` (wersja ${p.version})` : ''}`;
        continue;
      }
      this.lastLineWallMs = this.now();
      const res = this.store.apply(p.line);
      if (res.error) this.lastError = res.error;
      for (const e of res.events) this.handle(e);
      if (res.changed.length || res.events.length) dirty = true;
      if (res.changed.includes('meta')) this.updateRate();
    }
    if (dirty) {
      this.buffers.observe(this.store.snapshot());
      this.recompute();
      this.emit('update', this.state());
    }
  }

  state(): HubState {
    return { snapshot: this.store.snapshot(), alerts: this.alerts, status: this.status() };
  }

  status(): HubStatus {
    const meta = this.store.snapshot().meta;
    return {
      logPath: this.deps.logPath,
      logState: this.logState,
      live: this.lastLineWallMs !== null && this.now() - this.lastLineWallMs <= this.deps.staleMs,
      lastLineWallMs: this.lastLineWallMs,
      paused: meta?.paused ?? null,
      diskMBPerHour: this.rate?.mbPerHour ?? null,
      saveId: this.store.saveId(),
      lastError: this.lastError,
    };
  }

  mutes(): Mute[] {
    const saveId = this.store.saveId();
    return saveId ? this.deps.history.listMutes(saveId) : [];
  }

  addMute(input: MuteInput): Mute {
    const saveId = this.store.saveId();
    const meta = this.store.snapshot().meta;
    if (!saveId) throw new Error('Brak aktywnej Rozgrywki');
    const untilGameTime =
      input.kind === 'ignore' ? null : input.untilGameTime ?? (meta ? meta.gameTime + this.deps.config.snoozeMonths * monthMs(meta.dayMs) : null);
    const m = this.deps.history.addMute({ saveId, alertType: input.alertType, entityId: input.entityId, kind: input.kind, untilGameTime });
    this.recompute();
    this.emit('update', this.state());
    return m;
  }

  removeMute(id: number): boolean {
    const saveId = this.store.saveId();
    if (!saveId) return false;
    const ok = this.deps.history.removeMute(saveId, id);
    if (ok) {
      this.recompute();
      this.emit('update', this.state());
    }
    return ok;
  }

  private handle(e: StoreEvent): void {
    const h = this.deps.history;
    switch (e.type) {
      case 'game-changed':
        this.engine.reset();
        this.buffers.reset();
        this.alerts = [];
        this.rate = null;
        break;
      case 'rewind':
        h.truncateAfter(e.saveId, e.toMonth);
        this.engine.reset();
        this.buffers.reset();
        break;
      case 'new-month': {
        const snap = this.store.snapshot();
        const meta = snap.meta;
        const window = meta ? this.deps.config.lowLoadWindowMonths * monthMs(meta.dayMs) : 0;
        h.recordMonth(e.saveId, e.month, snap, (id) => (meta ? this.buffers.lineLoadAvg(id, meta.gameTime, window) : null));
        h.touchGame(e.saveId, meta?.mapName ?? null, meta?.gameTime ?? 0);
        break;
      }
      case 'backfill':
        h.applyBackfill(e.saveId, e.data);
        break;
    }
  }

  private recompute(): void {
    const snap = this.store.snapshot();
    const meta = snap.meta;
    if (!meta) {
      this.alerts = [];
      return;
    }
    this.alerts = this.engine.evaluate(
      { snap: { ...snap, meta }, gameTime: meta.gameTime, dayMs: meta.dayMs, config: this.deps.config, buffers: this.buffers },
      this.mutes(),
    );
  }

  private updateRate(): void {
    const meta = this.store.snapshot().meta;
    if (!meta) return;
    const wall = this.now();
    if (!this.rate || this.rate.sessionId !== meta.sessionId || meta.bytesWritten < this.rate.bytes0) {
      this.rate = { sessionId: meta.sessionId, wall0: wall, bytes0: meta.bytesWritten, mbPerHour: null };
      return;
    }
    const elapsed = wall - this.rate.wall0;
    if (elapsed >= RATE_MIN_MS) this.rate.mbPerHour = ((meta.bytesWritten - this.rate.bytes0) / 1e6) * (3_600_000 / elapsed);
  }
}
