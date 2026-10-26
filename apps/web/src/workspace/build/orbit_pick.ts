/**
 * The orbit picker of the hand designer (findings/builder_system_design.md §22; mockups kb6_*;
 * contracts/b_builder.md "Hand: orbit data"). A body's orbit is picked on a picture of what it
 * orbits: the stars or the world at the middle, every other body around it at its own orbit,
 * and a ring that follows the pointer.
 *
 * The units are the contract's. On an MgT2E system a star, world, gas giant or belt is placed by
 * orbit number, and the AU of that number (`mgt2eOrbitToAu`) is written beside it. On any other
 * system it is placed in AU and no orbit number is shown or written. A moon is placed in
 * planetary diameters. The server stores any finite number; nothing here is a rule. The span of
 * the picture is only how much of the scale is drawn: the typed field takes any number.
 *
 * Pure, and runs under Node.
 */
import { reactive } from 'vue';
import { mgt2eAuToOrbit, mgt2eOrbitToAu } from '@voyage/shared/orbit_au';
import type { EditForm, FormChange, FormField, FormValue } from '@voyage/shared';
import { draftHandle, edit, setField } from './edit.ts';
import { handUi, nodeTitle, orbitsValue, parentOptions, type HandKind, type HandNode } from './hand.ts';
import { giveBody, handNodes } from './hand_acts.ts';

/** `orbit`: MgT2E orbit number. `au`: AU, drawn on a log scale. `pd`: planetary diameters, on a log scale. */
export type PickMode = 'orbit' | 'au' | 'pd';

/** The scale of the picture. Positions `p` are orbit numbers (`orbit`) or tenth-powers (`au`, `pd`). */
export type PickScale = { mode: PickMode; lo: number; hi: number };

/** A body drawn at its orbit around the middle. */
export type PickRing = { id: string; name: string; kind: HandKind; p: number; words: string };

/** The orbit table's last entry (contracts/b_builder.md, conversion helper): past it, every number is the same distance. */
export const ORBIT_TOP = 20;

/** Which body the picker is open for; empty when it is closed. */
export const pickUi = reactive({ id: '' });

/**
 * Where Tab goes inside the picker, which holds focus while it is open: from the last control
 * forward to the first, from the first back to the last, and from anywhere outside to the first
 * (or, going back, the last). Null leaves the step to the browser.
 */
export function wrapFocus(count: number, index: number, back: boolean): number | null {
    if (count === 0) return null;
    if (index < 0) return back ? count - 1 : 0;
    if (!back && index >= count - 1) return 0;
    if (back && index <= 0) return count - 1;
    return null;
}

export function openPicker(id: string): void {
    pickUi.id = id;
}

export function closePicker(): void {
    pickUi.id = '';
}

function fieldMap(form: EditForm): Map<string, FormField> {
    const out = new Map<string, FormField>();
    for (const section of form.sections) for (const field of section.fields) out.set(field.id, field);
    return out;
}

function numberAt(fields: Map<string, FormField>, id: string): number | null {
    const field = fields.get(id);
    const value: FormValue | undefined = field ? field.value : undefined;
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

/** What a body orbits is a world or a gas giant (a moon, or a belt around one): it is placed in planetary diameters. */
function aroundWorld(node: HandNode, list: readonly HandNode[]): boolean {
    if (node.kind === 'moon') return true;
    if (node.kind !== 'belt') return false;
    const parent = list.find((item) => item.id === node.parent);
    return !!parent && (parent.kind === 'world' || parent.kind === 'gas');
}

/** The unit a body is placed in on this system: diameters around a world, else the orbit number on MgT2E, else AU. */
export function modeFor(form: EditForm, node: HandNode, list: readonly HandNode[] = []): PickMode {
    if (aroundWorld(node, list)) return 'pd';
    return form.edition === 'MgT2E' ? 'orbit' : 'au';
}

/** The field "Pick orbit" stands beside: the orbit number on MgT2E, AU elsewhere, diameters for a moon. */
export function pickFieldId(form: EditForm, node: HandNode, list: readonly HandNode[] = []): string {
    const mode = modeFor(form, node, list);
    return node.id + (mode === 'pd' ? '.orbit.pd' : mode === 'orbit' ? '.orbit.id' : '.orbit.au');
}

/** The form has the field the picker writes for this body, and there is something to orbit: the picker is offered only then. */
export function canPick(form: EditForm, node: HandNode, list: readonly HandNode[] = []): boolean {
    if (!fieldMap(form).has(pickFieldId(form, node, list))) return false;
    return list.length === 0 || pickParents(list, node.id).some((item) => item.why === '');
}

/** A body's stored orbit as a position on the scale, or null when it has none. */
export function storedP(form: EditForm, id: string, mode: PickMode): number | null {
    const fields = fieldMap(form);
    if (mode === 'pd') {
        const pd = numberAt(fields, id + '.orbit.pd');
        return pd !== null && pd > 0 ? Math.log10(pd) : null;
    }
    const orbit = numberAt(fields, id + '.orbit.id');
    const au = numberAt(fields, id + '.orbit.au');
    if (mode === 'orbit') {
        if (orbit !== null && orbit >= 0) return orbit;
        return au !== null && au >= 0 ? mgt2eAuToOrbit(au) : null;
    }
    return au !== null && au > 0 ? Math.log10(au) : null;
}

/** The value written for a position, rounded to what a person reads: a tenth of an orbit, three figures of AU or diameters. */
export function valueAt(mode: PickMode, p: number): number {
    if (mode === 'orbit') return Math.round(p * 10) / 10;
    return Number((10 ** p).toPrecision(3));
}

function figures(value: number): string {
    return value >= 1000 ? Math.round(value).toLocaleString('en-US') : String(Number(value.toPrecision(3)));
}

/** "Orbit 3.4 · 1.84 AU", "1.84 AU", or "12.5 planetary diameters". */
export function pickWords(mode: PickMode, p: number): string {
    const value = valueAt(mode, p);
    if (mode === 'orbit') return 'Orbit ' + value.toFixed(1) + ' · ' + figures(mgt2eOrbitToAu(value)) + ' AU';
    if (mode === 'au') return figures(value) + ' AU';
    return figures(value) + (value === 1 ? ' planetary diameter' : ' planetary diameters');
}

/** The changes Place sends: an orbit number and its AU on MgT2E, AU alone elsewhere, diameters for a moon. */
export function orbitChanges(id: string, mode: PickMode, p: number): FormChange[] {
    const value = valueAt(mode, p);
    if (mode === 'pd') return [{ id: id + '.orbit.pd', value }];
    if (mode === 'au') return [{ id: id + '.orbit.au', value }];
    return [{ id: id + '.orbit.id', value }, { id: id + '.orbit.au', value: Number(mgt2eOrbitToAu(value).toPrecision(4)) }];
}

/**
 * How much of the scale the picture shows: enough for every body drawn, with room past the
 * farthest. Orbit numbers run from 0 to the table's end; AU and diameters by tenth-powers.
 */
export function scaleFor(mode: PickMode, ps: readonly number[]): PickScale {
    const far = ps.length ? Math.max(...ps) : -Infinity;
    const near = ps.length ? Math.min(...ps) : Infinity;
    if (mode === 'orbit') return { mode, lo: 0, hi: Math.min(ORBIT_TOP, Math.max(8, Math.ceil(far + 2))) };
    // AU: a hundredth to a thousand AU at the least; diameters: 1 to 1000.
    const lo = Math.min(mode === 'au' ? -2 : 0, Math.floor(near - 0.5));
    const hi = Math.max(3, Math.ceil(far + 0.5));
    return { mode, lo, hi };
}

/** Keeps a position on the scale the picture shows. */
export function clampP(scale: PickScale, p: number): number {
    return Math.min(scale.hi, Math.max(scale.lo, p));
}

/** Distance from the middle, from `inner` (the scale's start, just outside the middle bodies) to `outer`. */
export function radiusOf(scale: PickScale, p: number, inner: number, outer: number): number {
    return inner + (clampP(scale, p) - scale.lo) / (scale.hi - scale.lo) * (outer - inner);
}

export function pAtRadius(scale: PickScale, r: number, inner: number, outer: number): number {
    const p = scale.lo + (r - inner) / (outer - inner) * (scale.hi - scale.lo);
    return clampP(scale, snap(scale.mode, p));
}

/** What the line snaps to: a tenth of an orbit, or a hundredth of a tenth-power (about 2 percent). */
export function snap(mode: PickMode, p: number): number {
    return mode === 'orbit' ? Math.round(p * 10) / 10 : Math.round(p * 100) / 100;
}

/** One arrow press: a tenth of an orbit (a whole one with Shift); 5 or 25 percent of AU or diameters. */
export function stepP(scale: PickScale, p: number, by: -1 | 1, big: boolean): number {
    const size = scale.mode === 'orbit' ? (big ? 1 : 0.1) : (big ? 0.1 : 0.02);
    return clampP(scale, snap(scale.mode, p + by * size));
}

/** The marks along the scale: whole orbit numbers, or each tenth-power. */
export function ticksOf(scale: PickScale): { p: number; label: string }[] {
    const out: { p: number; label: string }[] = [];
    const every = scale.mode === 'orbit' && scale.hi - scale.lo > 12 ? 2 : 1;
    for (let p = Math.ceil(scale.lo); p <= scale.hi; p += every) {
        const label = scale.mode === 'orbit' ? String(p) : figures(10 ** p) + (scale.mode === 'au' ? ' AU' : ' pd');
        out.push({ p, label });
    }
    return out;
}

/**
 * The parents the picker offers: those the "Orbits" list allows that keep the body what it is,
 * and that keep its unit (a belt goes between stars, or between worlds, here). Changing its kind,
 * or a belt's unit, stays with that list.
 */
export function pickParents(list: readonly HandNode[], id: string): { value: string; label: string; why: string }[] {
    const node = list.find((item) => item.id === id);
    const nearWorld = !!node && aroundWorld(node, list);
    const isWorld = (value: string): boolean => { const item = list.find((other) => other.id === value); return !!item && item.kind !== 'star'; };
    return parentOptions(list, id)
        .filter((option) => option.value !== '' && option.becomes === null && (!node || node.kind !== 'belt' || isWorld(option.value) === nearWorld))
        .map((option) => ({ value: option.value, label: option.label, why: option.why }));
}

/** Every other body around that parent with an orbit on this scale, nearest first. Bodies with no orbit are counted, not drawn. */
export function ringsAround(form: EditForm, list: readonly HandNode[], parent: string, selfId: string, mode: PickMode): { rings: PickRing[]; unplaced: string[] } {
    const rings: PickRing[] = [];
    const unplaced: string[] = [];
    for (const node of list) {
        if (node.id === selfId || orbitsValue(node) !== parent) continue;
        const name = nodeTitle(node);
        const nodeMode = modeFor(form, node, list);
        const p = nodeMode === mode ? storedP(form, node.id, mode) : null;
        if (p === null) unplaced.push(name);
        else rings.push({ id: node.id, name, kind: node.kind, p, words: pickWords(mode, p) });
    }
    rings.sort((a, b) => a.p - b.p);
    return { rings, unplaced };
}

/**
 * Place: the body goes to the parent picked (when that changed), then its orbit is set. Both
 * are draft changes like any other: the bar counts them, Keep stores them, Discard drops them.
 */
export function placeOrbit(id: string, parent: string, mode: PickMode, p: number): void {
    const node = handNodes().find((item) => item.id === id);
    if (!node) return;
    if (orbitsValue(node) !== parent) giveBody(id, parent);
    for (const change of orbitChanges(id, mode, p)) setField(change.id, change.value);
}

/** The palette's "Pick the orbit of the selected body": a body by hand is selected and has an orbit to pick. */
export function canPickSelected(): boolean {
    const handle = draftHandle.value;
    if (!handle || edit.mode !== 'hand' || edit.keeping) return false;
    const list = handNodes();
    const node = list.find((item) => item.id === handUi.selected);
    return !!node && canPick(handle.form.value, node, list);
}

/**
 * Typing an orbit number fills its AU, and typing AU fills the orbit number, with the
 * contract's conversion, on an MgT2E system only. Clearing one clears the other. Null when
 * the field is neither, or the system is not MgT2E.
 */
export function orbitPartner(form: EditForm, fieldId: string, value: FormValue): FormChange | null {
    if (form.edition !== 'MgT2E') return null;
    const byNumber = fieldId.endsWith('.orbit.id');
    if (!byNumber && !fieldId.endsWith('.orbit.au')) return null;
    const owner = fieldId.slice(0, -(byNumber ? '.orbit.id' : '.orbit.au').length);
    const other = owner + (byNumber ? '.orbit.au' : '.orbit.id');
    if (!fieldMap(form).has(other)) return null;
    const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN;
    if (value === null || value === '' || !Number.isFinite(n)) return { id: other, value: null };
    if (byNumber) return n < 0 ? null : { id: other, value: Number(mgt2eOrbitToAu(n).toPrecision(4)) };
    return n < 0 ? null : { id: other, value: Math.round(mgt2eAuToOrbit(n) * 100) / 100 };
}
