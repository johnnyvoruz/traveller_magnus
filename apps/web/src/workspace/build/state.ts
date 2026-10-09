/**
 * Build: the switch, what is selected, and the words for it (findings/builder_system_design.md
 * §1 and §2). The reactive part is one object; everything else is pure and runs under Node.
 */
import { reactive } from 'vue';
import { builderPairReady, type SectorHex, type SectorIndex, type Settings } from '@voyage/shared';
import { storageGet, storageSet } from '../../platform/browser.ts';
import { parseHexKey } from '../places.ts';
import type { BuildRow, GenerateChoice, Generator, HexState, JobProgress, Preview } from './seam.ts';

const ON_KEY = 'voyage_build_on';
const CHOICE_KEY = 'voyage_build_choice';

/** One legacy sector: the most hexes one act takes (js/macro_orchestrator.js:99). */
export const SELECTION_CAP = 1280;

export type Engine = {
    id: string;
    /** The legacy menu's own name for it (hex_map.html context menu). */
    label: string;
    /** The full-system generators the server runs for it today (`builderPairReady`, packages/shared). */
    generators: Generator[];
    /** False until the server runs it and the dossier can walk its systems: listed as not yet. */
    ready: boolean;
};

const BOTH: readonly Generator[] = ['bottom-up', 'top-down'];

function engine(id: string, label: string): Engine {
    const generators = BOTH.filter((generator) => builderPairReady(id, generator));
    return { id, label, generators, ready: generators.length > 0 };
}

export const ENGINES: readonly Engine[] = [
    engine('MgT2E', 'Mongoose 2nd Ed (MgT2E)'),
    engine('AoW', 'Architect of Worlds'),
    engine('CT', 'Classic Traveller (CT)'),
    engine('T5', 'Traveller 5 (T5)'),
    engine('RTT', 'RTT WorldGen'),
];

export const GENERATOR_LABEL: Record<Generator, string> = {
    'bottom-up': 'Full system, bottom up',
    'top-down': 'Full system, top down',
};

export const DEFAULT_CHOICE: GenerateChoice = { engine: 'MgT2E', generator: 'top-down' };

/** A stored or typed choice, made one the sheet can offer. Anything else is the default. */
export function cleanChoice(raw: unknown): GenerateChoice {
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_CHOICE };
    const value = raw as { engine?: unknown; generator?: unknown };
    const engine = ENGINES.find((item) => item.id === value.engine && item.ready);
    if (!engine) return { ...DEFAULT_CHOICE };
    const generator = engine.generators.find((item) => item === value.generator) ?? engine.generators[0];
    return { engine: engine.id, generator };
}

/** "Mongoose 2nd Ed (MgT2E) · full system, bottom up". */
export function choiceLine(choice: GenerateChoice): string {
    const engine = ENGINES.find((item) => item.id === choice.engine);
    const how = GENERATOR_LABEL[choice.generator];
    return (engine ? engine.label : choice.engine) + ' · ' + how.charAt(0).toLowerCase() + how.slice(1);
}

function readChoice(): GenerateChoice {
    try {
        return cleanChoice(JSON.parse(storageGet(CHOICE_KEY) || 'null'));
    } catch {
        return { ...DEFAULT_CHOICE };
    }
}

export const build = reactive({
    /** The switch. Off, the app is exactly as it was. */
    on: storageGet(ON_KEY) === '1',
    /** A plain drag draws a box while this is on (the legacy "Select hexes"). */
    selecting: false,
    /** Hex keys, in the order they were picked. One hex is the route's; this holds two or more. */
    selection: [] as string[],
    choice: readChoice(),
    /** Many-hex only: hexes that already hold a system are generated again too. */
    filledToo: false,
    sheetOpen: false,
    preview: null as Preview | null,
    /** The hex a preview is being rolled for; empty when none is. */
    rolling: '',
    job: null as (JobProgress & { label: string }) | null,
    error: '',
});

export function setBuildOn(on: boolean): void {
    build.on = on;
    storageSet(ON_KEY, on ? '1' : '0');
    if (!on) {
        build.selecting = false;
        build.selection = [];
        build.sheetOpen = false;
        build.preview = null;
        build.error = '';
    }
}

export function setChoice(choice: GenerateChoice): void {
    build.choice = cleanChoice(choice);
    storageSet(CHOICE_KEY, JSON.stringify(build.choice));
}

// ---- pure ---------------------------------------------------------------------------------------

/** Adds a key, or takes it away when it is there. */
export function toggleKey(selection: readonly string[], key: string): string[] {
    return selection.includes(key) ? selection.filter((item) => item !== key) : [...selection, key];
}

/** The union, in order, cut at the cap. `over` says the cap was reached. */
export function addKeys(selection: readonly string[], keys: readonly string[], cap = SELECTION_CAP): { keys: string[]; over: boolean } {
    const seen = new Set(selection);
    const out = [...selection];
    let over = false;
    for (const key of keys) {
        if (seen.has(key)) continue;
        if (out.length >= cap) {
            over = true;
            break;
        }
        seen.add(key);
        out.push(key);
    }
    return { keys: out, over };
}

/** What a hex is: the builder's row decides; with none, the chart does. */
export function stateOf(row: BuildRow | null, truth: SectorHex | null): HexState {
    if (row) return row.state;
    return truth ? 'truth' : 'empty';
}

export type Tally = {
    empty: string[];
    /** As charted: no row of the builder's. */
    chart: string[];
    /** Generated or changed by the builder. */
    yours: string[];
    removed: string[];
};

export function tally(keys: readonly string[], state: (hexKey: string) => HexState): Tally {
    const out: Tally = { empty: [], chart: [], yours: [], removed: [] };
    for (const key of keys) {
        const what = state(key);
        if (what === 'empty') out.empty.push(key);
        else if (what === 'truth') out.chart.push(key);
        else if (what === 'removed') out.removed.push(key);
        else out.yours.push(key);
    }
    return out;
}

/** The hexes Generate fills: the empty ones, and the filled ones too when asked. A removed hex is left. */
export function generateTargets(count: Tally, filledToo: boolean): string[] {
    return filledToo ? [...count.empty, ...count.chart, ...count.yours] : [...count.empty];
}

/** The hexes Remove takes: every one that holds a system. */
export function removeTargets(count: Tally): string[] {
    return [...count.chart, ...count.yours];
}

/** The hexes "Restore to the chart" can act on: the builder has a row, and the chart has something under it. */
export function restoreTargets(keys: readonly string[], state: (hexKey: string) => HexState, truth: (hexKey: string) => SectorHex | null): string[] {
    return keys.filter((key) => {
        const what = state(key);
        return (what === 'override' || what === 'removed') && truth(key) !== null;
    });
}

export function plural(count: number, one: string, many: string): string {
    return count + ' ' + (count === 1 ? one : many);
}

/** "Columns 19 to 21, rows 08 to 11" for hexes of one sector; the count of sectors otherwise. */
export function spanLine(keys: readonly string[]): string {
    const slugs = new Set<string>();
    let c0 = 99;
    let c1 = 0;
    let r0 = 99;
    let r1 = 0;
    for (const key of keys) {
        const place = parseHexKey(key);
        if (!place) continue;
        slugs.add(place.slug);
        const col = Number(place.hex.slice(0, 2));
        const row = Number(place.hex.slice(2));
        c0 = Math.min(c0, col);
        c1 = Math.max(c1, col);
        r0 = Math.min(r0, row);
        r1 = Math.max(r1, row);
    }
    if (slugs.size === 0) return '';
    if (slugs.size > 1) return 'Across ' + slugs.size + ' sectors';
    const two = (n: number): string => String(n).padStart(2, '0');
    const cols = c0 === c1 ? 'Column ' + two(c0) : 'Columns ' + two(c0) + ' to ' + two(c1);
    const rows = r0 === r1 ? 'row ' + two(r0) : 'rows ' + two(r0) + ' to ' + two(r1);
    return cols + ', ' + rows;
}

/**
 * The sector index the map draws for a universe: the chart's, with the builder's rows laid
 * over it. A system of theirs replaces or adds the hex; a removed one takes it away. With
 * no rows the chart's own object is returned, so the renderer's caches hold.
 */
export function layOver(index: SectorIndex, rows: readonly BuildRow[]): SectorIndex {
    if (rows.length === 0) return index;
    const hexes: Record<string, SectorHex> = { ...index.hexes };
    for (const row of rows) {
        const place = parseHexKey(row.hexKey);
        if (!place) continue;
        if (row.state === 'removed' || !row.entry) delete hexes[place.hex];
        else hexes[place.hex] = row.entry;
    }
    return { ...index, hexes };
}

/** The universe's generation settings under the legacy tray's own labels (hex_map.html 1538-1634), in its order. */
export function settingRows(settings: Settings | null): { label: string; value: string }[] {
    if (!settings) return [];
    const flag = (on: boolean): string => (on ? 'on' : 'off');
    return [
        { label: 'Starport Max', value: settings.generationStarportMax },
        { label: 'Starport Mod', value: String(settings.generationStarportMod) },
        { label: 'Pop Max', value: String(settings.generationPopMax) },
        { label: 'Pop Mod', value: String(settings.generationPopMod) },
        { label: 'Pop Check Frequency', value: String(settings.generationPopCheckFrequency) },
        { label: 'TL Max', value: String(settings.generationTlMax) },
        { label: 'TL Mod', value: String(settings.generationTlMod) },
        { label: 'Disable Red/Amber Zone Assignments', value: flag(settings.generationNoTravelZones) },
        { label: 'Use Realistic Stellar Variant (MgT2e)', value: flag(settings.generationUseRealisticStellar) },
        { label: 'Use Min TL (MgT2e)', value: flag(settings.generationUseTlFloor) },
        { label: 'Settlement Centuries (RTT)', value: String(settings.generationRttSettlement) },
        { label: 'Tech Level (RTT)', value: String(settings.generationRttTL) },
    ];
}

/** The words of the toast when a many-hex build ends. */
export function jobToast(progress: JobProgress, where: string): string {
    const built = plural(progress.done, 'system', 'systems');
    const place = where ? ' in ' + where : '';
    const failed = progress.failed.length ? ' ' + plural(progress.failed.length, 'hex', 'hexes') + ' failed.' : '';
    if (progress.state === 'stopped') return 'Stopped. ' + built + ' of ' + progress.total + ' built' + place + '.' + failed;
    return 'Generated ' + built + place + '.' + failed;
}
