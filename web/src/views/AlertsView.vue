<script setup lang="ts">
import type { Alert, AlertCategory } from '@tflive/shared';
import { computed, ref } from 'vue';
import SeverityBadge from '../components/SeverityBadge.vue';
import { gameDateAt } from '../lib/derive';
import { alertEmoji, CATEGORY } from '../lib/emoji';
import { fmtGameDate } from '../lib/format';
import { useStore } from '../state/store';

const store = useStore();
const { state } = store;
const filter = ref<AlertCategory | 'all'>('all');
const showMuted = ref(false);
const busy = ref<string | null>(null);

const cats = Object.keys(CATEGORY) as AlertCategory[];
const activeCount = (c: AlertCategory | 'all') => state.alerts.filter((a) => !a.muted && (c === 'all' || a.category === c)).length;
const list = computed(() => state.alerts.filter((a) => (showMuted.value || !a.muted) && (filter.value === 'all' || a.category === filter.value)));
const dateOf = (t: number | null) => (t !== null && state.snapshot.meta ? fmtGameDate(gameDateAt(t, state.snapshot.meta)) : '—');
const mutedText = (a: Alert) => (a.muted?.kind === 'snooze' ? `odłożony do ${dateOf(a.muted.untilGameTime)}` : 'ignorowany');

async function act(a: Alert, fn: () => Promise<void>) {
  busy.value = a.id;
  try {
    await fn();
  } finally {
    busy.value = null;
  }
}
</script>

<template>
  <div class="toolbar">
    <button class="chip" type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">Wszystkie · {{ activeCount('all') }}</button>
    <button v-for="c in cats" :key="c" class="chip" type="button" :aria-pressed="filter === c" @click="filter = c">{{ CATEGORY[c].emoji }} {{ CATEGORY[c].label }} · {{ activeCount(c) }}</button>
    <label class="muted-toggle"><input v-model="showMuted" type="checkbox">🔕 Pokaż wyciszone</label>
  </div>
  <div v-if="state.actionError" role="alert" class="action-error">⚠️ {{ state.actionError }}</div>
  <section class="table-wrap list">
    <div v-if="!list.length" class="empty">✅ Brak alertów w tej kategorii.</div>
    <div v-for="a in list" :key="a.id" class="row" :class="{ muted: !!a.muted }" data-test="alert">
      <SeverityBadge :severity="a.severity" />
      <div class="body">
        <div class="title">{{ alertEmoji(a.type) }} {{ a.title }}</div>
        <div class="sub"><span class="num">{{ a.detail }}</span> · od {{ dateOf(a.firstSeenGameTime) }}<template v-if="a.muted"> · {{ mutedText(a) }}</template></div>
      </div>
      <template v-if="!a.muted">
        <button class="btn" type="button" :disabled="busy === a.id" @click="act(a, () => store.mute(a, 'snooze'))">⏰ Odłóż 3 mies.</button>
        <button class="btn" type="button" :disabled="busy === a.id" @click="act(a, () => store.mute(a, 'ignore'))">🔕 Ignoruj</button>
      </template>
      <button v-else class="btn" type="button" :disabled="busy === a.id" @click="act(a, () => store.unmute(a))">🔔 Przywróć</button>
    </div>
  </section>
</template>

<style scoped>
.action-error { padding: 12px 16px; border-radius: 8px; background: #3a1a14; color: #ffd0c4; font-weight: 600; }
.muted-toggle { margin-left: auto; display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 15px; color: #b7c3cc; }
.muted-toggle input { width: 20px; height: 20px; accent-color: var(--accent); }
.row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.row:first-child { border-top: none; }
.row.muted { opacity: .6; }
.body { flex: 1; min-width: 240px; }
.title { font-size: 18px; font-weight: 600; }
.sub { font-size: 14px; color: var(--muted); margin-top: 2px; }
</style>
