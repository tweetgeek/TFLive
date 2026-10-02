<script setup lang="ts">
import type { Line } from '@tflive/shared';
import { computed, ref } from 'vue';
import { alertsFor, isRampUp, lineLoadNow } from '../lib/derive';
import { alertEmoji, cargoEmoji, cargoLabel, modeEmoji, modeLabel, VEHICLE_STATE } from '../lib/emoji';
import { fmtInt, fmtMonthIndex, fmtPct, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

const { state } = useStore();
const sn = computed(() => state.snapshot);
type SortKey = 'result' | 'vehicles' | 'load';
const sort = ref<{ key: SortKey; dir: 1 | -1 }>({ key: 'result', dir: 1 });
const selectedId = ref<number | null>(null);

const rows = computed(() =>
  sn.value.lines
    .map((l) => ({
      line: l,
      load: lineLoadNow(l, sn.value.vehicles),
      rampUp: sn.value.meta ? isRampUp(l, sn.value.meta.gameTime, sn.value.meta.dayMs) : false,
      alerts: alertsFor(state.alerts, 'line', l.id).filter((a) => !a.muted),
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
const detail = computed(() => {
  const l = selected.value;
  if (!l) return null;
  const stops = l.stopIds.map((id) => sn.value.stops.find((s) => s.id === id)).filter((s) => !!s);
  const vehicles = sn.value.vehicles.filter((v) => v.lineId === l.id);
  const months = [...l.operatingResultByMonth].sort((a, b) => a.month - b.month);
  const max = Math.max(1, ...months.map((m) => Math.abs(m.value)));
  return {
    line: l,
    load: lineLoadNow(l, sn.value.vehicles),
    stops,
    vehicles,
    months: months.map((m) => ({ ...m, label: fmtMonthIndex(m.month), h: `${Math.max(6, (Math.abs(m.value) / max) * 100)}%`, pos: m.value >= 0 })),
    alerts: alertsFor(state.alerts, 'line', l.id).filter((a) => !a.muted),
  };
});

function toggle(key: SortKey) {
  sort.value = sort.value.key === key ? { key, dir: sort.value.dir === 1 ? -1 : 1 } : { key, dir: key === 'vehicles' ? -1 : 1 };
}
const ariaSort = (key: SortKey) => (sort.value.key === key ? (sort.value.dir === 1 ? 'ascending' : 'descending') : undefined);
</script>

<template>
  <section v-if="!sn.meta" class="empty">⏳ Czekam na dane z gry…</section>
  <section v-else-if="!sn.lines.length" class="empty">Brak linii.</section>
  <div v-else class="grid layout">
    <section class="table-wrap main">
      <table>
        <thead>
          <tr>
            <th>Linia</th>
            <th>Tryb</th>
            <th class="r" :aria-sort="ariaSort('vehicles')"><button class="sortbtn" type="button" data-sort="vehicles" @click="toggle('vehicles')">Pojazdy</button></th>
            <th class="r" :aria-sort="ariaSort('result')"><button class="sortbtn" type="button" data-sort="result" @click="toggle('result')">Wynik · 12 mies. {{ sort.key === 'result' ? (sort.dir === 1 ? '▴' : '▾') : '' }}</button></th>
            <th :aria-sort="ariaSort('load')"><button class="sortbtn" type="button" data-sort="load" @click="toggle('load')">Obłożenie teraz {{ sort.key === 'load' ? (sort.dir === 1 ? '▴' : '▾') : '' }}</button></th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="r in rows"
            :key="r.line.id"
            class="clickable"
            :class="{ sel: selected?.id === r.line.id }"
            tabindex="0"
            @click="selectedId = r.line.id"
            @keydown.enter="selectedId = r.line.id"
          >
            <td>
              {{ r.line.name }}
              <span v-if="!r.line.vehicleIds.length" class="tag tag-warn">🚫 bez pojazdów</span>
              <span v-if="r.rampUp" class="tag tag-info">🌱 rozruch</span>
              <span v-if="r.alerts.length" class="tag tag-warn">⚠️ {{ r.alerts.length }}</span>
            </td>
            <td><span class="tag tag-neutral">{{ modeEmoji(r.line.mode) }} {{ modeLabel(r.line.mode) }}</span></td>
            <td class="r num">{{ r.line.vehicleIds.length }}</td>
            <td class="r num" :class="r.line.operatingResult12m < 0 ? 'neg' : r.line.operatingResult12m > 0 ? 'pos' : 'muted'">{{ fmtSigned(r.line.operatingResult12m) }}</td>
            <td><div v-if="r.load !== null" class="loadcell"><div class="bar"><span :class="{ warn: r.load < 0.25 }" :style="{ width: fmtPct(r.load) }"></span></div><span class="num">{{ fmtPct(r.load) }}</span></div><span v-else class="muted">—</span></td>
          </tr>
        </tbody>
      </table>
    </section>
    <aside v-if="detail" class="card side" data-test="detail">
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
.sortbtn { all: unset; cursor: pointer; min-height: 44px; display: inline-flex; align-items: center; font: inherit; }
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
</style>
