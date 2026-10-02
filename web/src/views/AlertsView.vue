<script setup lang="ts">
import type { Alert, AlertCategory, Severity } from '@tflive/shared';
import { computed, ref } from 'vue';
import SeverityBadge from '../components/SeverityBadge.vue';
import { gameDateAt } from '../lib/derive';
import { alertEmoji, CATEGORY } from '../lib/emoji';
import { fmtGameDate } from '../lib/format';
import { useStore } from '../state/store';

defineProps<{ dense?: boolean }>();

const store = useStore();
const { state } = store;
const filter = ref<AlertCategory | 'all'>('all');
const severity = ref<Severity | 'all'>('all');
const SEVERITIES: Severity[] = ['critical', 'warn', 'info'];
const SEV_LABEL: Record<Severity, string> = { critical: 'krytyczny', warn: 'uwaga', info: 'info' };
const showMuted = ref(false);
const busy = ref<string | null>(null);

const cats = Object.keys(CATEGORY) as AlertCategory[];
const activeCount = (c: AlertCategory | 'all') => state.alerts.filter((a) => !a.muted && (c === 'all' || a.category === c)).length;
const list = computed(() => state.alerts.filter((a) => (showMuted.value || !a.muted) && (filter.value === 'all' || a.category === filter.value) && (severity.value === 'all' || a.severity === severity.value)));
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
  <div class="view" :class="{ dense }">
  <div class="toolbar">
    <button class="chip" type="button" :aria-pressed="filter === 'all'" @click="filter = 'all'">Wszystkie · {{ activeCount('all') }}</button>
    <button v-for="c in cats" :key="c" class="chip" type="button" :aria-pressed="filter === c" @click="filter = c">{{ CATEGORY[c].emoji }} {{ CATEGORY[c].label }} · {{ activeCount(c) }}</button>
    <template v-if="!dense">
    <span class="sep" aria-hidden="true"></span>
    <button class="chip" type="button" :aria-pressed="severity === 'all'" @click="severity = 'all'">Każda ważność</button>
    <button v-for="s in SEVERITIES" :key="s" class="chip" type="button" :aria-pressed="severity === s" @click="severity = s">{{ SEV_LABEL[s] }}</button>
    <label class="muted-toggle"><input v-model="showMuted" type="checkbox">🔕 Pokaż wyciszone</label>
    </template>
  </div>
  <div v-if="state.actionError" role="alert" class="action-error">⚠️ {{ state.actionError }}</div>
  <section class="table-wrap list">
    <div v-if="!list.length" class="empty">✅ Brak alertów w tej kategorii.</div>
    <div v-for="a in list" :key="a.id" class="row" :class="{ muted: !!a.muted }" data-test="alert">
      <SeverityBadge :severity="a.severity" />
      <div class="body">
        <div class="title"><span v-if="a.muted" class="tag tag-neutral">🔕 wyciszony</span> {{ alertEmoji(a.type) }} {{ a.title }}</div>
        <div class="sub"><span class="num">{{ a.detail }}</span> · od {{ dateOf(a.firstSeenGameTime) }}<template v-if="a.muted"> · {{ mutedText(a) }}</template></div>
      </div>
      <template v-if="!a.muted">
        <button class="btn" type="button" aria-label="Odłóż 3 mies." title="Odłóż 3 mies." :disabled="busy === a.id" @click="act(a, () => store.mute(a, 'snooze'))">⏰<template v-if="!dense"> Odłóż 3 mies.</template></button>
        <button class="btn" type="button" aria-label="Ignoruj" title="Ignoruj" :disabled="busy === a.id" @click="act(a, () => store.mute(a, 'ignore'))">🔕<template v-if="!dense"> Ignoruj</template></button>
      </template>
      <button v-else class="btn" type="button" aria-label="Przywróć" title="Przywróć" :disabled="busy === a.id" @click="act(a, () => store.unmute(a))">🔔<template v-if="!dense"> Przywróć</template></button>
    </div>
  </section>
  </div>
</template>

<style scoped>
.action-error { padding: 12px 16px; border-radius: 8px; background: #3a1a14; color: #ffd0c4; font-weight: 600; }
.muted-toggle { margin-left: auto; display: flex; align-items: center; gap: 10px; min-height: 44px; font-size: 15px; color: #b7c3cc; }
.muted-toggle input { width: 20px; height: 20px; accent-color: var(--accent); }
.row { display: flex; align-items: center; gap: 14px; padding: 14px 18px; border-top: 1px solid var(--line); flex-wrap: wrap; }
.row:first-child { border-top: none; }
.row.muted { background: #12181d; }
.body { flex: 1; min-width: 240px; }
.title { font-size: 18px; font-weight: 600; }
.sub { font-size: 14px; color: var(--muted); margin-top: 2px; }
.view { display: flex; flex-direction: column; gap: 18px; }
.view.dense { gap: 6px; }
.dense .row { padding: 5px 2px; gap: 8px; flex-wrap: nowrap; align-items: flex-start; }
.dense .body { min-width: 0; }
.dense .title { font-size: 1em; overflow-wrap: anywhere; }
.dense .sub { font-size: .86em; overflow-wrap: anywhere; }
.dense .list { background: transparent; border: none; overflow: visible; }
.dense .action-error { padding: 6px 10px; }
.dense .sev { min-width: 58px; height: 22px; font-size: 11px; }
</style>
