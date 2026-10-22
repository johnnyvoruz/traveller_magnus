/**
 * SystemFacts (directives/spec_living_systems.md section 1.3). One plain object
 * from the chart row, and from the tree when it has loaded. No Traveller rule
 * is decided here: digits use fromEHex as labels.ts defines it, the highport
 * flag uses highportOf, and an X-boat route is the bare rule Johnny set
 * (spec_xboat_ripples.md section 1.3).
 */
import { highportOf } from '../orbit/highport.ts';
import type { ShipState } from '../orbit/ship_list.ts';
import { mainworldProfile, pickSystem, type HexBody } from '../dossier/model.ts';
import { subsectorLetter } from '../builder/address.ts';

/** fromEHex, apps/web/src/dossier/labels.ts lines 19-28. Not exported there. */
function fromEHex(char: unknown): number {
    if (char === undefined || char === null || char === '') return 0;
    const c = String(char).trim().toUpperCase();
    if (c === 'R') return 0.1;
    if (c === 'S') return 0.5;
    const ch = c.charAt(0);
    if (ch >= '0' && ch <= '9') return parseInt(ch, 10);
    const idx = 'ABCDEFGHJKLMNPQRSTUVWXYZ'.indexOf(ch);
    return idx >= 0 ? idx + 10 : 0;
}

const UWP_RE = /^([A-HXY?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?]+)$/i;

export type PartyPlace = 'inSystem' | 'docked' | 'inJump' | 'away';
export type TravelZone = 'green' | 'amber' | 'red' | '';

export type BodyNames = {
    gasGiant?: string;
    belt?: string;
    moon?: string;
    body?: string;
};

export type SystemFacts = {
    hexKey: string;
    name: string;
    sector: string;
    subsector: string;
    starport: string;
    size: number;
    atm: number;
    hydro: number;
    pop: number;
    gov: number;
    law: number;
    tl: number;
    tradeCodes: string[];
    zone: TravelZone;
    bases: string;
    highport: boolean | null;
    gasGiants: number;
    belts: number;
    moons: number;
    otherBodies: number;
    xboat: boolean;
    party: PartyPlace;
    day: number;
    bodies: BodyNames;
};

export type ChartRow = {
    name: string;
    uwp: string;
    zone: string;
    bases: string;
    tradeCodes: readonly string[];
    pbg: string;
};

export type FactsSource = {
    hexKey: string;
    entry: ChartRow;
    sectorName: string;
    /** Sector index metadata.names: subsector letter to name. */
    subsectorNames?: Readonly<Record<string, string>>;
    routes?: readonly unknown[];
    /** The hex state once the tree has loaded. Absent on the chart alone. */
    state?: HexBody | null;
    /**
     * statusWords().state of the lead ship when shipsHere includes it.
     * Read only once the tree is loaded. The chart alone is away.
     */
    lead?: ShipState | null;
    day: number;
};

/**
 * The lead ship's statusWords state, as the four party places.
 * jump is in jump. docked is docked. flight, orbit and hold are in the system.
 * none, or no ship, is away.
 */
export function partyFromShip(state: ShipState | null | undefined): PartyPlace {
    if (state === 'jump') return 'inJump';
    if (state === 'docked') return 'docked';
    if (state === 'flight' || state === 'orbit' || state === 'hold') return 'inSystem';
    return 'away';
}

function localHex(hexKey: string): string {
    const slash = hexKey.lastIndexOf('/');
    return slash >= 0 ? hexKey.slice(slash + 1) : hexKey;
}

function rowOf(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

/** rowFor('Travel zone') in dossier/model.ts: g/a/r and the three words. Anything else is blank. */
function zoneOf(value: unknown): TravelZone {
    const key = text(value).toLowerCase();
    if (key === 'g' || key === 'green') return 'green';
    if (key === 'a' || key === 'amber') return 'amber';
    if (key === 'r' || key === 'red') return 'red';
    return '';
}

function uwpParts(uwp: string): { starport: string; digits: number[] } {
    const match = UWP_RE.exec(uwp.trim());
    if (!match) {
        const starport = uwp.length > 0 ? uwp.charAt(0).toUpperCase() : '';
        return { starport, digits: [0, 0, 0, 0, 0, 0, 0] };
    }
    const digits = [1, 2, 3, 4, 5, 6, 7].map((index) => fromEHex(match[index + 1]));
    return { starport: match[1].toUpperCase(), digits };
}

function profileDigit(profile: Record<string, unknown>, keys: readonly string[], fallback: number): number {
    for (const key of keys) {
        if (!Object.prototype.hasOwnProperty.call(profile, key)) continue;
        const value = profile[key];
        if (typeof value === 'number' && Number.isFinite(value)) return value;
        if (typeof value === 'string' && value.trim() !== '') return fromEHex(value);
    }
    return fallback;
}

function starportOf(profile: Record<string, unknown>, fallback: string): string {
    const letter = text(profile.starport).toUpperCase();
    if (/^[ABCDEX]$/.test(letter)) return letter;
    return fallback;
}

function tradeCodesOf(profile: Record<string, unknown>, entry: readonly string[]): string[] {
    const raw = profile.tradeCodes;
    if (Array.isArray(raw) && raw.length > 0) return raw.map((code) => String(code));
    const written = text(raw);
    if (written) return written.split(/\s+/);
    return [...entry];
}

/** basesValue in dossier/model.ts, then the chart string. */
function basesOf(profile: Record<string, unknown>, state: HexBody | null, entry: string): string {
    const coded = text(profile.baseCodes);
    if (coded) return coded;
    if (Array.isArray(profile.bases) && profile.bases.length > 0) return profile.bases.join('');
    const listed = text(profile.bases);
    if (listed) return listed;
    const fromState = state ? text(state.bases) : '';
    if (fromState) return fromState;
    return entry;
}

/** PBG is pop, belts, gas. The last two digits are belts, then gas giants. */
function pbgCounts(pbg: string): { belts: number; gasGiants: number } {
    const code = pbg.trim();
    if (code.length < 2) return { belts: 0, gasGiants: 0 };
    return {
        belts: fromEHex(code.charAt(code.length - 2)),
        gasGiants: fromEHex(code.charAt(code.length - 1)),
    };
}

function countOf(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/**
 * highportOf returns a port only when the profile says H Y. No profile is null.
 * A profile that matches and says N is false.
 */
function highportFact(profile: Record<string, unknown> | null, tree: boolean): boolean | null {
    if (!tree || !profile) return null;
    if (highportOf(profile)) return true;
    const match = /^([A-EX])-H([YN]):D([YN])/.exec(text(profile.starportProfile));
    if (!match) return null;
    return false;
}

function labelOf(body: Record<string, unknown>): string {
    return text(body.name) || text(body.type);
}

function isBelt(body: Record<string, unknown>): boolean {
    const type = text(body.type);
    return type === 'Planetoid Belt' || type === 'Asteroid Belt' || text(body.worldType) === 'Belt';
}

/** The same moon list bodyKeys walks: moons, or satellites when that is what was stored. */
function moonList(world: Record<string, unknown>): unknown[] {
    const moons = Array.isArray(world.moons) ? world.moons : [];
    const present = moons.some((item) => {
        const moon = rowOf(item);
        return !!moon && moon.type !== 'Empty';
    });
    if (present) return moons;
    const satellites = Array.isArray(world.satellites) ? world.satellites : [];
    return satellites.length ? satellites : moons;
}

function bodiesOf(state: HexBody | null): { moons: number; otherBodies: number; bodies: BodyNames } {
    const bodies: BodyNames = {};
    const system = state ? pickSystem(state) : null;
    if (!system) return { moons: 0, otherBodies: 0, bodies };
    let moons = 0;
    let otherBodies = 0;
    const worlds = Array.isArray(system.worlds) ? system.worlds : [];
    for (const item of worlds) {
        const world = rowOf(item);
        if (!world || world.type === 'Empty') continue;
        const main = world.type === 'Mainworld';
        if (!main) {
            otherBodies += 1;
            if (!bodies.body) {
                const name = labelOf(world);
                if (name) bodies.body = name;
            }
        }
        if (!bodies.gasGiant && world.type === 'Gas Giant') {
            const name = labelOf(world);
            if (name) bodies.gasGiant = name;
        }
        if (!bodies.belt && isBelt(world)) {
            const name = labelOf(world);
            if (name) bodies.belt = name;
        }
        for (const moonItem of moonList(world)) {
            const moon = rowOf(moonItem);
            if (!moon || moon.type === 'Empty') continue;
            moons += 1;
            if (moon.type === 'Mainworld') continue;
            otherBodies += 1;
            const name = labelOf(moon);
            if (name && !bodies.moon) bodies.moon = name;
            if (name && !bodies.body) bodies.body = name;
        }
    }
    return { moons, otherBodies, bodies };
}

function routeRow(value: unknown): Record<string, unknown> | null {
    return rowOf(value);
}

/** xboatRouteRule bare: no Allegiance, no Type, no Color, plus Type "Xboat". */
function xboatRoute(row: Record<string, unknown>): boolean {
    if (text(row.Type) === 'Xboat') return true;
    return text(row.Type) === '' && text(row.Allegiance) === '' && text(row.Color) === '';
}

function xboatOf(bases: string, routes: readonly unknown[] | undefined, hexKey: string): boolean {
    if (bases.includes('W')) return true;
    const hex = localHex(hexKey);
    for (const item of routes || []) {
        const row = routeRow(item);
        if (!row || !xboatRoute(row)) continue;
        if (text(row.Start) === hex || text(row.End) === hex) return true;
    }
    return false;
}

function subsectorOf(hexKey: string, names: Readonly<Record<string, string>> | undefined): string {
    if (!names) return '';
    const letter = subsectorLetter(localHex(hexKey));
    if (!letter) return '';
    return names[letter] || '';
}

/** The chart row is enough. Pass `state` once the tree has loaded. */
export function systemFacts(source: FactsSource): SystemFacts {
    const tree = !!source.state;
    const state = tree ? source.state || null : null;
    const profile = state ? mainworldProfile(state) : {};
    const parsed = uwpParts(source.entry.uwp);
    const pbg = pbgCounts(source.entry.pbg);
    const counted = bodiesOf(state);
    const name = state && text(state.name) ? text(state.name) : source.entry.name;
    const zoneSource = state && text(state.travelZone) ? state.travelZone : source.entry.zone;
    return {
        hexKey: source.hexKey,
        name,
        sector: source.sectorName,
        subsector: subsectorOf(source.hexKey, source.subsectorNames),
        starport: starportOf(profile, parsed.starport),
        size: profileDigit(profile, ['size'], parsed.digits[0]),
        atm: profileDigit(profile, ['atm'], parsed.digits[1]),
        hydro: profileDigit(profile, ['hydro'], parsed.digits[2]),
        pop: profileDigit(profile, ['pop', 'population'], parsed.digits[3]),
        gov: profileDigit(profile, ['gov', 'government'], parsed.digits[4]),
        law: profileDigit(profile, ['law'], parsed.digits[5]),
        tl: profileDigit(profile, ['tl'], parsed.digits[6]),
        tradeCodes: tradeCodesOf(profile, source.entry.tradeCodes),
        zone: zoneOf(zoneSource),
        bases: basesOf(profile, state, source.entry.bases),
        highport: highportFact(state ? profile : null, tree),
        gasGiants: state ? countOf(state.gasGiantCount, pbg.gasGiants) : pbg.gasGiants,
        belts: state ? countOf(state.beltCount, pbg.belts) : pbg.belts,
        moons: counted.moons,
        otherBodies: counted.otherBodies,
        xboat: xboatOf(basesOf(profile, state, source.entry.bases), source.routes, source.hexKey),
        party: state ? partyFromShip(source.lead) : 'away',
        day: source.day,
        bodies: counted.bodies,
    };
}
