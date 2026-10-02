# Plan 4: centrum dowodzenia na dużym ekranie — plan implementacji

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Na ekranach ≥ 1800×900 adres `#/przeglad` pokazuje jedno „centrum dowodzenia” wypełniające 100% okna: KPI, alerty, linie, pojazdy, wynik, przemysł i miasta naraz, bez przewijania strony.

**Architecture:** Reaktywny stan układu (`state/layout.ts`, `matchMedia`) decyduje w `App.vue`, czy pokazać `CommandCenter`. Istniejące widoki dostają prop `dense` (zwarty wariant tego samego komponentu, bez duplikowania logiki); `CommandCenter` układa je w panelach (`Panel.vue`) w siatce 3 kolumn. Gęstość sterowana zmiennymi CSS (`--fs`, `--cell-py`, `--ctl-h`…) z wartościami domyślnymi w `:root` i nadpisaniem w `.dense`. Z `OverviewView` wydzielone `KpiStrip` i `MonthsChart`, używane w obu miejscach.

**Tech Stack:** bez zmian — Vue 3.5, Vite, TypeScript strict, Vitest + @vue/test-utils + jsdom.

**Spec:** `docs/superpowers/specs/2026-10-02-tflive-centrum-dowodzenia.md` (uzupełnienie §6 `docs/superpowers/specs/2026-10-01-tflive-dashboard-design.md`). Słownik: `CONTEXT.md`.

## Global Constraints

- Interfejs po polsku, ciemny motyw, kolory z tokenów w `web/src/styles.css`, czcionki Barlow Semi Condensed / IBM Plex Mono, emoji jak dotąd.
- Próg dużego ekranu: `(min-width: 1800px) and (min-height: 900px)` — dokładnie ten tekst zapytania.
- Centrum dowodzenia mieści się w `100vh`: brak przewijania strony (`document.documentElement.scrollHeight <= innerHeight`); przewijają się wnętrza paneli.
- Proporcje kolumn 25fr / 45fr / 30fr; Linie ~55% i Pojazdy ~45% wysokości środkowej kolumny.
- Tekst w centrum: `font-size: clamp(13px, calc(1px + 0.625vw), 15px)`.
- Na dużym ekranie cele interakcji ≥ 28 px (`--ctl-h: 28px` w `.dense`); poza `.dense` nadal ≥ 44 px. Kontrast ≥ 4,5:1, widoczny fokus.
- Tablet/telefon (< 1800 px lub < 900 px wysokości): zachowanie i wygląd bez zmian; wszystkie istniejące testy przechodzą bez zmiany asercji.
- Bez nowych zależności; bez zmian w `shared/`, `server/`, `mod/`.
- Commity: temat, JEDNA pusta linia, potem dokładnie (nigdy własna nazwa modelu):
  ```
  Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K
  ```

## Review Focus

- **Wysokość okna na granicy** (np. 1920×1000 przy otwartych paskach przeglądarki, baner ostrzeżeń widoczny): centrum nadal bez przewijania strony — panele się kurczą. Sprawdzane w Task 7 (Playwright, z banerem demo).
- **Zmiana rozmiaru okna w trakcie** (z 1920 na 1280 i z powrotem): układ przełącza się bez przeładowania. Test w Task 1 (`startLayout` reaguje na `change`).
- **Długie nazwy** (linie, fabryki, miasta): nie rozpychają kolumn ani nie powodują poziomego przewijania strony — ucinane z wielokropkiem albo zawijane wewnątrz panelu. Kontrola wizualna w Task 7.
- **Pusty stan w centrum** (`meta === null`): jeden komunikat „Czekam na dane z gry…”, nie sześć. Test w Task 6.
- **Tryb zwarty nie psuje trybu zakładek**: każdy widok bez `dense` renderuje się jak dotąd. Gwarantują to niezmienione istniejące testy (Task 2–5).

---

## Struktura plików

```
web/src/state/layout.ts          NOWY: layout.wide (reaktywne), WIDE_QUERY, startLayout(win)
web/src/components/Panel.vue     NOWY: panel z nagłówkiem (tytuł, licznik, ↗) i przewijanym wnętrzem
web/src/components/KpiStrip.vue  NOWY: 6 KPI (wydzielone z OverviewView), prop compact
web/src/components/MonthsChart.vue NOWY: słupki miesięcy + fakty (wydzielone z OverviewView), prop compact
web/src/views/CommandCenter.vue  NOWY: centrum dowodzenia
web/src/views/*.vue              prop dense w Alerts/Lines/Vehicles/Industry/Towns; Overview używa KpiStrip/MonthsChart
web/src/App.vue, main.ts, styles.css, components/AppHeader.vue, components/StatusBanner.vue
web/test/layout.test.ts, dense.test.ts, command-center.test.ts   NOWE
```

---

### Task 1: Stan układu, tokeny gęstości, Panel, przełączanie w App

**Files:**
- Create: `web/src/state/layout.ts`, `web/src/components/Panel.vue`, `web/src/views/CommandCenter.vue` (tymczasowa zaślepka, zastąpiona w Task 6), `web/test/layout.test.ts`
- Modify: `web/src/App.vue`, `web/src/main.ts`, `web/src/styles.css`, `web/src/components/AppHeader.vue`, `web/src/components/StatusBanner.vue`

**Interfaces:**
- Produces:
  ```ts
  // state/layout.ts
  export const WIDE_QUERY = '(min-width: 1800px) and (min-height: 900px)';
  export const layout: { wide: boolean };               // reactive
  export function startLayout(win: { matchMedia?: (q: string) => MediaQueryList }): void;
  // Panel.vue props: { title: string; count?: number | null; href?: string }; slot domyślny = treść
  // CommandCenter.vue: root ma data-test="command-center"
  // styles.css: zmienne --fs, --cell-py, --cell-px, --ctl-h, --gap; klasa .dense
  ```

- [ ] **Step 1: Test (RED)** — `web/test/layout.test.ts`:
```ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { afterEach, describe, expect, it } from 'vitest';
import App from '../src/App.vue';
import { layout, startLayout, WIDE_QUERY } from '../src/state/layout';
import { route } from '../src/state/route';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { fixtureState } from './fixture';

function fakeMatchMedia(initial: boolean) {
  let listener: ((e: { matches: boolean }) => void) | null = null;
  const queries: string[] = [];
  const mm = (q: string) => {
    queries.push(q);
    return { matches: initial, addEventListener: (_: string, fn: (e: { matches: boolean }) => void) => { listener = fn; } } as unknown as MediaQueryList;
  };
  return { mm, queries, fire: (m: boolean) => listener?.({ matches: m }) };
}
function storeWith(): Store {
  const store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, fixtureState(), { conn: 'open', received: true });
  return store;
}
const mountApp = () => mount(App, { global: { provide: { [STORE_KEY as symbol]: storeWith() } } });

describe('układ', () => {
  afterEach(() => { layout.wide = false; route.view = 'przeglad'; });

  it('startLayout czyta zapytanie i reaguje na zmianę rozmiaru', () => {
    const f = fakeMatchMedia(true);
    startLayout({ matchMedia: f.mm });
    expect(f.queries).toEqual([WIDE_QUERY]);
    expect(layout.wide).toBe(true);
    f.fire(false);
    expect(layout.wide).toBe(false);
  });

  it('startLayout bez matchMedia zostawia wąski układ', () => {
    startLayout({});
    expect(layout.wide).toBe(false);
  });

  it('duży ekran + #/przeglad → centrum dowodzenia; inne widoki → zakładka', async () => {
    layout.wide = true;
    const w = mountApp();
    expect(w.find('[data-test="command-center"]').exists()).toBe(true);
    expect(w.find('.app').classes()).toContain('app-cc');
    route.view = 'linie';
    await w.vm.$nextTick();
    expect(w.find('[data-test="command-center"]').exists()).toBe(false);
  });

  it('wąski ekran → zwykły Przegląd', () => {
    const w = mountApp();
    expect(w.find('[data-test="command-center"]').exists()).toBe(false);
    expect(w.text()).toContain('Najważniejsze alerty');
  });
});
```
Run: `npx vitest run web/test/layout.test.ts` — Expected: FAIL (brak `../src/state/layout`).

- [ ] **Step 2: `web/src/state/layout.ts`**
```ts
import { reactive } from 'vue';

export const WIDE_QUERY = '(min-width: 1800px) and (min-height: 900px)';

export const layout = reactive<{ wide: boolean }>({ wide: false });

export function startLayout(win: { matchMedia?: (q: string) => MediaQueryList }): void {
  if (typeof win.matchMedia !== 'function') return;
  const mq = win.matchMedia(WIDE_QUERY);
  layout.wide = mq.matches;
  mq.addEventListener('change', (e) => {
    layout.wide = e.matches;
  });
}
```

- [ ] **Step 3: `web/src/components/Panel.vue`**
```vue
<script setup lang="ts">
defineProps<{ title: string; count?: number | null; href?: string }>();
</script>

<template>
  <section class="panel" :aria-label="title">
    <header class="ph">
      <h2>{{ title }}</h2>
      <span v-if="count != null" class="cnt num">{{ count }}</span>
      <a v-if="href" class="full" :href="href" :aria-label="`Pełny widok: ${title}`" title="Pełny widok">↗</a>
    </header>
    <div class="pb"><slot /></div>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.ph { display: flex; align-items: center; gap: 8px; padding: 4px 10px; min-height: 34px; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
h2 { margin: 0; font-size: 1.05em; font-weight: 700; white-space: nowrap; }
.cnt { font-size: .8em; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--soft); }
.full { margin-left: auto; min-width: 28px; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; text-decoration: none; font-weight: 700; }
.full:hover { background: var(--surface-2); }
.pb { flex: 1; min-height: 0; overflow: auto; padding: 6px 10px 8px; display: flex; flex-direction: column; }
</style>
```

- [ ] **Step 4: `web/src/views/CommandCenter.vue`** (zaślepka do Task 6)
```vue
<template>
  <div class="cc dense" data-test="command-center"></div>
</template>
```

- [ ] **Step 5: `web/src/App.vue`** — zastąp całość:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import AppHeader from './components/AppHeader.vue';
import StatusBanner from './components/StatusBanner.vue';
import { layout } from './state/layout';
import { route } from './state/route';
import AlertsView from './views/AlertsView.vue';
import CommandCenter from './views/CommandCenter.vue';
import IndustryView from './views/IndustryView.vue';
import LinesView from './views/LinesView.vue';
import OverviewView from './views/OverviewView.vue';
import TownsView from './views/TownsView.vue';
import VehiclesView from './views/VehiclesView.vue';

const VIEW_COMPONENTS = { przeglad: OverviewView, alerty: AlertsView, linie: LinesView, pojazdy: VehiclesView, przemysl: IndustryView, miasta: TownsView };
const cc = computed(() => layout.wide && route.view === 'przeglad');
const current = computed(() => (cc.value ? CommandCenter : VIEW_COMPONENTS[route.view]));
</script>

<template>
  <div class="app" :class="{ 'app-cc': cc }">
    <AppHeader />
    <StatusBanner />
    <main class="content" :class="{ 'content-cc': cc }"><component :is="current" /></main>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.app-cc { height: 100vh; min-height: 0; overflow: hidden; }
.content { flex-grow: 1; padding: 24px; display: flex; flex-direction: column; gap: 18px; max-width: 1600px; width: 100%; margin: 0 auto; }
.content-cc { max-width: none; padding: 8px; gap: 8px; min-height: 0; }
@media (min-width: 1800px) { .content { max-width: none; padding: 16px 20px; } .content-cc { padding: 8px; } }
@media (max-width: 759px) { .content { padding: 12px 12px 84px; } }
</style>
```

- [ ] **Step 6: `web/src/main.ts`** — dodaj import `import { startLayout } from './state/layout';` i wywołanie `startLayout(window);` bezpośrednio przed `startRouting(window);`.

- [ ] **Step 7: `web/src/styles.css`** — zmiany:
  - w `:root` dopisz w nowej linii: `--fs: 16px; --cell-py: 12px; --cell-px: 14px; --ctl-h: 44px; --gap: 16px;`
  - `.chip { min-height: 44px; …` → `min-height: var(--ctl-h);`; tak samo `.btn { min-height: 44px; …` → `min-height: var(--ctl-h);`
  - `th { … padding: 12px 14px; …` → `padding: var(--cell-py) var(--cell-px);`
  - `td { padding: 12px 14px; border-bottom: 1px solid #1f2931; font-size: 16px; }` → `td { padding: var(--cell-py) var(--cell-px); border-bottom: 1px solid #1f2931; font-size: var(--fs); }`
  - `.grid { display: grid; gap: 16px; }` → `.grid { display: grid; gap: var(--gap); }`
  - na końcu pliku (przed blokiem `@media (max-width: 759px)` albo po nim — kolejność bez znaczenia) dopisz:
```css
.dense { --fs: 1em; --cell-py: 4px; --cell-px: 8px; --ctl-h: 28px; --gap: 8px; }
.dense .chip { padding: 0 10px; font-size: .9em; }
.dense .btn { padding: 0 8px; font-size: .9em; }
.dense th { font-size: .75em; }
.dense thead th { position: sticky; top: -6px; background: var(--surface); z-index: 1; }
.dense .table-wrap { background: transparent; border: none; border-radius: 0; overflow: visible; }
.dense .empty { padding: 16px 8px; font-size: 1em; }
.dense .toolbar { gap: 6px; }
```

- [ ] **Step 8: `web/src/components/AppHeader.vue`** — w `<style scoped>` przed blokiem `@media (max-width: 759px)` dopisz:
```css
@media (min-width: 1800px) and (min-height: 900px) {
  .hdr { min-height: 46px; }
  .tab { min-height: 32px; font-size: 15px; }
  .pill { padding: 3px 10px; }
}
```
oraz w `web/src/components/StatusBanner.vue` w `<style scoped>` dopisz:
```css
@media (min-width: 1800px) and (min-height: 900px) { .banner { padding: 5px 16px; font-size: 14px; } }
```

- [ ] **Step 9: Testy (GREEN), pełny zestaw, typecheck, build, commit**
Run: `npx vitest run web/test/layout.test.ts && npm test && npm run typecheck && npm run build`
Expected: layout 4 passed; cały zestaw zielony (istniejące testy bez zmian); typecheck i build OK.
```bash
git add web
git commit -m "feat(web): układ dużego ekranu — stan układu, tokeny gęstości, panel" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```

---

### Task 2: KpiStrip i MonthsChart wydzielone z Przeglądu

**Files:**
- Create: `web/src/components/KpiStrip.vue`, `web/src/components/MonthsChart.vue`
- Modify: `web/src/views/OverviewView.vue`
- Test: `web/test/dense.test.ts` (nowy plik; kolejne zadania dopisują do niego)

**Interfaces:**
- Consumes: `useStore`, `reserveMonths`, `populationTotal`, `bestVehicle`, `fmt*`.
- Produces: `KpiStrip.vue` props `{ compact?: boolean }` (root `section.grid.kpis`, klasa `compact`); `MonthsChart.vue` props `{ compact?: boolean }` (root `div.mchart`, klasa `compact`). Treść identyczna jak dotąd w Przeglądzie.

- [ ] **Step 1: Test (RED)** — utwórz `web/test/dense.test.ts`:
```ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it, vi } from 'vitest';
import type { Component } from 'vue';
import KpiStrip from '../src/components/KpiStrip.vue';
import MonthsChart from '../src/components/MonthsChart.vue';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import { fixtureState } from './fixture';

export function mountDense(comp: Component, props: Record<string, unknown> = { dense: true }, s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  store.mute = vi.fn(async () => {});
  store.unmute = vi.fn(async () => {});
  return { store, w: mount(comp, { props, global: { provide: { [STORE_KEY as symbol]: store } } }) };
}
const nb = (s: string) => s.replace(/\s/g, ' ');

describe('KpiStrip i MonthsChart', () => {
  it('KpiStrip compact: 6 wartości w jednym wierszu', () => {
    const { w } = mountDense(KpiStrip, { compact: true });
    expect(w.find('section').classes()).toContain('compact');
    expect(w.findAll('.card')).toHaveLength(6);
    expect(nb(w.text())).toContain('2 263 578');
    expect(nb(w.text())).toContain('8,4');
  });
  it('MonthsChart compact: słupki, koszty i najlepszy pojazd', () => {
    const { w } = mountDense(MonthsChart, { compact: true });
    expect(w.find('.mchart').classes()).toContain('compact');
    expect(nb(w.text())).toContain('lis 1906');
    expect(nb(w.text())).toContain('3 218 127');
    expect(w.text()).toContain('Pociąg 2');
  });
});
```
Run: `npx vitest run web/test/dense.test.ts` — Expected: FAIL (brak komponentów).

- [ ] **Step 2: `web/src/components/KpiStrip.vue`**
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { populationTotal, reserveMonths } from '../lib/derive';
import { fmtDecimal, fmtInt, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

defineProps<{ compact?: boolean }>();
const { state } = useStore();
const sn = computed(() => state.snapshot);
const fin = computed(() => sn.value.finance);
const reserve = computed(() => reserveMonths(fin.value));
</script>

<template>
  <section class="grid kpis" :class="{ compact }">
    <div class="card"><div class="lbl">💰 Saldo</div><div class="num kpi">{{ fmtInt(fin?.balance) }}</div></div>
    <div class="card"><div class="lbl">🏦 Kredyt</div><div class="num kpi soft">{{ fmtInt(fin?.loan) }}</div></div>
    <div class="card"><div class="lbl">📈 Wynik operacyjny · 12 mies.</div><div class="num kpi" :class="(fin?.operatingResult12m ?? 0) >= 0 ? 'pos' : 'neg'">{{ fmtSigned(fin?.operatingResult12m) }}</div></div>
    <div class="card"><div class="lbl">🛟 Rezerwa</div><div class="num kpi">{{ fmtDecimal(reserve) }}<span v-if="reserve !== null" class="unit"> mies.</span></div></div>
    <div class="card"><div class="lbl">🚆 Pojazdy · 🛤️ Linie</div><div class="num kpi">{{ sn.vehicles.length }} · {{ sn.lines.length }}</div></div>
    <div class="card"><div class="lbl">👥 Ludność miast</div><div class="num kpi">{{ fmtInt(populationTotal(sn.towns)) }}</div></div>
  </section>
</template>

<style scoped>
.kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.kpi { font-size: 28px; margin-top: 8px; }
.kpi.soft { color: var(--soft); }
.unit { font-size: 16px; color: var(--muted); }
.compact .card { padding: 6px 12px; border-radius: 8px; display: flex; align-items: baseline; justify-content: space-between; gap: 10px; min-width: 0; }
.compact .lbl { font-size: .75em; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.compact .kpi { font-size: 1.5em; margin-top: 0; white-space: nowrap; }
.compact .unit { font-size: .6em; }
@media (max-width: 759px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } .kpi { font-size: 22px; } }
</style>
```

- [ ] **Step 3: `web/src/components/MonthsChart.vue`**
```vue
<script setup lang="ts">
import { computed } from 'vue';
import { bestVehicle } from '../lib/derive';
import { fmtInt, fmtMonthIndex, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

defineProps<{ compact?: boolean }>();
const { state } = useStore();
const fin = computed(() => state.snapshot.finance);
const best = computed(() => bestVehicle(state.snapshot.vehicles));
const months = computed(() => {
  const ms = [...(fin.value?.operatingResultByMonth ?? [])].sort((a, b) => a.month - b.month);
  const max = Math.max(1, ...ms.map((m) => Math.abs(m.value)));
  return ms.map((m) => ({ ...m, label: fmtMonthIndex(m.month), height: `${Math.max(4, (Math.abs(m.value) / max) * 100)}%`, positive: m.value >= 0 }));
});
</script>

<template>
  <div class="mchart" :class="{ compact }">
    <div class="bars">
      <div v-for="m in months" :key="m.month" class="col">
        <div class="num val" :class="m.positive ? 'pos' : 'neg'">{{ fmtSigned(m.value) }}</div>
        <div class="barv" :class="m.positive ? 'p' : 'n'" :style="{ height: m.height }"></div>
        <div class="muted lab">{{ m.label }}</div>
      </div>
    </div>
    <div class="facts">
      <div><span class="muted">🔧 Koszty bieżące · 12 mies.</span><span class="num">{{ fmtInt(fin?.runningCosts12m) }}</span></div>
      <div v-if="best"><span class="muted">🏆 Najlepszy pojazd</span><span>{{ best.name }} · <span class="num" :class="(best.operatingResult12m ?? 0) > 0 ? 'pos' : (best.operatingResult12m ?? 0) < 0 ? 'neg' : 'muted'">{{ fmtSigned(best.operatingResult12m) }}</span></span></div>
    </div>
  </div>
</template>

<style scoped>
.mchart { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.bars { display: flex; gap: 18px; align-items: flex-end; height: 240px; border-bottom: 1px solid var(--line-2); padding: 0 6px; }
.col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
.val { font-size: 13px; }
.barv { width: 100%; border-radius: 4px 4px 0 0; }
.barv.p { background: var(--pos-fill); } .barv.n { background: var(--neg-fill); opacity: .85; }
.lab { font-size: 14px; }
.facts { margin-top: auto; display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
.facts > div { display: flex; justify-content: space-between; gap: 12px; }
.compact { gap: 6px; flex: 0 0 auto; }
.compact .bars { height: 96px; gap: 10px; }
.compact .val { font-size: .75em; }
.compact .lab { font-size: .8em; }
.compact .facts { font-size: .9em; gap: 2px; margin-top: 0; }
</style>
```

- [ ] **Step 4: `web/src/views/OverviewView.vue`** — zastąp całość:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import KpiStrip from '../components/KpiStrip.vue';
import MonthsChart from '../components/MonthsChart.vue';
import SeverityBadge from '../components/SeverityBadge.vue';
import { alertEmoji } from '../lib/emoji';
import { useStore } from '../state/store';

const { state } = useStore();
const sn = computed(() => state.snapshot);
const active = computed(() => state.alerts.filter((a) => !a.muted));
const top = computed(() => active.value.slice(0, 5));
</script>

<template>
  <section v-if="!sn.meta" class="empty">⏳ Czekam na dane z gry…</section>
  <template v-else>
    <div class="muted company">🏢 {{ sn.meta.mapName ?? '—' }}</div>
    <KpiStrip />
    <section class="grid lower">
      <div class="card alerts">
        <div class="head"><h2>🔔 Najważniejsze alerty</h2><a href="#/alerty">Wszystkie ({{ active.length }})</a></div>
        <div v-if="!top.length" class="muted ok">✅ Brak aktywnych alertów.</div>
        <div v-for="a in top" :key="a.id" class="alert" data-test="top-alert">
          <SeverityBadge :severity="a.severity" />
          <div><div class="title">{{ alertEmoji(a.type) }} {{ a.title }}</div><div class="num muted detail">{{ a.detail }}</div></div>
        </div>
      </div>
      <div class="card months">
        <h2>📊 Wynik operacyjny · ostatnie miesiące</h2>
        <MonthsChart />
      </div>
    </section>
  </template>
</template>

<style scoped>
.company { font-size: 15px; }
.lower { grid-template-columns: repeat(5, minmax(0, 1fr)); }
.alerts { grid-column: span 3; display: flex; flex-direction: column; }
.months { grid-column: span 2; display: flex; flex-direction: column; gap: 14px; }
h2 { margin: 0; font-size: 20px; }
.head { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.head a { font-weight: 600; min-height: 44px; display: flex; align-items: center; }
.alert { display: flex; align-items: center; gap: 14px; padding: 12px 0; border-top: 1px solid var(--line); }
.title { font-size: 17px; font-weight: 600; }
.detail { font-size: 14px; margin-top: 2px; }
.ok { padding: 12px 0; }
</style>
```

- [ ] **Step 5: Testy (GREEN), commit**
Run: `npx vitest run web/test/dense.test.ts web/test/overview.test.ts && npm test && npm run typecheck`
Expected: dense 2 passed; overview bez zmian zielony; cały zestaw zielony.
```bash
git add web
git commit -m "refactor(web): KpiStrip i MonthsChart wydzielone z Przeglądu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```

---

### Task 3: Zwarte Alerty i Pojazdy (`dense`)

**Files:**
- Modify: `web/src/views/AlertsView.vue`, `web/src/views/VehiclesView.vue`
- Test: `web/test/dense.test.ts` (dopisz)

**Interfaces:**
- Consumes: `mountDense` z `web/test/dense.test.ts` (Task 2).
- Produces: `AlertsView` i `VehiclesView` przyjmują prop `dense?: boolean`; korzeń obu to `div.view` (z klasą `dense`, gdy prop). W trybie zwartym Alerty: bez chipsów ważności i bez „Pokaż wyciszone”; przyciski tylko z emoji, z `aria-label`/`title` („Odłóż 3 mies.”, „Ignoruj”, „Przywróć”). Pojazdy: bez nazwy modelu przy pojeździe.

- [ ] **Step 1: Test (RED)** — dopisz do `web/test/dense.test.ts` (importy na górę pliku: `import AlertsView from '../src/views/AlertsView.vue';` i `import VehiclesView from '../src/views/VehiclesView.vue';`):
```ts
describe('Alerty dense', () => {
  it('bez chipsów ważności i przełącznika wyciszonych, przyciski z etykietą dostępności', async () => {
    const { w, store } = mountDense(AlertsView);
    expect(w.find('.view').classes()).toContain('dense');
    expect(w.text()).not.toContain('Każda ważność');
    expect(w.find('input[type="checkbox"]').exists()).toBe(false);
    const snooze = w.find('[data-test="alert"] button[aria-label="Odłóż 3 mies."]');
    expect(snooze.text()).toBe('⏰');
    await snooze.trigger('click');
    expect(store.mute).toHaveBeenCalledWith(expect.objectContaining({ id: store.state.alerts[0].id }), 'snooze');
  });
  it('bez dense: przyciski z pełnym tekstem jak dotąd', () => {
    const { w } = mountDense(AlertsView, {});
    expect(w.find('.view').classes()).not.toContain('dense');
    expect(w.find('[data-test="alert"] button[aria-label="Odłóż 3 mies."]').text()).toBe('⏰ Odłóż 3 mies.');
  });
});

describe('Pojazdy dense', () => {
  it('wszystkie pojazdy, bez nazwy modelu', () => {
    const { w } = mountDense(VehiclesView);
    expect(w.find('.view').classes()).toContain('dense');
    expect(w.findAll('tbody tr')).toHaveLength(3);
    expect(w.text()).not.toContain('mogul_2_6_0');
  });
});
```
Run: `npx vitest run web/test/dense.test.ts` — Expected: FAIL (brak `.view`, model widoczny).

- [ ] **Step 2: `AlertsView.vue`**
  - W `<script setup>` po importach dodaj: `defineProps<{ dense?: boolean }>();`
  - Owiń całą zawartość `<template>` w `<div class="view" :class="{ dense }"> … </div>`.
  - Fragment od `<span class="sep" aria-hidden="true"></span>` do `<label class="muted-toggle">…</label>` włącznie owiń w `<template v-if="!dense"> … </template>`.
  - Trzy przyciski akcji zastąp:
```vue
      <template v-if="!a.muted">
        <button class="btn" type="button" aria-label="Odłóż 3 mies." title="Odłóż 3 mies." :disabled="busy === a.id" @click="act(a, () => store.mute(a, 'snooze'))">⏰<template v-if="!dense"> Odłóż 3 mies.</template></button>
        <button class="btn" type="button" aria-label="Ignoruj" title="Ignoruj" :disabled="busy === a.id" @click="act(a, () => store.mute(a, 'ignore'))">🔕<template v-if="!dense"> Ignoruj</template></button>
      </template>
      <button v-else class="btn" type="button" aria-label="Przywróć" title="Przywróć" :disabled="busy === a.id" @click="act(a, () => store.unmute(a))">🔔<template v-if="!dense"> Przywróć</template></button>
```
  - W `<style scoped>` dopisz:
```css
.view { display: flex; flex-direction: column; gap: 18px; }
.view.dense { gap: 6px; }
.dense .row { padding: 5px 2px; gap: 8px; flex-wrap: nowrap; align-items: flex-start; }
.dense .body { min-width: 0; }
.dense .title { font-size: 1em; }
.dense .sub { font-size: .86em; }
.dense .list { background: transparent; border: none; overflow: visible; }
.dense .action-error { padding: 6px 10px; }
.dense .sev { min-width: 58px; height: 20px; font-size: 10px; }
```
  - Uwaga: istniejące testy szukają przycisków po tekście `Odłóż`/`Ignoruj`/`Przywróć` — w trybie bez `dense` tekst jest nadal widoczny, więc przechodzą bez zmian.

- [ ] **Step 3: `VehiclesView.vue`**
  - W `<script setup>` po importach dodaj: `defineProps<{ dense?: boolean }>();`
  - `<template v-else>` (korzeń widoku z danymi) zamień na `<div v-else class="view" :class="{ dense }">`, a odpowiadające mu `</template>` na `</div>`.
  - `<span v-if="v.parts[0]" class="muted model">` → `<span v-if="v.parts[0] && !dense" class="muted model">`.
  - W `.linesel select { min-height: 44px; …` zamień `min-height: 44px` na `min-height: var(--ctl-h)`.
  - W `<style scoped>` dopisz:
```css
.view { display: flex; flex-direction: column; gap: 18px; }
.view.dense { gap: 6px; }
.dense .linesel select { font-size: .9em; max-width: 200px; padding: 0 6px; }
.dense .cond .bar { width: 50px; }
.dense .st { font-size: .9em; }
```

- [ ] **Step 4: Testy (GREEN), commit**
Run: `npx vitest run web/test/dense.test.ts web/test/alerts.test.ts web/test/vehicles.test.ts && npm test && npm run typecheck`
Expected: wszystko zielone, istniejące testy bez zmian.
```bash
git add web
git commit -m "feat(web): zwarte Alerty i Pojazdy" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```

---

### Task 4: Zwarte Linie — mini-wykres i szczegóły rozwijane w wierszu

**Files:**
- Modify: `web/src/views/LinesView.vue` (zastąp całość)
- Test: `web/test/dense.test.ts` (dopisz)

**Interfaces:**
- Produces: `LinesView` prop `dense?: boolean`. W trybie zwartym: brak bocznego panelu `[data-test="detail"]`; kolumna „3 mies.” z `[data-test="spark"]`; kliknięcie/Enter na wierszu rozwija pod nim `tr[data-test="expand"]` (przystanki z oczekującymi, pojazdy ze stanem, alerty linii), ponowne kliknięcie zwija; wiersz ma `aria-expanded`. Bez `dense` — zachowanie jak dotąd.

- [ ] **Step 1: Test (RED)** — dopisz do `web/test/dense.test.ts` (import `import LinesView from '../src/views/LinesView.vue';`):
```ts
describe('Linie dense', () => {
  it('bez panelu bocznego, z mini-wykresem; wiersz rozwija i zwija szczegóły', async () => {
    const { w } = mountDense(LinesView);
    expect(w.find('[data-test="detail"]').exists()).toBe(false);
    expect(w.findAll('[data-test="spark"]')).toHaveLength(3);
    expect(w.find('[data-test="expand"]').exists()).toBe(false);
    const row = w.findAll('tbody tr').find((r) => r.text().includes('TC - Drewno,Deski'))!;
    await row.trigger('click');
    const exp = w.find('[data-test="expand"]');
    expect(exp.text()).toContain('Dworzec Uxbridge Południe');
    expect(exp.text()).toContain('Pociąg 2');
    expect(row.attributes('aria-expanded')).toBe('true');
    await row.trigger('click');
    expect(w.find('[data-test="expand"]').exists()).toBe(false);
  });
  it('Enter rozwija szczegóły', async () => {
    const { w } = mountDense(LinesView);
    const row = w.findAll('tbody tr').find((r) => r.text().includes('Bus - Pasażerski - Eccles LO'))!;
    await row.trigger('keydown.enter');
    expect(w.find('[data-test="expand"]').text()).toContain('Kings Road');
  });
});
```
Run: `npx vitest run web/test/dense.test.ts` — Expected: FAIL.

- [ ] **Step 2: `web/src/views/LinesView.vue`** — zastąp całość:
```vue
<script setup lang="ts">
import type { Line } from '@tflive/shared';
import { computed, ref } from 'vue';
import { alertsFor, isRampUp, lineLoadNow } from '../lib/derive';
import { alertEmoji, cargoEmoji, cargoLabel, modeEmoji, modeLabel, VEHICLE_STATE } from '../lib/emoji';
import { fmtInt, fmtMonthIndex, fmtPct, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

const props = defineProps<{ dense?: boolean }>();
const { state } = useStore();
const sn = computed(() => state.snapshot);
type SortKey = 'result' | 'vehicles' | 'load';
const sort = ref<{ key: SortKey; dir: 1 | -1 }>({ key: 'result', dir: 1 });
const selectedId = ref<number | null>(null);
const expandedId = ref<number | null>(null);

function monthBars(l: Line, minPct: number) {
  const months = [...l.operatingResultByMonth].sort((a, b) => a.month - b.month);
  const max = Math.max(1, ...months.map((m) => Math.abs(m.value)));
  return months.map((m) => ({ ...m, label: fmtMonthIndex(m.month), h: `${Math.max(minPct, (Math.abs(m.value) / max) * 100)}%`, pos: m.value >= 0 }));
}

const rows = computed(() =>
  sn.value.lines
    .map((l) => ({
      line: l,
      load: lineLoadNow(l, sn.value.vehicles),
      rampUp: sn.value.meta ? isRampUp(l, sn.value.meta.gameTime, sn.value.meta.dayMs) : false,
      alerts: alertsFor(state.alerts, 'line', l.id).filter((a) => !a.muted),
      spark: monthBars(l, 10),
    }))
    .sort((a, b) => {
      if (sort.value.key === 'load') {
        if (a.load === null && b.load === null) return 0;
        if (a.load === null) return 1;
        if (b.load === null) return -1;
        return (a.load - b.load) * sort.value.dir;
      }
      const va = sort.value.key === 'result' ? a.line.operatingResult12m : a.line.vehicleIds.length;
      const vb = sort.value.key === 'result' ? b.line.operatingResult12m : b.line.vehicleIds.length;
      return (va - vb) * sort.value.dir;
    }),
);
const selected = computed<Line | null>(() => sn.value.lines.find((l) => l.id === selectedId.value) ?? rows.value[0]?.line ?? null);

function buildDetail(l: Line) {
  return {
    line: l,
    load: lineLoadNow(l, sn.value.vehicles),
    stops: l.stopIds.map((id) => sn.value.stops.find((s) => s.id === id)).filter((s) => !!s),
    vehicles: sn.value.vehicles.filter((v) => v.lineId === l.id),
    months: monthBars(l, 6),
    alerts: alertsFor(state.alerts, 'line', l.id).filter((a) => !a.muted),
  };
}
const detail = computed(() => (selected.value ? buildDetail(selected.value) : null));
const expanded = computed(() => {
  const l = sn.value.lines.find((x) => x.id === expandedId.value);
  return l ? buildDetail(l) : null;
});
const colCount = computed(() => (props.dense ? 6 : 5));

function choose(id: number) {
  if (props.dense) expandedId.value = expandedId.value === id ? null : id;
  else selectedId.value = id;
}
const isSel = (id: number) => (props.dense ? expandedId.value === id : selected.value?.id === id);
function toggle(key: SortKey) {
  sort.value = sort.value.key === key ? { key, dir: sort.value.dir === 1 ? -1 : 1 } : { key, dir: key === 'vehicles' ? -1 : 1 };
}
const ariaSort = (key: SortKey) => (sort.value.key === key ? (sort.value.dir === 1 ? 'ascending' : 'descending') : undefined);
</script>

<template>
  <section v-if="!sn.meta" class="empty">⏳ Czekam na dane z gry…</section>
  <section v-else-if="!sn.lines.length" class="empty">Brak linii.</section>
  <div v-else class="grid layout" :class="{ dense }">
    <section class="table-wrap main">
      <table>
        <thead>
          <tr>
            <th>Linia</th>
            <th>Tryb</th>
            <th class="r" :aria-sort="ariaSort('vehicles')"><button class="sortbtn" type="button" data-sort="vehicles" @click="toggle('vehicles')">Pojazdy</button></th>
            <th class="r" :aria-sort="ariaSort('result')"><button class="sortbtn" type="button" data-sort="result" @click="toggle('result')">Wynik · 12 mies. {{ sort.key === 'result' ? (sort.dir === 1 ? '▴' : '▾') : '' }}</button></th>
            <th :aria-sort="ariaSort('load')"><button class="sortbtn" type="button" data-sort="load" @click="toggle('load')">Obłożenie teraz {{ sort.key === 'load' ? (sort.dir === 1 ? '▴' : '▾') : '' }}</button></th>
            <th v-if="dense">3 mies.</th>
          </tr>
        </thead>
        <tbody>
          <template v-for="r in rows" :key="r.line.id">
            <tr
              class="clickable"
              :class="{ sel: isSel(r.line.id) }"
              tabindex="0"
              :aria-expanded="dense ? expandedId === r.line.id : undefined"
              @click="choose(r.line.id)"
              @keydown.enter="choose(r.line.id)"
            >
              <td class="name">
                {{ r.line.name }}
                <span v-if="!r.line.vehicleIds.length" class="tag tag-warn">🚫 bez pojazdów</span>
                <span v-if="r.rampUp" class="tag tag-info">🌱 rozruch</span>
                <span v-if="r.alerts.length" class="tag tag-warn">⚠️ {{ r.alerts.length }}</span>
              </td>
              <td><span class="tag tag-neutral" :title="modeLabel(r.line.mode)">{{ modeEmoji(r.line.mode) }}<template v-if="!dense"> {{ modeLabel(r.line.mode) }}</template></span></td>
              <td class="r num">{{ r.line.vehicleIds.length }}</td>
              <td class="r num" :class="r.line.operatingResult12m < 0 ? 'neg' : r.line.operatingResult12m > 0 ? 'pos' : 'muted'">{{ fmtSigned(r.line.operatingResult12m) }}</td>
              <td><div v-if="r.load !== null" class="loadcell"><div class="bar"><span :class="{ warn: r.load < 0.25 }" :style="{ width: fmtPct(r.load) }"></span></div><span class="num">{{ fmtPct(r.load) }}</span></div><span v-else class="muted">—</span></td>
              <td v-if="dense" data-test="spark"><span class="spark"><span v-for="m in r.spark" :key="m.month" :class="m.pos ? 'p' : 'n'" :style="{ height: m.h }" :title="`${m.label}: ${fmtSigned(m.value)}`"></span></span></td>
            </tr>
            <tr v-if="dense && expanded && expanded.line.id === r.line.id" class="expand" data-test="expand">
              <td :colspan="colCount">
                <div class="exp">
                  <div>
                    <span class="lbl">🚏 Przystanki</span>
                    <span v-if="!expanded.stops.length" class="muted"> —</span>
                    <span v-for="s in expanded.stops" :key="s!.id" class="item">{{ s!.name }} <span class="muted">(<template v-if="s!.waiting.length"><template v-for="w in s!.waiting" :key="w.cargo">{{ cargoEmoji(w.cargo) }} <span class="num">{{ fmtInt(w.count) }}</span> </template></template><template v-else>0</template>)</span></span>
                  </div>
                  <div>
                    <span class="lbl">🚆 Pojazdy</span>
                    <span v-if="!expanded.vehicles.length" class="muted"> —</span>
                    <span v-for="v in expanded.vehicles" :key="v.id" class="item">{{ v.name }} <span class="muted">{{ VEHICLE_STATE[v.state].emoji }} <span class="num">{{ v.load }}/{{ v.capacity }}</span></span></span>
                  </div>
                  <div v-if="expanded.alerts.length">
                    <span v-for="a in expanded.alerts" :key="a.id" class="tag tag-warn item">{{ alertEmoji(a.type) }} {{ a.title }}</span>
                  </div>
                </div>
              </td>
            </tr>
          </template>
        </tbody>
      </table>
    </section>
    <aside v-if="!dense && detail" class="card side" data-test="detail">
      <div class="lbl">Szczegóły linii</div>
      <h2>{{ modeEmoji(detail.line.mode) }} {{ detail.line.name }}</h2>
      <div class="grid stats">
        <div class="stat"><div class="muted">📈 Wynik · 12 mies.</div><div class="num big" :class="detail.line.operatingResult12m < 0 ? 'neg' : 'pos'">{{ fmtSigned(detail.line.operatingResult12m) }}</div></div>
        <div class="stat"><div class="muted">💺 Obłożenie teraz</div><div class="num big">{{ fmtPct(detail.load) }}</div></div>
      </div>
      <div v-for="a in detail.alerts" :key="a.id" class="tag tag-warn alert">{{ alertEmoji(a.type) }} {{ a.title }}</div>
      <h3>🚏 Przystanki</h3>
      <div v-if="!detail.stops.length" class="muted">—</div>
      <div v-for="s in detail.stops" :key="s!.id" class="li">
        <span>{{ s!.name }}</span>
        <span class="muted">oczekuje <template v-for="w in s!.waiting" :key="w.cargo">{{ cargoEmoji(w.cargo) }} {{ cargoLabel(w.cargo) }} <span class="num txt">{{ fmtInt(w.count) }}</span> </template><template v-if="!s!.waiting.length">0</template></span>
      </div>
      <h3>🚆 Pojazdy na linii</h3>
      <div v-if="!detail.vehicles.length" class="muted">—</div>
      <div v-for="v in detail.vehicles" :key="v.id" class="li">
        <span>{{ v.name }}</span>
        <span class="muted">{{ VEHICLE_STATE[v.state].emoji }} {{ VEHICLE_STATE[v.state].label }} · <span class="num txt">{{ v.load }}/{{ v.capacity }}</span></span>
      </div>
      <template v-if="detail.months.length">
        <h3>📊 Wynik miesięczny</h3>
        <div class="mbars">
          <div v-for="m in detail.months" :key="m.month" class="mcol" :title="`${m.label}: ${fmtSigned(m.value)}`">
            <div class="mbar" :class="m.pos ? 'p' : 'n'" :style="{ height: m.h }"></div>
            <div class="muted mlab">{{ m.label }}</div>
          </div>
        </div>
      </template>
    </aside>
  </div>
</template>

<style scoped>
.layout { grid-template-columns: repeat(5, minmax(0, 1fr)); align-items: start; }
.main { grid-column: span 3; }
.side { grid-column: span 2; display: flex; flex-direction: column; gap: 10px; }
h2 { margin: 0; font-size: 22px; }
h3 { margin: 10px 0 0; font-size: 15px; }
.sortbtn { all: unset; cursor: pointer; min-height: var(--ctl-h); display: inline-flex; align-items: center; font: inherit; }
.sortbtn:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.loadcell { display: flex; align-items: center; gap: 8px; }
.loadcell .bar { width: 90px; }
.stats { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.stat { padding: 12px; border: 1px solid var(--line); border-radius: 8px; }
.big { font-size: 20px; }
.li { display: flex; justify-content: space-between; gap: 12px; padding: 9px 0; border-top: 1px solid var(--line); font-size: 15px; }
.txt { color: var(--text); }
.alert { padding: 6px 10px; }
.mbars { display: flex; gap: 10px; align-items: flex-end; height: 90px; border-bottom: 1px solid var(--line-2); }
.mcol { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
.mbar { width: 100%; border-radius: 3px 3px 0 0; }
.mbar.p { background: var(--pos-fill); } .mbar.n { background: var(--neg-fill); opacity: .85; }
.mlab { font-size: 12px; }
.layout.dense { display: block; }
.dense .loadcell .bar { width: 56px; }
.dense .name { max-width: 0; width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.spark { display: inline-flex; align-items: flex-end; gap: 2px; height: 16px; }
.spark > span { width: 6px; border-radius: 1px; }
.spark .p { background: var(--pos-fill); } .spark .n { background: var(--neg-fill); }
tr.expand td { background: #12181d; }
.exp { display: flex; flex-direction: column; gap: 3px; font-size: .92em; padding: 2px 0 4px; white-space: normal; }
.item { margin-right: 12px; }
</style>
```

- [ ] **Step 3: Testy (GREEN), commit**
Run: `npx vitest run web/test/dense.test.ts web/test/lines.test.ts && npm test && npm run typecheck`
Expected: wszystko zielone; `lines.test.ts` bez zmian.
```bash
git add web
git commit -m "feat(web): zwarte Linie — mini-wykres i szczegóły w wierszu" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```

---

### Task 5: Zwarte Przemysł i Miasta (wiersze zamiast kart)

**Files:**
- Modify: `web/src/views/IndustryView.vue`, `web/src/views/TownsView.vue`
- Test: `web/test/dense.test.ts` (dopisz)

**Interfaces:**
- Produces: oba widoki z prop `dense?: boolean` i korzeniem `div.view`. W trybie zwartym zamiast kart: Przemysł — wiersze `[data-test="industry"]` (emoji+nazwa, poziom, mini-paski produkcji z %, tag), groźba zamknięcia nad listą; Miasta — wiersze `[data-test="town"]` (nazwa, 👥 ludność, 📉, 💡 N, potrzeby w jednej linii: emoji dzielnicy+towaru i `%` albo `0/popyt`). Filtry jak dotąd.

- [ ] **Step 1: Test (RED)** — dopisz do `web/test/dense.test.ts` (importy `IndustryView`, `TownsView` z `../src/views/…`):
```ts
describe('Przemysł i Miasta dense', () => {
  it('Przemysł: wiersze zamiast kart, groźba zamknięcia, produkcja z %', () => {
    const { w } = mountDense(IndustryView);
    expect(w.find('.view').classes()).toContain('dense');
    expect(w.find('.card').exists()).toBe(false);
    expect(w.findAll('[data-test="industry"]')).toHaveLength(2);
    expect(w.text()).toContain('45 dni');
    expect(w.text()).toContain('42%');
    expect(w.text()).toContain('📦 zalega');
  });
  it('Miasta: wiersze z potrzebami i szansami', () => {
    const { w } = mountDense(TownsView);
    expect(w.find('.card').exists()).toBe(false);
    const rows = w.findAll('[data-test="town"]');
    expect(rows).toHaveLength(2);
    const t = w.text().replace(/\s/g, ' ');
    expect(t).toContain('💡 2');
    expect(t).toContain('0/99');
    expect(t).toContain('18%');
  });
});
```
Run: `npx vitest run web/test/dense.test.ts` — Expected: FAIL.

- [ ] **Step 2: `IndustryView.vue`**
  - Po importach: `defineProps<{ dense?: boolean }>();`
  - `<template v-else>` → `<div v-else class="view" :class="{ dense }">`, odpowiadające `</template>` → `</div>`.
  - `<section class="grid cards">` → `<section v-if="!dense" class="grid cards">`; zaraz po zamykającym `</section>` tej sekcji dodaj:
```vue
    <div v-else class="rows">
      <div v-for="i in list" :key="i.id" class="irow" data-test="industry">
        <span class="nm" :title="i.name">{{ industryEmoji(i.type) }} {{ i.name }} <span class="muted num">{{ i.level }}/{{ i.maxLevel }}</span></span>
        <span class="outs">
          <span v-for="o in i.outputs" :key="o.cargo" class="out" :title="`${cargoLabel(o.cargo)}: ${fmtInt(o.stock)}/${fmtInt(o.capacity)}`">{{ cargoEmoji(o.cargo) }} <span class="bar"><span :class="{ warn: o.capacity > 0 && o.stock / o.capacity >= 0.8 }" :style="{ width: fmtPct(o.capacity > 0 ? Math.min(1, o.stock / o.capacity) : 0) }"></span></span> <span class="num">{{ fmtPct(o.capacity > 0 ? o.stock / o.capacity : null) }}</span></span>
        </span>
        <span class="tag" :class="tag(i).cls">{{ tag(i).text }}</span>
      </div>
    </div>
```
  - W `<style scoped>` dopisz:
```css
.view { display: flex; flex-direction: column; gap: 18px; }
.view.dense { gap: 6px; }
.dense .threat { padding: 4px 8px; font-size: .92em; border-radius: 6px; gap: 6px; }
.dense .crit { font-size: 10px; padding: 2px 6px; }
.rows { display: flex; flex-direction: column; }
.irow { display: grid; grid-template-columns: minmax(0, 1fr) auto auto; gap: 8px; align-items: center; padding: 4px 0; border-top: 1px solid var(--line); }
.irow:first-child { border-top: none; }
.nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.outs { display: flex; gap: 10px; }
.out { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
.out .bar { width: 44px; height: 6px; margin-top: 0; }
```

- [ ] **Step 3: `TownsView.vue`**
  - Po importach: `defineProps<{ dense?: boolean }>();`
  - `<template v-else>` → `<div v-else class="view" :class="{ dense }">`, odpowiadające `</template>` → `</div>`.
  - `<section class="grid cards">` → `<section v-if="!dense" class="grid cards">`; zaraz po zamykającym `</section>` dodaj:
```vue
    <div v-else class="rows">
      <div v-for="t in list" :key="t.id" class="trow" data-test="town">
        <div class="thead">
          <span class="nm">🏙️ {{ t.name }}</span>
          <span class="muted num">👥 {{ fmtInt(t.population) }}</span>
          <span v-if="hasDrop(t)" class="tag tag-warn" title="spadek dostaw">📉</span>
          <span v-if="opportunities(t)" class="tag tag-info" :title="`${opportunities(t)} ${plSzansa(opportunities(t))}`">💡 {{ opportunities(t) }}</span>
        </div>
        <div v-if="t.needs.length" class="needs">
          <span v-for="n in t.needs" :key="`${n.district}:${n.cargo}`" class="need" :class="{ opp: !n.supplied }" :title="`${DISTRICT[n.district].label} · ${cargoLabel(n.cargo)}`">{{ DISTRICT[n.district].emoji }}{{ cargoEmoji(n.cargo) }} <span class="num">{{ n.supplied && n.demand > 0 ? fmtPct(n.supplied / n.demand) : n.supplied ? '—' : `0/${fmtInt(n.demand)}` }}</span></span>
        </div>
      </div>
    </div>
```
  - W `<style scoped>` dopisz:
```css
.view { display: flex; flex-direction: column; gap: 18px; }
.view.dense { gap: 6px; }
.rows { display: flex; flex-direction: column; }
.trow { padding: 4px 0; border-top: 1px solid var(--line); }
.trow:first-child { border-top: none; }
.thead { display: flex; align-items: center; gap: 8px; }
.thead .nm { font-weight: 600; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.needs { display: flex; flex-wrap: wrap; gap: 2px 12px; margin-top: 2px; font-size: .9em; }
.need.opp { color: #cfe6ff; }
.dense .hiddeninfo { font-size: .85em; gap: 8px; }
```

- [ ] **Step 4: Testy (GREEN), commit**
Run: `npx vitest run web/test/dense.test.ts web/test/industry-towns.test.ts && npm test && npm run typecheck`
Expected: wszystko zielone; `industry-towns.test.ts` bez zmian.
```bash
git add web
git commit -m "feat(web): zwarte Przemysł i Miasta" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```

---

### Task 6: CommandCenter — siatka paneli

**Files:**
- Modify: `web/src/views/CommandCenter.vue` (zastąp zaślepkę)
- Test: `web/test/command-center.test.ts`

**Interfaces:**
- Consumes: `Panel` (Task 1), `KpiStrip`, `MonthsChart` (Task 2), widoki z `dense` (Task 3–5), `useStore`.
- Produces: `CommandCenter.vue` — root `div.cc.dense[data-test="command-center"]`; panele z `aria-label`: „🔔 Alerty”, „🛤️ Linie”, „🚆 Pojazdy”, „📊 Wynik operacyjny”, „🏭 Przemysł”, „🏙️ Miasta”; linki ↗ do `#/alerty`, `#/linie`, `#/pojazdy`, `#/przemysl`, `#/miasta`; pusty stan: jeden komunikat.

- [ ] **Step 1: Test (RED)** — `web/test/command-center.test.ts`:
```ts
// @vitest-environment jsdom
import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import { createStore, STORE_KEY, type Store } from '../src/state/store';
import CommandCenter from '../src/views/CommandCenter.vue';
import { emptyState, fixtureState } from './fixture';

function mountCC(s = fixtureState()) {
  const store: Store = createStore({ url: 'x', wsFactory: () => ({ onopen: null, onmessage: null, onclose: null, onerror: null, close() {} }), fetch: async () => new Response('[]') });
  Object.assign(store.state, s, { conn: 'open', received: true });
  return mount(CommandCenter, { global: { provide: { [STORE_KEY as symbol]: store } } });
}

describe('Centrum dowodzenia', () => {
  it('sześć paneli z linkami do pełnych widoków i KPI', () => {
    const w = mountCC();
    const cc = w.find('[data-test="command-center"]');
    expect(cc.classes()).toEqual(expect.arrayContaining(['cc', 'dense']));
    const labels = w.findAll('section.panel').map((p) => p.attributes('aria-label'));
    expect(labels).toEqual(['🔔 Alerty', '🛤️ Linie', '🚆 Pojazdy', '📊 Wynik operacyjny', '🏭 Przemysł', '🏙️ Miasta']);
    expect(w.findAll('a.full').map((a) => a.attributes('href'))).toEqual(['#/alerty', '#/linie', '#/pojazdy', '#/przemysl', '#/miasta']);
    expect(w.find('.kpis.compact').exists()).toBe(true);
  });
  it('dane wszystkich obszarów naraz', () => {
    const t = mountCC().text();
    for (const s of ['Pojazd bez trasy: Autobus 1', 'TC - Drewno,Deski', 'Autobus 2', 'lis 1906', 'Eccles Poręba', 'Uxbridge']) expect(t).toContain(s);
  });
  it('liczniki w nagłówkach paneli', () => {
    const counts = mountCC().findAll('section.panel .cnt').map((c) => c.text());
    expect(counts).toEqual(['5', '3', '3', '3', '3']);
  });
  it('pusty stan: jeden komunikat', () => {
    const w = mountCC(emptyState());
    expect(w.findAll('section.panel')).toHaveLength(0);
    expect(w.text().match(/Czekam na dane z gry/g)).toHaveLength(1);
  });
});
```
(Liczniki: 5 niewyciszonych alertów, 3 linie, 3 pojazdy, 3 fabryki, 3 miasta; panel Wynik bez licznika.)
Run: `npx vitest run web/test/command-center.test.ts` — Expected: FAIL.

- [ ] **Step 2: `web/src/views/CommandCenter.vue`** — zastąp całość:
```vue
<script setup lang="ts">
import { computed } from 'vue';
import KpiStrip from '../components/KpiStrip.vue';
import MonthsChart from '../components/MonthsChart.vue';
import Panel from '../components/Panel.vue';
import { useStore } from '../state/store';
import AlertsView from './AlertsView.vue';
import IndustryView from './IndustryView.vue';
import LinesView from './LinesView.vue';
import TownsView from './TownsView.vue';
import VehiclesView from './VehiclesView.vue';

const { state } = useStore();
const sn = computed(() => state.snapshot);
const activeAlerts = computed(() => state.alerts.filter((a) => !a.muted).length);
</script>

<template>
  <div class="cc dense" data-test="command-center">
    <section v-if="!sn.meta" class="empty">⏳ Czekam na dane z gry…</section>
    <template v-else>
      <KpiStrip compact />
      <div class="cols">
        <div class="col">
          <Panel class="p-fill" title="🔔 Alerty" :count="activeAlerts" href="#/alerty"><AlertsView dense /></Panel>
        </div>
        <div class="col">
          <Panel class="p-lines" title="🛤️ Linie" :count="sn.lines.length" href="#/linie"><LinesView dense /></Panel>
          <Panel class="p-veh" title="🚆 Pojazdy" :count="sn.vehicles.length" href="#/pojazdy"><VehiclesView dense /></Panel>
        </div>
        <div class="col">
          <Panel class="p-auto" title="📊 Wynik operacyjny"><MonthsChart compact /></Panel>
          <Panel class="p-fill" title="🏭 Przemysł" :count="sn.industries.length" href="#/przemysl"><IndustryView dense /></Panel>
          <Panel class="p-fill" title="🏙️ Miasta" :count="sn.towns.length" href="#/miasta"><TownsView dense /></Panel>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.cc { height: 100%; min-height: 0; display: flex; flex-direction: column; gap: 8px; font-size: clamp(13px, calc(1px + 0.625vw), 15px); }
.cols { flex: 1; min-height: 0; display: grid; grid-template-columns: 25fr 45fr 30fr; gap: 8px; }
.col { display: flex; flex-direction: column; gap: 8px; min-height: 0; min-width: 0; }
.p-fill { flex: 1 1 0; }
.p-lines { flex: 55 1 0; }
.p-veh { flex: 45 1 0; }
.p-auto { flex: 0 0 auto; }
</style>
```

- [ ] **Step 3: Testy (GREEN), pełny zestaw, build, commit**
Run: `npx vitest run web/test/command-center.test.ts && npm test && npm run typecheck && npm run build`
Expected: command-center 4 passed; wszystko zielone; build OK.
```bash
git add web
git commit -m "feat(web): centrum dowodzenia na dużym ekranie" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```

---

### Task 7: Kontrola wizualna w trzech rozdzielczościach (kontroler)

**Files:**
- Create: `docs/superpowers/spikes/2026-10-02-plan4-weryfikacja.md`
- Modify (tylko jeśli kontrola wykaże usterkę — poprawki przez implementera, nie kontrolera)

To zadanie wykonuje kontroler (przeglądarka).

- [ ] **Step 1:** `npm run demo` w tle; Playwright: dla każdej rozdzielczości 1920×1080, 2048×1152, 2560×1440 otwórz `http://localhost:8787/#/przeglad` i sprawdź przez `browser_evaluate`:
```js
() => { const de = document.documentElement; const cc = document.querySelector('[data-test="command-center"]'); const r = cc?.getBoundingClientRect();
  return { cc: !!cc, pageScroll: de.scrollHeight > innerHeight || de.scrollWidth > innerWidth, fill: r ? Math.round((r.bottom / innerHeight) * 100) : 0,
    panels: [...document.querySelectorAll('section.panel')].map(p => { const b = p.getBoundingClientRect(); return [p.getAttribute('aria-label'), Math.round(b.width), Math.round(b.height)]; }) }; }
```
Expected: `cc: true`, `pageScroll: false`, `fill ≥ 98`, 6 paneli o dodatniej wysokości. Zrzut ekranu każdej rozdzielczości — porównanie z projektem (spec), czytelność, brak ucinania tekstu poza wielokropkiem.
- [ ] **Step 2:** 1280×800 i 390×844: brak centrum (`cc: false`), zakładki jak dotąd. Klawiatura: Tab przez panel Linie, Enter rozwija wiersz, fokus widoczny.
- [ ] **Step 3:** Zapisz wyniki w `docs/superpowers/spikes/2026-10-02-plan4-weryfikacja.md` (tabela rozdzielczość → wynik, uwagi) i zrób commit:
```bash
git add docs/superpowers/spikes/2026-10-02-plan4-weryfikacja.md
git commit -m "docs: centrum dowodzenia — kontrola wizualna" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01T91NpZcqyTDnQB7HUqAw4K"
```
