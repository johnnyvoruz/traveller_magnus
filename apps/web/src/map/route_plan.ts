/**
 * Directions from one loaded system to another (AN1).
 * Pure: the indexes it is given, and the fuel and jump numbers in
 * rules/mgt2e_space_travel.json through the generated wrapper. No Vue.
 *
 * A chart index is read as `slug`, `x`, `y`, and each hex's `uwp`, `zone` and `pbg`.
 * Starport is `uwp` character 0. Atmosphere is character 2. Hydrographics is character 3.
 * The gas-giant count is `pbg` character 2 (the third), read as a hex digit, and it counts
 * only above 0. Zone `A` or `Amber` is amber. Zone `R` or `Red` is red. Bases are not read.
 * An empty hex is absent from the index, so it is never a stop.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import { hexDistance, parseHex, toGlobal } from './geometry.ts';

type DiceRoll = { base: number; dice: number };

type TravelRules = {
    fuel: {
        byStarportClass: Record<string, string>;
        wilderness: {
            gasGiant: {
                check: { skill: string; target: number; characteristic: string };
                scoopHours: DiceRoll;
                travelDays: DiceRoll;
            };
            water: { worldRule: { hydrographicsMin: number; atmosphereExcluded: readonly string[] } };
        };
    };
    jump: { parsecsPerJumpNumber: number; unrefinedFuelDM: number };
};

const rules = generated as TravelRules;

/** Where a route starts or ends. `hex` is the four-digit address inside `sector`. */
export type RouteEnd = { sector: string; hex: string };

/** Any fuel the stop can give, starport fuel only, or refined fuel only. */
export type RouteFuel = 'any' | 'starport' | 'refined';

export type RouteQuery = {
    from: RouteEnd;
    to: RouteEnd;
    /** 1 to 6. Each jump reaches that many parsecs, times the file's parsecs per jump number. */
    jump: number;
    fuel: RouteFuel;
    scoops: boolean;
    processors: boolean;
    /** Red zones are not a stop, and not an end, unless this is on. From and To are always allowed. */
    allowRed: boolean;
};

/** Where the fuel at the end of a leg comes from. `none` is a last jump that does not refuel. */
export type RouteFuelSource = 'starport' | 'gas-giant' | 'water' | 'none';

export type RouteFuelGrade = 'refined' | 'unrefined' | 'none';

/**
 * One jump. `source` and `grade` are the fuel at `to` (the stop), or `none` when the last
 * jump ends at a system that is not a stop. Notes, in this order when they apply:
 * the unrefined-fuel line (the fuel taken at the stop before this leg), the gas-giant line,
 * then "Amber zone".
 */
export type RouteLeg = {
    from: RouteEnd;
    to: RouteEnd;
    parsecs: number;
    source: RouteFuelSource;
    grade: RouteFuelGrade;
    notes: string[];
};

export type RoutePlan =
    | { ok: true; legs: RouteLeg[] }
    | { ok: false; reason: string };

/** One loaded sector. The chart's sector index has this shape for the fields read here. */
export type RouteIndex = {
    slug: string;
    x: number;
    y: number;
    hexes: Readonly<Record<string, RouteHex>>;
};

export type RouteHex = {
    uwp: string;
    zone: string;
    pbg: string;
};

type Offer = { source: Exclude<RouteFuelSource, 'none'>; grade: Exclude<RouteFuelGrade, 'none'> };

type World = RouteEnd & {
    id: string;
    q: number;
    r: number;
    hexRow: RouteHex;
    red: boolean;
    amber: boolean;
};

type Cost = { jumps: number; refined: number; skim: number; parsecs: number; key: string };

type Arrival = {
    cost: Cost;
    prev: string | null;
    source: RouteFuelSource;
    grade: RouteFuelGrade;
    parsecs: number;
};

function noRoute(jump: number): RoutePlan {
    return { ok: false, reason: 'No route with Jump-' + jump + ' between these systems in the loaded sectors.' };
}

function ehex(ch: string): number | null {
    if (ch >= '0' && ch <= '9') return ch.charCodeAt(0) - 48;
    const up = ch.toUpperCase();
    if (up >= 'A' && up <= 'Z') return up.charCodeAt(0) - 55;
    return null;
}

function zoneOf(zone: string): 'red' | 'amber' | 'open' {
    const text = zone.trim().toLowerCase();
    if (text === 'r' || text === 'red') return 'red';
    if (text === 'a' || text === 'amber') return 'amber';
    return 'open';
}

function diceWords(roll: DiceRoll): string {
    return roll.base === 0 ? roll.dice + 'D' : roll.base + '+' + roll.dice + 'D';
}

/** The gas-giant line, from the file's check, scoop hours and travel days. */
function gasGiantNote(): string {
    const gas = rules.fuel.wilderness.gasGiant;
    const check = gas.check;
    return check.skill + ' ' + check.target + '+ (' + check.characteristic + '), '
        + diceWords(gas.scoopHours) + ' hours to scoop, '
        + diceWords(gas.travelDays) + ' days to reach the gas giant';
}

function unrefinedNote(): string {
    return 'Unrefined fuel: DM' + rules.jump.unrefinedFuelDM + ' on the jump check';
}

function portGrade(uwp: string): 'refined' | 'unrefined' | null {
    const letter = uwp.length > 0 ? uwp.charAt(0).toUpperCase() : '';
    const grade = rules.fuel.byStarportClass[letter];
    return grade === 'refined' || grade === 'unrefined' ? grade : null;
}

function hasGas(pbg: string): boolean {
    const count = pbg.length > 2 ? ehex(pbg.charAt(2)) : null;
    return count !== null && count > 0;
}

function hasWater(uwp: string): boolean {
    const rule = rules.fuel.wilderness.water.worldRule;
    const atmosphere = uwp.length > 2 ? uwp.charAt(2).toUpperCase() : '';
    const hydro = uwp.length > 3 ? ehex(uwp.charAt(3)) : null;
    if (!atmosphere || atmosphere === '?' || hydro === null || hydro < rule.hydrographicsMin) return false;
    return !rule.atmosphereExcluded.some((code) => code.toUpperCase() === atmosphere);
}

/** The fuel a ship can take here under the query. Red is ignored; the caller applies it. */
function offerAt(row: RouteHex, query: RouteQuery): Offer | null {
    const port = portGrade(row.uwp);
    if (query.fuel === 'starport') return port ? { source: 'starport', grade: port } : null;
    if (query.fuel === 'refined') {
        if (port === 'refined') return { source: 'starport', grade: 'refined' };
    } else if (port) {
        return { source: 'starport', grade: port };
    }
    if (!query.scoops) return null;
    const wild = hasGas(row.pbg) || hasWater(row.uwp);
    if (!wild) return null;
    const grade = query.processors ? 'refined' : 'unrefined';
    if (query.fuel === 'refined' && grade !== 'refined') return null;
    return { source: hasGas(row.pbg) ? 'gas-giant' : 'water', grade };
}

function better(a: Cost, b: Cost): boolean {
    if (a.jumps !== b.jumps) return a.jumps < b.jumps;
    if (a.refined !== b.refined) return a.refined > b.refined;
    if (a.skim !== b.skim) return a.skim < b.skim;
    if (a.parsecs !== b.parsecs) return a.parsecs < b.parsecs;
    return a.key < b.key;
}

function worldsOf(indexes: readonly RouteIndex[]): Map<string, World> {
    const out = new Map<string, World>();
    const slugs = new Set<string>();
    for (const index of indexes) {
        if (slugs.has(index.slug)) continue;
        slugs.add(index.slug);
        for (const [hex, row] of Object.entries(index.hexes)) {
            const local = parseHex(hex);
            if (!local || !row) continue;
            const at = toGlobal(index.x, index.y, local.col, local.row);
            const zone = zoneOf(row.zone ?? '');
            const id = index.slug + '/' + hex;
            out.set(id, {
                id,
                sector: index.slug,
                hex,
                q: at.q,
                r: at.r,
                hexRow: row,
                red: zone === 'red',
                amber: zone === 'amber',
            });
        }
    }
    return out;
}

function notesFor(prevGrade: RouteFuelGrade, world: World, source: RouteFuelSource): string[] {
    const notes: string[] = [];
    if (prevGrade === 'unrefined') notes.push(unrefinedNote());
    if (source === 'gas-giant') notes.push(gasGiantNote());
    if (world.amber) notes.push('Amber zone');
    return notes;
}

/**
 * Fewest jumps, then more refined stops, then fewer skimming stops, then fewer parsecs.
 * The same indexes and query always give the same legs. From need not be a stop.
 * Every jump lands on a stop, except the last, which may land on To.
 */
export function planRoute(indexes: readonly RouteIndex[], query: RouteQuery): RoutePlan {
    const range = query.jump * rules.jump.parsecsPerJumpNumber;
    if (!Number.isInteger(query.jump) || query.jump < 1 || query.jump > 6 || !(range >= 1)) return noRoute(query.jump);
    const worlds = worldsOf(indexes);
    const start = worlds.get(query.from.sector + '/' + query.from.hex);
    const goal = worlds.get(query.to.sector + '/' + query.to.hex);
    if (!start || !goal) return noRoute(query.jump);
    if (start.id === goal.id) return { ok: true, legs: [] };

    const list = [...worlds.values()];
    const came = new Map<string, Arrival>();
    const startCost: Cost = { jumps: 0, refined: 0, skim: 0, parsecs: 0, key: start.id };
    came.set(start.id, { cost: startCost, prev: null, source: 'none', grade: 'none', parsecs: 0 });
    let layer = new Map<string, Arrival>([[start.id, came.get(start.id)!]]);
    const reached = new Set<string>([start.id]);
    let bestGoal: Arrival | null = null;

    for (let depth = 0; depth < list.length && !bestGoal; depth += 1) {
        const next = new Map<string, Arrival>();
        for (const [at, arrival] of layer) {
            const here = worlds.get(at)!;
            for (const other of list) {
                if (other.id === at || (reached.has(other.id) && other.id !== goal.id)) continue;
                const dist = hexDistance(here, other);
                if (dist < 1 || dist > range) continue;
                const isGoal = other.id === goal.id;
                const banned = other.red && !query.allowRed;
                const offer = banned && !isGoal ? null : offerAt(other.hexRow, query);
                if (!isGoal && (!offer || banned)) continue;
                const source: RouteFuelSource = offer ? offer.source : 'none';
                const grade: RouteFuelGrade = offer ? offer.grade : 'none';
                const cost: Cost = {
                    jumps: arrival.cost.jumps + 1,
                    refined: arrival.cost.refined + (grade === 'refined' ? 1 : 0),
                    skim: arrival.cost.skim + (source === 'gas-giant' || source === 'water' ? 1 : 0),
                    parsecs: arrival.cost.parsecs + dist,
                    key: arrival.cost.key + '>' + other.id,
                };
                const row: Arrival = { cost, prev: at, source, grade, parsecs: dist };
                if (isGoal) {
                    if (!bestGoal || better(cost, bestGoal.cost)) bestGoal = row;
                } else {
                    const have = next.get(other.id);
                    if (!have || better(cost, have.cost)) next.set(other.id, row);
                }
            }
        }
        if (bestGoal) break;
        if (next.size === 0) break;
        for (const [id, row] of next) {
            reached.add(id);
            came.set(id, row);
        }
        layer = next;
    }
    if (!bestGoal || bestGoal.prev === null) return noRoute(query.jump);
    came.set(goal.id, bestGoal);

    const steps: Arrival[] = [];
    let cursor: Arrival | undefined = bestGoal;
    while (cursor && cursor.prev) {
        steps.push(cursor);
        cursor = came.get(cursor.prev);
    }
    steps.reverse();
    const legs: RouteLeg[] = [];
    for (const step of steps) {
        const from = worlds.get(step.prev!)!;
        const to = worlds.get(keyEnd(step.cost.key))!;
        const prev = came.get(step.prev!);
        legs.push({
            from: { sector: from.sector, hex: from.hex },
            to: { sector: to.sector, hex: to.hex },
            parsecs: step.parsecs,
            source: step.source,
            grade: step.grade,
            notes: notesFor(prev ? prev.grade : 'none', to, step.source),
        });
    }
    return { ok: true, legs };
}

function keyEnd(key: string): string {
    const at = key.lastIndexOf('>');
    return at === -1 ? key : key.slice(at + 1);
}
