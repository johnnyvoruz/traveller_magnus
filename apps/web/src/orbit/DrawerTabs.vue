<script setup lang="ts">
/**
 * The three drawer tabs in the orbit header (follow-up 6; findings/orbit_drawers_design.md
 * §1): Time, View, Layers, each with its key shown, lit with an underline while its drawer
 * is open. Narrow, the tabs are their icons alone. Each names its command.
 */
import { ref } from 'vue';
import Icon from '../design/Icon.vue';
import { DRAWERS, keyWords, type DrawerId } from './commands.ts';
import type { DrawerState } from './drawers.ts';

defineProps<{
    open: DrawerState;
    /** Icons alone, the words in the title (a narrow stage). */
    narrow: boolean;
}>();
const emit = defineEmits<{ toggle: [id: DrawerId] }>();

const tabEls = ref<HTMLElement[]>([]);

defineExpose({
    /** Focus the tab of a drawer, after Esc closes it. */
    focusTab: (id: DrawerId) => {
        const at = DRAWERS.findIndex((item) => item.id === id);
        const el = tabEls.value[at];
        if (el) el.focus();
    },
});
</script>

<template>
  <div class="orbit-tabs" :class="{ 'is-narrow': narrow }" role="group" aria-label="Control drawers">
    <button
      v-for="item in DRAWERS"
      :key="item.id"
      ref="tabEls"
      type="button"
      class="orbit-tab"
      :class="{ 'is-open': open === item.id }"
      :data-command="item.command"
      :aria-expanded="open === item.id ? 'true' : 'false'"
      :aria-controls="'orbit-drawer-' + item.id"
      :title="item.label + ' (' + keyWords(item.key) + ')'"
      :aria-label="narrow ? item.label : undefined"
      @click="emit('toggle', item.id)"
    >
      <Icon :name="item.icon" :size="13" />
      <span v-if="!narrow" class="orbit-tab-word">{{ item.label }}</span>
      <kbd v-if="!narrow" aria-hidden="true">{{ keyWords(item.key) }}</kbd>
    </button>
  </div>
</template>

<style>
.orbit-tabs {
  display: flex;
  align-items: center;
  gap: 4px;
}

.orbit-tab {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  height: 32px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid transparent;
  border-bottom-width: 2px;
  border-radius: var(--r-3);
  background: transparent;
  color: var(--text-muted);
  font: 600 12.5px/1 var(--font-text);
  cursor: pointer;
  transition: color var(--t-fast) var(--ease-out), border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.orbit-tab kbd {
  padding: 1px 5px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  color: var(--text-muted);
  font: 500 10.5px/1.2 var(--font-code);
}

.orbit-tab:hover {
  color: var(--text-1);
}

/* Open: lit, with the underline the drawer hangs from. */
.orbit-tab.is-open {
  border-color: var(--row-active-line);
  border-bottom-color: var(--signal);
  background: var(--row-active);
  color: var(--signal);
}

.orbit-tab.is-open kbd {
  border-color: var(--signal-dim);
  color: var(--signal);
}

.orbit-tab:focus-visible {
  outline-offset: 1px;
}

/* Icons alone: tighter. */
.orbit-tabs.is-narrow {
  gap: 2px;
}

.orbit-tabs.is-narrow .orbit-tab {
  width: 30px;
  padding: 0;
  justify-content: center;
}

@media (prefers-reduced-motion: reduce) {
  .orbit-tab {
    transition: none;
  }
}
</style>
