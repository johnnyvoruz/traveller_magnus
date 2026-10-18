/**
 * Presentation for the world panel. Nothing here changes a stored value or a calculation.
 * Open sections are remembered on this device. A blocked store leaves every section open.
 */
import type { FactTile, StatRow } from './model.ts';
import { tempLines } from '../design/units.ts';

export const SECTION_KEY = 'worldPanel.sections';

export type FoldId = 'records' | 'orbit' | 'physical' | 'life';
export type FoldOpen = Record<FoldId, boolean>;

const IDS: readonly FoldId[] = ['records', 'orbit', 'physical', 'life'];

export function openFolds(): FoldOpen {
    return { records: true, orbit: true, physical: true, life: true };
}

export function readFolds(raw: string | null): FoldOpen {
    const next = openFolds();
    if (!raw) return next;
    try {
        const parsed = JSON.parse(raw) as Partial<Record<FoldId, unknown>> | null;
        if (!parsed || typeof parsed !== 'object') return openFolds();
        for (const id of IDS) {
            if (typeof parsed[id] === 'boolean') next[id] = parsed[id];
        }
        return next;
    } catch {
        return openFolds();
    }
}

export function loadFolds(): FoldOpen {
    try {
        const storage = globalThis.localStorage;
        if (!storage) return openFolds();
        return readFolds(storage.getItem(SECTION_KEY));
    } catch {
        return openFolds();
    }
}

export function saveFolds(state: FoldOpen): void {
    try {
        const storage = globalThis.localStorage;
        if (!storage) return;
        storage.setItem(SECTION_KEY, JSON.stringify(state));
    } catch {
        // The panel keeps the state it already shows.
    }
}

const HIDDEN = new Set(['Tidally locked', 'Twilight zone', 'Orbital period (days)']);

/** Rows for the Orbit, Physical, and Life sections: units sit on the value, and kelvin is not shown. */
export function presentRows(rows: readonly StatRow[]): StatRow[] {
    const out: StatRow[] = [];
    for (const row of rows) {
        if (HIDDEN.has(row.label)) continue;
        const unit = /^(.*?) \(([^)]+)\)$/.exec(row.label);
        let label = row.label;
        let text = row.text;
        if (unit && unit[1] && unit[2] && !row.code && !row.chips) {
            label = unit[1];
            if (!text.includes(unit[2])) text = unit[2] === '\u00B0' ? text + unit[2] : text + ' ' + unit[2];
        }
        const lines = tempLines(text);
        if (lines) text = lines[0] + ' \u00B7 ' + lines[1];
        out.push({ ...row, label, text });
    }
    return out;
}

export function fieldSummary(count: number): string {
    return count === 1 ? '1 field' : count + ' fields';
}

export function recordsSummary(count: number): string {
    if (count <= 0) return 'None yet';
    return count === 1 ? '1 record' : count + ' records';
}

export function hasTwilight(rows: readonly StatRow[]): boolean {
    return rows.some((row) => row.label === 'Twilight zone');
}

export type StatCell = { label: string; value: string; aside: string };

const LEAD = ['Diameter', 'Gravity', 'Mean temp.', 'Rotation', 'Year'];

/** The 3+2 stat panel. Null when this body is not a world with those five facts. */
export function statCells(
    facts: readonly FactTile[],
    yearValue: string | null,
    twilight: boolean,
): StatCell[] | null {
    const by = new Map(facts.map((fact) => [fact.label, fact]));
    if (!LEAD.every((label) => by.has(label))) return null;
    const cells: StatCell[] = [];
    for (const label of ['Diameter', 'Gravity']) {
        const fact = by.get(label);
        if (!fact) return null;
        cells.push({ label, value: fact.value, aside: '' });
    }
    const temp = by.get('Mean temp.');
    if (!temp) return null;
    const lines = tempLines(temp.value);
    cells.push({ label: 'Mean temp.', value: lines ? lines[0] : temp.value, aside: lines ? lines[1] : '' });
    const rotation = by.get('Rotation');
    if (!rotation) return null;
    cells.push({
        label: 'Rotation',
        value: rotation.value,
        aside: rotation.value === 'Tidally locked' && twilight ? 'twilight band' : '',
    });
    const year = by.get('Year');
    if (!year) return null;
    if (yearValue) cells.push({ label: 'Year', value: yearValue, aside: 'std days' });
    else {
        const days = /^(.*)\s+d$/.exec(year.value);
        cells.push({ label: 'Year', value: days ? days[1] : year.value, aside: days ? 'std days' : '' });
    }
    return cells;
}

/** The date popover closes on Go, on Escape, and on a press outside it. */
export function timePopoverCloses(input: { go: boolean; key: string; inside: boolean }): boolean {
    if (input.go) return true;
    if (input.key === 'Escape') return true;
    return !input.inside;
}

/** Map description for the info button, and the lighting phrase for the corner label. */
export function lightingOf(caption: string): { info: string; light: string } {
    const mark = ' \u00B7 locked, ';
    const at = caption.indexOf(mark);
    if (at < 0) return { info: caption, light: '' };
    const rest = caption.slice(at + mark.length);
    const light = rest ? rest.charAt(0).toUpperCase() + rest.slice(1) : '';
    return { info: caption.slice(0, at), light };
}

export function foldId(heading: string): FoldId | null {
    if (heading === 'Orbit') return 'orbit';
    if (heading === 'Physical') return 'physical';
    if (heading === 'Life & resources') return 'life';
    return null;
}
