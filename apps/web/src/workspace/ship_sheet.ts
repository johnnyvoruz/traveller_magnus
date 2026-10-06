/**
 * The ship sheet's fields (slice_2_campaign.md K13 part 3; plan §5.3b): the 312 named
 * fields of the official PDF, read from rules/ through the generated wrapper, laid out as
 * the PDF lays them out: its sections in page order, its rows by their box's height on the
 * page, numbered series ("Turret Mount 1", "Turret Mount 2", …) as a table. Names are the
 * PDF's own, kept as spelled; they are the keys the values are stored under. Nothing here
 * says what a field means or computes anything from one. Pure.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration; its shape is checked below.
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_ship_sheet_fields.js';

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

/** One field as the page draws it: the PDF's name, and the label the layout shows for it. */
export type Cell = { field: SheetField; label: string };

/** A numbered series ("Cargo Type 1" … "Cargo Type 16") drawn as a table. */
export type Table = {
    kind: 'table';
    /** The series' names without their number, in the PDF's left-to-right order: the columns. */
    columns: string[];
    /** The numbers, in order: the rows. */
    numbers: number[];
    /** cells[row][column], null where the PDF has no such field. */
    cells: (SheetField | null)[][];
    /** Checkboxes are laid the other way: a row per series, a column per number. */
    flipped: boolean;
};

export type Row = { kind: 'row'; cells: Cell[] };

export type Section = {
    name: string;
    page: number;
    blocks: (Row | Table)[];
};

const SERIES = /^(.*\S)\s+(\d+)$/;
/** Two boxes within this many points down the page share a row. */
const ROW_TOLERANCE = 4;
/** A text box this tall is several lines. */
const TALL = 30;

export const SHEET_RULES: SheetRules = generated as SheetRules;

export function sheetFields(): SheetField[] {
    return SHEET_RULES.fields;
}

/** The field a name denotes, or null. */
export function fieldNamed(name: string): SheetField | null {
    return SHEET_RULES.fields.find((field) => field.name === name) ?? null;
}

export function isTall(field: SheetField): boolean {
    return field.type === 'text' && field.box.h >= TALL;
}

function seriesOf(name: string): { base: string; n: number } | null {
    const found = SERIES.exec(name);
    return found ? { base: found[1], n: Number(found[2]) } : null;
}

function byPage(a: SheetField, b: SheetField): number {
    // Down the page (the PDF's y grows upward), then across it.
    return b.box.y - a.box.y || a.box.x - b.box.x;
}

/** The sections in page order, each in the order its fields fall on the page. */
export function sheetSections(fields: readonly SheetField[] = SHEET_RULES.fields): Section[] {
    const order: { name: string; page: number; fields: SheetField[] }[] = [];
    for (const field of [...fields].sort((a, b) => a.page - b.page || byPage(a, b))) {
        let found = order.find((item) => item.name === field.section && item.page === field.page);
        if (!found) {
            found = { name: field.section, page: field.page, fields: [] };
            order.push(found);
        }
        found.fields.push(field);
    }
    return order.map((item) => ({ name: item.name, page: item.page, blocks: blocksOf(item.fields) }));
}

/** A section's fields as rows and tables: numbered series become one table each run; the rest fall into rows by height. */
function blocksOf(fields: readonly SheetField[]): (Row | Table)[] {
    const blocks: (Row | Table)[] = [];
    const inSeries = new Map<string, SheetField[]>();
    const loose: SheetField[] = [];
    for (const field of fields) {
        const series = seriesOf(field.name);
        if (!series) {
            loose.push(field);
            continue;
        }
        const list = inSeries.get(series.base);
        if (list) list.push(field);
        else inSeries.set(series.base, [field]);
    }
    // Series that share their numbers and sit on the same rows are one table.
    const bases = [...inSeries.keys()].sort((a, b) => {
        const top = (base: string) => Math.max(...inSeries.get(base)!.map((f) => f.box.y));
        const left = (base: string) => Math.min(...inSeries.get(base)!.map((f) => f.box.x));
        return top(b) - top(a) || left(a) - left(b);
    });
    const used = new Set<string>();
    const tables: { table: Table; top: number }[] = [];
    for (const base of bases) {
        if (used.has(base)) continue;
        const group = [base];
        used.add(base);
        const numbers = inSeries.get(base)!.map((f) => seriesOf(f.name)!.n);
        const key = numbers.slice().sort((a, b) => a - b).join(',');
        const type = inSeries.get(base)![0].type;
        for (const other of bases) {
            if (used.has(other)) continue;
            const theirs = inSeries.get(other)!;
            const same = theirs.map((f) => seriesOf(f.name)!.n).sort((a, b) => a - b).join(',') === key && theirs[0].type === type;
            if (!same) continue;
            // The same rows on the page: each number's box at the same height.
            const mine = inSeries.get(base)!;
            const aligned = mine.every((f) => {
                const n = seriesOf(f.name)!.n;
                const twin = theirs.find((t) => seriesOf(t.name)!.n === n);
                return twin !== undefined && Math.abs(twin.box.y - f.box.y) <= ROW_TOLERANCE;
            });
            // Checkbox series are rows of one table whatever their heights (the critical hits).
            if (aligned || type === 'checkbox') {
                group.push(other);
                used.add(other);
            }
        }
        const flipped = type === 'checkbox';
        const sortedNumbers = numbers.slice().sort((a, b) => a - b);
        const left = (base: string) => Math.min(...inSeries.get(base)!.map((f) => f.box.x));
        const top = (base: string) => Math.max(...inSeries.get(base)!.map((f) => f.box.y));
        // Across the page for a table of text; for the checkbox rows, the page's columns first, then down each.
        const columns = group.sort((a, b) => (flipped ? left(a) - left(b) || top(b) - top(a) : left(a) - left(b)));
        const cell = (col: string, n: number): SheetField | null => inSeries.get(col)!.find((f) => seriesOf(f.name)!.n === n) ?? null;
        const cells = flipped
            ? columns.map((col) => sortedNumbers.map((n) => cell(col, n)))
            : sortedNumbers.map((n) => columns.map((col) => cell(col, n)));
        tables.push({
            table: { kind: 'table', columns, numbers: sortedNumbers, cells, flipped },
            top: Math.max(...group.flatMap((g) => inSeries.get(g)!.map((f) => f.box.y))),
        });
    }
    // Loose fields: rows by height.
    const rows: { row: Row; top: number }[] = [];
    for (const field of loose.sort(byPage)) {
        const last = rows[rows.length - 1];
        if (last && Math.abs(last.top - field.box.y) <= ROW_TOLERANCE) last.row.cells.push({ field, label: field.name });
        else rows.push({ row: { kind: 'row', cells: [{ field, label: field.name }] }, top: field.box.y });
    }
    const all = [...tables.map((t) => ({ block: t.table as Row | Table, top: t.top })), ...rows.map((r) => ({ block: r.row as Row | Table, top: r.top }))];
    all.sort((a, b) => b.top - a.top);
    for (const item of all) blocks.push(item.block);
    return blocks;
}

/** The value held for a field, in the type the field takes. */
export function valueOf(values: SheetValues | null | undefined, field: SheetField): SheetValue {
    const held = values ? values[field.name] : undefined;
    if (field.type === 'checkbox') return held === true;
    return typeof held === 'string' ? held : '';
}

/** The values with one changed; an empty text or an unticked box is dropped, so the sheet stores only what was written. */
export function withValue(values: SheetValues | null | undefined, field: SheetField, value: SheetValue): SheetValues {
    const next: SheetValues = { ...(values ?? {}) };
    const keep = field.type === 'checkbox' ? value === true : typeof value === 'string' && value.trim() !== '';
    if (keep) next[field.name] = field.type === 'checkbox' ? true : (value as string);
    else delete next[field.name];
    return next;
}

/** The record's sheet with these field values, the rest of the sheet (the deck plan) beside them. */
export function sheetWithFields(sheet: unknown, values: SheetValues): Record<string, unknown> {
    const base = sheet && typeof sheet === 'object' && !Array.isArray(sheet) ? { ...(sheet as Record<string, unknown>) } : {};
    base.fields = values;
    base.schema = 'mgt2e_ship_sheet@1';
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
