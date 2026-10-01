import { appendFileSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LogTail } from '../src/source/logTail';

const head = (id: string) => `[t]  Application startup. Hello!\n[t]  Startup session with id ${id}\n`;
const file = () => join(mkdtempSync(join(tmpdir(), 'tflive-log-')), 'stdout.txt');

describe('LogTail', () => {
  it('czyta cały plik przy pierwszym odczycie, potem tylko przyrost', () => {
    const f = file();
    writeFileSync(f, head('aaa') + 'l1\n');
    const t = new LogTail(f);
    expect(t.read()).toEqual({ lines: ['[t]  Application startup. Hello!', '[t]  Startup session with id aaa', 'l1'], reset: false, missing: false });
    appendFileSync(f, 'l2\n');
    expect(t.read().lines).toEqual(['l2']);
    expect(t.read().lines).toEqual([]);
  });

  it('wstrzymuje niepełną ostatnią linię do następnego odczytu', () => {
    const f = file();
    writeFileSync(f, head('aaa') + 'pół');
    const t = new LogTail(f);
    expect(t.read().lines).not.toContain('pół');
    appendFileSync(f, ' linii\n');
    expect(t.read().lines).toEqual(['pół linii']);
  });

  it('nie psuje znaku UTF-8 rozciętego między odczytami', () => {
    const f = file();
    const zet = Buffer.from('ż', 'utf8');
    writeFileSync(f, Buffer.concat([Buffer.from(head('aaa') + 'Ło'), zet.subarray(0, 1)]));
    const t = new LogTail(f);
    t.read();
    appendFileSync(f, Buffer.concat([zet.subarray(1), Buffer.from('a\n')]));
    expect(t.read().lines).toEqual(['Łoża']);
  });

  it('usuwa \\r z końców linii', () => {
    const f = file();
    writeFileSync(f, head('aaa') + 'win\r\n');
    expect(new LogTail(f).read().lines.at(-1)).toBe('win');
  });

  it('wykrywa skrócenie pliku jako restart gry', () => {
    const f = file();
    writeFileSync(f, head('aaa') + 'x'.repeat(500) + '\n');
    const t = new LogTail(f);
    t.read();
    writeFileSync(f, 'nowy\n');
    expect(t.read()).toEqual({ lines: ['nowy'], reset: true, missing: false });
  });

  it('wykrywa nowy log po identyfikatorze sesji, nawet gdy jest dłuższy', () => {
    const f = file();
    writeFileSync(f, head('aaa') + 'stare\n');
    const t = new LogTail(f);
    t.read();
    writeFileSync(f, head('bbb') + 'y'.repeat(2000) + '\nnowe\n');
    const r = t.read();
    expect(r.reset).toBe(true);
    expect(r.lines.at(-1)).toBe('nowe');
    expect(r.lines[1]).toContain('bbb');
  });

  it('zgłasza brak pliku i podejmuje odczyt, gdy się pojawi', () => {
    const f = file();
    const t = new LogTail(f);
    expect(t.read()).toEqual({ lines: [], reset: false, missing: true });
    writeFileSync(f, head('ccc'));
    expect(t.read().missing).toBe(false);
    rmSync(f);
    expect(t.read().missing).toBe(true);
  });
});
