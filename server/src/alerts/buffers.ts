import { monthIndex, monthMs, type Snapshot } from '@tflive/shared';

interface LoadSample { time: number; ratio: number }

/** Próbki obłożenia i zapamiętane odjazdy starsze niż tyle miesięcy gry są usuwane. */
const RETAIN_MONTHS = 13;

export class RuleBuffers {
  private loads = new Map<number, LoadSample[]>();
  private seenDepartures = new Map<string, number>();
  private firstSeen = new Map<number, number>();
  private supply = new Map<string, Map<number, number>>();

  observe(snap: Snapshot): void {
    const meta = snap.meta;
    const cutoff = meta ? meta.gameTime - RETAIN_MONTHS * monthMs(meta.dayMs) : -Infinity;
    if (meta) this.prune(cutoff);
    for (const l of snap.lines) {
      if (meta && !this.firstSeen.has(l.id)) this.firstSeen.set(l.id, meta.gameTime);
      for (const d of l.departureLoads) {
        const key = `${l.id}:${d.stopIndex}:${d.time}`;
        if (this.seenDepartures.has(key) || d.capacity <= 0 || d.time < cutoff) continue;
        this.seenDepartures.set(key, d.time);
        const list = this.loads.get(l.id) ?? [];
        list.push({ time: d.time, ratio: d.load / d.capacity });
        this.loads.set(l.id, list);
      }
    }
    if (meta) {
      const month = monthIndex(meta.date);
      for (const t of snap.towns) {
        for (const n of t.needs) {
          if (n.supplied === null) continue;
          const key = `${t.id}:${n.district}:${n.cargo}`;
          const byMonth = this.supply.get(key) ?? new Map<number, number>();
          byMonth.set(month, n.supplied);
          this.supply.set(key, byMonth);
        }
      }
    }
  }

  private prune(cutoff: number): void {
    for (const [key, time] of this.seenDepartures) if (time < cutoff) this.seenDepartures.delete(key);
    for (const [lineId, list] of this.loads) {
      const kept = list.filter((s) => s.time >= cutoff);
      if (kept.length) this.loads.set(lineId, kept);
      else this.loads.delete(lineId);
    }
  }

  lineLoadAvg(lineId: number, gameTime: number, windowMs: number): number | null {
    const samples = (this.loads.get(lineId) ?? []).filter((s) => s.time > gameTime - windowMs && s.time <= gameTime);
    if (!samples.length) return null;
    return samples.reduce((sum, s) => sum + s.ratio, 0) / samples.length;
  }

  lineFirstSeen(lineId: number): number | null {
    return this.firstSeen.get(lineId) ?? null;
  }

  townSupplyAt(townId: number, district: string, cargo: string, month: number): number | null {
    return this.supply.get(`${townId}:${district}:${cargo}`)?.get(month) ?? null;
  }

  reset(): void {
    this.loads.clear();
    this.seenDepartures.clear();
    this.firstSeen.clear();
    this.supply.clear();
  }
}
