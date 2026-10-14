<script setup lang="ts">
/**
 * The one line of help under the search field on a first visit (prompts/d_first_run_fixes.md
 * item 1). The map view decides when it shows (workspace/first_visit.ts) and remembers that
 * it was dismissed.
 */
import Icon from '../design/Icon.vue';
import { FIRST_HINT } from './first_visit.ts';

defineEmits<{ dismiss: [] }>();
</script>

<template>
  <div class="first-hint" role="note" data-first-hint>
    <p>{{ FIRST_HINT }}</p>
    <button type="button" class="first-hint-x" aria-label="Dismiss this tip" title="Dismiss" @click="$emit('dismiss')">
      <Icon name="xmark" :size="12" />
    </button>
  </div>
</template>

<style>
/* Under the search field, on the same glass, the width of the field at most. */
.first-hint {
  position: absolute;
  top: calc(var(--chrome-top) + var(--chrome-height) + 6px);
  left: calc(var(--rail-width) + var(--chrome-inset));
  z-index: 3;
  display: flex;
  align-items: center;
  gap: 8px;
  box-sizing: border-box;
  max-width: min(440px, calc(100% - var(--rail-width) - 2 * var(--chrome-inset)));
  padding: 6px 6px 6px 14px;
  border: 1px solid var(--control-line);
  border-left: 3px solid var(--signal);
  border-radius: var(--r-3);
  background: var(--chrome-glass);
  box-shadow: var(--shadow-chrome);
}

.first-hint p {
  margin: 0;
  color: var(--text-0);
  font: 400 13px/1.45 var(--font-text);
}

.first-hint-x {
  display: inline-flex;
  flex: none;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 0;
  border-radius: var(--r-2);
  background: none;
  color: var(--text-muted);
  cursor: pointer;
}

.first-hint-x:hover {
  color: var(--text-0);
}
</style>
