<script setup lang="ts">
/**
 * Publish records (contract F18): from the campaign's records list, a package of records and no
 * hexes. The list opens it with the rows it shows chosen; any record can be added or cleared. The
 * package's fields are PublishFields, as in Publish selection. A refusal is the server's sentence.
 */
import { computed, nextTick, onMounted, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import { campaign } from '../../campaign/store.ts';
import Icon from '../../design/Icon.vue';
import { wrapFocus } from '../focus_trap.ts';
import { liveRecords, typeInfo } from '../records.ts';
import { closePublish, formProblems, kindOfRecords, marketStore, marketUi, ownUniverse, parseTags, plural, publish, REFEREE_ONLY_NOTE, usePublishTarget } from './market.ts';
import PublishFields from './PublishFields.vue';
import { refereeLead } from './record_publish.ts';

const props = defineProps<{
    /** The records chosen when it opens: the rows the list shows. */
    start: readonly string[];
}>();

const emit = defineEmits<{ close: [] }>();

const router = useRouter();
const card = ref<HTMLElement | null>(null);

const all = computed(() => liveRecords(campaign.records).sort((a, b) => a.name.localeCompare(b.name)));
const picked = ref<Set<string>>(new Set(props.start));
const chosen = computed(() => all.value.filter((record) => picked.value.has(record.id)));
/** How many of the chosen records the referee alone sees: the dialog leads with a warning when it is any. */
const refereeChosen = computed(() => chosen.value.filter((record) => record.visibility === 'referee').length);
const { target, isNew } = usePublishTarget();
const problems = computed(() => formProblems({
    isNew: isNew.value,
    title: marketUi.title,
    kind: marketUi.kind,
    description: marketUi.description,
    tags: parseTags(marketUi.tags),
    hexes: 0,
    records: chosen.value.length,
    from: 'records',
}));
const selectionProblems = computed(() => problems.value.filter((item) => item.field === 'records'));
/** A missing title or kind is said once Publish is tried. */
const tried = ref(false);
const nextVersion = computed(() => (target.value ? target.value.latestVersion + 1 : 1));
const sendLabel = computed(() => (marketUi.busy ? 'Publishing…' : isNew.value ? 'Publish' : 'Publish version ' + nextVersion.value));

/** The kind suggested from the records chosen; it follows them until the person types their own. */
let suggested = '';
function suggestKind(): void {
    const next = kindOfRecords(chosen.value.map((record) => record.type));
    if (!marketUi.kind || marketUi.kind === suggested) marketUi.kind = next;
    suggested = next;
}
watch(chosen, suggestKind);

function toggle(id: string, on: boolean): void {
    const next = new Set(picked.value);
    if (on) next.add(id);
    else next.delete(id);
    picked.value = next;
}

function setAll(on: boolean): void {
    picked.value = on ? new Set(all.value.map((record) => record.id)) : new Set();
}

function close(): void {
    if (marketUi.busy) return;
    marketUi.error = '';
    emit('close');
}

async function send(): Promise<void> {
    const universe = ownUniverse();
    if (!universe || marketUi.busy) return;
    tried.value = true;
    if (problems.value.length) return;
    const path = await publish(universe, [], chosen.value.map((record) => record.id));
    if (path) {
        emit('close');
        void router.push(path);
    }
}

function stops(): HTMLElement[] {
    return card.value ? Array.from(card.value.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled])')) : [];
}

/** Tab stays in the dialog; Escape closes it. Keys typed here are the dialog's, not the map's. */
function onKey(event: KeyboardEvent): void {
    if (event.key === 'Tab') {
        const list = stops();
        const next = wrapFocus(list.length, list.indexOf(document.activeElement as HTMLElement), event.shiftKey);
        if (next !== null) {
            event.preventDefault();
            list[next].focus();
        }
    } else if (event.key === 'Escape') {
        event.preventDefault();
        close();
    }
    event.stopPropagation();
}

onMounted(() => {
    // One publish form at a time: Build's closes, keeping what was typed.
    closePublish();
    suggestKind();
    void marketStore().list().catch(() => undefined);
    // Focus starts on the first field, the package.
    void nextTick(() => {
        const first = card.value ? card.value.querySelector<HTMLElement>('.mk-rpub-body select, .mk-rpub-body input') : null;
        if (first) first.focus();
    });
});
</script>

<template>
  <Teleport to="body">
    <div class="ui-modal mk-rpub" role="dialog" aria-modal="true" aria-labelledby="mk-rpub-h" data-records-publish @keydown="onKey">
      <div class="ui-modal-scrim" @click="close()"></div>
      <div ref="card" class="ui-modal-card mk-rpub-card">
        <div class="ui-modal-bar">
          <h2 id="mk-rpub-h" class="ui-modal-title mk-rpub-title">Publish records</h2>
          <span class="ui-modal-meta">No hexes: a package of records only.</span>
          <button type="button" class="ui-btn" aria-label="Close" :disabled="marketUi.busy" @click="close()"><Icon name="xmark" :size="13" /></button>
        </div>
        <form class="mk-fields mk-rpub-body" @submit.prevent="send">
          <p class="mk-sum"><b>{{ plural(chosen.length, 'record', 'records') }}</b><span>Nothing is placed on the map. Whoever imports it gets these records in their campaign.</span></p>
          <p v-if="refereeChosen > 0" class="mk-note" role="alert" data-referee-lead><b>{{ refereeLead(refereeChosen) }}</b> Anyone who has the package's address can read what goes out.</p>
          <p v-for="item in selectionProblems" :key="item.text" class="mk-err" role="alert">{{ item.text }}</p>

          <PublishFields :problems="problems" :tried="tried" />

          <fieldset class="mk-recs mk-rpub-recs">
            <legend>Records <b>{{ chosen.length }} of {{ all.length }}</b></legend>
            <div class="mk-rpub-all">
              <button type="button" class="mk-rpub-link" :disabled="marketUi.busy" @click="setAll(true)">Select all</button>
              <button type="button" class="mk-rpub-link" :disabled="marketUi.busy" @click="setAll(false)">Clear</button>
            </div>
            <label v-for="record in all" :key="record.id">
              <input type="checkbox" :checked="picked.has(record.id)" :disabled="marketUi.busy" @change="toggle(record.id, ($event.target as HTMLInputElement).checked)" />
              <span>{{ record.name }}</span><small>{{ typeInfo(record.type).one }}</small>
              <em v-if="picked.has(record.id) && record.visibility === 'referee'" class="mk-rec-note" data-referee-only>{{ REFEREE_ONLY_NOTE }}</em>
            </label>
          </fieldset>

          <p class="mk-note">A published package is a snapshot of these records as they are now. Anyone who has its address can read it.</p>
          <p class="mk-fine">A package holds up to 500 records. Titles are up to 80 characters. Use up to 32 tags, each up to 40 characters.</p>
          <p v-if="marketUi.error" class="mk-err" role="alert">{{ marketUi.error }}</p>
          <div class="mk-acts">
            <button type="submit" class="ui-btn is-primary" data-market-publish :disabled="selectionProblems.length > 0 || marketUi.busy" :aria-busy="marketUi.busy ? 'true' : undefined">{{ sendLabel }}</button>
            <button type="button" class="ui-btn" :disabled="marketUi.busy" @click="close()">Cancel</button>
          </div>
        </form>
      </div>
    </div>
  </Teleport>
</template>

<style>
.mk-rpub-card {
  width: min(560px, 100%);
}

.mk-rpub-title {
  margin: 0;
  font-size: 15px;
}

.mk-rpub-body {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}

/* The form scrolls as one; nothing in it is squeezed to fit. */
.mk-rpub-body > * {
  flex-shrink: 0;
}

.mk-rpub-recs {
  max-height: 260px;
  overflow-y: auto;
}

.mk-rpub-all {
  display: flex;
  gap: 14px;
  padding: 2px 0 4px;
}

/* The text buttons, as the store's links (.mk-link): this dialog opens on the map, where the store's styles are not loaded. */
.mk-rpub-link {
  margin: 0;
  padding: 0;
  border: 0;
  background: none;
  color: var(--signal);
  font: 600 13px/1.4 var(--font-text);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.mk-rpub-link:hover {
  color: var(--signal-bright);
}

@media (max-width: 640px) {
  .mk-rpub {
    padding: 0;
  }

  .mk-rpub-card {
    box-sizing: border-box;
    width: 100%;
    height: 100%;
    border-radius: 0;
  }

  .mk-rpub .ui-modal-meta {
    display: none;
  }

  .mk-rpub-title {
    flex: 1 1 auto;
  }
}
</style>
