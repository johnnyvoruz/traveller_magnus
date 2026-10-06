<script setup lang="ts">
/**
 * The ship sheet on a vessel's record page (K13 part 3; plan §5.3b): the PDF's 312 fields
 * in its sections and page order, edited where they stand and stored as `sheet.fields`
 * under the PDF's own names. The look is the sheet's: chamfered panels, cyan section tabs,
 * rust-red value tags, a thin orange frame line, all tokens. Plain fields; nothing is
 * computed from one. The deck plan (K9) sits inside it, in the slot at the end.
 */
import { computed } from 'vue';
import { campaign } from '../campaign/store.ts';
import { saveRecord } from './actions.ts';
import {
    fieldsOf, filledCount, isTall, SHEET_RULES, sheetSections, sheetWithFields, valueOf, withValue, type SheetField, type Table,
} from './ship_sheet.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
}>();

const record = computed(() => {
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const values = computed(() => (record.value ? fieldsOf(record.value.sheet) : null));
const sections = sheetSections();
const total = SHEET_RULES.fields.length;
const filled = computed(() => filledCount(values.value));

/** The input's id, from the PDF's name, so its label can point at it. */
function idOf(field: SheetField): string {
    return 'sheet-' + field.name.replace(/[^A-Za-z0-9]+/g, '-').toLowerCase();
}

function text(field: SheetField): string {
    const held = valueOf(values.value, field);
    return typeof held === 'string' ? held : '';
}

function ticked(field: SheetField): boolean {
    return valueOf(values.value, field) === true;
}

function save(field: SheetField, value: string | boolean): void {
    if (props.readOnly || !record.value) return;
    const next = withValue(values.value, field, value);
    saveRecord(props.id, { sheet: sheetWithFields(record.value.sheet, next) });
}

function onText(field: SheetField, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) save(field, target.value);
}

function onTick(field: SheetField, event: Event): void {
    const target = event.target;
    if (target instanceof HTMLInputElement) save(field, target.checked);
}

/** Enter in a one-line field saves it and leaves it; the rest of the keys are the field's own. */
function onKey(event: KeyboardEvent): void {
    if (event.key === 'Enter' && event.target instanceof HTMLInputElement) {
        event.preventDefault();
        event.target.blur();
        return;
    }
    event.stopPropagation();
}

/**
 * A series' heading in a table: its name without the words every series in the table shares
 * at the front ("Turret Mount" → "Mount") or at the back ("Armour Critical Hit" → "Armour").
 * The PDF prints them that way; the full name stays in the field's title.
 */
function heading(table: Table, column: string): string {
    const words = table.columns.map((name) => name.split(' '));
    let front = 0;
    while (front < words[0].length && words.every((list) => list[front] === words[0][front])) front += 1;
    let back = 0;
    while (back < words[0].length && words.every((list) => list[list.length - 1 - back] === words[0][words[0].length - 1 - back])) back += 1;
    const own = column.split(' ');
    if (front + back >= own.length) return column;
    return own.slice(front, own.length - back).join(' ');
}

/** A table's row heading: the series' name for the checkbox rows, else the number. */
function rowHeading(table: Table, at: number): string {
    return table.flipped ? heading(table, table.columns[at]) : String(table.numbers[at]);
}

function columnHeadings(table: Table): string[] {
    return table.flipped ? table.numbers.map(String) : table.columns.map((column) => heading(table, column));
}
</script>

<template>
  <section v-if="record" class="sheet" :data-filled="filled">
    <h3 class="ui-heading">Sheet <span class="ui-count">{{ filled }} of {{ total }}</span></h3>
    <p class="sheet-source">{{ SHEET_RULES.source.replace(/^assets\//, '') }} · the fields as the PDF names them</p>
    <div class="sheet-frame">
      <template v-for="(section, at) in sections" :key="section.page + ' ' + section.name">
        <p v-if="at === 0 || sections[at - 1].page !== section.page" class="sheet-page">Page {{ section.page }}</p>
        <section class="sheet-panel" :aria-label="section.name">
          <h4 class="sheet-tab">{{ section.name }}</h4>
          <div class="sheet-body">
            <template v-for="(block, index) in section.blocks" :key="index">
              <div v-if="block.kind === 'row'" class="sheet-row">
                <label v-for="cell in block.cells" :key="cell.field.name" class="sheet-field" :class="{ 'is-tall': isTall(cell.field), 'is-tick': cell.field.type === 'checkbox' }" :for="idOf(cell.field)">
                  <span class="sheet-label">{{ cell.label }}</span>
                  <input
                    v-if="cell.field.type === 'checkbox'"
                    :id="idOf(cell.field)"
                    type="checkbox"
                    class="sheet-tick"
                    :checked="ticked(cell.field)"
                    :disabled="readOnly"
                    @change="onTick(cell.field, $event)"
                    @keydown.stop
                  >
                  <textarea
                    v-else-if="isTall(cell.field)"
                    :id="idOf(cell.field)"
                    class="sheet-input is-tall"
                    rows="4"
                    :value="text(cell.field)"
                    :disabled="readOnly"
                    @change="onText(cell.field, $event)"
                    @keydown="onKey"
                  ></textarea>
                  <input
                    v-else
                    :id="idOf(cell.field)"
                    type="text"
                    class="sheet-input is-tag"
                    :value="text(cell.field)"
                    :disabled="readOnly"
                    @change="onText(cell.field, $event)"
                    @keydown="onKey"
                  >
                </label>
              </div>
              <div v-else class="sheet-table-wrap">
                <table class="sheet-table" :class="{ 'is-ticks': block.flipped }">
                  <thead>
                    <tr>
                      <th scope="col" class="sheet-th is-row"><span class="rec-sr">{{ block.flipped ? 'System' : 'Row' }}</span></th>
                      <th v-for="(name, column) in columnHeadings(block)" :key="column" scope="col" class="sheet-th">{{ name }}</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr v-for="(cells, row) in block.cells" :key="row">
                      <th scope="row" class="sheet-th is-row">{{ rowHeading(block, row) }}</th>
                      <td v-for="(field, column) in cells" :key="column">
                        <template v-if="field">
                          <input
                            v-if="field.type === 'checkbox'"
                            type="checkbox"
                            class="sheet-tick"
                            :aria-label="field.name"
                            :title="field.name"
                            :checked="ticked(field)"
                            :disabled="readOnly"
                            @change="onTick(field, $event)"
                            @keydown.stop
                          >
                          <input
                            v-else
                            type="text"
                            class="sheet-input"
                            :aria-label="field.name"
                            :title="field.name"
                            :value="text(field)"
                            :disabled="readOnly"
                            @change="onText(field, $event)"
                            @keydown="onKey"
                          >
                        </template>
                      </td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </template>
          </div>
        </section>
      </template>
      <section class="sheet-panel sheet-plan" aria-label="Deck plan">
        <h4 class="sheet-tab">Deck plan</h4>
        <div class="sheet-body">
          <slot />
        </div>
      </section>
    </div>
  </section>
</template>

<style>
.sheet-source {
  margin: -4px 0 10px;
  color: var(--text-muted);
  font: 400 12px/1.4 var(--font-text);
}

/* The thin orange frame line round the whole sheet. */
.sheet-frame {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--sheet-frame);
  border-radius: var(--r-1);
}

.sheet-page {
  margin: 4px 0 -4px;
  color: var(--text-muted);
  font: 700 10.5px/1.4 var(--font-text);
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

/* A panel with chamfered corners, and its cyan tab at the top left. */
.sheet-panel {
  position: relative;
  padding: 0;
  background: var(--panel-raised);
  clip-path: polygon(10px 0, 100% 0, 100% calc(100% - 10px), calc(100% - 10px) 100%, 0 100%, 0 10px);
}

.sheet-tab {
  display: inline-block;
  margin: 0;
  padding: 4px 14px 4px 16px;
  background: var(--signal);
  color: var(--on-signal);
  font: 700 11px/1.5 var(--font-text);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  clip-path: polygon(0 0, 100% 0, calc(100% - 8px) 100%, 0 100%);
}

.sheet-body {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px 12px;
}

.sheet-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
}

.sheet-field {
  display: flex;
  flex: 1 1 200px;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.sheet-field.is-tall {
  flex: 1 1 100%;
  flex-direction: column;
  align-items: stretch;
  gap: 4px;
}

.sheet-label {
  flex: 1 1 auto;
  min-width: 0;
  color: var(--text-1);
  font: 500 12.5px/1.4 var(--font-text);
}

.sheet-input {
  box-sizing: border-box;
  width: 100%;
  min-width: 0;
  margin: 0;
  padding: 4px 8px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-1);
  background: var(--bg-2);
  color: var(--text-0);
  font: 500 13px/1.4 var(--font-text);
}

.sheet-input:focus-visible {
  outline: none;
  border-color: var(--signal);
  box-shadow: 0 0 0 2px var(--signal-glow);
}

.sheet-input:disabled {
  opacity: 0.6;
}

/* A value tag: rust-red, the number of the thing. */
.sheet-field .sheet-input.is-tag {
  flex: 0 1 150px;
  width: auto;
  border-color: var(--sheet-rust-line);
  background: var(--sheet-rust);
  color: var(--text-0);
  font: 700 13px/1.4 var(--font-code);
  font-variant-numeric: var(--tabular);
  clip-path: polygon(6px 0, 100% 0, calc(100% - 6px) 100%, 0 100%);
}

.sheet-field .sheet-input.is-tag::placeholder {
  color: var(--text-0);
}

.sheet-input.is-tall {
  resize: vertical;
  font-family: var(--font-text);
}

.sheet-tick {
  width: 16px;
  height: 16px;
  margin: 0;
  accent-color: var(--signal);
}

/* Tables: a numbered series across the page; the critical hits as ticks. */
.sheet-table-wrap {
  overflow-x: auto;
}

.sheet-table {
  border-collapse: separate;
  border-spacing: 4px 3px;
  margin: 0 -4px;
}

.sheet-th {
  padding: 2px 4px;
  color: var(--text-muted);
  font: 700 10.5px/1.4 var(--font-text);
  letter-spacing: 0.06em;
  text-align: left;
  text-transform: uppercase;
  white-space: nowrap;
}

.sheet-th.is-row {
  color: var(--text-1);
  font-variant-numeric: var(--tabular);
}

.sheet-table td {
  padding: 0;
  min-width: 72px;
}

.sheet-table.is-ticks td {
  min-width: 0;
  text-align: center;
}

.sheet-table .sheet-input {
  padding: 3px 7px;
  font-size: 12.5px;
}

.sheet-plan .sheet-body {
  padding-top: 12px;
}
</style>
