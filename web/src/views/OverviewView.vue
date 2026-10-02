<script setup lang="ts">
import { computed } from 'vue';
import SeverityBadge from '../components/SeverityBadge.vue';
import { alertEmoji } from '../lib/emoji';
import { bestVehicle, populationTotal, reserveMonths } from '../lib/derive';
import { fmtDecimal, fmtInt, fmtMonthIndex, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

const { state } = useStore();
const sn = computed(() => state.snapshot);
const fin = computed(() => sn.value.finance);
const active = computed(() => state.alerts.filter((a) => !a.muted));
const top = computed(() => active.value.slice(0, 5));
const reserve = computed(() => reserveMonths(fin.value));
const best = computed(() => bestVehicle(sn.value.vehicles));
const months = computed(() => {
  const ms = [...(fin.value?.operatingResultByMonth ?? [])].sort((a, b) => a.month - b.month);
  const max = Math.max(1, ...ms.map((m) => Math.abs(m.value)));
  return ms.map((m) => ({ ...m, label: fmtMonthIndex(m.month), height: `${Math.max(4, (Math.abs(m.value) / max) * 100)}%`, positive: m.value >= 0 }));
});
</script>

<template>
  <section v-if="!sn.meta" class="empty">⏳ Czekam na dane z gry…</section>
  <template v-else>
    <div class="muted company">🏢 {{ sn.meta.mapName ?? '—' }}</div>
    <section class="grid kpis">
      <div class="card"><div class="lbl">💰 Saldo</div><div class="num kpi">{{ fmtInt(fin?.balance) }}</div></div>
      <div class="card"><div class="lbl">🏦 Kredyt</div><div class="num kpi soft">{{ fmtInt(fin?.loan) }}</div></div>
      <div class="card"><div class="lbl">📈 Wynik operacyjny · 12 mies.</div><div class="num kpi" :class="(fin?.operatingResult12m ?? 0) >= 0 ? 'pos' : 'neg'">{{ fmtSigned(fin?.operatingResult12m) }}</div></div>
      <div class="card"><div class="lbl">🛟 Rezerwa</div><div class="num kpi">{{ fmtDecimal(reserve) }} <span class="unit">mies.</span></div></div>
      <div class="card"><div class="lbl">🚆 Pojazdy · 🛤️ Linie</div><div class="num kpi">{{ sn.vehicles.length }} · {{ sn.lines.length }}</div></div>
      <div class="card"><div class="lbl">👥 Ludność miast</div><div class="num kpi">{{ fmtInt(populationTotal(sn.towns)) }}</div></div>
    </section>
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
        <div class="bars">
          <div v-for="m in months" :key="m.month" class="col">
            <div class="num val" :class="m.positive ? 'pos' : 'neg'">{{ fmtSigned(m.value) }}</div>
            <div class="barv" :class="m.positive ? 'p' : 'n'" :style="{ height: m.height }"></div>
            <div class="muted lab">{{ m.label }}</div>
          </div>
        </div>
        <div class="facts">
          <div><span class="muted">🔧 Koszty bieżące · 12 mies.</span><span class="num">{{ fmtInt(fin?.runningCosts12m) }}</span></div>
          <div v-if="best"><span class="muted">🏆 Najlepszy pojazd</span><span>{{ best.name }} · <span class="num pos">{{ fmtSigned(best.operatingResult12m) }}</span></span></div>
        </div>
      </div>
    </section>
  </template>
</template>

<style scoped>
.company { font-size: 15px; }
.kpis { grid-template-columns: repeat(6, minmax(0, 1fr)); }
.kpi { font-size: 28px; margin-top: 8px; }
.kpi.soft { color: var(--soft); }
.unit { font-size: 16px; color: var(--muted); }
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
.bars { display: flex; gap: 18px; align-items: flex-end; height: 240px; border-bottom: 1px solid var(--line-2); padding: 0 6px; }
.col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
.val { font-size: 13px; }
.barv { width: 100%; border-radius: 4px 4px 0 0; }
.barv.p { background: var(--pos-fill); } .barv.n { background: var(--neg-fill); opacity: .85; }
.lab { font-size: 14px; }
.facts { margin-top: auto; display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
.facts > div { display: flex; justify-content: space-between; gap: 12px; }
@media (max-width: 759px) { .kpis { grid-template-columns: repeat(2, minmax(0, 1fr)) !important; } .kpi { font-size: 22px; } }
</style>
