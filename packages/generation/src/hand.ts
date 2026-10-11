/**
 * Read and write a hand-designed system.
 * This file does not call a generator and does not read an engine tree.
 */
import type { EditForm, FormAnswer, FormChange, FormField, FormMessage, FormSection, FormValue, HandBody, HandEnvelope, HandKind, HandProfile, HandStar, HandSystem } from '@voyage/shared';
import { emptyHandProfile, HAND_LIMITS, HandSystem as HandSystemSchema } from '@voyage/shared';

export class HandRefusal extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'HandRefusal';
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

function text(value: FormValue): string {
    if (value == null) return '';
    return String(value);
}

function field(id: string, label: string, kind: FormField['kind'], permission: FormField['permission'], value: FormValue, options: FormField['options'] = []): FormField {
    return { id, label, kind, permission, value, options };
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
        starFields.push(field(`${prefix}.name`, 'Name', 'text', 'type', star.name));
        starFields.push(field(`${prefix}.type`, 'Type', 'text', 'type', star.sType));
        starFields.push(field(`${prefix}.subtype`, 'Subtype', 'text', 'type', star.subType));
        starFields.push(field(`${prefix}.class`, 'Class', 'text', 'type', star.sClass));
        starFields.push(field(`${prefix}.parent`, 'Orbits', 'text', 'type', star.parentId ?? ''));
        starFields.push(field(`${prefix}.order`, 'Order', 'number', 'type', star.order));
        starFields.push(field(`${prefix}.remove`, 'Remove', 'switch', 'type', false));
    }
    starFields.push(field('star.add', 'Add a star', 'switch', 'type', false));
    const bodyFields: FormField[] = [];
    for (const body of bodies) {
        const prefix = body.id;
        bodyFields.push(field(`${prefix}.name`, 'Name', 'text', 'type', body.name));
        bodyFields.push(field(`${prefix}.kind`, 'Kind', 'choice', 'type', body.kind, KINDS.map(([value, label]) => ({ value, label }))));
        const parentShown = body.alsoParentId ? `${body.parentId}+${body.alsoParentId}` : body.parentId;
        bodyFields.push(field(`${prefix}.parent`, 'Parent', 'text', 'type', parentShown));
        bodyFields.push(field(`${prefix}.order`, 'Order', 'number', 'type', body.order));
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
    throw new HandRefusal(`${id} cannot hold that.`);
}

function bounded(id: string, value: FormValue, max: number): string {
    const next = text(value);
    if (next.length > max) throw new HandRefusal(`${id} cannot hold that.`);
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
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/.test(id)) throw new HandRefusal(`${fieldId} cannot hold that.`);
    if (items.some((item) => item.id === id || id.startsWith(item.id + '.') || item.id.startsWith(id + '.'))) {
        throw new HandRefusal(`${id} is already in this system.`);
    }
    return id;
}

function readParent(id: string, value: FormValue): { parentId: string; alsoParentId?: string } {
    const raw = text(value).trim();
    if (!raw.includes('+')) return { parentId: bounded(id, raw, 40) };
    const parts = raw.split('+');
    if (parts.length !== 2 || parts[0].length === 0 || parts[1].length === 0 || parts[0] === parts[1] || parts[0].length > 40 || parts[1].length > 40) {
        throw new HandRefusal(`${id} cannot hold that.`);
    }
    return { parentId: parts[0], alsoParentId: parts[1] };
}

function truthy(value: FormValue): boolean {
    return value === true || value === 'true' || value === 1;
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

function applyOne(system: HandSystem, change: FormChange, notes: FormMessage[]): void {
    const id = change.id;
    if (id === 'star.add') {
        const made = clientId(id, change.value, [...system.stars, ...system.bodies], 's');
        if (!made) return;
        if (system.stars.length >= HAND_LIMITS.stars) throw new HandRefusal('star.add cannot hold that.');
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
        if (system.bodies.length >= HAND_LIMITS.bodies) throw new HandRefusal('body.add cannot hold that.');
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
        if (!star) throw new HandRefusal(`Unknown field ${id}.`);
        const leaf = id.slice(starId.length + 1);
        if (leaf === 'remove') {
            if (truthy(change.value)) {
                const gone = dropStar(system, starId);
                const word = gone === 1 ? 'body goes' : 'bodies go';
                notes.push({ id, text: `${gone} ${word} with this star.`, holds: false });
            }
            return;
        }
        if (leaf === 'name') star.name = bounded(id, change.value, 80);
        else if (leaf === 'type') star.sType = bounded(id, change.value, 8);
        else if (leaf === 'subtype') star.subType = bounded(id, change.value, 8);
        else if (leaf === 'class') star.sClass = bounded(id, change.value, 8);
        else if (leaf === 'parent') star.parentId = text(change.value) === '' ? null : bounded(id, change.value, 40);
        else if (leaf === 'order') {
            if (typeof change.value !== 'number' || !Number.isInteger(change.value) || change.value < 0) {
                throw new HandRefusal(`${id} cannot hold that.`);
            }
            star.order = change.value;
        } else throw new HandRefusal(`Unknown field ${id}.`);
        return;
    }
    const bodyId = bodyIdOf(system, id);
    if (!bodyId) throw new HandRefusal(`Unknown field ${id}.`);
    const body = system.bodies.find((item) => item.id === bodyId);
    if (!body) throw new HandRefusal(`Unknown field ${id}.`);
    const leaf = id.slice(bodyId.length + 1);
    if (leaf === 'remove') {
        if (truthy(change.value)) dropBody(system, bodyId);
        return;
    }
    if (leaf.startsWith('profile.')) {
        const cell = leaf.slice('profile.'.length) as keyof HandProfile;
        if (!PROFILE.includes(cell)) throw new HandRefusal(`Unknown field ${id}.`);
        body.profile[cell] = oneChar(id, change.value);
        return;
    }
    if (!BODY_FIELDS.includes(leaf as typeof BODY_FIELDS[number])) throw new HandRefusal(`Unknown field ${id}.`);
    if (leaf === 'name') body.name = bounded(id, change.value, 80);
    else if (leaf === 'kind') {
        const kind = text(change.value);
        if (!KINDS.some(([value]) => value === kind)) throw new HandRefusal(`${id} cannot hold that.`);
        body.kind = kind as HandKind;
    } else if (leaf === 'parent') {
        const next = readParent(id, change.value);
        body.parentId = next.parentId;
        if (next.alsoParentId) body.alsoParentId = next.alsoParentId;
        else delete body.alsoParentId;
    }
    else if (leaf === 'order') {
        if (typeof change.value !== 'number' || !Number.isInteger(change.value) || change.value < 0) {
            throw new HandRefusal(`${id} cannot hold that.`);
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

/** A world takes its moons. A moon takes nothing else. */
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
            throw new HandRefusal('A moon whose parent does not exist.');
        }
        if (body.kind !== 'moon' && !stars.has(body.parentId)) {
            throw new HandRefusal('A world orbits a star.');
        }
    }
    for (const star of system.stars) {
        if (star.parentId != null && !stars.has(star.parentId)) {
            throw new HandRefusal('A star orbits a star that is not in this system.');
        }
    }
    const parsed = HandSystemSchema.safeParse(system);
    if (!parsed.success) throw new HandRefusal('That system cannot be stored.');
}

export function applyHand(envelope: HandEnv, changes: FormChange[] = [], roll: { id: string }[] = []): { envelope: HandEnv; answer: FormAnswer } {
    const before = formOfHand(envelope);
    const known = knownIds(before);
    for (const change of changes) {
        const item = known.get(change.id);
        if (item?.permission === 'read') throw new HandRefusal(`${change.id} cannot be edited.`);
        if (change.id.includes('.profile.')) oneChar(change.id, change.value);
    }
    const messages: FormMessage[] = roll.map((item) => ({
        id: item.id,
        text: 'Nothing rolls this field.',
        holds: false,
    }));
    if (changes.length === 0 && roll.length === 0) {
        return { envelope, answer: { form: before, changed: [], messages } };
    }
    const system = structuredClone(envelope.system);
    for (const change of changes) applyOne(system, change, messages);
    settlePairs(system);
    refuseParents(system);
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
 * A body that orbits two paired stars also has `orbitType` `P-Type`, `parentStarIdx` of the star the companion orbits, and `pairStarIdx` of the companion.
 * `orbitAU`, `orbitId`, `au`, mass, luminosity, diameter, temperature, period, and journey times are absent.
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
        return row;
    });
    const worlds = byOrder(system.bodies.filter((body) => body.kind !== 'moon'));
    const worldRows = worlds.map((body) => {
        const row: Record<string, unknown> = {
            name: body.name,
            type: walkType(body),
            notes: body.notes,
            allegiance: body.allegiance,
            travelZone: body.zone,
            bases: body.bases,
            tradeCodes: body.trade.split(/\s+/).filter(Boolean),
            moons: byOrder(system.bodies.filter((moon) => moon.kind === 'moon' && moon.parentId === body.id)).map((moon) => {
                const nested: Record<string, unknown> = {
                    name: moon.name,
                    type: walkType(moon),
                    isMoon: true,
                    notes: moon.notes,
                };
                const uwp = profileComplete(moon.profile);
                if (uwp) nested.uwp = uwp;
                return nested;
            }),
        };
        const uwp = profileComplete(body.profile);
        if (uwp) row.uwp = uwp;
        if (body.alsoParentId) {
            const primary = stars.findIndex((star) => star.id === body.parentId);
            const other = stars.findIndex((star) => star.id === body.alsoParentId);
            row.orbitType = 'P-Type';
            if (primary >= 0) row.parentStarIdx = primary;
            if (other >= 0) row.pairStarIdx = other;
        }
        return row;
    });
    return { name: system.name, stars: starRows, worlds: worldRows };
}
