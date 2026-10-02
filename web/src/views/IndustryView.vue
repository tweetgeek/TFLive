<script setup lang="ts">
import type { Industry } from '@tflive/shared';
import { computed, ref } from 'vue';
import { alertsFor, gameDateAt, isServed } from '../lib/derive';
import { alertEmoji, cargoEmoji, industryEmoji } from '../lib/emoji';
import { fmtGameDate, fmtInt, fmtPct } from '../lib/format';
import { useStore } from '../state/store';

const { state } = useStore();
const sn = computed(() => state.snapshot);
const filter = ref<'served' | 'all' | 'alerts'>('served');
const meta = computed(() => sn.value.meta);
const served = (i: Industry) => !!meta.value && isServed(i.lastServedTime, meta.value.gameTime, meta.value.dayMs);
const threatened = (i: Industry) => served(i) && i.closureTime !== null && i.closureTime > 0;
const alertsOf = (i: Industry) => alertsFor(state.alerts, 'industry', i.id).filter((a) => !a.muted);
const counts = computed(() => ({
  served: sn.value.industries.filter(served).length,
  all: sn.value.industries.length,
  alerts: sn.value.industries.filter((i) => alertsOf(i).length > 0).length,
}));
const list = computed(() =>
  sn.value.industries.filter((i) => (filter.value === 'all' ? true : filter.value === 'served' ? served(i) : alertsOf(i).length > 0)),
);
const threats = computed(() =>
  sn.value.industries
    .filter((i) => threatened(i) && meta.value)
    .map((i) => ({ i, days: Math.max(0, Math.floor(((i.closureTime ?? 0) - (meta.value?.gameTime ?? 0)) / (meta.value?.dayMs ?? 1))) })),
);
const date = (t: number | null) => (t !== null && meta.value ? fmtGameDate(gameDateAt(t, meta.value)) : null);
function tag(i: Industry) {
  if (threatened(i)) return { cls: 'tag-warn', text: '🚨 zamknięcie' };
  if (i.outputs.some((o) => o.capacity > 0 && o.stock / o.capacity >= 0.8)) return { cls: 'tag-warn', text: '📦 zalega' };
  return { cls: 'tag-ok', text: '✅ w normie' };
}
</script>

<template>
  <section v-if="!meta" class="empty">⏳ Czekam na dane z gry…</section>
  <template v-else>
    <div class="toolbar">
      <button class="chip" type="button" :aria-pressed="filter === 'served'" @click="filter = 'served'">✅ Obsługiwane · {{ counts.served }}</button>
      <button class="chip" type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">🏭 Wszystkie · {{ counts.all }}</button>
      <button class="chip" type="button" :aria-pressed="filter === 'alerts'" @click="filter = 'alerts'">⚠️ Z alertem · {{ counts.alerts }}</button>
    </div>
    <div v-for="t in threats" :key="t.i.id" class="threat"><span class="tag crit">🚨 GROŹBA ZAMKNIĘCIA</span> {{ industryEmoji(t.i.type) }} <b>{{ t.i.name }}</b> — do zamknięcia zostało <span class="num">{{ t.days }} dni</span></div>
    <div v-if="!list.length" class="empty">Brak fabryk dla tego filtra.</div>
    <section class="grid cards">
      <article v-for="i in list" :key="i.id" class="card ind" data-test="industry">
        <div class="top">
          <div><h2>{{ industryEmoji(i.type) }} {{ i.name }}</h2><div class="muted sub">{{ i.type }} · poziom <span class="num">{{ i.level }}/{{ i.maxLevel }}</span></div></div>
          <span class="tag" :class="tag(i).cls">{{ tag(i).text }}</span>
        </div>
        <template v-if="i.inputs.length">
          <div class="lbl">Wejścia</div>
          <div v-for="x in i.inputs" :key="x.cargo" class="li">
            <span>{{ cargoEmoji(x.cargo) }} {{ x.cargo }}</span>
            <span class="muted">magazyn <span class="num txt">{{ fmtInt(x.stock) }}</span> · {{ date(x.lastReceivedTime) ? `ostatnia dostawa: ${date(x.lastReceivedTime)}` : 'brak danych o dostawie' }}</span>
          </div>
        </template>
        <template v-if="i.outputs.length">
          <div class="lbl">Produkcja</div>
          <div v-for="o in i.outputs" :key="o.cargo">
            <div class="li"><span>{{ cargoEmoji(o.cargo) }} {{ o.cargo }}</span><span class="num">{{ fmtInt(o.stock) }}/{{ fmtInt(o.capacity) }} · {{ fmtPct(o.capacity > 0 ? o.stock / o.capacity : null) }}</span></div>
            <div class="bar"><span :class="{ warn: o.capacity > 0 && o.stock / o.capacity >= 0.8 }" :style="{ width: fmtPct(o.capacity > 0 ? Math.min(1, o.stock / o.capacity) : 0) }"></span></div>
          </div>
        </template>
        <div v-for="a in alertsOf(i)" :key="a.id" class="tag tag-warn alert">{{ alertEmoji(a.type) }} {{ a.detail }}</div>
        <div class="muted foot">Ostatnio obsłużona: <span class="num txt">{{ date(i.lastServedTime) ?? '—' }}</span></div>
      </article>
    </section>
  </template>
</template>

<style scoped>
.cards { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.ind { display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
h2 { margin: 0; font-size: 19px; }
.sub { font-size: 14px; }
.li { display: flex; justify-content: space-between; gap: 10px; font-size: 15px; }
.txt { color: var(--text); }
.bar { margin-top: 6px; height: 10px; border-radius: 5px; }
.foot { margin-top: auto; font-size: 14px; }
.alert { padding: 6px 10px; }
.threat { background: var(--surface); border: 1px solid var(--line); border-radius: 10px; padding: 14px 18px; display: flex; align-items: center; gap: 10px; font-size: 16px; flex-wrap: wrap; }
.crit { background: var(--neg-fill); color: #1a0d08; font-size: 13px; padding: 4px 10px; }
</style>
