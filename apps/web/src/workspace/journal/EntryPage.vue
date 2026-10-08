<script setup lang="ts">
/**
 * One journal entry (journal design §4). Fields save where they stand, as a record's do.
 * The kind select writes kind, and a session keeps the store's next number. The visibility
 * switch writes visibility only. Mentioned lists the stored mentions.
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { CAMPAIGN_ENTRY_KINDS, CAMPAIGN_LIMITS, type CampaignAnchor, type CampaignEntry, type CampaignEntryKind } from '@voyage/shared';
import { flushCampaign, lastError, pending } from '../../campaign/commit.ts';
import { campaign } from '../../campaign/store.ts';
import { deleteEntry, nextSessionNumber, saveEntry } from '../../campaign/journal.ts';
import Icon from '../../design/Icon.vue';
import { atPane, paneChanges, withQuery } from '../../shell/pane.ts';
import EditableText from '../EditableText.vue';
import WhereBlock from '../WhereBlock.vue';
import { type BodyPart } from './body.ts';
import { justMade } from './create.ts';
import { parsePlayed, parseWhen } from './dates.ts';
import JournalBody from './JournalBody.vue';
import { placeSource } from '../place_source.ts';
import { kindWord, whenText, whenWeekday } from './list.ts';

const props = defineProps<{
    id: string;
    readOnly: boolean;
    beside: boolean;
}>();

const emit = defineEmits<{
    back: [];
    map: [];
}>();

const route = useRoute();
const router = useRouter();
const titleField = ref<{ edit: (select?: boolean) => void } | null>(null);
const bodyField = ref<{ edit: () => void } | null>(null);
const rootEl = ref<HTMLElement | null>(null);
const fictionOn = ref(false);
const playedOn = ref(false);
const fictionDraft = ref('');
const playedDraft = ref('');
const fictionWrong = ref(false);
const playedWrong = ref(false);

const entry = computed((): CampaignEntry | null => {
    void campaign.seq;
    const found = campaign.journal[props.id];
    return found && !found.deleted ? found : null;
});

const saveState = computed((): 'saving' | 'failed' | 'saved' => (lastError.value ? 'failed' : pending.value ? 'saving' : 'saved'));

function write(next: CampaignEntry): void {
    if (props.readOnly) return;
    saveEntry(next);
}

function rename(text: string): void {
    const now = entry.value;
    if (!now) return;
    write({ ...now, title: text.replace(/\s+/g, ' ').trim().slice(0, CAMPAIGN_LIMITS.entryTitle) });
}

function setKind(event: Event): void {
    const now = entry.value;
    if (!now) return;
    const kind = (event.target as HTMLSelectElement).value as CampaignEntryKind;
    if (kind === now.kind) return;
    const sequence = kind === 'session' ? (now.sequence ?? nextSessionNumber()) : null;
    write({ ...now, kind, sequence });
}

function setVisibility(visibility: 'referee' | 'players'): void {
    const now = entry.value;
    if (!now || now.visibility === visibility) return;
    write({ ...now, visibility });
}

function saveBody(text: string): void {
    const now = entry.value;
    if (!now) return;
    write({ ...now, body: text.slice(0, CAMPAIGN_LIMITS.entryBody) });
}

function place(anchor: CampaignAnchor): void {
    const now = entry.value;
    if (!now) return;
    write({ ...now, anchor });
}

function editFiction(): void {
    const now = entry.value;
    if (!now || props.readOnly) return;
    fictionDraft.value = now.when ? whenText(now.when) : '';
    fictionWrong.value = false;
    fictionOn.value = true;
}

function editPlayed(): void {
    const now = entry.value;
    if (!now || props.readOnly) return;
    playedDraft.value = now.realDate ?? '';
    playedWrong.value = false;
    playedOn.value = true;
}

function saveFiction(): void {
    const now = entry.value;
    if (!now) return;
    if (fictionDraft.value.trim() === '') {
        fictionOn.value = false;
        if (now.when) write({ ...now, when: null });
        return;
    }
    const when = parseWhen(fictionDraft.value);
    if (!when) {
        fictionWrong.value = true;
        return;
    }
    fictionOn.value = false;
    if (!now.when || now.when.year !== when.year || now.when.day !== when.day) write({ ...now, when });
}

function savePlayed(): void {
    const now = entry.value;
    if (!now) return;
    if (playedDraft.value.trim() === '') {
        playedOn.value = false;
        if (now.realDate) write({ ...now, realDate: null });
        return;
    }
    const realDate = parsePlayed(playedDraft.value);
    if (!realDate) {
        playedWrong.value = true;
        return;
    }
    playedOn.value = false;
    if (realDate !== now.realDate) write({ ...now, realDate });
}

function onDateKey(event: KeyboardEvent, which: 'fiction' | 'played'): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        if (which === 'fiction') saveFiction();
        else savePlayed();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        if (which === 'fiction') fictionOn.value = false;
        else playedOn.value = false;
        return;
    }
    event.stopPropagation();
}

function nameOf(target: string): string | null {
    if (target.startsWith('cr_')) {
        const record = campaign.records[target];
        return record && !record.deleted ? record.name : null;
    }
    if (!target.startsWith('hex:')) return null;
    const key = target.slice(4);
    const source = placeSource();
    const now = source ? source.current() : null;
    if (now && now.name && now.slug + '/' + now.hex === key) return now.name;
    return null;
}

function openPart(part: BodyPart): void {
    if (part.kind === 'text') return;
    if (part.kind === 'record') {
        void router.push(atPane(route.path, route.query, { kind: 'campaign', record: part.id }));
        return;
    }
    const cut = part.hexKey.lastIndexOf('/');
    if (cut < 0) return;
    emit('map');
    void router.push({
        path: '/s/' + encodeURIComponent(part.hexKey.slice(0, cut)) + '/' + part.hexKey.slice(cut + 1),
        query: withQuery(route.query, paneChanges({ kind: 'journal', entry: props.id })),
    });
}

function mentionPart(target: string): Exclude<BodyPart, { kind: 'text' }> {
    if (target.startsWith('hex:')) return { kind: 'hex', hexKey: target.slice(4), label: nameOf(target) || target.slice(4).replace(/_/g, ' ').replace('/', ' ') };
    const record = campaign.records[target];
    return { kind: 'record', id: target, label: record && !record.deleted ? record.name : target };
}

function remove(): void {
    if (props.readOnly || !deleteEntry(props.id)) return;
    emit('back');
    void nextTick(() => {
        const undo = document.querySelector<HTMLElement>('.toast-act');
        if (undo) undo.focus();
    });
}

function onSelectKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') return;
    event.stopPropagation();
}

function onKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        const target = event.target;
        const tag = target instanceof HTMLElement ? target.tagName : '';
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        event.preventDefault();
        event.stopPropagation();
        emit('back');
        return;
    }
    if ((event.key !== 'l' && event.key !== 'L') || event.ctrlKey || event.metaKey || event.altKey) return;
    const target = event.target;
    const tag = target instanceof HTMLElement ? target.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    const button = rootEl.value ? rootEl.value.querySelector<HTMLElement>('.where-locate') : null;
    if (!button) return;
    event.preventDefault();
    event.stopPropagation();
    button.click();
}

function greet(): void {
    const made = justMade.value;
    if (!made || made.id !== props.id) return;
    justMade.value = null;
    void nextTick(() => {
        if (made.focus === 'body' && bodyField.value) bodyField.value.edit();
        else if (titleField.value) titleField.value.edit(true);
    });
}

watch(() => props.id, greet, { immediate: true });
</script>

<template>
  <p v-if="!entry" class="jn-missing">
    This entry is not in the journal.
    <button type="button" class="ui-btn" @click="emit('back')">All entries</button>
  </p>
  <article v-else ref="rootEl" class="rec jn-entry" :data-beside="beside ? 'yes' : 'no'" :data-save="saveState" @keydown="onKey">
    <div v-if="saveState === 'failed' && lastError" class="camp-strip is-error" role="alert">
      <span>That change was not saved. Your text is still here.</span>
      <button type="button" class="ui-btn" @click="flushCampaign()">Try again</button>
    </div>

    <header class="rec-ident" :class="{ 'is-players': entry.visibility === 'players' }">
        <span class="camp-glyph is-large" aria-hidden="true">
          <Icon :name="entry.kind === 'session' ? 'calendar-star' : entry.kind === 'note' ? 'note-sticky' : entry.kind === 'handout' ? 'book-atlas' : 'radar'" :size="22" />
        </span>
        <div class="rec-names">
          <EditableText ref="titleField" title label="Title" prompt="Add a title" :value="entry.title" :max="CAMPAIGN_LIMITS.entryTitle" :disabled="readOnly" @save="rename" />
          <p class="rec-meta">
            <label class="rec-type">
              <span class="rec-sr">Kind</span>
              <select :value="entry.kind" :disabled="readOnly" aria-label="Kind" @change="setKind" @keydown="onSelectKey">
                <option v-for="kind in CAMPAIGN_ENTRY_KINDS" :key="kind" :value="kind">{{ kindWord(kind) }}</option>
              </select>
            </label>
            <b v-if="entry.kind === 'session' && entry.sequence != null" class="jn-num">{{ entry.sequence }}</b>
            <span v-if="entry.author === 'players'">Players</span>
            <span class="ui-seg" role="group" aria-label="Who can read this">
              <button type="button" :aria-pressed="entry.visibility === 'referee' ? 'true' : 'false'" :disabled="readOnly" @click="setVisibility('referee')">Referee</button>
              <button type="button" :aria-pressed="entry.visibility === 'players' ? 'true' : 'false'" :disabled="readOnly" @click="setVisibility('players')">Players</button>
            </span>
          </p>
        </div>
        <p class="rec-save" :class="'is-' + saveState" role="status">
          <template v-if="saveState === 'saving'">Saving…</template>
          <template v-else-if="saveState === 'failed'">Not saved</template>
          <template v-else><Icon name="check" :size="12" />Saved</template>
        </p>
      </header>

    <section class="jn-body-block">
      <h3 class="ui-heading">Entry</h3>
      <JournalBody ref="bodyField" :value="entry.body" :disabled="readOnly" :name-of="nameOf" @save="saveBody" @open="openPart" />
    </section>

    <footer class="rec-foot">
      <button type="button" class="ui-btn" @click="emit('back')"><Icon name="chevron-left" :size="12" />All entries</button>
      <span class="rec-gap"></span>
      <button type="button" class="ui-btn rec-delete" :disabled="readOnly" @click="remove"><Icon name="trash" :size="13" />Delete</button>
    </footer>

    <aside class="jn-side">
      <div class="jn-dates">
        <label>
          In fiction
          <input
            v-if="fictionOn"
            v-model="fictionDraft"
            class="clock-field"
            type="text"
            inputmode="numeric"
            aria-label="In fiction, as DDD-YYYY"
            placeholder="DDD-YYYY"
            :aria-invalid="fictionWrong ? 'true' : undefined"
            @keydown="onDateKey($event, 'fiction')"
            @blur="saveFiction"
          >
          <button v-else type="button" class="clock-date" :class="{ 'is-empty': !entry.when }" :disabled="readOnly" @click="editFiction">
            <template v-if="entry.when"><b>{{ whenText(entry.when) }}</b><span>{{ whenWeekday(entry.when) }}</span></template>
            <template v-else>Add a date</template>
          </button>
        </label>
        <label>
          Played
          <input
            v-if="playedOn"
            v-model="playedDraft"
            class="clock-field"
            type="text"
            inputmode="numeric"
            aria-label="Played, as YYYY-MM-DD"
            placeholder="YYYY-MM-DD"
            :aria-invalid="playedWrong ? 'true' : undefined"
            @keydown="onDateKey($event, 'played')"
            @blur="savePlayed"
          >
          <button v-else type="button" class="clock-date" :class="{ 'is-empty': !entry.realDate }" :disabled="readOnly" @click="editPlayed">
            <template v-if="entry.realDate"><b>{{ entry.realDate }}</b></template>
            <template v-else>Add a date</template>
          </button>
        </label>
        <p v-if="fictionWrong || playedWrong" class="edit-hint">A date is DDD-YYYY, day 001 to 365, or YYYY-MM-DD.</p>
      </div>

      <WhereBlock :anchor="entry.anchor" :locate-id="entry.id" :read-only="readOnly" :vessel-choice="true" @save="place" @map="emit('map')" />

      <section class="jn-mentioned">
        <h3 class="ui-heading">Mentioned</h3>
        <p v-if="entry.mentions.length === 0" class="jn-quiet">Nothing mentioned yet.</p>
        <p v-else class="jn-rail">
          <button v-for="target in entry.mentions" :key="target" type="button" class="ui-chip jn-token" @click="openPart(mentionPart(target))">
            {{ mentionPart(target).label }}
          </button>
        </p>
      </section>
    </aside>
  </article>
</template>

<style>
.jn-entry[data-beside="yes"] {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 268px);
  grid-template-areas:
    "strip strip"
    "ident side"
    "body side"
    "foot side";
  column-gap: 16px;
  align-items: start;
  align-content: start;
  min-height: 0;
}

.jn-entry[data-beside="yes"] .camp-strip { grid-area: strip; }
.jn-entry[data-beside="yes"] .rec-ident { grid-area: ident; }
.jn-entry[data-beside="yes"] .jn-body-block { grid-area: body; }
.jn-entry[data-beside="yes"] .rec-foot { grid-area: foot; }
.jn-entry[data-beside="yes"] .jn-side { grid-area: side; }

.jn-entry[data-beside="yes"] .jn-side {
  padding-left: 14px;
  border-left: 1px solid var(--line-1);
}

.jn-entry[data-beside="no"] {
  display: flex;
  flex-direction: column;
}

.jn-entry[data-beside="no"] .jn-side {
  display: contents;
}

.jn-entry[data-beside="no"] .camp-strip { order: 0; }
.jn-entry[data-beside="no"] .rec-ident { order: 1; }
.jn-entry[data-beside="no"] .jn-dates { order: 2; }
.jn-entry[data-beside="no"] .where { order: 3; }
.jn-entry[data-beside="no"] .jn-body-block { order: 4; }
.jn-entry[data-beside="no"] .jn-mentioned { order: 5; }
.jn-entry[data-beside="no"] .rec-foot { order: 6; }

.rec-ident.is-players {
  padding: 8px;
  border-radius: var(--r-2);
  box-shadow: inset 0 0 0 2px var(--attention);
}

.jn-dates {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 22px;
  margin-top: 14px;
}

.jn-entry[data-beside="yes"] .jn-dates {
  flex-direction: column;
  align-items: flex-start;
  margin-top: 0;
}

.jn-dates label {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-muted);
  font: 700 12px/1.4 var(--font-text);
  letter-spacing: 0.4px;
  text-transform: uppercase;
}

.jn-dates .clock-date.is-empty {
  color: var(--text-muted);
  font-size: 13px;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.jn-quiet {
  margin: 0;
  color: var(--text-muted);
  font-size: 13px;
}

.jn-rail {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
}

.jn-missing {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  margin: 0;
  color: var(--text-1);
}

.jn-num {
  color: var(--signal);
  font: 700 14px/1.2 var(--font-code);
  font-variant-numeric: var(--tabular);
}
</style>
