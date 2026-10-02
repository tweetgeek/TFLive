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
          <div><div class="title">{{ alertEmoji(a.type) }} {{ a.title }}</div><div class="muted detail">{{ a.detail }}</div></div>
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
