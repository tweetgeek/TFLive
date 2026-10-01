import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { SECTIONS, type AlertType, type Backfill, type MonthValue, type Mute, type MuteKind, type SectionName, type Snapshot } from '@tflive/shared';

export interface GlobalRow { month: number; balance: number | null; loan: number | null; operatingResult: number | null; runningCosts12m: number | null; vehicles: number | null; lines: number | null }
export interface LineRow { month: number; lineId: number; operatingResult: number | null; loadRatio: number | null; vehicles: number | null }

const ALL_SECTIONS: ReadonlySet<SectionName> = new Set(SECTIONS);

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (save_id TEXT PRIMARY KEY, map_name TEXT, last_game_time INTEGER);
CREATE TABLE IF NOT EXISTS metrics_global (save_id TEXT NOT NULL, month INTEGER NOT NULL, balance INTEGER, loan INTEGER, operating_result INTEGER, running_costs_12m INTEGER, vehicles INTEGER, lines INTEGER, PRIMARY KEY (save_id, month));
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

  /**
   * Zapisuje wiersz miesiąca (stan z końca miesiąca). Kolumny Wyniku operacyjnego dostają wyłącznie
   * wartości miesięczne z `operatingResultByMonth` (firmy i linii), nigdy wartości z Okna kroczącego.
   * Każda tabela jest zapisywana tylko z sekcji obecnych w `seen` (dotarły od ostatniego resetu);
   * liczniki Pojazdów/Linii bez swojej sekcji zostawiają istniejącą wartość.
   */
  recordMonth(saveId: string, month: number, snap: Snapshot, lineLoad: (lineId: number) => number | null, seen: ReadonlySet<SectionName> = ALL_SECTIONS): void {
    const f = seen.has('finance') ? snap.finance : null;
    this.tx(() => {
      if (f) {
        this.db
          .prepare(`INSERT INTO metrics_global (save_id, month, balance, loan, running_costs_12m, vehicles, lines)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (save_id, month) DO UPDATE SET balance = COALESCE(excluded.balance, metrics_global.balance), loan = COALESCE(excluded.loan, metrics_global.loan),
            running_costs_12m = COALESCE(excluded.running_costs_12m, metrics_global.running_costs_12m),
            vehicles = COALESCE(excluded.vehicles, metrics_global.vehicles), lines = COALESCE(excluded.lines, metrics_global.lines)`)
          .run(saveId, month, f.balance, f.loan, f.runningCosts12m, seen.has('vehicles') ? snap.vehicles.length : null, seen.has('lines') ? snap.lines.length : null);
        this.upsertGlobalOps(saveId, f.operatingResultByMonth);
      }
      const line = this.db.prepare(`INSERT INTO metrics_line (save_id, month, line_id, load_ratio, vehicles) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT (save_id, month, line_id) DO UPDATE SET load_ratio = COALESCE(excluded.load_ratio, metrics_line.load_ratio), vehicles = excluded.vehicles`);
      if (seen.has('lines')) {
        for (const l of snap.lines) {
          line.run(saveId, month, l.id, lineLoad(l.id), l.vehicleIds.length);
          this.upsertLineOps(saveId, l.id, l.operatingResultByMonth);
        }
      }
      const town = this.db.prepare(`INSERT INTO metrics_town (save_id, month, town_id, population) VALUES (?, ?, ?, ?)
        ON CONFLICT (save_id, month, town_id) DO UPDATE SET population = excluded.population`);
      if (seen.has('towns')) for (const t of snap.towns) town.run(saveId, month, t.id, t.population);
      const ind = this.db.prepare(`INSERT INTO metrics_industry (save_id, month, industry_id, level) VALUES (?, ?, ?, ?)
        ON CONFLICT (save_id, month, industry_id) DO UPDATE SET level = excluded.level`);
      if (seen.has('industries')) for (const i of snap.industries) ind.run(saveId, month, i.id, i.level);
    });
  }

  private upsertGlobalOps(saveId: string, months: MonthValue[]): void {
    const st = this.db.prepare(`INSERT INTO metrics_global (save_id, month, operating_result) VALUES (?, ?, ?)
      ON CONFLICT (save_id, month) DO UPDATE SET operating_result = excluded.operating_result`);
    for (const m of months) st.run(saveId, m.month, m.value);
  }

  private upsertLineOps(saveId: string, lineId: number, months: MonthValue[]): void {
    const st = this.db.prepare(`INSERT INTO metrics_line (save_id, month, line_id, operating_result) VALUES (?, ?, ?, ?)
      ON CONFLICT (save_id, month, line_id) DO UPDATE SET operating_result = excluded.operating_result`);
    for (const m of months) st.run(saveId, m.month, lineId, m.value);
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
      if (b.scope === 'global') this.upsertGlobalOps(saveId, b.months);
      else if (b.entityId !== null) this.upsertLineOps(saveId, b.entityId, b.months);
    });
  }

  touchGame(saveId: string, mapName: string | null, gameTime: number): void {
    this.db
      .prepare(`INSERT INTO games (save_id, map_name, last_game_time) VALUES (?, ?, ?)
        ON CONFLICT (save_id) DO UPDATE SET map_name = COALESCE(excluded.map_name, games.map_name), last_game_time = excluded.last_game_time`)
      .run(saveId, mapName, gameTime);
  }

  /** Ostatnio widziany czas gry Rozgrywki (aktualizowany przy każdym zapisie miesiąca) albo null. */
  lastGameTime(saveId: string): number | null {
    const row = this.db.prepare('SELECT last_game_time FROM games WHERE save_id = ?').get(saveId) as { last_game_time: number | null } | undefined;
    return row?.last_game_time ?? null;
  }

  readGlobal(saveId: string): GlobalRow[] {
    return this.db
      .prepare(`SELECT month, balance, loan, operating_result AS operatingResult, running_costs_12m AS runningCosts12m, vehicles, lines
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
