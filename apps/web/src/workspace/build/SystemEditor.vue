<script setup lang="ts">
/**
 * The system editor, in the dossier's place (findings/builder_system_design.md §3). It draws
 * the server's edit form, section by section and field by field, and knows no field by name:
 * a field the server adds appears here without a change to this file. Two things are read
 * from a field's id, as the form's note documents them: which star, world or moon it belongs
 * to (so each gets its own block), and the section called `profile` is laid out as a row of
 * cells. Nothing is checked: the seven rule places are present and empty.
 */
import { computed } from 'vue';
import type { EditForm, FormValue } from '@voyage/shared';
import type { PanelSpan } from '../../shell/panel_state.ts';
import EditField from './EditField.vue';
import HandDesigner from './HandDesigner.vue';
import {
    edit, firstLine, groupFields, groupTitle, keepMine, leaveDiscarding, leaveKeeping, looseMessages, markOf, messagesFor, moreLines, rollField, rulesAfter,
    setField, stay, takeTheirs, whyOf, draftHandle,
} from './edit.ts';

defineProps<{ span: PanelSpan }>();

const handle = computed(() => draftHandle.value);
const form = computed((): EditForm | null => (handle.value ? handle.value.form.value : null));
const changed = computed(() => (handle.value ? handle.value.changedByEngine.value : []));
const messages = computed(() => (handle.value ? handle.value.messages.value : []));
/** Keep lost a race: a newer copy is stored. Either its row came back, or its tree is no longer the one this draft names. */
const conflict = computed(() => handle.value !== null && (handle.value.conflict.value !== null || handle.value.replaced.value));
const dropped = computed(() => (handle.value ? handle.value.dropped.value : []));
/** The sections drawn as sections; the rule places are drawn where they belong. */
const sections = computed(() => (form.value ? form.value.sections.filter((section) => section.id !== 'rules').map((section) => ({
    id: section.id,
    label: section.label,
    groups: groupFields(section),
    rules: form.value ? rulesAfter(form.value, section.id) : [],
})) : []));
/** The rule places of a hand-designed system: the form's own `rules` section, whatever it holds. */
const handRules = computed(() => (form.value ? (form.value.sections.find((section) => section.id === 'rules')?.fields ?? []) : []));
/** By hand, the server's word on a remove ("Removing this star also removes 4 bodies.") is said by the remove's own ask, and on a profile roll under the Profile heading: not again at the top. */
const loose = computed(() => (form.value ? looseMessages(form.value, messages.value).filter((item) => !(edit.mode === 'hand' && item.id !== null && (item.id.endsWith('.remove') || item.id.endsWith('.profile.roll')))) : []));
/** A whole body can be rolled again where the form's owner is a world: `body.<n>`. */
const rollable = (owner: string): boolean => /^body\.\d+$/.test(owner);
const busy = computed(() => edit.keeping);

function set(id: string, value: FormValue): void {
    setField(id, value);
}
</script>

<template>
  <div v-if="form" class="sysed" :class="{ 'is-hand': edit.mode === 'hand' }" :data-span="span">
    <div class="sysed-top">
      <div v-if="edit.leaving" class="sysed-strip" role="alertdialog" aria-label="Unsaved changes">
        <p>You have unsaved changes to {{ edit.name || 'this system' }}.</p>
        <div class="sysed-strip-acts">
          <button type="button" class="ui-btn is-primary" :disabled="busy" @click="leaveKeeping()">{{ edit.leaving.going ? 'Keep and leave' : 'Keep' }}</button>
          <button type="button" class="ui-btn" :disabled="busy" @click="leaveDiscarding()">{{ edit.leaving.going ? 'Discard and leave' : 'Discard' }}</button>
          <button type="button" class="ui-btn" data-edit-stay @click="stay()">{{ edit.leaving.going ? 'Stay' : 'Keep editing' }}</button>
        </div>
      </div>
      <div v-if="conflict" class="sysed-strip is-conflict" role="alert">
        <p>A newer version of this system was saved after you opened it. Your changes are still here, and they aren’t saved. To continue, select Take theirs or Keep mine.</p>
        <div class="sysed-strip-acts">
          <button type="button" class="ui-btn" title="Discards your changes and opens the latest saved version" @click="takeTheirs()">Take theirs</button>
          <button type="button" class="ui-btn is-primary" title="Applies your changes to the latest saved version. They’re saved when you select Keep" @click="keepMine()">Keep mine</button>
        </div>
      </div>
      <p v-if="dropped.length" class="sysed-strip is-note" role="status">
        Your changes are applied to the latest saved version. To save them, select Keep. These fields no longer exist and were left out: {{ dropped.map((item) => item.label || item.id).join(', ') }}.
      </p>
      <p v-if="edit.error" class="sysed-strip is-error" role="alert">{{ edit.error }}</p>
      <p v-for="(message, index) in loose" :key="index" class="sysed-strip" :class="{ 'is-error': message.holds }" role="status">{{ message.text }}</p>
    </div>

    <HandDesigner v-if="edit.mode === 'hand'" :span="span" />
    <template v-else>
    <section v-for="section in sections" :key="section.id" class="sysed-section" :data-section="section.id">
      <h3 class="ui-heading">{{ section.label }}</h3>
      <template v-for="group in section.groups" :key="group.owner || section.id">
        <div v-if="!group.owner && section.id === 'profile'" class="sysed-cells">
          <EditField
            v-for="field in group.fields"
            :key="field.id"
            cell
            :field="field"
            :mark="markOf(field.id, edit.mine, edit.rolled, changed)"
            :was="edit.baseline[field.id]"
            :locked="field.id in edit.mine"
            :why="''"
            :messages="[]"
            :busy="busy"
            :resync="edit.resync"
            @set="set(field.id, $event)"
            @roll="rollField(field.id)"
          />
        </div>
        <div v-else class="sysed-group" :class="{ 'is-owned': group.owner !== '', 'is-moon': group.moon }">
          <div v-if="group.owner" class="sysed-group-head">
            <b>{{ groupTitle(group) }}</b>
            <button v-if="rollable(group.owner)" type="button" class="ui-btn sysed-reroll" :disabled="busy" @click="rollField(group.owner)">Roll this body again</button>
          </div>
          <EditField
            v-for="field in group.fields"
            :key="field.id"
            :field="field"
            :mark="markOf(field.id, edit.mine, edit.rolled, changed)"
            :was="edit.baseline[field.id]"
            :locked="field.id in edit.mine"
            :why="field.id in edit.mine ? '' : whyOf(field.id, changed)"
            :messages="messagesFor(field.id, messages)"
            :busy="busy"
            :resync="edit.resync"
            @set="set(field.id, $event)"
            @roll="rollField(field.id)"
          />
          <p v-for="(message, index) in (group.owner ? messagesFor(group.owner, messages) : [])" :key="'g' + index" class="sysed-strip" :class="{ 'is-error': message.holds }" role="status">{{ message.text }}</p>
        </div>
      </template>
      <!-- A profile cell has no room for words: what is said about one is said under the row. -->
      <template v-if="section.id === 'profile'">
        <template v-for="group in section.groups" :key="'w' + group.owner">
          <template v-for="field in group.fields" :key="'w' + field.id">
            <details v-if="!(field.id in edit.mine) && whyOf(field.id, changed)" class="sysed-strip is-note sysed-why">
              <summary>{{ field.label }}: {{ firstLine(whyOf(field.id, changed)) }}<em v-if="moreLines(whyOf(field.id, changed))">and {{ moreLines(whyOf(field.id, changed)) }} more lines from the engine</em></summary>
              <p v-if="moreLines(whyOf(field.id, changed))">{{ whyOf(field.id, changed) }}</p>
            </details>
            <p v-for="(message, index) in messagesFor(field.id, messages)" :key="field.id + index" class="sysed-strip" :class="{ 'is-error': message.holds }">{{ field.label }}: {{ message.text }}</p>
          </template>
        </template>
      </template>
      <!-- The rule places for this section: present, empty, and silent unless the server ever fills one. -->
      <div v-for="rule in section.rules" :key="rule.id" class="sysed-rule" :data-rule="rule.id" :aria-hidden="rule.value ? undefined : 'true'">{{ rule.value || '' }}</div>
    </section>
    </template>
    <!-- By hand, the seven rule places stand after the designer: present, empty and silent, as everywhere. -->
    <template v-if="edit.mode === 'hand'">
      <div v-for="rule in handRules" :key="rule.id" class="sysed-rule" :data-rule="rule.id" :aria-hidden="rule.value ? undefined : 'true'">{{ rule.value || '' }}</div>
    </template>
  </div>
</template>

<style>
.sysed {
  padding: 14px 16px 18px;
}

.sysed-section > .ui-heading {
  margin-top: 18px;
}

.sysed-top + .sysed-section > .ui-heading {
  margin-top: 0;
}

/* Half and full: the sections flow into two and three columns; a section is never split. */
.sysed:not(.is-hand)[data-span="half"] {
  columns: 2;
  column-gap: 24px;
}

.sysed:not(.is-hand)[data-span="full"] {
  columns: 3;
  column-gap: 26px;
}

.sysed-top {
  column-span: all;
}

.sysed:is([data-span="half"], [data-span="full"]) .sysed-section {
  break-inside: avoid-column;
}

.sysed:is([data-span="half"], [data-span="full"]) .sysed-section[data-section="system"],
.sysed:is([data-span="half"], [data-span="full"]) .sysed-section[data-section="stars"] {
  break-inside: auto;
}

.sysed-group {
  border-top: 1px solid var(--line-1);
}

.sysed-group.is-owned {
  margin-top: 8px;
  padding: 2px 10px 0;
  border: 1px solid var(--line-1);
  border-radius: var(--r-3);
  background: var(--panel-raised);
  break-inside: avoid-column;
}

.sysed-group.is-moon {
  margin-left: 22px;
}

.sysed-group.is-owned > .ef:last-of-type {
  border-bottom: 0;
}

.sysed-group-head {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 34px;
  border-bottom: 1px solid var(--line-soft);
}

.sysed-group-head b {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  color: var(--text-0);
  font: 600 13.5px/1.3 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.sysed-reroll {
  padding: 3px 8px;
  font-size: 12px;
}

.sysed-cells {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px 4px;
  margin-bottom: 6px;
}

.sysed-strip {
  margin: 0 0 10px;
  padding: 8px 10px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--attention);
  border-radius: var(--r-2);
  background: var(--panel-raised);
  color: var(--text-1);
  font: 400 13px/1.45 var(--font-text);
}

.sysed-strip p {
  margin: 0;
}

.sysed-strip.is-note {
  border-left-color: var(--signal-dim);
}

.sysed-strip.is-error,
.sysed-strip.is-conflict {
  border-left-color: var(--danger);
}

.sysed-strip-acts {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 8px;
}

.sysed-section > .sysed-strip,
.sysed-group > .sysed-strip {
  margin: 6px 0;
  font-size: 12.5px;
}

.sysed-why > summary {
  cursor: pointer;
}

.sysed-why em {
  display: block;
  color: var(--text-muted);
  font-style: normal;
}

.sysed-why p {
  margin: 6px 0 0;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}

/* A rule place: it holds its position and takes no room while it has nothing to say. */
.sysed-rule:empty {
  height: 0;
}

.sysed-rule:not(:empty) {
  margin: 6px 0;
  padding: 6px 9px;
  border: 1px solid var(--line-2);
  border-left: 3px solid var(--attention);
  border-radius: var(--r-2);
  background: var(--bg-2);
  color: var(--text-1);
  font: 400 12.5px/1.4 var(--font-text);
}
</style>
