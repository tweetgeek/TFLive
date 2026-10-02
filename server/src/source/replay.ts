import { readFileSync } from 'node:fs';
import type { LineSource, LogReadResult } from './types';

const META_RE = / meta \d+\/\d+ /;

export class ReplaySource implements LineSource {
  private lines: string[] | null = null;
  private pos = 0;

  constructor(readonly path: string) {}

  read(): LogReadResult {
    if (this.lines === null) {
      try {
        this.lines = readFileSync(this.path, 'utf8').split('\n').filter((l) => l.length > 0);
      } catch {
        return { lines: [], reset: false, missing: true };
      }
    }
    let reset = false;
    if (this.pos >= this.lines.length) {
      this.pos = 0;
      reset = true;
    }
    const out: string[] = [];
    while (this.pos < this.lines.length) {
      const l = this.lines[this.pos++];
      out.push(l);
      if (META_RE.test(l)) break;
    }
    return { lines: out, reset, missing: false };
  }
}
