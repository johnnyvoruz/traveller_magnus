<script setup lang="ts">
/**
 * The Ship's locker on a vessel's page (DS6; findings/ship_crew_plan.md §3 (5); Johnny 137
 * and 142): the rows of `status.locker` in the four columns the character sheet's Equipment
 * table has, typed in place, Remove, Add to the locker, and the KG sum as a line. Beside the
 * cargo, never part of it: no tons against the hold, no money, no rule. The referee always
 * writes (the record save, as the vessel page's other sections); a player writes through the
 * append door when their role's Locker switch is on, and reads otherwise. "To <character>" on
 * a row moves the item to a crew character's Equipment table, one item per press
 * (workspace/locker_move.ts); the referee picks any crew character whose sheet can be written,
 * a player their own.
 */
import { computed, reactive, ref } from 'vue';
import type { CampaignRecord, LockerRow, StatusAppend } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import Icon from '../design/Icon.vue';
import { showToast } from '../shell/toast.ts';
import { crewOf, may } from './crew.ts';
import { COLUMNS, COLUMN_WORDS, NOT_CHANGED, NOT_MOVED, NO_LOCKER, NO_TAKER, WRITE_TYPE, fullWords, isBlank, kgText, kgWords, lockerChanged, lockerOf, lockerWith, lockerWithout, movedToSheetWords, rowFrom, type Column } from './locker.ts';
import { sheetTaker, toCharacter, writeLocker, type Who } from './locker_move.ts';
import { myPersonIds } from './players/me.ts';

const props = defineProps<{
    id: string;
    /** Changes cannot be made just now (offline). */
    readOnly: boolean;
    /** Whose page this is: the referee's record save, or a player's piece through the door. */
    who: Who;
}>();

const LIMIT: Readonly<Record<Column, number>> = { type: 200, tl: 40, kg: 12, notes: 500 };

const record = computed(() => {
    void campaign.seq;
    const found = campaign.records[props.id];
    return found && !found.deleted && found.type === 'vessel' ? found : null;
});
const rows = computed(() => lockerOf(record.value));
/** The characters this member is tied to who crew this ship with the Locker switch on (a player). */
const myCrew = computed(() => (props.who === 'player' ? myPersonIds().filter((id) => may(record.value, id, 'locker')) : []));
const canWrite = computed(() => !props.readOnly && (props.who === 'referee' || myCrew.value.length > 0));
/** Who a row can move to: any crew character with a sheet the referee can write; a player's own. */
const takers = computed((): CampaignRecord[] => {
    const now = record.value;
    if (!now) return [];
    const ids = props.who === 'referee' ? crewOf(now).map((row) => row.personId) : myCrew.value;
    return ids
        .map((id) => campaign.records[id])
        .filter((person): person is CampaignRecord => !!person && !person.deleted && person.type === 'person' && sheetTaker(person, props.who) !== null);
});
/** A write in flight: the row's index, or -1 for the add form. Null when none. */
const busy = ref<number | null>(null);
const add = reactive<Record<Column, string>>({ type: '', tl: '', kg: '', notes: '' });
const addError = ref('');

function shown(row: LockerRow, column: Column): string {
    return column === 'kg' ? kgText(row.kg) : row[column];
}

async function write(next: LockerRow[], append: StatusAppend['append'], at: number): Promise<boolean> {
    const now = record.value;
    if (!now || !canWrite.value || busy.value !== null) return false;
    busy.value = at;
    try {
        const ok = await writeLocker(now, props.who, next, append);
        if (!ok) showToast(NOT_CHANGED);
        return ok;
    } finally {
        busy.value = null;
    }
}

function change(index: number, column: Column, event: Event): void {
    const box = event.target;
    const held = rows.value[index];
    if (!(box instanceof HTMLInputElement) || !held) return;
    const boxes = { type: held.type, tl: held.tl, kg: kgText(held.kg), notes: held.notes, [column]: box.value };
    const row = rowFrom(boxes);
    void write(lockerChanged(rows.value, index, row), { locker: isBlank(row) ? { remove: [index] } : { change: [{ index, row }] } }, index);
}

function remove(index: number): void {
    if (!rows.value[index]) return;
    void write(lockerWithout(rows.value, index), { locker: { remove: [index] } }, index);
}

async function addRow(): Promise<void> {
    const row = rowFrom(add);
    if (isBlank(row) || row.type === '') {
        addError.value = WRITE_TYPE;
        return;
    }
    addError.value = '';
    const ok = await write(lockerWith(rows.value, row), { locker: { add: [row] } }, -1);
    if (!ok) return;
    for (const column of COLUMNS) add[column] = '';
}

async function moveTo(index: number, event: Event): Promise<void> {
    const pick = event.target;
    const now = record.value;
    if (!(pick instanceof HTMLSelectElement) || !now || busy.value !== null) return;
    const person = takers.value.find((item) => item.id === pick.value);
    pick.value = '';
    const row = rows.value[index];
    if (!person || !row) return;
    busy.value = index;
    try {
        const outcome = await toCharacter(now, index, person, props.who);
        if (outcome.ok) showToast(movedToSheetWords(row, outcome.name));
        else if (outcome.why === 'full') showToast(fullWords(person.name));
        else if (outcome.why === 'no_taker') showToast(NO_TAKER);
        else showToast(NOT_MOVED);
    } finally {
        busy.value = null;
    }
}
</script>

<template>
  <section class="lk-sec ui-frame" data-vessel-locker aria-labelledby="lk-h">
    <div class="lk-head">
      <h3 id="lk-h" class="ui-frame-label">Ship’s locker <span v-if="rows.length" class="ui-frame-count">{{ rows.length }}</span></h3>
      <span class="lk-sum" data-locker-sum>{{ kgWords(rows) }}</span>
    </div>
    <div v-if="rows.length" class="lk-wrap">
      <table class="lk-table" data-locker-rows :data-locker-writes="canWrite ? 'yes' : 'no'">
        <thead>
          <tr>
            <th v-for="column in COLUMNS" :key="column" scope="col" :class="'is-' + column">{{ COLUMN_WORDS[column] }}</th>
            <th v-if="canWrite" scope="col" class="is-acts"><span class="lk-visually">Actions</span></th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, i) in rows" :key="i" :data-locker-row="i">
            <template v-if="canWrite">
              <td v-for="column in COLUMNS" :key="column" :class="'is-' + column">
                <input
                  :value="shown(row, column)"
                  class="lk-box"
                  :maxlength="LIMIT[column]"
                  :inputmode="column === 'kg' ? 'decimal' : undefined"
                  :aria-label="COLUMN_WORDS[column] + ', row ' + (i + 1)"
                  :disabled="busy !== null"
                  :data-locker-cell="i + ':' + column"
                  @change="change(i, column, $event)"
                />
              </td>
              <td class="is-acts lk-acts">
                <select v-if="takers.length" class="lk-box lk-to" :disabled="busy !== null" :aria-label="'Move row ' + (i + 1) + ' to a character'" :data-locker-to="i" @change="moveTo(i, $event)">
                  <option value="">Move to</option>
                  <option v-for="person in takers" :key="person.id" :value="person.id">To {{ person.name }}</option>
                </select>
                <button type="button" class="ui-btn lk-drop" :disabled="busy !== null" :aria-label="'Remove ' + (row.type || 'this row')" title="Remove this row" :data-locker-remove="i" @click="remove(i)"><Icon name="xmark" :size="11" /></button>
              </td>
            </template>
            <template v-else>
              <td v-for="column in COLUMNS" :key="column" :class="'is-' + column" :data-locker-text="i + ':' + column">{{ shown(row, column) }}</td>
            </template>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else class="lk-none">{{ NO_LOCKER }}</p>
    <form v-if="canWrite" class="lk-add" data-locker-add @submit.prevent="addRow">
      <label v-for="column in COLUMNS" :key="column" class="lk-fld" :class="'is-' + column">
        <span>{{ COLUMN_WORDS[column] }}</span>
        <input v-model="add[column]" class="lk-box" :maxlength="LIMIT[column]" :inputmode="column === 'kg' ? 'decimal' : undefined" :disabled="busy !== null" :data-locker-new="column" />
      </label>
      <p v-if="addError" class="lk-err" role="alert">{{ addError }}</p>
      <button type="submit" class="ui-btn is-primary" :disabled="busy !== null" data-locker-post>Add to the locker</button>
    </form>
  </section>
</template>

<style>
.lk-head {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 4px 12px;
  margin-bottom: 8px;
}

.lk-head .ui-frame-label {
  flex: 1 1 auto;
  margin: 0;
}

.lk-sum {
  color: var(--text-muted);
  font: 500 12.5px/1.4 var(--font-text);
  font-variant-numeric: var(--tabular);
}

.lk-wrap {
  overflow-x: auto;
}

/* Narrower than its columns (a phone), the table scrolls in its wrap, as the sheet's tables do; the boxes never shrink to nothing. */
.lk-table {
  width: 100%;
  min-width: 520px;
  border-collapse: collapse;
  font: 400 13.5px/1.4 var(--font-text);
}

.lk-table th,
.lk-table td {
  padding: 4px 8px 4px 0;
  text-align: left;
  vertical-align: middle;
  border-bottom: 1px solid var(--line-soft);
}

.lk-table thead th {
  color: var(--text-muted);
  font: 500 12px/1.4 var(--font-text);
}

.lk-table .is-type { min-width: 120px; }
.lk-table .is-tl { width: 56px; }
.lk-table .is-kg { width: 64px; font-variant-numeric: var(--tabular); }
.lk-table .is-notes { min-width: 140px; }
.lk-table .is-acts { width: 1%; white-space: nowrap; }

.lk-acts {
  display: flex;
  align-items: center;
  gap: 6px;
}

.lk-box {
  box-sizing: border-box;
  width: 100%;
  min-height: 34px;
  padding: 6px 9px;
  border: 1px solid var(--control-line);
  border-radius: var(--r-2);
  background: var(--bg-1);
  color: var(--text-0);
  font: 400 14px/1.3 var(--font-text);
}

.lk-box:focus-visible {
  outline: 2px solid var(--focus);
  outline-offset: 1px;
}

.lk-to {
  width: auto;
  max-width: 180px;
}

.ui-btn.lk-drop {
  min-width: 34px;
  padding: 6px 8px;
}

.lk-none {
  margin: 0;
  color: var(--text-muted);
}

.lk-add {
  display: flex;
  flex-wrap: wrap;
  align-items: flex-end;
  gap: 10px;
  margin-top: 10px;
}

.lk-fld {
  display: flex;
  flex: 1 1 110px;
  flex-direction: column;
  gap: 4px;
  min-width: 0;
  color: var(--text-muted);
  font: 500 12px/1.3 var(--font-text);
}

.lk-fld.is-type,
.lk-fld.is-notes {
  flex: 2 1 180px;
}

.lk-fld.is-tl,
.lk-fld.is-kg {
  flex: 0 1 80px;
}

.lk-err {
  flex: 1 1 100%;
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--danger);
  background: var(--bg-1);
  color: var(--text-1);
}

.lk-visually {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

@media (max-width: 480px) {
  .lk-table .is-tl { width: 48px; }
  .lk-table .is-kg { width: 56px; }
}
</style>
