<script setup lang="ts">
import { computed } from 'vue';
import { bestVehicle } from '../lib/derive';
import { fmtInt, fmtMonthIndex, fmtSigned } from '../lib/format';
import { useStore } from '../state/store';

defineProps<{ compact?: boolean }>();
const { state } = useStore();
const fin = computed(() => state.snapshot.finance);
const best = computed(() => bestVehicle(state.snapshot.vehicles));
const months = computed(() => {
  const ms = [...(fin.value?.operatingResultByMonth ?? [])].sort((a, b) => a.month - b.month);
  const max = Math.max(1, ...ms.map((m) => Math.abs(m.value)));
  return ms.map((m) => ({ ...m, label: fmtMonthIndex(m.month), height: `${Math.max(4, (Math.abs(m.value) / max) * 100)}%`, positive: m.value >= 0 }));
});
</script>

<template>
  <div class="mchart" :class="{ compact }">
    <div class="bars">
      <div v-for="m in months" :key="m.month" class="col">
        <div class="num val" :class="m.positive ? 'pos' : 'neg'">{{ fmtSigned(m.value) }}</div>
        <div class="barv" :class="m.positive ? 'p' : 'n'" :style="{ height: m.height }"></div>
        <div class="muted lab">{{ m.label }}</div>
      </div>
    </div>
    <div class="facts">
      <div><span class="muted">🔧 Koszty bieżące · 12 mies.</span><span class="num">{{ fmtInt(fin?.runningCosts12m) }}</span></div>
      <div v-if="best"><span class="muted">🏆 Najlepszy pojazd</span><span>{{ best.name }} · <span class="num" :class="(best.operatingResult12m ?? 0) > 0 ? 'pos' : (best.operatingResult12m ?? 0) < 0 ? 'neg' : 'muted'">{{ fmtSigned(best.operatingResult12m) }}</span></span></div>
    </div>
  </div>
</template>

<style scoped>
.mchart { display: flex; flex-direction: column; gap: 14px; flex: 1; }
.bars { display: flex; gap: 18px; align-items: flex-end; height: 240px; border-bottom: 1px solid var(--line-2); padding: 0 6px; }
.col { flex: 1; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 6px; }
.val { font-size: 13px; }
.barv { width: 100%; border-radius: 4px 4px 0 0; }
.barv.p { background: var(--pos-fill); } .barv.n { background: var(--neg-fill); opacity: .85; }
.lab { font-size: 14px; }
.facts { margin-top: auto; display: flex; flex-direction: column; gap: 8px; font-size: 15px; }
.facts > div { display: flex; justify-content: space-between; gap: 12px; }
.compact { gap: 6px; flex: 0 0 auto; }
.compact .bars { height: 96px; gap: 10px; }
.compact .val { font-size: .75em; }
.compact .lab { font-size: .8em; }
.compact .facts { font-size: .9em; gap: 2px; margin-top: 0; }
</style>
