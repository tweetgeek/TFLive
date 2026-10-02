<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../state/store';

const { state } = useStore();
const message = computed(() => {
  if (state.conn !== 'open') return { tone: 'neg', text: '🔌 Brak połączenia z serwerem TFLive — łączę ponownie…' };
  if (state.status.logState === 'missing') return { tone: 'neg', text: '📄 Nie znaleziono logu gry. Uruchom grę z modem tflive albo ustaw „logPath" w config/config.json.' };
  if (!state.status.live && state.status.paused) return { tone: 'info', text: '⏸️ Pauza w grze — dane z chwili zatrzymania.' };
  if (!state.status.live) return { tone: 'warn', text: '⏳ Brak nowych danych z gry — gra w menu, zamknięta albo mod wyłączony. Pokazuję ostatni znany stan.' };
  if (state.status.lastError) return { tone: 'warn', text: `⚠️ ${state.status.lastError}` };
  return null;
});
</script>

<template>
  <div v-if="message" role="status" class="banner" :class="message.tone">{{ message.text }}</div>
</template>

<style scoped>
.banner { padding: 12px 24px; font-size: 16px; font-weight: 600; border-bottom: 1px solid var(--line); }
.neg { background: #3a1a14; color: #ffd0c4; }
.warn { background: #3a2f12; color: #ffe0a3; }
.info { background: #172b3d; color: #cfe6ff; }
</style>
