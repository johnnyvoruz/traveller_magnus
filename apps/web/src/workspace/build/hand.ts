/**
 * A system designed by hand (findings/builder_system_design.md §15 and §16;
 * directives/prompts/builder_step3.md part 2; findings/builder_hand_ready.md). The engine never
 * runs: the bodies are one list, each under what it orbits, and every act is a change to a
 * field of the server's form (a parent, a place in the order, a kind, a switch). Nothing here
 * knows a rule and nothing is checked: an option is withheld only where the server cannot
 * store the result. The pure parts run under Node.
 */
import { reactive } from 'vue';
import type { EditForm, FormChange, FormField, FormValue } from '@voyage/shared';

export type HandKind = 'star' | 'world' | 'moon' | 'gas' | 'belt';

export const KIND_WORD: Record<HandKind, string> = {
    star: 'Star',
    world: 'World',
    moon: 'Moon',
    gas: 'Gas giant',
    belt: 'Belt',
};

/**
 * One body of the list. `parent` is the id of what it orbits; empty for a star that orbits
 * nothing. `also` is the companion star when a world orbits two paired stars together
 * (findings/builder_step3_close_ready.md §1), else empty.
 */
export type HandNode = {
    id: string;
    kind: HandKind;
    name: string;
    parent: string;
    also: string;
    order: number;
    mainworld: boolean;
    /** A star's spectral class as the form spells it ("K1 V"); empty for a body, or a star with none. */
    cls: string;
    /** How far in it stands: 0 for a star that orbits nothing. */
    depth: number;
};

/** What joins the two ids of a pair of stars in the form's parent field. An id cannot hold it. */
const PAIR_MARK = '+';

/** What a body orbits, as the form's parent field holds it: one id, or the two of a pair. */
export function orbitsValue(node: HandNode): string {
    return node.also ? node.parent + PAIR_MARK + node.also : node.parent;
}

function valueOf(fields: Map<string, FormField>, id: string): FormValue {
    const field = fields.get(id);
    return field ? field.value : null;
}

function textOf(fields: Map<string, FormField>, id: string): string {
    const value = valueOf(fields, id);
    return value === null ? '' : String(value);
}

function numberOf(fields: Map<string, FormField>, id: string): number {
    const value = valueOf(fields, id);
    return typeof value === 'number' ? value : 0;
}

/** The ids of one section's bodies: every field that ends `.name` names one. The two add switches are not bodies. */
function owners(form: EditForm, sectionId: string): string[] {
    const section = form.sections.find((item) => item.id === sectionId);
    const out: string[] = [];
    if (section) for (const field of section.fields) if (field.id.endsWith('.name')) out.push(field.id.slice(0, -'.name'.length));
    return out;
}

function byOrder(a: HandNode, b: HandNode): number {
    return a.order - b.order || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** Every star and body of the form, unsorted and with no depth yet. */
function readNodes(form: EditForm): HandNode[] {
    const fields = new Map<string, FormField>();
    for (const section of form.sections) for (const field of section.fields) fields.set(field.id, field);
    const out: HandNode[] = [];
    for (const id of owners(form, 'stars')) {
        if (valueOf(fields, id + '.remove') === true) continue;
        out.push({ id, kind: 'star', name: textOf(fields, id + '.name'), parent: textOf(fields, id + '.parent'), also: '', order: numberOf(fields, id + '.order'), mainworld: false, cls: textOf(fields, id + '.classText').trim(), depth: 0 });
    }
    for (const id of owners(form, 'bodies')) {
        if (valueOf(fields, id + '.remove') === true) continue;
        const kind = textOf(fields, id + '.kind');
        // Two stars together are the two ids joined by the pair mark, the star the other orbits first.
        const [parent, also = ''] = textOf(fields, id + '.parent').split(PAIR_MARK);
        out.push({
            id,
            kind: kind === 'moon' || kind === 'gas' || kind === 'belt' ? kind : 'world',
            name: textOf(fields, id + '.name'),
            parent,
            also,
            order: numberOf(fields, id + '.order'),
            mainworld: valueOf(fields, id + '.mainworld') === true,
            cls: '',
            depth: 0,
        });
    }
    return out;
}

type Tree = { node: HandNode; stars: Tree[]; bodies: Tree[] };

function grow(nodes: readonly HandNode[]): Tree[] {
    const by = new Map<string, Tree>();
    for (const node of nodes) by.set(node.id, { node, stars: [], bodies: [] });
    const roots: Tree[] = [];
    for (const item of by.values()) {
        const parent = item.node.parent ? by.get(item.node.parent) : undefined;
        // What it orbits is not in the form: shown at the top, so it is never lost from the list.
        if (!parent || parent === item) roots.push(item);
        else if (item.node.kind === 'star') parent.stars.push(item);
        else parent.bodies.push(item);
    }
    const sort = (list: Tree[]): void => { list.sort((a, b) => byOrder(a.node, b.node)); };
    sort(roots);
    for (const item of by.values()) {
        sort(item.stars);
        sort(item.bodies);
    }
    return roots;
}

function flatten(trees: readonly Tree[], depth: number, out: HandNode[], seen: Set<string>): void {
    for (const tree of trees) {
        if (seen.has(tree.node.id)) continue;
        seen.add(tree.node.id);
        out.push({ ...tree.node, depth });
        flatten(tree.stars, depth + 1, out, seen);
        flatten(tree.bodies, depth + 1, out, seen);
    }
}

/**
 * The bodies as the list shows them: each star, then the stars that orbit it, then its
 * worlds, each world followed by its moons.
 */
export function handList(form: EditForm): HandNode[] {
    const out: HandNode[] = [];
    flatten(grow(readNodes(form)), 0, out, new Set());
    return out;
}

/** What a row calls a body with no name. */
/** What a body is called: its name, else a star's spectral class, else "No name". */
export function nodeTitle(node: HandNode): string {
    return node.name.trim() || node.cls || 'No name';
}

/** What orbits a body: a world of two stars together orbits each of them. */
function childrenOf(list: readonly HandNode[], id: string): HandNode[] {
    return list.filter((item) => item.parent === id || item.also === id);
}

/** Everything that orbits a body, at any depth. */
export function below(list: readonly HandNode[], id: string): HandNode[] {
    const out: HandNode[] = [];
    const walk = (at: string): void => {
        for (const child of childrenOf(list, at)) {
            if (out.includes(child)) continue;
            out.push(child);
            walk(child.id);
        }
    };
    walk(id);
    return out;
}

export type ParentOption = {
    /** The id of what it would orbit, or the two ids of a pair of stars; empty is "nothing", for a star. */
    value: string;
    label: string;
    /** The kind the body takes when given to this parent, where that differs from its own. */
    becomes: HandKind | null;
    /** Why it cannot be chosen, when it cannot: the server could not store the result. */
    why: string;
};

/**
 * What a body may be given to, by name (ruling 3 of 2026-10-09: a moon given to a star becomes
 * a world, and a world given to a world becomes a moon). A star may orbit another star or
 * nothing. A world may orbit two stars together: one choice for each pair of stars that are
 * themselves paired (ruling 4 of 2026-10-09). An option is withheld only where the result
 * cannot be stored: a star under something that orbits it, and a world that has moons under
 * another world (ruling 2 of 2026-10-10: its moons are not moved for the referee).
 */
export function parentOptions(list: readonly HandNode[], id: string): ParentOption[] {
    const node = list.find((item) => item.id === id);
    if (!node) return [];
    const stars = list.filter((item) => item.kind === 'star');
    const out: ParentOption[] = [];
    if (node.kind === 'star') {
        const under = new Set(below(list, id).map((item) => item.id));
        out.push({ value: '', label: 'Nothing', becomes: null, why: '' });
        for (const star of stars) {
            if (star.id === id) continue;
            out.push({ value: star.id, label: nodeTitle(star), becomes: null, why: under.has(star.id) ? nodeTitle(node) + ' can’t orbit a star that orbits it.' : '' });
        }
        return out;
    }
    const moons = childrenOf(list, id).length;
    for (const star of stars) out.push({ value: star.id, label: nodeTitle(star), becomes: node.kind === 'moon' ? 'world' : null, why: '' });
    for (const star of stars) {
        const primary = stars.find((item) => item.id === star.parent);
        if (!primary || primary.id === star.id) continue;
        out.push({ value: primary.id + PAIR_MARK + star.id, label: nodeTitle(primary) + ' and ' + nodeTitle(star), becomes: node.kind === 'moon' ? 'world' : null, why: '' });
    }
    for (const world of list) {
        if (world.kind === 'star' || world.kind === 'moon' || world.id === id) continue;
        // A belt goes around a world or a gas giant and stays a belt; it does not go around another belt.
        if (node.kind === 'belt' && world.kind === 'belt') continue;
        out.push({
            value: world.id,
            label: nodeTitle(world),
            becomes: node.kind === 'moon' || node.kind === 'belt' ? null : 'moon',
            why: moons > 0 && node.kind !== 'belt' ? 'A body with moons can’t become a moon. First, move its moons to another body.' : '',
        });
    }
    return out;
}

/** The changes that give a body to another parent: its kind first where that changes, then what it orbits. */
export function reparentChanges(list: readonly HandNode[], id: string, to: string): FormChange[] {
    const node = list.find((item) => item.id === id);
    const option = parentOptions(list, id).find((item) => item.value === to);
    if (!node || !option || option.why || orbitsValue(node) === to) return [];
    const changes: FormChange[] = [];
    if (option.becomes) changes.push({ id: id + '.kind', value: option.becomes });
    changes.push({ id: id + '.parent', value: to });
    return changes;
}

/** The row a move swaps with: the one before or after it among the bodies of the same parent and sort (stars with stars). */
export function moveTarget(list: readonly HandNode[], id: string, by: -1 | 1): HandNode | null {
    const node = list.find((item) => item.id === id);
    if (!node) return null;
    const mates = list.filter((item) => item.parent === node.parent && (item.kind === 'star') === (node.kind === 'star'));
    const at = mates.findIndex((item) => item.id === id);
    return mates[at + by] ?? null;
}

/**
 * Move up or down among the bodies of one parent. The whole list is numbered again in the
 * order it will show, stars among stars and bodies among bodies, and only what differs from
 * the form is sent.
 */
export function moveChanges(list: readonly HandNode[], id: string, by: -1 | 1): FormChange[] {
    const roots = grow(list);
    // The row's own run of the list: the stars, or the bodies, of its parent.
    const runOf = (trees: Tree[]): Tree[] | null => {
        if (trees.some((tree) => tree.node.id === id)) return trees;
        for (const tree of trees) {
            const found = runOf(tree.stars) ?? runOf(tree.bodies);
            if (found) return found;
        }
        return null;
    };
    const run = runOf(roots);
    if (!run) return [];
    const at = run.findIndex((tree) => tree.node.id === id);
    const to = at + by;
    if (to < 0 || to >= run.length) return [];
    [run[at], run[to]] = [run[to], run[at]];
    const shown: HandNode[] = [];
    flatten(roots, 0, shown, new Set());
    const changes: FormChange[] = [];
    let star = 0;
    let body = 0;
    for (const item of shown) {
        const order = item.kind === 'star' ? star++ : body++;
        const before = list.find((was) => was.id === item.id);
        if (before && before.order !== order) changes.push({ id: item.id + '.order', value: order });
    }
    return changes;
}

/**
 * Removing a body is one change, kept by Keep (ruling 1 of 2026-10-10). The server takes what
 * orbits it with it: a star's paired stars, worlds and moons, a world's moons
 * (findings/builder_step3_close_ready.md §5). Nothing is withheld (ruling 3).
 */
export function removeChanges(list: readonly HandNode[], id: string): FormChange[] {
    return list.some((item) => item.id === id) ? [{ id: id + '.remove', value: true }] : [];
}

/** Whether removing it takes others with it: then the pane asks first, with the server's count. */
export function removeTakesOthers(list: readonly HandNode[], id: string): boolean {
    return childrenOf(list, id).length > 0;
}

/** The row's menu: "Remove Aster and what orbits it". No number: the count the ask shows is the server's. */
export function removeWords(list: readonly HandNode[], id: string): string {
    const node = list.find((item) => item.id === id);
    if (!node) return '';
    if (!removeTakesOthers(list, id)) return nodeTitle(node);
    const moonsOnly = childrenOf(list, id).every((item) => item.kind === 'moon');
    return nodeTitle(node) + (node.kind === 'star' || !moonsOnly ? ' and everything that orbits it' : ' and its moons');
}

/**
 * How many bodies a remove took with it, read from the server's answer: the ids the list had
 * before the remove that the answer no longer has, less the body named. Null while the answer
 * still shows the body.
 */
export function removedWith(before: readonly string[], after: readonly HandNode[], id: string): number | null {
    const now = new Set(after.map((item) => item.id));
    if (now.has(id)) return null;
    return before.filter((item) => item !== id && !now.has(item)).length;
}

/**
 * The id a new body is given by the screen (findings/builder_step3_close_ready.md §3): the
 * next free `s<n>` for a star or `b<n>` for a world, as the server would name it, never one
 * the system holds or this draft has added, and never one that leads another id.
 */
export function nextId(prefix: 's' | 'b', taken: readonly string[]): string {
    const used = new Set(taken);
    for (let n = 1; ; n += 1) {
        const id = prefix + n;
        if (used.has(id) || taken.some((other) => other.startsWith(id + '.') || id.startsWith(other + '.'))) continue;
        return id;
    }
}

/** Every id the form holds a body or a star for. */
export function formIds(form: EditForm): string[] {
    return [...owners(form, 'stars'), ...owners(form, 'bodies')];
}

/**
 * The body a field belongs to: the longest id that leads it. A system switched from a
 * generated one keeps that form's ids, where a moon's id begins with its world's
 * (`body.2.moon.0` under `body.2`).
 */
export function fieldOwner(fieldId: string, ids: readonly string[]): string {
    let found = '';
    for (const id of ids) if (fieldId.startsWith(id + '.') && id.length > found.length) found = id;
    return found;
}

const HIDDEN = ['.parent', '.order', '.remove'];

/** Nothing rolls a field of a system by hand (ruling 4 of 2026-10-10): a field is typed, and no Roll control is drawn for it. */
function typed(field: FormField): FormField {
    return field.permission === 'roll' ? { ...field, permission: 'type' } : field;
}

/** The selected body's own fields, in the form's order: what the list's controls set is left out. */
export function nodeFields(form: EditForm, node: HandNode): { profile: FormField[]; rows: FormField[] } {
    const prefix = node.id + '.';
    const ids = [...owners(form, 'stars'), ...owners(form, 'bodies')];
    const profile: FormField[] = [];
    const rows: FormField[] = [];
    for (const section of form.sections) {
        for (const field of section.fields) {
            if (fieldOwner(field.id, ids) !== node.id || HIDDEN.some((end) => field.id === node.id + end)) continue;
            if (field.id.startsWith(prefix + 'profile.')) profile.push(typed(field));
            else if (field.id === prefix + 'kind') {
                // A moon is a moon by what it orbits: its kind is changed by giving it to a star.
                if (node.kind !== 'moon') rows.push({ ...field, options: field.options.filter((option) => option.value !== 'moon') });
            } else rows.push(typed(field));
        }
    }
    return { profile, rows };
}

/** The system's own fields: its name and its notes. */
export function systemFields(form: EditForm): FormField[] {
    const out: FormField[] = [];
    for (const section of form.sections) for (const field of section.fields) if (field.id.startsWith('system.')) out.push(typed(field));
    return out;
}

/**
 * How many changes the bar counts. A move renumbers many rows and is one change; a body
 * given to another parent is one change though its kind may change with it; a body added is
 * one change, whatever was typed into it.
 */
export function handChangeCount(mine: Readonly<Record<string, FormValue>>, added: readonly string[] = [], rolled: readonly string[] = []): number {
    const seen = new Set<string>(added.map((id) => 'add:' + id));
    // A profile roll is one change, whatever it fills.
    for (const id of rolled) if (id.endsWith('.profile.roll') && !added.some((made) => id.startsWith(made + '.'))) seen.add(id);
    for (const id of Object.keys(mine)) {
        if (added.some((made) => id.startsWith(made + '.'))) continue;
        if (id.endsWith('.order')) seen.add('order');
        else if (id.endsWith('.kind') && (id.slice(0, -'.kind'.length) + '.parent') in mine) continue;
        else seen.add(id);
    }
    return seen.size;
}

/** A body the draft gives to another parent: the row says so, and what it becomes, before it is kept. */
export function movedWords(node: HandNode, list: readonly HandNode[], mine: Readonly<Record<string, FormValue>>, was: Readonly<Record<string, FormValue>>): string {
    if (!((node.id + '.parent') in mine)) return '';
    const parent = list.find((item) => item.id === node.parent);
    const also = node.also ? list.find((item) => item.id === node.also) : undefined;
    const to = parent ? nodeTitle(parent) + (also ? ' and ' + nodeTitle(also) : '') : 'nothing';
    const before = was[node.id + '.kind'];
    const becomes = node.kind !== 'star' && typeof before === 'string' && before !== node.kind ? 'Becomes a ' + KIND_WORD[node.kind].toLowerCase() + ' of ' + to : 'Now orbits ' + to;
    return becomes;
}

// ---- what the designer shows ---------------------------------------------------------------------

export const handUi = reactive({
    /** The body whose fields are shown. */
    selected: '',
    /** The hex "Design by hand" was asked for; the pane says what it means before anything changes. */
    asking: '',
    askName: '',
    askBusy: false,
    askError: '',
    /**
     * A remove that takes others with it, waiting on the pane's ask: the body, its name and
     * kind, and the ids the list held before, so the server's answer can be counted.
     */
    removing: null as null | { id: string; name: string; kind: HandKind; before: string[] },
    /** The body whose profile roll is waiting for the draft's answer; empty when none is. */
    rolling: '',
});

export function selectNode(id: string): void {
    handUi.selected = id;
}
