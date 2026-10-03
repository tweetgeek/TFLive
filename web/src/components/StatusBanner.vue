<script setup lang="ts">
import { computed } from 'vue';
import { useStore } from '../state/store';

const { state } = useStore();
const message = computed(() => {
  if (state.conn !== 'open') return { tone: 'neg', text: '🔌 Brak połączenia z serwerem TFLive — łączę ponownie…' };
  if (!state.received) return { tone: 'info', text: '⏳ Łączę z serwerem…' };
  if (state.status.logState === 'missing') return { tone: 'neg', text: '📄 Nie znaleziono logu gry. Uruchom grę z modem tflive albo ustaw „logPath" w config/config.json.' };
  const err = state.status.lastError;
  if (err) return { tone: 'warn', text: `⚠️ ${err}${err.includes('unsupported-version') ? ' — zaktualizuj mod lub serwer.' : ''}` };
  if (!state.status.live && state.status.paused) return { tone: 'info', text: '⏸️ Pauza w grze — dane z chwili zatrzymania.' };
  if (!state.status.live) return { tone: 'warn', text: '⏳ Brak nowych danych z gry — gra w menu, zamknięta albo mod wyłączony. Pokazuję ostatni znany stan.' };
  const modErrors = state.snapshot.meta?.errors ?? [];
  if (modErrors.length) return { tone: 'warn', text: `⚠️ Mod zgłosił błędy: ${modErrors[0]}${modErrors.length > 1 ? ` (+${modErrors.length - 1})` : ''}` };
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
@media (min-width: 1400px) and (min-height: 720px) { .banner { padding: 5px 16px; font-size: 14px; } }
</style>
