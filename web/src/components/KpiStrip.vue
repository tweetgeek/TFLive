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
