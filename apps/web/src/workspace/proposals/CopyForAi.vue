<script setup lang="ts">
/**
 * Copy for your AI (spec §3.1; decisions 10:00, 10:15, 10:40), the referee's: All, or any of
 * Ships, Characters, People, places, and things, and Journal, each with its size; then Copy (to the
 * clipboard) or Download (`<campaign>-for-your-ai.md`), the same text. The date, the party and the
 * instructions always come. Built here from the campaign already open; nothing is sent.
 */
import { computed, nextTick, onMounted, ref } from 'vue';
import Icon from '../../design/Icon.vue';
import { pageOrigin, saveBlob, writeClipboard } from '../../platform/browser.ts';
import { showToast } from '../../shell/toast.ts';
import {
    AI_PARTS,
    CHOICE_NOTES,
    CHOICE_TITLES,
    aiSnapshotFileName,
    aiSnapshotSize,
    choiceSizes,
    copyText,
    liveSheetIds,
    openCampaignInput,
    readLiveSheets,
    sizeWords,
    type CopyChoice,
} from './copy_for_ai.ts';
import type { AiPart, LiveSheetFields } from '../../campaign/ai_snapshot.ts';

const emit = defineEmits<{ close: [] }>();

const card = ref<HTMLElement | null>(null);
const held = typeof document !== 'undefined' ? document.activeElement : null;
const input = openCampaignInput();
const origin = pageOrigin();
const chosen = ref<AiPart[]>([...AI_PARTS]);
const sheets = ref<Record<string, LiveSheetFields | null>>({});
const sheetIds = input ? liveSheetIds(input) : [];
const reading = ref(sheetIds.length > 0);

const all = computed(() => chosen.value.length === AI_PARTS.length);
const sizes = computed(() => (input && !reading.value ? choiceSizes(input, origin, sheets.value) : null));
const text = computed(() => (input && !reading.value ? copyText(input, all.value ? 'all' : chosen.value, origin, sheets.value) : ''));
const size = computed(() => (text.value ? aiSnapshotSize(text.value) : null));
const fileName = computed(() => (input ? aiSnapshotFileName(input.name) : 'campaign-for-your-ai.md'));
const unread = computed(() => sheetIds.filter((id) => sheets.value[id] === null).length);

function toggleAll(): void {
    chosen.value = all.value ? [] : [...AI_PARTS];
}

function toggle(part: AiPart): void {
    chosen.value = chosen.value.includes(part) ? chosen.value.filter((item) => item !== part) : AI_PARTS.filter((item) => item === part || chosen.value.includes(item));
}

async function copy(): Promise<void> {
    if (!text.value) return;
    try {
        await writeClipboard(text.value);
        showToast('Copied. Give it to your AI with the session\'s transcript.');
    } catch {
        showToast('The text could not be copied. Select Download instead.');
    }
}

function download(): void {
    if (!text.value) return;
    saveBlob(new Blob([text.value], { type: 'text/markdown' }), fileName.value);
}

function close(): void {
    emit('close');
    if (held instanceof HTMLElement) held.focus();
}

function onKey(event: KeyboardEvent): void {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    event.stopPropagation();
    close();
}

function sizeOf(choice: CopyChoice): string {
    return sizes.value ? sizeWords(sizes.value[choice]) : 'Measuring…';
}

onMounted(() => {
    void nextTick(() => {
        const first = card.value ? card.value.querySelector<HTMLElement>('input, button') : null;
        if (first) first.focus();
    });
    if (sheetIds.length) {
        void readLiveSheets(sheetIds).then((read) => {
            sheets.value = read;
            reading.value = false;
        });
    }
});
</script>

<template>
  <Teleport to="body">
    <div class="ui-modal cfa" role="dialog" aria-modal="true" aria-labelledby="cfa-h" data-copy-for-ai @keydown="onKey">
      <div class="ui-modal-scrim" @click="close()"></div>
      <div ref="card" class="ui-modal-card cfa-card">
        <div class="ui-modal-bar">
          <h2 id="cfa-h" class="ui-modal-title">Copy for your AI</h2>
          <span class="ui-modal-meta"></span>
          <button type="button" class="ui-btn" aria-label="Close" @click="close()"><Icon name="xmark" :size="13" /></button>
        </div>
        <p class="cfa-lead">Give this text, a session's transcript, and the voyage-session-ingest skill to your AI. Your AI writes proposals. Paste its reply into Proposals. Nothing changes until you accept.</p>
        <p v-if="!input" class="cfa-lead" role="status">Open a campaign first.</p>
        <fieldset v-else class="cfa-parts">
          <legend class="cfa-legend">What to copy</legend>
          <p class="cfa-fine">The date, the party, and the instructions always come with it.</p>
          <label class="cfa-part is-all" data-copy-part="all">
            <input type="checkbox" :checked="all" @change="toggleAll" />
            <span class="cfa-name">{{ CHOICE_TITLES.all }}</span>
            <span class="cfa-size">{{ sizeOf('all') }}</span>
          </label>
          <label v-for="part in AI_PARTS" :key="part" class="cfa-part" :data-copy-part="part">
            <input type="checkbox" :checked="chosen.includes(part)" @change="toggle(part)" />
            <span class="cfa-name">{{ CHOICE_TITLES[part] }}<small>{{ CHOICE_NOTES[part] }}</small></span>
            <span class="cfa-size">{{ sizeOf(part) }}</span>
          </label>
        </fieldset>
        <p v-if="reading" class="cfa-fine" role="status">Reading {{ sheetIds.length === 1 ? 'a character sheet' : sheetIds.length + ' character sheets' }}…</p>
        <p v-else-if="unread" class="cfa-fine" role="status">{{ unread === 1 ? 'One character sheet' : unread + ' character sheets' }} could not be opened; the text says so.</p>
        <div v-if="input" class="cfa-foot">
          <p class="cfa-total" data-copy-size>
            <template v-if="size">This copy: <b>{{ sizeWords(size.tokens) }}</b> ({{ size.characters.toLocaleString('en-US') }} characters)</template>
            <template v-else>Measuring…</template>
          </p>
          <p v-if="size && size.warning" class="cfa-warn" role="alert">{{ size.warning }}</p>
          <div class="cfa-acts">
            <button type="button" class="ui-btn is-primary" :disabled="!text" data-copy-go @click="copy">Copy</button>
            <button type="button" class="ui-btn" :disabled="!text" data-copy-download @click="download">Download</button>
            <span class="cfa-file">{{ fileName }}</span>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style>
.cfa-card {
  width: min(560px, 100%);
  overflow-y: auto;
}

.cfa-lead {
  margin: 0;
  color: var(--text-1);
  font: 400 13.5px/1.5 var(--font-text);
}

.cfa-parts {
  display: grid;
  gap: 2px;
  margin: 0;
  padding: 0;
  border: 0;
}

.cfa-legend {
  padding: 0;
  color: var(--text-0);
  font: 600 13px/1.4 var(--font-text);
}

.cfa-fine {
  margin: 0 0 4px;
  color: var(--text-muted);
  font: 400 12.5px/1.45 var(--font-text);
}

.cfa-part {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: var(--r-2);
  cursor: pointer;
  transition: background var(--t-fast) var(--ease-out);
}

.cfa-part:hover {
  background: var(--neutral-wash);
}

.cfa-part.is-all {
  border-bottom: 1px solid var(--line-soft);
  border-radius: var(--r-2) var(--r-2) 0 0;
}

.cfa-part input {
  width: 16px;
  height: 16px;
  margin: 2px 0 0;
  accent-color: var(--signal);
}

.cfa-name {
  display: flex;
  flex-direction: column;
  gap: 1px;
  color: var(--text-0);
  font: 600 13.5px/1.4 var(--font-text);
}

.cfa-name small {
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

.cfa-size {
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
  white-space: nowrap;
}

.cfa-foot {
  display: grid;
  gap: 8px;
  padding-top: 10px;
  border-top: 1px solid var(--line-soft);
}

.cfa-total {
  margin: 0;
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.cfa-total b {
  color: var(--text-0);
}

.cfa-warn {
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-2);
  color: var(--text-1);
  font: 400 12.5px/1.45 var(--font-text);
}

.cfa-acts {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.cfa-file {
  color: var(--text-muted);
  font: 400 11.5px/1.4 var(--font-code);
  overflow-wrap: anywhere;
}

@media (max-width: 520px) {
  .cfa-part {
    grid-template-columns: auto minmax(0, 1fr);
  }

  .cfa-size {
    grid-column: 2;
  }
}

@media (pointer: coarse) {
  .cfa-part {
    min-height: 44px;
  }

  .cfa-acts .ui-btn {
    min-height: 44px;
  }
}
</style>
