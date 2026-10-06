<script setup lang="ts">
/**
 * A record's connections (design §3): its links grouped by kind and worded from its side,
 * each a chip that opens the other record, with the role (editable) and a remove mark; "Add
 * a connection" picks the other record, then the kind from the shared vocabulary, then an
 * optional role. A vessel also lists who is aboard it (an anchor, not a link).
 */
import { computed, nextTick, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import type { CampaignRecord } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { atPane } from '../shell/pane.ts';
import { addLink, removeLink, setLinkRole } from './actions.ts';
import { alreadyLinked, connectionsOf, groupConnections, kindChoices, recordsAboard, ROLE_MAX, type KindChoice } from './links.ts';
import RecordPicker from './RecordPicker.vue';
import { typeInfo } from './records.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const route = useRoute();
const router = useRouter();
const rootEl = ref<HTMLElement | null>(null);
const addBtn = ref<HTMLElement | null>(null);

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted ? found : null;
});
const connections = computed(() => {
    // The index is rebuilt on every change; these reads make the list follow it.
    void Object.keys(campaign.links).length;
    void campaign.seq;
    return record.value ? connectionsOf(props.id, campaign.records, campaign.links) : [];
});
const groups = computed(() => groupConnections(connections.value));
const aboard = computed(() => (record.value ? recordsAboard(props.id, campaign.records) : []));
const info = (other: CampaignRecord) => typeInfo(other.type);

/** A record's page is on this panel's route; the map's camera in the address stays. */
function open(other: CampaignRecord): void {
    void router.push(atPane(route.path, route.query, { kind: 'campaign', record: other.id }));
}

// ---- The role, edited where it stands ------------------------------------------

const roleEditing = ref<string | null>(null);
const roleDraft = ref('');

function editRole(linkId: string, role: string): void {
    if (props.readOnly) return;
    roleEditing.value = linkId;
    roleDraft.value = role;
    void nextTick(() => {
        const el = rootEl.value ? rootEl.value.querySelector<HTMLInputElement>('.lnk-role-field') : null;
        if (el) {
            el.focus();
            el.select();
        }
    });
}

function saveRole(): void {
    const linkId = roleEditing.value;
    roleEditing.value = null;
    if (linkId) setLinkRole(linkId, roleDraft.value);
}

function onRoleKey(event: KeyboardEvent): void {
    if (event.key === 'Enter') {
        event.preventDefault();
        event.stopPropagation();
        saveRole();
        return;
    }
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        roleEditing.value = null;
        return;
    }
    event.stopPropagation();
}

function remove(linkId: string): void {
    if (props.readOnly) return;
    removeLink(linkId);
}

// ---- Adding one -------------------------------------------------------------------

const adding = ref(false);
const other = ref<CampaignRecord | null>(null);
const choice = ref<KindChoice | null>(null);
const role = ref('');

const choices = computed(() => (record.value && other.value ? kindChoices(record.value.type, other.value.type) : []));
/** The choice held is a copy (a ref wraps what it is given), so it is matched by its words, not by identity. */
const chosen = (item: KindChoice): boolean => !!choice.value && choice.value.kind === item.kind && choice.value.outward === item.outward;
const duplicate = computed(() => !!other.value && !!choice.value && alreadyLinked(connections.value, other.value.id, choice.value.kind));

function startAdd(): void {
    if (props.readOnly) return;
    other.value = null;
    choice.value = null;
    role.value = '';
    adding.value = true;
}

function picked(found: CampaignRecord): void {
    other.value = found;
    choice.value = choices.value[0] ?? null;
    void nextTick(() => {
        const root = rootEl.value;
        const el = root ? root.querySelector<HTMLElement>('.lnk-kinds [role="radio"][aria-checked="true"]') ?? root.querySelector<HTMLElement>('.lnk-again') : null;
        if (el) el.focus();
    });
}

function cancelAdd(): void {
    if (!adding.value) return;
    adding.value = false;
    other.value = null;
    void nextTick(() => { if (addBtn.value) addBtn.value.focus(); });
}

function finishAdd(): void {
    if (!record.value || !other.value || !choice.value || duplicate.value || props.readOnly) return;
    addLink(props.id, other.value.id, choice.value, role.value);
    cancelAdd();
}

function onAddKey(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        cancelAdd();
    }
}

/** Up and Down walk the kinds and choose, as a radio group's keys do. */
function onKindKey(event: KeyboardEvent): void {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    const list = event.currentTarget as HTMLElement;
    const items = Array.from(list.querySelectorAll<HTMLElement>('[role="radio"]'));
    const at = items.indexOf(event.target as HTMLElement);
    if (at < 0) return;
    event.preventDefault();
    event.stopPropagation();
    const next = items[(at + (event.key === 'ArrowDown' ? 1 : items.length - 1)) % items.length];
    if (next) {
        next.focus();
        next.click();
    }
}

watch(() => props.id, () => {
    adding.value = false;
    other.value = null;
    roleEditing.value = null;
});
</script>

<template>
  <section v-if="record" ref="rootEl" class="lnk" :data-adding="adding ? 'true' : 'false'">
    <div class="lnk-head">
      <h3 class="ui-heading">Connections <span v-if="connections.length" class="ui-count">{{ connections.length }}</span></h3>
      <button v-if="!adding" ref="addBtn" type="button" class="ui-btn lnk-add" :disabled="readOnly" @click="startAdd">
        <Icon name="plus" :size="12" />Add a connection
      </button>
    </div>

    <div v-if="adding" class="lnk-edit" @keydown="onAddKey">
      <div class="lnk-step">
        <h4>Who or what</h4>
        <p v-if="other" class="lnk-picked">
          <Icon :name="info(other).icon" :size="13" />
          <span><b>{{ other.name }}</b> {{ info(other).one }}</span>
          <button type="button" class="ui-btn lnk-again" @click="other = null">Pick another</button>
        </p>
        <RecordPicker v-else :exclude="id" placeholder="Search your records" none="No other records yet. Add one first." @pick="picked" @cancel="cancelAdd" />
      </div>
      <div v-if="other" class="lnk-step">
        <h4>How</h4>
        <p v-if="!choices.length" class="lnk-hint">The vocabulary has no kind of connection from {{ info(record).a }} to {{ info(other).a }}.</p>
        <div v-else class="lnk-kinds" role="radiogroup" aria-label="Kind of connection" @keydown="onKindKey">
          <button
            v-for="item in choices"
            :key="item.kind + (item.outward ? '>' : '<')"
            type="button"
            role="radio"
            class="lnk-kind"
            :aria-checked="chosen(item) ? 'true' : 'false'"
            @click="choice = item"
          >
            <b>{{ item.label }}</b>
            <span>{{ other.name }}</span>
          </button>
        </div>
        <p v-if="duplicate" class="lnk-hint" role="status">That connection is already there.</p>
        <label v-if="choices.length" class="lnk-role-label">
          <span>Role <em>optional</em></span>
          <input v-model="role" class="lnk-input" type="text" :maxlength="ROLE_MAX" placeholder="Master, Sponsor, Cook…" @keydown.stop @keydown.enter.prevent="finishAdd">
        </label>
      </div>
      <div class="lnk-foot">
        <button type="button" class="ui-btn is-primary lnk-save" :disabled="!other || !choice || duplicate || readOnly" @click="finishAdd">
          <Icon name="check" :size="12" />Add
        </button>
        <span class="rec-gap"></span>
        <button type="button" class="ui-btn lnk-cancel" @click="cancelAdd">Cancel</button>
      </div>
    </div>

    <p v-if="!groups.length && !aboard.length && !adding" class="lnk-none">No connections yet.</p>
    <div v-for="group in groups" :key="group.label" class="lnk-group">
      <h4>{{ group.label }}</h4>
      <div class="lnk-chips">
        <span v-for="item in group.items" :key="item.link.id" class="lnk-chip" :data-id="item.link.id">
          <button type="button" class="lnk-open" :title="'Open ' + item.other.name" @click="open(item.other)">
            <Icon :name="info(item.other).icon" :size="12" />{{ item.other.name }}
          </button>
          <input
            v-if="roleEditing === item.link.id"
            v-model="roleDraft"
            class="lnk-role-field"
            type="text"
            aria-label="Role"
            :maxlength="ROLE_MAX"
            @keydown="onRoleKey"
            @blur="saveRole"
          >
          <button
            v-else
            type="button"
            class="lnk-role"
            :class="{ 'is-empty': !item.link.role }"
            :disabled="readOnly"
            :title="item.link.role ? 'Change the role' : 'Add a role'"
            @click="editRole(item.link.id, item.link.role)"
          >{{ item.link.role || 'role' }}</button>
          <button type="button" class="lnk-x" :aria-label="'Remove the connection to ' + item.other.name" title="Remove" :disabled="readOnly" @click="remove(item.link.id)">
            <Icon name="xmark" :size="10" />
          </button>
        </span>
      </div>
    </div>
    <div v-if="aboard.length" class="lnk-group">
      <h4>Aboard</h4>
      <div class="lnk-chips">
        <span v-for="item in aboard" :key="item.id" class="lnk-chip is-aboard">
          <button type="button" class="lnk-open" :title="'Open ' + item.name" @click="open(item)">
            <Icon :name="info(item).icon" :size="12" />{{ item.name }}
          </button>
        </span>
      </div>
    </div>
  </section>
</template>

<style>
.lnk-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.lnk-head .ui-heading {
  flex: 1 1 auto;
  gap: 8px;
}

.lnk-head .ui-heading .ui-count {
  margin-left: 0;
}

.ui-btn.lnk-add {
  height: 28px;
  padding: 0 9px;
  font-size: 12.5px;
}

.lnk-none {
  margin: 0;
  color: var(--text-muted);
  font: 400 14px/1.45 var(--font-text);
}

.lnk-group + .lnk-group {
  margin-top: 10px;
}

.lnk-group h4 {
  margin: 0 0 5px;
  color: var(--text-muted);
  font: 600 12px/1.4 var(--font-text);
}

.lnk-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

/* A chip is the other record (a link), its role, and the remove mark. */
.lnk-chip {
  display: inline-flex;
  align-items: stretch;
  max-width: 100%;
  border: 1px solid var(--line-1);
  border-radius: var(--r-pill);
  background: var(--panel-raised);
  font: 400 12.5px/1.35 var(--font-text);
}

.lnk-chip > button {
  margin: 0;
  border: 0;
  background: transparent;
  font: inherit;
  cursor: pointer;
}

.lnk-chip > button:focus-visible {
  outline-offset: -2px;
}

.lnk-open {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
  padding: 4px 8px 4px 10px;
  border-radius: var(--r-pill) 0 0 var(--r-pill);
  color: var(--text-0);
  font-weight: 600;
  text-align: left;
}

.lnk-chip.is-aboard .lnk-open {
  padding-right: 10px;
  border-radius: var(--r-pill);
}

.lnk-open .ui-icon {
  color: var(--signal);
}

.lnk-open:hover {
  background: var(--row-active);
}

.lnk-role,
.lnk-role-field {
  padding: 4px 7px;
  border-left: 1px solid var(--line-soft);
  color: var(--text-1);
}

.lnk-role.is-empty {
  color: var(--text-muted);
  font-style: italic;
}

.lnk-role:not(:disabled):hover {
  background: var(--row-active);
  color: var(--text-0);
}

.lnk-role-field {
  width: 110px;
  margin: 0;
  border: 0;
  border-left: 1px solid var(--line-soft);
  background: var(--bg-2);
  color: var(--text-0);
  font: inherit;
}

.lnk-role-field:focus-visible {
  outline: none;
  box-shadow: inset 0 0 0 1px var(--signal);
}

.lnk-x {
  display: inline-flex;
  align-items: center;
  padding: 0 8px 0 6px;
  border-radius: 0 var(--r-pill) var(--r-pill) 0;
  color: var(--text-muted);
}

.lnk-x:not(:disabled):hover {
  color: var(--text-0);
}

/* Adding one: the steps stand under the heading. */
.lnk-edit {
  margin-bottom: 12px;
  padding: 12px;
  border: 1px solid var(--signal-line);
  border-radius: var(--r-3);
  background: var(--panel-raised);
}

.lnk-step + .lnk-step {
  margin-top: 14px;
}

.lnk-step h4 {
  margin: 0 0 6px;
  color: var(--text-1);
  font: 700 12.5px/1.4 var(--font-text);
}

.lnk-hint {
  margin: 6px 0 0;
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

.lnk-picked {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  color: var(--text-muted);
  font: 400 13px/1.45 var(--font-text);
}

.lnk-picked .ui-icon {
  color: var(--signal);
}

.lnk-picked span {
  flex: 1 1 auto;
  min-width: 0;
}

.lnk-picked b {
  margin-right: 6px;
  color: var(--text-0);
  font-weight: 600;
  font-size: 14px;
}

.lnk-kinds {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.lnk-kind {
  display: flex;
  align-items: baseline;
  gap: 8px;
  margin: 0;
  padding: 6px 10px;
  border: 1px solid var(--line-1);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-muted);
  font: 400 13px/1.4 var(--font-text);
  text-align: left;
  cursor: pointer;
}

.lnk-kind b {
  color: var(--text-0);
  font-weight: 600;
}

.lnk-kind:hover {
  border-color: var(--signal-dim);
}

.lnk-kind[aria-checked="true"] {
  border-color: var(--signal);
  background: var(--row-active);
  color: var(--text-1);
}

.lnk-role-label {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 10px;
  color: var(--text-1);
  font: 600 12.5px/1.4 var(--font-text);
}

.lnk-role-label em {
  margin-left: 4px;
  color: var(--text-muted);
  font-style: normal;
  font-weight: 400;
}

.lnk-input {
  flex: 1 1 auto;
  min-width: 0;
  margin: 0;
  padding: 5px 9px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-0);
  font: 400 13px/1.4 var(--font-text);
}

.lnk-input:focus-visible {
  outline: none;
  border-color: var(--signal);
}

.lnk-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 14px;
}
</style>
