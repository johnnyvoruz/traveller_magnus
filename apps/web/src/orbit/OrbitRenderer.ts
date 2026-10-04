/**
 * Paints one orbit scene on a 2D canvas, in the legacy order (js/system_viewer.js
 * _paintOrrery, 2906-3016): star field, the primary's habitable band, the 100D jump circles,
 * each companion (its orbit, its band, its worlds), the primary's worlds, the stars on top,
 * the habitable labels, the selection lock. Where a body sits is layout.ts's business; this
 * file only draws what the scene says. Every colour comes from the theme.
 *
 * Worlds are flat discs with a night half (the legacy fallback, 4226-4231) until planet
 * imagery lands; the scan overlay (3015) belongs to the line-up search and is not drawn.
 */
import { backdropBox, backdropShift, paintBackdrop, type BackdropBox } from './backdrop.ts';
import {
    chaseAngle, highportArt, highportPlace, highportSize, spriteWidth, HIGHPORT_MIN_WORLD_PX,
    type Chase, type HighportArt, type Port,
} from './highport.ts';
import {
    arcSpan, bodyOf, hitOf, mainworldMark, selectionLabel, MAX_RING_RADIUS,
    type Band, type Hit, type JumpRing, type MoonAt, type Plan, type Scene, type StarAt, type View,
    type WorldAt, type WorldSet,
} from './layout.ts';
import { bodyAngle } from './maths.ts';
import type { OrbitTheme, PortPaint } from './theme.ts';

const TAU = Math.PI * 2;

export type RendererDeps = {
    /** An off-screen canvas of the given pixel size, or null where there is none (tests). */
    makeCanvas: ((w: number, h: number) => HTMLCanvasElement) | null;
    /** Starts loading an image and calls done when it can be drawn. */
    loadImage: ((src: string, done: () => void) => CanvasImageSource) | null;
    /** Where the highport paintings are served from, with a trailing slash. */
    artBase: string;
    /** Called when something loaded after a paint: the picture should be painted again. */
    stale: () => void;
};

export type DrawState = {
    /** The key of the selected body, or null. */
    selected: string | null;
    days: number;
    /** Wall time in milliseconds. */
    time: number;
    /** False under reduced motion: no lock animation, no pulse, lights steady. */
    motion: boolean;
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

    draw(plan: Plan, scene: Scene, view: View, state: DrawState): void {
        const ctx = this.ctx;
        this.z = view.z;
        // js/system_viewer.js:2024-2026: a smoothed frame time, for the station's pace.
        if (this.lastTime) {
            const dt = Math.max(0.001, (state.time - this.lastTime) / 1000);
            this.frameSeconds += (Math.min(0.1, dt) - this.frameSeconds) * 0.25;
        }
        this.lastTime = state.time;

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        this.starField(plan, view);
        this.band(scene.band);
        for (const ring of scene.jumps) this.jump(ring);
        for (const companion of scene.companions) {
            this.companionOrbit(companion.at);
            if (companion.band) this.band(companion.band);
            if (companion.set) this.worldSet(plan, companion.set, state);
        }
        if (scene.primary) this.worldSet(plan, scene.primary, state);
        for (const at of scene.stars) this.star(at);
        this.bandLabel(scene.band);
        for (const companion of scene.companions) if (companion.band) this.bandLabel(companion.band);
        this.selection(plan, scene, state);
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
    private band(band: Band): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { cx, cy } = band;
        const outerR = band.outer;
        if (outerR <= band.inner || band.inner < 0) return;
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

    /** js/system_viewer.js:3390-3412. */
    private bandLabel(band: Band): void {
        const inner = Math.max(0, band.inner);
        const mid = (inner + band.outer) / 2;
        if (!(band.outer - inner >= 9 && mid >= 40)) return;
        const y = band.cy - mid;
        if (this.offCanvas(band.cx, y, 200)) return;
        const ctx = this.ctx;
        const theme = this.theme;
        ctx.save();
        ctx.font = '700 10px ' + theme.fontText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.letterSpacing = '1.2px';
        const width = ctx.measureText(band.label).width + 14;
        ctx.fillStyle = theme.hzPill;
        ctx.strokeStyle = theme.hzLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(band.cx - width / 2, y - 8, width, 16, 8);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = theme.hzText;
        ctx.fillText(band.label, band.cx, y + 0.5);
        ctx.restore();
    }

    /** js/system_viewer.js:3123-3136. */
    private jump(ring: JumpRing): void {
        if (!(ring.r >= 6) || ring.r > MAX_RING_RADIUS) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = this.theme.jump;
        ctx.lineWidth = 1.5;
        this.strokeVisible(ring.cx, ring.cy, ring.r, 1.5);
        if (ring.label && ring.r >= 22 && ring.r < 2000 && !this.offCanvas(ring.cx, ring.cy - ring.r, 120)) {
            ctx.font = '11px ' + this.theme.fontText;
            ctx.fillStyle = this.theme.jumpText;
            ctx.textAlign = 'left';
            ctx.textBaseline = 'middle';
            ctx.fillText(ring.label, ring.cx + 4, ring.cy - ring.r - 2);
        }
        ctx.restore();
    }

    /** js/system_viewer.js:2959-2966. */
    private companionOrbit(at: StarAt): void {
        if (at.ringR > MAX_RING_RADIUS) return;
        const ctx = this.ctx;
        ctx.strokeStyle = this.theme.companionPath;
        ctx.lineWidth = this.theme.pathWidth;
        ctx.setLineDash([4, 6]);
        this.strokeVisible(at.parentX, at.parentY, at.ringR, this.theme.pathWidth, 10);
        ctx.setLineDash([]);
    }

    // ---- Worlds ----------------------------------------------------------------------------

    /** js/system_viewer.js:3191-3236. */
    private worldSet(plan: Plan, set: WorldSet, state: DrawState): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { cx, cy } = set;
        for (const belt of set.belts) {
            // 4644-4652, with the dash phase turning with the belt (3205).
            if (belt.r >= 2 && belt.r <= MAX_RING_RADIUS) {
                ctx.save();
                ctx.strokeStyle = theme.beltBand;
                ctx.lineWidth = 5;
                ctx.setLineDash([3, 7]);
                this.strokeVisible(cx, cy, belt.r, 5, 10, -(belt.angle * belt.r));
                ctx.setLineDash([]);
                ctx.restore();
            }
            if (belt.world.mainworldBelt) {
                this.mainworldStar(cx, cy - belt.r, 2);
                if (belt.world.name) this.name(belt.world.name, cx, cy - belt.r - 10, 11);
            }
        }
        ctx.strokeStyle = theme.path;
        ctx.lineWidth = theme.pathWidth;
        for (const r of set.orbits) if (r >= 2) this.strokeVisible(cx, cy, r, theme.pathWidth);
        for (const at of set.bodies) this.world(plan, at, cx, cy, state);
    }

    /** js/system_viewer.js:4532-4641. */
    private world(plan: Plan, at: WorldAt, starX: number, starY: number, state: DrawState): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const w = at.world;
        let reach = at.r;
        for (const m of at.moons) reach = Math.max(reach, m.orbitR + m.r);
        for (const r of at.rings) reach = Math.max(reach, r);
        if (this.offCanvas(at.x, at.y, reach + 60)) return;

        const port = w.port && at.r >= HIGHPORT_MIN_WORLD_PX
            ? this.portAngle(w.key, bodyAngle(plan.portEpoch, w.portPeriod, state.days))
            : null;
        if (w.port && port !== null) this.highport(plan, w.port, at.x, at.y, at.r, port, starX, starY, false, state);
        this.disc(at.x, at.y, at.r, theme.tones[w.tone], starX, starY);
        if (w.port && port !== null) this.highport(plan, w.port, at.x, at.y, at.r, port, starX, starY, true, state);

        ctx.strokeStyle = theme.path;
        ctx.lineWidth = theme.pathWidth;
        for (const m of at.moons) {
            if (m.moon.ring || m.orbitR < 2) continue;
            ctx.beginPath();
            ctx.arc(at.x, at.y, m.orbitR, 0, TAU);
            ctx.stroke();
        }
        for (const m of at.moons) this.moon(plan, m, starX, starY, state);
        for (const r of at.rings) this.staticRing(at.x, at.y, r);

        if (w.mainworld) {
            this.mainworldStar(at.x, at.y, at.r);
            if (w.name) this.name(w.name, at.x, at.y - at.r - 8, 11);
        }
    }

    private moon(plan: Plan, m: MoonAt, starX: number, starY: number, state: DrawState): void {
        const moon = m.moon;
        if (moon.ring) {
            this.staticRing(m.x, m.y, m.orbitR);
            return;
        }
        const ctx = this.ctx;
        const port = moon.port && m.r >= HIGHPORT_MIN_WORLD_PX
            ? this.portAngle(moon.key, bodyAngle(plan.portEpoch, moon.portPeriod, state.days))
            : null;
        if (moon.port && port !== null) this.highport(plan, moon.port, m.x, m.y, m.r, port, starX, starY, false, state);
        this.disc(m.x, m.y, m.r, this.theme.moon, starX, starY);
        if (moon.port && port !== null) this.highport(plan, moon.port, m.x, m.y, m.r, port, starX, starY, true, state);
        // 4586-4603: the moon dims as it slides into its world's shadow.
        const cover = this.eased(moon.key, m.cover, state);
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
        if (moon.mainworld) {
            this.mainworldStar(m.x, m.y, m.r);
            if (moon.name) this.name(moon.name, m.x, m.y - m.r - 5, 10);
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
    private disc(x: number, y: number, r: number, colour: string, starX: number, starY: number): void {
        const ctx = this.ctx;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
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
    private mainworldStar(x: number, y: number, bodyR: number): void {
        const ctx = this.ctx;
        const mark = mainworldMark(x, y, bodyR, this.z);
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
    private name(text: string, x: number, y: number, px: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = this.theme.mainworld;
        ctx.font = px + 'px ' + this.theme.fontText;
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // ---- Stars -----------------------------------------------------------------------------

    /** js/system_viewer.js:3414-3451. */
    private star(at: StarAt): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { x, y, r } = at;
        const paint = theme.stars[String(at.star.body.sType || '')] || theme.starUnknown;
        if (!this.offCanvas(x, y, r * 1.38 + 4)) {
            ctx.save();
            const reach = r * 1.38;
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
        if (this.offCanvas(x, y, r + 200)) return;
        ctx.save();
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
     */
    private highport(
        plan: Plan, port: Port, x: number, y: number, r: number, angle: number,
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
        // Running lights: the whole station's wash, breathing slowly.
        const stops = place.shaded ? paint.washDark : paint.washLit;
        const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
        wash.addColorStop(0, stops[0]);
        wash.addColorStop(0.5, stops[1]);
        wash.addColorStop(1, stops[2]);
        ctx.globalAlpha = 0.85 + 0.15 * Math.sin(now * 1.3 + phase);
        ctx.fillStyle = wash;
        ctx.fillRect(-size * 2.6, -size * 2.6, size * 5.2, size * 5.2);
        ctx.globalAlpha = 1;
        // The station turns about its hub on the wall clock alone.
        ctx.rotate(now * 0.25 + phase);
        const loaded = this.artImage(art);
        if (loaded && loaded.ready) {
            const sprite = this.sprite(art, loaded.image, size * 2 * this.dpr);
            if (sprite) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(place.shaded ? sprite.dark : sprite.lit, ox - size, oy - sizeY, size * 2, sizeY * 2);
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
    private selection(plan: Plan, scene: Scene, state: DrawState): void {
        const hit: Hit | null = hitOf(scene, state.selected);
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
        // The readout tag, up and to the right on a leader (left, near the edge).
        if (k > 0.35) {
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
}
