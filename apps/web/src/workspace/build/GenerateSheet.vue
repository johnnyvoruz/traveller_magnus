<script setup lang="ts">
/**
 * "Generate with…": the engine, how, and for many hexes what happens to the ones already
 * filled (findings/builder_system_design.md §2). In the pane, not a second screen. The
 * settings are the universe's and are only shown here.
 */
import { computed, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { buildStore, type Density, type GenerateChoice, type Generator } from './seam.ts';
import { build, cleanChoice, DENSITIES, DENSITY_HINT, ENGINES, GENERATOR_LABEL, plural, setChoice, setDensity } from './state.ts';
import { allowanceNow, allowanceSay, writesOf } from './allowance_words.ts';

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
const density = ref<Density>(build.density);
const engine = computed(() => ENGINES.find((item) => item.id === draft.value.engine) ?? ENGINES[0]);
const count = computed(() => props.empty + (filledToo.value ? props.filled : 0));
/** The daily allowance for what this sheet would run (allowance_words.ts). One hex is a preview: one system. */
const say = computed(() => {
    const writes = props.many ? writesOf(props.empty, filledToo.value ? props.filled : 0, density.value) : { least: 1, most: 1 };
    return allowanceSay(allowanceNow(), writes.least, writes.most);
});
const held = computed(() => !!say.value && say.value.blocked);

function pickEngine(id: string): void {
    draft.value = cleanChoice({ engine: id, generator: draft.value.generator });
}

function pickGenerator(generator: Generator): void {
    draft.value = { engine: draft.value.engine, generator };
}

function go(): void {
    if (held.value) return;
    setChoice(draft.value);
    build.filledToo = props.many ? filledToo.value : false;
    if (props.many) {
        const store = buildStore();
        const universe = store ? store.universe() : null;
        setDensity(universe ? universe.id : null, density.value);
    }
    emit('go');
}

/** The submit's words: a count that is only known when every hex is filled. */
const goWords = computed(() => {
    if (!props.many) return 'Preview';
    return density.value === 'every' ? 'Generate ' + count.value : 'Generate up to ' + count.value;
});
</script>

<template>
  <form class="build-sheet" @submit.prevent="go" @keydown.esc.stop.prevent="$emit('cancel')">
    <fieldset class="build-opts">
      <legend class="ui-heading">Engine</legend>
      <label v-for="item in ENGINES" :key="item.id" class="build-opt" :class="{ 'is-on': draft.engine === item.id, 'is-off': !item.ready }">
        <input type="radio" name="build-engine" :value="item.id" :checked="draft.engine === item.id" :disabled="!item.ready" @change="pickEngine(item.id)" />
        <span>{{ item.label }}</span>
        <em v-if="!item.ready">not available yet</em>
        <em v-else-if="item.generators.length === 1">{{ item.generators[0] === 'bottom-up' ? 'bottom up' : 'top down' }}</em>
      </label>
    </fieldset>
    <fieldset class="build-opts">
      <legend class="ui-heading">Method</legend>
      <label v-for="generator in engine.generators" :key="generator" class="build-opt" :class="{ 'is-on': draft.generator === generator }">
        <input type="radio" name="build-generator" :value="generator" :checked="draft.generator === generator" @change="pickGenerator(generator)" />
        <span>{{ GENERATOR_LABEL[generator] }}</span>
      </label>
    </fieldset>
    <!-- How many of the empty hexes a run fills: one hex always generates, so it has no choice here. -->
    <div v-if="many" class="build-opts build-density">
      <label class="ui-heading" for="build-density">Hexes to fill</label>
      <select id="build-density" v-model="density" class="build-density-box">
        <option v-for="item in DENSITIES" :key="item.id" :value="item.id">{{ item.name }}: {{ item.meaning }}</option>
      </select>
      <small class="build-fine">{{ DENSITY_HINT }}</small>
    </div>
    <fieldset v-if="many && filled > 0" class="build-opts">
      <legend class="ui-heading">The {{ plural(filled, 'hex', 'hexes') }} that already {{ filled === 1 ? 'holds' : 'hold' }} a system</legend>
      <label class="build-opt" :class="{ 'is-on': !filledToo }">
        <input type="radio" name="build-filled" :checked="!filledToo" @change="filledToo = false" /><span>Leave {{ filled === 1 ? 'it as it is' : 'them as they are' }}</span>
      </label>
      <label class="build-opt" :class="{ 'is-on': filledToo }">
        <input type="radio" name="build-filled" :checked="filledToo" @change="filledToo = true" /><span>Regenerate {{ filled === 1 ? 'it' : 'them' }} too</span>
      </label>
    </fieldset>
    <section v-if="settings.length">
      <h3 class="ui-heading">Settings <span class="ui-count">your map</span></h3>
      <dl class="build-set">
        <div v-for="row in settings" :key="row.label"><dt>{{ row.label }}</dt><dd>{{ row.value }}</dd></div>
      </dl>
    </section>
    <div class="build-sheet-foot">
      <p v-if="say" class="build-allowance" :class="{ 'is-held': say.blocked }" role="status" data-build-allowance>{{ say.text }}</p>
      <span class="build-fine">Your choice is saved for next time.</span>
      <button type="button" class="ui-btn" @click="$emit('cancel')">Cancel</button>
      <button type="submit" class="ui-btn is-primary" :disabled="count === 0 || held">
        <Icon name="wand-magic-sparkles" :size="13" />{{ goWords }}
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

.build-density {
  gap: 6px;
}

.build-density .ui-heading {
  display: block;
}

.build-density-box {
  box-sizing: border-box;
  width: 100%;
  height: 34px;
  margin: 0;
  padding: 0 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 13.5px/1.2 var(--font-text);
}

.build-density-box:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 1px;
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

.build-sheet-foot .build-allowance {
  flex: 1 0 100%;
}

.build-fine {
  margin: 0 auto 0 0;
  color: var(--text-muted);
  font-size: 12px;
  line-height: 1.45;
}
</style>
