import { monthIndex, type Snapshot } from '@tflive/shared';

interface LoadSample { time: number; ratio: number }

export class RuleBuffers {
  private loads = new Map<number, LoadSample[]>();
  private seenDepartures = new Set<string>();
  private firstSeen = new Map<number, number>();
  private supply = new Map<string, Map<number, number>>();

  observe(snap: Snapshot): void {
    const gameTime = snap.meta?.gameTime ?? 0;
    for (const l of snap.lines) {
      if (!this.firstSeen.has(l.id)) this.firstSeen.set(l.id, gameTime);
      for (const d of l.departureLoads) {
        const key = `${l.id}:${d.stopIndex}:${d.time}`;
        if (this.seenDepartures.has(key) || d.capacity <= 0) continue;
        this.seenDepartures.add(key);
        const list = this.loads.get(l.id) ?? [];
        list.push({ time: d.time, ratio: d.load / d.capacity });
        this.loads.set(l.id, list);
      }
    }
    if (snap.meta) {
      const month = monthIndex(snap.meta.date);
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
