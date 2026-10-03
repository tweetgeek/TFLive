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
@media (min-width: 1400px) and (min-height: 720px) { .content { max-width: none; padding: 16px 20px; } .content-cc { padding: 8px; } }
@media (max-width: 759px) { .content { padding: 12px 12px 84px; } }
</style>
