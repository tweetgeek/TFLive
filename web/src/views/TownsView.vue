<script setup lang="ts">
import type { Town } from '@tflive/shared';
import { computed, ref } from 'vue';
import { alertsFor, isServed } from '../lib/derive';
import { cargoEmoji, DISTRICT } from '../lib/emoji';
import { fmtDecimal, fmtInt, fmtPct } from '../lib/format';
import { useStore } from '../state/store';

const { state } = useStore();
const sn = computed(() => state.snapshot);
const meta = computed(() => sn.value.meta);
const showAll = ref(false);
const served = (t: Town) => !!meta.value && isServed(t.lastServedTime, meta.value.gameTime, meta.value.dayMs);
const list = computed(() => sn.value.towns.filter((t) => showAll.value || served(t)));
const hidden = computed(() => sn.value.towns.length - sn.value.towns.filter(served).length);
const opportunities = (t: Town) => t.needs.filter((n) => !n.supplied).length;
const hasDrop = (t: Town) => alertsFor(state.alerts, 'town', t.id).some((a) => a.type === 'supply-drop' && !a.muted);
const plural = (n: number) => (n === 1 ? 'szansa' : n < 5 ? 'szanse' : 'szans');
</script>

<template>
  <section v-if="!meta" class="empty">⏳ Czekam na dane z gry…</section>
  <template v-else>
    <div class="toolbar">
      <button class="chip" type="button" :aria-pressed="!showAll" @click="showAll = false">✅ Obsługiwane</button>
      <button class="chip" type="button" :aria-pressed="showAll" @click="showAll = true">🏙️ Wszystkie · {{ sn.towns.length }}</button>
    </div>
    <div v-if="!list.length" class="empty">Brak miast dla tego filtra.</div>
    <section class="grid cards">
      <article v-for="t in list" :key="t.id" class="card town" data-test="town">
        <div class="top">
          <div><h2>🏙️ {{ t.name }}</h2><div class="muted sub">{{ served(t) ? '✅ obsługiwane' : 'nieobsługiwane' }} · 👥 ludność <span class="num txt">{{ fmtInt(t.population) }}</span></div></div>
          <div class="tags">
            <span v-if="hasDrop(t)" class="tag tag-warn">📉 spadek dostaw</span>
            <span v-if="opportunities(t)" class="tag tag-info">💡 {{ opportunities(t) }} {{ plural(opportunities(t)) }}</span>
          </div>
        </div>
        <div class="lbl">Potrzeby</div>
        <div v-if="!t.needs.length" class="muted">—</div>
        <div v-for="n in t.needs" :key="`${n.district}:${n.cargo}`">
          <div class="li">
            <span>{{ DISTRICT[n.district].emoji }} {{ DISTRICT[n.district].label }} · {{ cargoEmoji(n.cargo) }} {{ n.cargo }}</span>
            <span v-if="n.supplied" class="num">{{ fmtPct(n.supplied / n.demand) }}</span>
            <span v-else class="opp">szansa · <span class="num">0/{{ fmtInt(n.demand) }}</span></span>
          </div>
          <div v-if="n.supplied" class="bar"><span :class="{ warn: n.supplied / n.demand < 0.5 }" :style="{ width: fmtPct(Math.min(1, n.supplied / n.demand)) }"></span></div>
          <div v-else class="bar dashed"></div>
        </div>
        <div class="grid em">
          <div class="muted">🔊 Hałas <span class="num txt">{{ fmtDecimal(t.noise, 0) }} dB</span></div>
          <div class="muted">🏭 Zanieczyszczenie <span class="num txt">{{ fmtInt(t.pollution) }}</span></div>
        </div>
      </article>
    </section>
    <div v-if="!showAll && hidden > 0" class="muted hiddeninfo">Pozostałe {{ hidden }} miast nieobsługiwanych — ukryte. <button class="btn" type="button" data-test="show-all" @click="showAll = true">Pokaż wszystkie</button></div>
  </template>
</template>

<style scoped>
.cards { grid-template-columns: repeat(2, minmax(0, 1fr)); align-items: start; }
.town { display: flex; flex-direction: column; gap: 10px; }
.top { display: flex; justify-content: space-between; align-items: flex-start; gap: 10px; }
.tags { display: flex; gap: 6px; flex-wrap: wrap; justify-content: flex-end; }
h2 { margin: 0; font-size: 22px; }
.sub { font-size: 14px; }
.txt { color: var(--text); }
.li { display: flex; justify-content: space-between; gap: 10px; font-size: 15px; }
.opp { color: #cfe6ff; }
.bar { margin-top: 6px; height: 10px; border-radius: 5px; }
.bar.dashed { background: transparent; border: 1px dashed #3b5670; }
.em { grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; font-size: 15px; margin-top: 4px; }
.hiddeninfo { display: flex; align-items: center; gap: 12px; font-size: 14px; flex-wrap: wrap; }
</style>
