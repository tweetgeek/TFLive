<script setup lang="ts">
defineProps<{ title: string; count?: number | null; href?: string }>();
</script>

<template>
  <section class="panel" :aria-label="title">
    <header class="ph">
      <h2>{{ title }}</h2>
      <span v-if="count != null" class="cnt num">{{ count }}</span>
      <a v-if="href" class="full" :href="href" :aria-label="`Pełny widok: ${title}`" title="Pełny widok">↗</a>
    </header>
    <div class="pb"><slot /></div>
  </section>
</template>

<style scoped>
.panel { display: flex; flex-direction: column; min-height: 0; min-width: 0; background: var(--surface); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
.ph { display: flex; align-items: center; gap: 8px; padding: 4px 10px; min-height: 34px; border-bottom: 1px solid var(--line); flex: 0 0 auto; }
h2 { margin: 0; font-size: 1.05em; font-weight: 700; white-space: nowrap; }
.cnt { font-size: .85em; padding: 1px 7px; border-radius: 999px; background: var(--surface-2); color: var(--soft); }
.full { margin-left: auto; min-width: 28px; min-height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 6px; text-decoration: none; font-weight: 700; }
.full:hover { background: var(--surface-2); }
.pb { container-type: inline-size; flex: 1; min-height: 0; overflow: auto; scroll-padding-top: 40px; padding: 6px 10px 8px; display: flex; flex-direction: column; }
</style>
