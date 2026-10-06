/**
 * Straight-line distance between two bodies, in the plan's own units. The picture compresses
 * orbits to fit the canvas, so a flight is never measured there.
 *
 * A body's place is its `au` and the angle `layoutScene` uses (`bodyAngle` of the plan's
 * epoch and period). The primary is the origin. A companion is placed from its parent only
 * when its body carries `orbitAU` or `orbitId`; the plan's `au` is that orbit. A world is
 * placed from its star.
 *
 * A moon's place is its parent's place plus `pd * parent.diamKm / AU_KM`, at the angle
 * `layoutScene` gives that moon (`bodyAngle` of the moon's epoch and period). Null, with
 * nothing estimated: a moon with no numeric `pd`, a parent with no numeric `diamKm`, a moon
 * whose parent has no place, a belt (a ring, not a point), a companion whose body has neither
 * `orbitAU` nor `orbitId`, a world with no numeric `au`, and any pair whose places are not
 * in the same frame. The drawn period's `pd || 20` fallback is not a distance.
 */
import { AU_KM, type Plan, type PlanMoon, type PlanStar, type PlanWorld } from './layout.ts';
import { bodyAngle } from './maths.ts';

export type AuPoint = { x: number; y: number };

/** 0 is the primary's frame. Any other frame is that star, whose own place is unknown. */
type Place = { x: number; y: number; frame: number };

function finite(value: unknown): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** The companion orbit in AU, or null when the body does not carry one. */
function companionAu(star: PlanStar): number | null {
    if (!finite(star.body.orbitAU) && !finite(star.body.orbitId)) return null;
    return finite(star.au) ? star.au : null;
}

function starPlace(plan: Plan, star: PlanStar, days: number, memo: (Place | undefined)[]): Place {
    const cached = memo[star.index];
    if (cached) return cached;
    let place: Place;
    if (star.index === 0) {
        place = { x: 0, y: 0, frame: 0 };
    } else {
        const au = companionAu(star);
        const parent = plan.stars[star.parent];
        const origin = parent && parent.index < star.index ? starPlace(plan, parent, days, memo) : null;
        if (au === null || !origin || origin.frame !== 0) {
            // An unknown companion is its own frame. Two of its worlds can still be compared.
            const base = au !== null && origin && origin.frame !== 0 ? origin : null;
            if (base && au !== null) {
                const angle = bodyAngle(star.epoch, star.period, days);
                place = { x: base.x + au * Math.cos(angle), y: base.y + au * Math.sin(angle), frame: base.frame };
            } else {
                place = { x: 0, y: 0, frame: star.index };
            }
        } else {
            const angle = bodyAngle(star.epoch, star.period, days);
            place = { x: origin.x + au * Math.cos(angle), y: origin.y + au * Math.sin(angle), frame: 0 };
        }
    }
    memo[star.index] = place;
    return place;
}

function worldPlace(plan: Plan, world: PlanWorld, days: number, memo: (Place | undefined)[]): Place | null {
    if (world.belt) return null;
    if (!finite(world.body.au)) return null;
    const star = world.star >= 0 ? plan.stars[world.star] : undefined;
    if (!star) return null;
    const origin = starPlace(plan, star, days, memo);
    const angle = bodyAngle(world.epoch, world.period, days);
    return {
        x: origin.x + world.body.au * Math.cos(angle),
        y: origin.y + world.body.au * Math.sin(angle),
        frame: origin.frame,
    };
}

/** Kilometres of a moon's orbit, as planet-diameters times the parent's diameter, in AU. */
function moonPlace(plan: Plan, world: PlanWorld, moon: PlanMoon, days: number, memo: (Place | undefined)[]): Place | null {
    if (moon.ring) return null;
    if (!finite(moon.body.pd) || !finite(world.body.diamKm)) return null;
    const parent = worldPlace(plan, world, days, memo);
    if (!parent) return null;
    const offset = moon.body.pd * world.body.diamKm / AU_KM;
    const angle = bodyAngle(moon.epoch, moon.period, days);
    return {
        x: parent.x + offset * Math.cos(angle),
        y: parent.y + offset * Math.sin(angle),
        frame: parent.frame,
    };
}

function locate(plan: Plan, key: string, days: number, memo: (Place | undefined)[]): { known: true; place: Place | null } | { known: false } {
    const star = plan.stars.find((item) => item.key === key);
    if (star) return { known: true, place: starPlace(plan, star, days, memo) };
    for (const world of plan.worlds) {
        if (world.key === key) return { known: true, place: worldPlace(plan, world, days, memo) };
        const moon = world.moons.find((item) => item.key === key);
        if (moon) return { known: true, place: moonPlace(plan, world, moon, days, memo) };
    }
    return { known: false };
}

/** The body's place in AU from the primary, or null when the plan has no absolute place for it. */
export function realPositionAu(plan: Plan, key: string, days: number): AuPoint | null {
    const found = locate(plan, key, days, []);
    if (!found.known || !found.place || found.place.frame !== 0) return null;
    return { x: found.place.x, y: found.place.y };
}

/** Kilometres between two bodies at `days`, or null. The same known key is 0. */
export function realDistanceKm(plan: Plan, fromKey: string, toKey: string, days: number): number | null {
    const memo: (Place | undefined)[] = [];
    if (fromKey === toKey) return locate(plan, fromKey, days, memo).known ? 0 : null;
    const from = locate(plan, fromKey, days, memo);
    const to = locate(plan, toKey, days, memo);
    if (!from.known || !to.known || !from.place || !to.place) return null;
    if (from.place.frame !== to.place.frame) return null;
    return Math.hypot(from.place.x - to.place.x, from.place.y - to.place.y) * AU_KM;
}
