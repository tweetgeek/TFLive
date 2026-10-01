import { mkdirSync, mkdtempSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { findGameLog, steamUserdataRoots } from '../src/paths';

describe('steamUserdataRoots', () => {
  it('macOS', () => {
    expect(steamUserdataRoots('darwin', {}, '/Users/a')).toEqual(['/Users/a/Library/Application Support/Steam/userdata']);
  });
  it('Windows używa ProgramFiles(x86) i ProgramFiles', () => {
    expect(steamUserdataRoots('win32', { 'ProgramFiles(x86)': 'D:\\PF86', ProgramFiles: 'D:\\PF' }, 'C:\\Users\\a')).toEqual([
      'D:\\PF86\\Steam\\userdata',
      'D:\\PF\\Steam\\userdata',
    ]);
  });
  it('Windows z wartościami domyślnymi', () => {
    expect(steamUserdataRoots('win32', {}, 'C:\\Users\\a')[0]).toBe('C:\\Program Files (x86)\\Steam\\userdata');
  });
});

describe('findGameLog', () => {
  it('wybiera najnowszy stdout.txt spośród kont Steam', () => {
    const root = mkdtempSync(join(tmpdir(), 'tflive-steam-'));
    const mk = (id: string, mtime: number) => {
      const dir = join(root, id, '3493540', 'local', 'crash_dump');
      mkdirSync(dir, { recursive: true });
      const f = join(dir, 'stdout.txt');
      writeFileSync(f, 'x');
      utimesSync(f, mtime, mtime);
      return f;
    };
    mk('111', 1000);
    const newer = mk('222', 2000);
    mkdirSync(join(root, '333', '999999'), { recursive: true });
    expect(findGameLog([root, join(root, 'nie-istnieje')])).toBe(newer);
  });
  it('zwraca null, gdy nic nie znaleziono', () => {
    expect(findGameLog([join(tmpdir(), 'tflive-brak-' + Date.now())])).toBeNull();
  });
});
