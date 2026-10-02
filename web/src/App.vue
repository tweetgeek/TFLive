<script setup lang="ts">
import { computed } from 'vue';
import AppHeader from './components/AppHeader.vue';
import StatusBanner from './components/StatusBanner.vue';
import { route } from './state/route';
import AlertsView from './views/AlertsView.vue';
import IndustryView from './views/IndustryView.vue';
import LinesView from './views/LinesView.vue';
import OverviewView from './views/OverviewView.vue';
import TownsView from './views/TownsView.vue';
import VehiclesView from './views/VehiclesView.vue';

const VIEW_COMPONENTS = { przeglad: OverviewView, alerty: AlertsView, linie: LinesView, pojazdy: VehiclesView, przemysl: IndustryView, miasta: TownsView };
const current = computed(() => VIEW_COMPONENTS[route.view]);
</script>

<template>
  <div class="app">
    <AppHeader />
    <StatusBanner />
    <main class="content"><component :is="current" /></main>
  </div>
</template>

<style scoped>
.app { min-height: 100vh; display: flex; flex-direction: column; }
.content { flex-grow: 1; padding: 24px; display: flex; flex-direction: column; gap: 18px; max-width: 1600px; width: 100%; margin: 0 auto; }
@media (max-width: 759px) { .content { padding: 12px 12px 84px; } }
</style>
