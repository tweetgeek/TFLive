import { cpSync, existsSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { steamUserdataRoots, TF3_APP_ID } from '../src/paths';

export function modsDirs(roots: string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    let ids: string[];
    try {
      ids = readdirSync(root);
    } catch {
      continue;
    }
    for (const id of ids) {
      const local = join(root, id, TF3_APP_ID, 'local');
      if (existsSync(local)) out.push(join(local, 'mods'));
    }
  }
  return out;
}

export function installMod(src: string, targets: string[], opts: { dryRun?: boolean } = {}): string[] {
  const done: string[] = [];
  for (const mods of targets) {
    const dest = join(mods, 'tflive');
    if (!opts.dryRun) {
      mkdirSync(mods, { recursive: true });
      rmSync(dest, { recursive: true, force: true });
      cpSync(src, dest, { recursive: true });
    }
    done.push(dest);
  }
  return done;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const dryRun = process.argv.includes('--dry-run');
  const src = fileURLToPath(new URL('../../mod/tflive', import.meta.url));
  const targets = modsDirs(steamUserdataRoots(process.platform, process.env, homedir()));
  if (targets.length === 0) {
    console.error('Nie znaleziono katalogu Transport Fever 3 w Steam (userdata/<id>/3493540/local). Uruchom grę raz albo skopiuj mod/tflive ręcznie.');
    process.exit(1);
  }
  for (const dest of installMod(src, targets, { dryRun })) console.log(`${dryRun ? '[dry-run] ' : ''}mod zainstalowany: ${dest}`);
  console.log('Włącz mod „tflive" w menu modów gry.');
}
