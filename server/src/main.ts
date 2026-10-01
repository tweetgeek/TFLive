import { networkInterfaces, homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAlertConfig, loadConfig } from './config';
import { HistoryStore } from './history/historyStore';
import { buildServer } from './http';
import { Hub } from './hub';
import { findGameLog, steamUserdataRoots } from './paths';
import { LogTail } from './source/logTail';
import { ReplaySource } from './source/replay';
import type { LineSource } from './source/types';

const root = fileURLToPath(new URL('../..', import.meta.url));
const demo = process.argv.includes('--demo');
const config = loadConfig(join(root, 'config', 'config.json'));
const alertConfig = loadAlertConfig(join(root, 'config', 'alerts.json'));

const dataDir = join(root, config.dataDir);
const history = new HistoryStore(join(dataDir, demo ? 'demo.sqlite' : 'tflive.sqlite'));

const logPath = demo
  ? join(root, 'server', 'fixtures', 'demo.log')
  : config.logPath ?? findGameLog(steamUserdataRoots(process.platform, process.env, homedir()));
const source: LineSource | null = logPath ? (demo ? new ReplaySource(logPath) : new LogTail(logPath)) : null;

const hub = new Hub({ history, config: alertConfig, staleMs: config.staleMs, logPath });
const app = await buildServer({ hub, webDir: join(root, 'web', 'dist') });
await app.listen({ port: config.port, host: config.host });

const tick = () => {
  try {
    hub.ingest(source ? source.read() : { lines: [], reset: false, missing: true });
  } catch (e) {
    console.error('[TFLive] błąd przetwarzania logu:', e);
  }
};
setInterval(tick, demo ? 2000 : config.pollMs);
setInterval(() => {
  try {
    hub.emit('update', hub.state());
  } catch (e) {
    console.error('[TFLive] błąd przetwarzania logu:', e);
  }
}, 5000);
tick();

const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
console.log(`TFLive ${demo ? '(demo) ' : ''}działa:`);
console.log(`  lokalnie:  http://localhost:${config.port}`);
for (const ip of ips) console.log(`  w sieci:   http://${ip}:${config.port}`);
console.log(logPath ? `  log gry:   ${logPath}` : '  log gry:   NIE ZNALEZIONO — ustaw "logPath" w config/config.json');
