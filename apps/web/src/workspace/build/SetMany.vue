<script setup lang="ts">
/**
 * DH9, Set for N hexes: Allegiance and Region for every system of a many-hex selection, on the
 * selection's own pane. Each press keeps one draft per system (set_many.ts); empty hexes are
 * left alone and said. No Undo: set again to take it back.
 */
import { computed, reactive, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import Spinner from '../../design/Spinner.vue';
import { openDraft } from '../../builder/draft.ts';
import { showToast } from '../../shell/toast.ts';
import { tallyOf } from './acts.ts';
import { heldLine, SET_FIELDS, setButton, setForHexes, setSentence, type SetFieldId } from './set_many.ts';

const props = defineProps<{
    keys: string[];
    /** Another Build act is running. */
    busy: boolean;
}>();

/** The systems, in hex order: empty and removed hexes are not touched. */
const targets = computed(() => {
    const count = tallyOf(props.keys);
    return [...count.chart, ...count.yours].sort();
});
const held = computed(() => heldLine(targets.value.length, props.keys.length));
const values = reactive<Record<SetFieldId, string>>({ 'chart.allegiance': '', 'chart.region': '' });
const running = ref<SetFieldId | ''>('');
const done = ref(0);

async function setFor(id: SetFieldId, label: string): Promise<void> {
    const value = values[id].trim();
    if (!value || running.value || props.busy || !targets.value.length) return;
    running.value = id;
    done.value = 0;
    try {
        const outcome = await setForHexes(targets.value, id, value, openDraft, (n) => { done.value = n; });
        showToast(setSentence(label, outcome));
        if (!outcome.failed.length) values[id] = '';
    } finally {
        running.value = '';
    }
}
</script>

<template>
  <section v-if="targets.length" class="set-many build-card" aria-label="Set for the selected systems" data-set-many>
    <h3 class="ui-heading ui-kicker">Set for the selection</h3>
    <p v-if="held" class="build-fine set-many-held" data-set-many-held>{{ held }}. The others are left alone.</p>
    <form v-for="field in SET_FIELDS" :key="field.id" class="set-many-row" @submit.prevent="setFor(field.id, field.label)">
      <label :for="'set-many-' + field.id">{{ field.label }}</label>
      <input
        :id="'set-many-' + field.id"
        v-model="values[field.id]"
        class="set-many-box"
        type="text"
        autocomplete="off"
        spellcheck="false"
        :data-field="field.id"
        :disabled="running !== '' || busy"
      />
      <button
        type="submit"
        class="ui-btn"
        :data-set-for="field.id"
        :disabled="running !== '' || busy || !values[field.id].trim()"
        :aria-busy="running === field.id ? 'true' : undefined"
      >
        <Spinner v-if="running === field.id" :size="13" />
        <Icon v-else name="pen-to-square" :size="13" />
        <template v-if="running === field.id">{{ done }} of {{ targets.length }}…</template>
        <template v-else>{{ setButton(targets.length) }}</template>
      </button>
    </form>
    <p class="build-fine">Each system is saved as you set it. To take it back, set the old value again.</p>
  </section>
</template>

<style>
.set-many > .ui-heading {
  margin-top: 0;
}

.set-many-held {
  margin: 0 0 8px;
}

.set-many-row {
  display: grid;
  grid-template-columns: 6.5em minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  margin: 0 0 8px;
}

.set-many-row label {
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.set-many-box {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  height: 32px;
  margin: 0;
  padding: 0 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.2 var(--font-code);
}

/* A phone: the label above, the box and the button on one line, each control 44 px. */
@media (max-width: 599px) {
  .set-many-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .set-many-row label {
    grid-column: 1 / -1;
  }

  .set-many-box {
    height: 44px;
  }

  .set-many-row .ui-btn {
    box-sizing: border-box;
    max-width: 100%;
    min-height: 44px;
    white-space: normal;
  }
}
</style>
