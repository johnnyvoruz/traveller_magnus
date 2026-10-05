/**
 * Plain view models for the dossier. Field order and formats follow
 * findings/legacy_inspector_inventory.md and the lines it cites in
 * js/system_inspector.js. Components render these values and do not decide them.
 */
import type { SectorHex, TreeEnvelope } from '@voyage/shared';
import { formatKelvin, formatTempFull } from '../design/units.ts';
import { formatDisplayNumber, formatTradeCodes, formatUwpDigit, toEHex } from './labels.ts';

export type HexBody = Record<string, unknown>;
export type SystemDoc = Record<string, unknown>;

export type StatChip = { code: string; name: string };
export type StatRow = {
    label: string;
    text: string;
    code?: string;
    name?: string;
    zone?: string;
    chips?: StatChip[];
};

export type RibbonCell = { digit: string; label: string };
export type Ribbon =
    | { kind: 'cells'; cells: RibbonCell[]; dash: string }
    | { kind: 'plain'; text: string };

/** Disc identity from the body's own tree fields. No surface family: that arrives with the orbit view. */
export type BodyGlyphData = {
    kind: 'star' | 'gasGiant' | 'belt' | 'world' | 'moon';
    /** Spectral letter as the tree stores it on sType. Empty when the body is not a star. */
    star: string;
};

export type TreeRow = {
    key: string;
    name: string;
    facts: string[];
    tag: string;
    uwp: string;
    moon: boolean;
    glyph: BodyGlyphData;
};

export type FactTile = { label: string; value: string; note: string };
export type BodyLink = { key: string; name: string; facts: string[]; glyph: BodyGlyphData };
export type StellarLine = { text: string; glyph: BodyGlyphData };
export type Section = { heading: string; rows: StatRow[] };
export type JourneyTime = { g: number; hours: string };

export type OverviewModel = {
    header: { title: string; hexChip: string; place: string };
    ribbon: Ribbon | null;
    rows: StatRow[];
    journey: JourneyTime[] | null;
    noOrbit: boolean;
    socio: { headline: string; rows: StatRow[] | null; empty: string | null } | null;
    stellar: { lines: StellarLine[] } | null;
    tree: { count: number; rows: TreeRow[] } | null;
    partial: boolean;
    notice: string;
    mapBadge: string;
    mainworldKey: string | null;
};

export type BodyModel = {
    title: string;
    crumbSystem: string;
    crumbParent: { key: string; name: string } | null;
    place: string;
    ribbon: Ribbon | null;
    mapBadge: string;
    facts: FactTile[];
    journey: JourneyTime[] | null;
    mainSections: Section[];
    sideSections: Section[];
    moons: BodyLink[];
    worlds: BodyLink[];
    glyph: BodyGlyphData;
    /** 1-based place in bodyKeys, the order previous and next walk. */
    index: number;
    total: number;
    prev: string | null;
    next: string | null;
};

export type AllegianceName = { code: string; name: string };

const PARTIAL_NOTICE = 'Incomplete survey: this world has unknown values, so no system has been generated.';
const NO_ORBIT_NOTICE = 'Orbit data has not been generated.';
const SOCIO_EMPTY = 'Mongoose socioeconomics have not been built for this world.';
const MARK = ' \u2014 ';
const UWP_PARTS = ['Port', 'Size', 'Atm', 'Hyd', 'Pop', 'Gov', 'Law'];
const UWP_RE = /^([A-HXY?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])([0-9A-Z?])-([0-9A-Z?]+)$/i;
const UWP_KINDS: Record<string, string> = {
    Starport: 'starport', Size: 'size', Atmosphere: 'atmosphere', Hydrographics: 'hydrographics',
    Population: 'population', Government: 'government', 'Law level': 'law',
};
const SYSTEM_KEYS = ['aowSystem', 'mgtSystem', 'ctSystem', 't5System', 'rttSystem'] as const;

function rec(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function arr(value: unknown): unknown[] {
    return Array.isArray(value) ? value : [];
}

function blank(value: unknown): boolean {
    return value === undefined || value === null || value === '' || (Array.isArray(value) && value.length === 0);
}

function text(value: unknown): string {
    return typeof value === 'string' ? value.trim() : '';
}

export function pickSystem(body: HexBody): SystemDoc | null {
    for (const key of SYSTEM_KEYS) {
        const system = rec(body[key]);
        if (system && Array.isArray(system.stars) && system.stars.length > 0) return system;
    }
    return null;
}

export function mainworldProfile(body: HexBody): Record<string, unknown> {
    const aow = rec(body.aowSystem);
    const main = aow ? rec(aow.mainworld) : null;
    if (main) return main;
    for (const key of ['mgt2eData', 'ctData', 't5Data', 'rttData']) {
        const found = rec(body[key]);
        if (found) return found;
    }
    return {};
}

function uwpCode(value: unknown): unknown {
    if (typeof value === 'number' && Number.isFinite(value)) return toEHex(value);
    if (typeof value === 'string' && /^\d+$/.test(value.trim())) return toEHex(Number(value));
    return value;
}

export function rowFor(label: string, value: unknown, decimals?: number): StatRow | null {
    if (blank(value)) return null;
    if (label === 'Allegiance' && value && typeof value === 'object' && !Array.isArray(value)) {
        const obj = value as { code?: unknown; name?: unknown };
        const code = obj.code == null ? '' : String(obj.code);
        const name = obj.name == null ? '' : String(obj.name);
        if (!code && !name) return null;
        if (!name) return { label, text: code, code };
        return { label, text: code ? code + MARK + name : name, code, name };
    }
    if (label === 'Travel zone') {
        const key = String(value).trim().toLowerCase();
        if (key === 'g' || key === 'green') return { label, text: 'G' + MARK + 'Green', code: 'G', name: 'Green', zone: 'green' };
        if (key === 'a' || key === 'amber') return { label, text: 'A' + MARK + 'Amber', code: 'A', name: 'Amber', zone: 'amber' };
        if (key === 'r' || key === 'red') return { label, text: 'R' + MARK + 'Red', code: 'R', name: 'Red', zone: 'red' };
        return { label, text: String(value) };
    }
    if (label === 'Trade codes') {
        const joined = formatTradeCodes(value);
        if (!joined) return null;
        const chips = joined.split(', ').filter(Boolean).map((part) => {
            const match = /^(.*) \(([^)]+)\)$/.exec(part);
            return match ? { code: match[2], name: match[1] } : { code: '', name: part };
        });
        return { label, text: joined, chips };
    }
    if (label === 'Tech level') {
        const code = String(uwpCode(value)).trim();
        const number = typeof value === 'number' ? value : Number(value);
        if (Number.isFinite(number) && number >= 10) {
            const name = 'TL ' + String(number);
            return { label, text: code + MARK + name, code, name };
        }
        return { label, text: code, code };
    }
    const kind = UWP_KINDS[label];
    if (kind) {
        const formatted = formatUwpDigit(kind, kind === 'starport' ? value : uwpCode(value));
        if (!formatted) return null;
        const split = formatted.indexOf(MARK);
        if (split === -1) return { label, text: formatted, code: formatted.trim() };
        return { label, text: formatted, code: formatted.slice(0, split), name: formatted.slice(split + MARK.length) };
    }
    if (typeof value === 'boolean') return { label, text: value ? 'Yes' : 'No' };
    if (decimals != null && Number.isFinite(Number(value))) return { label, text: formatDisplayNumber(value, decimals) };
    const numeric = typeof value === 'number' || /^(Orbit|Distance|Satellite orbit|Diameter|Stellar diameter|Mass|Gravity|Temperature|Luminosity|Eccentricity|Age)/.test(label);
    if (numeric) {
        const places = /Temperature|Diameter \(km\)/.test(label) ? 0 : /Distance|Mass|Luminosity|Eccentricity/.test(label) ? 3 : 2;
        return { label, text: formatDisplayNumber(value, places) };
    }
    if (Array.isArray(value)) return { label, text: value.map((item) => String(item)).join(', ') };
    return { label, text: String(value) };
}

function rowsOf(specs: ([string, unknown] | [string, unknown, number])[]): StatRow[] {
    const rows: StatRow[] = [];
    for (const spec of specs) {
        const row = rowFor(spec[0], spec[1], spec[2]);
        if (row) rows.push(row);
    }
    return rows;
}

function section(heading: string, specs: ([string, unknown] | [string, unknown, number])[]): Section | null {
    const rows = rowsOf(specs);
    return rows.length ? { heading, rows } : null;
}

function ribbonOf(uwp: unknown): Ribbon | null {
    const raw = String(uwp ?? '').trim();
    if (!raw) return null;
    const match = UWP_RE.exec(raw);
    if (!match) return { kind: 'plain', text: raw };
    const cells = UWP_PARTS.map((label, index) => ({ digit: match[index + 1], label }));
    cells.push({ digit: match[8], label: 'TL' });
    return { kind: 'cells', cells, dash: '-' };
}

function allegianceName(code: string, table: readonly AllegianceName[] | undefined): string {
    if (!code || !table) return '';
    for (const row of table) if (row.code === code) return row.name;
    return '';
}

function pbgCode(state: Record<string, unknown>, world: Record<string, unknown>): string {
    const data = rec(state.t5Data) || world;
    if (!data || data.popDigit === undefined) return '';
    const belts = data.planetoidBelts != null ? data.planetoidBelts : (state.beltCount || 0);
    const gas = data.gasGiantsCount != null ? data.gasGiantsCount : (state.gasGiantCount || 0);
    return toEHex(data.popDigit) + toEHex(belts) + toEHex(gas);
}

function basesValue(world: Record<string, unknown>, state: Record<string, unknown>): unknown {
    if (world.baseCodes) return world.baseCodes;
    const joined = Array.isArray(world.bases) ? world.bases.join('') : world.bases;
    if (joined) return joined;
    return state.bases;
}

function resourceUnits(state: Record<string, unknown>): string {
    const socio = rec(state.mgtSocio);
    if (socio && socio.RU != null && socio.RU !== '') return String(socio.RU);
    const t5 = rec(state.t5Socio);
    if (t5 && t5.RU != null) return String(t5.RU);
    return '';
}

function systemTitle(body: HexBody, hex: string): string {
    const named = text(body.name);
    if (named) return named;
    const profile = text(mainworldProfile(body).name);
    return profile || hex;
}

function num(value: unknown, decimals: number, unit = ''): string {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '';
    return formatDisplayNumber(Number(value), decimals, unit);
}

function siderealHours(body: Record<string, unknown>): number | null {
    if (typeof body.siderealHours === 'number' && Number.isFinite(body.siderealHours) && body.siderealHours !== 0) {
        return Math.abs(body.siderealHours);
    }
    if (typeof body.rotationPeriod === 'number' && Number.isFinite(body.rotationPeriod) && body.rotationPeriod > 0) {
        return body.rotationPeriod;
    }
    if (typeof body.rotationPeriod === 'string') {
        const match = body.rotationPeriod.match(/([\d.]+)\s*([hdw])/i);
        if (match) {
            const n = parseFloat(match[1]);
            const unit = match[2].toLowerCase();
            if (unit === 'h') return n;
            if (unit === 'd') return n * 24;
            if (unit === 'w') return n * 168;
        }
    }
    return null;
}

function isTideLocked(body: Record<string, unknown>): boolean {
    if (body.tidallyLocked || body.isTwilightZone) return true;
    if (typeof body.rotationPeriod === 'string' && /tidal/i.test(body.rotationPeriod)) return true;
    if (typeof body.rotationPeriod === 'number' && typeof body.orbitalPeriod === 'number'
        && Math.abs(body.rotationPeriod - body.orbitalPeriod) < 0.001) return true;
    return false;
}

/** system_viewer.js rotationText: Tidally locked, or hours at 1 decimal, retrograde past 90°. */
function rotationText(body: Record<string, unknown>): string {
    if (isTideLocked(body)) return 'Tidally locked';
    const hours = siderealHours(body);
    if (!(hours != null && hours > 0)) return '';
    const retro = (body.axialTilt as number) > 90 ? ', retrograde' : '';
    return formatDisplayNumber(hours, 1, 'h') + retro;
}

/** system_inspector.js periodText, including the days-under-10 case the inventory summary shortens. */
function periodText(body: Record<string, unknown>): string {
    const days = Number(body.periodDays);
    if (Number.isFinite(days) && days > 0) {
        return days >= 730 ? num(days / 365.25, 1, 'yr') : num(days, days < 10 ? 2 : 1, 'd');
    }
    const years = Number(body.periodYears);
    if (Number.isFinite(years) && years > 0) return num(years, 2, 'yr');
    return '';
}

function isStar(body: Record<string, unknown>): boolean {
    return body.sType != null && !body.uwp;
}

/** Kind from the list the body was read from, then its type. Star letter is sType, unchanged. */
function glyphData(body: Record<string, unknown>, from: 'stars' | 'worlds' | 'moons'): BodyGlyphData {
    if (from === 'stars') {
        const letter = body.sType;
        return { kind: 'star', star: typeof letter === 'string' ? letter : '' };
    }
    const type = text(body.type);
    if (type === 'Gas Giant') return { kind: 'gasGiant', star: '' };
    if (type === 'Planetoid Belt' || type === 'Asteroid Belt' || text(body.worldType) === 'Belt') {
        return { kind: 'belt', star: '' };
    }
    return { kind: from === 'moons' ? 'moon' : 'world', star: '' };
}

function spectralPhrase(body: Record<string, unknown>): string {
    return [body.sType, body.subType, body.sClass].filter((value) => value != null && value !== '').join(' ');
}

function starLabel(star: Record<string, unknown>): string {
    if (star.sType) return spectralPhrase(star) || 'Star';
    const decimal = star.decimal != null ? star.decimal : (star.subType != null ? star.subType : '');
    const size = star.size ? ' ' + String(star.size) : '';
    const spec = `${star.type || ''}${decimal}${size}`.trim();
    return spec || text(star.name) || 'Star';
}

function starPlace(star: Record<string, unknown>, stars: unknown[]): string {
    const role = text(star.role) || (star === stars[0] ? 'Primary' : 'Companion');
    const idx = star.parentStarIdx;
    const parent = typeof idx === 'number' && Number.isInteger(idx) ? rec(stars[idx]) : null;
    if (role === 'Companion' && parent && parent !== star) return 'Companion of ' + (text(parent.name) || 'the primary');
    return role;
}

function bodyName(body: Record<string, unknown>): string {
    return text(body.name) || text(body.type) || 'Star';
}

function parentWorld(system: SystemDoc, body: Record<string, unknown>): Record<string, unknown> | null {
    for (const item of arr(system.worlds)) {
        const world = rec(item);
        if (world && arr(world.moons).includes(body)) return world;
    }
    return null;
}

function isMoon(system: SystemDoc, body: Record<string, unknown>): boolean {
    if (body.isMoon || body.isSatellite || body.type === 'Satellite') return true;
    return parentWorld(system, body) != null;
}

function bodyTypeLabel(system: SystemDoc, body: Record<string, unknown>): string {
    if (isStar(body)) return spectralPhrase(body) || 'Star';
    if (body.type === 'Gas Giant') return body.ggType ? 'Gas Giant ' + String(body.ggType) : 'Gas Giant';
    if (body.type === 'Mainworld') return isMoon(system, body) ? 'Mainworld satellite' : 'Mainworld';
    return text(body.worldType) || text(body.type) || 'Body';
}

function bodyFacts(system: SystemDoc, body: Record<string, unknown>): string[] {
    if (isStar(body)) {
        const place = starPlace(body, arr(system.stars));
        return place ? [place] : [];
    }
    const facts = [bodyTypeLabel(system, body)];
    if (isMoon(system, body)) {
        if (body.pd != null && body.pd !== '') {
            const pd = num(body.pd, 1, 'PD');
            if (pd) facts.push(pd);
        }
    } else {
        if (body.orbitId != null && body.orbitId !== '') {
            const orbit = num(body.orbitId, 2);
            if (orbit) facts.push('Orbit ' + orbit);
        }
        if (body.au != null && body.au !== '') {
            const au = num(body.au, 2, 'AU');
            if (au) facts.push(au);
        }
    }
    if (body.diamKm) {
        const diam = num(body.diamKm, 0, 'km');
        if (diam) facts.push(diam);
    }
    return facts;
}

function bodyPlace(system: SystemDoc, body: Record<string, unknown>): string {
    const parts = [bodyTypeLabel(system, body)];
    if (isStar(body)) {
        const role = starPlace(body, arr(system.stars));
        if (role && role !== parts[0]) parts.push(role);
    } else {
        const parent = parentWorld(system, body);
        if (parent) parts.push('moon of ' + bodyName(parent));
        else if (body.orbitId != null && body.orbitId !== '') {
            const orbit = num(body.orbitId, 2);
            if (orbit) parts.push('Orbit ' + orbit);
        }
        if (!parent && body.au != null && body.au !== '') {
            const au = num(body.au, 3, 'AU');
            if (au) parts.push(au);
        }
    }
    return parts.filter(Boolean).join(' \u00B7 ');
}

function keyFor(system: SystemDoc, target: Record<string, unknown>): string | null {
    const stars = arr(system.stars);
    for (let i = 0; i < stars.length; i++) if (stars[i] === target) return 's' + i;
    const worlds = arr(system.worlds);
    for (let i = 0; i < worlds.length; i++) {
        if (worlds[i] === target) return 'w' + i;
        const world = rec(worlds[i]);
        if (!world) continue;
        const moons = arr(world.moons);
        for (let j = 0; j < moons.length; j++) if (moons[j] === target) return 'w' + i + 'm' + j;
    }
    return null;
}

function isBelt(body: Record<string, unknown>): boolean {
    const type = text(body.type);
    return type === 'Planetoid Belt' || type === 'Asteroid Belt' || text(body.worldType) === 'Belt';
}

/** hex_editor.js:25-26 skips a missing size and the R and S digits. */
function jumpSize(body: Record<string, unknown>): boolean {
    const size = body.size;
    return size != null && size !== '' && size !== 'R' && size !== 'S';
}

/**
 * Six stored journeyTimes, shown as the legacy block does: the number, then h.
 * Null for a star, a belt, a body with no size, or an array that is not six numbers.
 */
function journeyFrom(body: Record<string, unknown> | null): JourneyTime[] | null {
    if (!body || isStar(body) || isBelt(body) || body.type === 'Empty' || !jumpSize(body)) return null;
    const times = body.journeyTimes;
    if (!Array.isArray(times) || times.length !== 6) return null;
    const journey: JourneyTime[] = [];
    for (let i = 0; i < 6; i++) {
        const hours = times[i];
        if (typeof hours !== 'number' || !Number.isFinite(hours)) return null;
        journey.push({ g: i + 1, hours: String(hours) + 'h' });
    }
    return journey;
}

/** Inventory F journeyHost: mapped mainworld, else the profile, when size and stars are set. */
function overviewJourney(state: HexBody, system: SystemDoc | null, profile: Record<string, unknown>): JourneyTime[] | null {
    const stars = system ? arr(system.stars) : [];
    const mapped = mappedMainworld(system, {});
    let host: Record<string, unknown> | null = null;
    if (mapped && jumpSize(mapped) && stars.length) host = mapped;
    else if (jumpSize(profile) && stars.length) host = profile;
    const fromHost = journeyFrom(host);
    if (fromHost) return fromHost;
    return journeyFrom(rec(state.mgt2eData));
}

function mappedMainworld(system: SystemDoc | null, profile: Record<string, unknown>): Record<string, unknown> | null {
    if (system) {
        for (const item of arr(system.worlds)) {
            const world = rec(item);
            if (!world) continue;
            if (world.type === 'Mainworld') return world;
            for (const moonItem of arr(world.moons)) {
                const moon = rec(moonItem);
                if (moon && moon.type === 'Mainworld') return moon;
            }
        }
    }
    return Object.keys(profile).length ? profile : null;
}

export function bodyKeys(system: SystemDoc): string[] {
    const keys: string[] = [];
    const stars = arr(system.stars);
    for (let i = 0; i < stars.length; i++) keys.push('s' + i);
    const worlds = arr(system.worlds);
    for (let i = 0; i < worlds.length; i++) {
        const world = rec(worlds[i]);
        if (!world || world.type === 'Empty') continue;
        keys.push('w' + i);
        const moons = arr(world.moons);
        for (let j = 0; j < moons.length; j++) {
            const moon = rec(moons[j]);
            if (!moon || moon.type === 'Empty') continue;
            keys.push('w' + i + 'm' + j);
        }
    }
    return keys;
}

function treeRow(system: SystemDoc, body: Record<string, unknown>, key: string, from: 'stars' | 'worlds' | 'moons'): TreeRow {
    let facts: string[];
    if (isStar(body)) {
        const spectral = starLabel(body);
        const named = text(body.name) !== '' && text(body.name).replace(/\s+/g, '') !== spectral.replace(/\s+/g, '');
        const detail = [named ? spectral : '', starPlace(body, arr(system.stars))].filter(Boolean).join(' \u00B7 ');
        facts = detail ? [detail] : [];
    } else {
        facts = bodyFacts(system, body);
    }
    const main = body.type === 'Mainworld';
    return {
        key,
        name: bodyName(body),
        facts,
        tag: main ? 'Mainworld' : '',
        uwp: !main && !isStar(body) && typeof body.uwp === 'string' ? body.uwp : '',
        moon: from === 'moons',
        glyph: glyphData(body, from),
    };
}

function systemTree(system: SystemDoc | null): { count: number; rows: TreeRow[] } | null {
    if (!system) return null;
    const rows: TreeRow[] = [];
    arr(system.stars).forEach((item, index) => {
        const star = rec(item);
        if (star) rows.push(treeRow(system, star, 's' + index, 'stars'));
    });
    arr(system.worlds).forEach((item, index) => {
        const world = rec(item);
        if (!world || world.type === 'Empty') return;
        rows.push(treeRow(system, world, 'w' + index, 'worlds'));
        arr(world.moons).forEach((moonItem, moonIndex) => {
            const moon = rec(moonItem);
            if (!moon || moon.type === 'Empty') return;
            rows.push(treeRow(system, moon, 'w' + index + 'm' + moonIndex, 'moons'));
        });
    });
    if (!rows.length) return null;
    const worlds = arr(system.worlds).filter((item) => {
        const world = rec(item);
        return !!world && world.type !== 'Empty';
    });
    return { count: arr(system.stars).length + worlds.length, rows };
}

function stellarLines(system: SystemDoc | null): StellarLine[] {
    if (!system) return [];
    const stars = arr(system.stars);
    const lines: StellarLine[] = [];
    stars.forEach((item, idx) => {
        const star = rec(item);
        if (!star || star.separation === 'Companion') return;
        const companions: Record<string, unknown>[] = [];
        for (const other of stars) {
            const body = rec(other);
            if (body && body.separation === 'Companion' && body.parentStarIdx === idx) companions.push(body);
        }
        const extra = companions.length ? ' (+' + companions.map(starLabel).join(', +') + ')' : '';
        const role = text(star.role) && text(star.role) !== 'Primary' ? ' \u2014 ' + text(star.role) : '';
        lines.push({ text: starLabel(star) + extra + role, glyph: glyphData(star, 'stars') });
    });
    return lines;
}

function socioExtension(ms: Record<string, unknown>): string {
    const bits = String(ms.economicProfile || '').split(',').map((part) => part.trim()).filter(Boolean);
    return bits.length > 1 ? bits[1] : '';
}

function socioHeadline(ms: Record<string, unknown> | null): string {
    if (!ms) return '';
    const parts: string[] = [];
    if (ms.Im != null && ms.Im !== '') parts.push('Importance ' + String(ms.Im));
    const extension = socioExtension(ms);
    if (extension) parts.push(extension);
    if (ms.WTN != null && ms.WTN !== '') parts.push('WTN ' + String(ms.WTN));
    if (ms.pcGWP != null && ms.pcGWP !== '') parts.push('Cr' + String(ms.pcGWP));
    return parts.join(' \u00B7 ');
}

function socioBlock(state: Record<string, unknown>): OverviewModel['socio'] {
    const ms = rec(state.mgtSocio);
    const headline = socioHeadline(ms);
    if (ms && ms.pValue !== undefined) {
        return {
            headline,
            empty: null,
            rows: rowsOf([
                ['Importance', ms.Im],
                ['Economic profile', ms.economicProfile],
                ['World trade number', ms.WTN],
                ['GWP per capita', ms.pcGWP],
                ['Resource units', ms.RU],
                ['Inequality', ms.IR],
                ['Development', ms.DR],
                ['Population value', ms.pValue],
                ['Total population', ms.totalWorldPop],
                ['PCR', ms.pcr],
                ['Urbanization', ms.urbanPercent != null ? String(ms.urbanPercent) + '%' : ''],
                ['Major cities', ms.majorCities],
                ['Government profile', ms.govProfile],
                ['Factions', ms.factions],
                ['Judicial profile', ms.judicialSystemProfile],
                ['Law profile', ms.lawProfile],
                ['Tech profile', ms.techProfile],
                ['Cultural profile', ms.culturalProfile],
                ['Starport profile', ms.starportProfile],
                ['Military profile', ms.militaryProfile],
            ]),
        };
    }
    return { headline, rows: null, empty: SOCIO_EMPTY };
}

function identityRows(state: Record<string, unknown>, names: readonly AllegianceName[] | undefined): StatRow[] {
    const world = mainworldProfile(state);
    const system = pickSystem(state);
    const code = text(state.allegiance) || text(world.allegiance);
    const t5 = rec(state.t5Socio);
    return rowsOf([
        ['Starport', world.starport],
        ['Size', world.size],
        ['Atmosphere', world.atm],
        ['Hydrographics', world.hydro],
        ['Population', world.pop ?? world.population],
        ['Government', world.gov ?? world.government],
        ['Law level', world.law],
        ['Tech level', world.tl],
        ['Trade codes', world.tradeCodes || state.tradeCodes],
        ['Travel zone', state.travelZone || world.travelZone],
        ['Allegiance', { code, name: allegianceName(code, names) }],
        ['Bases', basesValue(world, state)],
        ['Nobility', (t5 && t5.nobleCodes) || world.nobleCodes],
        ['PBG', pbgCode(state, world)],
        ['Resource units', resourceUnits(state)],
        ['Gas giants', state.gasGiantCount],
        ['Belts', state.beltCount],
        ['Age (Gyr)', system ? system.age : undefined],
        ['Edition', system ? system.edition : undefined],
    ]);
}

function chartRows(entry: SectorHex, names: readonly AllegianceName[] | undefined): StatRow[] {
    const code = entry.allegiance || '';
    return rowsOf([
        ['Trade codes', entry.tradeCodes],
        ['Travel zone', entry.zone],
        ['Allegiance', { code, name: allegianceName(code, names) }],
        ['Bases', entry.bases],
        ['PBG', entry.pbg],
    ]);
}

function mapBadge(title: string, system: SystemDoc | null, profile: Record<string, unknown>): { badge: string; key: string | null } {
    const mapped = mappedMainworld(system, profile);
    if (!mapped) return { badge: 'Mainworld', key: null };
    const name = text(mapped.name);
    const parent = system ? parentWorld(system, mapped) : null;
    const badge = parent
        ? 'Mainworld \u00B7 moon of ' + bodyName(parent)
        : (name && name !== title ? 'Mainworld \u00B7 ' + name : 'Mainworld');
    return { badge, key: system ? keyFor(system, mapped) : null };
}

function hexOf(tree: TreeEnvelope): string {
    const key = tree.hexKey;
    const slash = key.lastIndexOf('/');
    return slash >= 0 ? key.slice(slash + 1) : key;
}

export function overviewModel(input: {
    sectorName: string;
    subsectorName: string;
    hex: string;
    entry: SectorHex;
    tree: TreeEnvelope | null;
    /** Sector index metadata.allegiances, when the caller has the index (truth v3). */
    allegiances?: readonly AllegianceName[];
}): OverviewModel {
    const partial = input.entry.tree == null;
    const state = input.tree ? input.tree.body : null;
    const profile = state ? mainworldProfile(state) : {};
    const title = state ? systemTitle(state, input.hex) : (text(input.entry.name) || input.hex);
    const system = state ? pickSystem(state) : null;
    const orbit = !!system && (arr(system.stars).length > 0 || arr(system.worlds).some((item) => {
        const world = rec(item);
        return !!world && world.type !== 'Empty';
    }));
    const noOrbit = !!input.tree && !partial && !orbit;
    const lead = mapBadge(title, system, profile);
    const uwp = state ? (profile.uwp || state.uwp || input.entry.uwp) : input.entry.uwp;
    return {
        header: {
            title,
            hexChip: title === input.hex ? '' : input.hex,
            place: input.sectorName + ' - ' + input.subsectorName,
        },
        ribbon: ribbonOf(uwp),
        rows: state && !partial ? identityRows(state, input.allegiances) : chartRows(input.entry, input.allegiances),
        journey: state && !partial ? overviewJourney(state, system, profile) : null,
        noOrbit,
        socio: state && !partial ? socioBlock(state) : null,
        stellar: state && !partial && system && stellarLines(system).length ? { lines: stellarLines(system) } : null,
        tree: state && !partial ? systemTree(system) : null,
        partial,
        notice: partial ? PARTIAL_NOTICE : (noOrbit ? NO_ORBIT_NOTICE : ''),
        mapBadge: lead.badge,
        mainworldKey: state && !partial ? lead.key : null,
    };
}

function locate(system: SystemDoc, key: string): { body: Record<string, unknown>; worldIndex: number; starIndex: number | null } | null {
    const star = /^s(\d+)$/.exec(key);
    if (star) {
        const index = Number(star[1]);
        const body = rec(arr(system.stars)[index]);
        return body ? { body, worldIndex: -1, starIndex: index } : null;
    }
    const world = /^w(\d+)$/.exec(key);
    if (world) {
        const index = Number(world[1]);
        const body = rec(arr(system.worlds)[index]);
        return body ? { body, worldIndex: index, starIndex: null } : null;
    }
    const moon = /^w(\d+)m(\d+)$/.exec(key);
    if (moon) {
        const index = Number(moon[1]);
        const moonIndex = Number(moon[2]);
        const parent = rec(arr(system.worlds)[index]);
        const body = parent ? rec(arr(parent.moons)[moonIndex]) : null;
        return body ? { body, worldIndex: index, starIndex: null } : null;
    }
    return null;
}

function factTiles(facts: { label: string; value: string; note?: string }[]): FactTile[] {
    const shown: FactTile[] = [];
    for (const fact of facts) {
        if (fact.value == null || fact.value === '') continue;
        shown.push({ label: fact.label, value: fact.value, note: fact.note ?? '' });
    }
    return shown;
}

function linkOf(system: SystemDoc, body: Record<string, unknown>, key: string, from: 'worlds' | 'moons'): BodyLink {
    return { key, name: bodyName(body), facts: bodyFacts(system, body), glyph: glyphData(body, from) };
}

export function bodyModel(tree: TreeEnvelope, bodyKey: string): BodyModel | null {
    const system = pickSystem(tree.body);
    if (!system) return null;
    const found = locate(system, bodyKey);
    if (!found) return null;
    const body = found.body;
    const star = isStar(body);
    const keys = bodyKeys(system);
    const at = keys.indexOf(bodyKey);
    const hex = hexOf(tree).replace(/-/g, '\u2011');
    const title = systemTitle(tree.body, hex);
    const parent = parentWorld(system, body);
    const parentKey = parent ? keyFor(system, parent) : null;
    const moons = arr(body.moons).flatMap((item, index) => {
        const moon = rec(item);
        if (!moon || moon.type === 'Empty' || found.worldIndex < 0) return [];
        return [linkOf(system, moon, 'w' + found.worldIndex + 'm' + index, 'moons')];
    });
    const worlds = star && found.starIndex != null
        ? arr(system.worlds).flatMap((item, index) => {
            const world = rec(item);
            if (!world || world.type === 'Empty') return [];
            if ((world.parentStarIdx ?? 0) !== found.starIndex) return [];
            return [linkOf(system, world, 'w' + index, 'worlds')];
        })
        : [];
    const mainSections: Section[] = [];
    const sideSections: Section[] = [];
    if (star) {
        const block = section('Star', [
            ['Type', spectralPhrase(body)],
            ['Role', starPlace(body, arr(system.stars))],
            ['Separation', body.separation],
            ['Orbit', body.orbitId, 2],
            ['Eccentricity', body.eccentricity, 3],
        ]);
        if (block) mainSections.push(block);
    } else {
        const profile = section('World profile', [
            ['Starport', body.starport],
            ['Size', body.size],
            ['Atmosphere', body.atm],
            ['Hydrographics', body.hydro],
            ['Population', body.pop],
            ['Government', body.gov],
            ['Law level', body.law],
            ['Tech level', body.tl],
            ['Trade codes', body.tradeCodes],
            ['Travel zone', body.travelZone],
        ]);
        if (profile) mainSections.push(profile);
        const orbit = section('Orbit', [
            ['Orbit', body.orbitId, 2],
            ['Distance (AU)', body.au, 3],
            ['Satellite orbit (PD)', body.pd, 2],
            ['Eccentricity', body.eccentricity, 3],
            ['Orbital period (days)', body.periodDays, 1],
            ['Axial tilt (°)', body.axialTilt, 1],
            ['Tidally locked', body.tidallyLocked === true ? true : null],
            ['Twilight zone', body.isTwilightZone === true ? true : null],
        ]);
        const physical = section('Physical', [
            ['Mass (M⊕)', body.massEarths ?? body.mass, 3],
            ['Composition', body.composition],
            ['Atmospheric pressure (bar)', body.totalPressureBar ?? body.pressureBar, 2],
            ['High temperature', formatTempFull(body.highTempK)],
            ['Low temperature', formatTempFull(body.lowTempK)],
            ['Temperature band', body.tempBand],
            ['Albedo', body.albedo, 2],
        ]);
        const life = section('Life & resources', [
            ['Habitability', body.habitability],
            ['Biomass', body.biomass],
            ['Biocomplexity', body.biocomplexity],
            ['Biodiversity', body.biodiversity],
            ['Compatibility', body.compatibility],
            ['Native sophont', body.nativeSophont || null],
            ['Extinct sophont', body.extinctSophont || null],
            ['Resource rating', body.resourceRating],
        ]);
        if (orbit) sideSections.push(orbit);
        if (physical) sideSections.push(physical);
        if (life) sideSections.push(life);
    }
    const moonCount = arr(body.moons).filter((item) => {
        const moon = rec(item);
        return !!moon && moon.type !== 'Empty';
    }).length;
    return {
        title: bodyName(body),
        crumbSystem: title,
        crumbParent: parent && parentKey ? { key: parentKey, name: bodyName(parent).replace(title + ' ', '') } : null,
        place: bodyPlace(system, body) + ' \u00B7 ' + hex,
        ribbon: ribbonOf(body.uwp),
        mapBadge: body.type === 'Mainworld' ? 'Mainworld' : '',
        facts: star
            ? factTiles([
                { label: 'Temperature', value: formatKelvin(body.temp) },
                { label: 'Luminosity', value: num(body.lum, 3, 'L☉') },
                { label: 'Mass', value: num(body.mass, 3, 'M☉') },
                { label: 'Diameter', value: num(body.diam, 3, 'D☉') },
            ])
            : factTiles([
                { label: 'Diameter', value: num(body.diamKm, 0, 'km') },
                { label: 'Gravity', value: num(body.gravity, 2, 'G') },
                { label: 'Mean temp.', value: formatTempFull(body.meanTempK) },
                // The spin against the stars, or "Tidally locked": not the sunrise-to-sunrise day, which
                // the Day and night card gives. Relabelled from "Day" (ruled 2026-10-04, handoff §59).
                { label: 'Rotation', value: rotationText(body) },
                { label: 'Year', value: periodText(body) },
                { label: 'Moons', value: moonCount ? String(moonCount) : '' },
            ]),
        journey: journeyFrom(body),
        mainSections,
        sideSections,
        moons,
        worlds,
        glyph: glyphData(body, found.starIndex != null ? 'stars' : (parent ? 'moons' : 'worlds')),
        index: at >= 0 ? at + 1 : 0,
        total: keys.length,
        prev: at > 0 ? keys[at - 1] : null,
        next: at >= 0 && at < keys.length - 1 ? keys[at + 1] : null,
    };
}
