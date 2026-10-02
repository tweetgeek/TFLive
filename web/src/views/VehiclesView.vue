<script setup lang="ts">
import type { Vehicle } from '@tflive/shared';
import { computed, ref } from 'vue';
import { lifespanUsage, vehicleAgeYears, vehicleCondition } from '../lib/derive';
import { modeEmoji, modeLabel, VEHICLE_STATE } from '../lib/emoji';
import { fmtDecimal, fmtPct, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

defineProps<{ dense?: boolean }>();

const { state } = useStore();
const sn = computed(() => state.snapshot);
type Filter = 'all' | 'old' | 'nopath' | 'idle' | `mode:${string}`;
const filter = ref<Filter>('all');
const lineFilter = ref<string>('');

const now = computed(() => sn.value.meta?.gameTime ?? 0);
const isOld = (v: Vehicle) => (lifespanUsage(v, now.value) ?? 0) >= 1;
const isIdle = (v: Vehicle) => !v.userStopped && (v.lineId === null || v.daysInDepot > 30);
const modes = computed(() => [...new Set(sn.value.vehicles.map((v) => v.mode))].sort());
const lineName = (id: number | null) => (id === null ? '—' : sn.value.lines.find((l) => l.id === id)?.name ?? `#${id}`);

const list = computed(() =>
  sn.value.vehicles
    .filter((v) => {
      const f = filter.value;
      if (f === 'old' && !isOld(v)) return false;
      if (f === 'nopath' && !v.noPath) return false;
      if (f === 'idle' && !isIdle(v)) return false;
      if (f.startsWith('mode:') && v.mode !== f.slice(5)) return false;
      if (lineFilter.value && String(v.lineId) !== lineFilter.value) return false;
      return true;
    })
    .sort((a, b) => {
      const x = a.operatingResult12m;
      const y = b.operatingResult12m;
      if (x === null && y === null) return 0;
      if (x === null) return 1;
      if (y === null) return -1;
      return y - x;
    }),
);

function stateText(v: Vehicle): { dot: string; text: string } {
  if (v.noPath) return { dot: 'neg', text: '⛔ bez trasy' };
  if (v.userStopped) return { dot: 'idle', text: '✋ zatrzymany przez gracza' };
  const s = VEHICLE_STATE[v.state];
  const days = v.state === 'AT_TERMINAL' && v.daysAtTerminal > 0 ? ` · ${v.daysAtTerminal} dni` : v.state === 'IN_DEPOT' && v.daysInDepot > 0 ? ` · ${v.daysInDepot} dni` : '';
  return { dot: v.state === 'EN_ROUTE' ? 'pos' : v.state === 'AT_TERMINAL' ? 'warn' : 'idle', text: `${s.emoji} ${s.label}${days}` };
}
</script>

<template>
  <section v-if="!sn.meta" class="empty">⏳ Czekam na dane z gry…</section>
  <div v-else class="view" :class="{ dense }">
    <div class="toolbar">
      <button class="chip" type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">Wszystkie · {{ sn.vehicles.length }}</button>
      <button v-for="m in modes" :key="m" class="chip" type="button" :aria-pressed="filter === `mode:${m}`" @click="filter = `mode:${m}`">{{ modeEmoji(m) }} {{ modeLabel(m) }}</button>
      <button class="chip" type="button" :aria-pressed="filter === 'old'" @click="filter = 'old'">👴 Stare</button>
      <button class="chip" type="button" :aria-pressed="filter === 'nopath'" @click="filter = 'nopath'">⛔ Bez trasy</button>
      <button class="chip" type="button" :aria-pressed="filter === 'idle'" @click="filter = 'idle'">😴 Bezczynne</button>
      <label class="linesel">Linia
        <select v-model="lineFilter">
          <option value="">Wszystkie linie</option>
          <option v-for="l in sn.lines" :key="l.id" :value="String(l.id)">{{ l.name }}</option>
        </select>
      </label>
    </div>
    <section class="table-wrap">
      <div v-if="!list.length" class="empty">Brak pojazdów dla tego filtra.</div>
      <table v-else>
        <thead><tr><th>Pojazd</th><th>Linia</th><th>Stan ruchu</th><th class="r">Ładunek</th><th class="r">Wiek</th><th>Stan pojazdu</th><th class="r">Wynik · 12 mies. ▾</th></tr></thead>
        <tbody>
          <tr v-for="v in list" :key="v.id">
            <td>
              {{ modeEmoji(v.mode) }} {{ v.name }} <span v-if="v.parts[0] && !dense" class="muted model">· {{ v.parts[0].model }}</span>
              <span v-if="isOld(v)" class="tag tag-warn">👴 stary</span>
              <span v-if="v.userStopped" class="tag tag-neutral">✋ zatrzymany</span>
            </td>
            <td class="soft">{{ lineName(v.lineId) }}</td>
            <td><span class="st"><span class="dot" :class="stateText(v).dot"></span>{{ stateText(v).text }}</span></td>
            <td class="r num">{{ v.load }}/{{ v.capacity }}</td>
            <td class="r num">{{ fmtDecimal(vehicleAgeYears(v, now, sn.meta.dayMs)) }}</td>
            <td>
              <div v-if="vehicleCondition(v) !== null" class="cond"><div class="bar"><span :class="{ warn: (vehicleCondition(v) ?? 1) < 0.5 }" :style="{ width: fmtPct(vehicleCondition(v)) }"></span></div><span class="num">{{ fmtPct(vehicleCondition(v)) }}</span></div>
              <span v-else class="muted">—</span>
            </td>
            <td class="r num" :class="(v.operatingResult12m ?? 0) < 0 ? 'neg' : (v.operatingResult12m ?? 0) > 0 ? 'pos' : 'muted'">{{ fmtSigned(v.operatingResult12m) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </div>
</template>

<style scoped>
.linesel { margin-left: auto; display: flex; align-items: center; gap: 10px; font-size: 15px; color: #b7c3cc; }
.linesel select { min-height: var(--ctl-h); padding: 0 12px; border-radius: 8px; border: 1px solid var(--line-2); background: var(--surface); color: var(--text); font: 500 15px 'Barlow Semi Condensed', sans-serif; max-width: 320px; }
.model { font-size: 14px; }
.soft { color: var(--soft); }
.st { display: inline-flex; align-items: center; gap: 6px; font-size: 14px; white-space: nowrap; }
.dot { width: 8px; height: 8px; border-radius: 50%; background: #9fb0bc; }
.dot.pos { background: var(--pos-fill); } .dot.warn { background: var(--accent); } .dot.neg { background: var(--neg-fill); }
.cond { display: flex; align-items: center; gap: 8px; }
.cond .bar { width: 90px; }
.view { display: flex; flex-direction: column; gap: 18px; }
.view.dense { gap: 6px; }
.dense .linesel select { font-size: .9em; max-width: 200px; padding: 0 6px; }
.dense .cond .bar { width: 50px; }
.dense .st { font-size: .9em; }
</style>
