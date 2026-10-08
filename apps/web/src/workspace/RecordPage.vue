<script setup lang="ts">
/**
 * One record (design §3): its name, type, place, summary, details and tags, each edited
 * where it stands, its connections (K5d), the saving mark, and Delete; a vessel also carries
 * its track (K12) and its ship sheet (K13) with its deck plan (K9) inside.
 */
import { computed, defineAsyncComponent, nextTick, onMounted, ref, watch } from 'vue';
import { CAMPAIGN_LIMITS, type CampaignAnchor, type CampaignRecordType } from '@voyage/shared';
import { flushCampaign, lastError, pending } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import { trackOf } from '../campaign/track.ts';
import Icon from '../design/Icon.vue';
import { deleteRecord, justCreated, recentlyDeleted, restoreRecord, saveRecord } from './actions.ts';
import EditableText from './EditableText.vue';
import { uploads } from './gallery_state.ts';
import { uploadWords } from './images.ts';
import LinksBlock from './LinksBlock.vue';
import { campaignDays, vesselWhere } from './party_where.ts';
import RecordGallery from './RecordGallery.vue';
import { RECORD_TYPES, addTag, cleanDetails, cleanName, cleanSummary, placeLine, typeInfo } from './records.ts';
import { dockShipAt } from './track_actions.ts';
import TrackBlock from './TrackBlock.vue';
import VesselPlan from './VesselPlan.vue';
import WhereBlock from './WhereBlock.vue';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
    /** The list is beside the page (full width): no "All records" button is needed. */
    beside: boolean;
}>();

const emit = defineEmits<{
    back: [];
    /** The map has to be seen (a pick, a locate): the panel gives way when it covers it. */
    map: [];
}>();

/** The ship sheet carries the PDF's 312 fields: loaded when a vessel's page first needs it. */
const ShipSheet = defineAsyncComponent(() => import('./ShipSheet.vue'));
/** The character sheet carries the PDF's 420 boxes: loaded when a person's page first needs it. */
const PersonSheet = defineAsyncComponent(() => import('./PersonSheet.vue'));

const nameField = ref<{ edit: (select?: boolean) => void } | null>(null);
const tagDraft = ref('');
const tagging = ref(false);
const tagInput = ref<HTMLInputElement | null>(null);

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted ? found : null;
});
/** The record is one of this session's deletes: it can be brought back from here. */
const wasDeleted = computed(() => recentlyDeleted.some((item) => item.id === props.id));
const info = computed(() => typeInfo(record.value ? record.value.type : 'person'));
/** A player character is a person in the party (the campaign's settings hold the party's members). */
const isPlayerCharacter = computed(() => !!record.value && record.value.type === 'person' && !!campaign.settings && campaign.settings.party.memberIds.includes(props.id));
/** An image being read or sent counts as saving; one that failed, as not saved. */
const upload = computed(() => uploads[props.id] ?? null);
const saveState = computed((): 'saving' | 'failed' | 'saved' => {
    if (lastError.value || (upload.value && upload.value.stage === 'failed')) return 'failed';
    return pending.value || upload.value ? 'saving' : 'saved';
});
const saveWords = computed(() => (upload.value && upload.value.stage !== 'failed' ? uploadWords(upload.value) : 'Saving…'));

/**
 * Where it is. A vessel with a track is where its track puts it at the campaign date, in the
 * Party tab's own words, and its place is changed as "Move the party" changes it: one docked
 * leg (the track may refuse, and says why). Anything else is at its anchor, as before.
 */
const where = computed(() => {
    const now = record.value;
    if (!now) return { anchor: null, underway: null };
    if (now.type !== 'vessel') return { anchor: now.anchor, underway: null };
    void campaign.seq;
    return vesselWhere(now, campaign.records, campaignDays(campaign.clock));
});

function place(next: CampaignAnchor): void {
    const now = record.value;
    if (!now) return;
    if (now.type === 'vessel' && trackOf(now)) dockShipAt(props.id, next, campaignDays(campaign.clock));
    else saveRecord(props.id, { anchor: next });
}

function rename(text: string): void {
    const name = cleanName(text);
    // A record is never left without a name: an emptied field keeps the old one.
    if (name) saveRecord(props.id, { name });
}

function setType(event: Event): void {
    saveRecord(props.id, { type: (event.target as HTMLSelectElement).value as CampaignRecordType });
}

function removeTag(tag: string): void {
    if (!record.value) return;
    saveRecord(props.id, { tags: record.value.tags.filter((have) => have !== tag) });
}

function startTag(): void {
    if (props.readOnly) return;
    tagging.value = true;
    void nextTick(() => { if (tagInput.value) tagInput.value.focus(); });
}

/** Adds what is typed; `more` keeps the field open for the next tag. */
function commitTag(more: boolean): void {
    if (record.value && tagDraft.value.trim()) saveRecord(props.id, { tags: addTag(record.value.tags, tagDraft.value) });
    tagDraft.value = '';
    if (!more) tagging.value = false;
}

function onTagKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' || event.key === ',') {
        event.preventDefault();
        event.stopPropagation();
        commitTag(true);
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        tagDraft.value = '';
        tagging.value = false;
        return;
    }
    event.stopPropagation();
}

function remove(): void {
    if (props.readOnly || !deleteRecord(props.id)) return;
    emit('back');
}

/** A record just made opens with its name marked, so typing names it. */
function greet(): void {
    if (justCreated.value !== props.id) return;
    justCreated.value = null;
    void nextTick(() => { if (nameField.value) nameField.value.edit(true); });
}

onMounted(greet);
watch(() => props.id, () => {
    tagDraft.value = '';
    tagging.value = false;
    greet();
});
</script>

<template>
  <article v-if="record" class="rec" :data-save="saveState">
    <div v-if="saveState === 'failed' && lastError" class="camp-strip is-error" role="alert">
      <span>That change was not saved. Your text is still here.</span>
      <button type="button" class="ui-btn" @click="flushCampaign()">Try again</button>
    </div>

    <RecordGallery :id="id" part="hero" :read-only="readOnly" />

    <header class="rec-ident">
      <span class="camp-glyph is-large" aria-hidden="true"><Icon :name="info.icon" :size="22" /></span>
      <div class="rec-names">
        <EditableText ref="nameField" title label="Name" :value="record.name" :max="CAMPAIGN_LIMITS.name" :disabled="readOnly" @save="rename" />
        <p class="rec-meta">
          <label class="rec-type">
            <span class="rec-sr">Type</span>
            <select :value="record.type" :disabled="readOnly" @change="setType" @keydown.stop>
              <option v-for="item in RECORD_TYPES" :key="item.type" :value="item.type">{{ item.one }}</option>
            </select>
          </label>
          <span v-if="isPlayerCharacter" class="rec-pc" title="A player character: in the party">PC</span>
          <span>· {{ placeLine(record, campaign.records) }}</span>
        </p>
      </div>
      <p class="rec-save" :class="'is-' + saveState" role="status">
        <template v-if="saveState === 'saving'">{{ saveWords }}</template>
        <template v-else-if="saveState === 'failed'">Not saved</template>
        <template v-else><Icon name="check" :size="12" />Saved</template>
      </p>
    </header>

    <WhereBlock
      :anchor="where.anchor"
      :underway="where.underway"
      :locate-id="id"
      :read-only="readOnly"
      :vessel-choice="record.type !== 'vessel'"
      :exclude="id"
      @save="place"
      @map="emit('map')"
    />

    <section>
      <h3 class="ui-heading">Summary</h3>
      <EditableText
        label="Summary"
        prompt="Add a summary"
        :value="record.summary"
        :max="CAMPAIGN_LIMITS.summary"
        :disabled="readOnly"
        @save="saveRecord(id, { summary: cleanSummary($event) })"
      />
    </section>

    <section>
      <h3 class="ui-heading">Details</h3>
      <EditableText
        multiline
        label="Details"
        prompt="Add details"
        :value="record.details"
        :max="CAMPAIGN_LIMITS.details"
        :disabled="readOnly"
        @save="saveRecord(id, { details: cleanDetails($event) })"
      />
    </section>

    <section>
      <h3 class="ui-heading">Tags</h3>
      <div class="rec-tags">
        <span v-for="tag in record.tags" :key="tag" class="ui-chip rec-tag">
          {{ tag }}
          <button type="button" :aria-label="'Remove the tag ' + tag" :title="'Remove ' + tag" :disabled="readOnly" @click="removeTag(tag)">
            <Icon name="xmark" :size="10" />
          </button>
        </span>
        <input
          v-if="tagging"
          ref="tagInput"
          v-model="tagDraft"
          class="rec-tag-input"
          type="text"
          aria-label="New tag"
          placeholder="tag"
          :maxlength="CAMPAIGN_LIMITS.tag"
          @keydown="onTagKey"
          @blur="commitTag(false)"
        >
        <button
          v-else-if="record.tags.length < CAMPAIGN_LIMITS.tags"
          type="button"
          class="ui-chip rec-tag-add"
          :disabled="readOnly"
          @click="startTag"
        >
          <Icon name="plus" :size="10" />tag
        </button>
      </div>
    </section>

    <RecordGallery :id="id" part="strip" :read-only="readOnly" />

    <LinksBlock :id="id" :read-only="readOnly" />

    <TrackBlock v-if="record.type === 'vessel'" :id="id" :read-only="readOnly" />

    <PersonSheet v-if="record.type === 'person'" :id="id" :read-only="readOnly" />

    <ShipSheet v-if="record.type === 'vessel'" :id="id" :read-only="readOnly">
      <VesselPlan :id="id" :read-only="readOnly" />
    </ShipSheet>

    <footer class="rec-foot">
      <button v-if="!beside" type="button" class="ui-btn" @click="emit('back')">
        <Icon name="chevron-left" :size="12" />All records
      </button>
      <span class="rec-gap"></span>
      <button type="button" class="ui-btn rec-delete" :disabled="readOnly" @click="remove">
        <Icon name="trash" :size="13" />Delete
      </button>
    </footer>
  </article>

  <div v-else class="camp-empty rec-missing">
    <p>{{ wasDeleted ? 'This record was deleted.' : 'This record is gone.' }}</p>
    <div class="rec-missing-acts">
      <button v-if="wasDeleted" type="button" class="ui-btn is-primary" :disabled="readOnly" @click="restoreRecord(id)">
        <Icon name="rotate-left" :size="12" />Undo the delete
      </button>
      <button v-if="!beside" type="button" class="ui-btn" @click="emit('back')">
        <Icon name="chevron-left" :size="12" />All records
      </button>
    </div>
  </div>
</template>

<style>
.rec {
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 100%;
}

.rec section > .ui-heading:first-child {
  margin-top: 16px;
}

.rec-ident {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.rec-names {
  flex: 1 1 auto;
  min-width: 0;
}

/* A player character's mark: the sheet's rust value tag. */
.rec-pc {
  padding: 0 9px 0 7px;
  border: 1px solid var(--sheet-rust-line);
  background: var(--sheet-rust);
  color: var(--text-0);
  font: 700 12px/1.5 var(--font-code);
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
}

.rec-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
  margin: 2px 0 0;
  color: var(--text-muted);
  font: 400 12.5px/1.4 var(--font-text);
}

/* The type is changed from the word itself. */
.rec-type select {
  margin: 0 0 0 -4px;
  padding: 1px 4px;
  border: 1px solid transparent;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-1);
  font: 600 12.5px/1.4 var(--font-text);
  cursor: pointer;
}

.rec-type select:hover,
.rec-type select:focus-visible {
  border-color: var(--line-2);
  background: var(--panel-raised);
}

.rec-type option {
  background: var(--bg-1);
  color: var(--text-1);
}

.rec-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}

/* The saving mark: what has become of the last change. */
.rec-save {
  display: inline-flex;
  flex: 0 0 auto;
  align-items: center;
  gap: 6px;
  margin: 8px 0 0;
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
  white-space: nowrap;
}

.rec-save .ui-icon {
  color: var(--signal);
}

.rec-save.is-saving {
  color: var(--text-1);
}

.rec-save.is-failed {
  color: var(--danger);
}

.rec-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.rec-tag {
  align-items: center;
}

.rec-tag button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  margin: 0 -3px 0 0;
  padding: 0;
  border: 0;
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}

.rec-tag button:not(:disabled):hover {
  color: var(--text-0);
}

.rec-tag-add {
  align-items: center;
  border-style: dashed;
  color: var(--text-muted);
  cursor: pointer;
}

.rec-tag-add:not(:disabled):hover {
  border-color: var(--signal-dim);
  color: var(--text-1);
}

.rec-tag-input {
  width: 130px;
  margin: 0;
  padding: 3px 9px 4px;
  border: 1px solid var(--signal);
  border-radius: var(--r-pill);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 12px/1.35 var(--font-text);
}

.rec-tag-input:focus-visible {
  outline: none;
  box-shadow: 0 0 0 2px var(--signal-glow);
}

.rec-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: auto;
  padding-top: 22px;
}

.rec-gap {
  flex: 1 1 auto;
}

.ui-btn.rec-delete {
  border-color: color-mix(in srgb, var(--danger) 60%, transparent);
  color: var(--danger);
}

.ui-btn.rec-delete .ui-icon {
  color: var(--danger);
}

.ui-btn.rec-delete:not(:disabled):hover {
  border-color: var(--danger);
}

.rec-missing-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
</style>
