/**
 * The line-up search: the earliest moment after a date when the orbiting bodies share a
 * line through the star. Ported from js/system_viewer.js (1223-1449), each function naming
 * its legacy lines; the arithmetic is kept in the legacy order so results match bit for bit
 * (tests/web/orbit_alignment.test.js runs both on the same bodies). State the legacy code
 * closed over (the system, the hex id, the clock, the run counter) arrives as arguments.
 * Pure: the caller supplies how to pause between probes and whether to carry on.
 *
 * A line-up is of the circular orbits the picture draws, not a physical ephemeris.
 */
import { formatDisplayNumber } from '../dossier/labels.ts';
import { dateText } from './clock.ts';
import type { Plan } from './layout.ts';
import { worldPeriodYears } from './maths.ts';

/** js/system_viewer.js:1223. The search looks this many display years ahead. */
export const ALIGNMENT_HORIZON_YEARS = 200000;
/** js/system_viewer.js:1397. The most nodes one search may visit before it stops early. */
export const ALIGNMENT_BUDGET = 8000000;

export type Phase = { phase: number; omega: number; name: string; kind: 'star' | 'planet' | 'moon' };
export type AlignmentBodies = { phases: Phase[]; planetCount: number; starCount: number };
export type Lineup = { days: number; spread: number };
export type Budget = { max: number; hit: boolean; visits?: number };

export type AlignmentResult = {
    bodies: number;
    planetCount: number;
    starCount: number;
    names: string[];
    horizonDays: number;
    scannedDays: number;
    truncated: boolean;
    startDays: number;
    matches: Lineup[];
    constant: boolean;
    exact: boolean;
    recurrence: number | null;
    best: Lineup | null;
    next: Lineup | null;
    tolerance?: number;
};

/**
 * js/system_viewer.js:1225-1248. Companion stars and worlds; belts and mainworld belts have
 * no single position and are left out; moons only on request, rings never. The start angles
 * and the periods are the ones the picture draws with (the plan's).
 */
export function alignmentBodies(plan: Plan, includeMoons: boolean): AlignmentBodies {
    const phases: Phase[] = [];
    let planetCount = 0;
    let starCount = 0;
    const add = (epoch: number, period: number, name: string, kind: Phase['kind']): void => {
        if (!(Number.isFinite(period) && period > 0)) return;
        phases.push({ phase: epoch, omega: 2 * Math.PI / (period * 365.25), name, kind });
        if (kind === 'star') starCount++;
        else if (kind === 'planet') planetCount++;
    };
    for (const star of plan.stars) {
        if (!star.index) continue;
        add(star.epoch, star.period, star.name || 'Star ' + (star.index + 1), 'star');
    }
    for (const world of plan.worlds) {
        if (world.belt) continue;
        // 1241: the period against the mass of the star the document names as the parent.
        const parent = plan.stars[world.body.parentStarIdx ?? 0];
        const mass = (parent ? parent.body.mass : 0) || 1;
        add(world.epoch, worldPeriodYears(world.body, mass), world.name || 'World ' + (world.index + 1), 'planet');
        if (!includeMoons) continue;
        for (const moon of world.moons) {
            if (moon.ring || moon.body.type === 'Ring') continue;
            add(moon.epoch, moon.period, moon.name || 'Moon ' + (moon.index + 1), 'moon');
        }
    }
    return { phases, planetCount, starCount };
}

/** js/system_viewer.js:1249-1254. The smallest arc that holds every body, in degrees. */
export function phaseSpread(phases: Phase[], days: number, modulus: number): number {
    const angles = phases.map((p) => ((p.phase + p.omega * days) % modulus + modulus) % modulus).sort((a, b) => a - b);
    let gap = (angles[0] as number) + modulus - (angles[angles.length - 1] as number);
    for (let i = 1; i < angles.length; i++) gap = Math.max(gap, (angles[i] as number) - (angles[i - 1] as number));
    return (modulus - gap) * 180 / Math.PI;
}

/** js/system_viewer.js:1255-1258. */
function alignDist(psi: number, modulus: number): number {
    const x = ((psi % modulus) + modulus) % modulus;
    return x < modulus - x ? x : modulus - x;
}

type Relative = { dw: number; dphi: number };

/**
 * js/system_viewer.js:1262-1280. 'in': the body stays within epsilon of the reference for
 * the whole window; 'out': it never gets that close; 'cut': the window must be split.
 */
export function alignBand(body: Relative, lo: number, hi: number, epsilon: number, modulus: number): 'in' | 'out' | 'cut' {
    const sweep = Math.abs(body.dw) * (hi - lo);
    if (!(sweep > 0)) return alignDist(body.dphi + body.dw * lo, modulus) <= epsilon ? 'in' : 'out';
    if (sweep >= modulus) return 'cut';
    const left = Math.min(body.dphi + body.dw * lo, body.dphi + body.dw * hi);
    const right = Math.max(body.dphi + body.dw * lo, body.dphi + body.dw * hi);
    let minD = Infinity;
    let maxD = 0;
    if (Math.ceil(left / modulus - 1e-12) <= Math.floor(right / modulus + 1e-12)) minD = 0;
    for (const p of [left, right]) {
        const d = alignDist(p, modulus);
        if (d < minD) minD = d;
        if (d > maxD) maxD = d;
    }
    const anti = modulus / 2 + Math.ceil((left - modulus / 2) / modulus - 1e-12) * modulus;
    if (anti >= left - 1e-9 && anti <= right + 1e-9) maxD = modulus / 2;
    if (maxD <= epsilon + 1e-12) return 'in';
    if (minD > epsilon + 1e-12) return 'out';
    return 'cut';
}

/** js/system_viewer.js:1281-1301. The tightest moment between two dates. */
export function polishSpread(phases: Phase[], lo: number, hi: number, modulus: number): Lineup {
    const omegas = phases.map((p) => p.omega);
    const rate = Math.max(...omegas) - Math.min(...omegas);
    const step = (0.12 * Math.PI / 180) / Math.max(rate, 1e-15);
    const n = Math.min(700, Math.max(16, Math.ceil((hi - lo) / step)));
    let bestT = (lo + hi) / 2;
    let bestS = Infinity;
    for (let i = 0; i <= n; i++) {
        const t = lo + (hi - lo) * i / n;
        const s = phaseSpread(phases, t, modulus);
        if (s < bestS) { bestS = s; bestT = t; }
    }
    let a = Math.max(lo, bestT - (hi - lo) / n);
    let b = Math.min(hi, bestT + (hi - lo) / n);
    for (let i = 0; i < 24; i++) {
        const m1 = a + (b - a) / 3;
        const m2 = b - (b - a) / 3;
        if (phaseSpread(phases, m1, modulus) < phaseSpread(phases, m2, modulus)) b = m2;
        else a = m1;
    }
    const days = (a + b) / 2;
    return { days, spread: phaseSpread(phases, days, modulus) };
}

/**
 * js/system_viewer.js:1307-1361. The earliest moment in (start, end] when the bodies share a
 * line through the star no wider than epsilon radians. Opposite sides of the star count when
 * the modulus is π. Being within epsilon of one reference body only guarantees an arc of 2ε,
 * so a candidate window is kept only when its own tightest moment is inside the tolerance.
 */
export function earliestLine(phases: Phase[], start: number, end: number, epsilon: number, modulus: number, budget: Budget): Lineup | null {
    let ref = phases[0] as Phase;
    for (const p of phases) if (p.omega < ref.omega) ref = p;
    const others: Relative[] = phases.filter((p) => p !== ref).map((p) => ({
        dw: p.omega - ref.omega, dphi: p.phase - ref.phase,
    })).sort((a, b) => Math.abs(a.dw) - Math.abs(b.dw));
    const toleranceDeg = epsilon * 180 / Math.PI;
    let visits = 0;
    const walk = (level: number, lo: number, hi: number): Lineup | null => {
        if (budget.hit) return null;
        if (++visits > budget.max) { budget.hit = true; return null; }
        if (!(hi > lo)) return null;
        if (level === others.length) {
            const ev = polishSpread(phases, lo, hi, modulus);
            if (!(ev.days > start && ev.days <= end) || ev.spread > toleranceDeg + 0.02) return null;
            if (lo <= start + 1e-7) {
                const inward = Math.min(hi, lo + Math.max((hi - lo) * 0.05, 1e-4));
                const leaving = phaseSpread(phases, lo, modulus) <= phaseSpread(phases, inward, modulus) + 1e-6;
                if (leaving && ev.days <= lo + (hi - lo) * 0.15) return null;
            }
            return ev;
        }
        const body = others[level] as Relative;
        if (Math.abs(body.dw) < 1e-15) {
            if (alignDist(body.dphi, modulus) > epsilon) return null;
            return walk(level + 1, lo, hi);
        }
        const status = alignBand(body, lo, hi, epsilon, modulus);
        if (status === 'out') return null;
        if (status === 'in') return walk(level + 1, lo, hi);
        const half = epsilon / Math.abs(body.dw);
        const dir = body.dw > 0 ? 1 : -1;
        const target = ((lo - half) * body.dw + body.dphi) / modulus;
        let k = body.dw > 0 ? Math.ceil(target - 1e-9) : Math.floor(target + 1e-9);
        let guard = 0;
        while (guard++ < 5000000) {
            const c = (k * modulus - body.dphi) / body.dw;
            if (c - half > hi + 1e-8) return null;
            if (c + half > start && c + half >= lo) {
                const a = Math.max(lo, c - half);
                const b = Math.min(hi, c + half);
                if (b > a) {
                    const hit = walk(level + 1, a, b);
                    if (hit) return hit;
                }
            }
            k += dir;
            if ((++visits & 65535) === 0 && visits > budget.max) { budget.hit = true; return null; }
        }
        budget.hit = true;
        return null;
    };
    const ev = walk(0, start, end);
    budget.visits = (budget.visits || 0) + visits;
    return ev;
}

/** js/system_viewer.js:1362-1373. Two bodies: the exact next crossing, and how often it repeats. */
export function twoBodyLine(phases: Phase[], start: number, modulus: number): { exact: true; recurrence: number; best: Lineup; next: Lineup } {
    const first = phases[0] as Phase;
    const second = phases[1] as Phase;
    const diff = second.phase - first.phase;
    const velocity = second.omega - first.omega;
    const turns = (diff + velocity * start) / modulus;
    const target = velocity > 0 ? Math.ceil(turns - 1e-10) : Math.floor(turns + 1e-10);
    const next = Math.max(start, (target * modulus - diff) / velocity);
    const recurrence = modulus / Math.abs(velocity);
    return {
        exact: true,
        recurrence,
        best: { days: next, spread: phaseSpread(phases, next, modulus) },
        next: { days: next + recurrence, spread: phaseSpread(phases, next + recurrence, modulus) },
    };
}

export type SearchOptions = {
    /** Count only bodies on the same side of the star (modulus 2π); the default folds the circle to π. */
    sameSide?: boolean;
    /** A closeness in degrees to look for first. */
    tolerance?: number | null;
    /** Stay at that closeness: do not fall through to the open search. */
    strict?: boolean;
    horizonDays?: number;
    startDays: number;
    /** Gives the page a turn between probes (legacy: setTimeout 0). */
    pause?: () => Promise<void>;
    /** False once the search has been cancelled or replaced (legacy: the run counter). */
    alive?: () => boolean;
    budget?: number;
};

/**
 * js/system_viewer.js:1374-1429. Null when cancelled. With two bodies the answer is exact;
 * with more, a binary search on the tolerance from 0.35° to 170°, at most 16 probes, finds
 * the tightest line the horizon holds, then the next one about as tight.
 */
export async function searchAlignments(found: AlignmentBodies, options: SearchOptions): Promise<AlignmentResult | null> {
    const phases = found.phases;
    const { sameSide = false, tolerance = null, strict = false, startDays } = options;
    const pause = options.pause || (() => Promise.resolve());
    const running = options.alive || (() => true);
    const modulus = sameSide ? Math.PI * 2 : Math.PI;
    const horizonDays = Math.max(1, Number(options.horizonDays) || ALIGNMENT_HORIZON_YEARS * 365);
    const result: AlignmentResult = {
        bodies: phases.length, planetCount: found.planetCount, starCount: found.starCount,
        names: phases.map((p) => p.name), horizonDays, scannedDays: horizonDays, truncated: false,
        startDays, matches: [], constant: false, exact: false, recurrence: null, best: null, next: null,
    };
    await pause();
    if (!running()) return null;
    if (phases.length < 2) return { ...result, constant: true };
    const rates = phases.map((p) => p.omega);
    if (Math.max(...rates) - Math.min(...rates) < 1e-14) {
        return { ...result, constant: true, best: { days: startDays, spread: phaseSpread(phases, startDays, modulus) } };
    }
    if (phases.length === 2) {
        const pair = twoBodyLine(phases, startDays, modulus);
        return { ...result, ...pair, matches: [pair.best, pair.next] };
    }
    const end = startDays + horizonDays;
    const budget: Budget = { max: options.budget || ALIGNMENT_BUDGET, hit: false, visits: 0 };
    const alive = (): boolean => running() && !budget.hit;
    let best: Lineup | null = null;
    const asked = Number(tolerance);
    if (Number.isFinite(asked) && asked > 0) best = earliestLine(phases, startDays, end, asked * Math.PI / 180, modulus, budget);
    // A strict search stays at the closeness already shown. The open search falls through
    // and finds the tightest line the horizon contains.
    if (!best && !strict && alive()) {
        let lo = 0.35;
        let hi = 170;
        let probes = 0;
        while (hi - lo > 0.3 && probes < 16 && alive()) {
            const mid = (lo + hi) / 2;
            probes++;
            const hit = earliestLine(phases, startDays, end, mid * Math.PI / 180, modulus, budget);
            if (budget.hit) break;
            if (hit) { best = hit; hi = Math.min(mid, hit.spread); }
            else lo = mid;
            await pause();
        }
    }
    if (!running()) return null;
    result.truncated = budget.hit;
    if (!best) return result;
    const bar = strict && Number.isFinite(asked) ? asked : Math.max(best.spread + 0.35, best.spread * 1.12);
    const next = earliestLine(phases, best.days + 0.5, best.days + 0.5 + horizonDays, bar * Math.PI / 180, modulus, budget);
    if (!running()) return null;
    result.best = best;
    result.next = next;
    result.tolerance = bar;
    result.matches = next ? [best, next] : [best];
    result.truncated = budget.hit;
    return result;
}

// ---- The words ---------------------------------------------------------------------------

/** js/system_viewer.js:1430-1438. */
export function alignmentWho(result: { planetCount: number; starCount: number }): string {
    const planets = result.planetCount === 1 ? 'The planet'
        : result.planetCount === 2 ? 'Both planets'
            : 'All ' + result.planetCount + ' planets';
    if (!result.starCount) return planets;
    const stars = result.starCount === 1 ? 'the companion star' : result.starCount + ' companion stars';
    if (!result.planetCount) return result.starCount === 1 ? 'The companion star' : 'All ' + result.starCount + ' companion stars';
    return planets + ' and ' + stars;
}

/** js/system_viewer.js:1439-1450. */
export function laterText(days: number): string {
    const years = days / 365;
    if (years >= 0.95) {
        const nearest = Math.round(years);
        const whole = Math.abs(years - nearest) < 0.06;
        const text = formatDisplayNumber(years, years >= 20 || whole ? 0 : 1);
        return text + ' ' + (whole && nearest === 1 ? 'year' : 'years') + ' later';
    }
    if (days >= 2) return formatDisplayNumber(days, days >= 10 ? 0 : 1) + ' days later';
    const hours = days * 24;
    if (hours >= 2) return formatDisplayNumber(hours, 1) + ' hours later';
    return formatDisplayNumber(days * 1440, 0) + ' minutes later';
}

export type AlignmentReport = {
    /** The date of the line-up shown, or empty when there is none. */
    date: string;
    lines: string[];
    /** Quieter lines: how often it repeats, when the next one is. */
    notes: string[];
    /** The line-up the "Show the next lineup" button jumps to, or null. */
    upcoming: Lineup | null;
    /** The date the picture should jump to, or null. */
    land: number | null;
};

/**
 * js/system_viewer.js:1481-1524: what the popover says about a result. `shown` is the
 * line-up already on screen when the search was for the one after it.
 */
export function alignmentReport(result: AlignmentResult | null, shown: Lineup | null): AlignmentReport {
    const report: AlignmentReport = { date: '', lines: [], notes: [], upcoming: null, land: null };
    if (!result) {
        report.lines.push('Search cancelled. Line them up again to use the current system.');
        return report;
    }
    if (result.bodies < 2) {
        report.lines.push('This system needs at least two orbiting planets before there is a lineup to find. Belts and rings have no single position, so they are skipped.');
        return report;
    }
    if (result.constant && !shown) {
        const spread = result.best ? result.best.spread : 0;
        const verb = result.bodies === 1 ? 'holds' : 'hold';
        report.lines.push(alignmentWho(result) + ' ' + verb + ' a fixed spread of ' + formatDisplayNumber(spread, 1) + '°. There is no later date when they line up differently.');
        return report;
    }
    if (!result.best && !shown) {
        report.lines.push(result.truncated
            ? 'The search stopped early. Line them up again to continue from this date.'
            : 'No lineup turned up in the next ' + formatDisplayNumber(result.horizonDays / 365, 0) + ' years.');
        return report;
    }
    const current = (shown || result.best) as Lineup;
    const upcoming = shown ? result.best : result.next;
    report.date = dateText(current.days);
    report.land = current.days;
    const spread = current.spread;
    const who = alignmentWho(result);
    const horizon = formatDisplayNumber(result.horizonDays / 365, 0);
    if (spread < 0.05) report.lines.push(who + ' are exactly on one line through the star.');
    else if (spread <= 12) report.lines.push(who + ' are on one line through the star, within ' + formatDisplayNumber(spread, spread < 10 ? 1 : 0) + '°.');
    else if (spread <= 25) report.lines.push(who + ' gather into a ' + formatDisplayNumber(spread, 0) + '° line through the star.');
    else report.lines.push(who + ' are ' + formatDisplayNumber(spread, 0) + '° from a straight line. That is as close as this search gets.');
    if (result.exact && result.recurrence) {
        const every = laterText(result.recurrence).replace(/ later$/, '');
        report.notes.push('The same line repeats ' + (every === '1 year' ? 'every year' : 'every ' + every) + '.');
    }
    if (upcoming) {
        report.notes.push('Next time: ' + dateText(upcoming.days) + ', ' + laterText(upcoming.days - current.days) + '.');
        report.upcoming = upcoming;
    } else {
        report.notes.push('The next lineup this close is more than ' + horizon + ' years after this one.');
    }
    return report;
}
