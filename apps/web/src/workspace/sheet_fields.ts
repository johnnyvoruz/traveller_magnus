/**
 * What every official sheet shares (the ship's and the character's): a rules file is a flat
 * list of the PDF's form widgets, each a named box on a page, and a sheet stores what was
 * typed under the PDF's own names. Reading and writing those values, and telling a tall
 * box or a numbered series, are the same for both; how the flat list is grouped on the
 * page is each sheet's own (ship_sheet.ts, character_sheet.ts). Nothing here says what a
 * field means or computes anything from one. Pure.
 */

export type SheetFieldType = 'text' | 'checkbox';

export type SheetField = {
    name: string;
    page: number;
    type: SheetFieldType;
    box: { x: number; y: number; w: number; h: number };
    section: string;
};

export type SheetRules = {
    source: string;
    pageSize: { width: number; height: number };
    fields: SheetField[];
};

/** A value as stored: text for a text field, true or false for a checkbox. */
export type SheetValue = string | boolean;
export type SheetValues = Record<string, SheetValue>;

/** A sheet as a component is given it: which form it is, and what was typed. It does not say where it is kept. */
export type SheetDoc = { schema: string; fields: SheetValues };

const SERIES = /^(.*\S)\s+(\d+)$/;
/** A text box this tall is several lines. */
const TALL = 30;

export function isTall(field: SheetField): boolean {
    return field.type === 'text' && field.box.h >= TALL;
}

/** "Cargo Type 12" is the twelfth of the series "Cargo Type"; null for a name with no number. */
export function seriesOf(name: string): { base: string; n: number } | null {
    const found = SERIES.exec(name);
    return found ? { base: found[1], n: Number(found[2]) } : null;
}

/** Down the page (the PDF's y grows upward), then across it. */
export function byPage(a: SheetField, b: SheetField): number {
    return b.box.y - a.box.y || a.box.x - b.box.x;
}

/** The value held for a field, in the type the field takes. */
export function valueOf(values: SheetValues | null | undefined, field: Pick<SheetField, 'name' | 'type'>): SheetValue {
    const held = values ? values[field.name] : undefined;
    if (field.type === 'checkbox') return held === true;
    return typeof held === 'string' ? held : '';
}

/** The values with one changed; an empty text or an unticked box is dropped, so the sheet stores only what was written. */
export function withValue(values: SheetValues | null | undefined, field: Pick<SheetField, 'name' | 'type'>, value: SheetValue): SheetValues {
    const next: SheetValues = { ...(values ?? {}) };
    const keep = field.type === 'checkbox' ? value === true : typeof value === 'string' && value.trim() !== '';
    if (keep) next[field.name] = field.type === 'checkbox' ? true : (value as string);
    else delete next[field.name];
    return next;
}

/** A record's sheet with these field values under a schema; whatever else the sheet holds stays beside them. */
export function sheetWith(sheet: unknown, values: SheetValues, schema: string): Record<string, unknown> {
    const base = sheet && typeof sheet === 'object' && !Array.isArray(sheet) ? { ...(sheet as Record<string, unknown>) } : {};
    base.fields = values;
    base.schema = schema;
    return base;
}

/** The field values a sheet holds, or null when it holds none. */
export function fieldsOf(sheet: unknown): SheetValues | null {
    if (!sheet || typeof sheet !== 'object' || Array.isArray(sheet)) return null;
    const held = (sheet as Record<string, unknown>).fields;
    if (!held || typeof held !== 'object' || Array.isArray(held)) return null;
    const out: SheetValues = {};
    for (const [name, value] of Object.entries(held as Record<string, unknown>)) {
        if (typeof value === 'string' || typeof value === 'boolean') out[name] = value;
    }
    return out;
}

/** How many fields hold a value. */
export function filledCount(values: SheetValues | null): number {
    return values ? Object.keys(values).length : 0;
}

// ---- One box under two hands (the bar for a live sheet is two people in one spreadsheet) ----

/** A box as it stands: what it shows, whether the person is in it, and whether they have typed since they entered. */
export type BoxState = { shown: string; focused: boolean; dirty: boolean };

export function boxOf(given: string): BoxState {
    return { shown: given, focused: false, dirty: false };
}

/**
 * A value arrives from outside. A box the person is not in takes it at once, and says it
 * changed (so it can be marked for a moment). **The box the person is in keeps its text**:
 * what they see, their caret and their focus are theirs until they leave.
 */
export function boxGiven(state: BoxState, given: string): { state: BoxState; changed: boolean } {
    if (state.focused) return { state, changed: false };
    return { state: { ...state, shown: given }, changed: given !== state.shown };
}

export function boxEntered(state: BoxState): BoxState {
    return { ...state, focused: true, dirty: false };
}

export function boxTyped(state: BoxState, text: string): BoxState {
    return { ...state, shown: text, dirty: true };
}

/**
 * The person leaves the box (or presses Enter in a one-line box). What they typed is
 * committed when it differs from what the sheet holds; a box they only looked at takes
 * whatever arrived while they were in it.
 */
export function boxLeft(state: BoxState, given: string): { state: BoxState; commit: string | null } {
    if (state.dirty && state.shown !== given) return { state: { shown: state.shown, focused: false, dirty: false }, commit: state.shown };
    return { state: { shown: given, focused: false, dirty: false }, commit: null };
}
