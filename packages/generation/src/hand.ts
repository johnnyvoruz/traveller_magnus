/**
 * Read and write a hand-designed system.
 * A profile roll calls `rollBodyProfile` for one body. Nothing else runs a generator.
 */
import type { EditForm, FormAnswer, FormChange, FormField, FormMessage, FormSection, FormValue, HandBody, HandEnvelope, HandKind, HandProfile, HandStar, HandSystem } from '@voyage/shared';
import { emptyHandProfile, HAND_LIMITS, HandSystem as HandSystemSchema } from '@voyage/shared';
import { fromEHex, generateStarObject, MgT2EMath, rollBodyProfile } from '@voyage/engines';

export class HandRefusal extends Error {
    readonly fieldId: string | null;

    constructor(message: string, fieldId: string | null = null) {
        super(message);
        this.name = 'HandRefusal';
        this.fieldId = fieldId;
    }
}

type HandEnv = HandEnvelope;

const PROFILE = ['st', 's', 'a', 'h', 'p', 'g', 'l', 'tl'] as const;
const PROFILE_LABELS: Record<(typeof PROFILE)[number], string> = {
    st: 'Starport', s: 'Size', a: 'Atmosphere', h: 'Hydrographics',
    p: 'Population', g: 'Government', l: 'Law Level', tl: 'Tech Level',
};
const KINDS: [HandKind, string][] = [
    ['world', 'World'],
    ['moon', 'Moon'],
    ['gas', 'Gas giant'],
    ['belt', 'Belt'],
];
/**
 * Values are the keys of `rules/mgt2e_data.js` `starStats` (lines 244 to 254).
 * Labels are the generated editor's, `form.ts` `STAR_TYPES`.
 */
const STAR_TYPES: [string, string][] = [
    ['O', 'O — Blue'], ['B', 'B — Blue-White'], ['A', 'A — White'], ['F', 'F — Yellow-White'],
    ['G', 'G — Yellow'], ['K', 'K — Orange'], ['M', 'M — Red'], ['D', 'D — White Dwarf'], ['BD', 'BD — Brown Dwarf'],
];
/** `rules/mgt2e_data.js` `starStats_Ia` through `starStats_VI` and `starStats_BD` (`D`). Labels from `form.ts` `STAR_CLASSES`. */
const STAR_CLASSES: [string, string][] = [
    ['Ia', 'Ia — Supergiant'], ['Ib', 'Ib — Supergiant (dim)'], ['II', 'II — Bright Giant'],
    ['III', 'III — Giant'], ['IV', 'IV — Subgiant'], ['V', 'V — Main Sequence'],
    ['VI', 'VI — Subdwarf'], ['D', 'D — White Dwarf'],
];
/** Digits the generated form offers (`form.ts` subtype choice). The engine interpolates any of these. */
const STAR_SUBTYPES: [string, string][] = ['0', '1', '2', '3', '4', '5', '6', '7', '8', '9'].map((digit) => [digit, digit]);

function choices(pairs: readonly (readonly [string, string])[]): { value: string; label: string }[] {
    return pairs.map(([value, label]) => ({ value, label }));
}

/** `form.ts` `exotic`, the same force as `generateStarObject` for `D` and `BD`. */
function exoticStar(sType: string): { sClass: string; subType: string } | null {
    if (sType === 'D') return { sClass: 'D', subType: '0' };
    if (sType === 'BD') return { sClass: 'V', subType: '0' };
    return null;
}

/**
 * The engine's own name spelling in `generateStarObject`.
 * A brown dwarf or white dwarf is `sType` and `sClass`. Any other star is `sType`, `subType`, and `sClass`.
 * Empty pieces are left out. Nothing is read from a luminosity table.
 */
function classText(star: HandStar): string {
    const type = star.sType.trim();
    const sub = star.subType.trim();
    const cls = star.sClass.trim();
    if (type === '' && sub === '' && cls === '') return '';
    if (type === 'D' || type === 'BD') return [type, cls].filter((part) => part !== '').join(' ');
    return [`${type}${sub}`.trim(), cls].filter((part) => part !== '').join(' ');
}

function subtypeNumber(value: string): number | null {
    if (value.trim() === '') return null;
    const number = Number(value);
    return Number.isFinite(number) ? number : null;
}

type StarNumbers = { mass: number; diam: number; temp: number; lum: number };

/** `generateStarObject` when type, subtype, and class can be passed. Otherwise none. */
function lookedUpStar(star: HandStar): StarNumbers | null {
    const subtype = subtypeNumber(star.subType);
    if (!star.sType || !star.sClass || subtype === null) return null;
    const made = generateStarObject(star.sType, subtype, star.sClass, 'Lookup');
    if (typeof made.mass !== 'number' || typeof made.diam !== 'number' || typeof made.temp !== 'number' || typeof made.lum !== 'number') return null;
    return { mass: made.mass, diam: made.diam, temp: made.temp, lum: made.lum };
}

/** Shown luminosity. Typed diameter or temperature wins; nothing is stored here. */
function shownLum(star: HandStar, looked: StarNumbers | null): number | null {
    const diam = star.diam ?? looked?.diam ?? null;
    const temp = star.temp ?? looked?.temp ?? null;
    if ((star.diam != null || star.temp != null) && diam != null && temp != null && diam > 0 && temp > 0) {
        return MgT2EMath.calculateStellarLuminosity(diam, temp);
    }
    return looked?.lum ?? null;
}

function storedPositive(value: number | undefined): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function setList(names: string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    if (names.length === 2) return `${names[0]} and ${names[1]}`;
    const last = names[names.length - 1] ?? '';
    return `${names.slice(0, -1).join(', ')}, and ${last}`;
}

function starLabel(star: HandStar): string {
    return star.name.trim() || classText(star) || 'No name';
}

function bodyLabel(body: HandBody): string {
    return body.name.trim() || 'No name';
}

/** Parents the server already accepts for this body. Values are ids. Labels are names. */
function parentChoices(system: HandSystem, id: string, kind: 'star' | HandKind): { value: string; label: string }[] {
    const stars = byOrder(system.stars);
    const options: { value: string; label: string }[] = [];
    if (kind === 'star') {
        options.push({ value: '', label: 'Nothing' });
        for (const star of stars) {
            if (star.id === id) continue;
            options.push({ value: star.id, label: starLabel(star) });
        }
        return options;
    }
    for (const star of stars) options.push({ value: star.id, label: starLabel(star) });
    if (kind !== 'moon') {
        for (const star of stars) {
            if (!star.parentId) continue;
            const primary = stars.find((item) => item.id === star.parentId);
            if (!primary || primary.id === star.id) continue;
            options.push({ value: `${primary.id}+${star.id}`, label: `${starLabel(primary)} and ${starLabel(star)}` });
        }
    }
    if (kind === 'moon' || kind === 'belt') {
        for (const body of byOrder(system.bodies)) {
            if (body.id === id) continue;
            if (kind === 'belt' && body.kind !== 'world' && body.kind !== 'gas') continue;
            if (kind === 'moon' && body.kind === 'moon') continue;
            options.push({ value: body.id, label: bodyLabel(body) });
        }
    }
    return options;
}

const STAR_TYPE_VALUES = STAR_TYPES.map(([value]) => value);
const STAR_CLASS_VALUES = STAR_CLASSES.map(([value]) => value);
const STAR_SUBTYPE_VALUES = STAR_SUBTYPES.map(([value]) => value);

function fromList(value: FormValue, allowed: readonly string[], label: string): string {
    const next = typeof value === 'number' && Number.isInteger(value) ? String(value) : text(value).trim();
    if (!allowed.includes(next)) throw new HandRefusal(`Choose a ${label} from the list.`);
    return next.slice(0, 8);
}

function text(value: FormValue): string {
    if (value == null) return '';
    return String(value);
}

const LEAF_LABELS: Record<string, string> = {
    name: 'Name',
    classText: 'Spectral class',
    type: 'Type',
    subtype: 'Subtype',
    class: 'Class',
    parent: 'Parent',
    order: 'Order',
    'orbit.id': 'Orbit',
    'orbit.au': 'AU',
    'orbit.eccentricity': 'Eccentricity',
    'orbit.years': 'Period (years)',
    'orbit.pd': 'Orbit (planetary diameters)',
    mass: 'Mass',
    diam: 'Diameter',
    temp: 'Temperature',
    lum: 'Luminosity',
    remove: 'Remove',
    kind: 'Kind',
    mainworld: 'Mainworld',
    notes: 'Notes',
    bases: 'Bases',
    zone: 'Travel zone',
    allegiance: 'Allegiance',
    trade: 'Trade codes',
};

/**
 * The leaf after the owner. A numbered owner is `name.12.leaf`, so `star.0.temp` is `temp`.
 * `s1.orbit.id` has no numeric segment and stays `orbit.id`.
 */
function fieldLeaf(id: string): string {
    const parts = id.split('.');
    if (parts.length >= 3 && /^\d+$/.test(parts[1] ?? '')) return parts.slice(2).join('.');
    const dot = id.indexOf('.');
    return dot < 0 ? id : id.slice(dot + 1);
}

/** The form label for this id. A raw id never reaches a sentence. */
function fieldLabel(id: string): string {
    if (id === 'system.name') return 'System Name';
    if (id === 'system.notes') return 'Notes';
    if (id === 'star.add') return 'Add a star';
    if (id === 'body.add') return 'Add a world';
    const leaf = fieldLeaf(id);
    if (leaf.startsWith('profile.')) {
        const cell = leaf.slice('profile.'.length);
        if (cell in PROFILE_LABELS) return PROFILE_LABELS[cell as keyof typeof PROFILE_LABELS];
    }
    return LEAF_LABELS[leaf] ?? 'This field';
}

function holdText(id: string, next: string, label?: string): string {
    return `${label ?? fieldLabel(id)} cannot hold that. ${next}`;
}

const UNKNOWN_FIELD = 'This form has no field with that name. Check the field and try again.';

function field(id: string, label: string, kind: FormField['kind'], permission: FormField['permission'], value: FormValue, options: FormField['options'] = [], lookup?: number | null): FormField {
    const made: FormField = { id, label, kind, permission, value, options };
    if (lookup !== undefined) made.lookup = lookup;
    return made;
}

function byOrder<T extends { order: number; id: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

function rules(): FormSection {
    const names: [string, string][] = [
        ['R1', 'Profile digits'],
        ['R2', 'Trade codes'],
        ['R3', 'A new world'],
        ['R4', 'Bases'],
        ['R5', 'Travel zone and allegiance'],
        ['R6', 'Make mainworld'],
        ['R7', 'PBG, gas giants, gas mix, solar day'],
    ];
    return {
        id: 'rules',
        label: 'Needs the rule',
        fields: names.map(([id, label]) => field(`rule.${id}`, label, 'text', 'read', '')),
    };
}

export function blankHand(hexKey: string, edition: 'MgT2E' | 'AoW' | undefined, engineVersion: string): HandEnv {
    const envelope: HandEnv = {
        kind: 'hand',
        engineVersion,
        hexKey,
        system: { name: '', notes: '', stars: [], bodies: [] },
    };
    if (edition) envelope.edition = edition;
    return envelope;
}

export function formOfHand(envelope: HandEnv): EditForm {
    const system = envelope.system;
    const stars = byOrder(system.stars);
    const bodies = byOrder(system.bodies);
    const starFields: FormField[] = [];
    for (const star of stars) {
        const prefix = star.id;
        const listed = envelope.edition === 'MgT2E';
        const forced = listed ? exoticStar(star.sType) : null;
        starFields.push(field(`${prefix}.name`, 'Name', 'text', 'type', star.name));
        starFields.push(field(`${prefix}.classText`, 'Spectral class', 'text', 'read', classText(star)));
        starFields.push(field(`${prefix}.type`, 'Type', listed ? 'choice' : 'text', 'type', star.sType, listed ? choices(STAR_TYPES) : []));
        starFields.push(field(`${prefix}.subtype`, 'Subtype', listed ? 'choice' : 'text', forced ? 'read' : 'type', star.subType, listed ? choices(forced ? [[forced.subType, forced.subType]] : STAR_SUBTYPES) : []));
        starFields.push(field(`${prefix}.class`, 'Class', listed ? 'choice' : 'text', forced ? 'read' : 'type', star.sClass, listed ? choices(forced ? [[forced.sClass, forced.sClass]] : STAR_CLASSES) : []));
        const looked = lookedUpStar(star);
        starFields.push(field(`${prefix}.mass`, 'Mass', 'number', 'type', star.mass ?? null, [], looked?.mass ?? null));
        starFields.push(field(`${prefix}.diam`, 'Diameter', 'number', 'type', star.diam ?? null, [], looked?.diam ?? null));
        starFields.push(field(`${prefix}.temp`, 'Temperature', 'number', 'type', star.temp ?? null, [], looked?.temp ?? null));
        starFields.push(field(`${prefix}.lum`, 'Luminosity', 'number', 'type', star.lum ?? null, [], shownLum(star, looked)));
        starFields.push(field(`${prefix}.parent`, 'Orbits', 'choice', 'type', star.parentId ?? '', parentChoices(system, star.id, 'star')));
        starFields.push(field(`${prefix}.order`, 'Order', 'number', 'type', star.order));
        starFields.push(field(`${prefix}.orbit.id`, 'Orbit', 'number', 'type', star.orbitId ?? null));
        starFields.push(field(`${prefix}.orbit.au`, 'AU', 'number', 'type', star.orbitAU ?? null));
        starFields.push(field(`${prefix}.orbit.eccentricity`, 'Eccentricity', 'number', 'type', star.eccentricity ?? null));
        starFields.push(field(`${prefix}.orbit.years`, 'Period (years)', 'number', 'type', star.periodYears ?? null));
        starFields.push(field(`${prefix}.remove`, 'Remove', 'switch', 'type', false));
    }
    starFields.push(field('star.add', 'Add a star', 'switch', 'type', false));
    const bodyFields: FormField[] = [];
    for (const body of bodies) {
        const prefix = body.id;
        bodyFields.push(field(`${prefix}.name`, 'Name', 'text', 'type', body.name));
        bodyFields.push(field(`${prefix}.kind`, 'Kind', 'choice', 'type', body.kind, KINDS.map(([value, label]) => ({ value, label }))));
        const parentShown = body.alsoParentId ? `${body.parentId}+${body.alsoParentId}` : body.parentId;
        bodyFields.push(field(`${prefix}.parent`, 'Parent', 'choice', 'type', parentShown, parentChoices(system, body.id, body.kind)));
        bodyFields.push(field(`${prefix}.order`, 'Order', 'number', 'type', body.order));
        for (const item of bodyOrbitFields(system, body)) bodyFields.push(item);
        bodyFields.push(field(`${prefix}.mainworld`, 'Mainworld', 'switch', 'type', body.mainworld));
        for (const cell of PROFILE) {
            bodyFields.push(field(`${prefix}.profile.${cell}`, PROFILE_LABELS[cell], 'text', 'type', body.profile[cell]));
        }
        bodyFields.push(field(`${prefix}.notes`, 'Notes', 'text', 'type', body.notes));
        bodyFields.push(field(`${prefix}.bases`, 'Bases', 'text', 'type', body.bases));
        bodyFields.push(field(`${prefix}.zone`, 'Travel zone', 'text', 'type', body.zone));
        bodyFields.push(field(`${prefix}.allegiance`, 'Allegiance', 'text', 'type', body.allegiance));
        bodyFields.push(field(`${prefix}.trade`, 'Trade codes', 'text', 'type', body.trade));
        bodyFields.push(field(`${prefix}.remove`, 'Remove', 'switch', 'type', false));
    }
    bodyFields.push(field('body.add', 'Add a world', 'switch', 'type', false));
    const form: EditForm = {
        mode: 'hand',
        sections: [
            { id: 'name', label: 'System name', fields: [field('system.name', 'System Name', 'text', 'type', system.name)] },
            { id: 'notes', label: 'Notes', fields: [field('system.notes', 'Notes', 'text', 'type', system.notes)] },
            { id: 'stars', label: 'Stars', fields: starFields },
            { id: 'bodies', label: 'Worlds', fields: bodyFields },
            rules(),
        ],
    };
    if (envelope.edition) form.edition = envelope.edition;
    return form;
}

function knownIds(form: EditForm): Map<string, FormField> {
    const map = new Map<string, FormField>();
    for (const section of form.sections) for (const item of section.fields) map.set(item.id, item);
    return map;
}

function oneChar(id: string, value: FormValue): string {
    if (value == null || value === '') return '';
    if (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= 9) return String(value);
    const cell = text(value).trim();
    if (cell.length === 1) return cell;
    throw new HandRefusal(holdText(id, 'Type one character.'), id);
}

function bounded(id: string, value: FormValue, max: number, label?: string): string {
    const next = text(value);
    if (next.length > max) throw new HandRefusal(holdText(id, 'Shorten it.', label), id);
    return next;
}

function nextId(items: { id: string }[], prefix: string): string {
    let n = 1;
    const taken = new Set(items.map((item) => item.id));
    while (taken.has(prefix + n)) n += 1;
    return prefix + n;
}

/** An id the client made. Letters, digits, `.`, `_`, and `-` only, so `+` stays the pair mark. */
function clientId(fieldId: string, value: FormValue, items: { id: string }[], prefix: string): string | null {
    if (value === false || value === 'false' || value === 0 || value === null || value === '') return null;
    if (truthy(value)) return nextId(items, prefix);
    const id = text(value).trim();
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id)) throw new HandRefusal(holdText(fieldId, 'Use letters, digits, periods, underscores, or hyphens.'), fieldId);
    if (items.some((item) => item.id === id || id.startsWith(item.id + '.') || item.id.startsWith(id + '.'))) {
        throw new HandRefusal('This system already has a star or a world with that identifier. Choose another.');
    }
    return id;
}

function readParent(id: string, value: FormValue): { parentId: string; alsoParentId?: string } {
    const raw = text(value).trim();
    if (!raw.includes('+')) return { parentId: bounded(id, raw, 40) };
    const parts = raw.split('+');
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0 || parts[0] === parts[1] || parts[0].length > 40 || parts[1].length > 40) {
        throw new HandRefusal(holdText(id, 'Choose a parent from the list.'), id);
    }
    return { parentId: parts[0], alsoParentId: parts[1] };
}

function truthy(value: FormValue): boolean {
    return value === true || value === 'true' || value === 1;
}

/** A finite number above 0, or null when the referee clears the field. */
function starMeasure(id: string, value: FormValue, label: string): number | null {
    if (value === null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
        throw new HandRefusal(`${label} cannot hold that. Type a finite number above 0.`, id);
    }
    return value;
}

function orbitNumber(id: string, value: FormValue): number | null {
    if (value === null || value === '') return null;
    if (typeof value !== 'number' || !Number.isFinite(value)) throw new HandRefusal(holdText(id, 'Type a finite number.'), id);
    return value;
}

function putNumber<T extends object>(item: T, key: keyof T, next: number | null): void {
    if (next === null) delete item[key];
    else item[key] = next as T[keyof T];
}

const BELT_YEAR_LEAVES = ['orbit.years', 'orbit.days', 'orbit.hours'] as const;

function beltAroundBody(system: HandSystem, body: HandBody): boolean {
    if (body.kind !== 'belt') return false;
    const host = system.bodies.find((item) => item.id === body.parentId);
    return !!host && (host.kind === 'world' || host.kind === 'gas');
}

function bodyOrbitFields(system: HandSystem, body: HandBody): FormField[] {
    const prefix = body.id;
    if (body.kind === 'moon' || beltAroundBody(system, body)) {
        return [
            field(`${prefix}.orbit.pd`, 'Orbit (planetary diameters)', 'number', 'type', body.pd ?? null),
            field(`${prefix}.orbit.eccentricity`, 'Eccentricity', 'number', 'type', body.eccentricity ?? null),
        ];
    }
    const fields = [
        field(`${prefix}.orbit.id`, 'Orbit', 'number', 'type', body.orbitId ?? null),
        field(`${prefix}.orbit.au`, 'AU', 'number', 'type', body.au ?? null),
        field(`${prefix}.orbit.eccentricity`, 'Eccentricity', 'number', 'type', body.eccentricity ?? null),
    ];
    if (body.kind !== 'belt') fields.push(field(`${prefix}.orbit.years`, 'Period (years)', 'number', 'type', body.periodYears ?? null));
    return fields;
}

const BODY_FIELDS = ['name', 'kind', 'parent', 'order', 'mainworld', 'notes', 'bases', 'zone', 'allegiance', 'trade', 'remove'] as const;

function starIdOf(system: HandSystem, fieldId: string): string | null {
    const stars = [...system.stars].sort((a, b) => b.id.length - a.id.length);
    for (const star of stars) {
        if (fieldId.startsWith(star.id + '.')) return star.id;
    }
    return null;
}

function bodyIdOf(system: HandSystem, fieldId: string): string | null {
    const bodies = [...system.bodies].sort((a, b) => b.id.length - a.id.length);
    for (const body of bodies) {
        if (fieldId.startsWith(body.id + '.')) return body.id;
    }
    return null;
}

function applyOne(system: HandSystem, change: FormChange, notes: FormMessage[], edition: 'MgT2E' | 'AoW' | undefined): void {
    const id = change.id;
    if (id === 'star.add') {
        const made = clientId(id, change.value, [...system.stars, ...system.bodies], 's');
        if (!made) return;
        if (system.stars.length >= HAND_LIMITS.stars) throw new HandRefusal('You can\'t add another star. Remove a star before you add another.');
        system.stars.push({
            id: made,
            name: '', sType: '', subType: '', sClass: '', parentId: null, order: system.stars.length,
        });
        return;
    }
    if (id === 'body.add') {
        const made = clientId(id, change.value, [...system.stars, ...system.bodies], 'b');
        if (!made) return;
        if (system.stars.length === 0) throw new HandRefusal('A world needs a star.');
        if (system.bodies.length >= HAND_LIMITS.bodies) throw new HandRefusal('You can\'t add another world. Remove a world before you add another.');
        const parent = byOrder(system.stars)[0];
        system.bodies.push({
            id: made,
            kind: 'world',
            name: '',
            parentId: parent.id,
            order: system.bodies.length,
            mainworld: false,
            profile: emptyHandProfile(),
            notes: '', bases: '', zone: '', allegiance: '', trade: '',
        });
        return;
    }
    if (id === 'system.name') {
        system.name = bounded(id, change.value, 80);
        return;
    }
    if (id === 'system.notes') {
        system.notes = bounded(id, change.value, HAND_LIMITS.notes);
        return;
    }
    const starId = starIdOf(system, id);
    if (starId) {
        const star = system.stars.find((item) => item.id === starId);
        if (!star) throw new HandRefusal(UNKNOWN_FIELD);
        const leaf = id.slice(starId.length + 1);
        if (leaf === 'remove') {
            if (truthy(change.value)) {
                const gone = dropStar(system, starId);
                const noun = gone === 1 ? 'body' : 'bodies';
                notes.push({ id, text: `Removing this star also removes ${gone} ${noun}.`, holds: false });
            }
            return;
        }
        if (leaf === 'name') star.name = bounded(id, change.value, 80);
        else if (leaf === 'type' || leaf === 'subtype' || leaf === 'class') {
            if (edition === 'MgT2E') {
                if (leaf === 'type') {
                    star.sType = fromList(change.value, STAR_TYPE_VALUES, 'Type');
                    const forced = exoticStar(star.sType);
                    if (forced) {
                        star.sClass = forced.sClass;
                        star.subType = forced.subType;
                    }
                } else if (exoticStar(star.sType)) {
                    throw new HandRefusal(`Choose a ${leaf === 'subtype' ? 'Subtype' : 'Class'} from the list.`);
                } else if (leaf === 'subtype') star.subType = fromList(change.value, STAR_SUBTYPE_VALUES, 'Subtype');
                else star.sClass = fromList(change.value, STAR_CLASS_VALUES, 'Class');
            } else if (leaf === 'type') star.sType = bounded(id, change.value, 8);
            else if (leaf === 'subtype') star.subType = bounded(id, change.value, 8);
            else star.sClass = bounded(id, change.value, 8);
        }
        else if (leaf === 'parent') star.parentId = text(change.value) === '' ? null : bounded(id, change.value, 40, 'Orbits');
        else if (leaf === 'order') {
            if (typeof change.value !== 'number' || !Number.isInteger(change.value) || change.value < 0) {
                throw new HandRefusal(holdText(id, 'Type a whole number that is 0 or greater.'), id);
            }
            star.order = change.value;
        } else if (leaf === 'orbit.id') putNumber(star, 'orbitId', orbitNumber(id, change.value));
        else if (leaf === 'orbit.au') putNumber(star, 'orbitAU', orbitNumber(id, change.value));
        else if (leaf === 'orbit.eccentricity') putNumber(star, 'eccentricity', orbitNumber(id, change.value));
        else if (leaf === 'orbit.years') putNumber(star, 'periodYears', orbitNumber(id, change.value));
        else if (leaf === 'mass' || leaf === 'diam' || leaf === 'temp' || leaf === 'lum') {
            putNumber(star, leaf, starMeasure(id, change.value, fieldLabel(id)));
        }
        else throw new HandRefusal(UNKNOWN_FIELD);
        return;
    }
    const bodyId = bodyIdOf(system, id);
    if (!bodyId) throw new HandRefusal(UNKNOWN_FIELD);
    const body = system.bodies.find((item) => item.id === bodyId);
    if (!body) throw new HandRefusal(UNKNOWN_FIELD);
    const leaf = id.slice(bodyId.length + 1);
    if (leaf === 'remove') {
        if (truthy(change.value)) dropBody(system, bodyId);
        return;
    }
    if (leaf.startsWith('profile.')) {
        const cell = leaf.slice('profile.'.length) as keyof HandProfile;
        if (!PROFILE.includes(cell)) throw new HandRefusal(UNKNOWN_FIELD);
        body.profile[cell] = oneChar(id, change.value);
        return;
    }
    if (body.kind === 'belt' && (BELT_YEAR_LEAVES as readonly string[]).includes(leaf)) return;
    if (leaf === 'orbit.id' || leaf === 'orbit.au' || leaf === 'orbit.eccentricity' || leaf === 'orbit.years' || leaf === 'orbit.pd') {
        if (body.kind === 'moon' || beltAroundBody(system, body)) {
            if (leaf === 'orbit.pd') putNumber(body, 'pd', orbitNumber(id, change.value));
            else if (leaf === 'orbit.eccentricity') putNumber(body, 'eccentricity', orbitNumber(id, change.value));
            else throw new HandRefusal(UNKNOWN_FIELD);
            return;
        }
        if (leaf === 'orbit.pd') throw new HandRefusal(UNKNOWN_FIELD);
        if (leaf === 'orbit.id') putNumber(body, 'orbitId', orbitNumber(id, change.value));
        else if (leaf === 'orbit.au') putNumber(body, 'au', orbitNumber(id, change.value));
        else if (leaf === 'orbit.eccentricity') putNumber(body, 'eccentricity', orbitNumber(id, change.value));
        else putNumber(body, 'periodYears', orbitNumber(id, change.value));
        return;
    }
    if (!BODY_FIELDS.includes(leaf as typeof BODY_FIELDS[number])) throw new HandRefusal(UNKNOWN_FIELD);
    if (leaf === 'name') body.name = bounded(id, change.value, 80);
    else if (leaf === 'kind') {
        const kind = text(change.value);
        if (!KINDS.some(([value]) => value === kind)) throw new HandRefusal(holdText(id, 'Choose a kind from the list.'), id);
        body.kind = kind as HandKind;
        syncBeltOrbit(system, body);
    } else if (leaf === 'parent') {
        const next = readParent(id, change.value);
        body.parentId = next.parentId;
        if (next.alsoParentId) body.alsoParentId = next.alsoParentId;
        else delete body.alsoParentId;
        syncBeltOrbit(system, body);
    }
    else if (leaf === 'order') {
        if (typeof change.value !== 'number' || !Number.isInteger(change.value) || change.value < 0) {
            throw new HandRefusal(holdText(id, 'Type a whole number that is 0 or greater.'), id);
        }
        body.order = change.value;
    } else if (leaf === 'mainworld') {
        body.mainworld = truthy(change.value);
        if (body.mainworld) {
            for (const other of system.bodies) if (other.id !== body.id) other.mainworld = false;
        }
    } else if (leaf === 'notes') body.notes = bounded(id, change.value, HAND_LIMITS.notes);
    else if (leaf === 'bases') body.bases = bounded(id, change.value, 8);
    else if (leaf === 'zone') body.zone = bounded(id, change.value, 16);
    else if (leaf === 'allegiance') body.allegiance = bounded(id, change.value, 16);
    else if (leaf === 'trade') body.trade = bounded(id, change.value, 80);
}

/** Stars paired under this one, then every world and moon that orbits any of them. The count omits the star named in the change. */
function dropStar(system: HandSystem, starId: string): number {
    const goneStars = new Set<string>([starId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const star of system.stars) {
            if (goneStars.has(star.id) || !star.parentId || !goneStars.has(star.parentId)) continue;
            goneStars.add(star.id);
            grew = true;
        }
    }
    const goneBodies = new Set<string>();
    grew = true;
    while (grew) {
        grew = false;
        for (const body of system.bodies) {
            if (goneBodies.has(body.id)) continue;
            const onStar = goneStars.has(body.parentId) || (body.alsoParentId != null && goneStars.has(body.alsoParentId));
            const onBody = goneBodies.has(body.parentId);
            if (!onStar && !onBody) continue;
            goneBodies.add(body.id);
            grew = true;
        }
    }
    system.stars = system.stars.filter((star) => !goneStars.has(star.id));
    system.bodies = system.bodies.filter((body) => !goneBodies.has(body.id));
    return goneStars.size - 1 + goneBodies.size;
}

/** A world takes its moons and any belt that orbits it. A moon takes nothing else. A belt takes nothing else. */

function syncBeltOrbit(system: HandSystem, body: HandBody): void {
    if (body.kind !== 'belt') return;
    if (beltAroundBody(system, body)) {
        delete body.orbitId;
        delete body.au;
        delete body.periodYears;
        return;
    }
    delete body.pd;
}
function dropBody(system: HandSystem, bodyId: string): void {
    const gone = new Set<string>([bodyId]);
    let grew = true;
    while (grew) {
        grew = false;
        for (const body of system.bodies) {
            if (gone.has(body.id) || !gone.has(body.parentId)) continue;
            gone.add(body.id);
            grew = true;
        }
    }
    system.bodies = system.bodies.filter((body) => !gone.has(body.id));
}

/** A pair is stored with the parent star in `parentId` and the companion in `alsoParentId`. */
function settlePairs(system: HandSystem): void {
    for (const body of system.bodies) {
        if (!body.alsoParentId) continue;
        const primary = system.stars.find((star) => star.id === body.parentId);
        const other = system.stars.find((star) => star.id === body.alsoParentId);
        if (primary && other && primary.parentId === other.id && other.parentId !== primary.id) {
            body.parentId = other.id;
            body.alsoParentId = primary.id;
        }
    }
}

function refuseParents(system: HandSystem): void {
    const stars = new Set(system.stars.map((star) => star.id));
    const worlds = new Set(system.bodies.filter((body) => body.kind !== 'moon').map((body) => body.id));
    for (const body of system.bodies) {
        if (body.kind === 'moon' && system.bodies.some((other) => other.parentId === body.id)) {
            throw new HandRefusal('A world that has moons cannot be given to another world.');
        }
        if (body.alsoParentId) {
            if (body.kind === 'moon') throw new HandRefusal('A moon orbits one world.');
            const primary = system.stars.find((star) => star.id === body.parentId);
            const other = system.stars.find((star) => star.id === body.alsoParentId);
            if (!primary || !other) throw new HandRefusal('A body orbits these two stars together. Give it to one star first.');
            if (primary.parentId !== other.id && other.parentId !== primary.id) throw new HandRefusal('These two stars are not paired.');
        }
        if (body.kind === 'moon' && !worlds.has(body.parentId)) {
            throw new HandRefusal('Choose a world for this moon.');
        }
        if (body.kind === 'belt' && !stars.has(body.parentId) && !beltAroundBody(system, body)) {
            throw new HandRefusal('Choose a star for this body. A belt can orbit a world or a gas giant.');
        }
        if (body.kind !== 'moon' && body.kind !== 'belt' && !stars.has(body.parentId)) {
            throw new HandRefusal('Choose a star for this body. A belt can orbit a world or a gas giant.');
        }
    }
    for (const star of system.stars) {
        if (star.parentId != null && !stars.has(star.parentId)) {
            throw new HandRefusal('Choose a star in this system.');
        }
    }
    const parsed = HandSystemSchema.safeParse(system);
    if (!parsed.success) throw new HandRefusal('This system can\'t be stored. Check the stars and the worlds, then try again.');
}

export function applyHand(envelope: HandEnv, changes: FormChange[] = [], roll: { id: string }[] = []): { envelope: HandEnv; answer: FormAnswer } {
    const before = formOfHand(envelope);
    const known = knownIds(before);
    for (const change of changes) {
        const item = known.get(change.id);
        if (item?.permission === 'read') throw new HandRefusal(`You can't edit ${item.label}. Choose a field you can edit.`, change.id);
        if (change.id.includes('.profile.')) oneChar(change.id, change.value);
    }
    const messages: FormMessage[] = [];
    if (changes.length === 0 && roll.length === 0) {
        return { envelope, answer: { form: before, changed: [], messages } };
    }
    const system = structuredClone(envelope.system);
    for (const change of changes) applyOne(system, change, messages, envelope.edition);
    settlePairs(system);
    refuseParents(system);
    rollProfiles(envelope, system, roll, messages);
    const next: HandEnv = { ...envelope, system: HandSystemSchema.parse(system) };
    const form = formOfHand(next);
    const after = knownIds(form);
    const changed = [...after.entries()]
        .filter(([id, item]) => {
            const prior = known.get(id);
            return prior ? prior.value !== item.value : true;
        })
        .map(([id]) => ({ id, why: '' }));
    return { envelope: next, answer: { form, changed, messages } };
}

function copyFinite(row: Record<string, unknown>, key: string, value: number | undefined): void {
    if (typeof value === 'number' && Number.isFinite(value)) row[key] = value;
}

function spectral(star: HandStar): string {
    const head = `${star.sType}${star.subType}`.trim();
    return [head, star.sClass].filter((part) => part !== '').join(' ');
}

function profileComplete(profile: HandProfile): string {
    const cells = PROFILE.map((cell) => profile[cell]);
    if (cells.every((cell) => cell.length === 1)) {
        return `${profile.st}${profile.s}${profile.a}${profile.h}${profile.p}${profile.g}${profile.l}-${profile.tl}`;
    }
    return '';
}

function zoneCode(zone: string): string {
    if (zone === 'Amber' || zone === 'A') return 'A';
    if (zone === 'Red' || zone === 'R') return 'R';
    if (zone === 'Green' || zone === 'G' || zone === '') return '';
    return zone;
}

/** The sector-index entry drawn from this document's mainworld. Nothing is invented. */
export function handChartEntry(system: HandSystem, tree: string | null): Record<string, unknown> {
    const main = system.bodies.find((body) => body.mainworld)
        ?? system.bodies.find((body) => body.kind === 'world')
        ?? system.bodies.find((body) => body.kind !== 'moon')
        ?? null;
    const stars = byOrder(system.stars).map(spectral).filter((line) => line !== '').join(' ');
    const entry: Record<string, unknown> = {
        tree,
        type: 'SYSTEM_PRESENT',
        name: system.name || main?.name || '',
        uwp: main ? profileComplete(main.profile) : '',
        allegiance: main?.allegiance ?? '',
        zone: zoneCode(main?.zone ?? ''),
        bases: main?.bases ?? '',
        tradeCodes: main ? main.trade.split(/\s+/).filter(Boolean) : [],
        pbg: '',
        ix: 0,
        partial: null,
    };
    if (stars) entry.stars = stars;
    return entry;
}

function mainworldBaseline(system: HandSystem, exceptId: string): { name: string; starport: string; size: number; atm: number; hydro: number; pop: number; gov: number; law: number; tl: number } | null {
    const host = system.bodies.find((body) => body.mainworld && body.id !== exceptId);
    if (!host || !PROFILE.every((cell) => host.profile[cell].length === 1)) return null;
    return {
        name: host.name,
        starport: host.profile.st,
        size: fromEHex(host.profile.s),
        atm: fromEHex(host.profile.a),
        hydro: fromEHex(host.profile.h),
        pop: fromEHex(host.profile.p),
        gov: fromEHex(host.profile.g),
        law: fromEHex(host.profile.l),
        tl: fromEHex(host.profile.tl),
    };
}

function rollProfiles(envelope: HandEnv, system: HandSystem, rolls: { id: string }[], messages: FormMessage[]): void {
    for (const item of rolls) {
        if (!item.id.endsWith('.profile.roll')) {
            messages.push({ id: item.id, text: 'Nothing rolls this field.', holds: false });
            continue;
        }
        const bodyId = item.id.slice(0, -'.profile.roll'.length);
        const body = system.bodies.find((candidate) => candidate.id === bodyId);
        if (!body || envelope.edition !== 'MgT2E' || (body.kind !== 'world' && body.kind !== 'gas' && body.kind !== 'belt')) {
            messages.push({ id: item.id, text: 'Nothing rolls this field.', holds: false });
            continue;
        }
        const stars = byOrder(system.stars);
        for (const star of stars) {
            const looked = lookedUpStar(star);
            const mass = storedPositive(star.mass);
            const diam = storedPositive(star.diam);
            const temp = storedPositive(star.temp);
            const lum = storedPositive(star.lum);
            if (!looked && (mass != null || diam != null || temp != null || lum != null)) {
                const missing = [
                    mass == null ? 'Mass' : '',
                    diam == null ? 'Diameter' : '',
                    temp == null ? 'Temperature' : '',
                ].filter((name) => name !== '');
                if (missing.length) throw new HandRefusal(`Set ${setList(missing)}.`);
            }
        }
        const parentBody = system.bodies.find((candidate) => candidate.id === body.parentId);
        const starId = parentBody && (parentBody.kind === 'world' || parentBody.kind === 'gas') ? parentBody.parentId : body.parentId;
        const parentStarIndex = Math.max(0, stars.findIndex((star) => star.id === starId));
        const also = body.alsoParentId ? stars.findIndex((star) => star.id === body.alsoParentId) : -1;
        const rolled = rollBodyProfile({
            hexId: envelope.hexKey,
            bodyId: body.id,
            roll: body.profileRoll ?? 0,
            stars: stars.map((star) => ({
                sType: star.sType,
                subType: star.subType,
                sClass: star.sClass,
                orbitId: star.orbitId,
                mass: storedPositive(star.mass) ?? undefined,
                diam: storedPositive(star.diam) ?? undefined,
                temp: storedPositive(star.temp) ?? undefined,
                lum: storedPositive(star.lum) ?? undefined,
            })),
            body: {
                kind: body.kind,
                name: body.name,
                orbitId: body.orbitId,
                au: body.au,
                eccentricity: body.eccentricity,
                parentStarIndex,
                alsoParentIndex: also >= 0 ? also : null,
            },
            mainworld: mainworldBaseline(system, body.id),
            isMainworld: body.mainworld,
        });
        let wrote = false;
        for (const cell of PROFILE) {
            const next = rolled.cells[cell];
            if (typeof next === 'string' && next.length === 1) {
                body.profile[cell] = next;
                wrote = true;
            }
        }
        if (wrote) body.profileRoll = (body.profileRoll ?? 0) + 1;
        const missingStar = ' The star has no spectral type, so the atmosphere step treats a missing luminosity as 1.';
        const host = stars[parentStarIndex];
        const hostBare = !!host && !lookedUpStar(host)
            && storedPositive(host.mass) == null && storedPositive(host.diam) == null
            && storedPositive(host.temp) == null && storedPositive(host.lum) == null;
        const note = ' Set Type, Subtype, and Class.';
        let text = rolled.message;
        if (hostBare) {
            text = text.includes(missingStar) ? text.replace(missingStar, note) : `${text}${note}`;
        }
        messages.push({ id: item.id, text, holds: false });
    }
}

function walkType(body: HandBody): string {
    if (body.mainworld) return 'Mainworld';
    if (body.kind === 'gas') return 'Gas Giant';
    if (body.kind === 'belt') return 'Planetoid Belt';
    if (body.kind === 'moon') return 'Satellite';
    return 'World';
}

/**
 * The shape `pickSystem` and `bodyKeys` already walk.
 * Stars need `sType` (a letter the glyph can draw) and, for a companion, `separation` and `parentStarIdx`.
 * Worlds need `name`, `type`, and nested `moons`. A complete profile is `uwp`.
 * A belt that orbits a world or a gas giant is nested in that body's `moons`, with `type` `Planetoid Belt`.
 * It has `pd` and `eccentricity` when those are stored. It has no `periodYears` and `isMoon` is not set.
 * A body that orbits two paired stars also has `orbitType` `P-Type`, `parentStarIdx` of the star the companion orbits, and `pairStarIdx` of the companion.
 * A stored orbit number is copied onto `orbitAU`, `orbitId`, `au`, `eccentricity`, `pd`, or `periodYears`.
 * A belt's `periodYears` is not copied. Mass, luminosity, diameter, temperature, and journey times stay absent.
 * No generator writes a belt around a world.
 */
export function handWalk(system: HandSystem): { name: string; stars: Record<string, unknown>[]; worlds: Record<string, unknown>[] } {
    const stars = byOrder(system.stars);
    const starRows = stars.map((star) => {
        const parentIndex = star.parentId == null ? -1 : stars.findIndex((item) => item.id === star.parentId);
        const row: Record<string, unknown> = {
            name: star.name,
            sType: star.sType,
            subType: star.subType,
            sClass: star.sClass,
            role: parentIndex >= 0 ? 'Companion' : 'Primary',
        };
        if (parentIndex >= 0) {
            row.role = 'Companion';
            row.separation = 'Companion';
            row.parentStarIdx = parentIndex;
        }
        copyFinite(row, 'orbitId', star.orbitId);
        copyFinite(row, 'orbitAU', star.orbitAU);
        copyFinite(row, 'eccentricity', star.eccentricity);
        copyFinite(row, 'periodYears', star.periodYears);
        return row;
    });
    const worlds = byOrder(system.bodies.filter((body) => body.kind !== 'moon' && !beltAroundBody(system, body)));
    const worldRows = worlds.map((body) => {
        const row: Record<string, unknown> = {
            name: body.name,
            type: walkType(body),
            notes: body.notes,
            allegiance: body.allegiance,
            travelZone: body.zone,
            bases: body.bases,
            tradeCodes: body.trade.split(/\s+/).filter(Boolean),
            moons: byOrder(system.bodies.filter((child) => child.parentId === body.id && (child.kind === 'moon' || beltAroundBody(system, child)))).map((child) => {
                if (child.kind === 'belt') {
                    const nested: Record<string, unknown> = {
                        name: child.name,
                        type: 'Planetoid Belt',
                        notes: child.notes,
                    };
                    const beltUwp = profileComplete(child.profile);
                    if (beltUwp) nested.uwp = beltUwp;
                    copyFinite(nested, 'pd', child.pd);
                    copyFinite(nested, 'eccentricity', child.eccentricity);
                    return nested;
                }
                const nested: Record<string, unknown> = {
                    name: child.name,
                    type: walkType(child),
                    isMoon: true,
                    notes: child.notes,
                };
                const uwp = profileComplete(child.profile);
                if (uwp) nested.uwp = uwp;
                copyFinite(nested, 'pd', child.pd);
                copyFinite(nested, 'eccentricity', child.eccentricity);
                return nested;
            }),
        };
        const uwp = profileComplete(body.profile);
        if (uwp) row.uwp = uwp;
        copyFinite(row, 'orbitId', body.orbitId);
        copyFinite(row, 'au', body.au);
        copyFinite(row, 'eccentricity', body.eccentricity);
        if (body.kind !== 'belt') copyFinite(row, 'periodYears', body.periodYears);
        if (body.alsoParentId) {
            const primary = stars.findIndex((star) => star.id === body.parentId);
            const other = stars.findIndex((star) => star.id === body.alsoParentId);
            row.orbitType = 'P-Type';
            if (primary >= 0) row.parentStarIdx = primary;
            if (other >= 0) row.pairStarIdx = other;
        } else if (typeof body.au === 'number' || typeof body.orbitId === 'number') {
            row.orbitType = 'S-Type';
            const parent = stars.findIndex((star) => star.id === body.parentId);
            if (parent >= 0) row.parentStarIdx = parent;
        }
        return row;
    });
    return { name: system.name, stars: starRows, worlds: worldRows };
}
