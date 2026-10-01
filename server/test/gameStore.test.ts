import { describe, expect, it } from 'vitest';
import { GameStore } from '../src/store/gameStore';
import { DAY, line, metaLine, parsed, sectionLines, vehicle } from './builders';

const d = (y: number, m: number, day = 1) => ({ y, m, d: day });

describe('GameStore', () => {
  it('stosuje sekcję jednoczęściową', () => {
    const s = new GameStore();
    const [raw] = sectionLines('vehicles', [vehicle()], { seq: 1, gameTime: 4000 });
    const r = s.apply(parsed(raw));
    expect(r.changed).toEqual(['vehicles']);
    expect(s.snapshot().vehicles).toHaveLength(1);
  });

  it('składa partie w dowolnej kolejności dopiero po komplecie', () => {
    const s = new GameStore();
    const rows = [vehicle({ id: 1 }), vehicle({ id: 2 }), vehicle({ id: 3 })];
    const [p1, p2, p3] = sectionLines('vehicles', rows, { seq: 5, gameTime: 4000, parts: 3 });
    expect(s.apply(parsed(p3)).changed).toEqual([]);
    expect(s.apply(parsed(p1)).changed).toEqual([]);
    expect(s.apply(parsed(p2)).changed).toEqual(['vehicles']);
    expect(s.snapshot().vehicles.map((v) => v.id)).toEqual([1, 2, 3]);
  });

  it('nie stosuje partii bez części 1 (start w środku partii), stosuje następną pełną', () => {
    const s = new GameStore();
    const [, p2, p3] = sectionLines('vehicles', [vehicle({ id: 1 }), vehicle({ id: 2 }), vehicle({ id: 3 })], { seq: 5, gameTime: 4000, parts: 3 });
    s.apply(parsed(p2));
    s.apply(parsed(p3));
    expect(s.snapshot().vehicles).toEqual([]);
    const next = sectionLines('vehicles', [vehicle({ id: 7 })], { seq: 6, gameTime: 8000, parts: 1 });
    s.apply(parsed(next[0]));
    expect(s.snapshot().vehicles.map((v) => v.id)).toEqual([7]);
  });

  it('nowszy seq porzuca niekompletną partię', () => {
    const s = new GameStore();
    const old = sectionLines('lines', [line({ id: 1 }), line({ id: 2 })], { seq: 1, gameTime: 4000, parts: 2 });
    const neu = sectionLines('lines', [line({ id: 3 }), line({ id: 4 })], { seq: 2, gameTime: 8000, parts: 2 });
    s.apply(parsed(old[0]));
    s.apply(parsed(neu[0]));
    s.apply(parsed(old[1]));
    expect(s.snapshot().lines).toEqual([]);
    s.apply(parsed(neu[1]));
    expect(s.snapshot().lines.map((l) => l.id)).toEqual([3, 4]);
  });

  it('zmiana saveId emituje game-changed i czyści sekcje', () => {
    const s = new GameStore();
    s.apply(parsed(sectionLines('vehicles', [vehicle()], { seq: 1, gameTime: 4000 })[0]));
    const r = s.apply(parsed(metaLine({ saveId: 'save2', gameTime: 4000, date: d(1900, 1, 2) })));
    expect(r.events).toContainEqual({ type: 'game-changed', saveId: 'save2' });
    expect(s.snapshot().vehicles).toEqual([]);
    expect(s.snapshot().meta?.saveId).toBe('save2');
  });

  it('pierwsza linia emituje game-changed', () => {
    const s = new GameStore();
    const r = s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) })));
    expect(r.events[0]).toEqual({ type: 'game-changed', saveId: 'save1' });
  });

  it('cofnięcie czasu tej samej Rozgrywki emituje rewind i czyści sekcje', () => {
    const s = new GameStore();
    s.apply(parsed(metaLine({ gameTime: 400 * DAY, date: d(1901, 2) })));
    s.apply(parsed(sectionLines('vehicles', [vehicle()], { seq: 2, gameTime: 400 * DAY })[0]));
    const r = s.apply(parsed(metaLine({ seq: 3, gameTime: 100 * DAY, date: d(1900, 4) })));
    expect(r.events).toContainEqual({ type: 'rewind', saveId: 'save1', toGameTime: 100 * DAY, toMonth: 1900 * 12 + 3 });
    expect(s.snapshot().vehicles).toEqual([]);
  });

  it('nie traktuje drobnego cofnięcia (< 1 dzień) jako Cofnięcia', () => {
    const s = new GameStore();
    s.apply(parsed(metaLine({ gameTime: 10_000, date: d(1900, 1, 3) })));
    const r = s.apply(parsed(metaLine({ seq: 2, gameTime: 9_800, date: d(1900, 1, 3) })));
    expect(r.events.filter((e) => e.type === 'rewind')).toEqual([]);
  });

  it('zmiana miesiąca emituje new-month (także dla pierwszego meta)', () => {
    const s = new GameStore();
    const a = s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) })));
    expect(a.events).toContainEqual({ type: 'new-month', saveId: 'save1', month: 1900 * 12 });
    const b = s.apply(parsed(metaLine({ seq: 2, gameTime: 8000, date: d(1900, 1, 3) })));
    expect(b.events.filter((e) => e.type === 'new-month')).toEqual([]);
    const c = s.apply(parsed(metaLine({ seq: 3, gameTime: 140_000, date: d(1900, 2, 5) })));
    expect(c.events).toContainEqual({ type: 'new-month', saveId: 'save1', month: 1900 * 12 + 1 });
  });

  it('backfill emituje zdarzenie i nie zmienia snapshotu', () => {
    const s = new GameStore();
    const [raw] = sectionLines('backfill', { scope: 'global', entityId: null, months: [{ month: 22800, value: 5 }] }, { seq: 1, gameTime: 4000 });
    const r = s.apply(parsed(raw));
    expect(r.events).toContainEqual({ type: 'backfill', saveId: 'save1', data: { scope: 'global', entityId: null, months: [{ month: 22800, value: 5 }] } });
    expect(r.changed).toEqual([]);
  });

  it('niepoprawny payload zwraca błąd i nie zmienia stanu', () => {
    const s = new GameStore();
    const r = s.apply({ header: { schemaVersion: 1, saveId: 'save1', sessionId: 's', seq: 1, gameTime: 1, section: 'stops', part: 1, parts: 1 }, payload: [[1]] });
    expect(r.error).toMatch(/stop/);
    expect(s.snapshot().stops).toEqual([]);
  });

  it('reset czyści saveId, więc kolejna linia znów emituje game-changed', () => {
    const s = new GameStore();
    s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) })));
    s.reset();
    expect(s.saveId()).toBeNull();
    expect(s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) }))).events[0].type).toBe('game-changed');
  });
});
