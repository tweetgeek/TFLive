# Plan 1: shared + serwer — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serwer Node, który czyta log gry TF3 (`stdout.txt`), składa linie `[TFLIVE]` w bieżący stan Rozgrywki, liczy alerty, zapisuje Historię i Wyciszenia w SQLite oraz udostępnia stan przez REST i WebSocket. Działa też w trybie demo bez gry.

**Architecture:** Monorepo npm workspaces: `shared/` (format linii logu, model domeny, kodowanie i dekodowanie) oraz `server/`. W serwerze `LogTail` czyta plik przyrostowo, a `GameStore` składa sekcje z partii. `AlertEngine` uruchamia czyste reguły, `HistoryStore` (`node:sqlite`) trwale zapisuje dane, a `Hub` spina te elementy i emituje stan do Fastify (REST + WS). Mod gry (plan 2) i frontend (plan 3) korzystają z kontraktu zdefiniowanego w `shared/`.

**Tech Stack:** Node ≥ 22.13 (testowane na 24.14), TypeScript 5.9 (bez kroku budowania; uruchamianie przez `tsx`), Vitest 5, Fastify 5 + `@fastify/websocket` 11 + `@fastify/static` 10, `node:sqlite`, `ws` 8 (klient w testach).

**Spec:** `docs/superpowers/specs/2026-10-01-tflive-dashboard-design.md` (§2, §4, §4a, §5, §7, §8, §9, §10, §11). Słownik: `CONTEXT.md`. Ustalenia kroku 0: `docs/superpowers/spikes/2026-10-01-krok0-wyniki.md`. ADR: `docs/adr/0002`, `docs/adr/0003`.

## Global Constraints

- Node ≥ 22.13 (`node:sqlite` bez flagi). Brak natywnych zależności npm.
- ESM (`"type": "module"`), TypeScript `strict`, importy bez rozszerzeń (rozwiązywane przez `tsx` i Vitest; `moduleResolution: "Bundler"`).
- Wersja schematu linii: `SCHEMA_VERSION = 1`. Format linii (spec §7.1): `[TFLIVE] <schemaVersion> <saveId> <sessionId> <seq> <gameTime> <sekcja> <część>/<części> <json>`. Kotwica dopasowania: `]  [TFLIVE] `. Maksymalna długość linii: 100 KB (egzekwuje mod; serwer tylko odrzuca linie, których nie da się zdekodować).
- Czas gry w ms. Długość dnia gry (`dayMs`) przychodzi w `meta`; miesiąc = 30 dni, rok = 365 dni (stałe w `shared/src/time.ts`).
- Serwer jest tylko do odczytu wobec gry. Jedyny zapis inicjowany z przeglądarki to Wyciszenia.
- Polling logu co 1 s (`pollMs`). Każdy odczyt: open → read → close, bez trzymania uchwytu (spec §7.6).
- Status „live” wygasa po 15 s bez nowych linii (`staleMs`).
- Teksty alertów po polsku, nazwy pojęć zgodne z `CONTEXT.md`.
- Ścieżki tylko przez `node:path` (`path.win32` / `path.posix` przy jawnym wyborze platformy).
- Każdy commit kończy się stopką:
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K
  ```
  (pominięta w przykładach poleceń `git commit` poniżej. Dodawaj ją zawsze, przez drugie `-m`.)

## Review Focus

- **Linia błędu Lua cytująca `[TFLIVE]` w środku tekstu** (np. `error ... debugPrint("[TFLIVE] ...")`): ma być zignorowana, nie zdekodowana. Test w Task 1 (`parseLine` → `not-tflive`).
- **Serwer startuje w środku partii** (w logu są tylko części 2/3 i 3/3): sekcja nie może zostać zastosowana częściowo. Kolejna pełna partia zostaje zastosowana. Test w Task 5.
- **Dwie Rozgrywki w jednym logu** (gracz wczytał inny zapis): stan, alerty i bufory czyszczone, Historia rozdzielona po `saveId`. Test w Task 11 (Hub).
- **Gra uruchomiona ponownie, a nowy log jest już dłuższy niż stary offset**: restart wykryty po `Startup session with id`, czytanie od początku. Test w Task 4.
- **Cofnięcie** (ta sama Rozgrywka, czas gry cofnięty): Historia po tym miesiącu usunięta, Wyciszenia zostają. Test w Task 10 (HistoryStore) i Task 11 (Hub).

---

## Struktura plików

```
package.json                 workspaces, skrypty
tsconfig.json                wspólna konfiguracja TS (noEmit)
vitest.config.ts
.gitignore
config/config.example.json   przykład konfiguracji serwera
config/alerts.example.json   przykład progów alertów
shared/package.json          @tflive/shared
shared/src/index.ts          re-eksporty
shared/src/wire.ts           SCHEMA_VERSION, LINE_ANCHOR, parseLine, formatLine
shared/src/model.ts          typy domeny (Snapshot, Vehicle, ...), emptySnapshot
shared/src/time.ts           monthIndex, MONTH_DAYS, YEAR_DAYS, monthMs, yearMs
shared/src/decode.ts         decodeSection (wire → model), DecodeError
shared/src/encode.ts         encodeSection (model → wire), dla generatora demo i testów
shared/src/alerts.ts         typy alertów i Wyciszeń
shared/test/*.test.ts
server/package.json          @tflive/server
server/src/config.ts         ServerConfig, loadConfig, AlertConfig, loadAlertConfig
server/src/paths.ts          steamUserdataRoots, findGameLog
server/src/source/types.ts   LineSource, LogReadResult
server/src/source/logTail.ts LogTail (odczyt przyrostowy, tożsamość pliku)
server/src/source/replay.ts  ReplaySource (tryb demo)
server/src/store/gameStore.ts GameStore (partie, sekcje, zdarzenia)
server/src/derive.ts         wartości pochodne (wiek, stan, rezerwa, ...)
server/src/alerts/engine.ts  AlertEngine, Rule, RuleContext, AlertCandidate
server/src/alerts/buffers.ts RuleBuffers (obłożenie, dostawy, pierwsze zobaczenie linii)
server/src/alerts/finance.ts reguły finansowe
server/src/alerts/lines.ts   reguły linii i przystanków
server/src/alerts/vehicles.ts reguły pojazdów
server/src/alerts/supply.ts  reguły przemysłu
server/src/alerts/towns.ts   reguły miast
server/src/alerts/index.ts   ALL_RULES
server/src/history/historyStore.ts HistoryStore (SQLite)
server/src/hub.ts            Hub: spina źródło, store, alerty, historię
server/src/http.ts           buildServer (Fastify: REST + WS + static)
server/src/main.ts           punkt wejścia (npm start / npm run demo)
server/scripts/make-demo-log.ts generator server/fixtures/demo.log
server/test/builders.ts      buildery danych testowych
server/test/*.test.ts
README.md
```

---

### Task 1: Monorepo i format linii (`parseLine`, `formatLine`)

**Files:**
- Create: `package.json`, `tsconfig.json`, `vitest.config.ts`, `.gitignore`
- Create: `shared/package.json`, `shared/src/index.ts`, `shared/src/wire.ts`
- Test: `shared/test/wire.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  ```ts
  export const SCHEMA_VERSION = 1;
  export const LINE_ANCHOR = ']  [TFLIVE] ';
  export const SECTIONS = ['meta','finance','lines','vehicles','industries','towns','stops','backfill'] as const;
  export type SectionName = typeof SECTIONS[number];
  export interface LineHeader { schemaVersion: number; saveId: string; sessionId: string; seq: number; gameTime: number; section: SectionName; part: number; parts: number }
  export interface ParsedLine { header: LineHeader; payload: unknown }
  export type ParseFailure = 'not-tflive' | 'bad-header' | 'unknown-section' | 'bad-json' | 'unsupported-version';
  export type ParseResult = { ok: true; line: ParsedLine } | { ok: false; reason: ParseFailure; version?: number };
  export function parseLine(raw: string): ParseResult;
  export function formatLine(h: Omit<LineHeader, 'schemaVersion'>, payload: unknown): string; // "[TFLIVE] 1 ..."
  ```

- [ ] **Step 1: Utwórz pliki konfiguracyjne**

`package.json`:
```json
{
  "name": "tflive",
  "private": true,
  "type": "module",
  "workspaces": ["shared", "server"],
  "engines": { "node": ">=22.13" },
  "scripts": {
    "test": "vitest run",
    "typecheck": "tsc -p tsconfig.json",
    "start": "tsx server/src/main.ts",
    "demo": "tsx server/src/main.ts --demo",
    "demo:log": "tsx server/scripts/make-demo-log.ts"
  },
  "devDependencies": {
    "@types/node": "^24.19.0",
    "tsx": "^4.23.0",
    "typescript": "~5.9.3",
    "vitest": "^5.0.3"
  }
}
```

`tsconfig.json`:
```json
{
  "compilerOptions": {
    "target": "ES2023",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "types": ["node"]
  },
  "include": ["shared/src", "shared/test", "server/src", "server/test", "server/scripts", "vitest.config.ts"]
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['shared/test/**/*.test.ts', 'server/test/**/*.test.ts'],
  },
});
```

`.gitignore`:
```
node_modules/
server/data/
config/config.json
config/alerts.json
```

`shared/package.json`:
```json
{
  "name": "@tflive/shared",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" }
}
```

`shared/src/index.ts`:
```ts
export * from './wire';
```

- [ ] **Step 2: Zainstaluj zależności**

Run: `npm install`
Expected: kończy się bez błędów; powstaje `package-lock.json` i `node_modules/@tflive/shared` (symlink workspace).

- [ ] **Step 3: Napisz test `shared/test/wire.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { formatLine, parseLine, SCHEMA_VERSION } from '@tflive/shared';

const PREFIX = '[2026-10-01 18:05:54Z - MESSAGE  - Sim Pool 2       - Main           ]  ';

describe('parseLine', () => {
  it('parsuje poprawną linię z prefiksem gry', () => {
    const raw = PREFIX + '[TFLIVE] 1 abc123 s1 7 10065000 vehicles 2/3 [[1,"Bus"]]';
    const r = parseLine(raw);
    expect(r).toEqual({
      ok: true,
      line: {
        header: { schemaVersion: 1, saveId: 'abc123', sessionId: 's1', seq: 7, gameTime: 10065000, section: 'vehicles', part: 2, parts: 3 },
        payload: [[1, 'Bus']],
      },
    });
  });

  it('ignoruje linie bez kotwicy', () => {
    expect(parseLine(PREFIX + 'Saving to file x')).toEqual({ ok: false, reason: 'not-tflive' });
  });

  it('ignoruje [TFLIVE] cytowane w środku linii błędu Lua', () => {
    const raw = PREFIX + 'ERROR: script.tl:12: debugPrint("[TFLIVE] 1 a b 1 1 meta 1/1 {}")';
    expect(parseLine(raw)).toEqual({ ok: false, reason: 'not-tflive' });
  });

  it('usuwa \\r z końca linii (Windows)', () => {
    const r = parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta 1/1 {"x":1}\r');
    expect(r.ok && r.line.payload).toEqual({ x: 1 });
  });

  it('zgłasza niepoprawny JSON', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta 1/1 {x')).toEqual({ ok: false, reason: 'bad-json' });
  });

  it('zgłasza nieobsługiwaną wersję schematu', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 2 a b 1 2 meta 1/1 {}')).toEqual({ ok: false, reason: 'unsupported-version', version: 2 });
  });

  it('zgłasza nieznaną sekcję', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 planes 1/1 {}')).toEqual({ ok: false, reason: 'unknown-section' });
  });

  it('zgłasza uszkodzony nagłówek', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta {}')).toEqual({ ok: false, reason: 'bad-header' });
  });

  it('odrzuca część spoza zakresu', () => {
    expect(parseLine(PREFIX + '[TFLIVE] 1 a b 1 2 meta 3/2 {}')).toEqual({ ok: false, reason: 'bad-header' });
  });
});

describe('formatLine', () => {
  it('tworzy linię, którą parseLine odczytuje z powrotem', () => {
    const text = formatLine({ saveId: 's', sessionId: 'x', seq: 3, gameTime: 4000, section: 'finance', part: 1, parts: 1 }, { bal: 5 });
    expect(text).toBe(`[TFLIVE] ${SCHEMA_VERSION} s x 3 4000 finance 1/1 {"bal":5}`);
    const r = parseLine(PREFIX + text);
    expect(r.ok && r.line.header.section).toBe('finance');
  });
});
```

- [ ] **Step 4: Uruchom test, oczekuj porażki**

Run: `npx vitest run shared/test/wire.test.ts`
Expected: FAIL. Import `parseLine`/`formatLine` nie istnieje (`does not provide an export named`).

- [ ] **Step 5: Zaimplementuj `shared/src/wire.ts`**

```ts
export const SCHEMA_VERSION = 1;
export const LINE_ANCHOR = ']  [TFLIVE] ';

export const SECTIONS = ['meta', 'finance', 'lines', 'vehicles', 'industries', 'towns', 'stops', 'backfill'] as const;
export type SectionName = (typeof SECTIONS)[number];

export interface LineHeader {
  schemaVersion: number;
  saveId: string;
  sessionId: string;
  seq: number;
  gameTime: number;
  section: SectionName;
  part: number;
  parts: number;
}

export interface ParsedLine {
  header: LineHeader;
  payload: unknown;
}

export type ParseFailure = 'not-tflive' | 'bad-header' | 'unknown-section' | 'bad-json' | 'unsupported-version';
export type ParseResult = { ok: true; line: ParsedLine } | { ok: false; reason: ParseFailure; version?: number };

const HEADER_RE = /^(\d+) (\S+) (\S+) (\d+) (\d+) ([a-z]+) (\d+)\/(\d+) (.*)$/s;

function isSection(s: string): s is SectionName {
  return (SECTIONS as readonly string[]).includes(s);
}

export function parseLine(raw: string): ParseResult {
  const at = raw.indexOf(LINE_ANCHOR);
  if (at < 0) return { ok: false, reason: 'not-tflive' };
  const rest = raw.slice(at + LINE_ANCHOR.length).replace(/\r$/, '');
  const version = /^(\d+) /.exec(rest);
  if (!version) return { ok: false, reason: 'bad-header' };
  const schemaVersion = Number(version[1]);
  if (schemaVersion !== SCHEMA_VERSION) return { ok: false, reason: 'unsupported-version', version: schemaVersion };
  const m = HEADER_RE.exec(rest);
  if (!m) return { ok: false, reason: 'bad-header' };
  const [, , saveId, sessionId, seq, gameTime, section, part, parts, json] = m;
  if (!isSection(section)) return { ok: false, reason: 'unknown-section' };
  const partN = Number(part);
  const partsN = Number(parts);
  if (partN < 1 || partsN < 1 || partN > partsN) return { ok: false, reason: 'bad-header' };
  let payload: unknown;
  try {
    payload = JSON.parse(json);
  } catch {
    return { ok: false, reason: 'bad-json' };
  }
  return {
    ok: true,
    line: {
      header: { schemaVersion, saveId, sessionId, seq: Number(seq), gameTime: Number(gameTime), section, part: partN, parts: partsN },
      payload,
    },
  };
}

export function formatLine(h: Omit<LineHeader, 'schemaVersion'>, payload: unknown): string {
  return `[TFLIVE] ${SCHEMA_VERSION} ${h.saveId} ${h.sessionId} ${h.seq} ${h.gameTime} ${h.section} ${h.part}/${h.parts} ${JSON.stringify(payload)}`;
}
```

- [ ] **Step 6: Uruchom testy i typecheck**

Run: `npx vitest run shared/test/wire.test.ts && npm run typecheck`
Expected: 10 passed; `tsc` bez błędów.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore shared/
git commit -m "feat(shared): monorepo i format linii logu [TFLIVE]"
```

---

### Task 2: Model domeny, czas gry, dekodowanie i kodowanie sekcji

**Files:**
- Create: `shared/src/model.ts`, `shared/src/time.ts`, `shared/src/decode.ts`, `shared/src/encode.ts`
- Modify: `shared/src/index.ts`
- Test: `shared/test/decode.test.ts`, `shared/test/time.test.ts`

**Interfaces:**
- Consumes: `SectionName` z Task 1.
- Produces:
  ```ts
  // time.ts
  export const MONTH_DAYS = 30; export const YEAR_DAYS = 365;
  export function monthIndex(date: GameDate): number;  // y*12 + (m-1)
  export function monthMs(dayMs: number): number; export function yearMs(dayMs: number): number;
  // model.ts
  export interface GameDate { y: number; m: number; d: number }
  export interface MetaPayload { date: GameDate; dayMs: number; paused: boolean; speed: number | null; mapName: string | null; bytesWritten: number; errors: string[] }
  export interface Meta extends MetaPayload { saveId: string; sessionId: string; gameTime: number }
  export interface MonthValue { month: number; value: number }
  export interface Finance { balance: number; loan: number; operatingResult12m: number; runningCosts12m: number; investments12m: number | null; operatingResultByMonth: MonthValue[] }
  export interface DepartureLoad { stopIndex: number; load: number; capacity: number; time: number }
  export interface Line { id: number; name: string; mode: string; color: string | null; stopIds: number[]; vehicleIds: number[]; firstLedgerTime: number | null; operatingResult12m: number; investments12m: number | null; departureLoads: DepartureLoad[] }
  export type VehicleState = 'IN_DEPOT' | 'EN_ROUTE' | 'AT_TERMINAL' | 'GOING_TO_DEPOT';
  export interface VehiclePart { model: string; purchaseTime: number; lifespanSec: number; maintenanceState: number }
  export interface Vehicle { id: number; name: string; lineId: number | null; mode: string; state: VehicleState; userStopped: boolean; noPath: boolean; daysAtTerminal: number; daysInDepot: number; load: number; capacity: number; operatingResult12m: number | null; parts: VehiclePart[] }
  export interface IndustryInput { cargo: string; stock: number; lastReceivedTime: number | null }
  export interface IndustryOutput { cargo: string; stock: number; capacity: number }
  export interface Industry { id: number; name: string; type: string; level: number; maxLevel: number; closureTime: number | null; upgradeProgress: number; inputs: IndustryInput[]; outputs: IndustryOutput[]; lastServedTime: number | null }
  export type District = 'RESIDENTIAL' | 'COMMERCIAL' | 'INDUSTRIAL';
  export interface TownNeed { district: District; cargo: string; demand: number; supplied: number | null }
  export interface Town { id: number; name: string; population: number; developmentActive: boolean; noise: number; pollution: number; needs: TownNeed[]; lastServedTime: number | null }
  export interface Stop { id: number; name: string; waiting: { cargo: string; count: number }[]; longestWaitStartTime: number | null }
  export interface Backfill { scope: 'global' | 'line'; entityId: number | null; months: MonthValue[] }
  export interface Snapshot { meta: Meta | null; finance: Finance | null; lines: Line[]; vehicles: Vehicle[]; industries: Industry[]; towns: Town[]; stops: Stop[] }
  export function emptySnapshot(): Snapshot;
  // decode.ts
  export class DecodeError extends Error {}
  export type DecodedSection =
    | { section: 'meta'; data: MetaPayload } | { section: 'finance'; data: Finance }
    | { section: 'lines'; data: Line[] } | { section: 'vehicles'; data: Vehicle[] }
    | { section: 'industries'; data: Industry[] } | { section: 'towns'; data: Town[] }
    | { section: 'stops'; data: Stop[] } | { section: 'backfill'; data: Backfill };
  export function decodeSection(section: SectionName, payload: unknown): DecodedSection; // rzuca DecodeError
  // encode.ts
  export function encodeSection(s: DecodedSection): unknown; // odwrotność decodeSection
  ```

Format przewodowy (kontrakt dla planu 2; kolejność pól w krotkach jest wiążąca):

| Sekcja | Payload |
|---|---|
| `meta` | obiekt `{"date":[y,m,d],"dayMs":n,"paused":0\|1,"speed":n\|null,"map":s\|null,"bytes":n,"errors":[s]}` |
| `finance` | obiekt `{"bal":n,"loan":n,"ops12":n,"run12":n,"inv12":n\|null,"opsM":[[month,value]]}` (`run12` ≥ 0 to wielkość kosztów) |
| `lines` | tablica wierszy `[id,name,mode,color\|null,[stopId],[vehicleId],firstLedger\|null,ops12,inv12\|null,[[stopIndex,load,cap,time]]]` |
| `vehicles` | `[id,name,lineId\|null,mode,state,userStopped01,noPath01,daysAtTerminal,daysInDepot,load,cap,ops12\|null,[[model,purchaseTime,lifespanSec,maint]]]` |
| `industries` | `[id,name,type,level,maxLevel,closure\|null,upgrade,[[cargo,stock,lastRecv\|null]],[[cargo,stock,cap]],lastServed\|null]` |
| `towns` | `[id,name,pop,dev01,noise,pollution,[[district,cargo,demand,supplied\|null]],lastServed\|null]` |
| `stops` | `[id,name,[[cargo,count]],longestWaitStart\|null]` |
| `backfill` | obiekt `{"scope":"global"\|"line","id":n\|null,"months":[[month,value]]}` |

Sekcje tablicowe mogą być dzielone na partie: payload każdej części to tablica wierszy, a serwer skleja je w kolejności części.

- [ ] **Step 1: Napisz `shared/test/time.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { monthIndex, monthMs, yearMs } from '@tflive/shared';

describe('time', () => {
  it('monthIndex liczy miesiące od roku 0', () => {
    expect(monthIndex({ y: 1900, m: 1, d: 1 })).toBe(1900 * 12);
    expect(monthIndex({ y: 1906, m: 12, d: 2 })).toBe(1906 * 12 + 11);
  });
  it('miesiąc = 30 dni, rok = 365 dni', () => {
    expect(monthMs(4000)).toBe(120000);
    expect(yearMs(4000)).toBe(1460000);
  });
});
```

- [ ] **Step 2: Napisz `shared/test/decode.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { decodeSection, DecodeError, encodeSection, type DecodedSection } from '@tflive/shared';

describe('decodeSection', () => {
  it('dekoduje meta z flagami 0/1', () => {
    const d = decodeSection('meta', { date: [1903, 7, 18], dayMs: 4000, paused: 1, speed: 2, map: null, bytes: 1234, errors: ['x'] });
    expect(d).toEqual({
      section: 'meta',
      data: { date: { y: 1903, m: 7, d: 18 }, dayMs: 4000, paused: true, speed: 2, mapName: null, bytesWritten: 1234, errors: ['x'] },
    });
  });

  it('dekoduje pojazd z częściami i null-ami', () => {
    const row = [51559, 'Pociąg 1', null, 'RAIL', 'EN_ROUTE', 0, 1, 3, 0, 120, 200, null, [['loco_a', 2241600, 29220, 0.57]]];
    const d = decodeSection('vehicles', [row]);
    expect(d).toEqual({
      section: 'vehicles',
      data: [{
        id: 51559, name: 'Pociąg 1', lineId: null, mode: 'RAIL', state: 'EN_ROUTE', userStopped: false, noPath: true,
        daysAtTerminal: 3, daysInDepot: 0, load: 120, capacity: 200, operatingResult12m: null,
        parts: [{ model: 'loco_a', purchaseTime: 2241600, lifespanSec: 29220, maintenanceState: 0.57 }],
      }],
    });
  });

  it('odrzuca wiersz o złej liczbie pól', () => {
    expect(() => decodeSection('stops', [[1, 'A', []]])).toThrow(DecodeError);
  });

  it('odrzuca nieznany stan pojazdu', () => {
    const row = [1, 'V', null, 'ROAD', 'FLYING', 0, 0, 0, 0, 0, 0, null, []];
    expect(() => decodeSection('vehicles', [row])).toThrow(/state/);
  });

  it('odrzuca tekst w polu liczbowym', () => {
    expect(() => decodeSection('finance', { bal: 'x', loan: 0, ops12: 0, run12: 0, inv12: null, opsM: [] })).toThrow(/bal/);
  });

  it('encodeSection jest odwrotnością decodeSection dla wszystkich sekcji', () => {
    const samples: DecodedSection[] = [
      { section: 'meta', data: { date: { y: 1900, m: 2, d: 3 }, dayMs: 4000, paused: false, speed: 1, mapName: 'Europa', bytesWritten: 9, errors: [] } },
      { section: 'finance', data: { balance: 1, loan: 2, operatingResult12m: 3, runningCosts12m: 4, investments12m: null, operatingResultByMonth: [{ month: 22800, value: -5 }] } },
      { section: 'lines', data: [{ id: 1, name: 'L1', mode: 'ROAD', color: '#ff0000', stopIds: [5, 6], vehicleIds: [9], firstLedgerTime: 0, operatingResult12m: -7, investments12m: null, departureLoads: [{ stopIndex: 0, load: 10, capacity: 40, time: 4000 }] }] },
      { section: 'vehicles', data: [{ id: 9, name: 'Bus', lineId: 1, mode: 'ROAD', state: 'AT_TERMINAL', userStopped: true, noPath: false, daysAtTerminal: 1, daysInDepot: 0, load: 3, capacity: 40, operatingResult12m: 100, parts: [] }] },
      { section: 'industries', data: [{ id: 3, name: 'Huta', type: 'steel_mill', level: 1, maxLevel: 7, closureTime: null, upgradeProgress: 0.5, inputs: [{ cargo: 'COAL', stock: 0, lastReceivedTime: null }], outputs: [{ cargo: 'STEEL', stock: 10, capacity: 100 }], lastServedTime: 8000 }] },
      { section: 'towns', data: [{ id: 4, name: 'Ełk', population: 900, developmentActive: true, noise: 50, pollution: 2, needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied: 40 }], lastServedTime: null }] },
      { section: 'stops', data: [{ id: 5, name: 'Dworzec', waiting: [{ cargo: 'PASSENGERS', count: 12 }], longestWaitStartTime: 1000 }] },
      { section: 'backfill', data: { scope: 'line', entityId: 1, months: [{ month: 22801, value: 50 }] } },
    ];
    for (const s of samples) {
      expect(decodeSection(s.section, JSON.parse(JSON.stringify(encodeSection(s))))).toEqual(s);
    }
  });
});
```

- [ ] **Step 3: Uruchom, oczekuj porażki**

Run: `npx vitest run shared/test`
Expected: FAIL. Brak eksportów `monthIndex`, `decodeSection`, `encodeSection`.

- [ ] **Step 4: Zaimplementuj `shared/src/model.ts`**

```ts
export interface GameDate { y: number; m: number; d: number }

export interface MetaPayload {
  date: GameDate;
  dayMs: number;
  paused: boolean;
  speed: number | null;
  mapName: string | null;
  bytesWritten: number;
  errors: string[];
}

export interface Meta extends MetaPayload {
  saveId: string;
  sessionId: string;
  gameTime: number;
}

export interface MonthValue { month: number; value: number }

export interface Finance {
  balance: number;
  loan: number;
  operatingResult12m: number;
  runningCosts12m: number;
  investments12m: number | null;
  operatingResultByMonth: MonthValue[];
}

export interface DepartureLoad { stopIndex: number; load: number; capacity: number; time: number }

export interface Line {
  id: number;
  name: string;
  mode: string;
  color: string | null;
  stopIds: number[];
  vehicleIds: number[];
  firstLedgerTime: number | null;
  operatingResult12m: number;
  investments12m: number | null;
  departureLoads: DepartureLoad[];
}

export const VEHICLE_STATES = ['IN_DEPOT', 'EN_ROUTE', 'AT_TERMINAL', 'GOING_TO_DEPOT'] as const;
export type VehicleState = (typeof VEHICLE_STATES)[number];

export interface VehiclePart { model: string; purchaseTime: number; lifespanSec: number; maintenanceState: number }

export interface Vehicle {
  id: number;
  name: string;
  lineId: number | null;
  mode: string;
  state: VehicleState;
  userStopped: boolean;
  noPath: boolean;
  daysAtTerminal: number;
  daysInDepot: number;
  load: number;
  capacity: number;
  operatingResult12m: number | null;
  parts: VehiclePart[];
}

export interface IndustryInput { cargo: string; stock: number; lastReceivedTime: number | null }
export interface IndustryOutput { cargo: string; stock: number; capacity: number }

export interface Industry {
  id: number;
  name: string;
  type: string;
  level: number;
  maxLevel: number;
  closureTime: number | null;
  upgradeProgress: number;
  inputs: IndustryInput[];
  outputs: IndustryOutput[];
  lastServedTime: number | null;
}

export const DISTRICTS = ['RESIDENTIAL', 'COMMERCIAL', 'INDUSTRIAL'] as const;
export type District = (typeof DISTRICTS)[number];

export interface TownNeed { district: District; cargo: string; demand: number; supplied: number | null }

export interface Town {
  id: number;
  name: string;
  population: number;
  developmentActive: boolean;
  noise: number;
  pollution: number;
  needs: TownNeed[];
  lastServedTime: number | null;
}

export interface Stop {
  id: number;
  name: string;
  waiting: { cargo: string; count: number }[];
  longestWaitStartTime: number | null;
}

export interface Backfill { scope: 'global' | 'line'; entityId: number | null; months: MonthValue[] }

export interface Snapshot {
  meta: Meta | null;
  finance: Finance | null;
  lines: Line[];
  vehicles: Vehicle[];
  industries: Industry[];
  towns: Town[];
  stops: Stop[];
}

export function emptySnapshot(): Snapshot {
  return { meta: null, finance: null, lines: [], vehicles: [], industries: [], towns: [], stops: [] };
}
```

- [ ] **Step 5: Zaimplementuj `shared/src/time.ts`**

```ts
import type { GameDate } from './model';

export const MONTH_DAYS = 30;
export const YEAR_DAYS = 365;

export function monthIndex(date: GameDate): number {
  return date.y * 12 + (date.m - 1);
}

export function monthMs(dayMs: number): number {
  return MONTH_DAYS * dayMs;
}

export function yearMs(dayMs: number): number {
  return YEAR_DAYS * dayMs;
}
```

- [ ] **Step 6: Zaimplementuj `shared/src/decode.ts`**

```ts
import { DISTRICTS, VEHICLE_STATES, type Backfill, type District, type Finance, type Industry, type Line, type MetaPayload, type MonthValue, type Stop, type Town, type Vehicle, type VehicleState } from './model';
import type { SectionName } from './wire';

export class DecodeError extends Error {}

export type DecodedSection =
  | { section: 'meta'; data: MetaPayload }
  | { section: 'finance'; data: Finance }
  | { section: 'lines'; data: Line[] }
  | { section: 'vehicles'; data: Vehicle[] }
  | { section: 'industries'; data: Industry[] }
  | { section: 'towns'; data: Town[] }
  | { section: 'stops'; data: Stop[] }
  | { section: 'backfill'; data: Backfill };

function num(v: unknown, f: string): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) throw new DecodeError(`${f}: oczekiwano liczby`);
  return v;
}
function nnum(v: unknown, f: string): number | null {
  return v === null ? null : num(v, f);
}
function str(v: unknown, f: string): string {
  if (typeof v !== 'string') throw new DecodeError(`${f}: oczekiwano tekstu`);
  return v;
}
function nstr(v: unknown, f: string): string | null {
  return v === null ? null : str(v, f);
}
function bool(v: unknown, f: string): boolean {
  if (v === 0 || v === false) return false;
  if (v === 1 || v === true) return true;
  throw new DecodeError(`${f}: oczekiwano 0/1`);
}
function arr(v: unknown, f: string, len?: number): unknown[] {
  if (!Array.isArray(v)) throw new DecodeError(`${f}: oczekiwano tablicy`);
  if (len !== undefined && v.length !== len) throw new DecodeError(`${f}: oczekiwano ${len} pól, jest ${v.length}`);
  return v;
}
function obj(v: unknown, f: string): Record<string, unknown> {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new DecodeError(`${f}: oczekiwano obiektu`);
  return v as Record<string, unknown>;
}
function months(v: unknown, f: string): MonthValue[] {
  return arr(v, f).map((r, i) => {
    const t = arr(r, `${f}[${i}]`, 2);
    return { month: num(t[0], `${f}.month`), value: num(t[1], `${f}.value`) };
  });
}
function state(v: unknown): VehicleState {
  const s = str(v, 'vehicle.state');
  if (!(VEHICLE_STATES as readonly string[]).includes(s)) throw new DecodeError(`vehicle.state: nieznany stan ${s}`);
  return s as VehicleState;
}
function district(v: unknown): District {
  const s = str(v, 'town.need.district');
  if (!(DISTRICTS as readonly string[]).includes(s)) throw new DecodeError(`town.need.district: nieznana dzielnica ${s}`);
  return s as District;
}

function line(r: unknown): Line {
  const t = arr(r, 'line', 10);
  return {
    id: num(t[0], 'line.id'),
    name: str(t[1], 'line.name'),
    mode: str(t[2], 'line.mode'),
    color: nstr(t[3], 'line.color'),
    stopIds: arr(t[4], 'line.stopIds').map((x) => num(x, 'line.stopId')),
    vehicleIds: arr(t[5], 'line.vehicleIds').map((x) => num(x, 'line.vehicleId')),
    firstLedgerTime: nnum(t[6], 'line.firstLedgerTime'),
    operatingResult12m: num(t[7], 'line.ops12'),
    investments12m: nnum(t[8], 'line.inv12'),
    departureLoads: arr(t[9], 'line.departureLoads').map((d) => {
      const x = arr(d, 'line.departureLoad', 4);
      return { stopIndex: num(x[0], 'dl.stopIndex'), load: num(x[1], 'dl.load'), capacity: num(x[2], 'dl.capacity'), time: num(x[3], 'dl.time') };
    }),
  };
}

function vehicle(r: unknown): Vehicle {
  const t = arr(r, 'vehicle', 13);
  return {
    id: num(t[0], 'vehicle.id'),
    name: str(t[1], 'vehicle.name'),
    lineId: nnum(t[2], 'vehicle.lineId'),
    mode: str(t[3], 'vehicle.mode'),
    state: state(t[4]),
    userStopped: bool(t[5], 'vehicle.userStopped'),
    noPath: bool(t[6], 'vehicle.noPath'),
    daysAtTerminal: num(t[7], 'vehicle.daysAtTerminal'),
    daysInDepot: num(t[8], 'vehicle.daysInDepot'),
    load: num(t[9], 'vehicle.load'),
    capacity: num(t[10], 'vehicle.capacity'),
    operatingResult12m: nnum(t[11], 'vehicle.ops12'),
    parts: arr(t[12], 'vehicle.parts').map((p) => {
      const x = arr(p, 'vehicle.part', 4);
      return { model: str(x[0], 'part.model'), purchaseTime: num(x[1], 'part.purchaseTime'), lifespanSec: num(x[2], 'part.lifespanSec'), maintenanceState: num(x[3], 'part.maintenanceState') };
    }),
  };
}

function industry(r: unknown): Industry {
  const t = arr(r, 'industry', 10);
  return {
    id: num(t[0], 'industry.id'),
    name: str(t[1], 'industry.name'),
    type: str(t[2], 'industry.type'),
    level: num(t[3], 'industry.level'),
    maxLevel: num(t[4], 'industry.maxLevel'),
    closureTime: nnum(t[5], 'industry.closure'),
    upgradeProgress: num(t[6], 'industry.upgrade'),
    inputs: arr(t[7], 'industry.inputs').map((i) => {
      const x = arr(i, 'industry.input', 3);
      return { cargo: str(x[0], 'input.cargo'), stock: num(x[1], 'input.stock'), lastReceivedTime: nnum(x[2], 'input.lastReceivedTime') };
    }),
    outputs: arr(t[8], 'industry.outputs').map((o) => {
      const x = arr(o, 'industry.output', 3);
      return { cargo: str(x[0], 'output.cargo'), stock: num(x[1], 'output.stock'), capacity: num(x[2], 'output.capacity') };
    }),
    lastServedTime: nnum(t[9], 'industry.lastServed'),
  };
}

function town(r: unknown): Town {
  const t = arr(r, 'town', 8);
  return {
    id: num(t[0], 'town.id'),
    name: str(t[1], 'town.name'),
    population: num(t[2], 'town.population'),
    developmentActive: bool(t[3], 'town.developmentActive'),
    noise: num(t[4], 'town.noise'),
    pollution: num(t[5], 'town.pollution'),
    needs: arr(t[6], 'town.needs').map((n) => {
      const x = arr(n, 'town.need', 4);
      return { district: district(x[0]), cargo: str(x[1], 'need.cargo'), demand: num(x[2], 'need.demand'), supplied: nnum(x[3], 'need.supplied') };
    }),
    lastServedTime: nnum(t[7], 'town.lastServed'),
  };
}

function stop(r: unknown): Stop {
  const t = arr(r, 'stop', 4);
  return {
    id: num(t[0], 'stop.id'),
    name: str(t[1], 'stop.name'),
    waiting: arr(t[2], 'stop.waiting').map((w) => {
      const x = arr(w, 'stop.waiting', 2);
      return { cargo: str(x[0], 'waiting.cargo'), count: num(x[1], 'waiting.count') };
    }),
    longestWaitStartTime: nnum(t[3], 'stop.longestWaitStart'),
  };
}

export function decodeSection(section: SectionName, payload: unknown): DecodedSection {
  switch (section) {
    case 'meta': {
      const o = obj(payload, 'meta');
      const d = arr(o.date, 'meta.date', 3);
      return {
        section,
        data: {
          date: { y: num(d[0], 'meta.date.y'), m: num(d[1], 'meta.date.m'), d: num(d[2], 'meta.date.d') },
          dayMs: num(o.dayMs, 'meta.dayMs'),
          paused: bool(o.paused, 'meta.paused'),
          speed: nnum(o.speed, 'meta.speed'),
          mapName: nstr(o.map, 'meta.map'),
          bytesWritten: num(o.bytes, 'meta.bytes'),
          errors: arr(o.errors, 'meta.errors').map((e) => str(e, 'meta.error')),
        },
      };
    }
    case 'finance': {
      const o = obj(payload, 'finance');
      return {
        section,
        data: {
          balance: num(o.bal, 'finance.bal'),
          loan: num(o.loan, 'finance.loan'),
          operatingResult12m: num(o.ops12, 'finance.ops12'),
          runningCosts12m: num(o.run12, 'finance.run12'),
          investments12m: nnum(o.inv12, 'finance.inv12'),
          operatingResultByMonth: months(o.opsM, 'finance.opsM'),
        },
      };
    }
    case 'lines': return { section, data: arr(payload, 'lines').map(line) };
    case 'vehicles': return { section, data: arr(payload, 'vehicles').map(vehicle) };
    case 'industries': return { section, data: arr(payload, 'industries').map(industry) };
    case 'towns': return { section, data: arr(payload, 'towns').map(town) };
    case 'stops': return { section, data: arr(payload, 'stops').map(stop) };
    case 'backfill': {
      const o = obj(payload, 'backfill');
      const scope = str(o.scope, 'backfill.scope');
      if (scope !== 'global' && scope !== 'line') throw new DecodeError(`backfill.scope: nieznany zakres ${scope}`);
      return { section, data: { scope, entityId: nnum(o.id, 'backfill.id'), months: months(o.months, 'backfill.months') } };
    }
  }
}
```

- [ ] **Step 7: Zaimplementuj `shared/src/encode.ts`**

```ts
import type { DecodedSection } from './decode';

const b = (v: boolean) => (v ? 1 : 0);

export function encodeSection(s: DecodedSection): unknown {
  switch (s.section) {
    case 'meta': {
      const m = s.data;
      return { date: [m.date.y, m.date.m, m.date.d], dayMs: m.dayMs, paused: b(m.paused), speed: m.speed, map: m.mapName, bytes: m.bytesWritten, errors: m.errors };
    }
    case 'finance': {
      const f = s.data;
      return { bal: f.balance, loan: f.loan, ops12: f.operatingResult12m, run12: f.runningCosts12m, inv12: f.investments12m, opsM: f.operatingResultByMonth.map((x) => [x.month, x.value]) };
    }
    case 'lines':
      return s.data.map((l) => [l.id, l.name, l.mode, l.color, l.stopIds, l.vehicleIds, l.firstLedgerTime, l.operatingResult12m, l.investments12m, l.departureLoads.map((d) => [d.stopIndex, d.load, d.capacity, d.time])]);
    case 'vehicles':
      return s.data.map((v) => [v.id, v.name, v.lineId, v.mode, v.state, b(v.userStopped), b(v.noPath), v.daysAtTerminal, v.daysInDepot, v.load, v.capacity, v.operatingResult12m, v.parts.map((p) => [p.model, p.purchaseTime, p.lifespanSec, p.maintenanceState])]);
    case 'industries':
      return s.data.map((i) => [i.id, i.name, i.type, i.level, i.maxLevel, i.closureTime, i.upgradeProgress, i.inputs.map((x) => [x.cargo, x.stock, x.lastReceivedTime]), i.outputs.map((x) => [x.cargo, x.stock, x.capacity]), i.lastServedTime]);
    case 'towns':
      return s.data.map((t) => [t.id, t.name, t.population, b(t.developmentActive), t.noise, t.pollution, t.needs.map((n) => [n.district, n.cargo, n.demand, n.supplied]), t.lastServedTime]);
    case 'stops':
      return s.data.map((st) => [st.id, st.name, st.waiting.map((w) => [w.cargo, w.count]), st.longestWaitStartTime]);
    case 'backfill':
      return { scope: s.data.scope, id: s.data.entityId, months: s.data.months.map((x) => [x.month, x.value]) };
  }
}
```

- [ ] **Step 8: Rozszerz `shared/src/index.ts`**

```ts
export * from './wire';
export * from './model';
export * from './time';
export * from './decode';
export * from './encode';
```

- [ ] **Step 9: Uruchom testy i typecheck**

Run: `npx vitest run shared/test && npm run typecheck`
Expected: wszystkie testy `shared/test` przechodzą (time 2, decode 6, wire 10); `tsc` bez błędów.

- [ ] **Step 10: Commit**

```bash
git add shared/
git commit -m "feat(shared): model domeny, czas gry, dekodowanie i kodowanie sekcji"
```

---

### Task 3: Konfiguracja serwera i wykrywanie logu gry

**Files:**
- Create: `server/package.json`, `server/src/config.ts`, `server/src/paths.ts`
- Create: `config/config.example.json`, `config/alerts.example.json`
- Test: `server/test/config.test.ts`, `server/test/paths.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  ```ts
  // config.ts
  export interface ServerConfig { port: number; host: string; logPath: string | null; dataDir: string; pollMs: number; staleMs: number }
  export const DEFAULT_CONFIG: ServerConfig;
  export function loadConfig(file: string): ServerConfig;
  export interface AlertConfig { reserveWarnMonths: number; reserveCriticalMonths: number; rampUpMonths: number; lowLoadRatio: number; lowLoadWindowMonths: number; overloadedWaitDays: number; waitingDays: number; idleDays: number; lowConditionRatio: number; missingInputMonths: number; stalledOutputRatio: number; stalledOutputMonths: number; supplyLowRatio: number; supplyDropRatio: number; supplyDropWindowMonths: number; servedWindowMonths: number; snoozeMonths: number }
  export const DEFAULT_ALERT_CONFIG: AlertConfig;
  export function loadAlertConfig(file: string): AlertConfig;
  // paths.ts
  export const TF3_APP_ID = '3493540';
  export function steamUserdataRoots(platform: NodeJS.Platform, env: NodeJS.ProcessEnv, home: string): string[];
  export function findGameLog(roots: string[], platform?: NodeJS.Platform): string | null; // najnowszy stdout.txt
  ```

- [ ] **Step 1: Utwórz `server/package.json`**

```json
{
  "name": "@tflive/server",
  "version": "0.1.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "@fastify/static": "^10.1.5",
    "@fastify/websocket": "^11.3.1",
    "@tflive/shared": "*",
    "fastify": "^5.12.5"
  },
  "devDependencies": {
    "@types/ws": "^8.18.2",
    "ws": "^8.22.0"
  }
}
```

Run: `npm install`
Expected: bez błędów.

- [ ] **Step 2: Napisz `server/test/config.test.ts`**

```ts
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
```

- [ ] **Step 3: Napisz `server/test/paths.test.ts`**

```ts
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
```

- [ ] **Step 4: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/config.test.ts server/test/paths.test.ts`
Expected: FAIL. Brak modułów `../src/config` i `../src/paths`.

- [ ] **Step 5: Zaimplementuj `server/src/config.ts`**

```ts
import { existsSync, readFileSync } from 'node:fs';

export interface ServerConfig {
  port: number;
  host: string;
  logPath: string | null;
  dataDir: string;
  pollMs: number;
  staleMs: number;
}

export const DEFAULT_CONFIG: ServerConfig = {
  port: 8787,
  host: '0.0.0.0',
  logPath: null,
  dataDir: 'server/data',
  pollMs: 1000,
  staleMs: 15000,
};

export interface AlertConfig {
  reserveWarnMonths: number;
  reserveCriticalMonths: number;
  rampUpMonths: number;
  lowLoadRatio: number;
  lowLoadWindowMonths: number;
  overloadedWaitDays: number;
  waitingDays: number;
  idleDays: number;
  lowConditionRatio: number;
  missingInputMonths: number;
  stalledOutputRatio: number;
  stalledOutputMonths: number;
  supplyLowRatio: number;
  supplyDropRatio: number;
  supplyDropWindowMonths: number;
  servedWindowMonths: number;
  snoozeMonths: number;
}

export const DEFAULT_ALERT_CONFIG: AlertConfig = {
  reserveWarnMonths: 3,
  reserveCriticalMonths: 1,
  rampUpMonths: 6,
  lowLoadRatio: 0.25,
  lowLoadWindowMonths: 3,
  overloadedWaitDays: 14,
  waitingDays: 30,
  idleDays: 30,
  lowConditionRatio: 0.5,
  missingInputMonths: 2,
  stalledOutputRatio: 0.8,
  stalledOutputMonths: 1,
  supplyLowRatio: 0.5,
  supplyDropRatio: 0.3,
  supplyDropWindowMonths: 3,
  servedWindowMonths: 12,
  snoozeMonths: 3,
};

function readJson(file: string): Record<string, unknown> {
  if (!existsSync(file)) return {};
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
  } catch (e) {
    throw new Error(`Niepoprawny JSON w ${file}: ${(e as Error).message}`);
  }
}

export function loadConfig(file: string): ServerConfig {
  return { ...DEFAULT_CONFIG, ...readJson(file) } as ServerConfig;
}

export function loadAlertConfig(file: string): AlertConfig {
  return { ...DEFAULT_ALERT_CONFIG, ...readJson(file) } as AlertConfig;
}
```

- [ ] **Step 6: Zaimplementuj `server/src/paths.ts`**

```ts
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
```

- [ ] **Step 7: Utwórz przykłady konfiguracji**

`config/config.example.json`:
```json
{
  "port": 8787,
  "host": "0.0.0.0",
  "logPath": null,
  "dataDir": "server/data",
  "pollMs": 1000,
  "staleMs": 15000
}
```

`config/alerts.example.json`:
```json
{
  "reserveWarnMonths": 3,
  "reserveCriticalMonths": 1,
  "rampUpMonths": 6,
  "lowLoadRatio": 0.25,
  "lowLoadWindowMonths": 3,
  "overloadedWaitDays": 14,
  "waitingDays": 30,
  "idleDays": 30,
  "lowConditionRatio": 0.5,
  "missingInputMonths": 2,
  "stalledOutputRatio": 0.8,
  "stalledOutputMonths": 1,
  "supplyLowRatio": 0.5,
  "supplyDropRatio": 0.3,
  "supplyDropWindowMonths": 3,
  "servedWindowMonths": 12,
  "snoozeMonths": 3
}
```

- [ ] **Step 8: Uruchom testy i typecheck**

Run: `npx vitest run server/test/config.test.ts server/test/paths.test.ts && npm run typecheck`
Expected: 9 passed; `tsc` bez błędów.

- [ ] **Step 9: Commit**

```bash
git add server/package.json server/src/config.ts server/src/paths.ts server/test/config.test.ts server/test/paths.test.ts config/ package-lock.json
git commit -m "feat(server): konfiguracja i wykrywanie logu gry na macOS/Windows"
```

---

### Task 4: `LogTail` — przyrostowy odczyt logu

**Files:**
- Create: `server/src/source/types.ts`, `server/src/source/logTail.ts`
- Test: `server/test/logTail.test.ts`

**Interfaces:**
- Consumes: nic.
- Produces:
  ```ts
  export interface LogReadResult { lines: string[]; reset: boolean; missing: boolean }
  export interface LineSource { read(): LogReadResult; readonly path: string | null }
  export class LogTail implements LineSource {
    constructor(path: string);
    read(): LogReadResult; // reset=true, gdy wykryto nowy plik logu (restart gry); lines bez \r i bez \n
  }
  ```

- [ ] **Step 1: Napisz `server/test/logTail.test.ts`**

```ts
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
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/logTail.test.ts`
Expected: FAIL. Brak modułu `../src/source/logTail`.

- [ ] **Step 3: Zaimplementuj `server/src/source/types.ts`**

```ts
export interface LogReadResult {
  lines: string[];
  reset: boolean;
  missing: boolean;
}

export interface LineSource {
  readonly path: string | null;
  read(): LogReadResult;
}
```

- [ ] **Step 4: Zaimplementuj `server/src/source/logTail.ts`**

```ts
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
```

- [ ] **Step 5: Uruchom testy i typecheck**

Run: `npx vitest run server/test/logTail.test.ts && npm run typecheck`
Expected: 7 passed; `tsc` bez błędów.

- [ ] **Step 6: Commit**

```bash
git add server/src/source server/test/logTail.test.ts
git commit -m "feat(server): LogTail — przyrostowy odczyt logu gry z wykrywaniem restartu"
```

---

### Task 5: `GameStore` — składanie partii i stan Rozgrywki

**Files:**
- Create: `server/src/store/gameStore.ts`
- Create: `server/test/builders.ts` (buildery używane też w Task 6–11)
- Test: `server/test/gameStore.test.ts`

**Interfaces:**
- Consumes: `parseLine`, `formatLine`, `decodeSection`, `encodeSection`, `DecodeError`, `emptySnapshot`, `monthIndex`, typy z `@tflive/shared`.
- Produces:
  ```ts
  export type StoreEvent =
    | { type: 'game-changed'; saveId: string }
    | { type: 'rewind'; saveId: string; toGameTime: number; toMonth: number }
    | { type: 'new-month'; saveId: string; month: number }
    | { type: 'backfill'; saveId: string; data: Backfill };
  export interface ApplyResult { changed: SectionName[]; events: StoreEvent[]; error: string | null }
  export class GameStore {
    apply(line: ParsedLine): ApplyResult;
    snapshot(): Snapshot;
    saveId(): string | null;
    reset(): void; // nowy plik logu: czyści wszystko łącznie z saveId
  }
  // builders.ts
  export const PREFIX: string; // prefiks linii gry
  export function metaLine(o: { saveId?: string; sessionId?: string; seq?: number; gameTime: number; date: GameDate; dayMs?: number; paused?: boolean; bytes?: number }): string;
  export function sectionLines(section: SectionName, data: unknown, o: { saveId?: string; sessionId?: string; seq: number; gameTime: number; parts?: number }): string[]; // data = DecodedSection['data']; dzieli tablicę na `parts` części
  export function parsed(raw: string): ParsedLine; // parseLine z asercją ok
  export function vehicle(p?: Partial<Vehicle>): Vehicle;
  export function line(p?: Partial<Line>): Line;
  export function industry(p?: Partial<Industry>): Industry;
  export function town(p?: Partial<Town>): Town;
  export function stop(p?: Partial<Stop>): Stop;
  export function finance(p?: Partial<Finance>): Finance;
  export function meta(p?: Partial<Meta>): Meta;
  export function snapshot(p?: Partial<Snapshot>): Snapshot; // meta domyślnie meta()
  ```

- [ ] **Step 1: Utwórz `server/test/builders.ts`**

```ts
import { encodeSection, formatLine, parseLine, type DecodedSection, type Finance, type GameDate, type Industry, type Line, type Meta, type ParsedLine, type SectionName, type Snapshot, type Stop, type Town, type Vehicle } from '@tflive/shared';

export const PREFIX = '[2026-10-01 18:05:54Z - MESSAGE  - Sim Pool 2       - Main           ]  ';
export const DAY = 4000;

export function metaLine(o: { saveId?: string; sessionId?: string; seq?: number; gameTime: number; date: GameDate; dayMs?: number; paused?: boolean; bytes?: number }): string {
  const data = { date: o.date, dayMs: o.dayMs ?? DAY, paused: o.paused ?? false, speed: 1, mapName: 'Test', bytesWritten: o.bytes ?? 0, errors: [] };
  return PREFIX + formatLine({ saveId: o.saveId ?? 'save1', sessionId: o.sessionId ?? 'sess1', seq: o.seq ?? 1, gameTime: o.gameTime, section: 'meta', part: 1, parts: 1 }, encodeSection({ section: 'meta', data }));
}

export function sectionLines(section: SectionName, data: unknown, o: { saveId?: string; sessionId?: string; seq: number; gameTime: number; parts?: number }): string[] {
  const encoded = encodeSection({ section, data } as DecodedSection);
  const parts = o.parts ?? 1;
  const rows = Array.isArray(encoded) ? encoded : null;
  const header = (part: number) => ({ saveId: o.saveId ?? 'save1', sessionId: o.sessionId ?? 'sess1', seq: o.seq, gameTime: o.gameTime, section, part, parts });
  if (!rows || parts === 1) return [PREFIX + formatLine(header(1), encoded)];
  const size = Math.ceil(rows.length / parts);
  return Array.from({ length: parts }, (_, i) => PREFIX + formatLine(header(i + 1), rows.slice(i * size, (i + 1) * size)));
}

export function parsed(raw: string): ParsedLine {
  const r = parseLine(raw);
  if (!r.ok) throw new Error(`parseLine: ${r.reason} for ${raw}`);
  return r.line;
}

export function vehicle(p: Partial<Vehicle> = {}): Vehicle {
  return { id: 1, name: 'Pojazd 1', lineId: 10, mode: 'ROAD', state: 'EN_ROUTE', userStopped: false, noPath: false, daysAtTerminal: 0, daysInDepot: 0, load: 10, capacity: 40, operatingResult12m: 1000, parts: [{ model: 'bus_a', purchaseTime: 0, lifespanSec: 29220, maintenanceState: 0.9 }], ...p };
}
export function line(p: Partial<Line> = {}): Line {
  return { id: 10, name: 'Linia 10', mode: 'ROAD', color: null, stopIds: [100, 101], vehicleIds: [1], firstLedgerTime: 0, operatingResult12m: 5000, investments12m: null, departureLoads: [], ...p };
}
export function industry(p: Partial<Industry> = {}): Industry {
  return { id: 20, name: 'Huta', type: 'steel_mill', level: 1, maxLevel: 7, closureTime: null, upgradeProgress: 0, inputs: [{ cargo: 'COAL', stock: 5, lastReceivedTime: null }], outputs: [{ cargo: 'STEEL', stock: 0, capacity: 100 }], lastServedTime: null, ...p };
}
export function town(p: Partial<Town> = {}): Town {
  return { id: 30, name: 'Ełk', population: 1000, developmentActive: true, noise: 0, pollution: 0, needs: [], lastServedTime: null, ...p };
}
export function stop(p: Partial<Stop> = {}): Stop {
  return { id: 100, name: 'Dworzec', waiting: [], longestWaitStartTime: null, ...p };
}
export function finance(p: Partial<Finance> = {}): Finance {
  return { balance: 1_000_000, loan: 0, operatingResult12m: 120_000, runningCosts12m: 120_000, investments12m: null, operatingResultByMonth: [], ...p };
}
export function meta(p: Partial<Meta> = {}): Meta {
  return { saveId: 'save1', sessionId: 'sess1', gameTime: 1000 * DAY, date: { y: 1902, m: 9, d: 28 }, dayMs: DAY, paused: false, speed: 1, mapName: 'Test', bytesWritten: 0, errors: [], ...p };
}
export function snapshot(p: Partial<Snapshot> = {}): Snapshot {
  return { meta: meta(), finance: null, lines: [], vehicles: [], industries: [], towns: [], stops: [], ...p };
}
```

- [ ] **Step 2: Napisz `server/test/gameStore.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { GameStore } from '../src/store/gameStore';
import { DAY, line, metaLine, parsed, sectionLines, vehicle } from './builders';

const d = (y: number, m: number, day = 1) => ({ y, m, d: day });

describe('GameStore', () => {
  it('stosuje sekcję jednoczęściową', () => {
    const s = new GameStore();
    const [raw] = sectionLines('vehicles', [vehicle()], { seq: 1, gameTime: 4000 });
    const r = s.apply(parsed(raw));
    expect(r.changed).toEqual(['vehicles']);
    expect(s.snapshot().vehicles).toHaveLength(1);
  });

  it('składa partie w dowolnej kolejności dopiero po komplecie', () => {
    const s = new GameStore();
    const rows = [vehicle({ id: 1 }), vehicle({ id: 2 }), vehicle({ id: 3 })];
    const [p1, p2, p3] = sectionLines('vehicles', rows, { seq: 5, gameTime: 4000, parts: 3 });
    expect(s.apply(parsed(p3)).changed).toEqual([]);
    expect(s.apply(parsed(p1)).changed).toEqual([]);
    expect(s.apply(parsed(p2)).changed).toEqual(['vehicles']);
    expect(s.snapshot().vehicles.map((v) => v.id)).toEqual([1, 2, 3]);
  });

  it('nie stosuje partii bez części 1 (start w środku partii), stosuje następną pełną', () => {
    const s = new GameStore();
    const [, p2, p3] = sectionLines('vehicles', [vehicle({ id: 1 }), vehicle({ id: 2 }), vehicle({ id: 3 })], { seq: 5, gameTime: 4000, parts: 3 });
    s.apply(parsed(p2));
    s.apply(parsed(p3));
    expect(s.snapshot().vehicles).toEqual([]);
    const next = sectionLines('vehicles', [vehicle({ id: 7 })], { seq: 6, gameTime: 8000, parts: 1 });
    s.apply(parsed(next[0]));
    expect(s.snapshot().vehicles.map((v) => v.id)).toEqual([7]);
  });

  it('nowszy seq porzuca niekompletną partię', () => {
    const s = new GameStore();
    const old = sectionLines('lines', [line({ id: 1 }), line({ id: 2 })], { seq: 1, gameTime: 4000, parts: 2 });
    const neu = sectionLines('lines', [line({ id: 3 }), line({ id: 4 })], { seq: 2, gameTime: 8000, parts: 2 });
    s.apply(parsed(old[0]));
    s.apply(parsed(neu[0]));
    s.apply(parsed(old[1]));
    expect(s.snapshot().lines).toEqual([]);
    s.apply(parsed(neu[1]));
    expect(s.snapshot().lines.map((l) => l.id)).toEqual([3, 4]);
  });

  it('zmiana saveId emituje game-changed i czyści sekcje', () => {
    const s = new GameStore();
    s.apply(parsed(sectionLines('vehicles', [vehicle()], { seq: 1, gameTime: 4000 })[0]));
    const r = s.apply(parsed(metaLine({ saveId: 'save2', gameTime: 4000, date: d(1900, 1, 2) })));
    expect(r.events).toContainEqual({ type: 'game-changed', saveId: 'save2' });
    expect(s.snapshot().vehicles).toEqual([]);
    expect(s.snapshot().meta?.saveId).toBe('save2');
  });

  it('pierwsza linia emituje game-changed', () => {
    const s = new GameStore();
    const r = s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) })));
    expect(r.events[0]).toEqual({ type: 'game-changed', saveId: 'save1' });
  });

  it('cofnięcie czasu tej samej Rozgrywki emituje rewind i czyści sekcje', () => {
    const s = new GameStore();
    s.apply(parsed(metaLine({ gameTime: 400 * DAY, date: d(1901, 2) })));
    s.apply(parsed(sectionLines('vehicles', [vehicle()], { seq: 2, gameTime: 400 * DAY })[0]));
    const r = s.apply(parsed(metaLine({ seq: 3, gameTime: 100 * DAY, date: d(1900, 4) })));
    expect(r.events).toContainEqual({ type: 'rewind', saveId: 'save1', toGameTime: 100 * DAY, toMonth: 1900 * 12 + 3 });
    expect(s.snapshot().vehicles).toEqual([]);
  });

  it('nie traktuje drobnego cofnięcia (< 1 dzień) jako Cofnięcia', () => {
    const s = new GameStore();
    s.apply(parsed(metaLine({ gameTime: 10_000, date: d(1900, 1, 3) })));
    const r = s.apply(parsed(metaLine({ seq: 2, gameTime: 9_800, date: d(1900, 1, 3) })));
    expect(r.events.filter((e) => e.type === 'rewind')).toEqual([]);
  });

  it('zmiana miesiąca emituje new-month (także dla pierwszego meta)', () => {
    const s = new GameStore();
    const a = s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) })));
    expect(a.events).toContainEqual({ type: 'new-month', saveId: 'save1', month: 1900 * 12 });
    const b = s.apply(parsed(metaLine({ seq: 2, gameTime: 8000, date: d(1900, 1, 3) })));
    expect(b.events.filter((e) => e.type === 'new-month')).toEqual([]);
    const c = s.apply(parsed(metaLine({ seq: 3, gameTime: 140_000, date: d(1900, 2, 5) })));
    expect(c.events).toContainEqual({ type: 'new-month', saveId: 'save1', month: 1900 * 12 + 1 });
  });

  it('backfill emituje zdarzenie i nie zmienia snapshotu', () => {
    const s = new GameStore();
    const [raw] = sectionLines('backfill', { scope: 'global', entityId: null, months: [{ month: 22800, value: 5 }] }, { seq: 1, gameTime: 4000 });
    const r = s.apply(parsed(raw));
    expect(r.events).toContainEqual({ type: 'backfill', saveId: 'save1', data: { scope: 'global', entityId: null, months: [{ month: 22800, value: 5 }] } });
    expect(r.changed).toEqual([]);
  });

  it('niepoprawny payload zwraca błąd i nie zmienia stanu', () => {
    const s = new GameStore();
    const r = s.apply({ header: { schemaVersion: 1, saveId: 'save1', sessionId: 's', seq: 1, gameTime: 1, section: 'stops', part: 1, parts: 1 }, payload: [[1]] });
    expect(r.error).toMatch(/stop/);
    expect(s.snapshot().stops).toEqual([]);
  });

  it('reset czyści saveId, więc kolejna linia znów emituje game-changed', () => {
    const s = new GameStore();
    s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) })));
    s.reset();
    expect(s.saveId()).toBeNull();
    expect(s.apply(parsed(metaLine({ gameTime: 4000, date: d(1900, 1, 2) }))).events[0].type).toBe('game-changed');
  });
});
```

- [ ] **Step 3: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/gameStore.test.ts`
Expected: FAIL. Brak modułu `../src/store/gameStore`.

- [ ] **Step 4: Zaimplementuj `server/src/store/gameStore.ts`**

```ts
import { decodeSection, DecodeError, emptySnapshot, monthIndex, type Backfill, type ParsedLine, type SectionName, type Snapshot } from '@tflive/shared';

export type StoreEvent =
  | { type: 'game-changed'; saveId: string }
  | { type: 'rewind'; saveId: string; toGameTime: number; toMonth: number }
  | { type: 'new-month'; saveId: string; month: number }
  | { type: 'backfill'; saveId: string; data: Backfill };

export interface ApplyResult {
  changed: SectionName[];
  events: StoreEvent[];
  error: string | null;
}

interface Pending {
  seq: number;
  parts: number;
  rows: Map<number, unknown>;
}

export class GameStore {
  private snap: Snapshot = emptySnapshot();
  private currentSave: string | null = null;
  private lastGameTime: number | null = null;
  private lastMonth: number | null = null;
  private pending = new Map<SectionName, Pending>();

  snapshot(): Snapshot {
    return this.snap;
  }

  saveId(): string | null {
    return this.currentSave;
  }

  reset(): void {
    this.snap = emptySnapshot();
    this.currentSave = null;
    this.lastGameTime = null;
    this.lastMonth = null;
    this.pending.clear();
  }

  apply(line: ParsedLine): ApplyResult {
    const h = line.header;
    const events: StoreEvent[] = [];
    if (this.currentSave !== h.saveId) {
      this.reset();
      this.currentSave = h.saveId;
      events.push({ type: 'game-changed', saveId: h.saveId });
    }

    const payload = this.assemble(line);
    if (payload === undefined) return { changed: [], events, error: null };

    let decoded;
    try {
      decoded = decodeSection(h.section, payload);
    } catch (e) {
      if (e instanceof DecodeError) return { changed: [], events, error: `${h.section}: ${e.message}` };
      throw e;
    }

    switch (decoded.section) {
      case 'meta': {
        const data = decoded.data;
        if (this.lastGameTime !== null && h.gameTime < this.lastGameTime - data.dayMs) {
          const saveId = h.saveId;
          this.reset();
          this.currentSave = saveId;
          events.push({ type: 'rewind', saveId, toGameTime: h.gameTime, toMonth: monthIndex(data.date) });
        }
        this.snap = { ...this.snap, meta: { ...data, saveId: h.saveId, sessionId: h.sessionId, gameTime: h.gameTime } };
        this.lastGameTime = h.gameTime;
        const month = monthIndex(data.date);
        if (month !== this.lastMonth) events.push({ type: 'new-month', saveId: h.saveId, month });
        this.lastMonth = month;
        return { changed: ['meta'], events, error: null };
      }
      case 'finance':
        this.snap = { ...this.snap, finance: decoded.data };
        return { changed: ['finance'], events, error: null };
      case 'backfill':
        events.push({ type: 'backfill', saveId: h.saveId, data: decoded.data });
        return { changed: [], events, error: null };
      default:
        this.snap = { ...this.snap, [decoded.section]: decoded.data };
        return { changed: [decoded.section], events, error: null };
    }
  }

  private assemble(line: ParsedLine): unknown | undefined {
    const h = line.header;
    if (h.parts === 1) return line.payload;
    let p = this.pending.get(h.section);
    if (!p || p.seq !== h.seq) {
      if (p && h.seq < p.seq) return undefined;
      p = { seq: h.seq, parts: h.parts, rows: new Map() };
      this.pending.set(h.section, p);
    }
    p.rows.set(h.part, line.payload);
    if (p.rows.size < p.parts) return undefined;
    this.pending.delete(h.section);
    const out: unknown[] = [];
    for (let i = 1; i <= p.parts; i++) {
      const rows = p.rows.get(i);
      if (!Array.isArray(rows)) return [[`niepoprawna część ${i}`]];
      out.push(...rows);
    }
    return out;
  }
}
```

Uwaga: przy zepsutej części `assemble` zwraca payload, którego dekoder nie przyjmie. Wynik to `error`, a nie wyjątek.

- [ ] **Step 5: Uruchom testy i typecheck**

Run: `npx vitest run server/test/gameStore.test.ts && npm run typecheck`
Expected: 12 passed; `tsc` bez błędów.

- [ ] **Step 6: Commit**

```bash
git add server/src/store server/test/builders.ts server/test/gameStore.test.ts
git commit -m "feat(server): GameStore — partie, sekcje, zdarzenia Rozgrywki i Cofnięcia"
```

---

### Task 6: Wartości pochodne i rdzeń silnika alertów

**Files:**
- Create: `shared/src/alerts.ts`; Modify: `shared/src/index.ts` (dodaj `export * from './alerts';`)
- Create: `server/src/derive.ts`, `server/src/alerts/engine.ts`, `server/src/alerts/buffers.ts`
- Test: `server/test/derive.test.ts`, `server/test/engine.test.ts`, `server/test/buffers.test.ts`

**Interfaces:**
- Consumes: model z Task 2, `AlertConfig` z Task 3, buildery z Task 5.
- Produces:
  ```ts
  // shared/src/alerts.ts
  export type AlertType = 'low-reserve' | 'negative-operating-result' | 'unprofitable-line' | 'low-line-load' | 'line-without-vehicles' | 'overloaded-stop' | 'vehicle-no-path' | 'vehicle-waiting' | 'vehicle-idle' | 'vehicle-old' | 'vehicle-low-condition' | 'missing-input' | 'stalled-output' | 'closure-threat' | 'supply-drop';
  export type Severity = 'info' | 'warn' | 'critical';
  export type AlertCategory = 'finance' | 'lines' | 'vehicles' | 'supply' | 'towns';
  export type EntityType = 'company' | 'line' | 'stop' | 'vehicle' | 'industry' | 'town';
  export type MuteKind = 'ignore' | 'snooze';
  export interface Mute { id: number; saveId: string; alertType: AlertType; entityId: number | null; kind: MuteKind; untilGameTime: number | null }
  export interface Alert { id: string; type: AlertType; category: AlertCategory; severity: Severity; entityType: EntityType; entityId: number | null; title: string; detail: string; firstSeenGameTime: number; muted: { kind: MuteKind; untilGameTime: number | null } | null }
  // server/src/derive.ts
  export function partLifespanUsage(p: VehiclePart, gameTime: number): number | null;
  export function maxLifespanUsage(v: Vehicle, gameTime: number): number | null;
  export function vehicleAgeMs(v: Vehicle, gameTime: number): number | null;
  export function vehicleCondition(v: Vehicle): number | null;
  export function reserveMonths(f: Finance): number | null;
  // server/src/alerts/engine.ts
  export interface AlertCandidate { type: AlertType; category: AlertCategory; severity: Severity; entityType: EntityType; entityId: number | null; subKey?: string; title: string; detail: string; minDurationMs?: number }
  export interface RuleContext { snap: Snapshot & { meta: Meta }; gameTime: number; dayMs: number; config: AlertConfig; buffers: RuleBuffers }
  export type Rule = (ctx: RuleContext) => AlertCandidate[];
  export function alertId(c: Pick<AlertCandidate, 'type' | 'entityId' | 'subKey'>): string; // "type:entity|company[:subKey]"
  export class AlertEngine { constructor(rules: Rule[]); evaluate(ctx: RuleContext, mutes: Mute[]): Alert[]; reset(): void }
  // server/src/alerts/buffers.ts
  export class RuleBuffers {
    observe(snap: Snapshot): void;
    lineLoadAvg(lineId: number, gameTime: number, windowMs: number): number | null;
    lineFirstSeen(lineId: number): number | null;
    townSupplyAt(townId: number, district: string, cargo: string, month: number): number | null;
    reset(): void;
  }
  ```

- [ ] **Step 1: Napisz `server/test/derive.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { maxLifespanUsage, partLifespanUsage, reserveMonths, vehicleAgeMs, vehicleCondition } from '../src/derive';
import { finance, vehicle } from './builders';

describe('derive', () => {
  it('wykorzystanie żywotności: lifespan w sekundach gry', () => {
    expect(partLifespanUsage({ model: 'a', purchaseTime: 0, lifespanSec: 29220, maintenanceState: 1 }, 29_220_000)).toBe(1);
    expect(partLifespanUsage({ model: 'a', purchaseTime: 0, lifespanSec: 0, maintenanceState: 1 }, 5)).toBeNull();
  });
  it('wiek i stan pojazdu wg najstarszej / najgorszej części', () => {
    const v = vehicle({ parts: [
      { model: 'loco', purchaseTime: 1000, lifespanSec: 10, maintenanceState: 0.4 },
      { model: 'wagon', purchaseTime: 5000, lifespanSec: 1, maintenanceState: 0.9 },
    ] });
    expect(vehicleAgeMs(v, 11_000)).toBe(10_000);
    expect(vehicleCondition(v)).toBe(0.4);
    expect(maxLifespanUsage(v, 11_000)).toBe(6);
  });
  it('pojazd bez części nie ma wieku ani stanu', () => {
    const v = vehicle({ parts: [] });
    expect(vehicleAgeMs(v, 1)).toBeNull();
    expect(vehicleCondition(v)).toBeNull();
    expect(maxLifespanUsage(v, 1)).toBeNull();
  });
  it('rezerwa w miesiącach kosztów bieżących', () => {
    expect(reserveMonths(finance({ balance: 300, runningCosts12m: 1200 }))).toBe(3);
    expect(reserveMonths(finance({ runningCosts12m: 0 }))).toBeNull();
  });
});
```

- [ ] **Step 2: Napisz `server/test/engine.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { AlertEngine, alertId, type Rule, type RuleContext } from '../src/alerts/engine';
import { RuleBuffers } from '../src/alerts/buffers';
import { DAY, meta, snapshot } from './builders';

const ctx = (gameTime: number): RuleContext => ({
  snap: { ...snapshot(), meta: meta({ gameTime }) },
  gameTime,
  dayMs: DAY,
  config: DEFAULT_ALERT_CONFIG,
  buffers: new RuleBuffers(),
});

const always: Rule = () => [{ type: 'vehicle-no-path', category: 'vehicles', severity: 'critical', entityType: 'vehicle', entityId: 7, title: 'T', detail: 'D' }];
const slow: Rule = () => [{ type: 'stalled-output', category: 'supply', severity: 'warn', entityType: 'industry', entityId: 3, subKey: 'STEEL', title: 'S', detail: 'D', minDurationMs: 10 * DAY }];
const info: Rule = () => [{ type: 'low-line-load', category: 'lines', severity: 'info', entityType: 'line', entityId: 1, title: 'I', detail: 'D' }];

describe('AlertEngine', () => {
  it('buduje stabilne id', () => {
    expect(alertId({ type: 'low-reserve', entityId: null })).toBe('low-reserve:company');
    expect(alertId({ type: 'missing-input', entityId: 5, subKey: 'COAL' })).toBe('missing-input:5:COAL');
  });

  it('pamięta firstSeenGameTime między ocenami', () => {
    const e = new AlertEngine([always]);
    expect(e.evaluate(ctx(100), [])[0].firstSeenGameTime).toBe(100);
    expect(e.evaluate(ctx(900), [])[0].firstSeenGameTime).toBe(100);
  });

  it('alert z minDurationMs pojawia się dopiero po upływie czasu', () => {
    const e = new AlertEngine([slow]);
    expect(e.evaluate(ctx(0), [])).toEqual([]);
    expect(e.evaluate(ctx(9 * DAY), [])).toEqual([]);
    expect(e.evaluate(ctx(10 * DAY), [])[0].id).toBe('stalled-output:3:STEEL');
  });

  it('zapomina warunek, który zniknął', () => {
    let on = true;
    const toggled: Rule = (c) => (on ? always(c) : []);
    const e = new AlertEngine([toggled]);
    e.evaluate(ctx(100), []);
    on = false;
    expect(e.evaluate(ctx(200), [])).toEqual([]);
    on = true;
    expect(e.evaluate(ctx(300), [])[0].firstSeenGameTime).toBe(300);
  });

  it('oznacza wyciszone: Ignorowanie zawsze, Odłożenie do czasu', () => {
    const e = new AlertEngine([always]);
    const ignore = { id: 1, saveId: 'save1', alertType: 'vehicle-no-path' as const, entityId: 7, kind: 'ignore' as const, untilGameTime: null };
    expect(e.evaluate(ctx(100), [ignore])[0].muted).toEqual({ kind: 'ignore', untilGameTime: null });
    const snooze = { ...ignore, kind: 'snooze' as const, untilGameTime: 500 };
    expect(e.evaluate(ctx(400), [snooze])[0].muted).toEqual({ kind: 'snooze', untilGameTime: 500 });
    expect(e.evaluate(ctx(500), [snooze])[0].muted).toBeNull();
  });

  it('sortuje: critical, warn, info', () => {
    const e = new AlertEngine([info, always]);
    expect(e.evaluate(ctx(1), []).map((a) => a.severity)).toEqual(['critical', 'info']);
  });

  it('reset zapomina historię warunków', () => {
    const e = new AlertEngine([always]);
    e.evaluate(ctx(100), []);
    e.reset();
    expect(e.evaluate(ctx(200), [])[0].firstSeenGameTime).toBe(200);
  });
});
```

- [ ] **Step 3: Napisz `server/test/buffers.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import { DAY, line, meta, snapshot, town } from './builders';

describe('RuleBuffers', () => {
  it('liczy średnie obłożenie z odjazdów, bez duplikatów i w oknie czasu', () => {
    const b = new RuleBuffers();
    const l = line({ id: 1, departureLoads: [{ stopIndex: 0, load: 10, capacity: 40, time: 1000 }, { stopIndex: 1, load: 30, capacity: 40, time: 2000 }] });
    b.observe(snapshot({ meta: meta({ gameTime: 3000 }), lines: [l] }));
    b.observe(snapshot({ meta: meta({ gameTime: 4000 }), lines: [l] }));
    expect(b.lineLoadAvg(1, 3000, 10_000)).toBe(0.5);
    expect(b.lineLoadAvg(1, 100_000, 10_000)).toBeNull();
    expect(b.lineLoadAvg(2, 3000, 10_000)).toBeNull();
  });

  it('pomija odjazdy z pojemnością 0', () => {
    const b = new RuleBuffers();
    b.observe(snapshot({ lines: [line({ id: 1, departureLoads: [{ stopIndex: 0, load: 0, capacity: 0, time: 1 }] })] }));
    expect(b.lineLoadAvg(1, 1, 10)).toBeNull();
  });

  it('zapamiętuje pierwsze zobaczenie linii', () => {
    const b = new RuleBuffers();
    b.observe(snapshot({ meta: meta({ gameTime: 50 * DAY }), lines: [line({ id: 1 })] }));
    b.observe(snapshot({ meta: meta({ gameTime: 90 * DAY }), lines: [line({ id: 1 })] }));
    expect(b.lineFirstSeen(1)).toBe(50 * DAY);
  });

  it('trzyma miesięczne próbki dostaw do miast', () => {
    const b = new RuleBuffers();
    const t = (supplied: number) => town({ id: 3, needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied }] });
    b.observe(snapshot({ meta: meta({ date: { y: 1900, m: 1, d: 5 } }), towns: [t(80)] }));
    b.observe(snapshot({ meta: meta({ date: { y: 1900, m: 4, d: 5 } }), towns: [t(20)] }));
    expect(b.townSupplyAt(3, 'COMMERCIAL', 'FOOD', 1900 * 12)).toBe(80);
    expect(b.townSupplyAt(3, 'COMMERCIAL', 'FOOD', 1900 * 12 + 3)).toBe(20);
    expect(b.townSupplyAt(3, 'COMMERCIAL', 'FOOD', 1900 * 12 + 1)).toBeNull();
  });
});
```

- [ ] **Step 4: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/derive.test.ts server/test/engine.test.ts server/test/buffers.test.ts`
Expected: FAIL. Brak modułów `derive`, `alerts/engine`, `alerts/buffers`.

- [ ] **Step 5: Zaimplementuj `shared/src/alerts.ts`** (i dopisz eksport w `shared/src/index.ts`)

```ts
export type AlertType =
  | 'low-reserve'
  | 'negative-operating-result'
  | 'unprofitable-line'
  | 'low-line-load'
  | 'line-without-vehicles'
  | 'overloaded-stop'
  | 'vehicle-no-path'
  | 'vehicle-waiting'
  | 'vehicle-idle'
  | 'vehicle-old'
  | 'vehicle-low-condition'
  | 'missing-input'
  | 'stalled-output'
  | 'closure-threat'
  | 'supply-drop';

export type Severity = 'info' | 'warn' | 'critical';
export type AlertCategory = 'finance' | 'lines' | 'vehicles' | 'supply' | 'towns';
export type EntityType = 'company' | 'line' | 'stop' | 'vehicle' | 'industry' | 'town';
export type MuteKind = 'ignore' | 'snooze';

export interface Mute {
  id: number;
  saveId: string;
  alertType: AlertType;
  entityId: number | null;
  kind: MuteKind;
  untilGameTime: number | null;
}

export interface Alert {
  id: string;
  type: AlertType;
  category: AlertCategory;
  severity: Severity;
  entityType: EntityType;
  entityId: number | null;
  title: string;
  detail: string;
  firstSeenGameTime: number;
  muted: { kind: MuteKind; untilGameTime: number | null } | null;
}
```

- [ ] **Step 6: Zaimplementuj `server/src/derive.ts`**

```ts
import type { Finance, Vehicle, VehiclePart } from '@tflive/shared';

export function partLifespanUsage(p: VehiclePart, gameTime: number): number | null {
  if (p.lifespanSec <= 0) return null;
  return (gameTime - p.purchaseTime) / (p.lifespanSec * 1000);
}

export function maxLifespanUsage(v: Vehicle, gameTime: number): number | null {
  const values = v.parts.map((p) => partLifespanUsage(p, gameTime)).filter((x): x is number => x !== null);
  return values.length ? Math.max(...values) : null;
}

export function vehicleAgeMs(v: Vehicle, gameTime: number): number | null {
  if (!v.parts.length) return null;
  return gameTime - Math.min(...v.parts.map((p) => p.purchaseTime));
}

export function vehicleCondition(v: Vehicle): number | null {
  if (!v.parts.length) return null;
  return Math.min(...v.parts.map((p) => p.maintenanceState));
}

export function reserveMonths(f: Finance): number | null {
  if (f.runningCosts12m <= 0) return null;
  return f.balance / (f.runningCosts12m / 12);
}
```

- [ ] **Step 7: Zaimplementuj `server/src/alerts/buffers.ts`**

```ts
import { monthIndex, type Snapshot } from '@tflive/shared';

interface LoadSample { time: number; ratio: number }

export class RuleBuffers {
  private loads = new Map<number, LoadSample[]>();
  private seenDepartures = new Set<string>();
  private firstSeen = new Map<number, number>();
  private supply = new Map<string, Map<number, number>>();

  observe(snap: Snapshot): void {
    const gameTime = snap.meta?.gameTime ?? 0;
    for (const l of snap.lines) {
      if (!this.firstSeen.has(l.id)) this.firstSeen.set(l.id, gameTime);
      for (const d of l.departureLoads) {
        const key = `${l.id}:${d.stopIndex}:${d.time}`;
        if (this.seenDepartures.has(key) || d.capacity <= 0) continue;
        this.seenDepartures.add(key);
        const list = this.loads.get(l.id) ?? [];
        list.push({ time: d.time, ratio: d.load / d.capacity });
        this.loads.set(l.id, list);
      }
    }
    if (snap.meta) {
      const month = monthIndex(snap.meta.date);
      for (const t of snap.towns) {
        for (const n of t.needs) {
          if (n.supplied === null) continue;
          const key = `${t.id}:${n.district}:${n.cargo}`;
          const byMonth = this.supply.get(key) ?? new Map<number, number>();
          byMonth.set(month, n.supplied);
          this.supply.set(key, byMonth);
        }
      }
    }
  }

  lineLoadAvg(lineId: number, gameTime: number, windowMs: number): number | null {
    const samples = (this.loads.get(lineId) ?? []).filter((s) => s.time > gameTime - windowMs && s.time <= gameTime);
    if (!samples.length) return null;
    return samples.reduce((sum, s) => sum + s.ratio, 0) / samples.length;
  }

  lineFirstSeen(lineId: number): number | null {
    return this.firstSeen.get(lineId) ?? null;
  }

  townSupplyAt(townId: number, district: string, cargo: string, month: number): number | null {
    return this.supply.get(`${townId}:${district}:${cargo}`)?.get(month) ?? null;
  }

  reset(): void {
    this.loads.clear();
    this.seenDepartures.clear();
    this.firstSeen.clear();
    this.supply.clear();
  }
}
```

Uwaga: bufory rosną w czasie sesji. Przycinanie próbek starszych niż 13 miesięcy gry jest pomijalną optymalizacją, której nie wymaga spec (YAGNI). Przy problemie z pamięcią dodaj je w osobnym zadaniu.

- [ ] **Step 8: Zaimplementuj `server/src/alerts/engine.ts`**

```ts
import type { Alert, AlertCategory, AlertType, EntityType, Meta, Mute, Severity, Snapshot } from '@tflive/shared';
import type { AlertConfig } from '../config';
import type { RuleBuffers } from './buffers';

export interface AlertCandidate {
  type: AlertType;
  category: AlertCategory;
  severity: Severity;
  entityType: EntityType;
  entityId: number | null;
  subKey?: string;
  title: string;
  detail: string;
  minDurationMs?: number;
}

export interface RuleContext {
  snap: Snapshot & { meta: Meta };
  gameTime: number;
  dayMs: number;
  config: AlertConfig;
  buffers: RuleBuffers;
}

export type Rule = (ctx: RuleContext) => AlertCandidate[];

const SEVERITY_ORDER: Record<Severity, number> = { critical: 0, warn: 1, info: 2 };

export function alertId(c: Pick<AlertCandidate, 'type' | 'entityId' | 'subKey'>): string {
  return `${c.type}:${c.entityId ?? 'company'}${c.subKey ? `:${c.subKey}` : ''}`;
}

export class AlertEngine {
  private since = new Map<string, number>();

  constructor(private readonly rules: Rule[]) {}

  evaluate(ctx: RuleContext, mutes: Mute[]): Alert[] {
    const seen = new Set<string>();
    const out: Alert[] = [];
    for (const c of this.rules.flatMap((r) => r(ctx))) {
      const id = alertId(c);
      seen.add(id);
      const since = this.since.get(id) ?? ctx.gameTime;
      this.since.set(id, since);
      if (ctx.gameTime - since < (c.minDurationMs ?? 0)) continue;
      const mute = mutes.find(
        (m) => m.alertType === c.type && m.entityId === c.entityId && (m.kind === 'ignore' || (m.untilGameTime !== null && m.untilGameTime > ctx.gameTime)),
      );
      out.push({
        id,
        type: c.type,
        category: c.category,
        severity: c.severity,
        entityType: c.entityType,
        entityId: c.entityId,
        title: c.title,
        detail: c.detail,
        firstSeenGameTime: since,
        muted: mute ? { kind: mute.kind, untilGameTime: mute.untilGameTime } : null,
      });
    }
    for (const id of [...this.since.keys()]) if (!seen.has(id)) this.since.delete(id);
    return out.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || a.firstSeenGameTime - b.firstSeenGameTime);
  }

  reset(): void {
    this.since.clear();
  }
}
```

- [ ] **Step 9: Uruchom testy i typecheck**

Run: `npx vitest run server/test/derive.test.ts server/test/engine.test.ts server/test/buffers.test.ts && npm run typecheck`
Expected: 15 passed; `tsc` bez błędów.

- [ ] **Step 10: Commit**

```bash
git add shared/src/alerts.ts shared/src/index.ts server/src/derive.ts server/src/alerts/engine.ts server/src/alerts/buffers.ts server/test/derive.test.ts server/test/engine.test.ts server/test/buffers.test.ts
git commit -m "feat(server): wartości pochodne, silnik alertów i bufory reguł"
```

---

### Task 7: Reguły finansów, linii i przystanków

**Files:**
- Create: `server/src/alerts/finance.ts`, `server/src/alerts/lines.ts`
- Test: `server/test/rules.finance-lines.test.ts`

**Interfaces:**
- Consumes: `Rule`, `RuleContext` (Task 6), `reserveMonths` (Task 6), `monthMs` (Task 2), buildery (Task 5).
- Produces: `export const lowReserve: Rule; export const negativeOperatingResult: Rule;` (finance.ts) oraz `export const unprofitableLine: Rule; export const lowLineLoad: Rule; export const lineWithoutVehicles: Rule; export const overloadedStop: Rule;` (lines.ts).

- [ ] **Step 1: Napisz `server/test/rules.finance-lines.test.ts`**

```ts
import { monthMs } from '@tflive/shared';
import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import type { RuleContext } from '../src/alerts/engine';
import { lowReserve, negativeOperatingResult } from '../src/alerts/finance';
import { lineWithoutVehicles, lowLineLoad, overloadedStop, unprofitableLine } from '../src/alerts/lines';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { DAY, finance, line, meta, snapshot, stop } from './builders';

const M = monthMs(DAY);
function ctx(p: Partial<RuleContext['snap']>, gameTime = 24 * M, buffers = new RuleBuffers()): RuleContext {
  return { snap: { ...snapshot(p), meta: meta({ gameTime }) }, gameTime, dayMs: DAY, config: DEFAULT_ALERT_CONFIG, buffers };
}

describe('lowReserve', () => {
  it('warn poniżej 3 miesięcy, critical poniżej 1', () => {
    expect(lowReserve(ctx({ finance: finance({ balance: 250, runningCosts12m: 1200 }) }))[0].severity).toBe('warn');
    expect(lowReserve(ctx({ finance: finance({ balance: 50, runningCosts12m: 1200 }) }))[0].severity).toBe('critical');
    expect(lowReserve(ctx({ finance: finance({ balance: 300, runningCosts12m: 1200 }) }))).toEqual([]);
  });
  it('brak finansów lub kosztów — brak alertu', () => {
    expect(lowReserve(ctx({ finance: null }))).toEqual([]);
    expect(lowReserve(ctx({ finance: finance({ runningCosts12m: 0 }) }))).toEqual([]);
  });
});

describe('negativeOperatingResult', () => {
  it('suma 3 ostatnich miesięcy < 0', () => {
    const opsM = [{ month: 1, value: 100 }, { month: 2, value: -50 }, { month: 3, value: -40 }, { month: 4, value: -20 }];
    expect(negativeOperatingResult(ctx({ finance: finance({ operatingResultByMonth: opsM }) }))).toHaveLength(1);
  });
  it('mniej niż 3 miesiące danych — brak alertu', () => {
    expect(negativeOperatingResult(ctx({ finance: finance({ operatingResultByMonth: [{ month: 1, value: -5 }] }) }))).toEqual([]);
  });
});

describe('unprofitableLine', () => {
  it('alert po Rozruchu przy ujemnym wyniku', () => {
    expect(unprofitableLine(ctx({ lines: [line({ operatingResult12m: -1, firstLedgerTime: 0 })] }, 7 * M))).toHaveLength(1);
  });
  it('brak alertu w Rozruchu', () => {
    expect(unprofitableLine(ctx({ lines: [line({ operatingResult12m: -1, firstLedgerTime: 2 * M })] }, 7 * M))).toEqual([]);
  });
  it('bez firstLedgerTime używa pierwszego zobaczenia przez serwer', () => {
    const b = new RuleBuffers();
    const l = line({ operatingResult12m: -1, firstLedgerTime: null });
    b.observe(snapshot({ meta: meta({ gameTime: 5 * M }), lines: [l] }));
    expect(unprofitableLine(ctx({ lines: [l] }, 7 * M, b))).toEqual([]);
    expect(unprofitableLine(ctx({ lines: [l] }, 11 * M, b))).toHaveLength(1);
  });
});

describe('lowLineLoad', () => {
  it('info przy średnim obłożeniu < 25%', () => {
    const b = new RuleBuffers();
    const l = line({ id: 10, departureLoads: [{ stopIndex: 0, load: 4, capacity: 40, time: 24 * M - DAY }] });
    b.observe(snapshot({ lines: [l] }));
    const r = lowLineLoad(ctx({ lines: [l] }, 24 * M, b));
    expect(r[0]).toMatchObject({ type: 'low-line-load', severity: 'info', entityId: 10 });
  });
  it('brak danych — brak alertu', () => {
    expect(lowLineLoad(ctx({ lines: [line()] }))).toEqual([]);
  });
});

describe('lineWithoutVehicles', () => {
  it('linia bez pojazdów', () => {
    expect(lineWithoutVehicles(ctx({ lines: [line({ vehicleIds: [] }), line({ id: 11 })] })).map((a) => a.entityId)).toEqual([10]);
  });
});

describe('overloadedStop', () => {
  it('najdłuższe oczekiwanie > 14 dni', () => {
    const g = 24 * M;
    expect(overloadedStop(ctx({ stops: [stop({ longestWaitStartTime: g - 15 * DAY })] }, g))).toHaveLength(1);
    expect(overloadedStop(ctx({ stops: [stop({ longestWaitStartTime: g - 13 * DAY })] }, g))).toEqual([]);
    expect(overloadedStop(ctx({ stops: [stop({ longestWaitStartTime: null })] }, g))).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/rules.finance-lines.test.ts`
Expected: FAIL. Brak modułów `alerts/finance` i `alerts/lines`.

- [ ] **Step 3: Zaimplementuj `server/src/alerts/finance.ts`**

```ts
import { reserveMonths } from '../derive';
import type { Rule } from './engine';

const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');

export const lowReserve: Rule = ({ snap, config }) => {
  const f = snap.finance;
  if (!f) return [];
  const r = reserveMonths(f);
  if (r === null || r >= config.reserveWarnMonths) return [];
  return [{
    type: 'low-reserve',
    category: 'finance',
    severity: r < config.reserveCriticalMonths ? 'critical' : 'warn',
    entityType: 'company',
    entityId: null,
    title: 'Niska rezerwa',
    detail: `Rezerwa: ${r.toFixed(1)} mies. Kosztów bieżących`,
  }];
};

export const negativeOperatingResult: Rule = ({ snap }) => {
  const f = snap.finance;
  if (!f || f.operatingResultByMonth.length < 3) return [];
  const last3 = [...f.operatingResultByMonth].sort((a, b) => a.month - b.month).slice(-3);
  const sum = last3.reduce((s, m) => s + m.value, 0);
  if (sum >= 0) return [];
  return [{
    type: 'negative-operating-result',
    category: 'finance',
    severity: 'warn',
    entityType: 'company',
    entityId: null,
    title: 'Ujemny Wynik operacyjny',
    detail: `Ostatnie 3 miesiące: ${fmt(sum)}`,
  }];
};
```

- [ ] **Step 4: Zaimplementuj `server/src/alerts/lines.ts`**

```ts
import { monthMs } from '@tflive/shared';
import type { Rule } from './engine';

const fmt = (n: number) => Math.round(n).toLocaleString('pl-PL');

export const unprofitableLine: Rule = ({ snap, gameTime, dayMs, config, buffers }) =>
  snap.lines.flatMap((l) => {
    const start = l.firstLedgerTime ?? buffers.lineFirstSeen(l.id) ?? gameTime;
    if (gameTime - start < config.rampUpMonths * monthMs(dayMs) || l.operatingResult12m >= 0) return [];
    return [{
      type: 'unprofitable-line' as const,
      category: 'lines' as const,
      severity: 'warn' as const,
      entityType: 'line' as const,
      entityId: l.id,
      title: `Nierentowna linia: ${l.name}`,
      detail: `Wynik operacyjny (12 mies.): ${fmt(l.operatingResult12m)}`,
    }];
  });

export const lowLineLoad: Rule = ({ snap, gameTime, dayMs, config, buffers }) =>
  snap.lines.flatMap((l) => {
    const avg = buffers.lineLoadAvg(l.id, gameTime, config.lowLoadWindowMonths * monthMs(dayMs));
    if (avg === null || avg >= config.lowLoadRatio) return [];
    return [{
      type: 'low-line-load' as const,
      category: 'lines' as const,
      severity: 'info' as const,
      entityType: 'line' as const,
      entityId: l.id,
      title: `Niskie obłożenie: ${l.name}`,
      detail: `Obłożenie linii: ${Math.round(avg * 100)}% — rozważ mniej Pojazdów`,
    }];
  });

export const lineWithoutVehicles: Rule = ({ snap }) =>
  snap.lines
    .filter((l) => l.vehicleIds.length === 0)
    .map((l) => ({
      type: 'line-without-vehicles' as const,
      category: 'lines' as const,
      severity: 'warn' as const,
      entityType: 'line' as const,
      entityId: l.id,
      title: `Linia bez pojazdów: ${l.name}`,
      detail: 'Do Linii nie jest przypisany żaden Pojazd',
    }));

export const overloadedStop: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.stops.flatMap((s) => {
    if (s.longestWaitStartTime === null) return [];
    const days = (gameTime - s.longestWaitStartTime) / dayMs;
    if (days <= config.overloadedWaitDays) return [];
    return [{
      type: 'overloaded-stop' as const,
      category: 'lines' as const,
      severity: 'warn' as const,
      entityType: 'stop' as const,
      entityId: s.id,
      title: `Przeciążony przystanek: ${s.name}`,
      detail: `Najdłuższe oczekiwanie: ${Math.floor(days)} dni`,
    }];
  });
```

- [ ] **Step 5: Uruchom testy i typecheck**

Run: `npx vitest run server/test/rules.finance-lines.test.ts && npm run typecheck`
Expected: 11 passed; `tsc` bez błędów.

- [ ] **Step 6: Commit**

```bash
git add server/src/alerts/finance.ts server/src/alerts/lines.ts server/test/rules.finance-lines.test.ts
git commit -m "feat(server): reguły alertów finansów, linii i przystanków"
```

---

### Task 8: Reguły pojazdów

**Files:**
- Create: `server/src/alerts/vehicles.ts`
- Test: `server/test/rules.vehicles.test.ts`

**Interfaces:**
- Consumes: `Rule` (Task 6), `maxLifespanUsage`, `vehicleCondition` (Task 6), buildery.
- Produces: `export const vehicleNoPath: Rule; export const vehicleWaiting: Rule; export const vehicleIdle: Rule; export const vehicleOld: Rule; export const vehicleLowCondition: Rule;`

- [ ] **Step 1: Napisz `server/test/rules.vehicles.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import type { RuleContext } from '../src/alerts/engine';
import { vehicleIdle, vehicleLowCondition, vehicleNoPath, vehicleOld, vehicleWaiting } from '../src/alerts/vehicles';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { DAY, meta, snapshot, vehicle } from './builders';

function ctx(vehicles: ReturnType<typeof vehicle>[], gameTime = 1000 * DAY): RuleContext {
  return { snap: { ...snapshot({ vehicles }), meta: meta({ gameTime }) }, gameTime, dayMs: DAY, config: DEFAULT_ALERT_CONFIG, buffers: new RuleBuffers() };
}

describe('reguły pojazdów', () => {
  it('Pojazd bez trasy: critical', () => {
    expect(vehicleNoPath(ctx([vehicle({ noPath: true })]))[0]).toMatchObject({ type: 'vehicle-no-path', severity: 'critical', entityId: 1 });
    expect(vehicleNoPath(ctx([vehicle()]))).toEqual([]);
  });

  it('Pojazd czekający: > 30 dni na przystanku', () => {
    expect(vehicleWaiting(ctx([vehicle({ daysAtTerminal: 31 })]))).toHaveLength(1);
    expect(vehicleWaiting(ctx([vehicle({ daysAtTerminal: 30 })]))).toEqual([]);
  });

  it('Bezczynny pojazd: w zajezdni > 30 dni albo bez linii (z minDuration)', () => {
    expect(vehicleIdle(ctx([vehicle({ daysInDepot: 31 })]))[0].minDurationMs).toBeUndefined();
    expect(vehicleIdle(ctx([vehicle({ lineId: null })]))[0].minDurationMs).toBe(30 * DAY);
    expect(vehicleIdle(ctx([vehicle()]))).toEqual([]);
  });

  it('Pojazd zatrzymany przez gracza nie jest czekający ani bezczynny', () => {
    const v = vehicle({ userStopped: true, daysAtTerminal: 99, daysInDepot: 99, lineId: null });
    expect(vehicleWaiting(ctx([v]))).toEqual([]);
    expect(vehicleIdle(ctx([v]))).toEqual([]);
  });

  it('Stary pojazd: dowolna część ≥ 100% żywotności', () => {
    const parts = [{ model: 'a', purchaseTime: 0, lifespanSec: 1000, maintenanceState: 1 }];
    expect(vehicleOld(ctx([vehicle({ parts })], 1_000_000))).toHaveLength(1);
    expect(vehicleOld(ctx([vehicle({ parts })], 999_999))).toEqual([]);
  });

  it('Niski stan pojazdu: < 50%', () => {
    const parts = [{ model: 'a', purchaseTime: 0, lifespanSec: 1e9, maintenanceState: 0.49 }];
    expect(vehicleLowCondition(ctx([vehicle({ parts })]))).toHaveLength(1);
    expect(vehicleLowCondition(ctx([vehicle({ parts: [] })]))).toEqual([]);
  });
});
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/rules.vehicles.test.ts`
Expected: FAIL. Brak modułu `alerts/vehicles`.

- [ ] **Step 3: Zaimplementuj `server/src/alerts/vehicles.ts`**

```ts
import type { Vehicle } from '@tflive/shared';
import { maxLifespanUsage, vehicleCondition } from '../derive';
import type { AlertCandidate, Rule } from './engine';

function candidate(v: Vehicle, type: AlertCandidate['type'], severity: AlertCandidate['severity'], title: string, detail: string, minDurationMs?: number): AlertCandidate {
  return { type, category: 'vehicles', severity, entityType: 'vehicle', entityId: v.id, title: `${title}: ${v.name}`, detail, ...(minDurationMs !== undefined ? { minDurationMs } : {}) };
}

export const vehicleNoPath: Rule = ({ snap }) =>
  snap.vehicles.filter((v) => v.noPath).map((v) => candidate(v, 'vehicle-no-path', 'critical', 'Pojazd bez trasy', 'Gra nie potrafi wyznaczyć drogi do następnego celu'));

export const vehicleWaiting: Rule = ({ snap, config }) =>
  snap.vehicles
    .filter((v) => !v.userStopped && v.daysAtTerminal > config.waitingDays)
    .map((v) => candidate(v, 'vehicle-waiting', 'warn', 'Pojazd czekający', `Stoi na przystanku od ${v.daysAtTerminal} dni`));

export const vehicleIdle: Rule = ({ snap, config, dayMs }) =>
  snap.vehicles.flatMap((v) => {
    if (v.userStopped) return [];
    if (v.daysInDepot > config.idleDays) return [candidate(v, 'vehicle-idle', 'warn', 'Bezczynny pojazd', `W zajezdni od ${v.daysInDepot} dni`)];
    if (v.lineId === null) return [candidate(v, 'vehicle-idle', 'warn', 'Bezczynny pojazd', 'Pojazd bez Linii', config.idleDays * dayMs)];
    return [];
  });

export const vehicleOld: Rule = ({ snap, gameTime }) =>
  snap.vehicles.flatMap((v) => {
    const usage = maxLifespanUsage(v, gameTime);
    if (usage === null || usage < 1) return [];
    return [candidate(v, 'vehicle-old', 'warn', 'Stary pojazd', `Wykorzystanie żywotności: ${Math.round(usage * 100)}%`)];
  });

export const vehicleLowCondition: Rule = ({ snap, config }) =>
  snap.vehicles.flatMap((v) => {
    const c = vehicleCondition(v);
    if (c === null || c >= config.lowConditionRatio) return [];
    return [candidate(v, 'vehicle-low-condition', 'warn', 'Niski stan pojazdu', `Stan pojazdu: ${Math.round(c * 100)}%`)];
  });
```

- [ ] **Step 4: Uruchom testy i typecheck**

Run: `npx vitest run server/test/rules.vehicles.test.ts && npm run typecheck`
Expected: 6 passed; `tsc` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add server/src/alerts/vehicles.ts server/test/rules.vehicles.test.ts
git commit -m "feat(server): reguły alertów pojazdów"
```

---

### Task 9: Reguły przemysłu i miast, rejestr reguł

**Files:**
- Create: `server/src/alerts/supply.ts`, `server/src/alerts/towns.ts`, `server/src/alerts/index.ts`
- Test: `server/test/rules.supply-towns.test.ts`

**Interfaces:**
- Consumes: `Rule` (Task 6), `monthMs`, `monthIndex` (Task 2), reguły z Task 7–8.
- Produces: `export function isServed(lastServedTime: number | null, gameTime: number, dayMs: number, servedWindowMonths: number): boolean;` (supply.ts), `export const missingInput: Rule; export const stalledOutput: Rule; export const closureThreat: Rule;` (supply.ts), `export const supplyDrop: Rule;` (towns.ts), `export const ALL_RULES: Rule[];` (index.ts).

- [ ] **Step 1: Napisz `server/test/rules.supply-towns.test.ts`**

```ts
import { monthMs } from '@tflive/shared';
import { describe, expect, it } from 'vitest';
import { RuleBuffers } from '../src/alerts/buffers';
import type { RuleContext } from '../src/alerts/engine';
import { ALL_RULES } from '../src/alerts/index';
import { closureThreat, isServed, missingInput, stalledOutput } from '../src/alerts/supply';
import { supplyDrop } from '../src/alerts/towns';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { DAY, industry, meta, snapshot, town } from './builders';

const M = monthMs(DAY);
const G = 30 * M;
const date = { y: 1902, m: 7, d: 1 };
function ctx(p: Partial<RuleContext['snap']>, buffers = new RuleBuffers()): RuleContext {
  return { snap: { ...snapshot(p), meta: meta({ gameTime: G, date }) }, gameTime: G, dayMs: DAY, config: DEFAULT_ALERT_CONFIG, buffers };
}

describe('isServed', () => {
  it('obsłużona w ostatnich 12 miesiącach', () => {
    expect(isServed(G - 11 * M, G, DAY, 12)).toBe(true);
    expect(isServed(G - 13 * M, G, DAY, 12)).toBe(false);
    expect(isServed(null, G, DAY, 12)).toBe(false);
  });
});

describe('reguły przemysłu', () => {
  it('Niedostarczony surowiec: osobny alert dla każdego surowca, tylko Obsługiwana fabryka', () => {
    const ind = industry({ lastServedTime: G - M, inputs: [
      { cargo: 'COAL', stock: 0, lastReceivedTime: G - 3 * M },
      { cargo: 'IRON_ORE', stock: 5, lastReceivedTime: G - M },
    ] });
    const r = missingInput(ctx({ industries: [ind] }));
    expect(r.map((a) => a.subKey)).toEqual(['COAL']);
    expect(missingInput(ctx({ industries: [{ ...ind, lastServedTime: null }] }))).toEqual([]);
  });

  it('Zalegająca produkcja: magazyn ≥ 80% z minDuration 1 miesiąc', () => {
    const ind = industry({ lastServedTime: G, outputs: [{ cargo: 'STEEL', stock: 80, capacity: 100 }, { cargo: 'X', stock: 1, capacity: 0 }] });
    const r = stalledOutput(ctx({ industries: [ind] }));
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ subKey: 'STEEL', minDurationMs: M });
  });

  it('Groźba zamknięcia: critical, z liczbą dni', () => {
    const r = closureThreat(ctx({ industries: [industry({ lastServedTime: G, closureTime: G + 45 * DAY })] }));
    expect(r[0]).toMatchObject({ severity: 'critical' });
    expect(r[0].detail).toContain('45');
    expect(closureThreat(ctx({ industries: [industry({ lastServedTime: G, closureTime: 0 })] }))).toEqual([]);
  });
});

describe('Spadek dostaw', () => {
  const need = (supplied: number | null) => [{ district: 'COMMERCIAL' as const, cargo: 'FOOD', demand: 100, supplied }];

  it('dostarczany towar < 50% potrzeby', () => {
    const t = town({ lastServedTime: G, needs: need(40) });
    expect(supplyDrop(ctx({ towns: [t] }))[0]).toMatchObject({ type: 'supply-drop', subKey: 'COMMERCIAL:FOOD' });
  });

  it('spadek > 30% względem stanu sprzed 3 miesięcy', () => {
    const b = new RuleBuffers();
    b.observe(snapshot({ meta: meta({ date: { y: 1902, m: 4, d: 1 } }), towns: [town({ needs: need(100) })] }));
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(60) })] }, b))).toHaveLength(1);
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(80) })] }, b))).toEqual([]);
  });

  it('Niezaspokojona potrzeba (nigdy nie dostarczana) nie jest alertem', () => {
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(0) })] }))).toEqual([]);
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: G, needs: need(null) })] }))).toEqual([]);
  });

  it('miasto nieobsługiwane nie dostaje alertów', () => {
    expect(supplyDrop(ctx({ towns: [town({ lastServedTime: null, needs: need(10) })] }))).toEqual([]);
  });
});

describe('ALL_RULES', () => {
  it('zawiera wszystkie 15 reguł', () => {
    expect(ALL_RULES).toHaveLength(15);
  });
});
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/rules.supply-towns.test.ts`
Expected: FAIL. Brak modułów `alerts/supply`, `alerts/towns`, `alerts/index`.

- [ ] **Step 3: Zaimplementuj `server/src/alerts/supply.ts`**

```ts
import { monthMs } from '@tflive/shared';
import type { Rule } from './engine';

export function isServed(lastServedTime: number | null, gameTime: number, dayMs: number, servedWindowMonths: number): boolean {
  return lastServedTime !== null && gameTime - lastServedTime <= servedWindowMonths * monthMs(dayMs);
}

export const missingInput: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.industries.flatMap((i) => {
    if (!isServed(i.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    return i.inputs
      .filter((x) => x.lastReceivedTime !== null && gameTime - x.lastReceivedTime > config.missingInputMonths * monthMs(dayMs))
      .map((x) => ({
        type: 'missing-input' as const,
        category: 'supply' as const,
        severity: 'warn' as const,
        entityType: 'industry' as const,
        entityId: i.id,
        subKey: x.cargo,
        title: `${i.name}: brak ${x.cargo}`,
        detail: `Niedostarczony surowiec od ${Math.floor((gameTime - (x.lastReceivedTime as number)) / dayMs)} dni`,
      }));
  });

export const stalledOutput: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.industries.flatMap((i) => {
    if (!isServed(i.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    return i.outputs
      .filter((o) => o.capacity > 0 && o.stock / o.capacity >= config.stalledOutputRatio)
      .map((o) => ({
        type: 'stalled-output' as const,
        category: 'supply' as const,
        severity: 'warn' as const,
        entityType: 'industry' as const,
        entityId: i.id,
        subKey: o.cargo,
        title: `${i.name}: Zalegająca produkcja`,
        detail: `${o.cargo}: magazyn ${Math.round((o.stock / o.capacity) * 100)}%`,
        minDurationMs: config.stalledOutputMonths * monthMs(dayMs),
      }));
  });

export const closureThreat: Rule = ({ snap, gameTime, dayMs, config }) =>
  snap.industries.flatMap((i) => {
    if (!isServed(i.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    if (i.closureTime === null || i.closureTime <= 0) return [];
    const days = Math.max(0, Math.floor((i.closureTime - gameTime) / dayMs));
    return [{
      type: 'closure-threat' as const,
      category: 'supply' as const,
      severity: 'critical' as const,
      entityType: 'industry' as const,
      entityId: i.id,
      title: `Groźba zamknięcia: ${i.name}`,
      detail: `Do zamknięcia zostało ${days} dni`,
    }];
  });
```

- [ ] **Step 4: Zaimplementuj `server/src/alerts/towns.ts`**

```ts
import { monthIndex } from '@tflive/shared';
import type { Rule } from './engine';
import { isServed } from './supply';

export const supplyDrop: Rule = ({ snap, gameTime, dayMs, config, buffers }) => {
  const month = monthIndex(snap.meta.date);
  return snap.towns.flatMap((t) => {
    if (!isServed(t.lastServedTime, gameTime, dayMs, config.servedWindowMonths)) return [];
    return t.needs.flatMap((n) => {
      if (n.supplied === null || n.demand <= 0) return [];
      const past = buffers.townSupplyAt(t.id, n.district, n.cargo, month - config.supplyDropWindowMonths);
      const delivered = n.supplied > 0 || (past !== null && past > 0);
      if (!delivered) return [];
      const low = n.supplied / n.demand < config.supplyLowRatio;
      const dropped = past !== null && past > 0 && n.supplied < past * (1 - config.supplyDropRatio);
      if (!low && !dropped) return [];
      return [{
        type: 'supply-drop' as const,
        category: 'towns' as const,
        severity: 'warn' as const,
        entityType: 'town' as const,
        entityId: t.id,
        subKey: `${n.district}:${n.cargo}`,
        title: `Spadek dostaw: ${t.name}`,
        detail: `${n.cargo}: ${Math.round((n.supplied / n.demand) * 100)}% potrzeby${dropped ? `, było ${Math.round(((past as number) / n.demand) * 100)}%` : ''}`,
      }];
    });
  });
};
```

- [ ] **Step 5: Zaimplementuj `server/src/alerts/index.ts`**

```ts
import type { Rule } from './engine';
import { lowReserve, negativeOperatingResult } from './finance';
import { lineWithoutVehicles, lowLineLoad, overloadedStop, unprofitableLine } from './lines';
import { closureThreat, missingInput, stalledOutput } from './supply';
import { supplyDrop } from './towns';
import { vehicleIdle, vehicleLowCondition, vehicleNoPath, vehicleOld, vehicleWaiting } from './vehicles';

export const ALL_RULES: Rule[] = [
  lowReserve,
  negativeOperatingResult,
  unprofitableLine,
  lowLineLoad,
  lineWithoutVehicles,
  overloadedStop,
  vehicleNoPath,
  vehicleWaiting,
  vehicleIdle,
  vehicleOld,
  vehicleLowCondition,
  missingInput,
  stalledOutput,
  closureThreat,
  supplyDrop,
];
```

- [ ] **Step 6: Uruchom testy i typecheck**

Run: `npx vitest run server/test/rules.supply-towns.test.ts && npm run typecheck`
Expected: 9 passed; `tsc` bez błędów.

- [ ] **Step 7: Commit**

```bash
git add server/src/alerts/supply.ts server/src/alerts/towns.ts server/src/alerts/index.ts server/test/rules.supply-towns.test.ts
git commit -m "feat(server): reguły alertów przemysłu i miast, rejestr reguł"
```

---

### Task 10: `HistoryStore` — Historia, Uzupełnienie, Cofnięcie, Wyciszenia (SQLite)

**Files:**
- Create: `server/src/history/historyStore.ts`
- Test: `server/test/historyStore.test.ts`

**Interfaces:**
- Consumes: model i `Mute` z `@tflive/shared`, buildery.
- Produces:
  ```ts
  export interface GlobalRow { month: number; balance: number | null; loan: number | null; operatingResult: number | null; runningCosts: number | null; vehicles: number | null; lines: number | null }
  export interface LineRow { month: number; lineId: number; operatingResult: number | null; loadRatio: number | null; vehicles: number | null }
  export class HistoryStore {
    constructor(file: string); // ':memory:' dla testów; tworzy katalog pliku
    recordMonth(saveId: string, month: number, snap: Snapshot, lineLoad: (lineId: number) => number | null): void;
    truncateAfter(saveId: string, month: number): void;
    applyBackfill(saveId: string, b: Backfill): void;
    touchGame(saveId: string, mapName: string | null, gameTime: number): void;
    readGlobal(saveId: string): GlobalRow[];
    readLines(saveId: string, lineId: number): LineRow[];
    readTowns(saveId: string): { month: number; townId: number; population: number }[];
    listMutes(saveId: string): Mute[];
    addMute(m: Omit<Mute, 'id'>): Mute;
    removeMute(saveId: string, id: number): boolean;
    close(): void;
  }
  ```

- [ ] **Step 1: Napisz `server/test/historyStore.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { HistoryStore } from '../src/history/historyStore';
import { finance, industry, line, snapshot, town, vehicle } from './builders';

const snap = () => snapshot({
  finance: finance({ balance: 500, loan: 10, operatingResult12m: 70, runningCosts12m: 30 }),
  lines: [line({ id: 10, operatingResult12m: -5, vehicleIds: [1, 2] })],
  vehicles: [vehicle({ id: 1 }), vehicle({ id: 2 })],
  towns: [town({ id: 30, population: 1200 })],
  industries: [industry({ id: 20, level: 3 })],
});

describe('HistoryStore', () => {
  it('zapisuje miesiąc i nadpisuje przy ponownym zapisie (upsert)', () => {
    const h = new HistoryStore(':memory:');
    h.recordMonth('s', 100, snap(), () => 0.4);
    h.recordMonth('s', 100, snapshot({ finance: finance({ balance: 999 }) }), () => null);
    expect(h.readGlobal('s')).toEqual([{ month: 100, balance: 999, loan: 0, operatingResult: 120_000, runningCosts: 120_000, vehicles: 0, lines: 0 }]);
    expect(h.readLines('s', 10)).toEqual([{ month: 100, lineId: 10, operatingResult: -5, loadRatio: 0.4, vehicles: 2 }]);
    expect(h.readTowns('s')).toEqual([{ month: 100, townId: 30, population: 1200 }]);
  });

  it('rozdziela Rozgrywki po saveId', () => {
    const h = new HistoryStore(':memory:');
    h.recordMonth('a', 1, snap(), () => null);
    h.recordMonth('b', 1, snap(), () => null);
    h.truncateAfter('a', 0);
    expect(h.readGlobal('a')).toEqual([]);
    expect(h.readGlobal('b')).toHaveLength(1);
  });

  it('Cofnięcie usuwa miesiące po wskazanym, Wyciszenia zostają', () => {
    const h = new HistoryStore(':memory:');
    for (const m of [10, 11, 12]) h.recordMonth('s', m, snap(), () => null);
    h.addMute({ saveId: 's', alertType: 'vehicle-old', entityId: 1, kind: 'ignore', untilGameTime: null });
    h.truncateAfter('s', 10);
    expect(h.readGlobal('s').map((r) => r.month)).toEqual([10]);
    expect(h.readLines('s', 10).map((r) => r.month)).toEqual([10]);
    expect(h.listMutes('s')).toHaveLength(1);
  });

  it('Uzupełnienie historii uzupełnia tylko Wynik operacyjny i nie kasuje innych kolumn', () => {
    const h = new HistoryStore(':memory:');
    h.recordMonth('s', 5, snap(), () => null);
    h.applyBackfill('s', { scope: 'global', entityId: null, months: [{ month: 4, value: -7 }, { month: 5, value: 33 }] });
    h.applyBackfill('s', { scope: 'line', entityId: 10, months: [{ month: 4, value: 2 }] });
    expect(h.readGlobal('s')).toEqual([
      { month: 4, balance: null, loan: null, operatingResult: -7, runningCosts: null, vehicles: null, lines: null },
      { month: 5, balance: 500, loan: 10, operatingResult: 33, runningCosts: 30, vehicles: 2, lines: 1 },
    ]);
    expect(h.readLines('s', 10).map((r) => [r.month, r.operatingResult])).toEqual([[4, 2], [5, -5]]);
  });

  it('dodaje, listuje i usuwa Wyciszenia w obrębie Rozgrywki', () => {
    const h = new HistoryStore(':memory:');
    const m = h.addMute({ saveId: 's', alertType: 'missing-input', entityId: 20, kind: 'snooze', untilGameTime: 999 });
    expect(m.id).toBeGreaterThan(0);
    expect(h.listMutes('s')).toEqual([m]);
    expect(h.listMutes('inna')).toEqual([]);
    expect(h.removeMute('inna', m.id)).toBe(false);
    expect(h.removeMute('s', m.id)).toBe(true);
    expect(h.listMutes('s')).toEqual([]);
  });

  it('obsługuje Wyciszenie alertu firmowego (entityId null)', () => {
    const h = new HistoryStore(':memory:');
    h.addMute({ saveId: 's', alertType: 'low-reserve', entityId: null, kind: 'ignore', untilGameTime: null });
    expect(h.listMutes('s')[0].entityId).toBeNull();
  });
});
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/historyStore.test.ts`
Expected: FAIL. Brak modułu `history/historyStore`.

- [ ] **Step 3: Zaimplementuj `server/src/history/historyStore.ts`**

```ts
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { AlertType, Backfill, Mute, MuteKind, Snapshot } from '@tflive/shared';

export interface GlobalRow { month: number; balance: number | null; loan: number | null; operatingResult: number | null; runningCosts: number | null; vehicles: number | null; lines: number | null }
export interface LineRow { month: number; lineId: number; operatingResult: number | null; loadRatio: number | null; vehicles: number | null }

const SCHEMA = `
CREATE TABLE IF NOT EXISTS games (save_id TEXT PRIMARY KEY, map_name TEXT, last_game_time INTEGER);
CREATE TABLE IF NOT EXISTS metrics_global (save_id TEXT NOT NULL, month INTEGER NOT NULL, balance INTEGER, loan INTEGER, operating_result INTEGER, running_costs INTEGER, vehicles INTEGER, lines INTEGER, PRIMARY KEY (save_id, month));
CREATE TABLE IF NOT EXISTS metrics_line (save_id TEXT NOT NULL, month INTEGER NOT NULL, line_id INTEGER NOT NULL, operating_result INTEGER, load_ratio REAL, vehicles INTEGER, PRIMARY KEY (save_id, month, line_id));
CREATE TABLE IF NOT EXISTS metrics_town (save_id TEXT NOT NULL, month INTEGER NOT NULL, town_id INTEGER NOT NULL, population INTEGER, PRIMARY KEY (save_id, month, town_id));
CREATE TABLE IF NOT EXISTS metrics_industry (save_id TEXT NOT NULL, month INTEGER NOT NULL, industry_id INTEGER NOT NULL, level INTEGER, PRIMARY KEY (save_id, month, industry_id));
CREATE TABLE IF NOT EXISTS mutes (id INTEGER PRIMARY KEY AUTOINCREMENT, save_id TEXT NOT NULL, alert_type TEXT NOT NULL, entity_id INTEGER, kind TEXT NOT NULL, until_game_time INTEGER);
`;

export class HistoryStore {
  private db: DatabaseSync;

  constructor(file: string) {
    if (file !== ':memory:') mkdirSync(dirname(file), { recursive: true });
    this.db = new DatabaseSync(file);
    this.db.exec(SCHEMA);
  }

  private tx(fn: () => void): void {
    this.db.exec('BEGIN');
    try {
      fn();
      this.db.exec('COMMIT');
    } catch (e) {
      this.db.exec('ROLLBACK');
      throw e;
    }
  }

  recordMonth(saveId: string, month: number, snap: Snapshot, lineLoad: (lineId: number) => number | null): void {
    const f = snap.finance;
    this.tx(() => {
      this.db
        .prepare(`INSERT INTO metrics_global (save_id, month, balance, loan, operating_result, running_costs, vehicles, lines)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT (save_id, month) DO UPDATE SET balance = excluded.balance, loan = excluded.loan,
            operating_result = excluded.operating_result, running_costs = excluded.running_costs,
            vehicles = excluded.vehicles, lines = excluded.lines`)
        .run(saveId, month, f?.balance ?? null, f?.loan ?? null, f?.operatingResult12m ?? null, f?.runningCosts12m ?? null, snap.vehicles.length, snap.lines.length);
      const line = this.db.prepare(`INSERT INTO metrics_line (save_id, month, line_id, operating_result, load_ratio, vehicles) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT (save_id, month, line_id) DO UPDATE SET operating_result = excluded.operating_result, load_ratio = excluded.load_ratio, vehicles = excluded.vehicles`);
      for (const l of snap.lines) line.run(saveId, month, l.id, l.operatingResult12m, lineLoad(l.id), l.vehicleIds.length);
      const town = this.db.prepare(`INSERT INTO metrics_town (save_id, month, town_id, population) VALUES (?, ?, ?, ?)
        ON CONFLICT (save_id, month, town_id) DO UPDATE SET population = excluded.population`);
      for (const t of snap.towns) town.run(saveId, month, t.id, t.population);
      const ind = this.db.prepare(`INSERT INTO metrics_industry (save_id, month, industry_id, level) VALUES (?, ?, ?, ?)
        ON CONFLICT (save_id, month, industry_id) DO UPDATE SET level = excluded.level`);
      for (const i of snap.industries) ind.run(saveId, month, i.id, i.level);
    });
  }

  truncateAfter(saveId: string, month: number): void {
    this.tx(() => {
      for (const table of ['metrics_global', 'metrics_line', 'metrics_town', 'metrics_industry']) {
        this.db.prepare(`DELETE FROM ${table} WHERE save_id = ? AND month > ?`).run(saveId, month);
      }
    });
  }

  applyBackfill(saveId: string, b: Backfill): void {
    this.tx(() => {
      if (b.scope === 'global') {
        const st = this.db.prepare(`INSERT INTO metrics_global (save_id, month, operating_result) VALUES (?, ?, ?)
          ON CONFLICT (save_id, month) DO UPDATE SET operating_result = excluded.operating_result`);
        for (const m of b.months) st.run(saveId, m.month, m.value);
      } else if (b.entityId !== null) {
        const st = this.db.prepare(`INSERT INTO metrics_line (save_id, month, line_id, operating_result) VALUES (?, ?, ?, ?)
          ON CONFLICT (save_id, month, line_id) DO UPDATE SET operating_result = excluded.operating_result`);
        for (const m of b.months) st.run(saveId, m.month, b.entityId, m.value);
      }
    });
  }

  touchGame(saveId: string, mapName: string | null, gameTime: number): void {
    this.db
      .prepare(`INSERT INTO games (save_id, map_name, last_game_time) VALUES (?, ?, ?)
        ON CONFLICT (save_id) DO UPDATE SET map_name = COALESCE(excluded.map_name, games.map_name), last_game_time = excluded.last_game_time`)
      .run(saveId, mapName, gameTime);
  }

  readGlobal(saveId: string): GlobalRow[] {
    return this.db
      .prepare(`SELECT month, balance, loan, operating_result AS operatingResult, running_costs AS runningCosts, vehicles, lines
        FROM metrics_global WHERE save_id = ? ORDER BY month`)
      .all(saveId) as unknown as GlobalRow[];
  }

  readLines(saveId: string, lineId: number): LineRow[] {
    return this.db
      .prepare(`SELECT month, line_id AS lineId, operating_result AS operatingResult, load_ratio AS loadRatio, vehicles
        FROM metrics_line WHERE save_id = ? AND line_id = ? ORDER BY month`)
      .all(saveId, lineId) as unknown as LineRow[];
  }

  readTowns(saveId: string): { month: number; townId: number; population: number }[] {
    return this.db
      .prepare('SELECT month, town_id AS townId, population FROM metrics_town WHERE save_id = ? ORDER BY month, town_id')
      .all(saveId) as unknown as { month: number; townId: number; population: number }[];
  }

  listMutes(saveId: string): Mute[] {
    const rows = this.db
      .prepare('SELECT id, save_id, alert_type, entity_id, kind, until_game_time FROM mutes WHERE save_id = ? ORDER BY id')
      .all(saveId) as { id: number; save_id: string; alert_type: string; entity_id: number | null; kind: string; until_game_time: number | null }[];
    return rows.map((r) => ({ id: r.id, saveId: r.save_id, alertType: r.alert_type as AlertType, entityId: r.entity_id, kind: r.kind as MuteKind, untilGameTime: r.until_game_time }));
  }

  addMute(m: Omit<Mute, 'id'>): Mute {
    const r = this.db
      .prepare('INSERT INTO mutes (save_id, alert_type, entity_id, kind, until_game_time) VALUES (?, ?, ?, ?, ?)')
      .run(m.saveId, m.alertType, m.entityId, m.kind, m.untilGameTime);
    return { ...m, id: Number(r.lastInsertRowid) };
  }

  removeMute(saveId: string, id: number): boolean {
    return this.db.prepare('DELETE FROM mutes WHERE save_id = ? AND id = ?').run(saveId, id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
```

Odstępstwo od spec §4a (świadome): `metrics_industry` zapisuje tylko `level`. Źródło „produkcji” w API nie zostało ustalone w kroku 0. Kolumnę dodamy w planie 2, gdy mod zacznie ją wysyłać.

- [ ] **Step 4: Uruchom testy i typecheck**

Run: `npx vitest run server/test/historyStore.test.ts && npm run typecheck`
Expected: 6 passed (Node może wypisać `ExperimentalWarning: SQLite`, to nie błąd); `tsc` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add server/src/history server/test/historyStore.test.ts
git commit -m "feat(server): HistoryStore — Historia, Uzupełnienie, Cofnięcie i Wyciszenia w SQLite"
```

---

### Task 11: `Hub` — spięcie źródła, stanu, alertów i Historii

**Files:**
- Create: `server/src/hub.ts`
- Test: `server/test/hub.test.ts`

**Interfaces:**
- Consumes: `parseLine` (Task 1), `GameStore` (Task 5), `AlertEngine`, `RuleBuffers` (Task 6), `ALL_RULES` (Task 9), `HistoryStore` (Task 10), `LogReadResult` (Task 4), `AlertConfig` (Task 3), `monthMs` (Task 2).
- Produces:
  ```ts
  export interface HubStatus { logPath: string | null; logState: 'missing' | 'ok'; live: boolean; lastLineWallMs: number | null; paused: boolean | null; diskMBPerHour: number | null; saveId: string | null; lastError: string | null }
  export interface HubState { snapshot: Snapshot; alerts: Alert[]; status: HubStatus }
  export interface MuteInput { alertType: AlertType; entityId: number | null; kind: MuteKind; untilGameTime?: number | null }
  export class Hub extends EventEmitter { // zdarzenie 'update' (HubState)
    constructor(deps: { history: HistoryStore; config: AlertConfig; staleMs: number; logPath: string | null; now?: () => number });
    ingest(r: LogReadResult): void;
    state(): HubState;
    status(): HubStatus;
    mutes(): Mute[];
    addMute(input: MuteInput): Mute; // rzuca Error('Brak aktywnej Rozgrywki'), gdy brak saveId
    removeMute(id: number): boolean;
  }
  ```

- [ ] **Step 1: Napisz `server/test/hub.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { Hub } from '../src/hub';
import { DAY, metaLine, sectionLines, vehicle } from './builders';

function makeHub() {
  let wall = 1_000_000;
  const history = new HistoryStore(':memory:');
  const hub = new Hub({ history, config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: '/x/stdout.txt', now: () => wall });
  return { hub, history, tick: (ms: number) => (wall += ms) };
}
const read = (lines: string[], reset = false) => ({ lines, reset, missing: false });
const d = (y: number, m: number, day = 1) => ({ y, m, d: day });

describe('Hub', () => {
  it('składa stan z linii logu i liczy alerty', () => {
    const { hub } = makeHub();
    hub.ingest(read([
      metaLine({ gameTime: 100 * DAY, date: d(1900, 4) }),
      ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 100 * DAY }),
    ]));
    const s = hub.state();
    expect(s.snapshot.vehicles[0].id).toBe(5);
    expect(s.alerts.map((a) => a.id)).toContain('vehicle-no-path:5');
    expect(s.status).toMatchObject({ logState: 'ok', live: true, saveId: 'save1' });
  });

  it('emituje update tylko, gdy coś się zmieniło', () => {
    const { hub } = makeHub();
    let n = 0;
    hub.on('update', () => n++);
    hub.ingest(read(['zwykła linia gry']));
    expect(n).toBe(0);
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    expect(n).toBe(1);
  });

  it('status live wygasa po staleMs', () => {
    const { hub, tick } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    tick(16_000);
    expect(hub.status().live).toBe(false);
  });

  it('zapisuje miesiąc w Historii przy nowym miesiącu', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) })]));
    expect(history.readGlobal('save1').map((r) => r.month)).toEqual([1900 * 12, 1900 * 12 + 1]);
  });

  it('druga Rozgrywka w tym samym logu: osobny stan i alerty', () => {
    const { hub } = makeHub();
    hub.ingest(read([
      metaLine({ gameTime: 4000, date: d(1900, 1, 2) }),
      ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 4000 }),
    ]));
    hub.ingest(read([metaLine({ saveId: 'save2', gameTime: 8000, date: d(1950, 1, 2) })]));
    const s = hub.state();
    expect(s.snapshot.vehicles).toEqual([]);
    expect(s.alerts).toEqual([]);
    expect(s.status.saveId).toBe('save2');
  });

  it('Cofnięcie obcina Historię, zachowuje Wyciszenia', () => {
    const { hub, history } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2) })]));
    hub.ingest(read([metaLine({ seq: 2, gameTime: 140_000, date: d(1900, 2, 5) })]));
    hub.ingest(read([metaLine({ seq: 3, gameTime: 260_000, date: d(1900, 3, 5) })]));
    hub.addMute({ alertType: 'vehicle-old', entityId: 1, kind: 'ignore' });
    hub.ingest(read([metaLine({ seq: 4, gameTime: 8000, date: d(1900, 1, 3) })]));
    expect(history.readGlobal('save1').map((r) => r.month)).toEqual([1900 * 12]);
    expect(hub.mutes()).toHaveLength(1);
  });

  it('Wyciszenie oznacza alert jako wyciszony; Odłożenie domyślnie +3 miesiące', () => {
    const { hub } = makeHub();
    hub.ingest(read([
      metaLine({ gameTime: 100 * DAY, date: d(1900, 4) }),
      ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 100 * DAY }),
    ]));
    const m = hub.addMute({ alertType: 'vehicle-no-path', entityId: 5, kind: 'snooze' });
    expect(m.untilGameTime).toBe(100 * DAY + 90 * DAY);
    expect(hub.state().alerts[0].muted).toEqual({ kind: 'snooze', untilGameTime: 190 * DAY });
    expect(hub.removeMute(m.id)).toBe(true);
    expect(hub.state().alerts[0].muted).toBeNull();
  });

  it('addMute bez Rozgrywki rzuca błąd', () => {
    const { hub } = makeHub();
    expect(() => hub.addMute({ alertType: 'low-reserve', entityId: null, kind: 'ignore' })).toThrow(/Rozgrywki/);
  });

  it('reset logu (restart gry) czyści stan bieżący', () => {
    const { hub } = makeHub();
    hub.ingest(read([...sectionLines('vehicles', [vehicle()], { seq: 1, gameTime: 4000 })]));
    hub.ingest(read([], true));
    expect(hub.state().snapshot.vehicles).toEqual([]);
    expect(hub.status().saveId).toBeNull();
  });

  it('liczy MB/h z bytesWritten po minucie', () => {
    const { hub, tick } = makeHub();
    hub.ingest(read([metaLine({ gameTime: 4000, date: d(1900, 1, 2), bytes: 0 })]));
    tick(30_000);
    hub.ingest(read([metaLine({ seq: 2, gameTime: 8000, date: d(1900, 1, 3), bytes: 1_000_000 })]));
    expect(hub.status().diskMBPerHour).toBeNull();
    tick(30_000);
    hub.ingest(read([metaLine({ seq: 3, gameTime: 12000, date: d(1900, 1, 4), bytes: 2_000_000 })]));
    expect(hub.status().diskMBPerHour).toBeCloseTo(120, 5);
  });

  it('zgłasza brak logu i ostatni błąd dekodowania', () => {
    const { hub } = makeHub();
    hub.ingest({ lines: [], reset: false, missing: true });
    expect(hub.status().logState).toBe('missing');
    hub.ingest(read(['[x]  [TFLIVE] 1 save1 s 1 1 stops 1/1 [[1]]']));
    expect(hub.status().lastError).toMatch(/stop/);
  });
});
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/hub.test.ts`
Expected: FAIL. Brak modułu `../src/hub`.

- [ ] **Step 3: Zaimplementuj `server/src/hub.ts`**

```ts
import { EventEmitter } from 'node:events';
import { monthMs, parseLine, type Alert, type AlertType, type Mute, type MuteKind, type Snapshot } from '@tflive/shared';
import { RuleBuffers } from './alerts/buffers';
import { AlertEngine } from './alerts/engine';
import { ALL_RULES } from './alerts/index';
import type { AlertConfig } from './config';
import type { HistoryStore } from './history/historyStore';
import type { LogReadResult } from './source/types';
import { GameStore, type StoreEvent } from './store/gameStore';

export interface HubStatus {
  logPath: string | null;
  logState: 'missing' | 'ok';
  live: boolean;
  lastLineWallMs: number | null;
  paused: boolean | null;
  diskMBPerHour: number | null;
  saveId: string | null;
  lastError: string | null;
}

export interface HubState {
  snapshot: Snapshot;
  alerts: Alert[];
  status: HubStatus;
}

export interface MuteInput {
  alertType: AlertType;
  entityId: number | null;
  kind: MuteKind;
  untilGameTime?: number | null;
}

const RATE_MIN_MS = 60_000;

export class Hub extends EventEmitter {
  private store = new GameStore();
  private engine = new AlertEngine(ALL_RULES);
  private buffers = new RuleBuffers();
  private alerts: Alert[] = [];
  private logState: 'missing' | 'ok' = 'missing';
  private lastLineWallMs: number | null = null;
  private lastError: string | null = null;
  private rate: { sessionId: string; wall0: number; bytes0: number; mbPerHour: number | null } | null = null;
  private readonly now: () => number;

  constructor(private readonly deps: { history: HistoryStore; config: AlertConfig; staleMs: number; logPath: string | null; now?: () => number }) {
    super();
    this.now = deps.now ?? Date.now;
  }

  ingest(r: LogReadResult): void {
    this.logState = r.missing ? 'missing' : 'ok';
    let dirty = false;
    if (r.reset) {
      this.store.reset();
      this.engine.reset();
      this.buffers.reset();
      this.alerts = [];
      this.rate = null;
      dirty = true;
    }
    for (const raw of r.lines) {
      const p = parseLine(raw);
      if (!p.ok) {
        if (p.reason !== 'not-tflive') this.lastError = `Linia odrzucona: ${p.reason}${p.version ? ` (wersja ${p.version})` : ''}`;
        continue;
      }
      this.lastLineWallMs = this.now();
      const res = this.store.apply(p.line);
      if (res.error) this.lastError = res.error;
      for (const e of res.events) this.handle(e);
      if (res.changed.length || res.events.length) dirty = true;
      if (res.changed.includes('meta')) this.updateRate();
    }
    if (dirty) {
      this.buffers.observe(this.store.snapshot());
      this.recompute();
      this.emit('update', this.state());
    }
  }

  state(): HubState {
    return { snapshot: this.store.snapshot(), alerts: this.alerts, status: this.status() };
  }

  status(): HubStatus {
    const meta = this.store.snapshot().meta;
    return {
      logPath: this.deps.logPath,
      logState: this.logState,
      live: this.lastLineWallMs !== null && this.now() - this.lastLineWallMs <= this.deps.staleMs,
      lastLineWallMs: this.lastLineWallMs,
      paused: meta?.paused ?? null,
      diskMBPerHour: this.rate?.mbPerHour ?? null,
      saveId: this.store.saveId(),
      lastError: this.lastError,
    };
  }

  mutes(): Mute[] {
    const saveId = this.store.saveId();
    return saveId ? this.deps.history.listMutes(saveId) : [];
  }

  addMute(input: MuteInput): Mute {
    const saveId = this.store.saveId();
    const meta = this.store.snapshot().meta;
    if (!saveId) throw new Error('Brak aktywnej Rozgrywki');
    const untilGameTime =
      input.kind === 'ignore' ? null : input.untilGameTime ?? (meta ? meta.gameTime + this.deps.config.snoozeMonths * monthMs(meta.dayMs) : null);
    const m = this.deps.history.addMute({ saveId, alertType: input.alertType, entityId: input.entityId, kind: input.kind, untilGameTime });
    this.recompute();
    this.emit('update', this.state());
    return m;
  }

  removeMute(id: number): boolean {
    const saveId = this.store.saveId();
    if (!saveId) return false;
    const ok = this.deps.history.removeMute(saveId, id);
    if (ok) {
      this.recompute();
      this.emit('update', this.state());
    }
    return ok;
  }

  private handle(e: StoreEvent): void {
    const h = this.deps.history;
    switch (e.type) {
      case 'game-changed':
        this.engine.reset();
        this.buffers.reset();
        this.alerts = [];
        this.rate = null;
        break;
      case 'rewind':
        h.truncateAfter(e.saveId, e.toMonth);
        this.engine.reset();
        this.buffers.reset();
        break;
      case 'new-month': {
        const snap = this.store.snapshot();
        const meta = snap.meta;
        const window = meta ? this.deps.config.lowLoadWindowMonths * monthMs(meta.dayMs) : 0;
        h.recordMonth(e.saveId, e.month, snap, (id) => (meta ? this.buffers.lineLoadAvg(id, meta.gameTime, window) : null));
        h.touchGame(e.saveId, meta?.mapName ?? null, meta?.gameTime ?? 0);
        break;
      }
      case 'backfill':
        h.applyBackfill(e.saveId, e.data);
        break;
    }
  }

  private recompute(): void {
    const snap = this.store.snapshot();
    const meta = snap.meta;
    if (!meta) {
      this.alerts = [];
      return;
    }
    this.alerts = this.engine.evaluate(
      { snap: { ...snap, meta }, gameTime: meta.gameTime, dayMs: meta.dayMs, config: this.deps.config, buffers: this.buffers },
      this.mutes(),
    );
  }

  private updateRate(): void {
    const meta = this.store.snapshot().meta;
    if (!meta) return;
    const wall = this.now();
    if (!this.rate || this.rate.sessionId !== meta.sessionId || meta.bytesWritten < this.rate.bytes0) {
      this.rate = { sessionId: meta.sessionId, wall0: wall, bytes0: meta.bytesWritten, mbPerHour: null };
      return;
    }
    const elapsed = wall - this.rate.wall0;
    if (elapsed >= RATE_MIN_MS) this.rate.mbPerHour = ((meta.bytesWritten - this.rate.bytes0) / 1e6) * (3_600_000 / elapsed);
  }
}
```

- [ ] **Step 4: Uruchom testy i typecheck**

Run: `npx vitest run server/test/hub.test.ts && npm run typecheck`
Expected: 11 passed; `tsc` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add server/src/hub.ts server/test/hub.test.ts
git commit -m "feat(server): Hub — spięcie logu, stanu, alertów, Historii i Wyciszeń"
```

---

### Task 12: Serwer HTTP — REST, WebSocket, pliki statyczne

**Files:**
- Create: `server/src/http.ts`
- Test: `server/test/http.test.ts`

**Interfaces:**
- Consumes: `Hub`, `HubState`, `MuteInput` (Task 11), `HistoryStore` (Task 10).
- Produces:
  ```ts
  export function buildServer(opts: { hub: Hub; webDir?: string | null }): Promise<FastifyInstance>;
  // REST: GET /api/health → HubStatus; GET /api/state → HubState; GET /api/mutes → Mute[];
  //       POST /api/mutes {alertType, entityId, kind, untilGameTime?} → 201 Mute | 400 | 409 (brak Rozgrywki);
  //       DELETE /api/mutes/:id → 204 | 404
  // WS:   /ws — przy połączeniu {type:'state', ...HubState}, potem przy każdym 'update' Huba.
  ```

- [ ] **Step 1: Napisz `server/test/http.test.ts`**

```ts
import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import WebSocket from 'ws';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { buildServer } from '../src/http';
import { Hub } from '../src/hub';
import { DAY, metaLine, sectionLines, vehicle } from './builders';

const closers: (() => Promise<unknown>)[] = [];
afterEach(async () => {
  while (closers.length) await closers.pop()!();
});

async function start() {
  const hub = new Hub({ history: new HistoryStore(':memory:'), config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: '/x' });
  const app = await buildServer({ hub });
  await app.listen({ port: 0, host: '127.0.0.1' });
  closers.push(() => app.close());
  const { port } = app.server.address() as AddressInfo;
  return { hub, app, base: `http://127.0.0.1:${port}`, ws: `ws://127.0.0.1:${port}/ws` };
}

const feed = (hub: Hub) =>
  hub.ingest({
    lines: [metaLine({ gameTime: 100 * DAY, date: { y: 1900, m: 4, d: 1 } }), ...sectionLines('vehicles', [vehicle({ id: 5, noPath: true })], { seq: 2, gameTime: 100 * DAY })],
    reset: false,
    missing: false,
  });

function nextMessage(ws: WebSocket): Promise<any> {
  return new Promise((resolve) => ws.once('message', (d) => resolve(JSON.parse(String(d)))));
}

describe('HTTP', () => {
  it('GET /api/health i /api/state', async () => {
    const { hub, base } = await start();
    feed(hub);
    expect((await (await fetch(`${base}/api/health`)).json()).saveId).toBe('save1');
    const state = await (await fetch(`${base}/api/state`)).json();
    expect(state.snapshot.vehicles[0].id).toBe(5);
    expect(state.alerts[0].id).toBe('vehicle-no-path:5');
  });

  it('POST /api/mutes: 409 bez Rozgrywki, 400 przy złych danych, 201 i DELETE', async () => {
    const { hub, base } = await start();
    const post = (body: unknown) => fetch(`${base}/api/mutes`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    expect((await post({ alertType: 'vehicle-no-path', entityId: 5, kind: 'ignore' })).status).toBe(409);
    feed(hub);
    expect((await post({ alertType: 'vehicle-no-path', entityId: 5, kind: 'forever' })).status).toBe(400);
    const res = await post({ alertType: 'vehicle-no-path', entityId: 5, kind: 'ignore' });
    expect(res.status).toBe(201);
    const mute = await res.json();
    expect((await (await fetch(`${base}/api/mutes`)).json())).toEqual([mute]);
    expect((await fetch(`${base}/api/mutes/${mute.id}`, { method: 'DELETE' })).status).toBe(204);
    expect((await fetch(`${base}/api/mutes/${mute.id}`, { method: 'DELETE' })).status).toBe(404);
  });

  it('WS wysyła stan przy połączeniu i po każdej zmianie', async () => {
    const { hub, ws } = await start();
    const client = new WebSocket(ws);
    closers.push(async () => client.close());
    const first = await nextMessage(client);
    expect(first).toMatchObject({ type: 'state', snapshot: { vehicles: [] } });
    const next = nextMessage(client);
    feed(hub);
    expect((await next).snapshot.vehicles[0].id).toBe(5);
  });
});
```

- [ ] **Step 2: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/http.test.ts`
Expected: FAIL. Brak modułu `../src/http`.

- [ ] **Step 3: Zaimplementuj `server/src/http.ts`**

```ts
import { existsSync } from 'node:fs';
import fastifyStatic from '@fastify/static';
import fastifyWebsocket from '@fastify/websocket';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AlertType, MuteKind } from '@tflive/shared';
import type { Hub, HubState } from './hub';

const ALERT_TYPES: AlertType[] = ['low-reserve', 'negative-operating-result', 'unprofitable-line', 'low-line-load', 'line-without-vehicles', 'overloaded-stop', 'vehicle-no-path', 'vehicle-waiting', 'vehicle-idle', 'vehicle-old', 'vehicle-low-condition', 'missing-input', 'stalled-output', 'closure-threat', 'supply-drop'];
const KINDS: MuteKind[] = ['ignore', 'snooze'];

interface MuteBody {
  alertType?: unknown;
  entityId?: unknown;
  kind?: unknown;
  untilGameTime?: unknown;
}

export async function buildServer(opts: { hub: Hub; webDir?: string | null }): Promise<FastifyInstance> {
  const { hub } = opts;
  const app = Fastify({ logger: false });
  await app.register(fastifyWebsocket);

  app.get('/api/health', async () => hub.status());
  app.get('/api/state', async () => hub.state());
  app.get('/api/mutes', async () => hub.mutes());

  app.post<{ Body: MuteBody }>('/api/mutes', async (req, reply) => {
    const b = req.body ?? {};
    const validEntity = b.entityId === null || (typeof b.entityId === 'number' && Number.isInteger(b.entityId));
    const validUntil = b.untilGameTime === undefined || b.untilGameTime === null || typeof b.untilGameTime === 'number';
    if (!ALERT_TYPES.includes(b.alertType as AlertType) || !KINDS.includes(b.kind as MuteKind) || !validEntity || !validUntil) {
      return reply.code(400).send({ error: 'Niepoprawne dane Wyciszenia' });
    }
    try {
      const mute = hub.addMute({ alertType: b.alertType as AlertType, entityId: b.entityId as number | null, kind: b.kind as MuteKind, untilGameTime: (b.untilGameTime as number | null | undefined) ?? null });
      return reply.code(201).send(mute);
    } catch (e) {
      return reply.code(409).send({ error: (e as Error).message });
    }
  });

  app.delete<{ Params: { id: string } }>('/api/mutes/:id', async (req, reply) => {
    return hub.removeMute(Number(req.params.id)) ? reply.code(204).send() : reply.code(404).send({ error: 'Nie znaleziono' });
  });

  app.get('/ws', { websocket: true }, (socket) => {
    const send = (s: HubState) => socket.send(JSON.stringify({ type: 'state', ...s }));
    send(hub.state());
    hub.on('update', send);
    socket.on('close', () => hub.off('update', send));
  });

  if (opts.webDir && existsSync(opts.webDir)) {
    await app.register(fastifyStatic, { root: opts.webDir });
  }

  return app;
}
```

Uwaga: `untilGameTime: null` przy `kind: 'snooze'` oznacza w Hubie domyślne „+3 miesiące” (`??` w `Hub.addMute`).

Odstępstwo od spec §6 (świadome): WebSocket wysyła **pełny stan** (`snapshot` + `alerts` + `status`) przy każdej zmianie, a nie aktualizacje per sekcja. Stan to co najwyżej kilkaset KB w sieci lokalnej, przy zmianach co ≥ 1 s, więc różnicowanie byłoby przedwczesną optymalizacją. Jeśli plan 3 wykaże problem, dodamy różnicowanie w osobnym zadaniu.

- [ ] **Step 4: Uruchom testy i typecheck**

Run: `npx vitest run server/test/http.test.ts && npm run typecheck`
Expected: 3 passed; `tsc` bez błędów.

- [ ] **Step 5: Commit**

```bash
git add server/src/http.ts server/test/http.test.ts
git commit -m "feat(server): REST, WebSocket i pliki statyczne (Fastify)"
```

---

### Task 13: Tryb demo, punkt wejścia i README

**Files:**
- Create: `server/src/source/replay.ts`, `server/scripts/make-demo-log.ts`, `server/fixtures/demo.log` (generowany), `server/src/main.ts`, `README.md`
- Test: `server/test/replay.test.ts`, `server/test/demo.test.ts`

**Interfaces:**
- Consumes: `LineSource`, `LogReadResult` (Task 4), `LogTail` (Task 4), `Hub` (Task 11), `buildServer` (Task 12), `loadConfig`, `loadAlertConfig` (Task 3), `findGameLog`, `steamUserdataRoots` (Task 3), `HistoryStore` (Task 10), buildery wzorcowe (`formatLine`, `encodeSection` z `@tflive/shared`).
- Produces:
  ```ts
  export class ReplaySource implements LineSource { constructor(path: string); read(): LogReadResult } // każdy read() zwraca linie do następnego meta włącznie; na końcu zaczyna od nowa z reset=true
  export function makeDemoLog(): string[]; // (server/scripts/make-demo-log.ts) linie demo z prefiksem gry
  ```

- [ ] **Step 1: Napisz `server/test/replay.test.ts`**

```ts
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
```

- [ ] **Step 2: Napisz `server/test/demo.test.ts`**

```ts
import { describe, expect, it } from 'vitest';
import { DEFAULT_ALERT_CONFIG } from '../src/config';
import { HistoryStore } from '../src/history/historyStore';
import { Hub } from '../src/hub';
import { makeDemoLog } from '../scripts/make-demo-log';

describe('dane demo', () => {
  it('przechodzą przez Hub bez błędów i wywołują alerty każdej kategorii', () => {
    const hub = new Hub({ history: new HistoryStore(':memory:'), config: DEFAULT_ALERT_CONFIG, staleMs: 15_000, logPath: 'demo' });
    hub.ingest({ lines: makeDemoLog(), reset: false, missing: false });
    const s = hub.state();
    expect(s.status.lastError).toBeNull();
    expect(s.snapshot.vehicles.length).toBeGreaterThanOrEqual(8);
    const cats = new Set(s.alerts.map((a) => a.category));
    expect([...cats].sort()).toEqual(['finance', 'lines', 'supply', 'towns', 'vehicles']);
  });
});
```

- [ ] **Step 3: Uruchom, oczekuj porażki**

Run: `npx vitest run server/test/replay.test.ts server/test/demo.test.ts`
Expected: FAIL. Brak modułów `source/replay` i `scripts/make-demo-log`.

- [ ] **Step 4: Zaimplementuj `server/src/source/replay.ts`**

```ts
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
```

- [ ] **Step 5: Zaimplementuj `server/scripts/make-demo-log.ts`**

Generator tworzy 36 kroków (1 krok = 5 dni gry). W każdym kroku powstaje `meta` i `finance`, a co 2 kroki pozostałe sekcje. Dane celowo wywołują alerty z każdej kategorii:
- niska rezerwa,
- Nierentowna linia,
- Pojazd bez trasy,
- Stary pojazd,
- Groźba zamknięcia,
- Spadek dostaw.

```ts
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { encodeSection, formatLine, type DecodedSection, type Industry, type Line, type Stop, type Town, type Vehicle } from '@tflive/shared';

const PREFIX = '[2026-10-01 18:00:00Z - MESSAGE  - Sim Pool 1       - Main           ]  ';
const DAY = 4000;
const SAVE = 'demo0000';
const SESSION = 'demo-session';

function dateAt(day: number) {
  const y = 1900 + Math.floor(day / 365);
  const doy = day % 365;
  return { y, m: Math.min(12, Math.floor(doy / 30) + 1), d: (doy % 30) + 1 };
}

export function makeDemoLog(): string[] {
  const out: string[] = [];
  let seq = 0;
  const emit = (gameTime: number, s: DecodedSection) => {
    seq += 1;
    out.push(PREFIX + formatLine({ saveId: SAVE, sessionId: SESSION, seq, gameTime, section: s.section, part: 1, parts: 1 }, encodeSection(s)));
  };
  const startDay = 2 * 365;
  for (let step = 0; step < 36; step++) {
    const day = startDay + step * 5;
    const g = day * DAY;
    const month = dateAt(day).y * 12 + dateAt(day).m - 1;
    emit(g, { section: 'meta', data: { date: dateAt(day), dayMs: DAY, paused: false, speed: 1, mapName: 'Demo', bytesWritten: step * 40_000, errors: [] } });
    emit(g, { section: 'finance', data: {
      balance: 60_000 - step * 1_000, loan: 500_000, operatingResult12m: -40_000, runningCosts12m: 400_000, investments12m: -90_000,
      operatingResultByMonth: [{ month: month - 2, value: -9_000 }, { month: month - 1, value: -4_000 }, { month, value: 2_000 }],
    } });
    if (step % 2 !== 0) continue;
    const lines: Line[] = [
      { id: 1, name: 'IC Północ', mode: 'RAIL', color: '#1f6feb', stopIds: [101, 102], vehicleIds: [11, 12, 13], firstLedgerTime: 0, operatingResult12m: 850_000, investments12m: -300_000, departureLoads: [{ stopIndex: 0, load: 180, capacity: 200, time: g - DAY }] },
      { id: 2, name: 'Bus Ełk', mode: 'ROAD', color: '#d29922', stopIds: [103, 104], vehicleIds: [21, 22, 23], firstLedgerTime: 0, operatingResult12m: -35_000, investments12m: null, departureLoads: [{ stopIndex: 0, load: 4, capacity: 40, time: g - DAY }] },
      { id: 3, name: 'Węgiel – Huta', mode: 'ROAD', color: null, stopIds: [105, 106], vehicleIds: [], firstLedgerTime: 0, operatingResult12m: 0, investments12m: null, departureLoads: [] },
    ];
    const part = (purchaseDay: number, lifespanYears: number, maint: number) => ({ model: 'demo_model', purchaseTime: purchaseDay * DAY, lifespanSec: (lifespanYears * 365 * DAY) / 1000, maintenanceState: maint });
    const v = (id: number, name: string, lineId: number | null, o: Partial<Vehicle> = {}): Vehicle => ({
      id, name, lineId, mode: lineId === 1 ? 'RAIL' : 'ROAD', state: 'EN_ROUTE', userStopped: false, noPath: false, daysAtTerminal: 0, daysInDepot: 0,
      load: 20, capacity: 40, operatingResult12m: 10_000, parts: [part(startDay - 100, 20, 0.85)], ...o,
    });
    const vehicles: Vehicle[] = [
      v(11, 'Lok 11', 1), v(12, 'Lok 12', 1, { parts: [part(0, 1, 0.3)] }), v(13, 'Lok 13', 1),
      v(21, 'Autobus 21', 2, { noPath: true }), v(22, 'Autobus 22', 2, { daysAtTerminal: 45, state: 'AT_TERMINAL' }), v(23, 'Autobus 23', 2),
      v(31, 'Ciężarówka 31', null, { daysInDepot: 60, state: 'IN_DEPOT' }), v(32, 'Ciężarówka 32', null, { userStopped: true }),
    ];
    const industries: Industry[] = [
      { id: 201, name: 'Huta Katowice', type: 'steel_mill', level: 2, maxLevel: 7, closureTime: g + 120 * DAY, upgradeProgress: 0.1,
        inputs: [{ cargo: 'COAL', stock: 0, lastReceivedTime: g - 80 * DAY }, { cargo: 'IRON_ORE', stock: 20, lastReceivedTime: g - 5 * DAY }],
        outputs: [{ cargo: 'STEEL', stock: 90, capacity: 100 }], lastServedTime: g - 10 * DAY },
      { id: 202, name: 'Kopalnia Wieliczka', type: 'coal_mine', level: 1, maxLevel: 5, closureTime: null, upgradeProgress: 0, inputs: [], outputs: [{ cargo: 'COAL', stock: 30, capacity: 200 }], lastServedTime: null },
    ];
    const towns: Town[] = [
      { id: 301, name: 'Ełk', population: 4200 + step * 10, developmentActive: true, noise: 41, pollution: 3, lastServedTime: g - DAY,
        needs: [{ district: 'COMMERCIAL', cargo: 'FOOD', demand: 100, supplied: 35 }, { district: 'INDUSTRIAL', cargo: 'TOOLS', demand: 50, supplied: 0 }] },
      { id: 302, name: 'Suwałki', population: 2600, developmentActive: true, noise: 30, pollution: 1, lastServedTime: null, needs: [] },
    ];
    const stops: Stop[] = [
      { id: 101, name: 'Dworzec Główny', waiting: [{ cargo: 'PASSENGERS', count: 640 }], longestWaitStartTime: g - 20 * DAY },
      { id: 103, name: 'Ełk Rynek', waiting: [{ cargo: 'PASSENGERS', count: 12 }], longestWaitStartTime: g - DAY },
    ];
    emit(g, { section: 'lines', data: lines });
    emit(g, { section: 'vehicles', data: vehicles });
    emit(g, { section: 'industries', data: industries });
    emit(g, { section: 'towns', data: towns });
    emit(g, { section: 'stops', data: stops });
  }
  return out;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const target = fileURLToPath(new URL('../fixtures/demo.log', import.meta.url));
  writeFileSync(target, makeDemoLog().join('\n') + '\n');
  console.log(`Zapisano ${target}`);
}
```

- [ ] **Step 6: Uruchom testy replay i demo**

Run: `npx vitest run server/test/replay.test.ts server/test/demo.test.ts`
Expected: 3 passed. Jeśli `demo.test.ts` nie widzi którejś kategorii, popraw dane generatora, nie test. Dane mają wywołać alert każdej kategorii.

- [ ] **Step 7: Wygeneruj `server/fixtures/demo.log`**

Run: `mkdir -p server/fixtures && npm run demo:log && wc -l server/fixtures/demo.log`
Expected: `Zapisano …/server/fixtures/demo.log`, 162 linie (36 × 2 + 18 × 5).

- [ ] **Step 8: Zaimplementuj `server/src/main.ts`**

```ts
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

const tick = () => hub.ingest(source ? source.read() : { lines: [], reset: false, missing: true });
setInterval(tick, demo ? 2000 : config.pollMs);
setInterval(() => hub.emit('update', hub.state()), 5000);
tick();

const ips = Object.values(networkInterfaces()).flat().filter((i) => i && i.family === 'IPv4' && !i.internal).map((i) => i!.address);
console.log(`TFLive ${demo ? '(demo) ' : ''}działa:`);
console.log(`  lokalnie:  http://localhost:${config.port}`);
for (const ip of ips) console.log(`  w sieci:   http://${ip}:${config.port}`);
console.log(logPath ? `  log gry:   ${logPath}` : '  log gry:   NIE ZNALEZIONO — ustaw "logPath" w config/config.json');
```

- [ ] **Step 9: Sprawdź uruchomienie demo**

Run (w tle), potem odpytaj API:
```bash
npm run demo > /tmp/tflive-demo.out 2>&1 &
sleep 5
curl -s localhost:8787/api/health
curl -s localhost:8787/api/state | head -c 300; echo
kill %1
```
Expected: `health` zwraca JSON z `"logState":"ok"`, `"saveId":"demo0000"`; `state` zaczyna się od `{"snapshot":{"meta":{`. W `/tmp/tflive-demo.out` jest „TFLive (demo) działa:”.

- [ ] **Step 10: Napisz `README.md`**

````markdown
# TFLive

Dashboard live dla Transport Fever 3: finanse, linie, pojazdy, przemysł i miasta z bieżącej rozgrywki oraz alerty o problemach. Otwierany w przeglądarce na komputerze lub tablecie w sieci domowej.

Stan projektu: serwer (plan 1). Mod gry (plan 2) i interfejs (plan 3) w przygotowaniu.

## Wymagania

- Node.js ≥ 22.13 (testowane na 24.x)
- Transport Fever 3 (Steam) na macOS lub Windows — na tym samym komputerze co serwer

## Uruchomienie

```bash
npm install
npm start        # czyta log gry na żywo
npm run demo     # dane przykładowe, bez gry
npm test         # testy
```

Serwer wypisuje adresy, pod którymi jest dostępny (np. `http://192.168.1.20:8787` dla tabletu).

API: `GET /api/health`, `GET /api/state`, `GET/POST /api/mutes`, `DELETE /api/mutes/:id`, WebSocket `/ws`.

## Konfiguracja

Skopiuj `config/config.example.json` → `config/config.json` i `config/alerts.example.json` → `config/alerts.json`, jeśli chcesz zmienić port, ścieżkę logu albo progi alertów.

Serwer sam szuka logu gry:
- macOS: `~/Library/Application Support/Steam/userdata/<id>/3493540/local/crash_dump/stdout.txt`
- Windows: `C:\Program Files (x86)\Steam\userdata\<id>\3493540\local\crash_dump\stdout.txt`

Jeśli Steam jest w innym miejscu, ustaw `"logPath"` w `config/config.json`.

## Jak to działa

Mod gry wypisuje dane do logu gry (skrypty TF3 nie mogą zapisywać plików ani łączyć się z siecią — zob. `docs/adr/0003-wymiana-danych-przez-log-gry.md`). Serwer czyta log co sekundę, liczy alerty, zapisuje miesięczną Historię w `server/data/tflive.sqlite` i wysyła stan przez WebSocket.

Dokumentacja: `docs/superpowers/specs/2026-10-01-tflive-dashboard-design.md`, słownik pojęć: `CONTEXT.md`.
````

- [ ] **Step 11: Uruchom wszystkie testy i typecheck**

Run: `npm test && npm run typecheck`
Expected: 110 passed (wszystkie pliki testów); `tsc` bez błędów.

- [ ] **Step 12: Commit**

```bash
git add server/src/source/replay.ts server/scripts server/fixtures server/src/main.ts server/test/replay.test.ts server/test/demo.test.ts README.md
git commit -m "feat(server): tryb demo, punkt wejścia i README"
```

---

### Task 14: Warunki ukończenia — opóźnienie zapisu logu (macOS) i Windows

**Files:**
- Create: `docs/superpowers/spikes/2026-10-01-plan1-weryfikacja.md`

**Interfaces:**
- Consumes: mod sond `spike/tflive_probe` (plan 0), `spike/WINDOWS-CHECKLIST.md`, działający serwer (Task 13).
- Produces: zapis wyników warunków ukończenia z spec §8 (a, b, c) i §11 krok 2.

To zadanie wymaga uruchomienia gry przez użytkownika. Jeśli Windows nie jest dostępny, zapisz „Windows: oczekuje”. Plan 1 jest wtedy ukończony warunkowo, a test Windows przechodzi na warunki planu 2.

- [ ] **Step 1: Zainstaluj mod sond (macOS)**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
rm -rf "$D/mods/tflive_probe" && cp -R spike/tflive_probe "$D/mods/tflive_probe"
```

- [ ] **Step 2 (użytkownik): uruchom grę z modem, wczytaj kopię zapisu, graj ~60 s.** W tym czasie wykonaj w terminalu pomiar przyrostu logu:

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1)
for i in 1 2 3; do a=$(stat -f%z "$D/crash_dump/stdout.txt"); sleep 5; b=$(stat -f%z "$D/crash_dump/stdout.txt"); echo "przyrost w 5 s: $((b-a)) B"; done
grep -c "TFLIVE-PROBE\] P9" "$D/crash_dump/stdout.txt"
```

Expected: przyrost > 0 w każdej z 3 prób (linie P9 co 10 s trafiają do pliku bez buforowania na minuty).

- [ ] **Step 3: Zapisz wyniki** w `docs/superpowers/spikes/2026-10-01-plan1-weryfikacja.md`:

```markdown
# Plan 1 — weryfikacja warunków ukończenia

| Warunek (spec §8) | macOS | Windows | Dowód |
|---|---|---|---|
| (a) odczyt `stdout.txt` podczas gry | <tak/nie> | <tak/nie/oczekuje> | <LogTail w npm start / checklista krok 3> |
| (b) gra tworzy nowy log przy cyklicznym odczycie | <tak/nie> | <…> | <restart gry przy działającym npm start / checklista krok 6> |
| (c) opóźnienie zapisu logu | <przyrosty z Step 2> | <…> | <…> |
```

Dla (a) i (b) na macOS: uruchom `npm start` w trakcie gry, a potem zrestartuj grę. Sprawdź, że `curl -s localhost:8787/api/health` pokazuje `"logState":"ok"` przed i po restarcie. W logu gry nie powinno być błędów zapisu.

- [ ] **Step 4: Usuń mod sond z gry i zrób commit**

```bash
D=$(ls -d ~/Library/Application\ Support/Steam/userdata/*/3493540/local | head -1); rm -rf "$D/mods/tflive_probe"
git add docs/superpowers/spikes/2026-10-01-plan1-weryfikacja.md
git commit -m "docs: weryfikacja warunków ukończenia planu 1"
```
