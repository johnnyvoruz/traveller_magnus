/**
 * The Ship's locker (DS6; findings/ship_crew_plan.md §3 (5); Johnny 137 and 142): rows of
 * `status.locker` on a vessel, the four columns the character sheet's Equipment table has
 * (Type, TL, KG, Notes), shared by every role with the locker switch. Separate from the
 * cargo: no tons against the hold, no money. No rule is read: the rules files hold no locker.
 * This file is pure: the rows, their words, and the Equipment table's boxes a row moves to
 * and from.
 */
import type { CampaignRecord, LockerRow } from '@voyage/shared';

export const NO_LOCKER = 'Nothing in the locker.';
export const NOT_MOVED = 'The item was not moved. Try again.';
export const NOT_CHANGED = 'The locker was not changed. Try again.';
export const NO_TAKER = 'That character’s sheet cannot be written from here.';
export const WRITE_TYPE = 'Write at least the type.';
/** The Equipment table of the character sheet has this many rows (workspace/character_sheet.ts, `table('Equipment', …, 8)`). */
export const EQUIPMENT_ROWS = 8;
export const EQUIPMENT_COLUMNS = ['Type', 'TL', 'KG', 'Notes'] as const;

export type Column = 'type' | 'tl' | 'kg' | 'notes';
export const COLUMNS: readonly Column[] = ['type', 'tl', 'kg', 'notes'];
export const COLUMN_WORDS: Readonly<Record<Column, string>> = { type: 'Type', tl: 'TL', kg: 'KG', notes: 'Notes' };

/** The rows as stored: a row short of a column, or not an object, is not a row. */
export function lockerOf(record: CampaignRecord | null | undefined): LockerRow[] {
    const status = record && record.status && typeof record.status === 'object' ? (record.status as { locker?: unknown }) : null;
    const held = status && Array.isArray(status.locker) ? status.locker : [];
    const out: LockerRow[] = [];
    for (const item of held) {
        if (!item || typeof item !== 'object') continue;
        const row = item as Partial<Record<keyof LockerRow, unknown>>;
        if (typeof row.type !== 'string' || typeof row.tl !== 'string' || typeof row.kg !== 'number' || typeof row.notes !== 'string') continue;
        out.push({ type: row.type, tl: row.tl, kg: row.kg, notes: row.notes });
    }
    return out;
}

/** A typed KG box as the row's number: the first number in it, zero when there is none or it is not one. */
export function kgOf(text: string | number): number {
    if (typeof text === 'number') return Number.isFinite(text) && text >= 0 ? text : 0;
    const found = /-?\d+(?:[.,]\d+)?/.exec(text.replace(/\s/g, ''));
    if (!found) return 0;
    const n = Number(found[0].replace(',', '.'));
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

/** A row from the four boxes as typed; the words trimmed, the KG read as a number. */
export function rowFrom(boxes: { type: string; tl: string; kg: string | number; notes: string }): LockerRow {
    return { type: boxes.type.trim(), tl: boxes.tl.trim(), kg: kgOf(boxes.kg), notes: boxes.notes.trim() };
}

/** A row with nothing in it is not kept. */
export function isBlank(row: LockerRow): boolean {
    return row.type === '' && row.tl === '' && row.kg === 0 && row.notes === '';
}

export function lockerWith(rows: readonly LockerRow[], row: LockerRow): LockerRow[] {
    return isBlank(row) ? [...rows] : [...rows, row];
}

/** The row at `index` replaced; a row changed to nothing is dropped. */
export function lockerChanged(rows: readonly LockerRow[], index: number, row: LockerRow): LockerRow[] {
    if (index < 0 || index >= rows.length) return [...rows];
    if (isBlank(row)) return rows.filter((_, at) => at !== index);
    return rows.map((held, at) => (at === index ? row : held));
}

export function lockerWithout(rows: readonly LockerRow[], index: number): LockerRow[] {
    return rows.filter((_, at) => at !== index);
}

/** The KG column summed, from what was typed; no rule. */
export function kgSum(rows: readonly LockerRow[]): number {
    return Math.round(rows.reduce((sum, row) => sum + row.kg, 0) * 100) / 100;
}

/** "38 kg in the locker"; nothing at all, the empty words. */
export function kgWords(rows: readonly LockerRow[]): string {
    if (!rows.length) return NO_LOCKER;
    return kgSum(rows) + ' kg in the locker';
}

/** A KG number as the sheet's box reads it: a plain number, nothing for zero. */
export function kgText(kg: number): string {
    return kg > 0 ? String(kg) : '';
}

/** The item's name for a toast: its type, or the notes, or "an item". */
export function itemWords(row: LockerRow): string {
    return row.type || row.notes || 'an item';
}

// ---- The character sheet's Equipment table, where a row moves to and from (Johnny 142) ----

/** The four box names of Equipment row `n` (1 to 8), as rules/mgt2e_character_sheet_fields.json spells them. */
export function equipmentNames(n: number): Record<Column, string> {
    return { type: 'Equipment Type ' + n, tl: 'Equipment TL ' + n, kg: 'Equipment KG ' + n, notes: 'Equipment Notes ' + n };
}

export type EquipmentRow = { n: number; type: string; tl: string; kg: string; notes: string };

function textAt(fields: Readonly<Record<string, unknown>>, name: string): string {
    const held = fields[name];
    return typeof held === 'string' ? held : '';
}

/** The eight rows of the Equipment table as the sheet's boxes hold them. */
export function equipmentRows(fields: Readonly<Record<string, unknown>>): EquipmentRow[] {
    const out: EquipmentRow[] = [];
    for (let n = 1; n <= EQUIPMENT_ROWS; n += 1) {
        const names = equipmentNames(n);
        out.push({ n, type: textAt(fields, names.type), tl: textAt(fields, names.tl), kg: textAt(fields, names.kg), notes: textAt(fields, names.notes) });
    }
    return out;
}

export function equipmentFilled(row: EquipmentRow): boolean {
    return row.type.trim() !== '' || row.tl.trim() !== '' || row.kg.trim() !== '' || row.notes.trim() !== '';
}

/** The first Equipment row with nothing in it, or null when all eight are in use. */
export function firstEmptyEquipment(fields: Readonly<Record<string, unknown>>): number | null {
    const found = equipmentRows(fields).find((row) => !equipmentFilled(row));
    return found ? found.n : null;
}

/** The boxes of Equipment row `n` set to a locker row; with null, cleared. */
export function equipmentSets(n: number, row: LockerRow | null): { field: string; value: string }[] {
    const names = equipmentNames(n);
    return [
        { field: names.type, value: row ? row.type : '' },
        { field: names.tl, value: row ? row.tl : '' },
        { field: names.kg, value: row ? kgText(row.kg) : '' },
        { field: names.notes, value: row ? row.notes : '' },
    ];
}

/** A locker row from an Equipment row's boxes. */
export function rowFromEquipment(row: EquipmentRow): LockerRow {
    return rowFrom({ type: row.type, tl: row.tl, kg: row.kg, notes: row.notes });
}

/** The sheet's boxes with these sets applied, as a plain sheet's values (an emptied box leaves). */
export function withSets(fields: Readonly<Record<string, string | boolean>>, sets: readonly { field: string; value: string }[]): Record<string, string | boolean> {
    const out: Record<string, string | boolean> = { ...fields };
    for (const set of sets) {
        if (set.value.trim() === '') delete out[set.field];
        else out[set.field] = set.value;
    }
    return out;
}

export function fullWords(name: string): string {
    return name + '’s Equipment table is full. Clear a row on the sheet first.';
}

export function movedToSheetWords(row: LockerRow, name: string): string {
    return 'Moved ' + itemWords(row) + ' to ' + name + '’s sheet.';
}

export function movedToLockerWords(row: LockerRow, ship: string): string {
    return 'Moved ' + itemWords(row) + ' to ' + ship + '’s locker.';
}
