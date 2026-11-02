<script setup lang="ts">
/**
 * Set up the ship (DU45): the eleven sheet boxes the trade loop reads, on one card above the vessel
 * page's sections, with the one-line why of each, until every box holds a number; then one folded
 * line with Edit. The boxes are the sheet's own fields and save through the sheet's own save.
 */
import { computed, reactive, ref, watch } from 'vue';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { saveRecord } from './actions.ts';
import { SETUP_FIELDS, setupDone, setupLeft, setupLine, setupNumbers, setupSave } from './ship_setup.ts';
import { sheetView, writeTrade } from './vessel_trade.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const record = computed(() => campaign.records[props.id] ?? null);
const values = computed(() => (record.value ? sheetView(record.value) : null));
const numbers = computed(() => setupNumbers(values.value));
const done = computed(() => setupDone(numbers.value));
const left = computed(() => setupLeft(numbers.value));
const line = computed(() => setupLine(numbers.value));
/** Edit pressed on the folded line: the boxes again until the page is left. */
const editing = ref(false);
const open = computed(() => !done.value || editing.value);

/** What each box shows: the sheet's text, or what is being typed. */
const draft = reactive<Record<string, string>>({});
watch(values, (next) => {
    for (const field of SETUP_FIELDS) {
        const held = next ? next[field.name] : undefined;
        draft[field.name] = typeof held === 'string' ? held : '';
    }
}, { immediate: true });

function save(name: string): void {
    const now = record.value;
    if (!now || props.readOnly || !values.value) return;
    const typed = draft[name] ?? '';
    const held = values.value[name];
    if ((typeof held === 'string' ? held : '') === typed.trim()) return;
    const change = setupSave(now, values.value, name, typed);
    if (change.kind === 'trade') writeTrade(now, { sheet: change.sheet, status: change.status });
    else saveRecord(props.id, { sheet: change.sheet });
}

const ship = SETUP_FIELDS.filter((field) => field.row === 'ship');
const costs = SETUP_FIELDS.filter((field) => field.row === 'cost');
</script>

<template>
  <section v-if="record" class="setup ui-frame" data-ship-setup :data-setup-open="open ? 'yes' : 'no'" aria-labelledby="setup-h">
    <div class="setup-head">
      <h3 id="setup-h" class="ui-frame-label">Set up the ship <span v-if="!done" class="ui-frame-count" data-setup-left>{{ left }}</span></h3>
      <button v-if="done && !editing" type="button" class="ui-btn" :disabled="readOnly" data-setup-edit @click="editing = true"><Icon name="pen-to-square" :size="12" />Edit</button>
      <button v-else-if="done" type="button" class="ui-btn" data-setup-fold @click="editing = false">Done</button>
    </div>
    <p v-if="!open" class="setup-line" data-setup-line>{{ line }}</p>
    <template v-else>
      <p class="setup-fine">These are the ship sheet's own boxes, the ones the trade sections read. Type a number in each; the sheet below shows the same.</p>
      <div v-for="(row, r) in [ship, costs]" :key="r" class="setup-row" :data-setup-row="r === 0 ? 'ship' : 'cost'">
        <label v-for="field in row" :key="field.name" class="setup-fld" :class="{ 'is-set': numbers[field.name] !== null }">
          <span class="setup-name">{{ field.name }}</span>
          <input v-model="draft[field.name]" type="text" class="setup-box" inputmode="decimal" :disabled="readOnly" :data-setup-field="field.name" :title="field.why" @change="save(field.name)" @keydown.enter.prevent="save(field.name)" @keydown.stop />
          <span class="setup-why">{{ field.why }}</span>
        </label>
      </div>
    </template>
  </section>
</template>

<style>
.setup {
  margin: 0 0 var(--sp-4);
}

.setup-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: var(--sp-3);
}

.setup-head .ui-frame-label {
  margin: 0;
}

.setup-line {
  margin: var(--sp-2) 0 0;
  color: var(--text-0);
  font: 500 13.5px/1.5 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.setup-fine {
  margin: var(--sp-2) 0 var(--sp-3);
  color: var(--text-muted);
  font: 400 12.5px/1.5 var(--font-text);
}

.setup-row {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
  gap: var(--sp-3);
}

.setup-row + .setup-row {
  margin-top: var(--sp-3);
  padding-top: var(--sp-3);
  border-top: 1px solid var(--line-1);
}

.setup-fld {
  display: flex;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.setup-name {
  color: var(--text-0);
}

.setup-fld.is-set .setup-name {
  color: var(--signal);
}

.setup-box {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 500 14px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.setup-box:focus-visible {
  outline: 2px solid var(--signal);
  outline-offset: 1px;
}

.setup-why {
  font-size: 11.5px;
  line-height: 1.35;
}
</style>
