<script setup lang="ts">
/**
 * The designer of a system made by hand (findings/builder_system_design.md §16, mockups
 * kb3_designer_*). The bodies are one list, each under what it orbits: a row has its grip,
 * its name and kind, the "orbits" picker, Move up, Move down and More. Under the list are the
 * buttons that add a body; the selected body's own fields stand beneath (column) or beside
 * (half, full), drawn from the server's form field by field. Nothing is rolled and nothing is
 * checked.
 */
import { computed, nextTick, ref, watch } from 'vue';
import type { FormField, FormValue } from '@voyage/shared';
import Icon from '../../design/Icon.vue';
import type { PanelSpan } from '../../shell/panel_state.ts';
import type { Rect } from '../pop_place.ts';
import BuildMenu, { type MenuItem } from './BuildMenu.vue';
import DesignAsk from './DesignAsk.vue';
import EditField from './EditField.vue';
import OrbitPicker from './OrbitPicker.vue';
import { canPick, openPicker, orbitPartner, pickFieldId, pickUi } from './orbit_pick.ts';
import { draftHandle, edit, markOf, messagesFor, setField } from './edit.ts';
import { fieldOwner, handList, handUi, KIND_WORD, movedWords, nodeFields, nodeTitle, orbitsValue, parentOptions, removeWords, selectNode, systemFields, type HandKind, type HandNode } from './hand.ts';
import { addBody, addWhy, canAdd, canGive, canMainworld, canMoveBody, canRemoveBody, canRollProfile, giveBody, makeMainworld, moonHost, moveBody, profileRollId, removeBody, rollNote, rollProfile } from './hand_acts.ts';

defineProps<{ span: PanelSpan }>();

const handle = computed(() => draftHandle.value);
const form = computed(() => (handle.value ? handle.value.form.value : null));
const changed = computed(() => (handle.value ? handle.value.changedByEngine.value : []));
const messages = computed(() => (handle.value ? handle.value.messages.value : []));
const nodes = computed((): HandNode[] => (form.value ? handList(form.value) : []));
const stars = computed(() => nodes.value.filter((node) => node.kind === 'star').length);
const selected = computed(() => nodes.value.find((node) => node.id === handUi.selected) ?? null);
const fields = computed(() => (form.value && selected.value ? nodeFields(form.value, selected.value) : { profile: [], rows: [] }));
const system = computed(() => (form.value ? systemFields(form.value) : []));
const host = computed(() => moonHost());
const busy = computed(() => edit.keeping);
const root = ref<HTMLElement | null>(null);
/** The server's word on the selected body's roll ("Set Type, Subtype, and Class."), as sent. */
const rollMessages = computed(() => (selected.value ? messagesFor(profileRollId(selected.value.id), messages.value).filter((item) => item.text.trim() !== '') : []));
// The roll's answer has arrived: the button is free again.
watch(() => [handle.value ? handle.value.form.value : null, messages.value] as const, () => { handUi.rolling = ''; });

/** The body the orbit picker is open for, while it is still in the list. */
const picking = computed(() => (nodes.value.some((node) => node.id === pickUi.id) ? pickUi.id : ''));

/** The body the row's More menu is open on, and where. */
const menu = ref<{ id: string; anchor: Rect; from: HTMLElement } | null>(null);
/** The row being dragged by its grip, and the row it is over. */
const dragId = ref('');
const dropId = ref('');

const ADD: { kind: HandKind; command: string }[] = [
    { kind: 'star', command: 'build-add-star' },
    { kind: 'world', command: 'build-add-world' },
    { kind: 'gas', command: 'build-add-gas' },
    { kind: 'belt', command: 'build-add-belt' },
];

// Something is always selected while there is something to select: the fields are never an empty place.
// A body just added is selected before the server's answer shows it: it is kept selected until it does.
watch(nodes, (list) => {
    const waiting = edit.added.some((item) => item.id === handUi.selected) && !list.some((node) => node.id === handUi.selected);
    if (waiting) return;
    if (list.length && !list.some((node) => node.id === handUi.selected)) selectNode(list[0].id);
    if (!list.length && handUi.selected) selectNode('');
}, { immediate: true });

function options(id: string) {
    return parentOptions(nodes.value, id);
}

/** A star's picker is shown once there is another star to give it to. */
function picks(node: HandNode): boolean {
    return node.kind !== 'star' || stars.value > 1;
}

function optionWords(option: { label: string; becomes: HandKind | null }): string {
    return option.becomes ? option.label + ' (becomes a ' + KIND_WORD[option.becomes].toLowerCase() + ')' : option.label;
}

/** The picker is as wide as what it says now, not as its longest choice, so a row keeps room for its name. */
function pickWidth(node: HandNode): string {
    const now = options(node.id).find((option) => option.value === orbitsValue(node));
    const length = Math.min(24, Math.max(6, (now ? now.label : '').length));
    return 'calc(' + length + 'ch + 30px)';
}

function mark(field: FormField) {
    return markOf(field.id, edit.mine, edit.rolled, changed.value);
}

/** A body this draft adds: the row says "New" until it is kept. */
function isNew(node: HandNode): boolean {
    return edit.added.some((item) => item.id === node.id);
}

function rowMine(node: HandNode): boolean {
    const ids = nodes.value.map((item) => item.id);
    return Object.keys(edit.mine).some((id) => fieldOwner(id, ids) === node.id && !id.endsWith('.order'));
}

function set(id: string, value: FormValue): void {
    setField(id, value);
    // On MgT2E an orbit number and its AU follow each other: one change each.
    const partner = form.value ? orbitPartner(form.value, id, value) : null;
    if (partner) setField(partner.id, partner.value);
}

function give(id: string, event: Event): void {
    giveBody(id, (event.target as HTMLSelectElement).value);
}

/** Up and Down on a row's name move the selection through the list, and focus with it. */
function step(by: -1 | 1): void {
    const at = nodes.value.findIndex((node) => node.id === handUi.selected);
    const next = nodes.value[at + by];
    if (!next) return;
    selectNode(next.id);
    void nextTick(() => {
        const el = root.value ? root.value.querySelector<HTMLElement>('.hand-row.is-selected .hand-pick') : null;
        if (el) el.focus();
    });
}

function openMenu(node: HandNode, event: MouseEvent): void {
    const el = event.currentTarget as HTMLElement;
    const box = el.getBoundingClientRect();
    selectNode(node.id);
    menu.value = { id: node.id, anchor: { left: box.left, top: box.top, right: box.right, bottom: box.bottom }, from: el };
}

const menuItems = computed((): MenuItem[] => {
    const id = menu.value ? menu.value.id : '';
    const node = nodes.value.find((item) => item.id === id);
    if (!node) return [];
    const out: MenuItem[] = [];
    if (node.kind !== 'star') {
        out.push({ id: 'mainworld', label: node.mainworld ? 'This is the mainworld' : 'Make mainworld', say: 'The map shows this world’s profile for the system', icon: 'location-dot', disabled: !canMainworld(id) });
    }
    out.push({
        id: 'remove',
        label: 'Remove ' + removeWords(nodes.value, id),
        say: 'Removed when you select Keep',
        icon: 'trash',
        danger: true,
        disabled: !canRemoveBody(id),
        rule: out.length > 0,
    });
    return out;
});

const menuTitle = computed(() => {
    const id = menu.value ? menu.value.id : '';
    const node = nodes.value.find((item) => item.id === id);
    return node ? nodeTitle(node) : '';
});

function closeMenu(): void {
    const from = menu.value ? menu.value.from : null;
    menu.value = null;
    if (from) from.focus();
}

function pickMenu(act: string): void {
    const id = menu.value ? menu.value.id : '';
    menu.value = null;
    if (act === 'mainworld') makeMainworld(id);
    else if (act === 'remove') void removeBody(id);
}

function onDrag(event: DragEvent, node: HandNode): void {
    dragId.value = node.id;
    if (event.dataTransfer) {
        event.dataTransfer.effectAllowed = 'move';
        event.dataTransfer.setData('text/plain', node.id);
    }
}

function onOver(event: DragEvent, node: HandNode): void {
    if (!dragId.value || !canGive(dragId.value, node.id)) return;
    event.preventDefault();
    dropId.value = node.id;
}

function onDrop(node: HandNode): void {
    const id = dragId.value;
    dragId.value = '';
    dropId.value = '';
    if (id && canGive(id, node.id)) giveBody(id, node.id);
}

function endDrag(): void {
    dragId.value = '';
    dropId.value = '';
}
</script>

<template>
  <div v-if="form" ref="root" class="hand" :data-span="span">
    <section class="hand-bodies" data-section="bodies">
      <h3 class="ui-heading">Bodies <span class="ui-count">{{ nodes.length }}</span></h3>
      <DesignAsk v-if="handUi.removing" remove class="hand-ask" />
      <p v-if="!nodes.length" class="hand-empty">This system has no bodies. To add a star, select Star. Then add the worlds that orbit it.</p>
      <ul v-else class="hand-list" aria-label="Bodies in this system">
        <li
          v-for="node in nodes"
          :key="node.id"
          class="hand-row"
          :class="{ 'is-selected': node.id === handUi.selected, 'is-drop': node.id === dropId, 'is-dragged': node.id === dragId, 'is-mine': rowMine(node) }"
          :style="{ '--depth': node.depth }"
          :data-body="node.id"
          @dragover="onOver($event, node)"
          @dragleave="dropId === node.id && (dropId = '')"
          @drop.prevent="onDrop(node)"
        >
          <span class="hand-grip" draggable="true" title="To change what this body orbits, drag it onto another body" aria-hidden="true" @dragstart="onDrag($event, node)" @dragend="endDrag">
            <Icon name="grip-lines" :size="11" />
          </span>
          <button
            type="button"
            class="hand-pick"
            :aria-pressed="node.id === handUi.selected ? 'true' : 'false'"
            :title="'Show the fields for ' + nodeTitle(node)"
            @click="selectNode(node.id)"
            @keydown.up.prevent="step(-1)"
            @keydown.down.prevent="step(1)"
          >
            <i class="hand-dot" :data-kind="node.kind" aria-hidden="true"></i>
            <span class="hand-name">
              <b :class="{ 'is-none': !node.name.trim() }">{{ nodeTitle(node) }}</b>
              <small>{{ KIND_WORD[node.kind] }}<span v-if="node.mainworld" class="build-tag hand-main">Mainworld</span><em v-if="isNew(node)"> · New</em><em v-else-if="movedWords(node, nodes, edit.mine, edit.baseline)"> · {{ movedWords(node, nodes, edit.mine, edit.baseline) }}</em></small>
            </span>
          </button>
          <label v-if="picks(node)" class="hand-orbits">
            <span>orbits</span>
            <select :value="orbitsValue(node)" :style="{ width: pickWidth(node) }" :disabled="busy" :aria-label="'What ' + nodeTitle(node) + ' orbits'" @change="give(node.id, $event)">
              <option v-for="option in options(node.id)" :key="option.value" :value="option.value" :disabled="option.why !== ''" :title="option.why">{{ optionWords(option) }}</option>
            </select>
          </label>
          <button type="button" class="ui-btn is-icon hand-step is-up" data-command="build-body-up" :disabled="!canMoveBody(node.id, -1)" :aria-label="'Move ' + nodeTitle(node) + ' up'" title="Move up" @click="moveBody(node.id, -1)">
            <Icon name="chevron-left" :size="11" />
          </button>
          <button type="button" class="ui-btn is-icon hand-step is-down" data-command="build-body-down" :disabled="!canMoveBody(node.id, 1)" :aria-label="'Move ' + nodeTitle(node) + ' down'" title="Move down" @click="moveBody(node.id, 1)">
            <Icon name="chevron-right" :size="11" />
          </button>
          <button
            type="button"
            class="ui-btn is-icon"
            data-command="build-body-remove"
            :aria-label="'More actions for ' + nodeTitle(node)"
            title="More"
            aria-haspopup="true"
            :aria-expanded="menu && menu.id === node.id ? 'true' : 'false'"
            :disabled="busy"
            @click="openMenu(node, $event)"
          >
            <Icon name="ellipsis-vertical" :size="13" />
          </button>
        </li>
      </ul>
      <div class="hand-add" role="group" aria-label="Add a body">
        <button v-for="item in ADD" :key="item.kind" type="button" class="ui-btn" :data-command="item.command" :disabled="!canAdd(item.kind)" :title="addWhy(item.kind) || 'Adds a body to the draft. To save it, select Keep'" @click="addBody(item.kind)">
          <Icon name="plus" :size="12" />Add {{ KIND_WORD[item.kind].toLowerCase() }}
        </button>
        <button type="button" class="ui-btn" data-command="build-add-moon" :disabled="!canAdd('moon')" :title="addWhy('moon') || 'Adds a body to the draft. To save it, select Keep'" @click="addBody('moon')">
          <Icon name="plus" :size="12" />Add moon<span v-if="host" class="hand-add-to"> to {{ nodeTitle(host) }}</span>
        </button>
      </div>
      <p class="build-fine hand-fine">Added and removed bodies are saved when you select Keep. To undo every change in the draft, select Discard.</p>
    </section>

    <section v-if="selected" class="hand-body" data-section="body">
      <h3 class="ui-heading">{{ nodeTitle(selected) }} <span class="build-tag is-chart">{{ KIND_WORD[selected.kind] }}</span></h3>
      <div class="sysed-group">
        <template v-for="field in fields.rows" :key="field.id">
          <EditField
            :field="field"
            :mark="mark(field)"
            :was="edit.baseline[field.id]"
            :locked="false"
            :why="''"
            :messages="messagesFor(field.id, messages)"
            :busy="busy"
            :resync="edit.resync"
            @set="set(field.id, $event)"
          />
          <!-- "Pick orbit" stands after the orbit box it fills; the box stays typeable. -->
          <div v-if="form && field.id === pickFieldId(form, selected, nodes) && canPick(form, selected, nodes)" class="hand-pick-row">
            <button type="button" class="ui-btn" data-command="build-body-orbit" :disabled="busy" :title="'Pick the orbit of ' + nodeTitle(selected) + ' on a picture of the system'" @click="openPicker(selected.id)">
              <Icon name="location-crosshairs" :size="12" />Pick orbit
            </button>
          </div>
          <!-- What it orbits stands after its name, as the row's own picker has it. -->
          <div v-if="field.id === selected.id + '.name' && picks(selected)" class="ef hand-orbits-row">
            <label class="ef-label" :for="'hand-orbits-' + selected.id">Orbits</label>
            <div class="ef-control">
              <select :id="'hand-orbits-' + selected.id" class="ef-box" :value="orbitsValue(selected)" :disabled="busy" @change="give(selected.id, $event)">
                <option v-for="option in options(selected.id)" :key="option.value" :value="option.value" :disabled="option.why !== ''" :title="option.why">{{ optionWords(option) }}</option>
              </select>
            </div>
          </div>
        </template>
      </div>
      <template v-if="fields.profile.length">
        <div class="hand-profile-head">
          <h3 class="ui-heading">Profile</h3>
          <button
            v-if="selected.kind !== 'star'"
            type="button"
            class="ui-btn is-icon"
            data-command="build-body-roll"
            aria-label="Roll profile"
            title="Roll profile"
            :disabled="!canRollProfile(selected.id)"
            :aria-busy="handUi.rolling === selected.id ? 'true' : undefined"
            @click="rollProfile(selected.id)"
          >
            <Icon name="wand-magic-sparkles" :size="13" />
          </button>
        </div>
        <p v-if="rollNote(selected.id).text" class="build-fine hand-roll-note">{{ rollNote(selected.id).text }}</p>
        <p v-for="(message, index) in rollMessages" :key="'roll' + index" class="sysed-strip">{{ message.text }}</p>
        <div class="sysed-cells">
          <EditField
            v-for="field in fields.profile"
            :key="field.id"
            cell
            :field="field"
            :mark="mark(field)"
            :was="edit.baseline[field.id]"
            :locked="false"
            :why="''"
            :messages="[]"
            :busy="busy"
            :resync="edit.resync"
            @set="set(field.id, $event)"
          />
        </div>
        <template v-for="field in fields.profile" :key="'m' + field.id">
          <p v-for="(message, index) in messagesFor(field.id, messages)" :key="field.id + index" class="sysed-strip" :class="{ 'is-error': message.holds }">{{ field.label }}: {{ message.text }}</p>
        </template>
      </template>
      <p class="build-fine hand-fine">A field you leave blank stays blank. Nothing is rolled unless you select Roll profile, nothing is checked, and no other field changes when you type.</p>
    </section>

    <section class="hand-system" data-section="system">
      <h3 class="ui-heading">System</h3>
      <div class="sysed-group">
        <EditField
          v-for="field in system"
          :key="field.id"
          :field="field"
          :mark="mark(field)"
          :was="edit.baseline[field.id]"
          :locked="false"
          :why="''"
          :messages="messagesFor(field.id, messages)"
          :busy="busy"
          :resync="edit.resync"
          @set="set(field.id, $event)"
        />
      </div>
    </section>
    <OrbitPicker v-if="picking" :body="picking" />
    <BuildMenu v-if="menu" :title="menuTitle" :items="menuItems" :anchor="menu.anchor" @pick="pickMenu" @close="closeMenu" />
  </div>
</template>

<style>
.hand > section > .ui-heading:first-child {
  margin-top: 0;
}

.hand > section + section {
  margin-top: 18px;
}

/* Half: the bodies on the left, the selected body and the system on the right. Full: three columns. */
.hand:is([data-span="half"], [data-span="full"]) {
  display: grid;
  grid-template-columns: minmax(0, 1.1fr) minmax(0, 1fr);
  gap: 0 26px;
  align-items: start;
}

.hand[data-span="full"] {
  grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr) minmax(0, 1fr);
}

.hand:is([data-span="half"], [data-span="full"]) > section + section {
  margin-top: 0;
}

.hand:is([data-span="half"], [data-span="full"]) > .hand-bodies {
  grid-row: 1 / span 2;
}

.hand[data-span="half"] > .hand-system {
  grid-column: 2;
  margin-top: 18px;
}

.hand-empty {
  margin: 0 0 10px;
  color: var(--text-muted);
  font: 400 13.5px/1.5 var(--font-text);
}

.hand-list {
  margin: 0;
  padding: 0;
  overflow: hidden;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  list-style: none;
}

/* One row: grip, name and kind, the mainworld tag, the picker, up, down, more. Indented by how far in it orbits. */
.hand-row {
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr) auto auto auto auto;
  align-items: center;
  gap: 4px 6px;
  min-height: 46px;
  padding: 4px 6px 4px calc(6px + var(--depth, 0) * 20px);
  border-left: 2px solid transparent;
}

.hand-row + .hand-row {
  border-top: 1px solid var(--line-soft);
}

.hand-row.is-selected {
  border-left-color: var(--signal);
  background: var(--row-active);
}

.hand-row.is-drop {
  outline: 2px dashed var(--attention);
  outline-offset: -2px;
}

.hand-row.is-dragged {
  opacity: 0.55;
}

.hand-grip {
  display: grid;
  place-items: center;
  height: 28px;
  color: var(--text-muted);
  cursor: grab;
}

.hand-pick {
  display: flex;
  align-items: center;
  gap: 9px;
  min-width: 0;
  margin: 0;
  padding: 3px 4px;
  border: 0;
  border-radius: var(--r-2);
  background: none;
  color: var(--text-0);
  font: inherit;
  text-align: left;
  cursor: pointer;
}

.hand-dot {
  flex: 0 0 14px;
  width: 14px;
  height: 14px;
  border-radius: var(--r-pill);
  background: var(--signal);
}

.hand-dot[data-kind="star"] {
  flex-basis: 18px;
  width: 18px;
  height: 18px;
  background: var(--attention);
}

.hand-dot[data-kind="moon"] {
  flex-basis: 10px;
  width: 10px;
  height: 10px;
  background: var(--text-faint);
}

.hand-dot[data-kind="gas"] {
  background: var(--signal-dim);
}

.hand-dot[data-kind="belt"] {
  border: 2px dotted var(--text-faint);
  background: none;
}

.hand-name {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.hand-name b {
  overflow: hidden;
  color: var(--text-0);
  font: 600 13.5px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hand-name b.is-none {
  color: var(--text-muted);
  font-weight: 400;
}

.hand-name small {
  overflow: hidden;
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.hand-name em {
  color: var(--signal);
  font-style: normal;
}

/* Filled, as the dossier's own Mainworld mark: a wash would not hold 7:1 on the selected row. */
.hand-main {
  margin-left: 6px;
  padding: 0 6px;
  background: var(--signal);
  color: var(--on-signal);
  font-size: 9.5px;
}

.hand-row.is-mine .hand-name b::after {
  content: '';
  display: inline-block;
  width: 6px;
  height: 6px;
  margin-left: 6px;
  border-radius: var(--r-pill);
  background: var(--signal);
  vertical-align: 1px;
}

.hand-orbits {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  color: var(--text-muted);
  font: 400 12px/1.3 var(--font-text);
}

.hand-orbits select {
  max-width: 100%;
  height: 28px;
  margin: 0;
  padding: 0 4px 0 7px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 600 12.5px/1.2 var(--font-text);
}

/* Up and down are the one chevron, turned. */
.hand-step.is-up .ui-icon,
.hand-step.is-down .ui-icon {
  transform: rotate(90deg);
}

/* Column and half, where the list is narrow: the picker drops to the row's second line, so the name keeps the first. */
.hand:is([data-span="column"], [data-span="half"]) .hand-orbits {
  grid-column: 2 / 3;
  grid-row: 2;
  justify-self: start;
  padding-left: 27px;
}

.hand-add {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 10px;
}

.hand-profile-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}

.hand-profile-head .ui-heading {
  margin-bottom: 0;
}

.hand-roll-note {
  margin: 4px 0 8px;
}

.hand-pick-row {
  display: flex;
  justify-content: flex-end;
  margin: -4px 0 10px;
}

.hand-fine {
  margin-top: 10px;
}

/* The remove ask stands in the list's own column, above the rows. */
.hand-ask {
  margin: 0 0 10px;
}

.hand-orbits-row select {
  width: auto;
  max-width: 220px;
}
</style>
