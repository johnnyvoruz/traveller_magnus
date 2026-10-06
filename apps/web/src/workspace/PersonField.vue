<script setup lang="ts">
/**
 * A person in a ship sheet field (slice 2 follow-up 9). Holding no one, it is the field's
 * plain text input with a + beside it offering "Existing person" (the campaign's people,
 * through the record picker) or "New person" (made from the field's text, then linked).
 * Holding someone, it is a pill: the name opens the person's card, the mark takes them out.
 * The link to the vessel (crew or passenger) is made and removed with the pill, so both
 * record pages show it. The pill's data lives with the sheet (sheet_people.ts); for the
 * Crew box, which the PDF has as one text field, the pills are the vessel's crew links.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { CampaignRecord } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { addLink, createRecord, justCreated, removeLink, saveRecord } from './actions.ts';
import { linkBetween } from './sheet_people.ts';
import { cleanName } from './records.ts';
import RecordPicker from './RecordPicker.vue';

const props = defineProps<{
    /** The vessel. */
    vesselId: string;
    /** The person held, if any. */
    person: CampaignRecord | null;
    /** The link kind the person has to the vessel. */
    kind: 'crew' | 'passenger';
    /** A name for the new person, from the field's text. */
    suggested: string;
    readOnly: boolean;
    /** The + button's accessible name says which berth. */
    label: string;
}>();

const emit = defineEmits<{
    /** A person was chosen or made; the field should hold them. */
    hold: [person: CampaignRecord];
    /** The pill's mark: the field should let them go. */
    release: [];
    /** The pill's name: show the card. */
    show: [person: CampaignRecord];
}>();

type Step = 'closed' | 'menu' | 'existing' | 'new';
const step = ref<Step>('closed');
const name = ref('');
const plusBtn = ref<HTMLElement | null>(null);
const menuEl = ref<HTMLElement | null>(null);
const nameEl = ref<HTMLInputElement | null>(null);
const pillBtn = ref<HTMLElement | null>(null);

const canMake = computed(() => cleanName(name.value).length > 0);

function openMenu(): void {
    if (props.readOnly) return;
    step.value = 'menu';
    void nextTick(() => {
        const first = menuEl.value ? menuEl.value.querySelector<HTMLElement>('button') : null;
        if (first) first.focus();
    });
}

function close(back = true): void {
    step.value = 'closed';
    if (back) void nextTick(() => { if (plusBtn.value) plusBtn.value.focus(); });
}

function chooseExisting(): void {
    step.value = 'existing';
}

function chooseNew(): void {
    name.value = props.suggested;
    step.value = 'new';
    void nextTick(() => { if (nameEl.value) { nameEl.value.focus(); nameEl.value.select(); } });
}

/** Joins the person to the vessel unless they already are, then hands them to the field. */
function take(person: CampaignRecord): void {
    if (!linkBetween(campaign.links, person.id, props.vesselId, props.kind)) {
        addLink(props.vesselId, person.id, { kind: props.kind, outward: false, label: props.kind }, '');
    }
    emit('hold', person);
    step.value = 'closed';
    // The + gives way to the pill: focus goes to the pill's name.
    void nextTick(() => { if (pillBtn.value) pillBtn.value.focus(); });
}

function picked(person: CampaignRecord): void {
    if (person.type !== 'person') return;
    take(person);
}

function make(): void {
    if (!canMake.value || props.readOnly) return;
    const id = createRecord('person');
    justCreated.value = null;
    saveRecord(id, { name: cleanName(name.value) });
    const person = campaign.records[id];
    if (person) take(person);
}

/** The pill's mark: the link goes with the person. */
function release(): void {
    if (props.readOnly || !props.person) return;
    const link = linkBetween(campaign.links, props.person.id, props.vesselId, props.kind);
    if (link) removeLink(link.id);
    emit('release');
    // The pill gives way to the field and its +: focus goes to the +.
    void nextTick(() => { if (plusBtn.value) plusBtn.value.focus(); });
}

function onMenuKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
        event.preventDefault();
        close();
        return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const items = menuEl.value ? [...menuEl.value.querySelectorAll<HTMLElement>('button')] : [];
        const at = items.indexOf(document.activeElement as HTMLElement);
        const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
        if (next) next.focus();
    }
}

function onNameKey(event: KeyboardEvent): void {
    event.stopPropagation();
    if (event.key === 'Escape') {
        event.preventDefault();
        close();
    } else if (event.key === 'Enter') {
        event.preventDefault();
        make();
    }
}

watch(() => props.readOnly, (now) => { if (now) close(false); });
</script>

<template>
  <span class="pf" :class="{ 'is-held': person !== null, 'is-open': step !== 'closed' }">
    <template v-if="person">
      <span class="lnk-chip pf-pill">
        <button ref="pillBtn" type="button" class="lnk-open pf-name" :title="'See ' + person.name" @click="emit('show', person)">
          <Icon name="user" :size="11" /><span class="pf-name-text">{{ person.name }}</span>
        </button>
        <button type="button" class="lnk-x pf-x" :aria-label="'Take ' + person.name + ' out of ' + label" title="Take out" :disabled="readOnly" @click="release">
          <Icon name="xmark" :size="11" />
        </button>
      </span>
    </template>
    <template v-else>
      <slot />
      <button
        ref="plusBtn"
        type="button"
        class="ui-btn is-icon pf-plus"
        :aria-label="'Add a person to ' + label"
        :aria-expanded="step === 'closed' ? 'false' : 'true'"
        title="A person from the campaign"
        :disabled="readOnly"
        @click="step === 'closed' ? openMenu() : close()"
      >
        <Icon name="plus" :size="11" />
      </button>
      <div v-if="step === 'menu'" ref="menuEl" class="pf-menu" role="menu" :aria-label="'Add a person to ' + label" @keydown="onMenuKey">
        <button type="button" role="menuitem" @click="chooseExisting"><Icon name="user" :size="12" />Existing person</button>
        <button type="button" role="menuitem" @click="chooseNew"><Icon name="plus" :size="12" />New person</button>
      </div>
      <div v-else-if="step === 'existing'" class="pf-pick">
        <RecordPicker :exclude="vesselId" :types="['person']" placeholder="Search your people" none="No people yet. Make one." @pick="picked" @cancel="close()" />
      </div>
      <div v-else-if="step === 'new'" class="pf-new" @keydown="onNameKey">
        <input ref="nameEl" v-model="name" type="text" class="sheet-input pf-new-name" placeholder="The person's name" aria-label="The new person's name" maxlength="120">
        <button type="button" class="ui-btn is-primary pf-make" :disabled="!canMake" @click="make">Create and add</button>
        <button type="button" class="ui-btn pf-cancel" @click="close()">Cancel</button>
      </div>
    </template>
  </span>
</template>

<style>
.pf {
  position: relative;
  display: flex;
  flex: 1 1 auto;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

/* Quiet, one to a berth: a sixteen-row column of them must not shout. Lit on hover, focus, or while open. */
.pf .pf-plus {
  flex: 0 0 auto;
  width: 24px;
  height: 24px;
  border-color: transparent;
  background: transparent;
  color: var(--text-muted);
}

.pf .pf-plus .ui-icon {
  color: inherit;
}

.pf .pf-plus:not(:disabled):hover,
.pf .pf-plus:focus-visible,
.pf .pf-plus[aria-expanded='true'] {
  border-color: var(--signal-dim);
  color: var(--signal);
}

/* The pill in the field's place: the name opens the card, the mark lets go. */
.pf-pill {
  max-width: 100%;
  border-color: var(--signal-dim);
}

.pf-name-text {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* The two choices, under the +. */
.pf-menu {
  position: absolute;
  top: calc(100% + 4px);
  right: 0;
  z-index: 5;
  display: flex;
  flex-direction: column;
  min-width: 170px;
  padding: 4px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--chrome-bg);
  box-shadow: var(--shadow-pop);
}

.pf-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 6px 10px;
  border: 0;
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-1);
  font: 500 12.5px/1.3 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.pf-menu button .ui-icon {
  color: var(--signal);
}

.pf-menu button:hover,
.pf-menu button:focus-visible {
  background: var(--row-active);
  color: var(--text-0);
  outline: none;
}

/* The picker and the new-name form take the field's whole row. */
.pf-pick,
.pf-new {
  flex: 1 1 100%;
  min-width: 0;
}

.pf-new {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.pf-new-name {
  flex: 1 1 160px;
  min-width: 0;
}

.pf.is-open {
  flex-wrap: wrap;
}
</style>
