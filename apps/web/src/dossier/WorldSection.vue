<script setup lang="ts">
/**
 * One collapsible section of the world panel. The heading is the toggle.
 * Tools (the records Add button) sit outside that button.
 */
import Icon from '../design/Icon.vue';

defineProps<{
    title: string;
    open: boolean;
    bodyId: string;
    summary: string;
}>();

defineEmits<{ toggle: [] }>();
</script>

<template>
  <section class="doss-fold">
    <div class="doss-fold-head">
      <h2 class="ui-heading ui-kicker">
        <button type="button" class="doss-fold-toggle" :aria-expanded="open ? 'true' : 'false'" :aria-controls="bodyId" @click="$emit('toggle')">
          <Icon name="chevron-right" :size="11" class="doss-fold-chevron" :class="{ 'is-open': open }" />
          <span>{{ title }}</span>
        </button>
      </h2>
      <span v-if="!open" class="doss-fold-sum">{{ summary }}</span>
      <slot name="tools" />
    </div>
    <div v-if="open" :id="bodyId" class="doss-fold-body">
      <slot />
    </div>
  </section>
</template>

<style>
.doss-fold {
  margin: 0;
  border-top: 1px solid var(--line-1);
}

.doss-fold-head {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  min-width: 0;
}

.doss-fold-head .ui-heading {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
}

.doss-fold-toggle {
  display: flex;
  align-items: center;
  gap: var(--sp-2);
  width: 100%;
  margin: 0;
  padding: var(--sp-3) 0;
  border: 0;
  background: none;
  color: inherit;
  font: inherit;
  letter-spacing: inherit;
  text-align: left;
  text-transform: inherit;
  cursor: pointer;
}

.doss-fold-chevron {
  flex: 0 0 auto;
  transition: transform var(--t-chevron) var(--ease-out);
}

.doss-fold-chevron.is-open {
  transform: rotate(90deg);
}

.doss-fold-sum {
  flex: 0 0 auto;
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
  letter-spacing: 0;
  text-transform: none;
}

.doss-fold-body {
  padding-bottom: var(--sp-3);
}

@media (prefers-reduced-motion: reduce) {
  .doss-fold-chevron {
    transition: none;
  }
}
</style>
