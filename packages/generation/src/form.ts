/**
 * Tree to form, and form back to a tree, for the two engines generateHex runs.
 * Field lists and the re-run are the legacy editors
 * (`js/system_editor.js`, `js/mgt2e_editor_adapter.js`, `js/aow_editor_adapter.js`,
 * `js/hex_editor.js` `saveHexEditorChanges`). No step is added.
 */
import {
    configure,
    convertAuToOrbit,
    fromEHex,
    generateAoWSystemBottomUp,
    generateMgT2ESystemBottomUp,
    generateStarObject,
    getMAO,
    setRandomSeed,
    stripHexViewState,
    toEHex,
    trace,
} from '@voyage/engines';

// Orbit distances. Engines does not re-export this generated table, and the file has no declaration.
// @ts-expect-error TS7016 the generated rules module has no declaration file
import { MgT2EData } from '../../engines/src/generated/rules/mgt2e_data.js';
import type { EditForm, FormAnswer, FormChange, FormField, FormMessage, FormSection, FormValue } from '@voyage/shared';

type Row = Record<string, any>;
type Envelope = {
    kind: 'tree';
    engineVersion: string;
    derivation: {
        edition: string;
        mode: string;
        seed: string;
        settings: Record<string, unknown>;
        inputs: Record<string, unknown>;
    };
    hexKey: string;
    body: Row;
};

export class FormRefusal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'FormRefusal';
    }
}

type Star = {
    id: string;
    role: string;
    sType: string;
    subType: number;
    sClass: string;
    orbitId: number | null;
    orbitAU: number | null;
    parentIndex: number;
    mass: number | null;
    lum: number | null;
    diam: number | null;
    temp: number | null;
    mao: number | null;
    manual: string[];
    raw: Row;
};

type Body = {
    id: string;
    type: string;
    ggType: string | null;
    name: string;
    uwp: string | null;
    orbitId: number | null;
    au: number | null;
    parentIndex: number;
    isMainworld: boolean;
    travelZone: string;
    moons: Moon[];
    manual: string[];
    raw: Row;
    uwpSeed: Record<string, string | null> | null;
};

type Moon = {
    id: string;
    name: string;
    uwp: string | null;
    isMainworld: boolean;
    pd: number | null;
    manual: string[];
    raw: Row;
};

type Copy = {
    edition: 'MgT2E' | 'AoW';
    hexKey: string;
    allowAddBodies: boolean;
    age: number | null;
    hzco: number | null;
    mainworldRef: string | null;
    stars: Star[];
    bodies: Body[];
};

// js/system_editor.js lines 30-51. Labels are that file's.
const STAR_TYPES = [
    ['O', 'O — Blue'], ['B', 'B — Blue-White'], ['A', 'A — White'], ['F', 'F — Yellow-White'],
    ['G', 'G — Yellow'], ['K', 'K — Orange'], ['M', 'M — Red'], ['D', 'D — White Dwarf'], ['BD', 'BD — Brown Dwarf'],
] as const;
const STAR_CLASSES = [
    ['Ia', 'Ia — Supergiant'], ['Ib', 'Ib — Supergiant (dim)'], ['II', 'II — Bright Giant'],
    ['III', 'III — Giant'], ['IV', 'IV — Subgiant'], ['V', 'V — Main Sequence'],
    ['VI', 'VI — Subdwarf'], ['D', 'D — White Dwarf'],
] as const;
// js/system_editor.js line 1723. CT's shorter list is not used: these two engines are not CT.
const ROLES = ['Companion', 'Close', 'Near', 'Far'] as const;
// js/system_editor.js line 57.
const ORBIT_BY_ROLE: Record<string, number> = { Companion: 0.15, Close: 0.5, Near: 6.0, Far: 12.0 };
// js/system_editor.js lines 80-86.
const DERIVED: [string, string][] = [
    ['mass', 'Mass'], ['lum', 'Lum'], ['diam', 'Diam'], ['temp', 'Temp'], ['mao', 'MAO'],
];
// hex_map.html lines 2591-2614, codes from js/hex_editor.js saveHexEditorChanges.
const BASES: [string, string, string][] = [
    ['naval', 'Naval Base', 'N'],
    ['scout', 'Scout Base', 'S'],
    ['military', 'Military Base', ''],
    ['corsair', 'Corsair (Pirate)', 'P'],
    ['research', 'Research Base', 'R'],
    ['tas', 'TAS Facility', 'T'],
    ['waystation', 'Way Station', 'W'],
    ['govEstate', 'Gov Estate (G)', 'G'],
    ['embassy', 'Embassy (F)', 'F'],
    ['moot', 'Moot', 'Moot'],
    ['merchant', 'Merchant (M)', 'M'],
    ['shipyard', 'Shipyard (Y)', 'Y'],
    ['megacorp', 'MegaCorp HQ', 'MegaCorp HQ'],
    ['scoutHostel', 'Scout Hostel', 'Scout Hostel'],
    ['psionics', 'Psionics (Z)', 'Z'],
    ['sacred', 'Sacred Site (K)', 'K'],
    ['enclave', 'Enclave (V)', 'V'],
    ['ancients', 'Ancients (Q)', 'Q'],
];
// js/mgt2e_editor_adapter.js _MGT2E_PHYS_FIELDS.
const PHYS = [
    'size', 'siderealHours', 'axialTilt', 'tidallyLocked', 'solarDayHours', 'eccentricity',
    'albedo', 'greenhouseFactor', 'density', 'diamKm', 'mass', 'gravity', 'composition',
];
// js/mgt2e_editor_adapter.js _MGT2E_EXT_SOCIO_FIELDS.
const EXT_SOCIO = [
    'pValue', 'totalWorldPop', 'pcr', 'urbanPercent', 'totalUrbanPop', 'majorCities', 'totalMajorCityPop',
    'govProfile', 'factions', 'factionsData', 'lawProfile', 'techProfile', 'culturalProfile', 'culturalQuirks',
    'economicProfile', 'starportProfile', 'militaryProfile', 'judicialSystemProfile',
    'Im', 'ecoR', 'ecoL', 'ecoI', 'ecoE', 'RU', 'pcGWP', 'WTN', 'IR', 'DR', 'resourceRating',
];

const SOCIO_FIELDS: [string, string, 'number' | 'text', 'type' | 'read'][] = [
    ['pValue', 'P-Value', 'number', 'type'],
    ['totalWorldPop', 'Total Pop', 'text', 'read'],
    ['pcr', 'PCR', 'number', 'type'],
    ['urbanPercent', 'Urbanization %', 'text', 'read'],
    ['totalUrbanPop', 'Total Urban Pop', 'text', 'read'],
    ['majorCities', 'Major Cities', 'number', 'type'],
    ['totalMajorCityPop', 'Total MC Pop', 'text', 'read'],
    ['govProfile', 'Gov Profile', 'text', 'type'],
    ['factions', 'Factions', 'text', 'type'],
    ['judicialSystemProfile', 'Judicial Profile', 'text', 'type'],
    ['lawProfile', 'Law Profile', 'text', 'type'],
    ['techProfile', 'Tech Profile', 'text', 'type'],
    ['culturalProfile', 'Cultural Profile', 'text', 'type'],
    ['Im', 'Importance', 'text', 'type'],
    ['economicProfile', 'Economic Profile', 'text', 'type'],
    ['RU', 'Resource Units', 'number', 'type'],
    ['pcGWP', 'GWP per Capita', 'text', 'type'],
    ['WTN', 'World Trade No', 'text', 'type'],
    ['IR', 'Inequality Rating', 'number', 'type'],
    ['DR', 'Devel. Rating', 'text', 'type'],
    ['starportProfile', 'Starport Profile', 'text', 'type'],
    ['militaryProfile', 'Military Profile', 'text', 'type'],
];

function choices(pairs: readonly (readonly [string, string])[]): { value: string; label: string }[] {
    return pairs.map(([value, label]) => ({ value, label }));
}

function field(id: string, label: string, kind: FormField['kind'], permission: FormField['permission'], value: FormValue, options: FormField['options'] = []): FormField {
    return { id, label, kind, permission, value, options };
}

function num(value: unknown): number | null {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (value == null || value === '') return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
}

function text(value: unknown): string {
    return value == null ? '' : String(value);
}

function exotic(sType: string): { sClass: string; subType: number } | null {
    // js/system_editor.js _exoticStarDefaults.
    if (sType === 'D') return { sClass: 'D', subType: 0 };
    if (sType === 'BD') return { sClass: 'V', subType: 0 };
    return null;
}

function orbitAu(orbitId: number | null): number | null {
    // js/system_editor.js _orbitIdToAU, the MgT2E table both of these engines use.
    if (orbitId == null) return null;
    const table = MgT2EData.stellar.orbitAu as number[];
    if (!table || !table.length) return null;
    const idx = Math.floor(orbitId);
    const frac = orbitId - idx;
    const lo = table[Math.min(idx, table.length - 1)];
    const hi = table[Math.min(idx + 1, table.length - 1)];
    return lo + frac * (hi - lo);
}

function editionOf(body: Row): 'MgT2E' | 'AoW' {
    // js/system_editor.js _detectEngine: AoW wins when it has stars, then MgT2E.
    const aow = body.aowSystem;
    if (aow && Array.isArray(aow.stars) && aow.stars.length > 0) return 'AoW';
    const mgt = body.mgtSystem;
    if (mgt && Array.isArray(mgt.stars) && mgt.stars.length > 0) return 'MgT2E';
    throw new FormRefusal('This system has no Mongoose or Architect of Worlds tree.');
}

function systemOf(body: Row, edition: 'MgT2E' | 'AoW'): Row {
    return edition === 'AoW' ? body.aowSystem : body.mgtSystem;
}

function canonType(rawType: string, isMainworld: boolean): string {
    if (isMainworld) return 'World';
    const t = String(rawType || '').toLowerCase();
    if (t.includes('gas giant') || t.includes('jovian') || t.includes('helian') || t.includes('ice giant')) return 'Gas Giant';
    if (t.includes('belt') || t.includes('asteroid') || t.includes('planetoid') || t.includes('ring')) return 'Belt';
    return 'World';
}

function copyOf(envelope: Envelope): Copy {
    const body = envelope.body || {};
    const edition = editionOf(body);
    const raw = systemOf(body, edition);
    const stars: Star[] = (raw.stars || []).map((star: Row, index: number) => {
        const orbitId = index === 0 ? null : (star.orbitId ?? star.orbitID ?? (typeof star.orbit === 'number' ? star.orbit : null));
        return {
            id: `star.${index}`,
            role: star.role || (index === 0 ? 'Primary' : 'Companion'),
            sType: star.type || star.sType || 'G',
            subType: star.decimal != null ? Number(star.decimal) : (star.subType != null ? Number(star.subType) : 5),
            sClass: star.size || star.sClass || 'V',
            orbitId: orbitId == null ? null : Number(orbitId),
            orbitAU: index === 0 ? null : (star.distAU ?? star.orbitAU ?? null),
            parentIndex: index === 0 ? 0 : (star.parentStarIdx != null ? Number(star.parentStarIdx) : 0),
            mass: star.mass ?? null,
            lum: star.lum ?? star.luminosity ?? null,
            diam: star.diam ?? null,
            temp: star.temp ?? null,
            mao: star.mao ?? null,
            manual: Array.isArray(star._manualFields) ? [...star._manualFields] : [],
            raw: star,
        };
    });
    const main = raw.mainworld;
    const bodies: Body[] = [];
    (raw.worlds || []).forEach((world: Row, index: number) => {
        if (!world || world.type === 'Empty') return;
        const isMainworld = world === main || world.type === 'Mainworld' || world.isMainworld
            || (!!main && main.uwp && world.uwp === main.uwp && main.name === world.name);
        const type = canonType(isMainworld ? 'World' : (world.type || ''), isMainworld);
        const moons: Moon[] = (world.moons || world.satellites || []).map((moon: Row, moonIndex: number) => ({
            id: `body.${bodies.length}.moon.${moonIndex}`,
            name: moon.name || '',
            uwp: moon.uwp || null,
            isMainworld: !!(moon.isMainworld || moon.type === 'Mainworld'),
            pd: moon.pd ?? null,
            manual: Array.isArray(moon._manualFields) ? [...moon._manualFields] : [],
            raw: moon,
        }));
        bodies.push({
            id: `body.${bodies.length}`,
            type,
            ggType: type === 'Gas Giant' ? (world.ggType || null) : null,
            name: world.name || '',
            uwp: world.uwp || null,
            orbitId: world.orbitId ?? (typeof world.orbit === 'number' ? world.orbit : null),
            au: world.au ?? world.orbitalRadius ?? world.distAU ?? null,
            parentIndex: world.parentStarIdx != null ? Number(world.parentStarIdx) : 0,
            isMainworld,
            travelZone: world.travelZone || world.travelCode || 'Green',
            moons,
            manual: Array.isArray(world._manualFields) ? [...world._manualFields] : [],
            raw: world,
            uwpSeed: null,
        });
    });
    const mainBody = bodies.find((item) => item.isMainworld) || bodies.find((item) => item.moons.some((moon) => moon.isMainworld));
    return {
        edition,
        hexKey: envelope.hexKey,
        allowAddBodies: false,
        age: raw.age ?? null,
        hzco: raw.hzco ?? raw.hzOrbit ?? null,
        mainworldRef: mainBody ? mainBody.id : null,
        stars,
        bodies,
    };
}

function mainworld(body: Row, edition: 'MgT2E' | 'AoW'): Row {
    const sys = systemOf(body, edition);
    if (sys.mainworld && typeof sys.mainworld === 'object') return sys.mainworld;
    const found = (sys.worlds || []).find((world: Row) => world && (world.type === 'Mainworld' || world.isMainworld));
    return found || body.mgt2eData || {};
}

function profileSource(body: Row, edition: 'MgT2E' | 'AoW'): Row {
    return body.mgt2eData || mainworld(body, edition) || {};
}

function uwpCells(source: Row): Record<string, number | string> {
    const uwp = text(source.uwp);
    const starport = text(source.starport || uwp.slice(0, 1));
    const read = (key: string, index: number): number => {
        if (typeof source[key] === 'number') return source[key];
        const ch = uwp.slice(1).replace('-', '')[index];
        return ch ? fromEHex(ch) : 0;
    };
    const tlChar = uwp.includes('-') ? uwp.slice(uwp.indexOf('-') + 1) : '';
    return {
        st: starport,
        s: read('size', 0),
        a: read('atm', 1),
        h: read('hydro', 2),
        p: read('pop', 3),
        g: read('gov', 4),
        l: read('law', 5),
        tl: typeof source.tl === 'number' ? source.tl : (tlChar ? fromEHex(tlChar) : 0),
    };
}

function basesNow(source: Row): Record<string, boolean> {
    const list = Array.isArray(source.bases) ? source.bases.map(String) : text(source.bases).split(/[\s,]+/).filter(Boolean);
    const out: Record<string, boolean> = {};
    for (const [key, , code] of BASES) {
        if (!code) out[key] = !!source[key + 'Base'] || !!source[key];
        else if (code.length === 1) out[key] = list.some((item) => item === code || item.includes(code));
        else out[key] = list.includes(code);
    }
    out.naval = out.naval || !!source.navalBase;
    out.scout = out.scout || !!source.scoutBase;
    out.military = !!source.militaryBase;
    return out;
}

function formOfCopy(envelope: Envelope, copy: Copy): EditForm {
    const body = envelope.body || {};
    const source = profileSource(body, copy.edition);
    const cells = uwpCells(source);
    const baseFlags = basesNow(source);
    const sections: FormSection[] = [];
    sections.push({
        id: 'name',
        label: 'System name',
        fields: [
            field('name', 'System Name', 'text', 'type', text(body.name || source.name)),
            // js/hex_editor.js _showNamePropagationDialog. Default is the dismiss button, not propagate.
            field('name.propagate', 'Propagate names', 'switch', 'type', false),
        ],
    });
    sections.push({
        id: 'profile',
        label: 'Mainworld profile',
        fields: [
            field('profile.st', 'Starport', 'text', 'type', text(cells.st)),
            field('profile.s', 'Size', 'number', 'type', Number(cells.s)),
            field('profile.a', 'Atmosphere', 'number', 'type', Number(cells.a)),
            field('profile.h', 'Hydrographics', 'number', 'type', Number(cells.h)),
            field('profile.p', 'Population', 'number', 'type', Number(cells.p)),
            field('profile.g', 'Government', 'number', 'type', Number(cells.g)),
            field('profile.l', 'Law Level', 'number', 'type', Number(cells.l)),
            field('profile.tl', 'Tech Level', 'number', 'type', Number(cells.tl)),
        ],
    });
    const zone = text(source.travelZone || body.travelZone || 'Green');
    const chartFields: FormField[] = [
        field('chart.zone', 'Travel Zone', 'choice', 'type', zone === 'A' ? 'Amber' : zone === 'R' ? 'Red' : (zone || 'Green'), choices([
            ['Green', 'Green'], ['Amber', 'Amber'], ['Red', 'Red'],
        ])),
        field('chart.allegiance', 'Allegiance', 'text', 'type', text(body.allegiance || source.allegiance)),
        field('chart.region', 'Region', 'text', 'type', text(body.cluster || source.cluster)),
        field('chart.notes', 'Notes', 'text', 'type', text(body.notes || source.notes)),
        field('chart.trade', 'Trade Codes (Space Separated)', 'text', 'type', Array.isArray(source.tradeCodes) ? source.tradeCodes.join(' ') : text(source.tradeCodes)),
        field('chart.pbg', 'PBG', 'text', 'type', text(source.pbg)),
        field('chart.stellar', 'Stellar', 'text', 'type', text(source.homestar || source.stellar)),
        field('chart.gasGiant', 'Gas Giant', 'switch', 'type', !!source.gasGiant),
    ];
    for (const [key, label] of BASES) {
        chartFields.push(field(`chart.base.${key}`, label, 'switch', 'type', !!baseFlags[key]));
    }
    sections.push({ id: 'chart', label: 'On the chart', fields: chartFields });
    const socio = body.mgtSocio || source;
    sections.push({
        id: 'socio',
        label: 'MgT2E Socioeconomics',
        fields: SOCIO_FIELDS.map(([key, label, kind, permission]) => field(
            `socio.${key}`,
            label,
            kind,
            permission,
            kind === 'number' ? (num(socio[key]) ?? 0) : text(socio[key]),
        )),
    });
    const starFields: FormField[] = [];
    copy.stars.forEach((star, index) => {
        const prefix = star.id;
        const exo = star.sType === 'D' || star.sType === 'BD';
        starFields.push(field(`${prefix}.type`, index === 0 ? 'Primary type' : `${star.role} type`, 'choice', 'type', star.sType, choices(STAR_TYPES)));
        starFields.push(field(`${prefix}.subtype`, 'Subtype', 'choice', exo ? 'read' : 'type', String(star.subType), choices([0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => [String(n), String(n)] as const))));
        starFields.push(field(`${prefix}.class`, 'Class', 'choice', exo ? 'read' : 'type', star.sClass, choices(STAR_CLASSES)));
        if (index > 0) {
            starFields.push(field(`${prefix}.role`, 'Role', 'choice', 'type', ROLES.includes(star.role as typeof ROLES[number]) ? star.role : 'Companion', choices(ROLES.map((role) => [role, role] as const))));
            starFields.push(field(`${prefix}.orbit`, 'Orbit #', 'number', 'type', star.orbitId));
        }
        for (const [key, label] of DERIVED) {
            const value = star[key as keyof Star];
            starFields.push(field(`${prefix}.${key}`, label, 'number', 'roll', typeof value === 'number' ? value : null));
        }
        starFields.push(field(`${prefix}.addWorld`, '+World', 'switch', 'type', false));
        starFields.push(field(`${prefix}.addGasGiant`, '+GG', 'switch', 'type', false));
        starFields.push(field(`${prefix}.addBelt`, '+Belt', 'switch', 'type', false));
        if (copy.edition !== 'AoW' || copy.stars.length < 4) {
            starFields.push(field(`${prefix}.addCompanion`, '+Comp', 'switch', 'type', false));
        }
        if (index === 0) starFields.push(field(`${prefix}.addSecondary`, '+Secondary', 'switch', 'type', false));
        if (copy.stars.length > 1 && index > 0) starFields.push(field(`${prefix}.remove`, 'Delete this star', 'switch', 'type', false));
    });
    sections.push({ id: 'stars', label: 'Stars', fields: starFields });
    const systemFields: FormField[] = [
        field('system.age', 'Age', 'number', 'roll', copy.age),
        field('system.hzco', 'HZCO', 'number', 'roll', copy.hzco),
        field('system.allowAddBodies', 'Allow engine to add additional bodies', 'switch', 'type', copy.allowAddBodies),
    ];
    copy.bodies.forEach((item) => {
        systemFields.push(field(`${item.id}.name`, 'Name', 'text', 'type', item.name));
        systemFields.push(field(`${item.id}.orbit`, 'Orbit #', 'number', 'type', item.orbitId));
        systemFields.push(field(`${item.id}.au`, 'AU', 'number', 'read', item.au ?? orbitAu(item.orbitId)));
        if (item.type === 'Gas Giant' && copy.edition === 'MgT2E') {
            systemFields.push(field(`${item.id}.ggType`, 'Size', 'choice', 'type', item.ggType || 'GS', choices([
                ['GS', 'Small'], ['GM', 'Medium'], ['GL', 'Large'],
            ])));
        }
        if (item.type !== 'Gas Giant') {
            systemFields.push(field(`${item.id}.mainworld`, 'Mainworld', 'switch', 'type', item.isMainworld));
        }
        if (item.type !== 'Belt') systemFields.push(field(`${item.id}.addMoon`, '+Moon', 'switch', 'type', false));
        systemFields.push(field(`${item.id}.remove`, 'Delete body', 'switch', 'type', false));
        item.moons.forEach((moon) => {
            systemFields.push(field(`${moon.id}.name`, 'Moon name', 'text', 'type', moon.name));
            systemFields.push(field(`${moon.id}.pd`, 'Orbit (pd)', 'number', 'roll', moon.pd));
            systemFields.push(field(`${moon.id}.remove`, 'Delete moon', 'switch', 'type', false));
        });
    });
    sections.push({ id: 'system', label: 'System', fields: systemFields });
    // The seven places stay empty and say nothing. Labels are the design's places, not checks.
    const rules: [string, string][] = [
        ['R1', 'Profile digits'],
        ['R2', 'Trade codes'],
        ['R3', 'A new world'],
        ['R4', 'Bases'],
        ['R5', 'Travel zone and allegiance'],
        ['R6', 'Make mainworld'],
        ['R7', 'PBG, gas giants, gas mix, solar day'],
    ];
    sections.push({
        id: 'rules',
        label: 'Needs the rule',
        fields: rules.map(([id, label]) => field(`rule.${id}`, label, 'text', 'read', '')),
    });
    return { edition: copy.edition, sections };
}

export function formOf(envelope: Envelope): EditForm {
    return formOfCopy(envelope, copyOf(envelope));
}

function byId(form: EditForm): Map<string, FormField> {
    const map = new Map<string, FormField>();
    for (const section of form.sections) for (const item of section.fields) map.set(item.id, item);
    return map;
}

function truthy(value: FormValue): boolean {
    return value === true || value === 'true' || value === 1;
}

function mark(list: string[], key: string): void {
    if (!list.includes(key)) list.push(key);
}

function applyStructural(copy: Copy, changes: FormChange[], messages: FormMessage[]): boolean {
    let rerun = false;
    const stars = copy.stars;
    for (const change of changes) {
        const id = change.id;
        const star = stars.find((item) => id.startsWith(item.id + '.'));
        if (star && (id.endsWith('.addWorld') || id.endsWith('.addGasGiant') || id.endsWith('.addBelt')) && truthy(change.value)) {
            const kind = id.endsWith('.addGasGiant') ? 'Gas Giant' : id.endsWith('.addBelt') ? 'Belt' : 'World';
            addBody(copy, star, kind);
            rerun = true;
            continue;
        }
        if (star && (id.endsWith('.addCompanion') || id.endsWith('.addSecondary')) && truthy(change.value)) {
            const role = id.endsWith('.addSecondary') ? 'Far' : 'Companion';
            const blocked = addStar(copy, star, role, messages);
            if (!blocked) rerun = true;
            continue;
        }
        if (star && id === `${star.id}.remove` && truthy(change.value)) {
            if (stars.length <= 1 || stars[0] === star) {
                messages.push({ id, text: 'A system must have at least one star.', holds: false });
            } else {
                copy.stars = stars.filter((item) => item !== star);
                copy.bodies = copy.bodies.filter((item) => item.parentIndex !== stars.indexOf(star));
                rerun = true;
            }
        }
    }
    for (const change of changes) {
        const body = copy.bodies.find((item) => change.id.startsWith(item.id + '.'));
        if (!body) continue;
        if (change.id === `${body.id}.addMoon` && truthy(change.value)) {
            addMoon(body, messages);
            rerun = true;
        }
        if (change.id === `${body.id}.remove` && truthy(change.value)) {
            copy.bodies = copy.bodies.filter((item) => item !== body);
            if (copy.mainworldRef === body.id) copy.mainworldRef = null;
            rerun = true;
        }
        const moon = body.moons.find((item) => change.id === `${item.id}.remove`);
        if (moon && truthy(change.value)) {
            body.moons = body.moons.filter((item) => item !== moon);
            rerun = true;
        }
    }
    return rerun;
}

function addBody(copy: Copy, star: Star, kind: string): void {
    const parentIndex = copy.stars.indexOf(star);
    const siblings = copy.bodies.filter((item) => item.parentIndex === parentIndex);
    const orbitId = siblings.length ? Math.max(...siblings.map((item) => item.orbitId || 0)) + 1 : 1;
    copy.bodies.push({
        id: `body.${copy.bodies.length}`,
        type: kind,
        ggType: kind === 'Gas Giant' ? 'GS' : null,
        name: '',
        uwp: null,
        orbitId,
        au: null,
        parentIndex,
        isMainworld: false,
        travelZone: 'Green',
        moons: [],
        manual: ['type'],
        raw: kind === 'Belt' ? { size: 0, gravity: 0, temperature: 100 } : {},
        uwpSeed: null,
    });
}

function addStar(copy: Copy, parent: Star, role: string, messages: FormMessage[]): boolean {
    // js/system_editor.js _addStar, the AoW cap. The strings are that dialog's.
    if (copy.edition === 'AoW') {
        if (copy.stars.length >= 4) {
            messages.push({
                id: `${parent.id}.addCompanion`,
                text: 'AoW supports at most 4 stars, always in paired arrangements (a Quaternary system) — real multi-star systems beyond this are generally unstable. Remove a companion before adding another.',
                holds: false,
            });
            return true;
        }
        const companions = copy.stars.filter((item) => item.role !== 'Primary');
        if (companions.length === 2 && parent !== companions[1]) {
            messages.push({
                id: `${parent.id}.addCompanion`,
                text: 'A 4th star in an AoW system must pair with the most recently added companion, forming a second binary pair — use that companion\'s own "+Comp" button to add it.',
                holds: false,
            });
            return true;
        }
    }
    const parentIndex = copy.stars.indexOf(parent);
    copy.stars.push({
        id: `star.${copy.stars.length}`,
        role,
        sType: 'M',
        subType: 0,
        sClass: 'V',
        orbitId: ORBIT_BY_ROLE[role] ?? 12,
        orbitAU: null,
        parentIndex,
        mass: null,
        lum: null,
        diam: null,
        temp: null,
        mao: null,
        manual: [],
        raw: {},
    });
    return false;
}

function addMoon(body: Body, messages: FormMessage[]): void {
    const existing = body.moons.map((moon) => moon.pd).filter((value): value is number => value != null);
    const nextPd = existing.length ? Math.max(...existing) + 5 : 5;
    const hill = body.raw && body.raw.hillSpanPd;
    body.moons.push({
        id: `${body.id}.moon.${body.moons.length}`,
        name: '',
        uwp: null,
        isMainworld: false,
        pd: hill != null ? nextPd : null,
        manual: [],
        raw: {},
    });
    if (hill != null && nextPd > hill) {
        messages.push({
            id: `${body.id}.moon.${body.moons.length - 1}.pd`,
            text: `This moon's orbit (${nextPd.toFixed(1)} pd) exceeds the gas giant's Hill Sphere limit (${Number(hill).toFixed(1)} pd) — it may be destroyed when the system regenerates. You can lower its orbit (⌀) value manually.`,
            holds: false,
        });
    }
}

function applyValues(copy: Copy, changes: FormChange[]): boolean {
    let rerun = false;
    for (const change of changes) {
        const id = change.id;
        if (id === 'system.allowAddBodies') {
            copy.allowAddBodies = truthy(change.value);
            rerun = true;
            continue;
        }
        if (id === 'system.age') {
            copy.age = num(change.value);
            rerun = true;
            continue;
        }
        if (id === 'system.hzco') {
            copy.hzco = num(change.value);
            rerun = true;
            continue;
        }
        const star = copy.stars.find((item) => id.startsWith(item.id + '.'));
        if (star) {
            const leaf = id.slice(star.id.length + 1);
            if (leaf === 'type') {
                star.sType = text(change.value);
                const fixed = exotic(star.sType);
                if (fixed) { star.sClass = fixed.sClass; star.subType = fixed.subType; }
                mark(star.manual, 'sType');
                rerun = true;
            } else if (leaf === 'subtype') {
                star.subType = Number(change.value);
                mark(star.manual, 'subType');
                rerun = true;
            } else if (leaf === 'class') {
                star.sClass = text(change.value);
                mark(star.manual, 'sClass');
                rerun = true;
            } else if (leaf === 'role') {
                star.role = text(change.value);
                if (!star.manual.includes('orbitId')) star.orbitId = ORBIT_BY_ROLE[star.role] ?? star.orbitId;
                rerun = true;
            } else if (leaf === 'orbit') {
                star.orbitId = num(change.value);
                mark(star.manual, 'orbitId');
                rerun = true;
            } else if (DERIVED.some(([key]) => key === leaf)) {
                (star as Row)[leaf] = num(change.value);
                if (num(change.value) == null) star.manual = star.manual.filter((item) => item !== leaf);
                else mark(star.manual, leaf);
                rerun = true;
            }
            continue;
        }
        const body = copy.bodies.find((item) => id.startsWith(item.id + '.'));
        if (!body) continue;
        const leaf = id.slice(body.id.length + 1);
        if (leaf === 'name') { body.name = text(change.value); rerun = true; }
        else if (leaf === 'orbit') { body.orbitId = num(change.value); mark(body.manual, 'orbitId'); rerun = true; }
        else if (leaf === 'ggType' && body.type === 'Gas Giant') {
            body.ggType = text(change.value);
            delete body.raw.diamTerra; delete body.raw.diamKm; delete body.raw.diameterStr;
            delete body.raw.mass; delete body.raw.gravity; delete body.raw.density;
            rerun = true;
        } else if (leaf === 'mainworld') {
            const on = truthy(change.value);
            copy.bodies.forEach((item) => { item.isMainworld = false; });
            body.isMainworld = on;
            copy.mainworldRef = on ? body.id : null;
            if (on) mark(body.manual, 'isMainworld');
            rerun = true;
        } else if (leaf.startsWith('moon.')) {
            const moon = body.moons.find((item) => id.startsWith(item.id + '.'));
            if (!moon) continue;
            if (id.endsWith('.name')) { moon.name = text(change.value); rerun = true; }
            if (id.endsWith('.pd')) {
                moon.pd = num(change.value);
                if (moon.pd == null) moon.manual = moon.manual.filter((item) => item !== 'pd');
                else mark(moon.manual, 'pd');
                rerun = true;
            }
        }
    }
    return rerun;
}

function applyRolls(copy: Copy, rolls: { id: string }[], messages: FormMessage[]): { rerun: boolean; bodyId: string | null } {
    let rerun = false;
    let bodyId: string | null = null;
    for (const roll of rolls) {
        const id = roll.id;
        if (/^body\.\d+$/.test(id)) {
            if (copy.edition !== 'MgT2E') {
                messages.push({ id, text: 'Regeneration is only available for MgT2E systems.', holds: false });
                continue;
            }
            bodyId = id;
            rerun = true;
            continue;
        }
        const star = copy.stars.find((item) => id.startsWith(item.id + '.'));
        if (star && DERIVED.some(([key]) => id.endsWith('.' + key))) {
            const leaf = id.slice(star.id.length + 1);
            (star as Row)[leaf] = null;
            star.manual = star.manual.filter((item) => item !== leaf);
            rerun = true;
            continue;
        }
        if (id === 'system.age') { copy.age = null; rerun = true; continue; }
        if (id === 'system.hzco') { copy.hzco = null; rerun = true; continue; }
        const body = copy.bodies.find((item) => id.startsWith(item.id));
        const moon = body && body.moons.find((item) => id === `${item.id}.pd`);
        if (moon) { moon.pd = null; moon.manual = moon.manual.filter((item) => item !== 'pd'); rerun = true; continue; }
        throw new FormRefusal(`Nothing rolls ${id}.`);
    }
    return { rerun, bodyId };
}

function uwpLock(raw: Row, uwp: string | null): { fields: Row; mf: string[] } {
    // js/mgt2e_editor_adapter.js _mgt2eUwpLockFor.
    if (!uwp || !raw) return { fields: {}, mf: [] };
    const fields: Row = {};
    const mf: string[] = [];
    if (raw.size !== undefined) fields.size = raw.size;
    const atm = raw.atm !== undefined ? raw.atm : raw.atmCode;
    if (atm !== undefined) { fields.atmCode = atm; mf.push('atmCode'); }
    const hydro = raw.hydro !== undefined ? raw.hydro : raw.hydroCode;
    if (hydro !== undefined) { fields.hydroCode = hydro; mf.push('hydroCode'); }
    for (const key of ['pop', 'gov', 'law', 'tl', 'starport'] as const) {
        if (raw[key] !== undefined) { fields[key] = raw[key]; mf.push(key); }
    }
    if (raw.popCode !== undefined) fields.popCode = raw.popCode;
    if (raw.govCode !== undefined) fields.govCode = raw.govCode;
    return { fields, mf };
}

function physSeed(raw: Row): { fields: Row; mf: string[] } {
    const fields: Row = {};
    const mf: string[] = [];
    for (const key of PHYS) {
        if (raw[key] !== undefined && raw[key] !== null) { fields[key] = raw[key]; mf.push(key); }
    }
    return { fields, mf };
}

function socioSeed(raw: Row): Row | null {
    if (!raw || raw.RU === undefined) return null;
    const snap: Row = {};
    for (const key of EXT_SOCIO) if (raw[key] !== undefined) snap[key] = raw[key];
    return snap;
}

function seedFrom(copy: Copy, unlockBodyId: string | null): Row {
    const stars = copy.stars.map((star, index) => ({
        ...(star.raw || {}),
        _id: star.id,
        type: star.sType || 'G',
        sType: star.sType || 'G',
        decimal: star.subType != null ? star.subType : 5,
        size: star.sClass || 'V',
        sClass: star.sClass || 'V',
        role: star.role || (index === 0 ? 'Primary' : 'Companion'),
        name: `${star.sType || 'G'}${star.subType != null ? star.subType : 5} ${star.sClass || 'V'}`,
        specKey: `${star.sType || 'G'}${star.subType != null ? star.subType : 5}`,
        orbitId: star.orbitId != null ? star.orbitId : undefined,
        orbitID: star.orbitId != null ? star.orbitId : undefined,
        distAU: star.orbitAU,
        parentStarIdx: star.parentIndex || 0,
        separation: star.role === 'Primary' ? null : (star.role || 'Companion'),
        _manualFields: [...star.manual],
        mass: star.mass,
        lum: star.lum,
        luminosity: star.lum,
        diam: star.diam,
        temp: star.temp,
        mao: star.mao,
    }));
    resolvePhysics(stars, copy);
    const worlds = copy.bodies.map((item) => {
        const unlock = unlockBodyId === item.id;
        const locked = unlock ? { fields: {}, mf: [] } : uwpLock(item.raw, item.uwp);
        const phys = unlock ? { fields: {}, mf: [] } : physSeed(item.raw || {});
        const gg = !unlock && item.type === 'Gas Giant' && item.raw ? {
            ...(item.raw.diamTerra !== undefined && { diamTerra: item.raw.diamTerra }),
            ...(item.raw.diamKm !== undefined && { diamKm: item.raw.diamKm }),
            ...(item.raw.mass !== undefined && { mass: item.raw.mass }),
            ...(item.raw.gravity !== undefined && { gravity: item.raw.gravity }),
            ...(item.raw.density !== undefined && { density: item.raw.density }),
        } : {};
        const engType = item.isMainworld ? 'Mainworld'
            : item.type === 'Gas Giant' ? 'Gas Giant'
            : item.type === 'Belt' ? 'Planetoid Belt'
            : 'Terrestrial Planet';
        const au = item.orbitId != null ? (orbitAu(item.orbitId) ?? item.au ?? 1) : (item.au ?? 1);
        return {
            _id: item.id,
            type: copy.edition === 'AoW' ? item.type : engType,
            ggType: item.ggType,
            name: item.name || '',
            uwp: unlock ? null : item.uwp,
            ...locked.fields,
            ...phys.fields,
            ...gg,
            orbitId: item.orbitId,
            au,
            orbitalRadius: au,
            parentStarIdx: item.parentIndex,
            parentStarId: copy.stars[item.parentIndex] ? copy.stars[item.parentIndex].id : copy.stars[0].id,
            isMainworld: item.isMainworld,
            travelZone: item.travelZone === 'G' ? 'Green' : item.travelZone,
            _extSocioFrozen: unlock ? null : socioSeed(item.raw),
            rings: (item.raw && item.raw.rings) || [],
            _raw: item.raw,
            moons: item.moons.map((moon) => {
                const moonLock = unlock ? { fields: {}, mf: [] } : uwpLock(moon.raw, moon.uwp);
                const moonPhys = unlock ? { fields: {}, mf: [] } : physSeed(moon.raw || {});
                return {
                    _id: moon.id,
                    type: moon.isMainworld ? 'Mainworld' : 'Satellite',
                    name: moon.name || '',
                    uwp: unlock ? null : moon.uwp,
                    ...moonLock.fields,
                    ...moonPhys.fields,
                    isMainworld: moon.isMainworld,
                    pd: moon.pd ?? undefined,
                    _raw: moon.raw,
                    _manualFields: [...moon.manual, ...moonLock.mf, ...moonPhys.mf],
                    _extSocioFrozen: socioSeed(moon.raw),
                };
            }),
            _manualFields: [...item.manual, ...locked.mf, ...phys.mf],
        };
    });
    return {
        stars,
        worlds,
        _mainworldRef: copy.mainworldRef,
        _allowAddBodies: copy.allowAddBodies,
        age: copy.age,
        hzco: copy.hzco,
    };
}

function resolvePhysics(stars: Row[], copy: Copy): void {
    // js/system_editor.js _resolveStarPhysics. Non-CT uses the Mongoose stellar engine, AoW included.
    if (copy.age == null) copy.age = 5;
    for (const star of stars) {
        const needs = star.mass == null || star.lum == null || star.diam == null || star.temp == null;
        if (needs) {
            const derived = generateStarObject(star.sType || star.type || 'G', star.decimal ?? star.subType ?? 5, star.sClass || star.size || 'V', 'Resolve');
            if (star.mass == null) star.mass = derived.mass;
            if (star.lum == null) star.lum = derived.lum;
            if (star.diam == null) star.diam = derived.diam;
            if (star.temp == null) star.temp = derived.temp;
        }
        if (star.mao == null) star.mao = getMAO(star.sType || star.type || 'G', star.decimal ?? 5, star.sClass || star.size || 'V');
        star.luminosity = star.lum;
    }
    if (copy.edition === 'MgT2E' && copy.hzco == null && stars[0] && stars[0].lum != null) {
        copy.hzco = convertAuToOrbit(Math.sqrt(stars[0].lum));
    }
}

function runEngine(copy: Copy, seed: Row, envelope: Envelope): Row {
    configure(envelope.derivation.settings || {});
    setRandomSeed(envelope.derivation.seed);
    const linesAt = trace.lines.length;
    trace.enabled = true;
    try {
        const sys = copy.edition === 'AoW'
            ? generateAoWSystemBottomUp(copy.hexKey, seed)
            : generateMgT2ESystemBottomUp(copy.hexKey, seed);
        if (!sys) throw new FormRefusal('No system was produced.');
        return sys;
    } finally {
        trace.enabled = false;
        void linesAt;
    }
}

function install(body: Row, edition: 'MgT2E' | 'AoW', sys: Row, blank: boolean): Row {
    const next: Row = { ...body };
    // js/system_editor.js _clearSystemData, then the adapter's writes.
    next.ctData = null; next.ctSystem = null;
    next.t5Data = null; next.t5System = null;
    next.rttSystem = null; next.rttData = null;
    next.ctPhysical = null; next.mgtPhysical = null; next.t5Physical = null;
    next.t5Socio = null;
    if (edition === 'AoW') {
        next.aowSystem = sys;
        next.mgtSystem = null;
    } else {
        next.mgtSystem = sys;
        next.aowSystem = null;
    }
    next.mgt2eData = sys.mainworld || null;
    next.mgtSocio = sys.mainworld || null;
    const name = sys.mainworld && sys.mainworld.name;
    if (name) next.name = name;
    next.type = 'SYSTEM_PRESENT';
    if (blank) {
        // js/system_editor.js _forceGreenTravelZone. AoW's own key is not in that list.
        if (next.mgt2eData) next.mgt2eData.travelZone = 'Green';
        if (edition === 'MgT2E' && sys.worlds) {
            const mw = sys.worlds.find((world: Row) => world && world.isMainworld);
            if (mw) mw.travelZone = 'Green';
        }
    }
    return next;
}

function directIds(id: string): boolean {
    return id === 'name' || id === 'name.propagate' || id.startsWith('profile.') || id.startsWith('chart.') || id.startsWith('socio.');
}

function writeDirect(body: Row, edition: 'MgT2E' | 'AoW', changes: FormChange[]): void {
    const source = profileSource(body, edition);
    const cells = uwpCells(source);
    const flags = basesNow(source);
    let name = text(body.name || source.name);
    let propagate = false;
    let zone = text(source.travelZone || 'Green');
    let allegiance = text(body.allegiance || source.allegiance);
    let region = text(body.cluster || source.cluster);
    let notes = text(body.notes || source.notes);
    let trade = Array.isArray(source.tradeCodes) ? [...source.tradeCodes] : text(source.tradeCodes).split(/[\s,]+/).filter(Boolean);
    let pbg = text(source.pbg);
    let stellar = text(source.homestar || source.stellar);
    let gas = !!source.gasGiant;
    const socio: Row = { ...(body.mgtSocio || {}) };
    for (const change of changes) {
        if (!directIds(change.id)) continue;
        if (change.id === 'name') name = text(change.value).trim();
        else if (change.id === 'name.propagate') propagate = truthy(change.value);
        else if (change.id === 'profile.st') cells.st = text(change.value).toUpperCase().replace(/[^A-Z]/g, '').slice(0, 1);
        else if (change.id === 'profile.s') cells.s = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'profile.a') cells.a = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'profile.h') cells.h = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'profile.p') cells.p = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'profile.g') cells.g = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'profile.l') cells.l = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'profile.tl') cells.tl = parseInt(text(change.value), 10) || 0;
        else if (change.id === 'chart.zone') zone = text(change.value) || 'Green';
        else if (change.id === 'chart.allegiance') allegiance = text(change.value).trim() || '----';
        else if (change.id === 'chart.region') region = text(change.value).trim() || '----';
        else if (change.id === 'chart.notes') notes = text(change.value).trim();
        else if (change.id === 'chart.trade') trade = text(change.value).split(/[\s,]+/).map((item) => item.trim()).filter(Boolean);
        else if (change.id === 'chart.pbg') pbg = text(change.value).padEnd(3, '0').toUpperCase().slice(0, 3);
        else if (change.id === 'chart.stellar') stellar = text(change.value).trim();
        else if (change.id === 'chart.gasGiant') gas = truthy(change.value);
        else if (change.id.startsWith('chart.base.')) flags[change.id.slice('chart.base.'.length)] = truthy(change.value);
        else if (change.id.startsWith('socio.')) {
            const key = change.id.slice('socio.'.length);
            const spec = SOCIO_FIELDS.find((item) => item[0] === key);
            if (!spec || spec[3] === 'read') continue;
            socio[key] = spec[2] === 'number' ? (parseInt(text(change.value), 10) || 0) : change.value;
        }
    }
    const bases: string[] = [];
    for (const [key, , code] of BASES) if (code && flags[key]) bases.push(code);
    const uwp = `${cells.st}${toEHex(Number(cells.s))}${toEHex(Number(cells.a))}${toEHex(Number(cells.h))}${toEHex(Number(cells.p))}${toEHex(Number(cells.g))}${toEHex(Number(cells.l))}-${toEHex(Number(cells.tl))}`;
    const shared: Row = {
        uwp, travelZone: zone, tradeCodes: trade, starport: cells.st,
        size: cells.s, atm: cells.a, hydro: cells.h, pop: cells.p, gov: cells.g, law: cells.l, tl: cells.tl,
        bases, navalBase: !!flags.naval, scoutBase: !!flags.scout, militaryBase: !!flags.military,
        gasGiant: gas, allegiance, cluster: region, notes, name,
    };
    if (pbg) {
        shared.pbg = pbg;
        shared.popDigit = fromEHex(pbg[0]);
        shared.planetoidBelts = fromEHex(pbg[1]);
        shared.gasGiantsCount = fromEHex(pbg[2]);
    }
    if (stellar) shared.homestar = stellar;
    const oldName = text(body.name || source.name);
    body.name = name;
    body.allegiance = allegiance;
    body.cluster = region;
    body.notes = notes;
    if (body.mgtSocio) Object.assign(body.mgtSocio, shared, socio, { name });
    if (body.mgt2eData) body.mgt2eData = { ...body.mgt2eData, ...shared, name };
    const sys = edition === 'AoW' ? body.aowSystem : body.mgtSystem;
    if (sys && Array.isArray(sys.worlds)) {
        const mw = sys.worlds.find((world: Row) => world && (world.type === 'Mainworld' || world.isMainworld)) || sys.mainworld;
        if (mw) Object.assign(mw, shared, socio, { name });
        if (sys.mainworld && sys.mainworld !== mw) Object.assign(sys.mainworld, shared, socio, { name });
    }
    if (propagate && oldName && oldName !== name) propagateName(body, oldName, name);
}

function propagateName(body: Row, oldName: string, newName: string): void {
    // js/hex_editor.js _propagateSystemName.
    const rename = (value: string) => {
        if (!value) return value;
        if (value === oldName) return newName;
        if (value.startsWith(oldName + ' ') || value.startsWith(oldName + '-')) return newName + value.slice(oldName.length);
        return value;
    };
    const walk = (worlds: Row[] | undefined, moonKey: string) => {
        for (const world of worlds || []) {
            if (!world) continue;
            world.name = rename(world.name);
            for (const moon of world[moonKey] || []) if (moon) moon.name = rename(moon.name);
        }
    };
    if (body.mgtSystem) walk(body.mgtSystem.worlds, 'moons');
    if (body.aowSystem) walk(body.aowSystem.worlds, 'satellites');
    if (body.aowSystem) walk(body.aowSystem.worlds, 'moons');
}

function envelopeFrom(envelope: Envelope, body: Row): Envelope {
    return {
        kind: 'tree',
        engineVersion: envelope.engineVersion,
        derivation: envelope.derivation,
        hexKey: envelope.hexKey,
        body: stripHexViewState(body),
    };
}

function whyFor(id: string, lines: string[]): string {
    const leaf = id.split('.').pop() || id;
    const hits = lines.filter((line) => line.includes(leaf) || line.includes(id));
    return hits.join('\n');
}

function messagesFromTrace(lines: string[]): FormMessage[] {
    return lines.filter((line) => line.includes('AGE CONFLICT') || line.includes('ERROR')).map((line) => ({
        id: line.includes('AGE CONFLICT') ? 'stars' : null,
        text: line.trim(),
        holds: false,
    }));
}

export function applyForm(envelope: Envelope, changes: FormChange[] = [], roll: { id: string }[] = []): { envelope: Envelope; answer: FormAnswer } {
    const before = formOf(envelope);
    const known = byId(before);
    for (const change of changes) {
        const item = known.get(change.id);
        if (!item) throw new FormRefusal(`Unknown field ${change.id}.`);
        if (item.permission === 'read') throw new FormRefusal(`${change.id} cannot be edited.`);
    }
    if (changes.length === 0 && roll.length === 0) {
        return { envelope, answer: { form: before, changed: [], messages: [] } };
    }
    const copy = copyOf(envelope);
    const messages: FormMessage[] = [];
    const structural = applyStructural(copy, changes, messages);
    const valued = applyValues(copy, changes.filter((change) => !change.id.endsWith('.addWorld') && !change.id.endsWith('.addGasGiant') && !change.id.endsWith('.addBelt') && !change.id.endsWith('.addCompanion') && !change.id.endsWith('.addSecondary') && !change.id.endsWith('.addMoon') && !change.id.endsWith('.remove')));
    const rolled = applyRolls(copy, roll, messages);
    const direct = changes.some((change) => directIds(change.id));
    let nextBody = structuredClone(envelope.body);
    let traceLines: string[] = [];
    if (structural || valued || rolled.rerun) {
        const start = trace.lines.length;
        try {
            const seed = seedFrom(copy, rolled.bodyId);
            const sys = runEngine(copy, seed, envelope);
            if (rolled.bodyId && sys.worlds) {
                const index = copy.bodies.findIndex((item) => item.id === rolled.bodyId);
                // The snapshots are the pre-run worlds. Taken from the original body.
                const original = systemOf(envelope.body, copy.edition);
                (original.worlds || []).forEach((world: Row, i: number) => {
                    if (i === index || !sys.worlds[i] || !world) return;
                    if (world.uwp != null) sys.worlds[i].uwp = world.uwp;
                    if (world.name) sys.worlds[i].name = world.name;
                    if (world.travelZone) sys.worlds[i].travelZone = world.travelZone;
                    if (world.ggType) sys.worlds[i].ggType = world.ggType;
                    if (world.moons && world.moons.length) sys.worlds[i].moons = world.moons;
                });
            }
            const ageLine = trace.lines.slice(start).find((line: string) => line.includes('AGE CONFLICT'));
            if (sys.ageConflict && !ageLine) {
                messages.push({ id: 'stars', text: JSON.stringify(sys.ageConflict.stars || sys.ageConflict), holds: false });
            }
            nextBody = install(nextBody, copy.edition, sys, copy.bodies.length === 0 && envelope.body && !systemOf(envelope.body, copy.edition).worlds?.length);
        } catch (err) {
            const textValue = err instanceof Error ? err.message : String(err);
            messages.push({ id: null, text: textValue, holds: true });
            return { envelope, answer: { form: before, changed: [], messages } };
        }
        traceLines = trace.lines.slice(start);
        messages.push(...messagesFromTrace(traceLines));
    }
    if (direct) writeDirect(nextBody, copy.edition, changes);
    const next = envelopeFrom(envelope, nextBody);
    const form = formOf(next);
    const after = byId(form);
    const changed = [...after.entries()]
        .filter(([id, item]) => {
            const prior = known.get(id);
            return prior ? prior.value !== item.value : true;
        })
        .map(([id]) => ({ id, why: whyFor(id, traceLines) }));
    return { envelope: next, answer: { form, changed, messages } };
}

export function blankEnvelope(hexKey: string, edition: 'MgT2E' | 'AoW', pinned: { seed: string; settings: Record<string, unknown>; engineVersion: string }, star?: { sType?: string; subType?: number; sClass?: string }): Envelope {
    // js/system_editor.js openCreate defaults, then _buildBlankWorkingCopy and the auto preview.
    const sType = star?.sType || 'G';
    const fixed = exotic(sType);
    const subType = fixed ? fixed.subType : (star?.subType != null ? star.subType : 2);
    const sClass = fixed ? fixed.sClass : (star?.sClass || 'V');
    const knownType = STAR_TYPES.some(([value]) => value === sType);
    const knownClass = STAR_CLASSES.some(([value]) => value === sClass);
    if (!knownType || !knownClass) throw new FormRefusal('That star is not one the editor offers.');
    const empty: Envelope = {
        kind: 'tree',
        engineVersion: pinned.engineVersion,
        derivation: { edition, mode: 'bottom-up', seed: pinned.seed, settings: pinned.settings, inputs: { stage: null, summary: { type: 'SYSTEM_PRESENT' }, priorBody: null } },
        hexKey,
        body: { type: 'SYSTEM_PRESENT', hexId: hexKey },
    };
    const copy: Copy = {
        edition, hexKey, allowAddBodies: false, age: null, hzco: null, mainworldRef: null,
        stars: [{
            id: 'star.0', role: 'Primary', sType, subType, sClass, orbitId: null, orbitAU: null, parentIndex: 0,
            mass: null, lum: null, diam: null, temp: null, mao: null, manual: [], raw: {},
        }],
        bodies: [],
    };
    const seed = seedFrom(copy, null);
    const sys = runEngine(copy, seed, empty);
    const body = install({ type: 'SYSTEM_PRESENT', hexId: hexKey }, edition, sys, true);
    return envelopeFrom(empty, body);
}
