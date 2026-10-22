<script setup lang="ts">
/**
 * Proposals (spec_session_ingest.md §1.4 and §3.1, SI3), the referee's, in the Campaign panel:
 * the batches your AI sent or you pasted (label, date, counts), a batch's cards in transcript
 * order with Accept, Edit and Drop, "Accept all new" and "Drop the rest"; Reviewed batches; and
 * Paste your AI's reply (a text box and a file drop; errors name the proposal and the field).
 * A's `campaign/proposals.ts` makes every call; nothing applies without the referee's press.
 */
import { computed, onMounted, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { ProposalBatch } from '@voyage/shared';
import { draftNote, saveEntry } from '../../campaign/journal.ts';
import {
    loadBatch,
    loadBatches,
    pastedBatch,
    proposals,
    resolve,
    submitPasted,
    type ProposalDecisionInput,
} from '../../campaign/proposals.ts';
import { campaign, switchCampaign } from '../../campaign/store.ts';
import { showToast } from '../../shell/toast.ts';
import { atPane } from '../../shell/pane.ts';
import CopyForAi from './CopyForAi.vue';
import ProposalCard from './ProposalCard.vue';
import { countWords, doorWords, pastedWords, refNames, stampWords, type Lookup } from './proposal_words.ts';

type Stored = NonNullable<ProposalBatch['proposals']>[number];
type ProposalValue = Stored['proposal'];

const props = defineProps<{ batchId: string | null; readOnly: boolean }>();
const emit = defineEmits<{ open: [id: string] }>();

const route = useRoute();
const router = useRouter();
const DECISIONS_PER_CALL = 50;
const CREATES = new Set(['record.create', 'link.create', 'journal.create']);

const listState = ref<'loading' | 'ready' | 'failed'>('loading');
const shelf = ref<'open' | 'reviewed'>('open');
const reviewed = ref<ProposalBatch[]>([]);
const busy = ref<string | null>(null);
const confirmDrop = ref(false);
const copying = ref(false);
const pasteOpen = ref(false);
const pasteText = ref('');
const pasteWords = ref<string[]>([]);
const pasteBusy = ref(false);
const dropping = ref(false);
const fileEl = ref<HTMLInputElement | null>(null);

const batch = computed(() => (props.batchId && proposals.batch && proposals.batch.id === props.batchId ? proposals.batch : null));
const openBatches = computed(() => proposals.batches.filter((item) => item.state === 'open'));
const shown = computed(() => (shelf.value === 'open' ? openBatches.value : reviewed.value));
const look = computed((): Lookup => ({ records: campaign.records, refs: batch.value ? refNames(batch.value) : new Map() }));
/** Cards in transcript order; a dropped proposal is gone from the list (CRUD: a drop deletes it). */
const cards = computed(() => (batch.value?.proposals ?? []).filter((row) => row.state !== 'dropped').sort((a, b) => a.ordinal - b.ordinal));
const pending = computed(() => cards.value.filter((row) => row.state === 'pending' || row.state === 'conflict' || conflictOf(row.id)));
const pendingCreates = computed(() => pending.value.filter((row) => CREATES.has(row.proposal.op)));
const paste = computed(() => (pasteText.value.trim() ? pastedBatch(pasteText.value) : null));

function conflictOf(id: string): boolean {
    return proposals.conflicts.some((item) => item.proposalId === id);
}

function showBatch(id: string | null): void {
    confirmDrop.value = false;
    void router.push(atPane(route.path, route.query, { kind: 'proposals', batch: id }));
}

async function loadList(): Promise<void> {
    if (!campaign.universeId) return;
    if (!proposals.batches.length) listState.value = 'loading';
    await loadBatches('open');
    listState.value = proposals.error ? 'failed' : 'ready';
}

async function loadReviewed(): Promise<void> {
    shelf.value = 'reviewed';
    listState.value = 'loading';
    const open = [...proposals.batches];
    const pendingCount = proposals.pending;
    reviewed.value = await loadBatches('reviewed');
    // loadBatches keeps one list: put the open ones back, so the count and the open shelf stay right.
    proposals.batches = open;
    proposals.pending = pendingCount;
    listState.value = proposals.error ? 'failed' : 'ready';
}

async function openBatch(id: string | null): Promise<void> {
    if (!id) return;
    if (proposals.batch && proposals.batch.id === id && proposals.batch.proposals) return;
    await loadBatch(id);
}

/** Sends decisions in calls of at most 50, in transcript order, so a link follows the create it names. */
async function decide(decisions: ProposalDecisionInput[], key: string): Promise<boolean> {
    const current = batch.value;
    if (!current || props.readOnly || busy.value) return false;
    busy.value = key;
    let ok = true;
    try {
        for (let i = 0; i < decisions.length; i += DECISIONS_PER_CALL) {
            const result = await resolve(current.id, decisions.slice(i, i + DECISIONS_PER_CALL));
            if (!result) {
                ok = false;
                showToast('That could not be saved. Check your connection, then try again.');
                break;
            }
        }
    } finally {
        busy.value = null;
    }
    if (ok) {
        proposals.pending = Math.max(0, openBatches.value.reduce((sum, item) => sum + item.counts.pending, 0));
    }
    return ok;
}

function accept(row: Stored, change: ProposalValue | null): void {
    void decide([{ proposalId: row.id, action: 'accept', ...(change ? { change } : {}) }], row.id);
}

function drop(row: Stored): void {
    void decide([{ proposalId: row.id, action: 'drop' }], row.id);
}

/** A question becomes a referee note in the Journal, then counts as accepted. */
async function note(row: Stored): Promise<void> {
    if (row.proposal.op !== 'question' || props.readOnly) return;
    const entry = { ...draftNote(), title: 'Question from your AI', body: row.proposal.text };
    if (!saveEntry(entry)) {
        showToast('The note could not be made. Try again.');
        return;
    }
    if (await decide([{ proposalId: row.id, action: 'accept' }], row.id)) showToast('Note made in the Journal.');
}

async function acceptCreates(): Promise<void> {
    const list = pendingCreates.value.map((row): ProposalDecisionInput => ({ proposalId: row.id, action: 'accept' }));
    if (!list.length) return;
    if (await decide(list, 'creates')) showToast(list.length === 1 ? 'Accepted 1 new item.' : `Accepted ${list.length} new items.`);
}

async function dropRest(): Promise<void> {
    const list = pending.value.map((row): ProposalDecisionInput => ({ proposalId: row.id, action: 'drop' }));
    confirmDrop.value = false;
    if (!list.length) return;
    if (await decide(list, 'rest')) showToast(list.length === 1 ? 'Dropped 1 proposal.' : `Dropped ${list.length} proposals.`);
}

async function sendPaste(): Promise<void> {
    if (props.readOnly || pasteBusy.value || !pasteText.value.trim()) return;
    pasteBusy.value = true;
    pasteWords.value = [];
    let result: Awaited<ReturnType<typeof submitPasted>>;
    try {
        result = await submitPasted(pasteText.value);
    } catch {
        pasteWords.value = ['The proposals could not be added. Check your connection, then try again.'];
        pasteBusy.value = false;
        return;
    }
    pasteBusy.value = false;
    if (!result.ok) {
        pasteWords.value = result.sentences;
        return;
    }
    if (!result.sent) {
        pasteWords.value = [result.message ?? 'The proposals could not be added. Check your connection, then try again.'];
        return;
    }
    const made = proposals.batch;
    const total = result.batch.proposals.length;
    showToast(`Added ${total} ${total === 1 ? 'proposal' : 'proposals'} from “${result.batch.source.label}”.`);
    pasteText.value = '';
    pasteOpen.value = false;
    if (made) showBatch(made.id);
}

async function takeFile(file: File | undefined | null): Promise<void> {
    if (!file) return;
    if (file.size > 2_000_000) {
        pasteWords.value = ['That file is larger than a reply can be. Paste the reply\'s last ```json block instead.'];
        return;
    }
    pasteText.value = await file.text();
    pasteWords.value = [];
}

function onDrop(event: DragEvent): void {
    dropping.value = false;
    const file = event.dataTransfer && event.dataTransfer.files.length ? event.dataTransfer.files[0] : null;
    void takeFile(file);
}

function onFile(event: Event): void {
    const el = event.target as HTMLInputElement;
    void takeFile(el.files && el.files.length ? el.files[0] : null);
    el.value = '';
}

/** A review link (`/universes/:id/proposals/:batchId`) names its campaign: open it when it is not the one open. */
async function followUniverse(): Promise<void> {
    const wanted = typeof route.query.universe === 'string' ? route.query.universe : null;
    if (!wanted || campaign.status !== 'ready') return;
    const query = { ...route.query };
    delete query.universe;
    if (wanted !== campaign.universeId && campaign.universes.some((item) => item.id === wanted)) await switchCampaign(wanted);
    void router.replace({ path: route.path, query });
}

onMounted(() => {
    void followUniverse();
    void loadList();
    void openBatch(props.batchId);
});
watch(() => props.batchId, (id) => { confirmDrop.value = false; void openBatch(id); });
watch(() => campaign.universeId, () => {
    reviewed.value = [];
    shelf.value = 'open';
    void loadList();
    if (props.batchId) void openBatch(props.batchId);
});
watch(() => campaign.status, () => { void followUniverse(); });
</script>

<template>
  <section class="props" aria-labelledby="props-h" data-proposals>
    <header class="props-head">
      <h3 id="props-h" class="ui-frame-label">Proposals <span v-if="proposals.pending" class="ui-frame-count" data-proposals-pending>{{ proposals.pending }}</span></h3>
      <div class="props-tools">
        <button type="button" class="ui-btn" data-proposals-copy @click="copying = true">Copy for your AI</button>
        <button type="button" class="ui-btn" :aria-expanded="pasteOpen ? 'true' : 'false'" aria-controls="props-paste" data-proposals-paste :disabled="readOnly" @click="pasteOpen = !pasteOpen">Paste your AI's reply</button>
      </div>
    </header>

    <form v-if="pasteOpen" id="props-paste" class="props-paste" :class="{ 'is-over': dropping }" data-paste @submit.prevent="sendPaste" @dragover.prevent="dropping = true" @dragleave="dropping = false" @drop.prevent="onDrop">
      <label class="props-fld" for="props-paste-box">Your AI's reply, or a file with it. The proposals are in its last <code>```json</code> block.</label>
      <textarea id="props-paste-box" v-model="pasteText" class="props-box" rows="7" spellcheck="false" placeholder="Paste the whole reply here, or drop the file on this box." data-paste-box @input="pasteWords = []"></textarea>
      <p v-if="paste && paste.ok && !pasteWords.length" class="props-fine" role="status" data-paste-ok>Found {{ pastedWords(paste.counts) }}, from “{{ paste.batch.source.label }}”.</p>
      <ul v-if="pasteWords.length" class="props-errs" role="alert" data-paste-errors>
        <li v-for="(line, i) in pasteWords" :key="i">{{ line }}</li>
      </ul>
      <div class="props-acts">
        <button type="submit" class="ui-btn is-primary" :disabled="readOnly || pasteBusy || !pasteText.trim()" data-paste-send>{{ pasteBusy ? 'Adding…' : 'Add to Proposals' }}</button>
        <button type="button" class="ui-btn" @click="fileEl && fileEl.click()">Choose a file</button>
        <input ref="fileEl" class="props-file" type="file" accept=".json,.md,.txt,text/plain,application/json,text/markdown" tabindex="-1" aria-hidden="true" @change="onFile" />
        <span class="props-fine">Nothing changes until you accept.</span>
      </div>
    </form>

    <template v-if="batchId">
      <nav class="props-back">
        <button type="button" class="props-link" data-proposals-back @click="showBatch(null)">← All proposals</button>
      </nav>
      <p v-if="!batch" class="props-fine" role="status">{{ proposals.error ? 'This batch could not be loaded.' : 'Loading the batch…' }}</p>
      <template v-else>
        <div class="props-batch-head">
          <h4 class="props-batch-title">{{ batch.source.label }}</h4>
          <p class="props-fine">{{ doorWords(batch) }} · {{ stampWords(batch.createdAt) }}<template v-if="batch.source.realDate"> · played {{ batch.source.realDate }}</template> · {{ countWords(batch.counts) }}</p>
        </div>
        <div v-if="pending.length" class="props-acts props-bulk">
          <button v-if="pendingCreates.length" type="button" class="ui-btn" :disabled="readOnly || busy !== null" data-proposals-accept-creates @click="acceptCreates">Accept all new ({{ pendingCreates.length }})</button>
          <template v-if="!confirmDrop">
            <button type="button" class="ui-btn" :disabled="readOnly || busy !== null" data-proposals-drop-rest @click="confirmDrop = true">Drop the rest</button>
          </template>
          <span v-else class="props-confirm" role="group" aria-label="Drop the rest">
            <span>{{ pending.length === 1 ? 'Drop the last proposal? Your AI can send it again.' : 'Drop all ' + pending.length + ' waiting proposals? Your AI can send them again.' }}</span>
            <button type="button" class="ui-btn is-primary" data-proposals-drop-confirm @click="dropRest">Drop them</button>
            <button type="button" class="ui-btn" @click="confirmDrop = false">Keep them</button>
          </span>
        </div>
        <p v-else class="props-fine" role="status" data-proposals-reviewed>Every proposal in this batch is reviewed.</p>
        <ol class="props-cards">
          <li v-for="row in cards" :key="row.id">
            <ProposalCard
              :row="row"
              :look="look"
              :conflict="conflictOf(row.id)"
              :busy="busy !== null"
              :read-only="readOnly"
              @accept="(change) => accept(row, change)"
              @drop="drop(row)"
              @note="note(row)"
              @open="(id) => emit('open', id)"
            />
          </li>
        </ol>
      </template>
    </template>

    <template v-else>
      <div class="props-shelf" role="group" aria-label="Which batches">
        <button type="button" class="props-shelf-btn" :aria-pressed="shelf === 'open' ? 'true' : 'false'" @click="shelf = 'open'">Waiting</button>
        <button type="button" class="props-shelf-btn" :aria-pressed="shelf === 'reviewed' ? 'true' : 'false'" data-proposals-reviewed-shelf @click="loadReviewed">Reviewed</button>
      </div>
      <p v-if="listState === 'loading'" class="props-fine" role="status">Loading proposals…</p>
      <p v-else-if="listState === 'failed'" class="props-fine" role="alert">Proposals could not be loaded. <button type="button" class="props-link" @click="loadList">Try again</button></p>
      <p v-else-if="!shown.length && shelf === 'open'" class="props-empty" data-proposals-empty>
        No proposals are waiting. To bring in a session, select <b>Copy for your AI</b>, give the text, the session's transcript, and the voyage-session-ingest skill to your AI, then paste its reply here.
      </p>
      <p v-else-if="!shown.length" class="props-empty">No batches were reviewed in the last 90 days.</p>
      <ul v-else class="props-list">
        <li v-for="item in shown" :key="item.id">
          <button type="button" class="props-row" :data-batch="item.id" @click="showBatch(item.id)">
            <b>{{ item.source.label }}</b>
            <span class="props-fine">{{ doorWords(item) }} · {{ stampWords(item.createdAt) }}</span>
            <span class="props-counts">{{ countWords(item.counts) }}</span>
          </button>
        </li>
      </ul>
    </template>
    <CopyForAi v-if="copying" @close="copying = false" />
  </section>
</template>

<style>
.props {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding: 4px 0 16px;
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.props-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 8px 12px;
}

.props-head .ui-frame-label {
  margin: 0;
}

.props-tools,
.props-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.props-paste {
  display: grid;
  gap: 8px;
  padding: 10px 12px;
  border: 1px dashed var(--control-line);
  border-radius: var(--r-3);
  background: var(--bg-2);
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.props-paste.is-over {
  border-color: var(--signal);
  background: var(--wash-faint);
}

.props-fld {
  color: var(--text-muted);
  font: 500 12.5px/1.4 var(--font-text);
}

.props-fld code {
  font: 400 12px/1.4 var(--font-code);
}

.props-box {
  box-sizing: border-box;
  width: 100%;
  min-height: 120px;
  padding: 8px 10px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 400 12.5px/1.45 var(--font-code);
  resize: vertical;
}

.props-file {
  display: none;
}

.props-fine {
  margin: 0;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.props-errs {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 6px 10px 6px 26px;
  border-left: 3px solid var(--danger);
  background: var(--bg-1);
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
  overflow-wrap: anywhere;
}

.props-empty {
  margin: 0;
  padding: 12px 14px;
  border: 1px solid var(--line-soft);
  border-radius: var(--r-3);
  color: var(--text-muted);
  font: 400 13px/1.5 var(--font-text);
}

.props-empty b {
  color: var(--text-0);
}

.props-shelf {
  display: inline-flex;
  max-width: max-content;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  overflow: hidden;
}

.props-shelf-btn {
  padding: 5px 12px;
  border: 0;
  background: transparent;
  color: var(--text-muted);
  font: 600 12.5px/1.3 var(--font-text);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out), color var(--t-fast) var(--ease-out);
}

.props-shelf-btn + .props-shelf-btn {
  border-left: 1px solid var(--control-line);
}

.props-shelf-btn:hover {
  color: var(--text-0);
}

.props-shelf-btn[aria-pressed="true"] {
  background: var(--row-active);
  color: var(--signal);
}

.props-list,
.props-cards {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.props-row {
  display: grid;
  width: 100%;
  gap: 2px;
  padding: 10px 12px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--bg-1);
  color: var(--text-1);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition: border-color var(--t-fast) var(--ease-out), background var(--t-fast) var(--ease-out);
}

.props-row:hover,
.props-row:focus-visible {
  border-color: var(--signal-dim);
  background: var(--panel-raised);
}

.props-row b {
  color: var(--text-0);
  font: 700 14px/1.35 var(--font-text);
  overflow-wrap: anywhere;
}

.props-counts {
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
}

.props-link {
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 500 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.props-link:hover,
.props-link:focus-visible {
  color: var(--signal-bright);
  text-decoration: underline;
}

.props-batch-head {
  display: grid;
  gap: 2px;
}

.props-batch-title {
  margin: 0;
  color: var(--text-0);
  font: 700 15px/1.35 var(--font-text);
  overflow-wrap: anywhere;
}

.props-confirm {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-2);
}

@media (pointer: coarse) {
  .props .ui-btn,
  .props-shelf-btn {
    min-height: 44px;
  }
}
</style>
