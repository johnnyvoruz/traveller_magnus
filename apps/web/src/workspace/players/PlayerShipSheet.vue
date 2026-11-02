<script setup lang="ts">
/**
 * The party ship's sheet as a player reads it (Lane D's DP2; Johnny's yes to question 129): the PDF's
 * sections in the sheet's own look (SheetPanel's chamfered panels and tabs, the rust value tags), every
 * box as text, nothing to type in. The values are the sheet's with the manifest rows written in, as the
 * referee's sheet shows them (vessel_trade.ts `sheetView`); a passenger or crew person the projection kept
 * opens their record. A section with nothing in it starts folded; the tab opens it. The deck plan is drawn
 * at the end when the sheet holds one. The store holds the players' projection, so a referee-only value
 * never reaches this file.
 */
import { computed, reactive } from 'vue';
import { campaign } from '../../campaign/store.ts';
import DeckPlanView from '../../deckplan/DeckPlanView.vue';
import { formatCredits } from '../../campaign/money.ts';
import { fareOfPassageField } from '../passenger_fare.ts';
import SheetPanel from '../SheetPanel.vue';
import { isPersonField, peopleOfKind, personOf, SECTION_KIND } from '../sheet_people.ts';
import { isTall, sheetSections, valueOf, type Row, type SheetField, type Table } from '../ship_sheet.ts';
import { manifestOf, sheetView } from '../vessel_trade.ts';
import { deckPlanOf } from './player_ship.ts';

const props = defineProps<{ id: string }>();
const emit = defineEmits<{ open: [id: string] }>();

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const values = computed(() => (record.value ? sheetView(record.value) : null));
const lots = computed(() => (record.value ? manifestOf(record.value).passengers : []));
const plan = computed(() => (record.value ? deckPlanOf(record.value.sheet) : null));
const crew = computed(() => peopleOfKind(campaign.links, campaign.records, props.id, SECTION_KIND.Crew));
const sections = sheetSections();

/** Folded sections, this page's own: a section with no value starts folded. */
const toggled = reactive<Record<string, boolean>>({});

function keyOf(section: { page: number; name: string }): string {
    return section.page + ' ' + section.name;
}

/** How many boxes in a section hold a value, for its tab while it is folded. */
function filledIn(section: { blocks: (Row | Table)[] }): number {
    const held = values.value;
    if (!held) return 0;
    let count = 0;
    for (const block of section.blocks) {
        const fields = block.kind === 'row' ? block.cells.map((c) => c.field) : block.cells.flat();
        for (const field of fields) if (field && field.name in held) count += 1;
    }
    return count;
}

function isOpen(section: { page: number; name: string; blocks: (Row | Table)[] }): boolean {
    const key = keyOf(section);
    if (key in toggled) return toggled[key];
    return filledIn(section) > 0;
}

function toggle(section: { page: number; name: string; blocks: (Row | Table)[] }): void {
    toggled[keyOf(section)] = !isOpen(section);
}

function text(field: SheetField): string {
    const held = valueOf(values.value, field);
    return typeof held === 'string' ? held : '';
}

function ticked(field: SheetField): boolean {
    return valueOf(values.value, field) === true;
}

/** "Cr14,000" under a Passage box whose passenger has boarded (DT3); nothing otherwise. */
function fareWords(field: SheetField): string {
    const fare = fareOfPassageField(lots.value, field.name);
    return fare === null ? '' : formatCredits(fare);
}

function personIn(field: SheetField): { id: string; name: string } | null {
    const person = personOf(values.value, field, campaign.records);
    return person ? { id: person.id, name: person.name } : null;
}

/** A series' heading in a table, as ShipSheet.vue prints it: without the words every series shares. */
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

function rowHeading(table: Table, at: number): string {
    return table.flipped ? heading(table, table.columns[at]) : String(table.numbers[at]);
}

function columnHeadings(table: Table): string[] {
    return table.flipped ? table.numbers.map(String) : table.columns.map((column) => heading(table, column));
}
</script>

<template>
  <section v-if="record" class="sheet psheet-read" data-player-sheet>
    <h3 class="ui-heading ui-kicker">Sheet</h3>
    <div class="sheet-frame">
      <template v-for="section in sections" :key="keyOf(section)">
        <SheetPanel :name="section.name" :open="isOpen(section)" :count="filledIn(section)" @toggle="toggle(section)">
          <div v-if="section.name === 'Crew' && crew.length" class="sheet-crew" role="group" aria-label="Crew, as people">
            <span class="sheet-label">People</span>
            <ul class="sheet-crew-list">
              <li v-for="item in crew" :key="item.link.id">
                <button type="button" class="psheet-person" @click="emit('open', item.person.id)">{{ item.person.name }}</button>
              </li>
            </ul>
          </div>
          <template v-for="(block, index) in section.blocks" :key="index">
            <div v-if="block.kind === 'row'" class="sheet-row">
              <div v-for="cell in block.cells" :key="cell.field.name" class="sheet-field" :class="{ 'is-tall': isTall(cell.field), 'is-tick': cell.field.type === 'checkbox' }">
                <span class="sheet-label">{{ cell.label }}</span>
                <span v-if="cell.field.type === 'checkbox'" class="psheet-tick" :title="cell.field.name">{{ ticked(cell.field) ? 'Yes' : '' }}</span>
                <span v-else-if="isTall(cell.field)" class="sheet-input is-tall psheet-value" :title="cell.field.name">{{ text(cell.field) }}</span>
                <span v-else class="sheet-input is-tag psheet-value" :title="cell.field.name">{{ text(cell.field) }}</span>
              </div>
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
                    <td v-for="(field, column) in cells" :key="column" :class="{ 'is-fare': field && fareWords(field) !== '' }">
                      <template v-if="field">
                        <button v-if="isPersonField(field) && personIn(field)" type="button" class="psheet-person" :title="field.name" @click="emit('open', personIn(field)!.id)">{{ personIn(field)!.name }}</button>
                        <span v-else-if="field.type === 'checkbox'" class="psheet-tick" :title="field.name">{{ ticked(field) ? 'Yes' : '' }}</span>
                        <span v-else class="sheet-input psheet-value" :title="field.name">{{ text(field) }}</span>
                        <small v-if="fareWords(field)" class="sheet-fare" data-sheet-fare>{{ fareWords(field) }}</small>
                      </template>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </template>
        </SheetPanel>
      </template>
      <SheetPanel v-if="plan" class="sheet-plan" name="Deck plan" :open="!toggled['0 Deck plan']" @toggle="toggled['0 Deck plan'] = !toggled['0 Deck plan']">
        <div class="psheet-plan"><DeckPlanView :plan="plan" /></div>
      </SheetPanel>
    </div>
  </section>
</template>

<style>
/* A box read as text: the sheet's tag with no input in it; empty, it keeps the tag's height. */
.psheet-read .psheet-value {
  display: block;
  min-height: 1.4em;
  overflow-wrap: anywhere;
}

.psheet-read .psheet-value.is-tall {
  min-height: 2.8em;
  white-space: pre-line;
}

.psheet-read .psheet-tick {
  min-width: 16px;
  color: var(--text-0);
  font: 600 12.5px/1.4 var(--font-text);
}

.psheet-read .sheet-crew {
  margin-bottom: 10px;
}

.psheet-read .sheet-crew-list {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin: 0;
  padding: 0;
  list-style: none;
}

.psheet-read .sheet-fare {
  display: block;
  margin-top: 2px;
  color: var(--text-muted);
  font: 500 11px/1.2 var(--font-text);
  white-space: nowrap;
}

/* A person the projection kept: their name as a pill that opens their record. */
.psheet-person {
  display: inline-flex;
  align-items: center;
  min-height: 28px;
  padding: 0 10px;
  border: 1px solid var(--line-2);
  border-radius: var(--r-pill);
  background: transparent;
  color: var(--text-0);
  font: 600 12.5px/1 var(--font-text);
  cursor: pointer;
}

.psheet-person:hover {
  border-color: var(--signal);
}

.psheet-person:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: 2px;
}

.psheet-plan {
  padding-top: 12px;
}

@media (max-width: 680px) {
  .psheet-person {
    min-height: 44px;
  }
}
</style>
