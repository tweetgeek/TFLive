import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { ReplaySource } from '../src/source/replay';

describe('ReplaySource', () => {
  it('oddaje linie porcjami kończącymi się na meta, potem zaczyna od nowa', () => {
    const f = join(mkdtempSync(join(tmpdir(), 'tflive-replay-')), 'demo.log');
    writeFileSync(f, ['a  [TFLIVE] 1 s x 1 1 meta 1/1 {}', 'b', 'c  [TFLIVE] 1 s x 2 2 meta 1/1 {}', 'd'].join('\n') + '\n');
    const r = new ReplaySource(f);
    expect(r.read()).toEqual({ lines: ['a  [TFLIVE] 1 s x 1 1 meta 1/1 {}'], reset: false, missing: false });
    expect(r.read().lines).toEqual(['b', 'c  [TFLIVE] 1 s x 2 2 meta 1/1 {}']);
    expect(r.read().lines).toEqual(['d']);
    expect(r.read()).toMatchObject({ reset: true, lines: ['a  [TFLIVE] 1 s x 1 1 meta 1/1 {}'] });
  });

  it('zgłasza brak pliku', () => {
    expect(new ReplaySource('/nie/ma/demo.log').read()).toEqual({ lines: [], reset: false, missing: true });
  });
});
