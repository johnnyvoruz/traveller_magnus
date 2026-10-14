<script setup lang="ts">
/**
 * The Campaign trail, in the panel's breadcrumb slot, using the dossier crumb.
 * The middle part truncates first. The page's name does not.
 */
import type { CrumbGo, CrumbPart } from './crumb.ts';

defineProps<{ parts: readonly CrumbPart[] }>();
const emit = defineEmits<{ go: [go: CrumbGo] }>();

function trail(parts: readonly CrumbPart[]): string {
    return parts.map((part) => part.label).join(' / ');
}
</script>

<template>
  <span class="camp-crumb" role="navigation" aria-label="Breadcrumb" :title="trail(parts)">
    <template v-for="(part, index) in parts" :key="part.label + index">
      <span v-if="index" class="doss-crumb-sep" aria-hidden="true">/</span>
      <button
        v-if="part.go"
        type="button"
        class="doss-crumb"
        :class="index === 1 ? 'camp-crumb-mid' : 'camp-crumb-root'"
        :title="part.label"
        @click="emit('go', part.go)"
      >{{ part.label }}</button>
      <span v-else class="camp-crumb-here">{{ part.label }}</span>
    </template>
  </span>
</template>

<style>
.panel-eyebrow:has(.camp-crumb) {
  flex-wrap: nowrap;
  letter-spacing: 0;
  text-transform: none;
  font: 600 14px/1.2 var(--font-text);
}

.camp-crumb {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  max-width: 100%;
  min-height: 32px;
}

.camp-crumb .doss-crumb,
.camp-crumb-here {
  display: inline-flex;
  align-items: center;
  min-height: 32px;
  padding: 0;
}

/* Same quiet trail as the dossier crumb. A bare button would keep the browser's grey face. */
.camp-crumb .doss-crumb {
  border: 0;
  border-radius: 0;
  background: none;
  color: var(--signal);
  font: inherit;
  letter-spacing: inherit;
  text-transform: inherit;
  cursor: pointer;
}

.camp-crumb .doss-crumb:hover {
  text-decoration: underline;
  text-underline-offset: 3px;
}

.camp-crumb-root,
.camp-crumb-here {
  flex: 0 0 auto;
  white-space: nowrap;
}

.camp-crumb-mid {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.camp-crumb-here {
  color: var(--text-0);
}
</style>
