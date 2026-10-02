import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import type { LineSource, LogReadResult } from './types';

const ID_RE = /Startup session with id ([0-9a-fA-F-]+)/;
const HEAD_BYTES = 4096;
const CHUNK = 1024 * 1024;

export class LogTail implements LineSource {
  private offset = 0;
  private carry: Buffer = Buffer.alloc(0);
  private identity: string | null = null;

  constructor(readonly path: string) {}

  read(): LogReadResult {
    let fd: number;
    try {
      fd = openSync(this.path, 'r');
    } catch {
      return { lines: [], reset: false, missing: true };
    }
    try {
      const size = fstatSync(fd).size;
      const id = this.readIdentity(fd, size);
      let reset = false;
      if (size < this.offset || (id !== null && this.identity !== null && id !== this.identity)) {
        this.offset = 0;
        this.carry = Buffer.alloc(0);
        reset = true;
      }
      if (id !== null) this.identity = id;
      const chunks: Buffer[] = [this.carry];
      while (this.offset < size) {
        const buf = Buffer.alloc(Math.min(CHUNK, size - this.offset));
        const n = readSync(fd, buf, 0, buf.length, this.offset);
        if (n <= 0) break;
        chunks.push(buf.subarray(0, n));
        this.offset += n;
      }
      const data = Buffer.concat(chunks);
      const lastNl = data.lastIndexOf(0x0a);
      if (lastNl < 0) {
        this.carry = data;
        return { lines: [], reset, missing: false };
      }
      this.carry = Buffer.from(data.subarray(lastNl + 1));
      const lines = data
        .subarray(0, lastNl)
        .toString('utf8')
        .split('\n')
        .map((l) => (l.endsWith('\r') ? l.slice(0, -1) : l));
      return { lines, reset, missing: false };
    } finally {
      closeSync(fd);
    }
  }

  private readIdentity(fd: number, size: number): string | null {
    const buf = Buffer.alloc(Math.min(HEAD_BYTES, size));
    if (buf.length === 0) return null;
    readSync(fd, buf, 0, buf.length, 0);
    return ID_RE.exec(buf.toString('utf8'))?.[1] ?? null;
  }
}
