/**
 * The orbit picture's colours, fonts and durations, read from tokens.css. No colour literal
 * lives in this file: the legacy alphas (js/system_viewer.js, cited per field) are applied to
 * token colours here, once, so the painter builds no colour strings per frame.
 */
import type { Tone } from './layout.ts';

/** A star's paint (3414-3437): the disc colour, its corona stops and its rim. */
export type StarPaint = { solid: string; glow: string; clear: string; rim: string };

/** One highport light colour, at the alphas the station uses (4479-4498). */
export type PortPaint = {
    washLit: [string, string, string];
    washDark: [string, string, string];
    hub: [string, string, string];
};

export type OrbitTheme = {
    space: string;
    spaceClear: string;
    starCore: string;
    stars: Record<string, StarPaint>;
    starUnknown: StarPaint;
    /** Backdrop star colours (3255). */
    field: string[];
    /** Backdrop glows: five palettes of three [colour at 5%, colour at 0] pairs (3248-3254, 3281-3283). */
    nebulae: [string, string][][];
    hzEdge: string;
    hzMid: string;
    hzLine: string;
    jump: string;
    /** Orbit paths, drawn at the ring strength (3226, 4547, 2961). */
    pathBase: string;
    /** The habitable panel behind a body in a line-up (2623). */
    hzPanel: string;
    /** A belt's rocks in a line-up (2507). */
    rock: string;
    /** The scan sweep's wedge: clear, then its faint trailing edge (2114-2117). */
    scanWedge: [string, string];
    tones: Record<Tone, string>;
    moon: string;
    ring: string;
    beltBand: string;
    night: string;
    shadow: [string, string, string];
    mainworld: string;
    text: string;
    textMuted: string;
    lock: string;
    lockGlow: [string, string];
    signal: string;
    tag: string;
    port: { major: PortPaint; minor: PortPaint };
    portStarboard: [string, string, string];
    portPort: [string, string, string];
    portStrobe: [string, string, string];
    portShade: string;
    portPath: string;
    fontText: string;
    fontCode: string;
    /** Seconds. */
    tLock: number;
    tPulse: number;
    tSweep: number;
    /**
     * Scan and mainworld toggle length in seconds, from --t-base. Absent (a test theme, a
     * missing token), that toggle snaps.
     */
    tBase?: number;
    /**
     * Bands, rings, paths and the day/night sweep, from --t-slow. Absent, those snap.
     */
    tSlow?: number;
    /**
     * The moon wireframe sweep, from --t-long. Absent, that toggle snaps.
     */
    tLong?: number;
    /** --ease-out as four cubic-bezier controls. Absent, a toggle snaps. */
    easeOut?: EaseOut | null;
};

/** The four controls of a CSS cubic-bezier(). */
export type EaseOut = readonly [number, number, number, number];

/** Milliseconds, for the stage's camera moves and the move between layouts. */
export type OrbitMotion = { hop: number; flight: number; lineup: number };

/**
 * A token colour at an alpha, as an rgba() string. Reads #rgb, #rrggbb and #rrggbbaa (an
 * alpha already on the token is multiplied). Any other form is returned as it is.
 */
export function withAlpha(colour: string, alpha: number): string {
    const raw = colour.trim();
    if (raw.charAt(0) !== '#') return raw;
    let digits = raw.slice(1);
    if (digits.length === 3 || digits.length === 4) digits = digits.split('').map((d) => d + d).join('');
    if (digits.length !== 6 && digits.length !== 8) return raw;
    const value = Number.parseInt(digits, 16);
    if (!Number.isFinite(value)) return raw;
    const rgb = digits.length === 8 ? Math.floor(value / 256) : value;
    const own = digits.length === 8 ? (value % 256) / 255 : 1;
    const r = Math.floor(rgb / 65536) % 256;
    const g = Math.floor(rgb / 256) % 256;
    const b = rgb % 256;
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + Number((alpha * own).toFixed(3)) + ')';
}

export function cssSeconds(raw: string): number {
    const value = raw.trim();
    if (value.endsWith('ms')) return Number(value.slice(0, -2)) / 1000;
    if (value.endsWith('s')) return Number(value.slice(0, -1));
    return 0;
}

/** `cubic-bezier(x1, y1, x2, y2)`, including controls written `.2` with no leading zero. */
export function cssBezier(raw: string): EaseOut | null {
    const match = raw.trim().match(/^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/);
    if (!match) return null;
    const x1 = Number(match[1]);
    const y1 = Number(match[2]);
    const x2 = Number(match[3]);
    const y2 = Number(match[4]);
    if (![x1, y1, x2, y2].every(Number.isFinite)) return null;
    return [x1, y1, x2, y2];
}

/**
 * The y of a cubic-bezier at time t. Endpoints are 0 and 1. The controls come from the token
 * (cssBezier); this only evaluates them.
 */
export function easeOutAt(curve: EaseOut, t: number): number {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const [x1, y1, x2, y2] = curve;
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;
    const sampleX = (s: number) => ((ax * s + bx) * s + cx) * s;
    const sampleY = (s: number) => ((ay * s + by) * s + cy) * s;
    const sampleDX = (s: number) => (3 * ax * s + 2 * bx) * s + cx;
    let s = t;
    for (let i = 0; i < 6; i++) {
        const dx = sampleX(s) - t;
        const deriv = sampleDX(s);
        if (Math.abs(dx) < 1e-6 || Math.abs(deriv) < 1e-6) break;
        s -= dx / deriv;
    }
    return sampleY(Math.min(1, Math.max(0, s)));
}

const STAR_TYPES = ['O', 'B', 'A', 'F', 'G', 'K', 'M', 'D', 'BD'];
/** js/system_viewer.js:3255: O, A, F, G, G, K, M. */
const FIELD_TYPES = ['o', 'a', 'f', 'g', 'g', 'k', 'm'];

function starPaint(colour: string): StarPaint {
    // 3421-3422 (corona aa → 00) and 3431-3433 (disc → bb).
    return { solid: colour, glow: withAlpha(colour, 0.667), clear: withAlpha(colour, 0), rim: withAlpha(colour, 0.733) };
}

function portPaint(colour: string, hub: string): PortPaint {
    return {
        washLit: [withAlpha(colour, 0.34), withAlpha(colour, 0.12), withAlpha(colour, 0)],
        washDark: [withAlpha(colour, 0.22), withAlpha(colour, 0.08), withAlpha(colour, 0)],
        hub: [withAlpha(hub, 0.6), withAlpha(colour, 0.25), withAlpha(colour, 0)],
    };
}

/** A lamp (4500-4508): halo centre at 40%, halo edge clear, the lamp itself at 95%. */
function lampPaint(colour: string): [string, string, string] {
    return [withAlpha(colour, 0.4), withAlpha(colour, 0), withAlpha(colour, 0.95)];
}

export function readOrbitTheme(el: HTMLElement): OrbitTheme {
    const style = getComputedStyle(el);
    const token = (name: string): string => style.getPropertyValue(name).trim();
    const stars: Record<string, StarPaint> = {};
    for (const type of STAR_TYPES) stars[type] = starPaint(token('--star-' + type.toLowerCase()));
    const nebulae: [string, string][][] = [];
    for (let i = 1; i <= 5; i++) {
        nebulae.push(['a', 'b', 'c'].map((part): [string, string] => {
            const colour = token('--nebula-' + i + '-' + part);
            return [withAlpha(colour, 0.05), withAlpha(colour, 0)];
        }));
    }
    const light = token('--glyph-light');
    const space = token('--orbit-space');
    const hz = token('--orbit-hz');
    const path = token('--signal-dim');
    const lock = token('--orbit-lock');
    const shadow = token('--orbit-shadow');
    const hub = token('--port-hub');
    return {
        space,
        spaceClear: withAlpha(space, 0),
        starCore: light,
        stars,
        starUnknown: starPaint(light),
        field: FIELD_TYPES.map((type) => token('--star-' + type)),
        nebulae,
        // 3342-3344, 3375.
        hzEdge: withAlpha(hz, 0.16),
        hzMid: withAlpha(hz, 0.28),
        hzLine: withAlpha(hz, 0.8),
        jump: withAlpha(token('--orbit-jump'), 0.95),
        pathBase: path,
        hzPanel: withAlpha(hz, 0.2),
        rock: token('--orbit-rock'),
        scanWedge: [withAlpha(token('--signal'), 0), withAlpha(token('--signal'), 0.035)],
        tones: {
            gasLarge: token('--orbit-gas-large'),
            gasMedium: token('--orbit-gas-medium'),
            gasSmall: token('--orbit-gas-small'),
            belt: token('--orbit-belt'),
            world: token('--orbit-world'),
        },
        moon: token('--orbit-moon'),
        ring: withAlpha(token('--orbit-ring'), 0.667),
        beltBand: withAlpha(token('--orbit-belt'), 0.333),
        night: withAlpha(token('--orbit-night'), 0.72),
        // 4597-4599.
        shadow: [withAlpha(shadow, 0.94), withAlpha(shadow, 0.82), withAlpha(shadow, 0.28)],
        mainworld: token('--signal'),
        text: token('--text-1'),
        textMuted: token('--text-muted'),
        lock,
        lockGlow: [withAlpha(lock, 0.16), withAlpha(lock, 0)],
        signal: token('--signal'),
        tag: withAlpha(token('--orbit-tag'), 0.82),
        port: {
            major: portPaint(token('--port-light-major'), hub),
            minor: portPaint(token('--port-light-minor'), hub),
        },
        portStarboard: lampPaint(token('--port-nav-starboard')),
        portPort: lampPaint(token('--port-nav-port')),
        portStrobe: lampPaint(light),
        portShade: withAlpha(token('--port-shade'), 0.5),
        portPath: withAlpha(token('--port-path'), 0.18),
        fontText: token('--font-text'),
        fontCode: token('--font-code'),
        tLock: cssSeconds(token('--t-lock')),
        tPulse: cssSeconds(token('--t-pulse')),
        tSweep: cssSeconds(token('--t-sweep')),
        tBase: cssSeconds(token('--t-base')),
        tSlow: cssSeconds(token('--t-slow')),
        tLong: cssSeconds(token('--t-long')),
        easeOut: cssBezier(token('--ease-out')),
    };
}

/** The camera moves: a hop is --t-slow, a flight is --t-long (tokens.css names both for the camera); a layout change is --t-lineup. */
export function readOrbitMotion(el: HTMLElement): OrbitMotion {
    const style = getComputedStyle(el);
    return {
        hop: cssSeconds(style.getPropertyValue('--t-slow')) * 1000,
        flight: cssSeconds(style.getPropertyValue('--t-long')) * 1000,
        lineup: cssSeconds(style.getPropertyValue('--t-lineup')) * 1000,
    };
}
