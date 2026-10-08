<script setup lang="ts">
/**
 * The character sheet (K13 part 4; findings/character_sheet_design.md): the official 2026
 * PDF's 420 boxes in its fourteen sections, in the ship sheet's language (chamfered panels
 * under cyan tabs that fold to a bar, rust value tags, tables whose key column stays).
 * It stores what is typed and computes nothing.
 *
 * **It does not know where its values live.** It is given a sheet document and whether it
 * may be edited, and it emits one change per box. The homeworld pill and the linked
 * records come in as given values and go out as events; who the sheet belongs to is a
 * slot the page fills. So the same component can sit on a record today and on a live sheet
 * in an account's library later. It takes an optional map of box to the person in it
 * (presence) and emits which box this person has entered and left.
 */
import { computed, reactive, ref } from 'vue';
import Icon from '../design/Icon.vue';
import {
    characterSections, filledIn, skillName, skillsFound, type CharSection, type SkillLine, type SlotName,
} from './character_sheet.ts';
import { valueOf, type SheetDoc, type SheetField } from './sheet_fields.ts';
import SheetBox from './SheetBox.vue';
import SheetPanel from './SheetPanel.vue';

const props = defineProps<{
    doc: SheetDoc;
    /** Changes can be made. */
    editable: boolean;
    /** Box name to the person in it. Omitted, nobody else is here. */
    presence?: Readonly<Record<string, { name: string; tone: string }>>;
    /** The system the Homeworld box names, when one has been chosen: shown as a pill beside the box. */
    homeworld?: { name: string } | null;
    /** Linked records to show as pills: the person's items, and their allies, contacts, rivals and enemies. */
    links?: Readonly<Partial<Record<SlotName, readonly { id: string; name: string }[]>>>;
    /** Which sections are folded, by name; kept by whoever gives it. Omitted, the sheet keeps its own for as long as it is mounted. */
    folded?: Record<string, boolean>;
}>();

const emit = defineEmits<{
    /** One box was committed: the PDF's name for it, and its new value. */
    change: [name: string, value: string | boolean];
    /** This person entered or left a box. */
    enter: [name: string];
    leave: [name: string];
    /** The homeworld pill: choose a system, go to it, or let it go. */
    homeworld: [act: 'choose' | 'open' | 'clear'];
    /** A linked record's pill was pressed. */
    openLink: [id: string];
}>();

const sections = characterSections();
const own = reactive<Record<string, boolean>>({});
const closed = computed(() => props.folded ?? own);

function toggle(section: CharSection): void {
    closed.value[section.name] = !closed.value[section.name];
}

function foldAll(fold: boolean): void {
    for (const section of sections) closed.value[section.name] = fold;
}

const values = computed(() => props.doc.fields);

function held(field: SheetField): string | boolean {
    return valueOf(values.value, field);
}

function has(field: SheetField | null): boolean {
    return field !== null && field.name in values.value;
}

function who(field: SheetField): { name: string; tone: string } | null {
    return props.presence ? props.presence[field.name] ?? null : null;
}

/** The input's id, from the PDF's name, so its label can point at it. */
function idOf(field: SheetField): string {
    return 'csheet-' + field.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
}

function commit(name: string, value: string | boolean): void {
    if (props.editable) emit('change', name, value);
}

// ---- The skills: a finder over the PDF's lines ----
const find = ref('');
const trainedOnly = ref(false);

function shownLines(lines: readonly SkillLine[]): SkillLine[] {
    return skillsFound(lines, values.value, find.value, trainedOnly.value);
}

function trainedCount(lines: readonly SkillLine[]): number {
    return skillsFound(lines, values.value, '', true).length;
}

/** A skill's name with the found words marked: [before, match, after]. */
function marked(label: string): [string, string, string] {
    const words = find.value.trim().toLowerCase();
    const at = words ? label.toLowerCase().indexOf(words) : -1;
    return at < 0 ? [label, '', ''] : [label.slice(0, at), label.slice(at, at + words.length), label.slice(at + words.length)];
}

const SLOT_WORDS: Record<SlotName, string> = {
    homeworld: 'Homeworld', items: 'Linked items', ally: 'Linked allies', contact: 'Linked contacts', rival: 'Linked rivals', enemy: 'Linked enemies',
};

function linked(slot: SlotName): readonly { id: string; name: string }[] {
    return props.links ? props.links[slot] ?? [] : [];
}
</script>

<template>
  <section class="sheet csheet">
    <h3 class="ui-heading csheet-head">
      <span>Character sheet</span>
      <!-- Who the sheet belongs to, and whether it is this game's own: the page says, or says nothing. -->
      <slot name="owner" />
      <span class="csheet-tools">
        <button type="button" class="csheet-tool" title="Fold every section to its bar" @click="foldAll(true)">Collapse all</button>
        <button type="button" class="csheet-tool" title="Open every section" @click="foldAll(false)">Open all</button>
      </span>
    </h3>
    <div class="sheet-frame">
      <SheetPanel
        v-for="section in sections"
        :key="section.name"
        :name="section.name"
        :open="!closed[section.name]"
        :count="filledIn(section, values)"
        @toggle="toggle(section)"
      >
        <template v-for="(block, index) in section.blocks" :key="index">
          <!-- Loose boxes: a label and its box. -->
          <div v-if="block.kind === 'fields'" class="sheet-row">
            <label v-for="cell in block.cells" :key="cell.field.name" class="sheet-field" :class="{ 'is-tall': cell.look === 'tall' }" :for="idOf(cell.field)">
              <span class="sheet-label">{{ cell.label }}</span>
              <SheetBox
                :box-id="idOf(cell.field)"
                :name="cell.field.name"
                kind="text"
                :look="cell.look"
                :value="held(cell.field)"
                :disabled="!editable"
                :holder="who(cell.field)"
                @commit="commit"
                @enter="emit('enter', $event)"
                @leave="emit('leave', $event)"
              />
            </label>
          </div>

          <!-- A characteristic: its value on the rust tag, its DM in an outlined tag. Both are typed. -->
          <div v-else-if="block.kind === 'chars'" class="csheet-chars">
            <div v-for="cell in block.cells" :key="cell.value.name" class="csheet-char" :class="{ 'has-name': cell.name }" role="group" :aria-label="cell.label + ': its value and its DM'">
              <SheetBox
                v-if="cell.name"
                :name="cell.name.name"
                kind="text"
                :label="cell.label + ', its name'"
                placeholder="Name it"
                :value="held(cell.name)"
                :disabled="!editable"
                :holder="who(cell.name)"
                @commit="commit"
                @enter="emit('enter', $event)"
                @leave="emit('leave', $event)"
              />
              <span v-else class="sheet-label">{{ cell.label }}</span>
              <SheetBox
                :name="cell.value.name"
                kind="text"
                look="tag"
                :label="cell.label"
                :value="held(cell.value)"
                :disabled="!editable"
                :holder="who(cell.value)"
                @commit="commit"
                @enter="emit('enter', $event)"
                @leave="emit('leave', $event)"
              />
              <span class="csheet-dm">
                <span aria-hidden="true">DM</span>
                <SheetBox
                  :name="cell.dm.name"
                  kind="text"
                  :label="cell.label + ' DM'"
                  :value="held(cell.dm)"
                  :disabled="!editable"
                  :holder="who(cell.dm)"
                  @commit="commit"
                  @enter="emit('enter', $event)"
                  @leave="emit('leave', $event)"
                />
              </span>
            </div>
          </div>

          <!-- The profile: the six values typed above, exactly as typed. Nothing is entered here and nothing is converted. -->
          <div v-else-if="block.kind === 'profile'" class="csheet-profile" role="group" aria-label="Universal Character Profile: the six values as typed above">
            <span v-for="cell in block.cells" :key="cell.value.name" class="csheet-hex">
              <b>{{ held(cell.value) || '–' }}</b>
              <span>{{ cell.label }}</span>
            </span>
          </div>

          <!-- The skills: a finder, then the PDF's lines, then its blank rows. -->
          <template v-else-if="block.kind === 'skills'">
            <div class="csheet-find">
              <label class="csheet-find-box">
                <span class="csheet-sr">Find a skill</span>
                <Icon name="search" :size="12" />
                <input v-model="find" type="search" class="sheet-input" placeholder="Find a skill" @keydown.stop>
              </label>
              <span class="csheet-seg" role="group" aria-label="Which skills to show">
                <button type="button" :aria-pressed="!trainedOnly ? 'true' : 'false'" @click="trainedOnly = false">All {{ block.lines.length }}</button>
                <button type="button" :aria-pressed="trainedOnly ? 'true' : 'false'" title="Only the lines with something typed" @click="trainedOnly = true">Trained {{ trainedCount(block.lines) }}</button>
              </span>
            </div>
            <ul class="csheet-skills">
              <li v-for="line in shownLines(block.lines)" :key="line.modifier.name" class="csheet-skill" :class="{ 'has-spec': line.specialism, 'is-idle': !has(line.modifier) && !has(line.specialism) }">
                <span class="csheet-skill-name" :title="skillName(line)">{{ marked(line.label)[0] }}<mark>{{ marked(line.label)[1] }}</mark>{{ marked(line.label)[2] }}<small v-if="line.n !== null"> {{ line.n }}</small></span>
                <SheetBox
                  v-if="line.specialism"
                  :name="line.specialism.name"
                  kind="text"
                  :label="skillName(line) + ' specialism'"
                  placeholder="specialism"
                  :value="held(line.specialism)"
                  :disabled="!editable"
                  :holder="who(line.specialism)"
                  @commit="commit"
                  @enter="emit('enter', $event)"
                  @leave="emit('leave', $event)"
                />
                <SheetBox
                  class="csheet-level"
                  :class="{ 'is-empty': !has(line.modifier) }"
                  :name="line.modifier.name"
                  kind="text"
                  look="tag"
                  :label="skillName(line) + ' modifier'"
                  :value="held(line.modifier)"
                  :disabled="!editable"
                  :holder="who(line.modifier)"
                  @commit="commit"
                  @enter="emit('enter', $event)"
                  @leave="emit('leave', $event)"
                />
              </li>
            </ul>
            <p v-if="!shownLines(block.lines).length" class="csheet-note">No skill has those words.</p>
            <h5 class="csheet-sub">Other skills and abilities</h5>
            <ul class="csheet-skills">
              <li v-for="(blank, at) in block.blanks" :key="blank.name.name" class="csheet-skill is-blank" :class="{ 'is-idle': !has(blank.name) && !has(blank.dm) }">
                <SheetBox
                  :name="blank.name.name"
                  kind="text"
                  :label="'Skill or ability ' + (at + 1)"
                  placeholder="skill or ability"
                  :value="held(blank.name)"
                  :disabled="!editable"
                  :holder="who(blank.name)"
                  @commit="commit"
                  @enter="emit('enter', $event)"
                  @leave="emit('leave', $event)"
                />
                <SheetBox
                  class="csheet-level"
                  :class="{ 'is-empty': !has(blank.dm) }"
                  :name="blank.dm.name"
                  kind="text"
                  look="tag"
                  :label="'Skill or ability ' + (at + 1) + ' DM'"
                  :value="held(blank.dm)"
                  :disabled="!editable"
                  :holder="who(blank.dm)"
                  @commit="commit"
                  @enter="emit('enter', $event)"
                  @leave="emit('leave', $event)"
                />
              </li>
            </ul>
          </template>

          <!-- A table: the PDF's rows; the first column is the key and stays while the rest scrolls. -->
          <div v-else-if="block.kind === 'table'" class="sheet-table-wrap">
            <table class="sheet-table csheet-table">
              <thead>
                <tr>
                  <th v-for="(column, at) in block.columns" :key="column.label" scope="col" class="sheet-th" :class="{ 'is-row': at === 0, 'is-tick': column.type === 'checkbox' }">{{ column.label }}</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(row, n) in block.rows" :key="n">
                  <td v-for="(field, at) in row" :key="field.name" :class="{ 'csheet-key': at === 0, 'is-tick': field.type === 'checkbox' }">
                    <SheetBox
                      :name="field.name"
                      :kind="field.type"
                      :label="block.name + ', row ' + (n + 1) + ', ' + block.columns[at].label"
                      :value="held(field)"
                      :disabled="!editable"
                      :holder="who(field)"
                      @commit="commit"
                      @enter="emit('enter', $event)"
                      @leave="emit('leave', $event)"
                    />
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          <!-- Linked things the page gives: pills. A pill is never written into a box, and a box never makes a record. -->
          <div v-else-if="block.slot === 'homeworld'" class="csheet-pills" role="group" aria-label="Homeworld, as a system">
            <template v-if="homeworld">
              <button type="button" class="ui-chip csheet-pill" :title="'Go to ' + homeworld.name" @click="emit('homeworld', 'open')"><Icon name="location-dot" :size="11" />{{ homeworld.name }}</button>
              <button v-if="editable" type="button" class="csheet-tool" title="Let the system go; the Homeworld box keeps its text" @click="emit('homeworld', 'clear')">Clear</button>
            </template>
            <button v-else-if="editable" type="button" class="ui-chip csheet-pill is-add" title="Choose the homeworld’s system on the map" @click="emit('homeworld', 'choose')"><Icon name="map" :size="11" />Choose the system</button>
          </div>
          <div v-else-if="linked(block.slot).length" class="csheet-pills" role="group" :aria-label="SLOT_WORDS[block.slot]">
            <span class="csheet-pills-label">{{ SLOT_WORDS[block.slot] }}</span>
            <button v-for="item in linked(block.slot)" :key="item.id" type="button" class="ui-chip csheet-pill" :title="'Open ' + item.name" @click="emit('openLink', item.id)">{{ item.name }}</button>
          </div>
        </template>
      </SheetPanel>
    </div>
  </section>
</template>

<style>
/* A label keeps its words whole; the box beside it takes what is left. */
.csheet .sheet-field .sheet-label {
  min-width: min-content;
}

.csheet-head {
  display: flex;
  align-items: center;
  gap: 10px;
}

.csheet-tools {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.csheet-tool {
  height: 24px;
  margin: 0;
  padding: 0 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-1);
  background: transparent;
  color: var(--text-1);
  font: 600 12px/1 var(--font-text);
  letter-spacing: 0;
  text-transform: none;
  cursor: pointer;
}

.csheet-tool:hover {
  border-color: var(--signal-dim);
}

/* A characteristic: its name, its value on the rust tag, its DM in an outlined tag. */
.csheet-chars {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(206px, 1fr));
  gap: 8px 14px;
}

.csheet-char {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 54px 62px;
  align-items: center;
  gap: 6px;
}

.csheet-char .sbox.is-tag {
  flex: none;
}

.csheet-char .sheet-input.is-tag {
  width: 54px;
  padding: 4px;
  text-align: center;
}

.csheet-dm {
  display: flex;
  align-items: center;
  gap: 4px;
  min-width: 0;
  padding-left: 6px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-1);
  background: var(--bg-2);
}

.csheet-dm > span:first-child {
  color: var(--text-muted);
  font: 700 12px/1 var(--font-text);
  letter-spacing: 0.04em;
}

.csheet-dm .sheet-input {
  padding: 4px 4px 4px 0;
  border: 0;
  background: transparent;
  color: var(--signal);
  font: 700 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  text-align: center;
}

/* The profile hexes: the six values typed above, shown, never typed here. */
.csheet-profile {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.csheet-hex {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  width: 78px;
  height: 72px;
  background: var(--bg-2);
  clip-path: polygon(50% 0, 100% 25%, 100% 75%, 50% 100%, 0 75%, 0 25%);
}

.csheet-hex b {
  max-width: 64px;
  overflow: hidden;
  color: var(--signal);
  font: 700 18px/1.1 var(--font-code);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.csheet-hex span {
  color: var(--text-muted);
  font: 600 12px/1.2 var(--font-text);
}

/* The skills: a finder, then the list in columns. A line with something typed is bright; an empty one is quiet. */
.csheet-find {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
}

.csheet-find-box {
  position: relative;
  display: flex;
  flex: 1 1 160px;
  align-items: center;
}

.csheet-find-box .ui-icon {
  position: absolute;
  left: 8px;
  color: var(--text-muted);
  pointer-events: none;
}

.csheet-find-box .sheet-input {
  padding-left: 26px;
}

.csheet-seg {
  display: inline-flex;
  overflow: hidden;
  border: 1px solid var(--control-line);
  border-radius: var(--r-1);
}

.csheet-seg button {
  margin: 0;
  padding: 4px 10px;
  border: 0;
  background: transparent;
  color: var(--text-1);
  font: 600 12px/1.4 var(--font-text);
  cursor: pointer;
}

.csheet-seg button[aria-pressed='true'] {
  background: var(--row-active);
  color: var(--signal);
}

.csheet-seg button:focus-visible {
  outline-offset: -2px;
}

.csheet-skills {
  columns: 250px auto;
  column-gap: 18px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.csheet-skill {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 46px;
  align-items: center;
  gap: 6px;
  padding: 2px 0;
  break-inside: avoid;
}

.csheet-skill.has-spec {
  grid-template-columns: 104px minmax(0, 1fr) 46px;
}

.csheet-skill-name {
  overflow: hidden;
  color: var(--text-0);
  font: 600 12.5px/1.4 var(--font-text);
  text-overflow: ellipsis;
  white-space: nowrap;
}

.csheet-skill-name small {
  color: var(--text-muted);
  font: 500 12px/1 var(--font-code);
}

.csheet-skill.is-idle .csheet-skill-name {
  color: var(--text-muted);
  font-weight: 500;
}

.csheet-skill-name mark {
  background: transparent;
  color: var(--attention);
  font-weight: 700;
}

.csheet-skill .sheet-input {
  padding: 3px 7px;
  font-size: 12.5px;
}

.csheet-skill .sbox.csheet-level {
  flex: none;
}

.csheet-skill .csheet-level .sheet-input.is-tag {
  width: 46px;
  padding: 3px 2px;
  text-align: center;
}

/* Nothing typed yet: the box is a plain well, not a rust tag. */
.csheet-skill .csheet-level.is-empty .sheet-input.is-tag:not(:focus) {
  border-color: var(--line-2);
  background: var(--bg-2);
  clip-path: none;
}

.csheet-sub {
  margin: 6px 0 0;
  color: var(--text-muted);
  font: 700 12px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.csheet-note {
  margin: 0;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

/* The key column of a person's table is its first typed column (the weapon, the career): it stays while the rest scrolls. */
.csheet-table td.csheet-key {
  position: sticky;
  left: 0;
  z-index: 1;
  min-width: 140px;
  padding-right: 6px;
  background: var(--panel-raised);
  box-shadow: 6px 0 6px -6px var(--bg-0);
}

.csheet-table td.is-tick,
.csheet-table th.is-tick {
  min-width: 0;
  text-align: center;
}

.csheet-table td {
  padding-top: 2px;
}

/* Linked records: the pills the panel already has. */
.csheet-pills {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.csheet-pills-label {
  color: var(--text-muted);
  font: 500 12px/1.4 var(--font-text);
}

.csheet-pill {
  max-width: 100%;
  border-color: var(--signal-dim);
  cursor: pointer;
}

.csheet-pill.is-add {
  border-style: dashed;
  border-color: var(--control-line);
}

.csheet-sr {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
</style>
