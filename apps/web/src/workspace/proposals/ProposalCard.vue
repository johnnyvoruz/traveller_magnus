<script setup lang="ts">
/**
 * One proposal (spec_session_ingest.md §1.4, SI3): what it would do beside what is stored now,
 * the quotes it rests on, and Accept, Edit, Drop. A question has Make a note and Dismiss. A
 * conflict (the record changed after the AI read it) shows the conflict strip; the diff then
 * reads against what is saved now. The section makes the calls; this says what was pressed.
 */
import { computed, nextTick, ref } from 'vue';
import type { ProposalBatch } from '@voyage/shared';
import ProposalDiff from './ProposalDiff.vue';
import { editFields, withEdits } from './proposal_edit.ts';
import { cardHeading, diffRows, targetOf, type Lookup } from './proposal_words.ts';

type Stored = NonNullable<ProposalBatch['proposals']>[number];
type ProposalValue = Stored['proposal'];

const props = defineProps<{
    row: Stored;
    look: Lookup;
    /** The record changed after the AI read it: the server's row is in the store now. */
    conflict: boolean;
    busy: boolean;
    readOnly: boolean;
}>();
const emit = defineEmits<{
    accept: [change: ProposalValue | null];
    drop: [];
    note: [];
    open: [id: string];
}>();

const proposal = computed(() => props.row.proposal);
const heading = computed(() => cardHeading(proposal.value, props.look));
const rows = computed(() => diffRows(proposal.value, props.look));
const target = computed(() => targetOf(proposal.value) ?? (props.row.state === 'accepted' && props.row.targetId && props.row.targetId.startsWith('cr_') ? props.row.targetId : null));
const isQuestion = computed(() => proposal.value.op === 'question');
const fields = computed(() => editFields(proposal.value));
const editing = ref(false);
const values = ref<Record<string, string>>({});
const editError = ref('');
const firstBox = ref<HTMLElement[] | null>(null);
const headId = computed(() => 'prop-h-' + props.row.id);

function startEdit(): void {
    values.value = Object.fromEntries(fields.value.map((field) => [field.key, field.value]));
    editError.value = '';
    editing.value = true;
    void nextTick(() => { if (firstBox.value && firstBox.value[0]) firstBox.value[0].focus(); });
}

function acceptEdited(): void {
    const made = withEdits(proposal.value, values.value);
    if ('error' in made) {
        editError.value = made.error;
        return;
    }
    emit('accept', made.proposal);
}

function cancelEdit(): void {
    editing.value = false;
    editError.value = '';
}
</script>

<template>
  <article class="prop" :class="{ 'is-done': row.state !== 'pending' && row.state !== 'conflict', 'is-question': isQuestion }" :data-proposal="row.id" :data-op="proposal.op" :data-state="conflict ? 'conflict' : row.state" :aria-labelledby="headId">
    <header class="prop-head">
      <span class="prop-kicker">{{ heading.kicker }}</span>
      <h4 :id="headId" class="prop-title">
        <button v-if="target && look.records[target] && !look.records[target].deleted" type="button" class="prop-link" @click="emit('open', target)">{{ heading.title }}</button>
        <template v-else>{{ heading.title }}</template>
      </h4>
      <span v-if="row.state === 'accepted'" class="prop-state">Accepted</span>
    </header>
    <p v-if="isQuestion" class="prop-question">{{ proposal.op === 'question' ? proposal.text : '' }}</p>
    <div v-if="conflict" class="prop-strip is-conflict" role="alert" data-proposal-conflict>
      This record changed after your AI read it. The Now lines show what is saved now. To apply the proposal anyway, select Accept. Otherwise, select Drop.
    </div>
    <form v-if="editing" class="prop-edit" @submit.prevent="acceptEdited">
      <label v-for="field in fields" :key="field.key" class="prop-fld">
        <span>{{ field.label }}</span>
        <textarea v-if="field.long" ref="firstBox" v-model="values[field.key]" class="prop-box" rows="4"></textarea>
        <input v-else ref="firstBox" v-model="values[field.key]" class="prop-box" type="text" />
      </label>
      <p v-if="editError" class="prop-strip is-conflict" role="alert">{{ editError }}</p>
      <div class="prop-acts">
        <button type="submit" class="ui-btn is-primary" :disabled="busy || readOnly" data-proposal-accept-edit>Accept</button>
        <button type="button" class="ui-btn" :disabled="busy" @click="cancelEdit">Cancel</button>
      </div>
    </form>
    <ProposalDiff v-else :rows="rows" />
    <ul v-if="proposal.evidence.length" class="prop-quotes" aria-label="From the session">
      <li v-for="(quote, i) in proposal.evidence" :key="i">
        <span class="prop-at">{{ quote.at }}</span>
        <q>{{ quote.quote }}</q>
        <span v-if="quote.speaker" class="prop-speaker">{{ quote.speaker }}</span>
      </li>
    </ul>
    <div v-if="!editing && (row.state === 'pending' || row.state === 'conflict' || conflict)" class="prop-acts">
      <template v-if="isQuestion">
        <button type="button" class="ui-btn is-primary" :disabled="busy || readOnly" data-proposal-note @click="emit('note')">Make a note</button>
        <button type="button" class="ui-btn" :disabled="busy || readOnly" data-proposal-drop @click="emit('drop')">Dismiss</button>
      </template>
      <template v-else>
        <button type="button" class="ui-btn is-primary" :disabled="busy || readOnly" data-proposal-accept @click="emit('accept', null)">Accept</button>
        <button v-if="fields.length" type="button" class="ui-btn" :disabled="busy || readOnly" data-proposal-edit @click="startEdit">Edit</button>
        <button type="button" class="ui-btn" :disabled="busy || readOnly" data-proposal-drop @click="emit('drop')">Drop</button>
      </template>
    </div>
  </article>
</template>

<style>
.prop {
  padding: 12px 14px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.prop.is-done {
  border-color: var(--line-soft);
  background: transparent;
}

.prop-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 2px 10px;
}

.prop-kicker {
  flex: 1 1 100%;
  color: var(--signal-dim);
  font: 600 11px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.prop-title {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  color: var(--text-0);
  font: 700 14.5px/1.35 var(--font-text);
  overflow-wrap: anywhere;
}

.prop-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.prop-link:hover,
.prop-link:focus-visible {
  color: var(--signal-bright);
  text-decoration: underline;
}

.prop-state {
  color: var(--signal);
  font: 600 12px/1.4 var(--font-text);
}

.prop-question {
  margin: 6px 0 0;
  color: var(--text-0);
  white-space: pre-line;
  overflow-wrap: anywhere;
}

.prop-quotes {
  display: grid;
  gap: 4px;
  margin: 10px 0 0;
  padding: 6px 0 0 10px;
  border-left: 2px solid var(--signal-line);
  list-style: none;
  color: var(--text-muted);
  font-size: 12.5px;
}

.prop-quotes q {
  color: var(--text-1);
  font-style: italic;
  overflow-wrap: anywhere;
}

.prop-at {
  margin-right: 6px;
  font: 400 11.5px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
}

.prop-speaker::before {
  content: " — ";
}

.prop-strip {
  margin: 8px 0 0;
  padding: 6px 10px;
  border-left: 3px solid var(--signal-dim);
  background: var(--bg-2);
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
}

.prop-strip.is-conflict {
  border-left-color: var(--danger);
}

.prop-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 10px;
}

.prop-edit {
  display: grid;
  gap: 8px;
  margin-top: 8px;
}

.prop-fld {
  display: grid;
  gap: 4px;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.prop-box {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 14px/1.4 var(--font-text);
  resize: vertical;
}

@media (pointer: coarse) {
  .prop-acts .ui-btn {
    min-height: 44px;
  }
}
</style>
