import { readdirSync, statSync } from 'node:fs';
import path from 'node:path';

export const TF3_APP_ID = '3493540';

export function steamUserdataRoots(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[] {
  if (platform === 'win32') {
    const p = path.win32;
    return [
      p.join(env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)', 'Steam', 'userdata'),
      p.join(env.ProgramFiles ?? 'C:\\Program Files', 'Steam', 'userdata'),
    ];
  }
  const p = path.posix;
  if (platform === 'darwin') return [p.join(home, 'Library', 'Application Support', 'Steam', 'userdata')];
  return [p.join(home, '.steam', 'steam', 'userdata'), p.join(home, '.local', 'share', 'Steam', 'userdata')];
}

export function findGameLog(roots: string[], platform: NodeJS.Platform = process.platform): string | null {
  const p = platform === 'win32' ? path.win32 : path.posix;
  let best: { file: string; mtime: number } | null = null;
  for (const root of roots) {
    let ids: string[];
    try {
      ids = readdirSync(root);
    } catch {
      continue;
    }
    for (const id of ids) {
      const file = p.join(root, id, TF3_APP_ID, 'local', 'crash_dump', 'stdout.txt');
      try {
        const mtime = statSync(file).mtimeMs;
        if (!best || mtime > best.mtime) best = { file, mtime };
      } catch {
        // brak logu dla tego konta Steam
      }
    }
  }
  return best?.file ?? null;
}
