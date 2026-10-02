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
