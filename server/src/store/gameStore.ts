import { decodeSection, DecodeError, emptySnapshot, monthIndex, type Backfill, type ParsedLine, type SectionName, type Snapshot } from '@tflive/shared';

export type StoreEvent =
  | { type: 'game-changed'; saveId: string }
  | { type: 'rewind'; saveId: string; toGameTime: number; toMonth: number }
  | { type: 'new-month'; saveId: string; month: number }
  | { type: 'backfill'; saveId: string; data: Backfill };

export interface ApplyResult {
  changed: SectionName[];
  events: StoreEvent[];
  error: string | null;
}

interface Pending {
  seq: number;
  parts: number;
  rows: Map<number, unknown>;
}

export class GameStore {
  private snap: Snapshot = emptySnapshot();
  private currentSave: string | null = null;
  private lastGameTime: number | null = null;
  private lastMonth: number | null = null;
  private pending = new Map<SectionName, Pending>();

  snapshot(): Snapshot {
    return this.snap;
  }

  saveId(): string | null {
    return this.currentSave;
  }

  reset(): void {
    this.snap = emptySnapshot();
    this.currentSave = null;
    this.lastGameTime = null;
    this.lastMonth = null;
    this.pending.clear();
  }

  apply(line: ParsedLine): ApplyResult {
    const h = line.header;
    const events: StoreEvent[] = [];
    if (this.currentSave !== h.saveId) {
      this.reset();
      this.currentSave = h.saveId;
      events.push({ type: 'game-changed', saveId: h.saveId });
    }

    const payload = this.assemble(line);
    if (payload === undefined) return { changed: [], events, error: null };

    let decoded;
    try {
      decoded = decodeSection(h.section, payload);
    } catch (e) {
      if (e instanceof DecodeError) return { changed: [], events, error: `${h.section}: ${e.message}` };
      throw e;
    }

    switch (decoded.section) {
      case 'meta': {
        const data = decoded.data;
        if (this.lastGameTime !== null && h.gameTime < this.lastGameTime - data.dayMs) {
          const saveId = h.saveId;
          this.reset();
          this.currentSave = saveId;
          events.push({ type: 'rewind', saveId, toGameTime: h.gameTime, toMonth: monthIndex(data.date) });
        }
        this.snap = { ...this.snap, meta: { ...data, saveId: h.saveId, sessionId: h.sessionId, gameTime: h.gameTime } };
        this.lastGameTime = h.gameTime;
        const month = monthIndex(data.date);
        if (month !== this.lastMonth) events.push({ type: 'new-month', saveId: h.saveId, month });
        this.lastMonth = month;
        return { changed: ['meta'], events, error: null };
      }
      case 'finance':
        this.snap = { ...this.snap, finance: decoded.data };
        return { changed: ['finance'], events, error: null };
      case 'backfill':
        events.push({ type: 'backfill', saveId: h.saveId, data: decoded.data });
        return { changed: [], events, error: null };
      default:
        this.snap = { ...this.snap, [decoded.section]: decoded.data };
        return { changed: [decoded.section], events, error: null };
    }
  }

  private assemble(line: ParsedLine): unknown | undefined {
    const h = line.header;
    if (h.parts === 1) return line.payload;
    let p = this.pending.get(h.section);
    if (!p || p.seq !== h.seq) {
      if (p && h.seq < p.seq) return undefined;
      p = { seq: h.seq, parts: h.parts, rows: new Map() };
      this.pending.set(h.section, p);
    }
    p.rows.set(h.part, line.payload);
    if (p.rows.size < p.parts) return undefined;
    this.pending.delete(h.section);
    const out: unknown[] = [];
    for (let i = 1; i <= p.parts; i++) {
      const rows = p.rows.get(i);
      if (!Array.isArray(rows)) return [[`niepoprawna część ${i}`]];
      out.push(...rows);
    }
    return out;
  }
}
