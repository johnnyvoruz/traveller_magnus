/**
 * Directions on the chart (streams/D.md DN1; Johnny 2026-11-06: "like Google maps directions ... start
 * system and end system ... refueling systems at certain jump speed (1 - 6)"). Pure: what was typed in
 * From and To read against the loaded sectors, the query for A's planner (`route_plan.ts`, AN1), and the
 * words for the result: one line per leg and the total. The time in jump is the rules file's
 * `jump.durationHours` (`rules/mgt2e_space_travel.json`), the base plus the dice's mean, said as "about".
 * Nothing is saved.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import { planRoute, type RouteEnd, type RouteFuel, type RouteHex, type RouteIndex, type RouteLeg, type RoutePlan, type RouteQuery } from './route_plan.ts';

const rules = generated as { jump: { durationHours: { base: number; dice: number } } };

/** A loaded sector as the chart holds it: the planner's fields, with the names the words use. */
export type DirectionsIndex = RouteIndex & { name?: string; hexes: Readonly<Record<string, RouteHex & { name?: string }>> };

export const JUMPS = [1, 2, 3, 4, 5, 6] as const;

export const FUEL_CHOICES: readonly { value: RouteFuel; label: string }[] = [
    { value: 'any', label: 'Any fuel' },
    { value: 'starport', label: 'Starport only' },
    { value: 'refined', label: 'Refined only' },
];

export type DirectionsForm = {
    from: string;
    to: string;
    jump: number;
    fuel: RouteFuel;
    scoops: boolean;
    processors: boolean;
    allowRed: boolean;
};

export function blankForm(): DirectionsForm {
    return { from: '', to: '', jump: 2, fuel: 'any', scoops: false, processors: false, allowRed: false };
}

export type EndFound = { ok: true; end: RouteEnd; label: string } | { ok: false; message: string };

const squash = (text: string): string => text.trim().toLowerCase().replace(/[_\s]+/g, ' ');

function sectorWords(index: DirectionsIndex): string {
    return index.name && index.name.trim() ? index.name.trim() : index.slug.replace(/_/g, ' ');
}

/** A system's name, or the sector and hex when it has none. */
export function placeName(indexes: readonly DirectionsIndex[], end: RouteEnd): string {
    const index = indexes.find((one) => one.slug === end.sector);
    const name = index && index.hexes[end.hex] ? (index.hexes[end.hex].name ?? '').trim() : '';
    if (name) return name;
    return (index ? sectorWords(index) : end.sector.replace(/_/g, ' ')) + ' ' + end.hex;
}

/**
 * What was typed in From or To: "Regina", "Spinward Marches 1910" or "Spinward_Marches/1910". A name is
 * matched whole first (the first loaded sector wins), then by its start when only one system starts so.
 */
export function findEnd(indexes: readonly DirectionsIndex[], typed: string, box: 'From' | 'To'): EndFound {
    const text = typed.trim();
    if (!text) return { ok: false, message: 'Type a system in ' + box + '.' };
    const coded = /^(.*?)[\s/]+(\d{4})$/.exec(text);
    if (coded) {
        const wanted = squash(coded[1]);
        const index = indexes.find((one) => squash(one.slug) === wanted || squash(one.name ?? '') === wanted);
        if (index) {
            const end = { sector: index.slug, hex: coded[2] };
            if (!index.hexes[coded[2]]) return { ok: false, message: 'There is no system at ' + sectorWords(index) + ' ' + coded[2] + '.' };
            return { ok: true, end, label: placeName(indexes, end) };
        }
    }
    const wanted = squash(text);
    const starts: RouteEnd[] = [];
    for (const index of indexes) {
        for (const [hex, row] of Object.entries(index.hexes)) {
            const name = squash(row.name ?? '');
            if (!name) continue;
            if (name === wanted) {
                const end = { sector: index.slug, hex };
                return { ok: true, end, label: placeName(indexes, end) };
            }
            if (name.startsWith(wanted)) starts.push({ sector: index.slug, hex });
        }
    }
    if (starts.length === 1) return { ok: true, end: starts[0], label: placeName(indexes, starts[0]) };
    if (starts.length > 1) return { ok: false, message: starts.length + ' systems start with “' + text + '”. Type more of the name.' };
    return { ok: false, message: 'No system called “' + text + '” in the loaded sectors.' };
}

/** The box's words for a hex picked on the chart: its name when the name finds it again, else the sector and hex. */
export function endWords(indexes: readonly DirectionsIndex[], end: RouteEnd): string {
    const index = indexes.find((one) => one.slug === end.sector);
    const name = index && index.hexes[end.hex] ? (index.hexes[end.hex].name ?? '').trim() : '';
    const back = name ? findEnd(indexes, name, 'From') : null;
    if (back && back.ok && sameEnd(back.end, end)) return name;
    return (index ? sectorWords(index) : end.sector.replace(/_/g, ' ')) + ' ' + end.hex;
}

export function sameEnd(a: RouteEnd, b: RouteEnd): boolean {
    return a.sector === b.sector && a.hex === b.hex;
}

/** One jump as the list shows it: the system reached, how far, the fuel taken there, and A's notes for the jump. */
export type DirectionsLeg = { end: RouteEnd; name: string; parsecs: string; fuel: string; notes: string[] };

/** `origin` and `legs` are the list's rows (the start, then one row a jump); `lines` are the same legs as sentences. */
export type DirectionsResult =
    | { ok: true; stops: RouteEnd[]; lines: string[]; total: string; origin?: { end: RouteEnd; name: string }; legs?: DirectionsLeg[] }
    | { ok: false; message: string };

/**
 * A box filled from a system rather than typed (DN2: From here, To here, Use <name>, a suggestion picked): the
 * words shown and the system they stand for. While the box still says those words, the system is the end.
 */
export type PinnedEnd = { label: string; end: RouteEnd };
export type PinnedEnds = { from?: PinnedEnd | null; to?: PinnedEnd | null };

/** The box's end: the pinned system while the box says its words, else the typed words read. */
export function boxEnd(indexes: readonly DirectionsIndex[], typed: string, box: 'From' | 'To', pinned?: PinnedEnd | null): EndFound {
    if (pinned && typed.trim() === pinned.label.trim()) return { ok: true, end: pinned.end, label: pinned.label };
    return findEnd(indexes, typed, box);
}

/** A box settled on one system: pinned, a whole name, or a sector and hex; not the start of a name still typed. */
export function settled(typed: string, found: EndFound): boolean {
    if (!found.ok) return false;
    const text = typed.trim();
    return squash(found.label) === squash(text) || /\d{4}$/.test(text);
}

/** Both boxes settled (`settled`): the panel plans at once. Nothing is said for a box not settled yet. */
export function bothEnds(indexes: readonly DirectionsIndex[], form: DirectionsForm, pinned: PinnedEnds = {}): boolean {
    return settled(form.from, boxEnd(indexes, form.from, 'From', pinned.from)) && settled(form.to, boxEnd(indexes, form.to, 'To', pinned.to));
}

/** One press of Get directions: both ends read, the planner asked, the words made. */
export function directions(indexes: readonly DirectionsIndex[], form: DirectionsForm, pinned: PinnedEnds = {}): DirectionsResult {
    const from = boxEnd(indexes, form.from, 'From', pinned.from);
    if (!from.ok) return from;
    const to = boxEnd(indexes, form.to, 'To', pinned.to);
    if (!to.ok) return to;
    if (sameEnd(from.end, to.end)) return { ok: false, message: 'From and To are the same system.' };
    const query: RouteQuery = { from: from.end, to: to.end, jump: form.jump, fuel: form.fuel, scoops: form.scoops, processors: form.processors, allowRed: form.allowRed };
    const plan: RoutePlan = planRoute(indexes, query);
    if (!plan.ok) return { ok: false, message: plan.reason };
    if (!plan.legs.length) return { ok: false, message: 'From and To are the same system.' };
    return {
        ok: true,
        stops: [from.end, ...plan.legs.map((leg) => leg.to)],
        lines: plan.legs.map((leg, i) => legLine(indexes, leg, i + 1)),
        total: totalWords(plan.legs),
        origin: { end: from.end, name: placeName(indexes, from.end) },
        legs: plan.legs.map((leg) => legRow(indexes, leg)),
    };
}

const plural = (n: number, one: string): string => n + ' ' + one + (n === 1 ? '' : 's');

/** The fuel at the leg's end, as the list says it; empty where no fuel is taken. */
export function fuelWords(indexes: readonly DirectionsIndex[], leg: RouteLeg): string {
    const grade = leg.grade === 'none' ? '' : ', ' + leg.grade;
    if (leg.source === 'starport') {
        const index = indexes.find((one) => one.slug === leg.to.sector);
        const port = index && index.hexes[leg.to.hex] ? index.hexes[leg.to.hex].uwp.charAt(0) : '';
        return 'Starport ' + port + grade;
    }
    if (leg.source === 'gas-giant') return 'Gas giant' + grade;
    if (leg.source === 'water') return 'Water' + grade;
    return '';
}

/** "1. Regina → Jenghe, 1 parsec · Starport B, refined", then A's notes. */
export function legLine(indexes: readonly DirectionsIndex[], leg: RouteLeg, n: number): string {
    const parts = [n + '. ' + placeName(indexes, leg.from) + ' → ' + placeName(indexes, leg.to) + ', ' + plural(leg.parsecs, 'parsec')];
    const fuel = fuelWords(indexes, leg);
    if (fuel) parts.push(fuel);
    for (const note of leg.notes) parts.push(note);
    return parts.join(' · ');
}

/** The same leg for the list: the stop's name, "2 parsecs", the fuel words, the notes apart. */
export function legRow(indexes: readonly DirectionsIndex[], leg: RouteLeg): DirectionsLeg {
    return { end: leg.to, name: placeName(indexes, leg.to), parsecs: plural(leg.parsecs, 'parsec'), fuel: fuelWords(indexes, leg), notes: leg.notes.slice() };
}

/** The mean hours of one jump: the base plus the dice's mean (3.5 a die). */
export function meanJumpHours(): number {
    return rules.jump.durationHours.base + rules.jump.durationHours.dice * 3.5;
}

/** "4 jumps, 7 parsecs, about 4 weeks in jump". */
export function totalWords(legs: readonly RouteLeg[]): string {
    const parsecs = legs.reduce((sum, leg) => sum + leg.parsecs, 0);
    const weeks = Math.max(1, Math.round((legs.length * meanJumpHours()) / (24 * 7)));
    return plural(legs.length, 'jump') + ', ' + plural(parsecs, 'parsec') + ', about ' + plural(weeks, 'week') + ' in jump';
}

/** The party ship's jump for the box: 1 to 6, or null when the sheet says none or more. */
export function jumpForBox(jump: number | null): number | null {
    return jump !== null && jump >= 1 && jump <= 6 ? jump : null;
}
