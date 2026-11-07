/**
 * The World card in Edit this system (DH3; findings/hex_editor_plan.md §3.2 and §4; Johnny 144): the
 * world's fields first, in the legacy editor's order; Starport, Size and Atmosphere as lists from the
 * rules file; the words a digit means beside every profile cell; the UWP string rebuilt as the cells
 * are typed. Every word comes from rules/mgt2e_uwp_codes.json through the generated wrapper (the
 * text's words, with their lines); nothing here is a rule from memory. Pure: it runs under Node.
 */
import type { FormField, FormValue } from '@voyage/shared';
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import generated from '../../../../../packages/engines/src/generated/rules/mgt2e_uwp_codes.js';

type Starport = { code: string; quality: string; berthingCost: string; fuel: string; facilities: string; bases: string };
type Size = { code: string; diameter: string; example: string; gravity: string };
type Atmosphere = { code: string; composition: string; example: string; pressure: string; gear: string };
type Hydro = { code: string; percentage: string; description: string };
type Population = { code: string; inhabitants: string; range: string; description: string };
type Government = { code: string; type: string; description: string; examples: string; contraband: string };
type Law = { level: string; weaponsBanned: string; armourBanned: string };
type UwpCodes = {
    starport: { classes: Starport[] };
    size: { codes: Size[] };
    atmosphere: { codes: Atmosphere[] };
    hydrographics: { codes: Hydro[] };
    population: { codes: Population[] };
    government: { codes: Government[] };
    lawLevel: { levels: Law[] };
};

export const UWP_CODES = generated as UwpCodes;

/** The eight cells of the profile, in the legacy editor's order. */
export const CELLS = ['st', 's', 'a', 'h', 'p', 'g', 'l', 'tl'] as const;
export type Cell = (typeof CELLS)[number];

/** The three sections of the form the card holds, in the card's order. */
export const WORLD_SECTION_IDS = ['name', 'profile', 'chart'] as const;

/**
 * The chart fields in the legacy editor's order (js/hex_editor.js, the panel's rows): the zone, the
 * allegiance, the region, the notes, the bases with the gas giant last among them, then the trade
 * codes, the PBG and the stellar line. A field the server adds that is not here comes after, in its own order.
 */
const CHART_ORDER = ['chart.zone', 'chart.allegiance', 'chart.region', 'chart.notes', 'chart.base.', 'chart.gasGiant', 'chart.trade', 'chart.pbg', 'chart.stellar'];

const DIGITS = '0123456789ABCDEFGHJKLMNPQRSTUVWXYZ';

/** The cell a profile field id names: `profile.s`, or a hand body's `<id>.profile.s`; null for any other field. */
export function cellOf(fieldId: string): Cell | null {
    const match = /(?:^|\.)profile\.([a-z]+)$/.exec(fieldId);
    if (!match) return null;
    return (CELLS as readonly string[]).includes(match[1]) ? match[1] as Cell : null;
}

/** A cell's value as the one ehex character the chart writes: a number as its digit, a string as its first character, else ''. */
export function digitOf(value: FormValue | undefined): string {
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DIGITS.length) return DIGITS[value];
    if (typeof value === 'string') return value.trim().toUpperCase().slice(0, 1);
    return '';
}

/** The digit's number, for a law level that reads the text's "9+" row. */
function digitValue(digit: string): number {
    const at = DIGITS.indexOf(digit);
    return at >= 0 ? at : -1;
}

const join = (parts: readonly string[]): string => parts.map((part) => part.trim()).filter(Boolean).join(' · ');

function starportWords(row: Starport): string {
    return join([row.quality, row.berthingCost ? 'berthing ' + row.berthingCost : '', row.fuel && row.fuel !== 'None' ? row.fuel + ' fuel' : row.fuel === 'None' ? 'no fuel' : '']);
}
function sizeWords(row: Size): string {
    return join([row.diameter, row.example, row.gravity === 'Negligible' ? 'negligible gravity' : row.gravity ? row.gravity + ' G' : '']);
}
function atmosphereWords(row: Atmosphere): string {
    return join([row.composition, row.example, row.pressure, row.gear]);
}

/**
 * The words the rules text gives this cell's digit, beside the cell: '' where the text gives none
 * (Tech Level; a digit outside the text's table). A Law Level of 9 or more reads the text's "9+" row.
 */
export function wordsFor(cell: Cell, value: FormValue | undefined): string {
    const digit = digitOf(value);
    if (!digit) return '';
    switch (cell) {
        case 'st': { const row = UWP_CODES.starport.classes.find((item) => item.code === digit); return row ? starportWords(row) : ''; }
        case 's': { const row = UWP_CODES.size.codes.find((item) => item.code === digit); return row ? sizeWords(row) : ''; }
        case 'a': { const row = UWP_CODES.atmosphere.codes.find((item) => item.code === digit); return row ? atmosphereWords(row) : ''; }
        case 'h': { const row = UWP_CODES.hydrographics.codes.find((item) => item.code === digit); return row ? join([row.percentage, row.description]) : ''; }
        case 'p': { const row = UWP_CODES.population.codes.find((item) => item.code === digit); return row ? join([row.inhabitants, row.range, row.description === '—' ? '' : row.description]) : ''; }
        case 'g': { const row = UWP_CODES.government.codes.find((item) => item.code === digit); return row ? join([row.type, row.description]) : ''; }
        case 'l': {
            const n = digitValue(digit);
            const row = UWP_CODES.lawLevel.levels.find((item) => (item.level === '9+' ? n >= 9 : item.level === digit));
            if (!row) return '';
            return join(['Weapons banned: ' + row.weaponsBanned, row.armourBanned ? 'armour banned: ' + row.armourBanned : '']);
        }
        default: return '';
    }
}

/**
 * The list a cell offers, from the rules tables: Starport, Size and Atmosphere; null for the cells that stay a
 * box. An option is the code and the table's first word ("C · Routine", "7 · 11,200km", "A · Exotic"): the
 * cell is large code type with no room for more, and the full words stand under it (DF37).
 */
export function listFor(cell: Cell): { value: string; label: string }[] | null {
    if (cell === 'st') return UWP_CODES.starport.classes.map((row) => ({ value: row.code, label: row.code + ' · ' + row.quality }));
    if (cell === 's') return UWP_CODES.size.codes.map((row) => ({ value: row.code, label: row.code + ' · ' + row.diameter }));
    if (cell === 'a') return UWP_CODES.atmosphere.codes.map((row) => ({ value: row.code, label: row.code + ' · ' + row.composition }));
    return null;
}

/**
 * The field as the card draws it: a listed cell becomes a choice of the table's codes; the other cells a
 * one-character box reading the ehex digit the chart writes (A, not 10). Either way the value sent is the one
 * character, which the server takes for any profile cell (`profileChar`). Every other field is itself.
 */
export function cellField(field: FormField): FormField {
    const cell = cellOf(field.id);
    if (!cell || field.permission === 'read') return field;
    const options = listFor(cell);
    if (!options) return { ...field, kind: 'text', value: digitOf(field.value) };
    return { ...field, kind: 'choice', value: digitOf(field.value), options };
}

/** The chart fields in the legacy editor's order. */
export function orderChart(fields: readonly FormField[]): FormField[] {
    const rank = (id: string): number => {
        const at = CHART_ORDER.findIndex((key) => (key.endsWith('.') ? id.startsWith(key) : id === key));
        return at < 0 ? CHART_ORDER.length : at;
    };
    return fields.map((field, i) => ({ field, i })).sort((a, b) => rank(a.field.id) - rank(b.field.id) || a.i - b.i).map((item) => item.field);
}

/** "A788899-C" from the cells as typed; a cell not yet typed reads "?". */
export function uwpOf(fields: readonly FormField[]): string {
    const at = (cell: Cell): string => {
        const field = fields.find((item) => cellOf(item.id) === cell);
        return (field ? digitOf(field.value) : '') || '?';
    };
    return at('st') + at('s') + at('a') + at('h') + at('p') + at('g') + at('l') + '-' + at('tl');
}
