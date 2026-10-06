<script setup lang="ts">
import { onMounted, ref, watch } from 'vue';
import type { PanelSpan } from '../shell/panel_state.ts';
import type { StatRow } from './model.ts';
import StatRows from './StatRows.vue';

const props = defineProps<{
    headline: string;
    rows: StatRow[] | null;
    empty: string | null;
    span: PanelSpan;
}>();

const box = ref<HTMLDetailsElement | null>(null);

function applySpan(): void {
    const el = box.value;
    if (!el) return;
    if (props.span === 'full') el.open = true;
    if (props.span === 'column') el.open = false;
}

onMounted(applySpan);
watch(() => props.span, applySpan);
</script>

<template>
  <div class="doss-socio-block">
    <details v-if="rows || empty" ref="box" class="doss-socio-acc">
      <summary>
        <span class="doss-socio-title">Socioeconomics</span>
        <span v-if="headline" class="doss-socio-line">{{ headline }}</span>
      </summary>
      <div class="doss-socio-detail">
        <StatRows v-if="rows" :rows="rows" />
        <p v-else-if="empty" class="doss-muted">{{ empty }}</p>
      </div>
    </details>
    <p v-else class="doss-socio-stay">
      <span class="doss-socio-title">Socioeconomics</span>
      <span v-if="headline" class="doss-socio-line">{{ headline }}</span>
    </p>
    <slot />
  </div>
</template>

<style>
/* Legacy .dossier-socio-acc: a raised card with a teal marker that turns when open. */
.doss-socio-acc {
  margin: 0 0 8px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.doss-socio-acc > summary {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 2px;
  padding: 8px 12px 8px 28px;
  border-radius: var(--r-3);
  list-style: none;
  cursor: pointer;
}

.doss-socio-acc > summary::-webkit-details-marker {
  display: none;
}

.doss-socio-acc > summary::before {
  content: '';
  position: absolute;
  left: 12px;
  top: 13px;
  width: 0;
  height: 0;
  border-style: solid;
  border-width: 5px 0 5px 7px;
  border-color: transparent transparent transparent var(--signal);
}

.doss-socio-acc[open] > summary::before {
  top: 16px;
  border-width: 7px 5px 0 5px;
  border-color: var(--signal) transparent transparent transparent;
}

.doss-socio-acc > summary:focus-visible {
  outline-offset: -2px;
}

.doss-socio-title {
  color: var(--text-muted);
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.5px;
  text-transform: uppercase;
}

.doss-socio-line {
  color: var(--text-1);
  font-size: 13px;
}

.doss-socio-detail {
  padding: 0 12px 8px;
}

.doss-socio-detail > .doss-stats {
  margin-bottom: 6px;
}

.doss-socio-detail > .doss-muted {
  margin: 0 0 6px;
}

/* The headline alone, once the profile rows live on the mainworld page. Same card, no control. */
.doss-socio-stay {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0 0 8px;
  padding: 8px 12px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}
</style>
