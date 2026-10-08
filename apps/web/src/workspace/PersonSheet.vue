<script setup lang="ts">
/**
 * The character sheet on a person's record page: **the one place that knows where the
 * sheet lives today** (the record's `sheet`, against mgt2e_character@1). It gives the
 * sheet component a plain document and whether it may be edited, saves each box as it is
 * committed through the record's own in-place save, and fills the sheet's pills from the
 * campaign: the homeworld's system, the person's items, and their allies, contacts, rivals
 * and enemies. A person with no sheet has one control that starts one; whatever a
 * free-form sheet already holds is kept beside the new fields and shown.
 *
 * **The second wiring (character_mvp.md, "D, Part 2"):** the record's sheet may instead
 * refer to a Character that lives outside the game. Then the same sheet component is given
 * that Character's boxes, live, with who else is in which box, through the seam in
 * person_character.ts; nothing inside the sheet differs. With no sheet the page offers
 * "Make this a Character" and "Attach one of mine" beside the plain start; an attached
 * Character shows its name, who owns it and "Detach", which keeps a frozen copy.
 */
import { computed, nextTick, onBeforeUnmount, reactive, ref, shallowRef, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { lastError, pending } from '../campaign/commit.ts';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { atPane, withQuery } from '../shell/pane.ts';
import { showToast } from '../shell/toast.ts';
import { saveRecord } from './actions.ts';
import { CHARACTER_RULES, characterDoc, characterSheetWith, otherKeys, type SlotName } from './character_sheet.ts';
import CharacterSheet from './CharacterSheet.vue';
// The Characters store registers itself behind the seam (the one hookup file).
import './character_wiring.ts';
import { characterFolded } from './list_state.ts';
import {
    attachedSheet, characterIdOf, characterSource, detachedSheet, lastSeenFields, ownerWords, presenceMap, statusWords, type CharacterHandle,
} from './person_character.ts';
import { beginPick, endPick } from './pick.ts';
import { valueOf, withValue, type SheetDoc, type SheetValues } from './sheet_fields.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const route = useRoute();
const router = useRouter();

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'person' ? found : null;
});
/** The Character this person's sheet refers to, or null. */
const characterId = computed(() => (record.value ? characterIdOf(record.value.sheet) : null));
/** The record's own plain sheet; null when there is none, or when a Character stands in its place. */
const stored = computed(() => (record.value && !characterId.value ? characterDoc(record.value.sheet) : null));

/**
 * Boxes committed here that the store has not yet settled on. A save sends the whole
 * sheet, and the store takes the server's copy of the record when an earlier save comes
 * back: a box committed in between would be dropped from the store, and the next save,
 * built on that copy, would lose it for good (seen in the browser: the count of stored
 * boxes going backwards while typing). So what was committed is held here, laid over the
 * stored values for the sheet and for every save, and sent again if the settled store
 * does not have it.
 */
const typed = reactive<Record<string, string | boolean>>({});
watch(() => props.id, () => { for (const name of Object.keys(typed)) delete typed[name]; });

function withTyped(fields: SheetValues): SheetValues {
    let out = fields;
    for (const [name, value] of Object.entries(typed)) {
        const field = CHARACTER_RULES.fields.find((item) => item.name === name);
        if (field) out = withValue(out, field, value);
    }
    return out;
}

const doc = computed((): SheetDoc | null => (stored.value ? { schema: stored.value.schema, fields: withTyped(stored.value.fields) } : null));

function save(): void {
    if (props.readOnly || !record.value || !doc.value) return;
    saveRecord(props.id, { sheet: characterSheetWith(record.value.sheet, doc.value.fields) });
}

/** Nothing queued or in flight: a held box the store has is let go; one it lacks is sent again. */
watch([() => stored.value && stored.value.fields, pending], () => {
    if (pending.value || lastError.value || !stored.value) return;
    let lost = false;
    for (const [name, value] of Object.entries(typed)) {
        const field = CHARACTER_RULES.fields.find((item) => item.name === name);
        const now = field ? valueOf(stored.value.fields, field) : value;
        const want = typeof value === 'string' ? (value.trim() === '' ? '' : value) : value;
        if (now === want) delete typed[name];
        else lost = true;
    }
    if (lost) save();
});

/** What the sheet held before it was a character sheet (a free-form sheet's own keys): kept, and shown as it is. */
const kept = computed(() => {
    const other = record.value ? otherKeys(record.value.sheet) : {};
    return Object.keys(other).length ? JSON.stringify(other, null, 2) : '';
});

/** Which sections are folded, for this person, for the visit. */
const folded = computed(() => {
    if (!characterFolded[props.id]) characterFolded[props.id] = {};
    return characterFolded[props.id];
});

function start(): void {
    if (props.readOnly || !record.value) return;
    saveRecord(props.id, { sheet: characterSheetWith(record.value.sheet, {}) });
}

function change(name: string, value: string | boolean): void {
    const field = CHARACTER_RULES.fields.find((item) => item.name === name);
    if (props.readOnly || !record.value || !doc.value || !field) return;
    typed[name] = value;
    save();
}

// ---- The second wiring: a Character, live ----

/** The Characters store, when the app has one; with none, the page offers the plain sheet alone. */
const source = characterSource();
const handle = shallowRef<CharacterHandle | null>(null);

watch(characterId, (id) => {
    if (handle.value) handle.value.close();
    handle.value = id && source ? source.open(id) : null;
}, { immediate: true });
onBeforeUnmount(() => { if (handle.value) handle.value.close(); });

const liveDoc = computed((): SheetDoc | null => {
    const open = handle.value;
    if (!open || open.status === 'gone') return null;
    const fields: SheetValues = {};
    for (const [name, value] of Object.entries(open.fields)) if (typeof value === 'string' || typeof value === 'boolean') fields[name] = value;
    return { schema: 'mgt2e_character@1', fields };
});
const livePresence = computed(() => (handle.value && source ? presenceMap(handle.value.who, source.tone) : {}));
const liveEditable = computed(() => !!handle.value && handle.value.role !== null && handle.value.status !== 'gone');
const others = computed(() => (handle.value ? handle.value.who : []));

function attach(id: string): void {
    if (props.readOnly || !record.value) return;
    saveRecord(props.id, { sheet: attachedSheet(record.value.sheet, id) });
    picking.value = false;
}

/** "Make this a Character": one is made, owned by the signed-in account and named as the person is, and attached. */
const making = ref(false);
async function makeCharacter(): Promise<void> {
    if (props.readOnly || !record.value || !source || making.value) return;
    making.value = true;
    try {
        const id = await source.create(record.value.name);
        if (id) attach(id);
        else showToast('The Character could not be made.');
    } finally {
        making.value = false;
    }
}

/** "Attach one of mine": the list from the Characters store, as a picker under the choices. */
const picking = ref(false);
const pickEl = ref<HTMLElement | null>(null);
const mine = computed(() => (source ? source.list() : []));
function openPicker(): void {
    if (!source) return;
    picking.value = !picking.value;
    if (!picking.value) return;
    void source.load();
    void nextTick(() => {
        const first = pickEl.value ? pickEl.value.querySelector<HTMLElement>('button') : null;
        if (first) first.focus();
    });
}

/** Detach: the boxes as they stand are written into the record as its own sheet, and the reference is dropped. Undo attaches it again. */
function detach(): void {
    const id = characterId.value;
    if (props.readOnly || !record.value || !id) return;
    const before = record.value.sheet;
    // The last boxes this page saw are the frozen copy, also when the Character can no longer be reached (ruled 2026-10-08).
    const seen = lastSeenFields(handle.value);
    saveRecord(props.id, { sheet: detachedSheet(record.value.sheet, seen) });
    showToast(Object.keys(seen).length ? 'Detached. This person keeps a copy of the sheet as it stood.' : 'Detached. There was nothing on the sheet to keep.', {
        action: { label: 'Undo', run: () => { saveRecord(props.id, { sheet: before }); } },
    });
}

// ---- The homeworld as a system: kept beside the fields, never written into the Homeworld box ----
type Home = { slug: string; hex: string; name: string };
const home = computed((): Home | null => {
    const sheet = record.value ? record.value.sheet : null;
    const held = sheet && typeof sheet === 'object' && !Array.isArray(sheet) ? (sheet as Record<string, unknown>).homeworld : null;
    if (!held || typeof held !== 'object') return null;
    const { slug, hex, name } = held as Record<string, unknown>;
    return typeof slug === 'string' && typeof hex === 'string' && typeof name === 'string' ? { slug, hex, name } : null;
});

function saveHome(next: Home | null): void {
    if (props.readOnly || !record.value || !doc.value) return;
    const sheet = characterSheetWith(record.value.sheet, doc.value.fields);
    if (next) sheet.homeworld = next;
    else delete sheet.homeworld;
    saveRecord(props.id, { sheet });
}

function onHomeworld(act: 'choose' | 'open' | 'clear'): void {
    if (act === 'clear') saveHome(null);
    else if (act === 'open' && home.value) void router.push({ path: '/s/' + home.value.slug + '/' + home.value.hex, query: withQuery(route.query, {}) });
    else if (act === 'choose') {
        beginPick((system) => {
            saveHome({ slug: system.slug, hex: system.hex, name: system.name });
            endPick();
        });
    }
}

// ---- Linked records as pills ----
const KINDS: readonly SlotName[] = ['ally', 'contact', 'rival', 'enemy'];

const links = computed(() => {
    const out: Partial<Record<SlotName, { id: string; name: string }[]>> = {};
    const add = (slot: SlotName, otherId: string): void => {
        const other = campaign.records[otherId];
        if (!other || other.deleted) return;
        (out[slot] ??= []).push({ id: other.id, name: other.name });
    };
    for (const link of Object.values(campaign.links)) {
        if (link.deleted || (link.from !== props.id && link.to !== props.id)) continue;
        const otherId = link.from === props.id ? link.to : link.from;
        if ((KINDS as readonly string[]).includes(link.kind)) add(link.kind as SlotName, otherId);
        else if (link.kind === 'owns' && link.from === props.id && campaign.records[otherId]?.type === 'item') add('items', otherId);
    }
    for (const list of Object.values(out)) list.sort((a, b) => a.name.localeCompare(b.name));
    return out;
});

function openLink(id: string): void {
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: id }));
}
</script>

<template>
  <template v-if="record">
    <!-- A Character stands in the sheet's place: its name, who owns it, who else is here, and Detach. -->
    <template v-if="characterId">
      <section class="psheet-char" aria-label="Character">
        <div class="psheet-char-head">
          <Icon name="user" :size="13" />
          <b class="psheet-char-name">{{ handle && handle.character ? handle.character.name : 'A Character' }}</b>
          <span v-if="handle" class="psheet-char-owner">{{ ownerWords(handle) }}</span>
          <span v-if="handle && statusWords(handle.status)" class="psheet-char-status" :class="'is-' + handle.status" role="status">{{ statusWords(handle.status) }}</span>
          <span v-else-if="handle" class="psheet-char-status is-live" role="status"><i aria-hidden="true"></i>Live</span>
          <button type="button" class="ui-btn psheet-detach" :disabled="readOnly" title="Keep a copy of the sheet on this person and let the Character go" @click="detach">Detach</button>
        </div>
        <ul v-if="others.length" class="psheet-who" aria-label="Also on this sheet">
          <li v-for="person in others" :key="person.id" :style="{ '--psheet-tone': 'var(' + (source ? source.tone(person.colour) : '--attention') + ')' }">
            <i aria-hidden="true"></i>{{ person.name }}<span v-if="person.field"> · in {{ person.field }}</span>
          </li>
        </ul>
        <p v-if="!source" class="psheet-note">Characters are not available in this build. The reference is kept.</p>
        <p v-else-if="handle && handle.status === 'gone'" class="psheet-note">This Character is no longer shared with you. Detach to keep a copy of the sheet as you last saw it.</p>
      </section>
      <CharacterSheet
        v-if="liveDoc && handle"
        :doc="liveDoc"
        :editable="liveEditable"
        :presence="livePresence"
        :homeworld="home"
        :links="links"
        :folded="folded"
        @change="(name, value) => handle && handle.setField(name, value)"
        @enter="(name) => handle && handle.focusField(name)"
        @leave="() => handle && handle.focusField(null)"
        @homeworld="onHomeworld"
        @open-link="openLink"
      />
    </template>
    <CharacterSheet
      v-else-if="doc"
      :doc="doc"
      :editable="!readOnly"
      :homeworld="home"
      :links="links"
      :folded="folded"
      @change="change"
      @homeworld="onHomeworld"
      @open-link="openLink"
    />
    <section v-else class="sheet psheet-none">
      <h3 class="ui-heading">Character sheet</h3>
      <div class="psheet-empty">
        <p>No character sheet yet.</p>
        <p class="psheet-note">The sheet is the official character sheet’s boxes. It stores what you type and works nothing out.</p>
        <div class="psheet-choices">
          <button type="button" class="ui-btn is-primary" :disabled="readOnly" title="A sheet kept on this person, in this game" @click="start"><Icon name="plus" :size="12" />Start a character sheet</button>
          <template v-if="source">
            <button type="button" class="ui-btn" :disabled="readOnly || making" title="A Character of your own, which can be shared and used in other games, shown here" @click="makeCharacter">Make this a Character</button>
            <button type="button" class="ui-btn" :disabled="readOnly" :aria-expanded="picking ? 'true' : 'false'" title="Show one of your Characters, or one shared with you, on this person" @click="openPicker">Attach one of mine</button>
          </template>
        </div>
        <div v-if="picking" ref="pickEl" class="psheet-pick" role="group" aria-label="Your Characters" @keydown.esc.stop="picking = false">
          <p v-if="!mine.length" class="psheet-note">You have no Characters yet.</p>
          <ul v-else>
            <li v-for="item in mine" :key="item.character.id">
              <button type="button" class="psheet-pick-row" @click="attach(item.character.id)">
                <b>{{ item.character.name }}</b>
                <span>{{ item.role === 'owner' ? 'Yours' : 'Shared by ' + item.ownerName }}</span>
              </button>
            </li>
          </ul>
        </div>
      </div>
    </section>
    <section v-if="kept" class="psheet-kept" aria-label="What this person’s sheet already held">
      <h4>What this person’s sheet already held</h4>
      <pre>{{ kept }}</pre>
      <p class="psheet-note">Kept as it is, beside the character sheet.</p>
    </section>
  </template>
</template>

<style>
.psheet-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 10px;
  padding: 16px;
  background: var(--panel-raised);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}

.psheet-empty p {
  margin: 0;
}

.psheet-choices {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

/* "Attach one of mine": the list, under the choices, in the panel's own rows. */
.psheet-pick {
  align-self: stretch;
  max-height: 220px;
  overflow-y: auto;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
}

.psheet-pick ul {
  margin: 0;
  padding: 0;
  list-style: none;
}

.psheet-pick .psheet-note {
  padding: 8px 10px;
}

.psheet-pick-row {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 10px;
  width: 100%;
  margin: 0;
  padding: 7px 10px;
  border: 0;
  border-bottom: 1px solid var(--line-soft);
  background: transparent;
  color: var(--text-0);
  font: 500 13px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.psheet-pick-row:hover {
  background: var(--row-active);
}

.psheet-pick-row:focus-visible {
  outline-offset: -2px;
}

.psheet-pick-row span {
  color: var(--text-muted);
  font-size: 12px;
}

/* An attached Character: its name, whose it is, the connection, and Detach. */
.psheet-char {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-bottom: 10px;
  padding: 8px 10px 8px 12px;
  border-left: 3px solid var(--signal);
  background: var(--panel-raised);
}

.psheet-char-head {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px 10px;
}

.psheet-char-name {
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font: 700 14px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.psheet-char-owner {
  color: var(--text-muted);
  font: 500 12px/1.4 var(--font-text);
  letter-spacing: 0;
  text-transform: none;
}

.psheet-char-status {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  color: var(--attention);
  font: 600 12px/1.4 var(--font-text);
}

.psheet-char-status.is-live {
  color: var(--signal);
}

.psheet-char-status.is-live i {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--signal);
}

.psheet-detach {
  margin-left: auto;
}

/* Who else is on the sheet: a name each, with the colour that marks their box. The name says it; the colour only helps. */
.psheet-who {
  display: flex;
  flex-wrap: wrap;
  gap: 4px 12px;
  margin: 0;
  padding: 0;
  color: var(--text-1);
  font: 500 12px/1.4 var(--font-text);
  list-style: none;
}

.psheet-who li {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.psheet-who i {
  width: 8px;
  height: 8px;
  border: 2px dashed var(--psheet-tone, var(--attention));
  border-radius: 2px;
}

.psheet-who span {
  color: var(--text-muted);
}

.psheet-note {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

.psheet-kept {
  margin-top: 10px;
  padding: 10px 12px;
  border: 1px dashed var(--line-2);
  border-radius: var(--r-2);
}

.psheet-kept h4 {
  margin: 0 0 4px;
  color: var(--text-muted);
  font: 700 12px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.psheet-kept pre {
  max-height: 200px;
  margin: 0 0 6px;
  overflow: auto;
  color: var(--text-1);
  font: 400 12.5px/1.5 var(--font-code);
  white-space: pre-wrap;
}
</style>
