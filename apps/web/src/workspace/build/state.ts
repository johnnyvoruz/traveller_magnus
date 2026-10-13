/**
 * Build: the switch, what is selected, and the words for it (findings/builder_system_design.md
 * §1 and §2). The reactive part is one object; everything else is pure and runs under Node.
 */
import { reactive } from 'vue';
import { builderPairReady, type SectorHex, type SectorIndex, type Settings } from '@voyage/shared';
import { storageGet, storageSet } from '../../platform/browser.ts';
import { parseHexKey } from '../places.ts';
import type { BuildRow, Density, GenerateChoice, Generator, HexState, JobProgress, Preview } from './seam.ts';

const ON_KEY = 'voyage_build_on';
/** Set once the person has put away the note on whose map this is. */
export const YOURS_KEY = 'voyage_build_yours_told';

/**
 * Whose map this is (prompts/d_generate_feedback.md part 3, reread for prompts/d_star_numbers.md),
 * said once where a person starting to build reads it. What is true: a universe points at one
 * released chart and stores only its own changes; publishing a package is the only way anything
 * leaves it.
 */
export function yoursNote(onChart: boolean): string {
    const first = onChart ? 'This map is your own copy of the published chart.' : 'This map is your own.';
    return first + ' What you generate, change, or remove stays on your map, and nobody else sees it unless you publish a package.';
}

/** The Build strip's line: the map's name, what it is in plain words, and the chart's version where whoever needs it can find it. */
export function stripLine(name: string, truthVersion: string | null): { what: string; title: string } {
    if (truthVersion === null) return { what: 'a map of your own', title: name + ' is a map of your own, with no published chart under it' };
    return { what: 'your copy of the published chart', title: name + ' is your copy of the published chart, version ' + truthVersion };
}
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
    /** How many of the selected empty hexes a many-hex run fills; per universe (readDensity). One hex always generates. */
    density: 'standard' as Density,
    /** The hexes the density prompt is asking about; null when it is closed. Nothing runs for many hexes without it. */
    asking: null as string[] | null,
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
        build.asking = null;
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
        { label: 'Starport max', value: settings.generationStarportMax },
        { label: 'Starport mod', value: String(settings.generationStarportMod) },
        { label: 'Pop max', value: String(settings.generationPopMax) },
        { label: 'Pop mod', value: String(settings.generationPopMod) },
        { label: 'Pop check frequency', value: String(settings.generationPopCheckFrequency) },
        { label: 'TL max', value: String(settings.generationTlMax) },
        { label: 'TL mod', value: String(settings.generationTlMod) },
        { label: 'Disable Red/Amber Zone assignments', value: flag(settings.generationNoTravelZones) },
        { label: 'Use realistic stellar variant (MgT2E)', value: flag(settings.generationUseRealisticStellar) },
        { label: 'Use min TL (MgT2E)', value: flag(settings.generationUseTlFloor) },
        { label: 'Settlement centuries (RTT)', value: String(settings.generationRttSettlement) },
        { label: 'Tech level (RTT)', value: String(settings.generationRttTL) },
    ];
}

/** Said where a writing act is held while a job runs: the job writes the same map. */
export const JOB_HOLD = 'While hexes are generating, you can’t change systems. To change one now, select Stop.';

/**
 * A running job in one line. With a density the server reports hexes checked, not systems made
 * (`done` counts the hexes it left empty too), in steps of up to 32: "Generating up to 80
 * systems · 32 of 80 hexes checked". A store from before density: "Generating 80 hexes · 12 of 80".
 */
export function jobLine(job: JobProgress & { label: string }): string {
    const failed = job.failed.length ? ' · ' + job.failed.length + ' failed' : '';
    const counted = job.placed ? ' hexes checked' : '';
    return job.label + ' · ' + job.done.toLocaleString('en-US') + ' of ' + job.total.toLocaleString('en-US') + counted + failed;
}

/** Said when a run over the same hexes at the same density writes nothing: the roll is seeded per hex. */
export const NOTHING_NEW = 'No systems were generated. At this density, the roll leaves these hexes empty every time. To fill them, choose Every hex under Hexes to fill, or select one hex, and then select Generate.';

/**
 * The words of the toast when a many-hex build ends. With the store's density counts, systems
 * generated is `placed.length` and the hexes the roll left empty are said apart; without them
 * (a store from before density), `done` is the systems, as it was.
 */
export function jobToast(progress: JobProgress, where: string): string {
    const place = where ? ' in ' + where : '';
    const failed = progress.failed.length ? ' ' + plural(progress.failed.length, 'hex', 'hexes') + ' failed.' : '';
    if (!progress.placed) {
        const built = plural(progress.done, 'system', 'systems');
        if (progress.state === 'stopped') return 'Stopped. Generated ' + progress.done + ' of ' + plural(progress.total, 'system', 'systems') + place + '.' + failed;
        return 'Generated ' + built + place + '.' + failed;
    }
    const made = progress.placed.length;
    const empty = progress.leftEmpty ?? 0;
    const left = empty === 0 ? '' : ' ' + (empty === 1 ? '1 hex was left empty.' : empty.toLocaleString('en-US') + ' hexes were left empty.');
    if (progress.state === 'stopped') {
        return 'Stopped after checking ' + progress.done.toLocaleString('en-US') + ' of ' + plural(progress.total, 'hex', 'hexes') + '. Generated ' + plural(made, 'system', 'systems') + place + '.' + left + failed;
    }
    if (made === 0 && empty > 0 && progress.failed.length === 0) return NOTHING_NEW;
    return 'Generated ' + plural(made, 'system', 'systems') + place + '.' + left + failed;
}

// ---- how many of the selected hexes a run fills -------------------------------------------------

export type DensityOption = { id: Density; name: string; meaning: string };

/**
 * The four choices, in the order Johnny's ruling gives them (prompts/d_menu_selection.md part 0):
 * the name first, then the plain meaning. The dice move to DENSITY_HINT.
 */
export const DENSITIES: readonly DensityOption[] = [
    { id: 'sparse', name: 'Sparse', meaning: 'about a third of the empty hexes' },
    { id: 'standard', name: 'Standard', meaning: 'about half of the empty hexes' },
    { id: 'dense', name: 'Dense', meaning: 'about two thirds of the empty hexes' },
    { id: 'every', name: 'Every hex', meaning: 'all of the empty hexes' },
];

/** For people who want the roll. */
export const DENSITY_HINT = 'Each empty hex is rolled once: 2, 3, or 4 chances in 6.';

export const DEFAULT_DENSITY: Density = 'standard';

export function cleanDensity(raw: unknown): Density {
    return DENSITIES.some((item) => item.id === raw) ? (raw as Density) : DEFAULT_DENSITY;
}

/** "Standard: about half of the empty hexes". */
export function densityWords(density: Density): string {
    const item = DENSITIES.find((option) => option.id === density) ?? DENSITIES[1];
    return item.name + ': ' + item.meaning;
}

/** The job's label: what it may make. */
export function jobLabel(count: number, density: Density): string {
    return density === 'every' ? 'Generating ' + plural(count, 'hex', 'hexes') : 'Generating up to ' + plural(count, 'system', 'systems');
}

const DENSITY_KEY = 'voyage_build_density:';

/** The choice for this universe: remembered with the engine and the method, Standard until one is made. */
export function readDensity(universeId: string): Density {
    return cleanDensity(storageGet(DENSITY_KEY + universeId));
}

export function setDensity(universeId: string | null, density: Density): void {
    build.density = cleanDensity(density);
    if (universeId) storageSet(DENSITY_KEY + universeId, build.density);
}
