<script setup lang="ts">
/**
 * "Generate with…": the engine, how, and for many hexes what happens to the ones already
 * filled (findings/builder_system_design.md §2). In the pane, not a second screen. The
 * settings are the universe's and are only shown here.
 */
import { computed, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import type { GenerateChoice, Generator } from './seam.ts';
import { build, cleanChoice, ENGINES, GENERATOR_LABEL, plural, setChoice } from './state.ts';

const props = defineProps<{
    /** How many empty hexes Generate would fill, and how many hold a system. One hex: 1 and 0. */
    empty: number;
    filled: number;
    many: boolean;
    /** The universe's settings, as label and value; empty until the chart's manifest is in. */
    settings: { label: string; value: string }[];
}>();

const emit = defineEmits<{ go: []; cancel: [] }>();

const draft = ref<GenerateChoice>({ ...build.choice });
const filledToo = ref(build.filledToo);
const engine = computed(() => ENGINES.find((item) => item.id === draft.value.engine) ?? ENGINES[0]);
const count = computed(() => props.empty + (filledToo.value ? props.filled : 0));

function pickEngine(id: string): void {
    draft.value = cleanChoice({ engine: id, generator: draft.value.generator });
}

function pickGenerator(generator: Generator): void {
    draft.value = { engine: draft.value.engine, generator };
}

function go(): void {
    setChoice(draft.value);
    build.filledToo = props.many ? filledToo.value : false;
    emit('go');
}
</script>

<template>
  <form class="build-sheet" @submit.prevent="go" @keydown.esc.stop.prevent="$emit('cancel')">
    <fieldset class="build-opts">
      <legend class="ui-heading">Engine</legend>
      <label v-for="item in ENGINES" :key="item.id" class="build-opt" :class="{ 'is-on': draft.engine === item.id, 'is-off': !item.ready }">
        <input type="radio" name="build-engine" :value="item.id" :checked="draft.engine === item.id" :disabled="!item.ready" @change="pickEngine(item.id)" />
        <span>{{ item.label }}</span>
        <em v-if="!item.ready">not yet</em>
        <em v-else-if="item.generators.length === 1">{{ item.generators[0] === 'bottom-up' ? 'bottom up' : 'top down' }}</em>
      </label>
    </fieldset>
    <fieldset class="build-opts">
      <legend class="ui-heading">How</legend>
      <label v-for="generator in engine.generators" :key="generator" class="build-opt" :class="{ 'is-on': draft.generator === generator }">
        <input type="radio" name="build-generator" :value="generator" :checked="draft.generator === generator" @change="pickGenerator(generator)" />
        <span>{{ GENERATOR_LABEL[generator] }}</span>
      </label>
    </fieldset>
    <fieldset v-if="many && filled > 0" class="build-opts">
      <legend class="ui-heading">The {{ plural(filled, 'hex', 'hexes') }} that already {{ filled === 1 ? 'holds' : 'hold' }} a system</legend>
      <label class="build-opt" :class="{ 'is-on': !filledToo }">
        <input type="radio" name="build-filled" :checked="!filledToo" @change="filledToo = false" /><span>Leave {{ filled === 1 ? 'it' : 'them' }}</span>
      </label>
      <label class="build-opt" :class="{ 'is-on': filledToo }">
        <input type="radio" name="build-filled" :checked="filledToo" @change="filledToo = true" /><span>Regenerate {{ filled === 1 ? 'it' : 'them' }} too</span>
      </label>
    </fieldset>
    <section v-if="settings.length">
      <h3 class="ui-heading">Settings <span class="ui-count">this universe</span></h3>
      <dl class="build-set">
        <div v-for="row in settings" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
      </dl>
    </section>
    <div class="build-sheet-foot">
      <span class="build-fine">Remembered for next time.</span>
      <button type="button" class="ui-btn" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="ui-btn is-primary" :disabled="count === 0">
        <Icon name="wand-magic-sparkles" :size="13" />{{ many ? 'Generate ' + count : 'Preview' }}
      </button>
    </div>
  </form>
</template>

<style>
.build-sheet {
  display: flex;
  flex-direction: column;
}

.build-opts {
  display: flex;
  flex-direction: column;
  min-width: 0;
  margin: 0;
  padding: 0;
  border: 0;
}

.build-opts legend {
  padding: 0;
}

.build-opt {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  border: 1px solid var(--line-1);
  border-bottom-width: 0;
  background: var(--panel-raised);
  color: var(--text-1);
  font: 400 13.5px/1.4 var(--font-text);
  cursor: pointer;
}

.build-opt:first-of-type {
  border-radius: var(--r-3) var(--r-3) 0 0;
}

.build-opt:last-of-type {
  border-bottom-width: 1px;
  border-radius: 0 0 var(--r-3) var(--r-3);
}

.build-opt:first-of-type:last-of-type {
  border-radius: var(--r-3);
}

.build-opt input {
  flex: 0 0 auto;
  margin: 0;
  accent-color: var(--signal);
}

.build-opt.is-on {
  background: var(--row-active);
  box-shadow: inset 3px 0 0 var(--signal);
  color: var(--signal-active);
}

.build-opt.is-off {
  color: var(--text-muted);
  cursor: default;
}

.build-opt em {
  margin-left: auto;
  color: var(--text-muted);
  font-size: 12px;
  font-style: normal;
}

.build-opt:has(input:focus-visible) {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}

.build-set {
  margin: 0;
  border-top: 1px solid var(--line-1);
}

.build-set div {
  display: flex;
  align-items: baseline;
  gap: 10px;
  padding: 6px 0;
  border-bottom: 1px solid var(--line-soft);
}

.build-set dt {
  flex: 1 1 auto;
  color: var(--text-muted);
  font-size: 12.5px;
}

.build-set dd {
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.3 var(--font-code);
}

.build-sheet-foot {
  position: sticky;
  bottom: 0;
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  margin: 16px -16px -18px;
  padding: 10px 16px;
  border-top: 1px solid var(--line-1);
  background: var(--surface-1);
}

.build-fine {
  margin: 0 auto 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}
</style>
