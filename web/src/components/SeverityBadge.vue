<script setup lang="ts">
import type { Severity } from '@tflive/shared';
defineProps<{ severity: Severity }>();
const LABEL: Record<Severity, string> = { critical: 'krytyczny', warn: 'uwaga', info: 'info' };
</script>

<template>
  <span class="sev" :class="severity">{{ LABEL[severity] }}</span>
</template>

<style scoped>
.sev { display: inline-flex; align-items: center; justify-content: center; min-width: 76px; height: 24px; border-radius: 6px; font-size: 12px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; flex-shrink: 0; }
.critical { background: var(--neg-fill); color: #1a0d08; }
.warn { background: var(--accent); color: var(--accent-ink); }
.info { background: var(--info-fill); color: #e6f1ff; }
</style>
