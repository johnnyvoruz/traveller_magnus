/**
 * Paints one picture (orbit/picture.ts) on a 2D canvas. For the orbits layout the order is
 * the legacy one (js/system_viewer.js _paintOrrery, 2906-3016): star field, the primary's
 * habitable band, the 100D jump circles, each companion (its orbit, its band, its worlds),
 * the primary's worlds, the stars on top, the scan overlay, the
 * selection lock. A line-up (_drawLineup, 2607-2668) and the move between two layouts are
 * the same passes over a different picture. Where a body sits is the layout's business; this
 * file only draws what the picture says. Every colour comes from the theme.
 *
 * Worlds are flat discs with a night half (the legacy fallback, 4226-4231) until planet
 * imagery lands.
 */
import { shortLabel } from './bodies.ts';
import { backdropBox, backdropShift, paintBackdrop, type BackdropBox } from './backdrop.ts';
import {
    chaseAngle, highportArt, highportPlace, highportSize, spriteWidth, HIGHPORT_MIN_WORLD_PX,
    type Chase, type HighportArt, type Port,
} from './highport.ts';
import {
    arcSpan, bodyOf, hitOf, mainworldMark, selectionLabel, shadowCover, MAX_RING_RADIUS,
    type Hit, type MoonAt, type Plan, type View,
} from './layout.ts';
import { bodyAngle } from './maths.ts';
import {
    PATH_ALPHA_WORLD, type BandAt, type Caption, type JumpAt, type Layers, type Panel, type PathAt,
    type Picture, type Rocks, type StarDraw, type WorldDraw,
} from './picture.ts';
import { discBatch, sunColour, visualRate, type OrbitDiscBatch } from './disc_batch.ts';
import { plotText, type PlotReadout, type ShipMark, type ShipShape } from './ships.ts';
import type { OrbitTheme, PortPaint } from './theme.ts';

const TAU = Math.PI * 2;
/** About three seconds of frames: how long a still picture keeps painting after its last missing tile. */
const SETTLE_FRAMES = 180;

/**
 * The surface service as the painter uses it (directives/handoff.md §61): one batch a frame,
 * then a tile per body. The stage adapts the service's two calls to this; tests pass a fake.
 */
export type DiscPainter = {
    /** The device's surface mode, sent with the batch. */
    mode(): 'vanilla' | 'enhanced';
    /** Submits this frame's batch. It never blocks. Only 'ready' means tiles may be drawn. */
    prepare(batch: OrbitDiscBatch): 'unavailable' | 'pending' | 'ready';
    /**
     * Draws the tile held for a body, centred on (x, y) with radius r in the context's own
     * units. False when there is none: the painter then draws its flat disc.
     */
    draw(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, r: number): boolean;
};

export type RendererDeps = {
    /** An off-screen canvas of the given pixel size, or null where there is none (tests). */
    makeCanvas: ((w: number, h: number) => HTMLCanvasElement) | null;
    /** Starts loading an image and calls done when it can be drawn. */
    loadImage: ((src: string, done: () => void) => CanvasImageSource) | null;
    /** Where the highport paintings are served from, with a trailing slash. */
    artBase: string;
    /** Called when something loaded after a paint: the picture should be painted again. */
    stale: () => void;
    /** Shaded discs. Absent, or answering anything but 'ready', the discs are the flat ones. */
    discs?: DiscPainter | null;
};

export type DrawState = {
    /** The key of the selected body, or null. */
    selected: string | null;
    days: number;
    /** Wall time in milliseconds. */
    time: number;
    /** False under reduced motion: no lock animation, no pulse, lights steady. */
    motion: boolean;
    layers: Layers;
    /** Ship designators. Omitted, the frame is the one without them. */
    ships?: readonly ShipMark[];
    /** Plotting hairlines for this frame only. Omitted or null, the overlay is off. */
    plot?: PlotReadout | null;
};

type Sprite = { lit: HTMLCanvasElement; dark: HTMLCanvasElement };
type ArtImage = { image: CanvasImageSource; ready: boolean };

export class OrbitRenderer {
    private ctx: CanvasRenderingContext2D;
    private theme: OrbitTheme;
    private deps: RendererDeps;
    private w = 0;
    private h = 0;
    private dpr = 1;
    private z = 1;
    private backdrop: { canvas: HTMLCanvasElement; box: BackdropBox; key: string } | null = null;
    private lockKey: string | null = null;
    private lockStart = 0;
    private lockLabel: [string, string] = ['', ''];
    private eclipse = new Map<string, { value: number; at: number }>();
    private chases = new Map<string, Chase>();
    private images = new Map<string, ArtImage>();
    private sprites = new Map<string, Sprite>();
    private lastTime = 0;
    private frameSeconds = 1 / 60;
    private layers: Layers | null = null;
    private pathWidth = 1;
    private scanLabels = new Map<string, string>();
    private scanPlan: Plan | null = null;
    /** The bodies of this frame's batch when the service is ready: key, and whether rings were asked for. */
    private shaded: Map<string, boolean> | null = null;
    private discStatus: 'unavailable' | 'pending' | 'ready' = 'unavailable';
    private lastDays: number | null = null;
    private rate = 0;
    /** A body of this frame's batch had no tile yet. */
    private missing = false;
    /** Frames still to paint after the last missing tile, so sharper tiles can arrive on a still picture. */
    private settling = 0;
    /**
     * True when the discs want another frame: the service is still starting, a tile has not
     * arrived, sharper tiles may follow, or (with motion) the shaded worlds are turning and
     * their clouds drifting. The stage keeps painting while this holds.
     */
    discsBusy = false;
    /** For measuring: the service's last answer and how many tiles the last frame drew, as "ready:19". */
    discsReport = 'none';
    private tilesDrawn = 0;

    constructor(ctx: CanvasRenderingContext2D, theme: OrbitTheme, deps: RendererDeps) {
        this.ctx = ctx;
        this.theme = theme;
        this.deps = deps;
    }

    resize(w: number, h: number, dpr: number): void {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
    }

    draw(plan: Plan, picture: Picture, view: View, state: DrawState): void {
        const ctx = this.ctx;
        this.z = picture.z;
        this.layers = state.layers;
        // 3227: the stroke width follows the ring strength.
        this.pathWidth = 1 + state.layers.pathStrength * 1.5;
        // js/system_viewer.js:2024-2026: a smoothed frame time, for the station's pace.
        if (this.lastTime) {
            const dt = Math.max(0.001, (state.time - this.lastTime) / 1000);
            this.frameSeconds += (Math.min(0.1, dt) - this.frameSeconds) * 0.25;
        }
        this.lastTime = state.time;
        this.prepareDiscs(plan, picture, state);

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        this.starField(plan, view);
        for (const layer of picture.layers) {
            for (const band of layer.bands) this.band(band);
            for (const panel of layer.panels) this.panel(panel);
            for (const ring of layer.jumps) this.jump(ring);
            for (const path of layer.paths) this.path(path);
            for (const rocks of layer.rocks) this.rocks(rocks);
            for (const at of layer.worlds) this.world(plan, at, state);
        }
        for (const at of picture.stars) this.star(at);
        for (const caption of picture.captions) this.caption(caption);
        if (state.layers.scan) this.scan(plan, picture, state);
        this.selection(plan, picture, state);
        this.ships(state.ships);
        this.plot(state.plot);
        this.settleDiscs(state);
    }

    // ---- Shaded discs ---------------------------------------------------------------------

    /**
     * js/system_viewer.js:2672-2681: one batch for the whole frame, before anything is painted.
     * As legacy, discs are shaded only with the Day / night layer on. Whatever the service
     * answers short of 'ready', and whenever there is no service, the frame is the flat one.
     */
    private prepareDiscs(plan: Plan, picture: Picture, state: DrawState): void {
        this.shaded = null;
        this.missing = false;
        this.tilesDrawn = 0;
        this.discStatus = 'unavailable';
        if (this.lastDays !== null) this.rate = visualRate(this.rate, state.days - this.lastDays, this.frameSeconds);
        this.lastDays = state.days;
        const painter = this.deps.discs;
        if (!painter || !state.layers.dayNight) return;
        const primary = plan.stars[0];
        const paint = primary ? (this.theme.stars[String(primary.body.sType || '')] || this.theme.starUnknown) : this.theme.starUnknown;
        const batch = discBatch(plan, picture, { width: this.w, height: this.h, dpr: this.dpr }, {
            days: state.days, timeSeconds: state.time / 1000, rate: this.rate, frameSeconds: this.frameSeconds, motion: state.motion,
        }, {
            mode: painter.mode(), sun: sunColour(paint.solid), lightMode: false, moonsShown: state.layers.moons, selected: state.selected,
        });
        if (!batch.discs.length) return;
        this.discStatus = painter.prepare(batch);
        if (this.discStatus !== 'ready') return;
        this.shaded = new Map(batch.discs.map((disc) => [disc.key, disc.ring !== null]));
    }

    /** After the frame: whether the discs want another one. */
    private settleDiscs(state: DrawState): void {
        this.discsReport = this.deps.discs ? this.discStatus + ':' + this.tilesDrawn : 'none';
        if (this.discStatus === 'unavailable') {
            this.settling = 0;
            this.discsBusy = false;
            return;
        }
        // 'ready' means the frame was submitted; a tile may come a frame or more later, and
        // sharper ones after that. A still picture is painted for a while longer to take them.
        if (this.discStatus === 'pending' || this.missing) this.settling = SETTLE_FRAMES;
        else if (this.settling > 0) this.settling -= 1;
        this.discsBusy = this.discStatus === 'pending' || this.settling > 0 || state.motion;
    }

    /** A body's shaded disc, when this frame's batch holds it and the service has its tile. */
    private shadedDisc(key: string, x: number, y: number, r: number): boolean {
        const painter = this.deps.discs;
        if (!painter || !this.shaded || !this.shaded.has(key)) return false;
        const ctx = this.ctx;
        ctx.save();
        const drawn = painter.draw(ctx, key, x, y, r);
        ctx.restore();
        if (drawn) this.tilesDrawn += 1;
        else this.missing = true;
        return drawn;
    }

    // ---- Backdrop ------------------------------------------------------------------------

    /** js/system_viewer.js:3321-3331. */
    private starField(plan: Plan, view: View): void {
        const ctx = this.ctx;
        const make = this.deps.makeCanvas;
        if (!make) {
            ctx.fillStyle = this.theme.space;
            ctx.fillRect(0, 0, this.w, this.h);
            return;
        }
        const key = plan.hexKey + '|' + this.w + '|' + this.h + '|' + this.dpr;
        if (!this.backdrop || this.backdrop.key !== key) {
            const box = backdropBox(this.w, this.h);
            const canvas = make(Math.max(1, Math.round(box.bw * this.dpr)), Math.max(1, Math.round(box.bh * this.dpr)));
            const inner = canvas.getContext('2d');
            if (inner) paintBackdrop(inner, box, this.dpr, plan.hexKey, this.theme);
            this.backdrop = { canvas, box, key };
        }
        const box = this.backdrop.box;
        const at = backdropShift(box, view.offX, view.offY);
        ctx.drawImage(this.backdrop.canvas, at.x, at.y, box.bw, box.bh);
    }

    // ---- Circles ---------------------------------------------------------------------------

    /** js/system_viewer.js:3113-3121. Strokes only the part of a circle that can be seen. */
    private strokeVisible(cx: number, cy: number, r: number, lineWidth: number, dashLength = 0, dashOffset = 0): void {
        const span = arcSpan(cx, cy, r, this.w, this.h, lineWidth + 4);
        if (!span) return;
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(cx, cy, r, span[0], span[1]);
        if (dashLength) ctx.lineDashOffset = ((dashOffset + span[0] * r) % dashLength + dashLength) % dashLength;
        ctx.stroke();
        if (dashLength) ctx.lineDashOffset = 0;
    }

    private offCanvas(x: number, y: number, reach: number): boolean {
        return x + reach < 0 || y + reach < 0 || x - reach > this.w || y - reach > this.h;
    }

    /** js/system_viewer.js:3338-3389. */
    private band(band: BandAt): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { cx, cy } = band;
        const outerR = band.outer;
        if (!(band.alpha > 0) || outerR <= band.inner || band.inner < 0) return;
        const inner = Math.max(0, band.inner);
        const span = arcSpan(cx, cy, outerR, this.w, this.h);
        const fromCentre = Math.hypot(cx - this.w / 2, cy - this.h / 2);
        if (inner > 0 && !arcSpan(cx, cy, inner, this.w, this.h) && fromCentre < inner) return;
        if (!span && !(fromCentre < outerR)) return;
        const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outerR);
        grad.addColorStop(0, theme.hzEdge);
        grad.addColorStop(0.5, theme.hzMid);
        grad.addColorStop(1, theme.hzEdge);
        ctx.save();
        ctx.globalAlpha = Math.min(1, band.alpha);
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (!span) {
            // The whole canvas lies inside the band's outer edge.
            ctx.rect(0, 0, this.w, this.h);
            const hole = inner > 0 ? arcSpan(cx, cy, inner, this.w, this.h) : null;
            if (hole) {
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, inner, hole[0], hole[1]);
                ctx.closePath();
            }
            ctx.fill(hole ? 'evenodd' : 'nonzero');
            ctx.restore();
            return;
        }
        if (span[1] - span[0] >= TAU) {
            ctx.arc(cx, cy, outerR, 0, TAU, false);
            ctx.arc(cx, cy, inner, 0, TAU, true);
        } else {
            ctx.arc(cx, cy, outerR, span[0], span[1], false);
            ctx.arc(cx, cy, inner, span[1], span[0], true);
            ctx.closePath();
        }
        ctx.fill();
        ctx.strokeStyle = theme.hzLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        if (inner >= 2) this.strokeVisible(cx, cy, inner, 1.5, 11);
        if (outerR >= 2) this.strokeVisible(cx, cy, outerR, 1.5, 11);
        ctx.setLineDash([]);
        ctx.restore();
    }

    /** js/system_viewer.js:2613-2631: the habitable panel behind a body in a line-up. */
    private panel(panel: Panel): void {
        if (!(panel.alpha > 0) || this.offCanvas(panel.x + panel.w / 2, panel.y + panel.h / 2, Math.max(panel.w, panel.h))) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.min(1, panel.alpha);
        ctx.fillStyle = this.theme.hzPanel;
        ctx.strokeStyle = this.theme.hzLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.roundRect(panel.x, panel.y, panel.w, panel.h, panel.radius);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /** js/system_viewer.js:3123-3136, without its "100D jump" words: the legend names the circle. */
    private jump(ring: JumpAt): void {
        if (!(ring.alpha > 0) || !(ring.r >= 6) || ring.r > MAX_RING_RADIUS) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ring.alpha);
        ctx.strokeStyle = this.theme.jump;
        ctx.lineWidth = 1.5;
        this.strokeVisible(ring.cx, ring.cy, ring.r, 1.5);
        ctx.restore();
    }

    /**
     * An orbit path: a world's ring (3221-3229), a companion's dashed orbit (2959-2966), a
     * belt's band of dashes (4644-4652, its phase turning with the belt, 3205), or a
     * line-up's arc behind the row (2634-2647).
     */
    private path(path: PathAt): void {
        if (!(path.alpha > 0) || path.r < 2) return;
        if (path.style !== 'solid' && path.r > MAX_RING_RADIUS) return;
        const ctx = this.ctx;
        const theme = this.theme;
        ctx.save();
        ctx.globalAlpha = Math.min(1, path.alpha);
        if (path.style === 'belt') {
            const width = path.width || 5;
            ctx.strokeStyle = theme.beltBand;
            ctx.lineWidth = width;
            ctx.setLineDash([3, 7]);
            this.strokeVisible(path.cx, path.cy, path.r, width, 10, path.phase);
        } else {
            const width = path.width || this.pathWidth;
            ctx.strokeStyle = theme.pathBase;
            ctx.lineWidth = width;
            if (path.style === 'dashed') {
                ctx.setLineDash([4, 6]);
                this.strokeVisible(path.cx, path.cy, path.r, width, 10);
            } else {
                this.strokeVisible(path.cx, path.cy, path.r, width);
            }
        }
        ctx.setLineDash([]);
        ctx.restore();
        // 3206-3214: a mainworld belt carries the mark and its name at the top of its ring.
        if (path.main !== null && this.layers && this.layers.markMainworld) {
            this.mainworldStar(path.cx, path.cy - path.r, 2, this.z);
            if (path.main) this.name(path.main, path.cx, path.cy - path.r - 10, 11, path.alpha);
        }
    }

    /** js/system_viewer.js:2504-2520: a belt in a line-up, as a band of rocks. */
    private rocks(rocks: Rocks): void {
        if (!(rocks.alpha > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = this.theme.rock;
        for (const dot of rocks.dots) {
            if (this.offCanvas(dot.x, dot.y, 4)) continue;
            ctx.globalAlpha = Math.min(1, dot.alpha * rocks.alpha);
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        if (rocks.mark && this.layers && this.layers.markMainworld) this.mainworldStar(rocks.mark.x, rocks.mark.y, rocks.mark.r, this.z);
    }

    /** js/system_viewer.js:2538-2572: a line-up caption, fitted to its slot. */
    private caption(caption: Caption): void {
        if (!(caption.alpha > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.min(1, caption.alpha);
        ctx.font = '600 ' + caption.fontPx + 'px ' + this.theme.fontText;
        ctx.fillStyle = caption.main ? this.theme.mainworld : this.theme.text;
        let label = caption.text;
        // Legacy cuts the full name; a row of "Regin…" says nothing, so the short name is tried first.
        if (ctx.measureText(label).width > caption.maxW) label = caption.short;
        if (ctx.measureText(label).width > caption.maxW) {
            while (label.length > 1 && ctx.measureText(label + '\u2026').width > caption.maxW) label = label.slice(0, -1);
            label = label.replace(/\s+$/, '') + '\u2026';
        }
        ctx.textAlign = caption.align;
        ctx.textBaseline = caption.align === 'center' ? 'top' : 'middle';
        ctx.fillText(label, caption.x, caption.y);
        ctx.restore();
    }

    // ---- Worlds ----------------------------------------------------------------------------

    /** js/system_viewer.js:4532-4641. */
    private world(plan: Plan, at: WorldDraw, state: DrawState): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const layers = state.layers;
        const w = at.world;
        const { starX, starY } = at;
        let reach = at.r;
        for (const m of at.moons) reach = Math.max(reach, m.orbitR + m.r);
        for (const r of at.rings) reach = Math.max(reach, r);
        if (this.offCanvas(at.x, at.y, reach + 60)) return;

        const port = w.port && at.r >= HIGHPORT_MIN_WORLD_PX
            ? this.portAngle(w.key, bodyAngle(plan.portEpoch, w.portPeriod, state.days))
            : null;
        if (w.port && port !== null) this.highport(plan, w.port, w.key, at.x, at.y, at.r, port, starX, starY, false, state);
        // 4218-4224: the shaded tile where there is one, else the flat disc and its night half.
        const lit = this.shadedDisc(w.key, at.x, at.y, at.r);
        if (!lit) this.disc(at.x, at.y, at.r, theme.tones[w.tone], starX, starY, layers.dayNight);
        if (w.port && port !== null) this.highport(plan, w.port, w.key, at.x, at.y, at.r, port, starX, starY, true, state);
        // 4538-4539: rings shaded with the disc replace the flat circles.
        const litRings = lit && this.shaded !== null && this.shaded.get(w.key) === true;

        // 4543-4554: the moons' paths, with the Paths layer.
        if (layers.paths && layers.pathStrength > 0) {
            ctx.save();
            ctx.strokeStyle = theme.pathBase;
            ctx.globalAlpha = Math.min(1, layers.pathStrength * PATH_ALPHA_WORLD);
            ctx.lineWidth = this.pathWidth;
            for (const m of at.moons) {
                if (m.moon.ring || m.orbitR < 2) continue;
                ctx.beginPath();
                ctx.arc(at.x, at.y, m.orbitR, 0, TAU);
                ctx.stroke();
            }
            ctx.restore();
        }
        for (const m of at.moons) this.moon(plan, m, at, state, litRings);
        if (!litRings) for (const r of at.rings) this.staticRing(at.x, at.y, r);

        if (w.mainworld && layers.markMainworld) {
            this.mainworldStar(at.x, at.y, at.r, at.z);
            if (w.name && at.label > 0) this.name(w.name, at.x, at.y - at.r - 8, 11, at.label);
        }
    }

    private moon(plan: Plan, m: MoonAt, parent: WorldDraw, state: DrawState, litRings: boolean): void {
        const moon = m.moon;
        if (moon.ring) {
            if (!litRings) this.staticRing(m.x, m.y, m.orbitR);
            return;
        }
        const ctx = this.ctx;
        const { starX, starY } = parent;
        const port = moon.port && m.r >= HIGHPORT_MIN_WORLD_PX
            ? this.portAngle(moon.key, bodyAngle(plan.portEpoch, moon.portPeriod, state.days))
            : null;
        if (moon.port && port !== null) this.highport(plan, moon.port, moon.key, m.x, m.y, m.r, port, starX, starY, false, state);
        const lit = this.shadedDisc(moon.key, m.x, m.y, m.r);
        if (!lit) this.disc(m.x, m.y, m.r, this.theme.moon, starX, starY, state.layers.dayNight);
        if (moon.port && port !== null) this.highport(plan, moon.port, moon.key, m.x, m.y, m.r, port, starX, starY, true, state);
        // 4586-4603: the moon dims as it slides into its world's shadow. A shaded disc carries its
        // own eclipse (its casters), so the wash is for the flat disc only (4585).
        const cover = state.layers.dayNight && !lit ? this.eased(moon.key, m.cover, state) : 0;
        if (cover > 0.02) {
            ctx.save();
            const wash = ctx.createRadialGradient(m.x, m.y, m.r * 0.15, m.x, m.y, m.r);
            wash.addColorStop(0, this.theme.shadow[0]);
            wash.addColorStop(0.7, this.theme.shadow[1]);
            wash.addColorStop(1, this.theme.shadow[2]);
            ctx.globalAlpha = Math.min(1, cover);
            ctx.fillStyle = wash;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
        if (moon.mainworld && state.layers.markMainworld) {
            this.mainworldStar(m.x, m.y, m.r, parent.z);
            if (moon.name && parent.label > 0) this.name(moon.name, m.x, m.y - m.r - 5, 10, parent.label);
        }
    }

    /** js/system_viewer.js:3162-3177. A short ease, so a fast clock fades the shadow instead of popping it. */
    private eased(key: string, target: number, state: DrawState): number {
        if (!state.motion) return target;
        const rec = this.eclipse.get(key);
        if (!rec) {
            this.eclipse.set(key, { value: target, at: state.time });
            return target;
        }
        const dt = Math.min(0.05, Math.max(0, (state.time - rec.at) / 1000));
        rec.at = state.time;
        rec.value += (target - rec.value) * (1 - Math.exp(-dt / 0.16));
        if (Math.abs(rec.value - target) < 0.01) rec.value = target;
        return rec.value;
    }

    /** js/system_viewer.js:4226-4231 with 4201-4209: the flat disc and its night half. */
    private disc(x: number, y: number, r: number, colour: string, starX: number, starY: number, night: boolean): void {
        const ctx = this.ctx;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        if (!night) return;
        const angle = Math.atan2(starY - y, starX - x) + Math.PI;
        ctx.fillStyle = this.theme.night;
        ctx.beginPath();
        ctx.arc(x, y, r, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
    }

    /** js/system_viewer.js:3460-3466. */
    private staticRing(x: number, y: number, r: number): void {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.strokeStyle = this.theme.ring;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /** js/system_viewer.js:274-299. */
    private mainworldStar(x: number, y: number, bodyR: number, z: number): void {
        const ctx = this.ctx;
        const mark = mainworldMark(x, y, bodyR, z);
        ctx.save();
        ctx.fillStyle = this.theme.mainworld;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * (TAU / 5);
            const b = a + Math.PI / 5;
            if (i === 0) ctx.moveTo(mark.x + Math.cos(a) * mark.outer, mark.y + Math.sin(a) * mark.outer);
            else ctx.lineTo(mark.x + Math.cos(a) * mark.outer, mark.y + Math.sin(a) * mark.outer);
            ctx.lineTo(mark.x + Math.cos(b) * mark.inner, mark.y + Math.sin(b) * mark.inner);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    /** The mainworld's name (4607-4612, 4632-4637, 3208-3213). */
    private name(text: string, x: number, y: number, px: number, alpha: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.fillStyle = this.theme.mainworld;
        ctx.font = px + 'px ' + this.theme.fontText;
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // ---- Stars -----------------------------------------------------------------------------

    /** js/system_viewer.js:3414-3451. */
    private star(at: StarDraw): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { x, y, r } = at;
        const paint = theme.stars[String(at.star.body.sType || '')] || theme.starUnknown;
        if (!this.offCanvas(x, y, r * at.glow + 4)) {
            ctx.save();
            const reach = r * at.glow;
            const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, reach);
            glow.addColorStop(0, paint.glow);
            glow.addColorStop(1, paint.clear);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, reach, 0, TAU);
            ctx.fill();
            ctx.restore();

            const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
            disc.addColorStop(0, theme.starCore);
            disc.addColorStop(0.4, paint.solid);
            disc.addColorStop(1, paint.rim);
            ctx.fillStyle = disc;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.fill();
        }
        // 3441: the name and the separation belong to the orbits layout.
        if (!(at.label > 0) || this.offCanvas(x, y, r + 200)) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, at.label);
        ctx.fillStyle = theme.text;
        ctx.font = '11px ' + theme.fontText;
        ctx.textAlign = 'center';
        ctx.fillText(at.star.name, x, y + r + 15);
        if (at.star.separation) {
            ctx.fillStyle = theme.textMuted;
            ctx.font = '10px ' + theme.fontText;
            ctx.fillText(at.star.separation, x, y + r + 27);
        }
        ctx.restore();
    }

    // ---- Highport --------------------------------------------------------------------------

    private portAngle(key: string, want: number): number {
        const result = chaseAngle(this.chases.get(key) || null, want, this.frameSeconds);
        this.chases.set(key, result.state);
        return result.angle;
    }

    private artImage(art: HighportArt): ArtImage | null {
        const load = this.deps.loadImage;
        if (!load) return null;
        let found = this.images.get(art.file);
        if (!found) {
            const entry: ArtImage = { image: null as unknown as CanvasImageSource, ready: false };
            entry.image = load(this.deps.artBase + art.file, () => {
                entry.ready = true;
                this.deps.stale();
            });
            this.images.set(art.file, entry);
            found = entry;
        }
        return found;
    }

    /** js/system_viewer.js:4379-4400. One kept downscale per on-screen width, and its shaded copy. */
    private sprite(art: HighportArt, image: CanvasImageSource, widthPx: number): Sprite | null {
        const make = this.deps.makeCanvas;
        if (!make) return null;
        const w = spriteWidth(widthPx);
        const key = art.file + ':' + w;
        const kept = this.sprites.get(key);
        if (kept) return kept;
        const [sx, sy, sw, sh] = art.crop;
        const h = Math.max(4, Math.round(w * sh / sw));
        const lit = make(w, h);
        const c = lit.getContext('2d');
        const dark = make(w, h);
        const d = dark.getContext('2d');
        if (!c || !d) return null;
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
        d.drawImage(lit, 0, 0);
        d.globalCompositeOperation = 'source-atop';
        d.fillStyle = this.theme.portShade;
        d.fillRect(0, 0, w, h);
        const sprite = { lit, dark };
        this.sprites.set(key, sprite);
        return sprite;
    }

    /**
     * js/system_viewer.js:4418-4522. Drawn in two passes: the far half before the world, the
     * near half after. Without the planet renderer the station circles in the picture plane,
     * so it is always on the near pass (4424-4425).
     *
     * A departure from legacy, asked for by Johnny (2026-10-04): the legacy station snaps from
     * lit to dark as it crosses its world's shadow line. Here it fades as a moon does, by the
     * same shadowCover and the same short ease, the dark hull and wash laid over the lit ones.
     */
    private highport(
        plan: Plan, port: Port, key: string, x: number, y: number, r: number, angle: number,
        starX: number, starY: number, front: boolean, state: DrawState,
    ): void {
        const place = highportPlace(x, y, r, angle, starX, starY);
        if (place.behind === front || place.hidden) return;
        const ctx = this.ctx;
        const theme = this.theme;
        const size = highportSize(r);
        const now = state.motion ? state.time / 1000 : 0;
        const phase = plan.portPhase;
        const art = highportArt(port.cls);
        const paint: PortPaint = port.major ? theme.port.major : theme.port.minor;
        const aspect = art.crop[3] / art.crop[2];
        const sizeY = size * aspect;
        const ox = -art.pivot[0] * size;
        const oy = -art.pivot[1] * sizeY;
        const lampR = Math.max(0.7, size * 0.075);
        ctx.save();
        ctx.translate(place.x, place.y);
        // How deep in its world's shadow the station is: 0 lit, 1 dark, eased like a moon's.
        const cover = this.eased('port:' + key, shadowCover(place.x, place.y, x, y, r, starX, starY), state);
        // Running lights: the whole station's wash, breathing slowly.
        const breath = 0.85 + 0.15 * Math.sin(now * 1.3 + phase);
        this.portWash(paint.washLit, size, breath * (1 - cover));
        this.portWash(paint.washDark, size, breath * cover);
        ctx.globalAlpha = 1;
        // The station turns about its hub on the wall clock alone.
        ctx.rotate(now * 0.25 + phase);
        const loaded = this.artImage(art);
        if (loaded && loaded.ready) {
            const sprite = this.sprite(art, loaded.image, size * 2 * this.dpr);
            if (sprite) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                // The dark hull is the lit one shaded, so laid over it at the cover it fades without a seam.
                if (cover < 0.995) ctx.drawImage(sprite.lit, ox - size, oy - sizeY, size * 2, sizeY * 2);
                if (cover > 0.005) {
                    ctx.globalAlpha = cover < 0.995 ? cover : 1;
                    ctx.drawImage(sprite.dark, ox - size, oy - sizeY, size * 2, sizeY * 2);
                    ctx.globalAlpha = 1;
                }
            }
        }
        // The hub's own glow, pulsing, over the painted core.
        ctx.globalCompositeOperation = 'lighter';
        const hub = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.3);
        hub.addColorStop(0, paint.hub[0]);
        hub.addColorStop(0.45, paint.hub[1]);
        hub.addColorStop(1, paint.hub[2]);
        ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now * 2.1 + phase));
        ctx.fillStyle = hub;
        ctx.fillRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
        // Navigation lights: red to port, green to starboard, blinking in turn.
        const blink = Math.floor(now * 1.2 + phase) % 2;
        for (const [nx, ny] of art.nav) {
            const starboard = nx - art.pivot[0] > 0;
            this.lamp(nx * size + ox, ny * sizeY + oy, lampR, starboard ? theme.portStarboard : theme.portPort, starboard ? blink === 0 : blink === 1);
        }
        // Anti-collision strobes: a white double flash every second and a half; steady with motion reduced.
        const cycle = (now + phase * 0.3) % 1.5;
        const flash = !now || cycle < 0.07 || (cycle > 0.18 && cycle < 0.25);
        if (flash) for (const [nx, ny] of art.strobe) this.lamp(nx * size + ox, ny * sizeY + oy, lampR, theme.portStrobe, true);
        ctx.restore();
    }

    /** The station's wash of running lights at one strength; nothing is painted for a share too faint to see. */
    private portWash(stops: [string, string, string], size: number, alpha: number): void {
        if (!(alpha > 0.004)) return;
        const ctx = this.ctx;
        const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
        wash.addColorStop(0, stops[0]);
        wash.addColorStop(0.5, stops[1]);
        wash.addColorStop(1, stops[2]);
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillStyle = wash;
        ctx.fillRect(-size * 2.6, -size * 2.6, size * 5.2, size * 5.2);
    }

    /** js/system_viewer.js:4500-4508. */
    private lamp(x: number, y: number, r: number, paint: [string, string, string], on: boolean): void {
        const ctx = this.ctx;
        ctx.globalAlpha = on ? 1 : 0.22;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        halo.addColorStop(0, paint[0]);
        halo.addColorStop(1, paint[1]);
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
        ctx.fillStyle = paint[2];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
    }

    // ---- Selection -------------------------------------------------------------------------

    /** js/system_viewer.js:2199-2347: the lock on the selected body, and its tag. */
    private selection(plan: Plan, picture: Picture, state: DrawState): void {
        const hit: Hit | null = hitOf(picture, state.selected);
        if (!hit) {
            if (!state.selected) this.lockKey = null;
            return;
        }
        const ctx = this.ctx;
        const theme = this.theme;
        const now = state.time;
        if (this.lockKey !== hit.key) {
            this.lockKey = hit.key;
            this.lockStart = now;
            this.lockLabel = selectionLabel(bodyOf(plan, hit.key) || {});
        }
        const lockMs = theme.tLock * 1000;
        const k = state.motion && lockMs > 0 ? Math.min(1, (now - this.lockStart) / lockMs) : 1;
        const easeOut = 1 - Math.pow(1 - k, 3);
        // A slight overshoot as the brackets land.
        const snap = state.motion ? 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2) : 1;
        const time = state.motion ? now / 1000 : 0;
        let cx = hit.cx;
        let cy = hit.cy;
        let R = (hit.visualR ?? hit.r) + 5;
        ctx.save();
        ctx.strokeStyle = theme.lock;
        if (hit.innerR !== undefined) {
            // A belt runs the whole way round: the lock sits on one point of it and its edges are traced.
            const mid = (hit.r + hit.innerR) / 2;
            let angle = -Math.PI / 2;
            if (cy - mid < -20) angle = Math.atan2(this.h / 2 - cy, this.w / 2 - cx);
            ctx.globalAlpha = 0.55 * easeOut;
            ctx.lineWidth = 1;
            if (hit.innerR > 2) this.strokeVisible(cx, cy, hit.innerR, 1);
            if (hit.r > 2) this.strokeVisible(cx, cy, hit.r, 1);
            cx += Math.cos(angle) * mid;
            cy += Math.sin(angle) * mid;
            R = Math.max(9, (hit.r - hit.innerR) / 2 + 4);
        }
        if (this.offCanvas(cx, cy, R * 2 + 300)) {
            ctx.restore();
            return;
        }
        // Glow under the lock.
        const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R + 22);
        glow.addColorStop(0, theme.lockGlow[0]);
        glow.addColorStop(1, theme.lockGlow[1]);
        ctx.globalAlpha = easeOut;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, R + 22, 0, TAU);
        ctx.arc(cx, cy, R * 0.9, 0, TAU, true);
        ctx.fill();
        // The ring draws itself on.
        ctx.globalAlpha = 0.95;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * easeOut);
        ctx.stroke();
        // Range scale: 72 ticks, every sixth long, turning slowly, with gaps where the brackets sit.
        const scaleR = R + 8;
        const turn = time * 0.12;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5 * easeOut;
        ctx.beginPath();
        for (let i = 0; i < 72; i++) {
            const a = turn + i * Math.PI / 36;
            const fromBracket = Math.abs(((a - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4);
            if (fromBracket < 0.22) continue;
            const len = i % 6 === 0 ? 5 : 2.5;
            ctx.moveTo(cx + Math.cos(a) * scaleR, cy + Math.sin(a) * scaleR);
            ctx.lineTo(cx + Math.cos(a) * (scaleR + len), cy + Math.sin(a) * (scaleR + len));
        }
        ctx.stroke();
        // Three counter-rotating arcs further out.
        const arcR = R + 17;
        ctx.strokeStyle = theme.signal;
        ctx.globalAlpha = 0.55 * easeOut;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const a = -time * 0.35 + i * TAU / 3;
            ctx.beginPath();
            ctx.arc(cx, cy, arcR, a, a + 0.75);
            ctx.stroke();
        }
        // Brackets swing in from wide and a quarter-turn round, then breathe.
        const breathe = k >= 1 && state.motion ? Math.sin(time * 2.4) * 1.2 : 0;
        const bracketR = (R + 4) * (1 + 1.1 * (1 - snap)) + breathe;
        const spin = (1 - easeOut) * Math.PI / 2;
        const arm = Math.max(5, Math.min(12, R * 0.35));
        ctx.strokeStyle = theme.lock;
        ctx.globalAlpha = Math.min(1, 0.2 + easeOut);
        ctx.lineWidth = 2;
        ctx.lineCap = 'square';
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2 + spin;
            const bx = cx + Math.cos(a) * bracketR * Math.SQRT2 * 0.78;
            const by = cy + Math.sin(a) * bracketR * Math.SQRT2 * 0.78;
            const ax = Math.sign(-Math.cos(a)) || 1;
            const ay = Math.sign(-Math.sin(a)) || 1;
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(spin);
            ctx.beginPath();
            ctx.moveTo(ax * arm, 0);
            ctx.lineTo(0, 0);
            ctx.lineTo(0, ay * arm);
            ctx.stroke();
            ctx.restore();
        }
        ctx.lineCap = 'butt';
        // Cardinal notches pointing in.
        ctx.globalAlpha = 0.8 * easeOut;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            ctx.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3));
            ctx.lineTo(cx + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7));
        }
        ctx.stroke();
        // The readout tag, up and to the right on a leader (left, near the edge); orbits layout only (2311).
        if (k > 0.35 && picture.mode === 'orbits') {
            const [name, detail] = this.lockLabel;
            const show = Math.min(1, (k - 0.35) / 0.4);
            const nameFont = '700 11px ' + theme.fontCode;
            const detailFont = '10px ' + theme.fontCode;
            ctx.font = nameFont;
            const nameW = ctx.measureText(name.toUpperCase()).width;
            ctx.font = detailFont;
            const detailW = detail ? ctx.measureText(detail).width : 0;
            const w = Math.max(nameW, detailW) + 16;
            const h = detail ? 34 : 20;
            const corner = (arcR + 2) * Math.SQRT1_2;
            const flip = cx + corner + 22 + w > this.w - 8;
            const dir = flip ? -1 : 1;
            const ex = cx + dir * corner;
            const ey = cy - corner;
            const kx = ex + dir * 14;
            const ky = ey - 14;
            const tx = flip ? kx - 8 - w : kx + 8;
            const ty = ky - h / 2;
            ctx.globalAlpha = show * 0.75;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(kx, ky);
            ctx.lineTo(kx + dir * 8, ky);
            ctx.stroke();
            ctx.globalAlpha = show;
            ctx.fillStyle = theme.tag;
            ctx.beginPath();
            ctx.roundRect(tx, ty, w, h, 3);
            ctx.fill();
            ctx.globalAlpha = show * 0.8;
            ctx.stroke();
            ctx.globalAlpha = show;
            ctx.fillStyle = theme.lock;
            ctx.fillRect(flip ? tx + w - 3 : tx, ty, 3, h);
            ctx.textBaseline = 'alphabetic';
            ctx.font = nameFont;
            ctx.fillText(name.toUpperCase(), tx + 8, ty + 14);
            if (detail) {
                ctx.font = detailFont;
                ctx.fillStyle = theme.signal;
                ctx.globalAlpha = show * 0.95;
                ctx.fillText(detail, tx + 8, ty + 28);
            }
        }
        ctx.restore();
        this.pulse(cx, cy, R, state);
    }

    /**
     * js/system_viewer.js:2104-2185: the scan view. A slow sweep round the primary (orbits
     * layout only), and on every world and moon a ring with four turning marks that
     * brightens as the sweep passes; in the orbits layout, its designation on a short leader.
     */
    private scan(plan: Plan, picture: Picture, state: DrawState): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const now = state.motion ? state.time / 1000 : 0;
        const period = theme.tSweep > 0 ? theme.tSweep : 8;
        const sweep = ((now / period) % 1) * TAU;
        const centre = picture.centre;
        if (this.scanPlan !== plan) {
            this.scanPlan = plan;
            this.scanLabels.clear();
        }
        ctx.save();
        ctx.strokeStyle = theme.signal;
        ctx.fillStyle = theme.signal;
        if (centre && state.motion) {
            // The sweep: a soft wedge trailing a bright leading edge.
            const trail = 0.7;
            const wedge = ctx.createConicGradient(sweep - trail, centre.x, centre.y);
            wedge.addColorStop(0, theme.scanWedge[0]);
            wedge.addColorStop(trail / TAU, theme.scanWedge[1]);
            wedge.addColorStop(trail / TAU + 0.0005, theme.scanWedge[0]);
            wedge.addColorStop(1, theme.scanWedge[0]);
            ctx.fillStyle = wedge;
            ctx.fillRect(0, 0, this.w, this.h);
            ctx.fillStyle = theme.signal;
            const reach = Math.hypot(Math.max(centre.x, this.w - centre.x), Math.max(centre.y, this.h - centre.y));
            ctx.globalAlpha = 0.22;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(centre.x, centre.y);
            ctx.lineTo(centre.x + Math.cos(sweep) * reach, centre.y + Math.sin(sweep) * reach);
            ctx.stroke();
        }
        ctx.font = '600 10px ' + theme.fontCode;
        ctx.textBaseline = 'alphabetic';
        for (const hit of picture.hits) {
            if ((hit.kind !== 'world' && hit.kind !== 'moon') || hit.innerR !== undefined) continue;
            const { cx, cy } = hit;
            const visual = hit.visualR ?? hit.r;
            if (cx < -40 || cy < -40 || cx > this.w + 40 || cy > this.h + 40) continue;
            const moon = hit.kind === 'moon';
            const body = bodyOf(plan, hit.key);
            const main = !!body && body.type === 'Mainworld';
            // Brighten as the sweep passes, then fade over a second or so.
            let ping = 0;
            if (centre && state.motion) {
                const since = ((sweep - Math.atan2(cy - centre.y, cx - centre.x)) % TAU + TAU) % TAU;
                ping = Math.exp(-since * 2.2);
            }
            const alpha = Math.min(1, (moon ? 0.42 : 0.68) + (main ? 0.2 : 0) + ping * 0.45);
            // A moon too small to show detail gets a quiet ring, so a crowded moon system stays readable.
            if (moon && visual < 2.5 && !main) {
                ctx.globalAlpha = alpha * 0.55;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, 4 + ping * 2, 0, TAU);
                ctx.stroke();
                continue;
            }
            const R = Math.max(visual + 5, moon ? 7 : 9) + ping * 3;
            ctx.globalAlpha = alpha * 0.32;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.stroke();
            ctx.globalAlpha = alpha;
            ctx.lineWidth = main ? 2 : 1.5;
            const turn = now * (moon ? 0.5 : 0.3) + (cx * 0.013 + cy * 0.007);
            for (let k = 0; k < 4; k++) {
                const a = turn + k * Math.PI / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, R + 3, a - 0.3, a + 0.3);
                ctx.stroke();
            }
            if (picture.mode !== 'orbits' || (moon && R < 12)) continue;
            // Designation up and to the right, on a short leader.
            let label = this.scanLabels.get(hit.key);
            if (label === undefined) {
                label = body ? shortLabel(String(body.name || body.type || ''), plan.name) : '';
                this.scanLabels.set(hit.key, label);
            }
            const corner = (R + 3) * Math.SQRT1_2;
            const lx = cx + corner + 6;
            const ly = cy - corner - 6;
            ctx.lineWidth = 1;
            ctx.globalAlpha = alpha * 0.55;
            ctx.beginPath();
            ctx.moveTo(cx + corner, cy - corner);
            ctx.lineTo(lx - 2, ly + 3);
            ctx.stroke();
            ctx.globalAlpha = Math.min(1, alpha + 0.1);
            ctx.fillText(label, lx, ly);
        }
        ctx.restore();
    }

    /** js/system_viewer.js:3021-3037. Two pings, a little apart, every beat. */
    private pulse(cx: number, cy: number, baseR: number, state: DrawState): void {
        const beat = this.theme.tPulse * 1000;
        if (!state.motion || !(beat > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = this.theme.signal;
        for (const offset of [0, 0.22]) {
            const t = ((state.time / beat) + 1 - offset) % 1;
            if (t > 0.6) continue;
            const ease = 1 - Math.pow(1 - t / 0.6, 3);
            ctx.globalAlpha = (1 - ease) * (offset ? 0.35 : 0.6);
            ctx.lineWidth = offset ? 1 : 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, baseR + 4 + ease * (baseR * 0.8 + 26), 0, TAU);
            ctx.stroke();
        }
        ctx.restore();
    }

    // ---- Ships -----------------------------------------------------------------------------

    /**
     * Sensor designators after the bodies. The shape is a fixed pixel wireframe,
     * so a zoom that rebuilds the picture does not grow the stroke.
     */
    private ships(marks: readonly ShipMark[] | undefined): void {
        if (!marks || marks.length === 0) return;
        const ctx = this.ctx;
        const theme = this.theme;
        for (const mark of marks) {
            if (this.offCanvas(mark.x, mark.y, 40)) continue;
            const colour = mark.kind === 'party' ? theme.signal : mark.kind === 'traffic' ? theme.textMuted : theme.text;
            ctx.save();
            ctx.translate(mark.x, mark.y);
            if (typeof mark.heading === 'number') ctx.rotate(mark.heading);
            ctx.strokeStyle = colour;
            ctx.globalAlpha = 1;
            ctx.lineWidth = 1;
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'butt';
            ctx.setLineDash([]);
            ctx.beginPath();
            this.designator(mark.shape);
            ctx.stroke();
            ctx.restore();
            ctx.save();
            ctx.fillStyle = colour;
            ctx.globalAlpha = 1;
            ctx.font = '10px ' + theme.fontText;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(mark.name, mark.x + 12, mark.y);
            ctx.restore();
        }
    }

    /** One closed wireframe. Drawn in a context already centred on the mark. */
    private designator(shape: ShipShape): void {
        const ctx = this.ctx;
        if (shape === 'triangle') {
            ctx.moveTo(8, 0);
            ctx.lineTo(-6, 5);
            ctx.lineTo(-6, -5);
            ctx.closePath();
            return;
        }
        if (shape === 'circle') {
            ctx.arc(0, 0, 6, 0, TAU);
            return;
        }
        if (shape === 'square') {
            ctx.rect(-5, -5, 10, 10);
            return;
        }
        ctx.rect(-9, -4, 18, 8);
    }

    /** Hairlines and a readout. This frame only: nothing is added to the picture. */
    private plot(plot: PlotReadout | null | undefined): void {
        if (!plot) return;
        const ctx = this.ctx;
        const theme = this.theme;
        ctx.save();
        ctx.strokeStyle = theme.text;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, plot.y);
        ctx.lineTo(this.w, plot.y);
        ctx.moveTo(plot.x, 0);
        ctx.lineTo(plot.x, this.h);
        ctx.stroke();
        const pastRight = plot.x + 8 > this.w - 120;
        const pastBottom = plot.y + 12 > this.h - 16;
        ctx.fillStyle = theme.text;
        ctx.font = '10px ' + theme.fontCode;
        ctx.textAlign = pastRight ? 'right' : 'left';
        ctx.textBaseline = pastBottom ? 'bottom' : 'top';
        ctx.fillText(plotText(plot), pastRight ? plot.x - 8 : plot.x + 8, pastBottom ? plot.y - 8 : plot.y + 12);
        ctx.restore();
    }
}
