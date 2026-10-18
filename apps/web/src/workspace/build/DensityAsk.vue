<script setup lang="ts">
/**
 * How many of the empty hexes to fill, asked every time more than one hex is generated
 * (prompts/d_menu_selection.md part 0). In the pane, in place of the Generate card, not a modal.
 * Four radio rows, so every choice can be read at once; the last choice in this universe is
 * preselected and still has to be confirmed. Enter generates, Escape cancels, focus starts on the
 * selected choice and goes back to the control that opened the prompt.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { allowanceFor } from './acts.ts';
import { cancelDensity, confirmDensity } from './density_ask.ts';
import type { Density } from './seam.ts';
import { build, DENSITIES, DENSITY_HINT } from './state.ts';

const props = defineProps<{
    /** The heading: what is selected, as the pane counts it ("80 empty hexes in Subsector C"). */
    heading: string;
}>();

const chosen = ref<Density>(build.density);
const root = ref<HTMLElement | null>(null);
const name = 'build-density-ask';
const words = computed(() => props.heading);
/** The daily allowance for these hexes at the chosen density: quiet while there is plenty (allowance_words.ts). */
const say = computed(() => (build.asking ? allowanceFor(build.asking, chosen.value) : null));
const held = computed(() => !!say.value && say.value.blocked);

function go(): void {
    if (!held.value) confirmDensity(chosen.value);
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    cancelDensity();
}

onMounted(() => {
    void nextTick(() => {
        const on = root.value ? root.value.querySelector<HTMLInputElement>('input[type="radio"]:checked') : null;
        if (on) on.focus();
    });
});
</script>

<template>
  <form ref="root" class="build-ask" data-density-ask aria-labelledby="build-ask-title" @submit.prevent="go" @keydown="onKey">
    <h3 id="build-ask-title" class="build-ask-title">{{ words }}</h3>
    <fieldset class="build-opts">
      <legend class="ui-heading ui-kicker">Hexes to fill</legend>
      <label v-for="item in DENSITIES" :key="item.id" class="build-opt" :class="{ 'is-on': chosen === item.id }">
        <input v-model="chosen" type="radio" :name="name" :value="item.id" />
        <span><b>{{ item.name }}:</b> {{ item.meaning }}</span>
      </label>
    </fieldset>
    <p class="build-fine build-ask-hint">{{ DENSITY_HINT }}</p>
    <p v-if="say" class="build-allowance" :class="{ 'is-held': say.blocked }" role="status" data-build-allowance>{{ say.text }}</p>
    <div class="build-ask-acts">
      <button type="submit" class="ui-btn is-primary" data-density-go :disabled="held"><Icon name="wand-magic-sparkles" :size="13" />Generate</button>
      <button type="button" class="ui-btn" @click="cancelDensity()">Cancel</button>
    </div>
  </form>
</template>

<style>
.build-ask {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin: 0;
  padding: 12px 14px 14px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.build-ask-title {
  margin: 0;
  color: var(--text-0);
  font: 600 14.5px/1.35 var(--font-text);
}

.build-ask .build-opt b {
  font-weight: 600;
}

.build-ask-hint {
  margin: 0;
}

.build-ask-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
