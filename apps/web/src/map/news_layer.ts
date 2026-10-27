/**
 * How fast news travels: the ripple's layer (spec_xboat_ripples.md §3.2; streams/D.md XD1). Lane A's
 * news/arrivals.ts says when news from one system reaches every other (earliest, likely, latest, in
 * days); this says what the chart shows at a scrubbed day `t` and draws it on a canvas of its own over
 * the chart, in `--chart-news`, with the chart's every frame:
 * - a system the news has reached is ringed (a dot zoomed out), fading with the age of the news;
 * - a system it may have reached (earliest ≤ t < latest) is drawn at half that strength;
 * - along each X-boat line the news runs from the nearer system towards the farther, as far as it
 *   has got by `t`; a line it has crossed is drawn whole.
 * Zoomed out the discs are dots. Nothing here is a rule: the days are A's, from the rules file.
 *
 * The reverse (§3.5, mode 'to'): the same run from the party's system, read as how old each
 * system's news is when it reaches the party. No scrubber: every system within the horizon is
 * drawn at once, bright when its news is fresh, faint when old. Hovering a system says its
 * days in a data block (§3.4), in the traffic layer's manner: no text at rest.
 */
import type { ArrivalDays } from '../news/arrivals.ts';
import type { NewsGraph } from '../news/graph.ts';
import { stardate } from '../workspace/stardate.ts';
import { toScreen, type Camera, type Viewport } from './camera.ts';
import { hexCentre } from './geometry.ts';
import { PPP_GRID } from './tiers.ts';
import { blockPlace, fitLabel } from './traffic.ts';

/** From a system outwards, or towards the party (the reverse). */
export type RippleMode = 'from' | 'to';

/** A ripple as the map holds it: where the news started, when, and what A's run said. */
export type Ripple = {
    source: string;
    /** 'from' when absent. */
    mode?: RippleMode;
    day0: number;
    horizonDays: number;
    graph: NewsGraph;
    arrivals: Map<string, ArrivalDays>;
};

/** How far along a line news has run at `t`: 0 before it leaves, 1 once it has arrived. */
export function edgeProgress(fromDay: number, toDay: number, t: number): number {
    if (!(toDay > fromDay)) return t >= toDay ? 1 : 0;
    if (t <= fromDay) return 0;
    if (t >= toDay) return 1;
    return (t - fromDay) / (toDay - fromDay);
}

/** Fresh news is bright, old news faint: from 0.95 just arrived to 0.35 at the horizon's age. */
export function ageAlpha(age: number, horizonDays: number): number {
    const share = horizonDays > 0 ? Math.min(1, Math.max(0, age / horizonDays)) : 0;
    return 0.95 - 0.6 * share;
}

export type RippleDisc = { key: string; x: number; y: number; alpha: number; maybe: boolean };
export type RippleLine = { x1: number; y1: number; x2: number; y2: number; whole: boolean };
export type RippleFrame = { discs: RippleDisc[]; lines: RippleLine[] };

/** What the chart shows at day `t`, in map units. Pure. */
export function rippleFrame(ripple: Ripple, t: number): RippleFrame {
    const { graph, arrivals, horizonDays } = ripple;
    const discs: RippleDisc[] = [];
    const likely: (number | null)[] = graph.nodes.map((node) => {
        const days = arrivals.get(node.key);
        return days ? days.likely : null;
    });
    graph.nodes.forEach((node, i) => {
        const days = arrivals.get(node.key);
        if (!days || days.earliest === null || days.earliest > t) return;
        const sure = days.latest !== null && days.latest <= t;
        const reached = likely[i] !== null && (likely[i] as number) <= t;
        const age = reached ? t - (likely[i] as number) : 0;
        const at = hexCentre(node.q, node.r);
        discs.push({ key: node.key, x: at.x, y: at.y, alpha: ageAlpha(age, horizonDays) * (sure ? 1 : 0.5), maybe: !sure });
    });
    const lines: RippleLine[] = [];
    for (let u = 0; u < graph.nodes.length; u++) {
        const from = likely[u];
        if (from === null || from > t) continue;
        for (let k = graph.offsets[u]; k < graph.offsets[u + 1]; k++) {
            if (graph.kinds[k] !== 0) continue;
            const v = graph.targets[k];
            const to = likely[v];
            // Each line once, in the direction the news runs: from the nearer system to the farther.
            if (to === null || to <= from) continue;
            const share = edgeProgress(from, to, t);
            if (share <= 0) continue;
            const a = hexCentre(graph.nodes[u].q, graph.nodes[u].r);
            const b = hexCentre(graph.nodes[v].q, graph.nodes[v].r);
            lines.push({ x1: a.x, y1: a.y, x2: a.x + (b.x - a.x) * share, y2: a.y + (b.y - a.y) * share, whole: share >= 1 });
        }
    }
    return { discs, lines };
}

/**
 * The reverse at once: every system whose news reaches the party within the horizon, bright when
 * it is fresh and faint when old, and the X-boat lines it comes by, whole. Pure.
 */
export function reverseFrame(ripple: Ripple): RippleFrame {
    const { graph, arrivals, horizonDays } = ripple;
    const likely: (number | null)[] = graph.nodes.map((node) => {
        const days = arrivals.get(node.key);
        return days && days.likely !== null && days.likely <= horizonDays ? days.likely : null;
    });
    const discs: RippleDisc[] = [];
    graph.nodes.forEach((node, i) => {
        const age = likely[i];
        if (age === null) return;
        const at = hexCentre(node.q, node.r);
        discs.push({ key: node.key, x: at.x, y: at.y, alpha: ageAlpha(age, horizonDays), maybe: false });
    });
    const lines: RippleLine[] = [];
    for (let u = 0; u < graph.nodes.length; u++) {
        const from = likely[u];
        if (from === null) continue;
        for (let k = graph.offsets[u]; k < graph.offsets[u + 1]; k++) {
            if (graph.kinds[k] !== 0) continue;
            const v = graph.targets[k];
            const to = likely[v];
            if (to === null || to <= from) continue;
            const a = hexCentre(graph.nodes[u].q, graph.nodes[u].r);
            const b = hexCentre(graph.nodes[v].q, graph.nodes[v].r);
            lines.push({ x1: a.x, y1: a.y, x2: b.x, y2: b.y, whole: true });
        }
    }
    return { discs, lines };
}

/** The frame for the ripple's mode: the scrubbed day forwards, everything at once in reverse. */
export function frameFor(ripple: Ripple, t: number): RippleFrame {
    return ripple.mode === 'to' ? reverseFrame(ripple) : rippleFrame(ripple, t);
}

/** The system at global hex `q, r`, when it is one of the ripple's: its key and where it is. */
export function nodeAt(ripple: Ripple, q: number, r: number): { key: string; x: number; y: number } | null {
    const node = ripple.graph.nodes.find((item) => item.q === q && item.r === r);
    if (!node) return null;
    const at = hexCentre(node.q, node.r);
    return { key: node.key, x: at.x, y: at.y };
}

const daysWord = (n: number): string => n + (n === 1 ? ' day' : ' days');

/**
 * The hover's sentence for one system (§3.4). `source` names where the news starts (in reverse,
 * the party's system); `here` names the hovered one. Whole days, as the date counts them: news
 * that arrives 17.6 days on arrives on day 17.
 */
export function newsHoverWords(ripple: Ripple, key: string, names: { source: string; here: string }): string {
    const days = ripple.arrivals.get(key);
    const likely = days && days.likely !== null && days.likely <= ripple.horizonDays ? Math.floor(days.likely) : null;
    if (ripple.mode === 'to') {
        if (key === ripple.source) return 'The party is here, at ' + names.source + '.';
        if (likely === null) return 'News from ' + names.here + ' has not reached ' + names.source + ' by day ' + ripple.horizonDays + '.';
        return 'News from ' + names.here + ' reaches ' + names.source + ' in ' + daysWord(likely) + '.';
    }
    if (key === ripple.source) return 'News starts at ' + names.source + ' on ' + stardate(ripple.day0).date + '.';
    if (!days || likely === null) return 'News from ' + names.source + ' has not reached here by day ' + ripple.horizonDays + '.';
    const range: string[] = [];
    if (days.earliest !== null) range.push('Earliest ' + Math.floor(days.earliest));
    if (days.latest !== null && days.latest <= ripple.horizonDays) range.push('latest ' + Math.floor(days.latest));
    return 'News from ' + names.source + ' arrives here on ' + stardate(ripple.day0 + likely).date + ', ' + daysWord(likely) + ' later.'
        + (range.length ? ' ' + range.join(', ') + '.' : '');
}

/** A hovered system's data block, in map units, and its sentence. */
export type NewsHover = { x: number; y: number; words: string };

/** The ink: the news colour, the chart's dark for the plate, the data type. */
export type NewsInk = { line: string; bg: string; font: string };

const BLOCK_FONT = 11;
const BLOCK_H = 18;
const BLOCK_PAD = 6;
const BLOCK_ALPHA = 0.9;

/** The layer's own canvas. It takes no pointer: the chart under it is clicked as before. */
export class NewsLayer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private drawn = false;

    constructor(canvas: HTMLCanvasElement) {
        this.canvas = canvas;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('NewsLayer: no 2D context');
        this.ctx = ctx;
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr > 0 ? dpr : 1;
        const w = Math.max(1, Math.round(width * this.dpr));
        const h = Math.max(1, Math.round(height * this.dpr));
        if (this.canvas.width !== w) this.canvas.width = w;
        if (this.canvas.height !== h) this.canvas.height = h;
        this.drawn = true;
    }

    /** One frame at the device's full resolution; nothing (cleared once) when there is no ripple. */
    draw(cam: Camera, vp: Viewport, frame: RippleFrame | null, ink: NewsInk, hover: NewsHover | null = null): void {
        const ctx = this.ctx;
        if (!frame) {
            if (!this.drawn) return;
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
            this.drawn = false;
            return;
        }
        this.drawn = true;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.width, this.height);
        drawRipple(ctx, cam, vp, frame, ink);
        if (hover) this.block(cam, vp, hover, ink);
        this.canvas.dataset.newsHover = hover ? hover.words : '';
    }

    /** The hovered system's sentence on a dark plate, on a leader from the system, as a track's is. */
    private block(cam: Camera, vp: Viewport, hover: NewsHover, ink: NewsInk): void {
        const ctx = this.ctx;
        const at = toScreen(cam, vp, hover.x, hover.y);
        ctx.font = BLOCK_FONT + 'px ' + ink.font;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const said = fitLabel(hover.words, (text) => ctx.measureText(text).width, Math.max(80, this.width - 4 * BLOCK_PAD));
        const w = Math.ceil(ctx.measureText(said).width) + BLOCK_PAD * 2;
        const place = blockPlace(at.sx, at.sy, w, this.width, this.height);
        ctx.globalAlpha = BLOCK_ALPHA;
        ctx.fillStyle = ink.bg;
        ctx.fillRect(place.x, place.y, w, BLOCK_H);
        ctx.globalAlpha = 1;
        ctx.strokeStyle = ink.line;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(place.ax, place.ay);
        ctx.lineTo(place.bx, place.by);
        ctx.stroke();
        ctx.strokeRect(place.x + 0.5, place.y + 0.5, w - 1, BLOCK_H - 1);
        ctx.fillStyle = ink.line;
        ctx.fillText(said, place.x + BLOCK_PAD, place.y + BLOCK_H / 2 + 0.5);
    }
}

/** The ripple's lines and discs into any context in CSS pixels: the layer's frame, and a saved image (DP1). */
export function drawRipple(ctx: CanvasRenderingContext2D, cam: Camera, vp: Viewport, frame: RippleFrame, ink: NewsInk): void {
    ctx.strokeStyle = ink.line;
    ctx.fillStyle = ink.line;
    ctx.lineCap = 'round';
    ctx.lineWidth = cam.ppp >= PPP_GRID ? 3 : 2;
    ctx.globalAlpha = 0.9;
    ctx.beginPath();
    for (const line of frame.lines) {
        const a = toScreen(cam, vp, line.x1, line.y1);
        const b = toScreen(cam, vp, line.x2, line.y2);
        ctx.moveTo(a.sx, a.sy);
        ctx.lineTo(b.sx, b.sy);
    }
    ctx.stroke();
    // At the hex zoom a ring round the world (this layer is over the chart, so a filled disc would
    // hide the world); further out, a dot over the system's own.
    const near = cam.ppp >= PPP_GRID;
    const r = near ? Math.max(7, cam.ppp * 0.36) : Math.max(2.5, cam.ppp * 0.3);
    ctx.lineWidth = near ? 3 : 2;
    for (const disc of frame.discs) {
        const at = toScreen(cam, vp, disc.x, disc.y);
        if (at.sx < -r || at.sy < -r || at.sx > vp.width + r || at.sy > vp.height + r) continue;
        ctx.globalAlpha = disc.alpha;
        ctx.beginPath();
        ctx.arc(at.sx, at.sy, r, 0, Math.PI * 2);
        if (near) ctx.stroke();
        else ctx.fill();
    }
    ctx.globalAlpha = 1;
}
