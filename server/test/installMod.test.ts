import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { installMod, modsDirs } from '../scripts/install-mod';

function fakeSteam() {
  const root = mkdtempSync(join(tmpdir(), 'tflive-steam-'));
  mkdirSync(join(root, '111', '3493540', 'local'), { recursive: true });
  mkdirSync(join(root, '222', '999'), { recursive: true });
  return root;
}
function fakeMod() {
  const src = join(mkdtempSync(join(tmpdir(), 'tflive-mod-')), 'tflive');
  mkdirSync(join(src, 'content', 'tflive'), { recursive: true });
  writeFileSync(join(src, 'mod.json'), '{"modId":"tflive"}');
  writeFileSync(join(src, 'content', 'tflive', 'tflive.script.tl'), 'return {}');
  return src;
}

describe('instalator modu', () => {
  it('znajduje katalogi mods tylko dla kont z TF3', () => {
    const root = fakeSteam();
    expect(modsDirs([root, join(root, 'brak')])).toEqual([join(root, '111', '3493540', 'local', 'mods')]);
  });

  it('kopiuje mod i zastępuje poprzednią wersję', () => {
    const root = fakeSteam();
    const [mods] = modsDirs([root]);
    const target = join(mods, 'tflive');
    mkdirSync(join(target, 'stary'), { recursive: true });
    expect(installMod(fakeMod(), [mods])).toEqual([target]);
    expect(readFileSync(join(target, 'mod.json'), 'utf8')).toContain('tflive');
    expect(existsSync(join(target, 'content', 'tflive', 'tflive.script.tl'))).toBe(true);
    expect(existsSync(join(target, 'stary'))).toBe(false);
  });

  it('dry-run niczego nie zmienia', () => {
    const root = fakeSteam();
    const [mods] = modsDirs([root]);
    expect(installMod(fakeMod(), [mods], { dryRun: true })).toEqual([join(mods, 'tflive')]);
    expect(existsSync(join(mods, 'tflive'))).toBe(false);
  });
});
