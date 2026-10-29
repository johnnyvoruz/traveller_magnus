import { z } from 'zod';

/**
 * A system designed by hand.
 * This is not an engine tree. Nothing here is a rolled value.
 * Mass and journey times are absent.
 * Orbit numbers are optional. A document stored before they existed still parses.
 */

const Name = z.string().max(80);
const Short = z.string().max(8);
const Cell = z.string().max(1);

export const HAND_LIMITS = {
    stars: 16,
    bodies: 80,
    notes: 4000,
} as const;

export const HandProfile = z.object({
    st: Cell,
    s: Cell,
    a: Cell,
    h: Cell,
    p: Cell,
    g: Cell,
    l: Cell,
    tl: Cell,
}).strict();
export type HandProfile = z.infer<typeof HandProfile>;

export const HandStar = z.object({
    id: z.string().min(1).max(40),
    name: Name,
    sType: Short,
    subType: Short,
    sClass: Short,
    /** Another star's id. Null when this star orbits no star. */
    parentId: z.string().max(40).nullable(),
    order: z.number().int().nonnegative(),
    /** MgT2E orbit number. Absent until the referee types one. */
    orbitId: z.number().finite().optional(),
    /** AU. The orbit view prefers this over orbitId. */
    orbitAU: z.number().finite().optional(),
    eccentricity: z.number().finite().optional(),
    /** Years. Absent on a document that never stored one. */
    periodYears: z.number().finite().optional(),
    /** Solar masses. Absent until typed. `generateStarObject` writes `Mass (Sol)`. */
    mass: z.number().finite().positive().optional(),
    /** Solar diameters. Absent until typed. */
    diam: z.number().finite().positive().optional(),
    /** Kelvin. Absent until typed. */
    temp: z.number().finite().positive().optional(),
    /** Solar luminosities. Absent until typed. A looked-up luminosity is not stored. */
    lum: z.number().finite().positive().optional(),
}).strict();
export type HandStar = z.infer<typeof HandStar>;

export const HandKind = z.enum(['world', 'moon', 'gas', 'belt']);
export type HandKind = z.infer<typeof HandKind>;

export const HandBody = z.object({
    id: z.string().min(1).max(40),
    kind: HandKind,
    name: Name,
    /**
     * A star id, or a world id when `kind` is `moon`.
     * A belt may name a star, a world, or a gas giant.
     * When `alsoParentId` is set, this is one of the two stars and `alsoParentId` is the other.
     */
    parentId: z.string().min(1).max(40),
    /**
     * The other star, when this body orbits two paired stars.
     * Absent on a body that orbits one star or one world, and absent on every document stored before this field existed.
     */
    alsoParentId: z.string().min(1).max(40).optional(),
    order: z.number().int().nonnegative(),
    /** MgT2E orbit number. Worlds, gas giants, and belts. Absent until typed. */
    orbitId: z.number().finite().optional(),
    /** AU. The orbit view reads this. */
    au: z.number().finite().optional(),
    eccentricity: z.number().finite().optional(),
    /** Planetary diameters. Moons. Absent until typed. */
    pd: z.number().finite().optional(),
    /**
     * Years. A belt form does not write this.
     * A belt that already has it still parses.
     */
    periodYears: z.number().finite().optional(),
    mainworld: z.boolean(),
    profile: HandProfile,
    /**
     * How many profile rolls have been applied to this body.
     * The next roll uses this number. Absent means none.
     * A discarded draft does not store the next number.
     */
    profileRoll: z.number().int().nonnegative().optional(),
    notes: z.string().max(HAND_LIMITS.notes),
    bases: z.string().max(8),
    zone: z.string().max(16),
    allegiance: z.string().max(16),
    trade: z.string().max(80),
}).strict();
export type HandBody = z.infer<typeof HandBody>;

export const HandSystem = z.object({
    name: Name,
    notes: z.string().max(HAND_LIMITS.notes),
    stars: z.array(HandStar).max(HAND_LIMITS.stars),
    bodies: z.array(HandBody).max(HAND_LIMITS.bodies),
}).strict().superRefine((system, ctx) => {
    const stars = new Set(system.stars.map((star) => star.id));
    const bodies = new Set(system.bodies.map((body) => body.id));
    if (stars.size !== system.stars.length || bodies.size !== system.bodies.length) {
        ctx.addIssue({ code: 'custom', message: 'duplicate id' });
    }
    for (const id of stars) {
        if (bodies.has(id)) ctx.addIssue({ code: 'custom', message: 'duplicate id' });
    }
    for (const star of system.stars) {
        if (star.parentId == null) continue;
        if (star.parentId === star.id || !stars.has(star.parentId)) {
            ctx.addIssue({ code: 'custom', path: ['stars'], message: `${star.id} parent` });
        }
    }
    const worlds = system.bodies.filter((body) => body.kind !== 'moon');
    const worldIds = new Set(worlds.map((body) => body.id));
    const beltHosts = new Set(system.bodies.filter((body) => body.kind === 'world' || body.kind === 'gas').map((body) => body.id));
    for (const body of system.bodies) {
        if (body.kind === 'moon') {
            if (!worldIds.has(body.parentId)) {
                ctx.addIssue({ code: 'custom', path: ['bodies'], message: `${body.id} parent` });
            }
        } else if (body.kind === 'belt') {
            const aroundBody = beltHosts.has(body.parentId) && body.parentId !== body.id;
            if (!stars.has(body.parentId) && !aroundBody) {
                ctx.addIssue({ code: 'custom', path: ['bodies'], message: `${body.id} parent` });
            }
        } else if (!stars.has(body.parentId)) {
            ctx.addIssue({ code: 'custom', path: ['bodies'], message: `${body.id} parent` });
        }
        if (body.alsoParentId) {
            const left = system.stars.find((star) => star.id === body.parentId);
            const right = system.stars.find((star) => star.id === body.alsoParentId);
            const paired = !!left && !!right && (left.parentId === right.id || right.parentId === left.id);
            if (body.kind === 'moon' || !paired) {
                ctx.addIssue({ code: 'custom', path: ['bodies'], message: `${body.id} pair` });
            }
        }
    }
    if (system.bodies.filter((body) => body.mainworld).length > 1) {
        ctx.addIssue({ code: 'custom', message: 'one mainworld' });
    }
    for (const star of system.stars) {
        const seen = new Set<string>();
        let at: string | null = star.parentId;
        while (at) {
            if (at === star.id || seen.has(at)) {
                ctx.addIssue({ code: 'custom', path: ['stars'], message: `${star.id} parent` });
                break;
            }
            seen.add(at);
            at = system.stars.find((item) => item.id === at)?.parentId ?? null;
        }
    }
});
export type HandSystem = z.infer<typeof HandSystem>;

/**
 * The object stored for a hand-designed system. The engine is not run.
 * `edition` is set when a generated system was switched, or when an old blank named one.
 * A blank that names no edition omits it.
 */
export const HandEnvelope = z.object({
    kind: z.literal('hand'),
    engineVersion: z.string(),
    edition: z.enum(['MgT2E', 'AoW']).optional(),
    hexKey: z.string(),
    system: HandSystem,
}).strict();
export type HandEnvelope = z.infer<typeof HandEnvelope>;

export function emptyHandProfile(): HandProfile {
    return { st: '', s: '', a: '', h: '', p: '', g: '', l: '', tl: '' };
}
