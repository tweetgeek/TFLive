import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AlertType, Backfill, Mute, MuteKind, Snapshot } from '@tflive/shared';

export interface GlobalRow { month: number; balance: number | null; loan: number | null; operatingResult: number | null; runningCosts: number | null; vehicles: number | null; lines: number | null }
export interface LineRow { month: number; lineId: number; operatingResult: number | null; loadRatio: number | null; vehicles: number | null }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (save_id TEXT PRIMARY KEY, map_name TEXT, last_game_time INTEGER);
CREATE TABLE IF NOT EXISTS metrics_global (save_id TEXT NOT NULL, month INTEGER NOT NULL, balance INTEGER, loan INTEGER, operating_result INTEGER, running_costs INTEGER, vehicles INTEGER, lines INTEGER, PRIMARY KEY (save_id, month));
CREATE TABLE IF NOT EXISTS metrics_line (save_id TEXT NOT NULL, month INTEGER NOT NULL, line_id INTEGER NOT NULL, operating_result INTEGER, load_ratio REAL, vehicles INTEGER, PRIMARY KEY (save_id, month, line_id));
CREATE TABLE IF NOT EXISTS metrics_town (save_id TEXT NOT NULL, month INTEGER NOT NULL, town_id INTEGER NOT NULL, population INTEGER, PRIMARY KEY (save_id, month, town_id));
CREATE TABLE IF NOT EXISTS metrics_industry (save_id TEXT NOT NULL, month INTEGER NOT NULL, industry_id INTEGER NOT NULL, level INTEGER, PRIMARY KEY (save_id, month, industry_id));
CREATE TABLE IF NOT EXISTS mutes (id INTEGER PRIMARY KEY AUTOINCREMENT, save_id TEXT NOT NULL, alert_type TEXT NOT NULL, entity_id INTEGER, kind TEXT NOT NULL, until_game_time INTEGER);
`;

export class HistoryStore {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  private tx(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  recordMonth(saveId: string, month: number, snap: Snapshot, lineLoad: (lineId: number) => number | null): void {
    const f = snap.finance;
    this.tx(() => {
      this.db
        .prepare(`INSERT INTO metrics_global (save_id, month, balance, loan, operating_result, running_costs, vehicles, lines)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (save_id, month) DO UPDATE SET balance = COALESCE(excluded.balance, metrics_global.balance), loan = COALESCE(excluded.loan, metrics_global.loan),
            operating_result = COALESCE(excluded.operating_result, metrics_global.operating_result), running_costs = COALESCE(excluded.running_costs, metrics_global.running_costs),
            vehicles = excluded.vehicles, lines = excluded.lines`)
        .run(saveId, month, f?.balance ?? null, f?.loan ?? null, f?.operatingResult12m ?? null, f?.runningCosts12m ?? null, snap.vehicles.length, snap.lines.length);
      const line = this.db.prepare(`INSERT INTO metrics_line (save_id, month, line_id, operating_result, load_ratio, vehicles) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (save_id, month, line_id) DO UPDATE SET operating_result = excluded.operating_result, load_ratio = excluded.load_ratio, vehicles = excluded.vehicles`);
      for (const l of snap.lines) line.run(saveId, month, l.id, l.operatingResult12m, lineLoad(l.id), l.vehicleIds.length);
      const town = this.db.prepare(`INSERT INTO metrics_town (save_id, month, town_id, population) VALUES (?, ?, ?, ?)
        ON CONFLICT (save_id, month, town_id) DO UPDATE SET population = excluded.population`);
      for (const t of snap.towns) town.run(saveId, month, t.id, t.population);
      const ind = this.db.prepare(`INSERT INTO metrics_industry (save_id, month, industry_id, level) VALUES (?, ?, ?, ?)
        ON CONFLICT (save_id, month, industry_id) DO UPDATE SET level = excluded.level`);
      for (const i of snap.industries) ind.run(saveId, month, i.id, i.level);
    });
  }

  truncateAfter(saveId: string, month: number): void {
    this.tx(() => {
      for (const table of ['metrics_global', 'metrics_line', 'metrics_town', 'metrics_industry']) {
        this.db.prepare(`DELETE FROM ${table} WHERE save_id = ? AND month > ?`).run(saveId, month);
      }
    });
  }

  applyBackfill(saveId: string, b: Backfill): void {
    this.tx(() => {
      if (b.scope === 'global') {
        const st = this.db.prepare(`INSERT INTO metrics_global (save_id, month, operating_result) VALUES (?, ?, ?)
          ON CONFLICT (save_id, month) DO UPDATE SET operating_result = excluded.operating_result`);
        for (const m of b.months) st.run(saveId, m.month, m.value);
      } else if (b.entityId !== null) {
        const st = this.db.prepare(`INSERT INTO metrics_line (save_id, month, line_id, operating_result) VALUES (?, ?, ?, ?)
          ON CONFLICT (save_id, month, line_id) DO UPDATE SET operating_result = excluded.operating_result`);
        for (const m of b.months) st.run(saveId, m.month, b.entityId, m.value);
      }
    });
  }

  touchGame(saveId: string, mapName: string | null, gameTime: number): void {
    this.db
      .prepare(`INSERT INTO games (save_id, map_name, last_game_time) VALUES (?, ?, ?)
        ON CONFLICT (save_id) DO UPDATE SET map_name = COALESCE(excluded.map_name, games.map_name), last_game_time = excluded.last_game_time`)
      .run(saveId, mapName, gameTime);
  }

  readGlobal(saveId: string): GlobalRow[] {
    return this.db
      .prepare(`SELECT month, balance, loan, operating_result AS operatingResult, running_costs AS runningCosts, vehicles, lines
        FROM metrics_global WHERE save_id = ? ORDER BY month`)
      .all(saveId) as unknown as GlobalRow[];
  }

  readLines(saveId: string, lineId: number): LineRow[] {
    return this.db
      .prepare(`SELECT month, line_id AS lineId, operating_result AS operatingResult, load_ratio AS loadRatio, vehicles
        FROM metrics_line WHERE save_id = ? AND line_id = ? ORDER BY month`)
      .all(saveId, lineId) as unknown as LineRow[];
  }

  readTowns(saveId: string): { month: number; townId: number; population: number }[] {
    return this.db
      .prepare('SELECT month, town_id AS townId, population FROM metrics_town WHERE save_id = ? ORDER BY month, town_id')
      .all(saveId) as unknown as { month: number; townId: number; population: number }[];
  }

  listMutes(saveId: string): Mute[] {
    const rows = this.db
      .prepare('SELECT id, save_id, alert_type, entity_id, kind, until_game_time FROM mutes WHERE save_id = ? ORDER BY id')
      .all(saveId) as { id: number; save_id: string; alert_type: string; entity_id: number | null; kind: string; until_game_time: number | null }[];
    return rows.map((r) => ({ id: r.id, saveId: r.save_id, alertType: r.alert_type as AlertType, entityId: r.entity_id, kind: r.kind as MuteKind, untilGameTime: r.until_game_time }));
  }

  addMute(m: Omit<Mute, 'id'>): Mute {
    const r = this.db
      .prepare('INSERT INTO mutes (save_id, alert_type, entity_id, kind, until_game_time) VALUES (?, ?, ?, ?, ?)')
      .run(m.saveId, m.alertType, m.entityId, m.kind, m.untilGameTime);
    return { ...m, id: Number(r.lastInsertRowid) };
  }

  removeMute(saveId: string, id: number): boolean {
    return this.db.prepare('DELETE FROM mutes WHERE save_id = ? AND id = ?').run(saveId, id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
