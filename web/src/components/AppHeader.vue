<script setup lang="ts">
import { computed } from 'vue';
import { fmtGameDate, fmtMBh } from '../lib/format';
import { route, VIEWS } from '../state/route';
import { useStore } from '../state/store';

const { state } = useStore();
const activeAlerts = computed(() => state.alerts.filter((a) => !a.muted).length);
const speed = computed(() => {
  const m = state.snapshot.meta;
  if (!m) return '—';
  return m.paused || state.status.paused ? '⏸️ Pauza' : `⏩ ×${m.speed ?? 1}`;
});
const live = computed(() => state.conn === 'open' && state.status.live);
</script>

<template>
  <header class="hdr">
    <div class="brand"><span class="logo">TF</span>TFLive</div>
    <nav class="tabs" aria-label="Widoki">
      <a
        v-for="v in VIEWS"
        :key="v.id"
        class="tab"
        :href="`#/${v.id}`"
        :aria-current="route.view === v.id ? 'page' : undefined"
      >
        <span aria-hidden="true">{{ v.emoji }}</span>
        <span class="tab-label">{{ v.label }}</span>
        <span v-if="v.id === 'alerty' && activeAlerts > 0" class="count num">{{ activeAlerts }}</span>
      </a>
    </nav>
    <div class="status">
      <span class="pill"><span class="dot" :class="{ on: live }"></span>{{ live ? 'na żywo' : 'offline' }}</span>
      <span class="pill num">📅 {{ fmtGameDate(state.snapshot.meta?.date) }}</span>
      <span class="pill">{{ speed }}</span>
      <span class="muted mb">💾 <span class="num">{{ fmtMBh(state.status.diskMBPerHour) }}</span></span>
    </div>
  </header>
</template>

<style scoped>
.hdr { display: flex; align-items: center; gap: 24px; padding: 0 24px; min-height: 64px; border-bottom: 1px solid #222c35; background: var(--header); }
.brand { display: flex; align-items: center; gap: 10px; font-weight: 700; font-size: 20px; }
.logo { display: flex; align-items: center; justify-content: center; width: 32px; height: 32px; border-radius: 6px; background: var(--accent); color: #141008; font-size: 15px; }
.tabs { display: flex; gap: 4px; align-self: stretch; }
.tab { display: flex; align-items: center; gap: 6px; min-height: 44px; padding: 0 14px; color: #b7c3cc; text-decoration: none; font-weight: 600; font-size: 16px; border-bottom: 3px solid transparent; }
.tab:hover { color: #fff; }
.tab[aria-current='page'] { color: #fff; border-bottom-color: var(--accent); }
.count { padding: 1px 7px; border-radius: 999px; background: var(--accent); color: var(--accent-ink); font-size: 13px; }
.status { margin-left: auto; display: flex; align-items: center; gap: 10px; }
.dot { width: 9px; height: 9px; border-radius: 50%; background: #6b7a86; }
.dot.on { background: var(--pos-fill); }
.mb { font-size: 14px; }
@media (max-width: 759px) {
  .hdr { gap: 10px; padding: 8px 12px; flex-wrap: wrap; }
  .brand { font-size: 17px; }
  .status { gap: 6px; }
  .mb { display: none; }
  .tabs { position: fixed; left: 0; right: 0; bottom: 0; z-index: 10; justify-content: space-around; background: var(--header); border-top: 1px solid #222c35; padding-bottom: env(safe-area-inset-bottom); }
  .tab { position: relative; flex-direction: column; gap: 2px; padding: 6px 4px; font-size: 12px; border-bottom: none; border-top: 3px solid transparent; flex: 1; justify-content: center; min-height: 56px; }
  .tab[aria-current='page'] { border-top-color: var(--accent); }
  .count { position: absolute; transform: translate(14px, -16px); font-size: 11px; }
}
</style>
