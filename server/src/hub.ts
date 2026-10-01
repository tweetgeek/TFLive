import { EventEmitter } from 'node:events';
import { monthIndex, monthMs, parseLine, type Alert, type AlertType, type Mute, type MuteKind, type SectionName, type Snapshot } from '@tflive/shared';
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
const MONTH_SECTIONS: SectionName[] = ['finance', 'lines', 'vehicles', 'towns', 'industries'];
const OBSERVED: ReadonlySet<SectionName> = new Set(['meta', 'lines', 'towns']);

const PREFIX_TIME_RE = /^\[(\d{4})-(\d{2})-(\d{2}) (\d{2}):(\d{2}):(\d{2})Z/;

/** Czas ścienny linii z prefiksu logu gry `[YYYY-MM-DD HH:MM:SSZ`; bez prefiksu (lub z przyszłości) — `now`. */
export function lineWallMs(raw: string, now: number): number {
  const m = PREFIX_TIME_RE.exec(raw);
  if (!m) return now;
  const t = Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +m[6]);
  return Number.isFinite(t) && t < now ? t : now;
}

interface PendingMonth {
  saveId: string;
  month: number;
  provisional: boolean;
}

export class Hub extends EventEmitter {
  private store = new GameStore();
  private engine = new AlertEngine(ALL_RULES);
  private buffers = new RuleBuffers();
  private alerts: Alert[] = [];
  private logState: 'missing' | 'ok' = 'missing';
  private lastLineWallMs: number | null = null;
  private lastError: string | null = null;
  private rate: { sessionId: string; wall0: number; bytes0: number; mbPerHour: number | null } | null = null;
  private pendingMonth: PendingMonth | null = null;
  /** Sekcje, które dotarły od ostatniego resetu (bramkowanie tabel Historii). */
  private seen = new Set<SectionName>();
  /** Sekcje, które dotarły w bieżącym miesiącu (zapis wstępny). */
  private seenThisMonth = new Set<SectionName>();
  /** Po zmianie Rozgrywki / nowym logu pierwszy meta porównujemy z Historią (Cofnięcie po restarcie). */
  private restartCheck = false;
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
      this.resetPending();
      dirty = true;
    }
    for (const raw of r.lines) {
      const p = parseLine(raw);
      if (!p.ok) {
        if (p.reason !== 'not-tflive') this.lastError = `Linia odrzucona: ${p.reason}${p.version ? ` (wersja ${p.version})` : ''}`;
        continue;
      }
      this.lastLineWallMs = lineWallMs(raw, this.now());
      const res = this.store.apply(p.line);
      if (res.error) this.lastError = res.error;
      else if (res.changed.length || res.events.length) this.lastError = null;
      for (const e of res.events) this.handle(e);
      for (const c of res.changed) {
        this.seen.add(c);
        this.seenThisMonth.add(c);
      }
      if (res.changed.length || res.events.length) dirty = true;
      if (res.changed.includes('meta')) {
        this.updateRate();
        if (this.restartCheck) this.checkRestartRewind();
      }
      if (res.changed.some((c) => OBSERVED.has(c))) this.buffers.observe(this.store.snapshot());
      this.writeProvisional();
    }
    if (dirty) {
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
    const m = this.deps.history.addMute({ saveId, alertType: input.alertType, entityId: input.entityId, kind: input.kind, untilGameTime }, meta?.gameTime ?? null);
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
        this.restartCheck = true;
        this.engine.reset();
        this.buffers.reset();
        this.alerts = [];
        this.rate = null;
        this.resetPending();
        break;
      case 'rewind':
        h.truncateAfter(e.saveId, e.toMonth);
        this.engine.reset();
        this.buffers.reset();
        this.resetPending();
        break;
      case 'new-month':
        // Wiersz miesiąca M opisuje stan z końca M: przy przejściu do M+1 zapisujemy M z bieżącego stanu.
        if (this.pendingMonth && this.pendingMonth.saveId === e.saveId && this.pendingMonth.month !== e.month) this.writeMonth(this.pendingMonth);
        this.pendingMonth = { saveId: e.saveId, month: e.month, provisional: false };
        this.seenThisMonth.clear();
        break;
      case 'backfill':
        h.applyBackfill(e.saveId, e.data);
        break;
    }
  }

  /** Cofnięcie po restarcie: pierwszy meta Rozgrywki wcześniejszy niż ostatnio widziany czas gry o ponad dzień. */
  private checkRestartRewind(): void {
    this.restartCheck = false;
    const meta = this.store.snapshot().meta;
    if (!meta) return;
    const last = this.deps.history.lastGameTime(meta.saveId);
    if (last === null || meta.gameTime >= last - meta.dayMs) return;
    this.deps.history.truncateAfter(meta.saveId, monthIndex(meta.date));
    this.deps.history.touchGame(meta.saveId, meta.mapName, meta.gameTime);
  }

  private resetPending(): void {
    this.pendingMonth = null;
    this.seen.clear();
    this.seenThisMonth.clear();
  }

  /** Wstępny zapis bieżącego miesiąca, gdy w trakcie miesiąca dotarły wszystkie sekcje (nadpisywany na końcu miesiąca). */
  private writeProvisional(): void {
    const pm = this.pendingMonth;
    if (!pm || pm.provisional || !MONTH_SECTIONS.every((x) => this.seenThisMonth.has(x))) return;
    this.writeMonth(pm);
    pm.provisional = true;
  }

  /** Zapisuje miesiąc z bieżącego stanu; każda tabela tylko z sekcji, które dotarły od ostatniego resetu. */
  private writeMonth(pm: PendingMonth): void {
    const snap = this.store.snapshot();
    const meta = snap.meta;
    const window = meta ? this.deps.config.lowLoadWindowMonths * monthMs(meta.dayMs) : 0;
    this.deps.history.recordMonth(pm.saveId, pm.month, snap, (id) => (meta ? this.buffers.lineLoadAvg(id, meta.gameTime, window) : null), this.seen);
    this.deps.history.touchGame(pm.saveId, meta?.mapName ?? null, meta?.gameTime ?? 0);
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
