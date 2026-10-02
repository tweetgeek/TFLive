import { describe, expect, it } from 'vitest';
import { formatLine, parseLine, SCHEMA_VERSION } from '@tflive/shared';

const PREFIX = '[2026-10-01 18:05:54Z - MESSAGE  - Sim Pool 2       - Main           ]  ';

describe('parseLine', () => {
  it('parsuje poprawną linię z prefiksem gry', () => {
    const raw = PREFIX + '[TFLIVE] 1 abc123 s1 7 10065000 vehicles 2/3 [[1,"Bus"]]';
    const r = parseLine(raw);
    expect(r).toEqual({
      ok: true,
      line: {
        header: { schemaVersion: 1, saveId: 'abc123', sessionId: 's1', seq: 7, gameTime: 10065000, section: 'vehicles', part: 2, parts: 3 },
        payload: [[1, 'Bus']],
      },
    });
  });

  it('ignoruje linie bez kotwicy', () => {
    expect(parseLine(PREFIX + 'Saving to file x')).toEqual({ ok: false, reason: 'not-tflive' });
  });

  it('ignoruje [TFLIVE] cytowane w środku linii błędu Lua', () => {
    const raw = PREFIX + 'ERROR: script.tl:12: debugPrint("[TFLIVE] 1 a b 1 1 meta 1/1 {}")';
    expect(parseLine(raw)).toEqual({ ok: false, reason: 'not-tflive' });
  });

  it('ignoruje linie błędów [TFLIVE-ERR]', () => {
    expect(parseLine(PREFIX + '[TFLIVE-ERR] update: boom')).toEqual({ ok: false, reason: 'not-tflive' });
  });

  it('usuwa \\r z końca linii (Windows)', () => {
    const r = parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta 1/1 {"x":1}\r');
    expect(r.ok && r.line.payload).toEqual({ x: 1 });
  });

  it('zgłasza niepoprawny JSON', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta 1/1 {x')).toEqual({ ok: false, reason: 'bad-json' });
  });

  it('zgłasza nieobsługiwaną wersję schematu', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 2 a b 1 2 meta 1/1 {}')).toEqual({ ok: false, reason: 'unsupported-version', version: 2 });
  });

  it('zgłasza nieznaną sekcję', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 planes 1/1 {}')).toEqual({ ok: false, reason: 'unknown-section' });
  });

  it('zgłasza uszkodzony nagłówek', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta {}')).toEqual({ ok: false, reason: 'bad-header' });
  });

  it('odrzuca część spoza zakresu', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta 3/2 {}')).toEqual({ ok: false, reason: 'bad-header' });
  });
});

describe('formatLine', () => {
  it('tworzy linię, którą parseLine odczytuje z powrotem', () => {
    const text = formatLine({ saveId: 's', sessionId: 'x', seq: 3, gameTime: 4000, section: 'finance', part: 1, parts: 1 }, { bal: 5 });
    expect(text).toBe(`[TFLIVE] ${SCHEMA_VERSION} s x 3 4000 finance 1/1 {"bal":5}`);
    const r = parseLine(PREFIX + text);
    expect(r.ok && r.line.header.section).toBe('finance');
  });
});
