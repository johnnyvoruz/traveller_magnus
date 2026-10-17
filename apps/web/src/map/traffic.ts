/**
 * Ships as tracks on a traffic scope (prompts/d_traffic_display.md). The chart is the dim underlay;
 * each ship is a small hard-edged diamond, the same size on screen at every zoom, cased in the
 * chart's dark so it reads on any fill. Someone else's ship is an open diamond in --chart-traffic;
 * one of yours is filled in --signal. An inner diamond means more than one ship here.
 *
 * An invisible sweep turns round the middle of the view once every SWEEP_MS. As it passes a track,
 * the track paints: full brightness and a swell, fading back to rest like phosphor. Nothing else on
 * the chart moves. No text at rest: a track under the mouse shows a data block.
 *
 * This layer is its own canvas over the chart's. It is drawn when the chart is (the tracks move
 * with the camera) and on its own clock at most 30 times a second for the sweep, and it never asks
 * the chart to redraw. It stops when the tab is hidden, and with reduced motion it does not run.
 */
import { cancelFrame, createCanvas, nextFrame, now, prefersReducedMotion } from '../platform/browser.ts';

/** The diamond, corner to corner, in pixels at every zoom. */
export const TRACK_PX = 12;
/** Its stroke, and the dark casing on each side of the stroke. */
export const TRACK_STROKE = 2;
export const TRACK_CASE = 1.5;
const TRACK_CASE_ALPHA = 0.9;
/** The inner diamond of "more than one here", as a share of the outer. */
export const TRACK_INNER = 0.42;
/** Side by side on one hex: centre to centre. */
export const TRACK_STEP = 15;
/** Diamonds on one hex. Past it, a fourth with an inner diamond stands for the rest. */
export const TRACK_SHOWN = 3;
/** Zoomed out, tracks closer than this on screen become one. */
export const TRACK_MERGE_PX = 12;
/** One turn of the sweep, how long a painted track takes to fade back, and how it rests. */
export const SWEEP_MS = 6000;
export const PAINT_MS = 1200;
export const REST_ALPHA = 0.75;
export const SWELL = 1.5;
/** The layer's own clock: at most 30 frames a second. */
export const FRAME_MS = 1000 / 30;
/** Sizes between rest and full swell that each kind of track is drawn at once, ahead, and stamped from. */
export const SPRITE_STEPS = 6;
/** The selected track's bracket: its half side beyond the diamond, and the length of each arm. */
const BRACKET_GAP = 5;
const BRACKET_ARM = 5;
/** The data block: its type, height, padding, and the leader from the diamond to it. */
const BLOCK_FONT = 11;
const BLOCK_H = 18;
const BLOCK_PAD = 6;
const BLOCK_ALPHA = 0.9;
const LEADER = 9;
const EDGE = 4;
/** A longer name is cut with an ellipsis in the block; the card says it whole. */
const BLOCK_MAX = 260;

export type TrackBox = { x0: number; y0: number; x1: number; y1: number };

/** The label cut to fit `max` pixels, with an ellipsis when it was cut. */
export function fitLabel(label: string, width: (text: string) => number, max: number): string {
    if (width(label) <= max) return label;
    let keep = label.length;
    while (keep > 1 && width(label.slice(0, keep).trimEnd() + '…') > max) keep -= 1;
    return label.slice(0, keep).trimEnd() + '…';
}

/** One symbol on the layer, in the chart canvas's pixels. */
export type Track = {
    key: string;
    /** Filled, in the party colour: one of yours. Open, in the traffic colour: someone else's. */
    mine: boolean;
    x: number;
    y: number;
    /** An inner diamond: more than one ship here. */
    many: boolean;
    /** The data block's words on hover. Null shows none. */
    label: string | null;
    /** Not drawn: the lead's chevron is the chart's own marker, and only its hover block is here. */
    ghost?: boolean;
};

export type TrafficInk = { traffic: string; own: string; bg: string; font: string };

export type TrackPaint = { alpha: number; scale: number };

/** The sweep's bearing at a time: once round every SWEEP_MS, clockwise from twelve o'clock. */
export function sweepBearing(t: number): number {
    const turn = (((t % SWEEP_MS) + SWEEP_MS) % SWEEP_MS) / SWEEP_MS;
    return turn * Math.PI * 2 - Math.PI / 2;
}

/**
 * How bright and how large a track is drawn at a time: at full and SWELL times its size the
 * moment the sweep crosses its bearing from the middle (cx, cy), back to rest over PAINT_MS.
 * With reduced motion (`still`) every track rests at full brightness.
 */
export function trackPaint(t: number, x: number, y: number, cx: number, cy: number, still: boolean): TrackPaint {
    if (still) return { alpha: 1, scale: 1 };
    const bearing = Math.atan2(y - cy, x - cx);
    let lag = (sweepBearing(t) - bearing) / (Math.PI * 2);
    lag -= Math.floor(lag);
    const since = lag * SWEEP_MS;
    if (since >= PAINT_MS) return { alpha: REST_ALPHA, scale: 1 };
    const k = 1 - since / PAINT_MS;
    return { alpha: REST_ALPHA + (1 - REST_ALPHA) * k, scale: 1 + (SWELL - 1) * k * k };
}

/**
 * Points closer than `px` on screen, gathered: each group keeps its first member's place, so the
 * caller lists the one that should stand for a group first. Groups come back in that order.
 */
export function mergeTracks<T extends { x: number; y: number }>(items: readonly T[], px: number = TRACK_MERGE_PX): T[][] {
    const cells = new Map<string, { x: number; y: number; members: T[] }[]>();
    const groups: { x: number; y: number; members: T[] }[] = [];
    for (const item of items) {
        const gx = Math.floor(item.x / px);
        const gy = Math.floor(item.y / px);
        let home: { x: number; y: number; members: T[] } | null = null;
        for (let dx = -1; dx <= 1 && !home; dx += 1) {
            for (let dy = -1; dy <= 1 && !home; dy += 1) {
                const near = cells.get(String(gx + dx) + ',' + String(gy + dy));
                if (!near) continue;
                for (const group of near) {
                    if (Math.hypot(group.x - item.x, group.y - item.y) < px) {
                        home = group;
                        break;
                    }
                }
            }
        }
        if (home) {
            home.members.push(item);
            continue;
        }
        const group = { x: item.x, y: item.y, members: [item] };
        groups.push(group);
        const cell = String(gx) + ',' + String(gy);
        const list = cells.get(cell);
        if (list) list.push(group);
        else cells.set(cell, [group]);
    }
    return groups.map((group) => group.members);
}

/** A leg of a ship's route: system hex keys at both ends. */
export type RouteLeg = { from: string; to: string };

type Point = { x: number; y: number };

/**
 * A route's legs as screen polylines, in order: a leg that starts where the last one ended
 * continues its line; any other starts a new one. A leg that stays on its hex, or whose ends are
 * not on the chart, draws nothing.
 */
export function routeChains(legs: readonly RouteLeg[], at: (key: string) => Point | null): Point[][] {
    const chains: Point[][] = [];
    let last: { key: string; chain: Point[] } | null = null;
    for (const leg of legs) {
        if (leg.from === leg.to) continue;
        const a = at(leg.from);
        const b = at(leg.to);
        if (!a || !b) {
            last = null;
            continue;
        }
        if (last && last.key === leg.from) {
            last.chain.push(b);
        } else {
            const chain = [a, b];
            chains.push(chain);
            last = { key: leg.to, chain };
        }
        last.key = leg.to;
    }
    return chains;
}

/**
 * The arrowhead at the end of the last chain, pointing along its last segment: the tip on the
 * hex, then the two barbs. `length` is the head's length along the line; it is two thirds as wide.
 * Null when there is no segment.
 */
export function arrowHead(chains: readonly Point[][], length: number): [Point, Point, Point] | null {
    const chain = chains[chains.length - 1];
    if (!chain || chain.length < 2) return null;
    const tip = chain[chain.length - 1];
    const from = chain[chain.length - 2];
    const dx = tip.x - from.x;
    const dy = tip.y - from.y;
    const run = Math.hypot(dx, dy);
    if (run === 0) return null;
    const ux = dx / run;
    const uy = dy / run;
    const half = length / 3;
    const bx = tip.x - ux * length;
    const by = tip.y - uy * length;
    return [tip, { x: bx - uy * half, y: by + ux * half }, { x: bx + uy * half, y: by - ux * half }];
}

/** A track's box for a mouse: the diamond and its casing. */
export function trackBox(x: number, y: number): TrackBox {
    const r = TRACK_PX / 2 + TRACK_STROKE / 2 + TRACK_CASE;
    return { x0: x - r, y0: y - r, x1: x + r, y1: y + r };
}

/**
 * Where a data block of `w` pixels goes: up and to the right of the track along a short leader,
 * clear of the hex's name and profile below it. Left instead where the right has no room; under
 * instead where the top has none. `ax, ay` is where the leader leaves the diamond, `bx, by` where it
 * meets the plate, and `x, y` is the plate's top left.
 */
export function blockPlace(tx: number, ty: number, w: number, width: number, height: number): { ax: number; ay: number; bx: number; by: number; x: number; y: number } {
    const h = TRACK_PX / 2;
    const right = tx + h + LEADER + w <= width - EDGE;
    const up = ty - h - LEADER - BLOCK_H >= EDGE;
    const sx = right ? 1 : -1;
    const sy = up ? -1 : 1;
    const ax = tx + (sx * h) / 2;
    const ay = ty + (sy * h) / 2;
    const bx = tx + sx * (h + LEADER);
    const by = ty + sy * (h + LEADER);
    const x = right ? bx : bx - w;
    const y = up ? by - BLOCK_H : by;
    return { ax, ay, bx, by, x: Math.max(EDGE, Math.min(x, width - EDGE - w)), y: Math.max(EDGE, Math.min(y, height - EDGE - BLOCK_H)) };
}

function diamond(ctx: CanvasRenderingContext2D, x: number, y: number, h: number): void {
    ctx.moveTo(x, y - h);
    ctx.lineTo(x + h, y);
    ctx.lineTo(x, y + h);
    ctx.lineTo(x - h, y);
    ctx.closePath();
}

/** The dark casing of tracks of one kind and size: one path, on both sides of where the stroke goes. */
function drawCasing(ctx: CanvasRenderingContext2D, tracks: readonly Track[], scale: number, ink: TrafficInk): void {
    const h = (TRACK_PX / 2) * scale;
    const mine = tracks[0].mine;
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = TRACK_CASE_ALPHA;
    ctx.strokeStyle = ink.bg;
    ctx.lineWidth = TRACK_STROKE + TRACK_CASE * 2;
    ctx.beginPath();
    for (const track of tracks) {
        diamond(ctx, track.x, track.y, h);
        if (track.many && !mine) diamond(ctx, track.x, track.y, h * TRACK_INNER);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;
}

/** The open stroke or the filled diamond of tracks of one kind and size, and the inner diamond for many. */
function drawInk(ctx: CanvasRenderingContext2D, tracks: readonly Track[], scale: number, alpha: number, ink: TrafficInk): void {
    const h = (TRACK_PX / 2) * scale;
    const mine = tracks[0].mine;
    const colour = mine ? ink.own : ink.traffic;
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = colour;
    ctx.lineWidth = TRACK_STROKE;
    ctx.beginPath();
    for (const track of tracks) {
        diamond(ctx, track.x, track.y, h);
        if (track.many && !mine) diamond(ctx, track.x, track.y, h * TRACK_INNER);
    }
    if (mine) {
        ctx.fillStyle = colour;
        ctx.fill();
    }
    ctx.stroke();
    const cut = mine ? tracks.filter((track) => track.many) : [];
    if (cut.length > 0) {
        // Yours, more than one: the inner diamond is cut out of the fill in the chart's dark.
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ink.bg;
        ctx.lineWidth = TRACK_STROKE * 0.75;
        ctx.beginPath();
        for (const track of cut) diamond(ctx, track.x, track.y, h * TRACK_INNER);
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
}

/** Tracks of one kind at one brightness and size, as one path per pass: the casing, then the ink. */
export function drawTracks(ctx: CanvasRenderingContext2D, tracks: readonly Track[], paint: TrackPaint, ink: TrafficInk): void {
    if (tracks.length === 0) return;
    drawCasing(ctx, tracks, paint.scale, ink);
    drawInk(ctx, tracks, paint.scale, paint.alpha, ink);
}

/** One track. */
export function drawTrack(ctx: CanvasRenderingContext2D, track: Track, paint: TrackPaint, ink: TrafficInk): void {
    drawTracks(ctx, [track], paint, ink);
}

/** A sprite's side in device pixels: the fullest swell, its stroke and casing, and a margin for the soft edge. */
export function spriteSide(dpr: number): number {
    return Math.ceil((TRACK_PX * SWELL + TRACK_STROKE + TRACK_CASE * 2 + 4) * dpr);
}

/** The swell step a paint is stamped at. */
export function spriteStep(scale: number): number {
    return Math.max(0, Math.min(SPRITE_STEPS, Math.round(((scale - 1) / (SWELL - 1)) * SPRITE_STEPS)));
}

/** One kind of track (yours or theirs, one or many) drawn at every swell step: its casing and its ink apart. */
type SpriteSet = { casing: HTMLCanvasElement[]; ink: HTMLCanvasElement[] };

/** The selected track: four corner brackets round it, cased like the track. */
function drawBracket(ctx: CanvasRenderingContext2D, track: Track, ink: TrafficInk): void {
    const r = TRACK_PX / 2 + BRACKET_GAP;
    ctx.beginPath();
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
        ctx.moveTo(track.x + sx * r, track.y + sy * (r - BRACKET_ARM));
        ctx.lineTo(track.x + sx * r, track.y + sy * r);
        ctx.lineTo(track.x + sx * (r - BRACKET_ARM), track.y + sy * r);
    }
    ctx.lineJoin = 'miter';
    ctx.globalAlpha = TRACK_CASE_ALPHA;
    ctx.strokeStyle = ink.bg;
    ctx.lineWidth = TRACK_STROKE + TRACK_CASE * 2;
    ctx.stroke();
    ctx.globalAlpha = 1;
    ctx.strokeStyle = track.mine ? ink.own : ink.traffic;
    ctx.lineWidth = TRACK_STROKE;
    ctx.stroke();
}

/** The hovered track's data block: its words in capitals on a dark plate, on a leader from the diamond. */
function drawBlock(ctx: CanvasRenderingContext2D, track: Track, ink: TrafficInk, width: number, height: number): void {
    if (!track.label) return;
    const colour = track.mine ? ink.own : ink.traffic;
    ctx.font = BLOCK_FONT + 'px ' + ink.font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    const said = fitLabel(track.label, (text) => ctx.measureText(text).width, BLOCK_MAX);
    const w = Math.ceil(ctx.measureText(said).width) + BLOCK_PAD * 2;
    const at = blockPlace(track.x, track.y, w, width, height);
    ctx.globalAlpha = BLOCK_ALPHA;
    ctx.fillStyle = ink.bg;
    ctx.fillRect(at.x, at.y, w, BLOCK_H);
    ctx.globalAlpha = 1;
    ctx.strokeStyle = colour;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(at.ax, at.ay);
    ctx.lineTo(at.bx, at.by);
    ctx.stroke();
    ctx.strokeRect(at.x + 0.5, at.y + 0.5, w - 1, BLOCK_H - 1);
    ctx.fillStyle = colour;
    ctx.fillText(said, at.x + BLOCK_PAD, at.y + BLOCK_H / 2 + 0.5);
}

/** The ink from tokens.css: the traffic colour, the party's, the chart's dark and the data type. */
export function readTrafficInk(el: HTMLElement): TrafficInk {
    const style = getComputedStyle(el);
    const token = (name: string) => style.getPropertyValue(name).trim();
    return { traffic: token('--chart-traffic'), own: token('--signal'), bg: token('--bg-0'), font: token('--font-data') };
}

/** What the layer runs on; a test hands in its own clock and frames. */
export type TrafficClock = {
    now: () => number;
    frame: (fn: () => void) => number;
    cancel: (id: number) => void;
    still: () => boolean;
    /** Calls back with true when the tab is hidden and false when it shows again. Returns an unsubscribe. */
    onHidden: (fn: (hidden: boolean) => void) => () => void;
    /** A small canvas for the sprites. Without one the tracks are drawn as paths every frame. */
    surface?: (width: number, height: number) => HTMLCanvasElement;
};

function onHiddenChange(fn: (hidden: boolean) => void): () => void {
    if (typeof document === 'undefined') return () => {};
    const listen = () => fn(document.visibilityState === 'hidden');
    document.addEventListener('visibilitychange', listen);
    return () => document.removeEventListener('visibilitychange', listen);
}

const BROWSER_CLOCK: TrafficClock = {
    now,
    frame: (fn) => nextFrame(() => fn()),
    cancel: cancelFrame,
    still: prefersReducedMotion,
    onHidden: onHiddenChange,
    surface: createCanvas,
};

export class TrafficLayer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly clock: TrafficClock;
    private ink: TrafficInk;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private tracks: readonly Track[] = [];
    private selected: string | null = null;
    private hover: string | null = null;
    private raf = 0;
    private last = -Infinity;
    private hidden = false;
    private readonly stopHidden: () => void;
    /** The sprites by kind, made for one device pixel ratio and one ink; null until asked for or after either changes. */
    private sprites: Map<string, SpriteSet> | null = null;
    /** Frames painted, and the last one's time in milliseconds: the report's measure. */
    painted = 0;
    paintMs = 0;

    constructor(canvas: HTMLCanvasElement, ink: TrafficInk, clock: TrafficClock = BROWSER_CLOCK) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('TrafficLayer: 2d context unavailable');
        this.canvas = canvas;
        this.ctx = ctx;
        this.ink = ink;
        this.clock = clock;
        this.stopHidden = clock.onHidden((hidden) => {
            this.hidden = hidden;
            if (hidden) this.halt();
            else this.run();
        });
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        const next = dpr > 0 ? dpr : 1;
        if (next !== this.dpr) this.sprites = null;
        this.dpr = next;
        const devW = Math.max(1, Math.round(width * this.dpr));
        const devH = Math.max(1, Math.round(height * this.dpr));
        if (this.canvas.width !== devW) this.canvas.width = devW;
        if (this.canvas.height !== devH) this.canvas.height = devH;
        this.paint();
    }

    setInk(ink: TrafficInk): void {
        this.ink = ink;
        this.sprites = null;
        this.paint();
    }

    /** The tracks where the chart has just drawn them, and the selected one's key: painted at once. */
    show(tracks: readonly Track[], selected: string | null): void {
        this.tracks = tracks;
        this.selected = selected;
        if (this.hover && !tracks.some((track) => track.key === this.hover)) this.hover = null;
        this.paint();
        this.run();
    }

    /** The track under the mouse, by key; null for none. Only the layer is drawn again. */
    setHover(key: string | null): void {
        if (key === this.hover) return;
        this.hover = key;
        this.paint();
    }

    hoverKey(): string | null {
        return this.hover;
    }

    /** Draws every track at this moment of the sweep. Text only for the hovered track. */
    paint(t: number = this.clock.now()): void {
        const started = this.clock.now();
        this.last = t;
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        if (this.tracks.length === 0) {
            this.canvas.dataset.trafficTracks = '0';
            this.canvas.dataset.trafficHover = '';
            return;
        }
        const still = this.clock.still();
        const cx = this.width / 2;
        const cy = this.height / 2;
        let selected: Track | null = null;
        let hover: Track | null = null;
        const pad = TRACK_PX * SWELL;
        // Someone else's first, then yours on top: every casing of a kind, then every ink, so no casing covers a neighbour.
        for (const mine of [false, true]) {
            const drawn: { track: Track; paint: TrackPaint }[] = [];
            for (const track of this.tracks) {
                if (track.mine !== mine) continue;
                if (track.key === this.selected) selected = track;
                if (track.key === this.hover) hover = track;
                if (track.ghost || track.x < -pad || track.y < -pad || track.x > this.width + pad || track.y > this.height + pad) continue;
                drawn.push({ track, paint: trackPaint(t, track.x, track.y, cx, cy, still) });
            }
            if (drawn.length > 0) this.stamp(drawn);
        }
        if (selected) drawBracket(ctx, selected, this.ink);
        if (hover) drawBlock(ctx, hover, this.ink, this.width, this.height);
        this.painted += 1;
        this.paintMs = this.clock.now() - started;
        this.canvas.dataset.trafficMs = this.paintMs.toFixed(2);
        this.canvas.dataset.trafficTracks = String(this.tracks.length);
        this.canvas.dataset.trafficPainted = String(this.painted);
        this.canvas.dataset.trafficHover = this.hover ?? '';
    }

    /**
     * Tracks of one owner, stamped from their sprites: a raster of hundreds of small paths every frame
     * is what costs, and a stamp is a copy. Without sprites (a test), drawn as paths.
     */
    private stamp(drawn: readonly { track: Track; paint: TrackPaint }[]): void {
        const ctx = this.ctx;
        const sprites = this.spriteSets();
        if (!sprites) {
            for (const item of drawn) drawTrack(ctx, item.track, item.paint, this.ink);
            return;
        }
        const side = spriteSide(this.dpr);
        const css = side / this.dpr;
        const place = (v: number) => Math.round(v * this.dpr - side / 2) / this.dpr;
        for (const pass of ['casing', 'ink'] as const) {
            for (const { track, paint } of drawn) {
                const set = sprites.get(String(track.mine) + String(track.many));
                if (!set) continue;
                ctx.globalAlpha = pass === 'ink' ? paint.alpha : 1;
                ctx.drawImage(set[pass][spriteStep(paint.scale)], place(track.x), place(track.y), css, css);
            }
        }
        ctx.globalAlpha = 1;
    }

    /** Every kind of track at every swell step, drawn once for this ratio and ink. Null where no canvas can be made. */
    private spriteSets(): Map<string, SpriteSet> | null {
        if (this.sprites) return this.sprites;
        const surface = this.clock.surface;
        if (!surface) return null;
        const side = spriteSide(this.dpr);
        const centre = side / 2 / this.dpr;
        const sets = new Map<string, SpriteSet>();
        for (const mine of [false, true]) {
            for (const many of [false, true]) {
                const one: Track = { key: '', mine, many, label: null, x: centre, y: centre };
                const set: SpriteSet = { casing: [], ink: [] };
                for (let step = 0; step <= SPRITE_STEPS; step += 1) {
                    const scale = 1 + ((SWELL - 1) * step) / SPRITE_STEPS;
                    for (const pass of ['casing', 'ink'] as const) {
                        const canvas = surface(side, side);
                        const ctx = canvas.getContext('2d');
                        if (!ctx) return null;
                        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
                        if (pass === 'casing') drawCasing(ctx, [one], scale, this.ink);
                        else drawInk(ctx, [one], scale, 1, this.ink);
                        set[pass].push(canvas);
                    }
                }
                sets.set(String(mine) + String(many), set);
            }
        }
        this.sprites = sets;
        return sets;
    }

    /** The sweep's clock: on while there are tracks, the tab shows and motion is welcome. */
    private run(): void {
        if (this.raf || this.hidden || this.tracks.length === 0 || this.clock.still()) return;
        this.raf = this.clock.frame(this.tick);
    }

    private halt(): void {
        if (this.raf) this.clock.cancel(this.raf);
        this.raf = 0;
    }

    private readonly tick = (): void => {
        this.raf = 0;
        if (this.hidden || this.tracks.length === 0 || this.clock.still()) return;
        const t = this.clock.now();
        // A frame is skipped until a 30th of a second has passed since the last paint.
        if (t - this.last >= FRAME_MS - 1) this.paint(t);
        this.raf = this.clock.frame(this.tick);
    };

    destroy(): void {
        this.halt();
        this.stopHidden();
        this.tracks = [];
    }
}
