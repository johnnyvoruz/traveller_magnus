/**
 * The highport: a station in low orbit round a world whose starport profile says it has one.
 * The rule and the numbers are js/system_viewer.js:4337-4529 and js/planet_profile.js:252-265;
 * nothing here is derived from memory. Pure: the painter owns the images and the canvas.
 */

export type HighportArt = {
    file: string;
    /** The painting's opaque bounds: x, y, width, height. */
    crop: [number, number, number, number];
    /** The hub the station turns about, as fractions of the cropped half width and half height. */
    pivot: [number, number];
    /** Navigation lights, in the same fractions. */
    nav: [number, number][];
    /** Anti-collision strobes. */
    strobe: [number, number][];
};

/** js/system_viewer.js:4351-4365. Class D has no art of its own and borrows E's. */
const ART_A: HighportArt = {
    file: 'highport-a.png', crop: [22, 22, 359, 364], pivot: [0, 0],
    nav: [[0.92, -0.89], [0.92, 0.89], [-0.92, 0.89], [-0.92, -0.89]],
    strobe: [[0, -0.98], [0.98, 0], [0, 0.98], [-0.98, 0]],
};
const ART_B: HighportArt = {
    file: 'highport-b.png', crop: [17, 17, 282, 286], pivot: [0, 0],
    nav: [[0.9, -0.85], [0.85, 0.9], [-0.86, 0.9], [-0.9, -0.85]],
    strobe: [[0, -0.98], [0.98, 0], [0, 0.98], [-0.98, 0]],
};
const ART_C: HighportArt = {
    file: 'highport-c.png', crop: [16, 17, 267, 244], pivot: [0.1, 0],
    nav: [[0.96, -0.94], [0.96, 0.95], [-1, -0.05]],
    strobe: [[0.96, -0.48], [0.99, 0.42]],
};
const ART_E: HighportArt = {
    file: 'highport-e.png', crop: [12, 12, 178, 206], pivot: [0, 0.2],
    nav: [[1, 0.2], [-1, 0.19]],
    strobe: [[0.04, -0.98], [0, 1]],
};

export const HIGHPORT_ART: Record<string, HighportArt> = { A: ART_A, B: ART_B, C: ART_C, D: ART_E, E: ART_E };

/** js/system_viewer.js:4367. A class without art uses E's. */
export function highportArt(cls: string): HighportArt {
    return HIGHPORT_ART[cls] || ART_E;
}

export type Port = {
    cls: string;
    /** Class A and B carry the cooler light (planet_profile.js:265). */
    major: boolean;
};

/**
 * js/planet_profile.js:257-265. A highport exists only where the world's starport profile
 * says so ("A-HY:DY:+5": highport yes); none is assumed without a profile.
 */
export function highportOf(body: Record<string, any> | null | undefined): Port | null {
    if (!body) return null;
    const profile = /^([A-EX])-H([YN]):D([YN])/.exec(String(body.starportProfile || ''));
    if (!profile || profile[2] !== 'Y') return null;
    const cls = String(body.starport || (typeof body.uwp === 'string' ? body.uwp[0] : '') || 'X').toUpperCase();
    return { cls, major: cls === 'A' || cls === 'B' };
}

/**
 * js/system_viewer.js:4337-4341. A circular orbit at 1.06 world radii from the world's own
 * size and gravity; ninety minutes when either is missing.
 */
export function highportPeriodYears(body: Record<string, any>): number {
    const radiusM = Number(body.diamKm) > 0 ? body.diamKm * 500 : null;
    const g = Number(body.gravity) > 0 ? body.gravity * 9.81 : null;
    const seconds = radiusM && g ? 2 * Math.PI * Math.sqrt(Math.pow(radiusM * 1.06, 3) / (g * radiusM * radiusM)) : 90 * 60;
    return seconds / (365.25 * 86400);
}

/** js/system_viewer.js:4423. A world drawn smaller than this shows no station. */
export const HIGHPORT_MIN_WORLD_PX = 1.5;

/** js/system_viewer.js:4426. */
export function highportOrbitRadius(worldR: number): number {
    return Math.max(worldR * 1.3, worldR + 7);
}

/** js/system_viewer.js:4461. Half the station's width on screen. */
export function highportSize(worldR: number): number {
    return Math.max(4, Math.min(18, worldR * 0.24));
}

/** js/system_viewer.js:4380. One kept downscale per on-screen width, in steps of four pixels. */
export function spriteWidth(widthPx: number): number {
    return Math.max(4, Math.min(320, Math.ceil(widthPx / 4) * 4));
}

/** js/system_viewer.js:4408. Radians per second of wall time the drawn station may turn. */
export const HIGHPORT_MAX_RATE = 1.1;

export type Chase = { angle: number; want: number };

/**
 * js/system_viewer.js:4406-4417. The drawn angle follows the true one at up to
 * HIGHPORT_MAX_RATE and falls behind past that, so a fast clock does not make the station
 * strobe round its world. Returns the angle to draw and updates the state.
 */
export function chaseAngle(state: Chase | null, want: number, frameSeconds: number): { state: Chase; angle: number } {
    if (!state) return { state: { angle: want, want }, angle: want };
    const delta = want - state.want;
    const cap = HIGHPORT_MAX_RATE * Math.max(frameSeconds, 1 / 240);
    const angle = state.angle + Math.max(-cap, Math.min(cap, delta));
    return { state: { angle, want }, angle };
}

/** The plane the station circles in: two unit vectors, x, y, and z toward the viewer. */
export type Basis = { e1: [number, number, number]; e2: [number, number, number] };

/** js/system_viewer.js:4424-4425: without the planet renderer the station circles in the picture plane. */
export const FLAT_BASIS: Basis = { e1: [1, 0, 0], e2: [0, 1, 0] };

export type HighportAt = {
    x: number;
    y: number;
    /** On the far side of the world: drawn before the world, and hidden when the disc covers it. */
    behind: boolean;
    hidden: boolean;
    /**
     * In the world's shadow, as legacy decides it: the hull goes dark, the lights stay on. The
     * painter fades between the two with layout.ts shadowCover instead of switching on this.
     */
    shaded: boolean;
};

/** js/system_viewer.js:4427-4458. Where the station is, for a world at (x, y) of radius r. */
export function highportPlace(
    x: number, y: number, r: number, angle: number, starX: number, starY: number, basis: Basis = FLAT_BASIS,
): HighportAt {
    const orbitR = highportOrbitRadius(r);
    const vx = Math.cos(angle) * basis.e1[0] + Math.sin(angle) * basis.e2[0];
    const vy = Math.cos(angle) * basis.e1[1] + Math.sin(angle) * basis.e2[1];
    const vz = Math.cos(angle) * basis.e1[2] + Math.sin(angle) * basis.e2[2];
    const sx = x + vx * orbitR;
    const sy = y + vy * orbitR;
    const behind = vz < 0;
    const toStar = Math.atan2(starY - y, starX - x);
    const along = vx * Math.cos(toStar) + vy * Math.sin(toStar);
    const across = Math.abs(-vx * Math.sin(toStar) + vy * Math.cos(toStar)) * orbitR;
    return {
        x: sx,
        y: sy,
        behind,
        hidden: behind && Math.hypot(sx - x, sy - y) < r,
        shaded: along < 0 && across < r,
    };
}
