import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG, DEFAULT_CONFIG, loadAlertConfig, loadConfig } from '../src/config';

const tmp = () => mkdtempSync(join(tmpdir(), 'tflive-cfg-'));

describe('loadConfig', () => {
  it('zwraca domyślne wartości, gdy pliku brak', () => {
    expect(loadConfig(join(tmp(), 'brak.json'))).toEqual(DEFAULT_CONFIG);
  });
  it('nadpisuje tylko podane pola', () => {
    const f = join(tmp(), 'c.json');
    writeFileSync(f, JSON.stringify({ port: 9000, logPath: '/x/stdout.txt' }));
    expect(loadConfig(f)).toEqual({ ...DEFAULT_CONFIG, port: 9000, logPath: '/x/stdout.txt' });
  });
  it('rzuca czytelny błąd przy niepoprawnym JSON', () => {
    const f = join(tmp(), 'c.json');
    writeFileSync(f, '{port:');
    expect(() => loadConfig(f)).toThrow(/c\.json/);
  });
});

describe('loadAlertConfig', () => {
  it('scala progi z domyślnymi', () => {
    const f = join(tmp(), 'a.json');
    writeFileSync(f, JSON.stringify({ waitingDays: 45 }));
    expect(loadAlertConfig(f)).toEqual({ ...DEFAULT_ALERT_CONFIG, waitingDays: 45 });
  });
});
