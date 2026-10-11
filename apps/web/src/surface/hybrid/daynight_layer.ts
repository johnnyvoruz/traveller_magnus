/**
 * The animated day and night layer of the hybrid map, frame by frame: where the sun is shown
 * (motion.ts), the crossfade into and out of the day-averaged shading, the shadow and glow
 * images (overlay.ts paintDayNight), settlement lights and the subsolar reticle. SurfaceStage
 * calls draw() from requestAnimationFrame; the review renderer calls the same code. The
 * terrain sheet is never touched: the layer draws on its own two canvases.
 */
import type { Subsolar } from '../../orbit/sun.ts';
import { AVERAGED_ABOVE_DAYS_PER_SECOND, localDaysPerSecond } from '../../orbit/sun.ts';
import { fieldOf, halfLayout, sheetPoint, type SheetLayout } from './field.ts';
import { latOf, lonOf } from './grid.ts';
import type { HybridModel } from './model.ts';
import { AVERAGE_FADE_MS, clockStepDeg, createFade, createSunMotion, wrapLon, type SunPose } from './motion.ts';
import { nightShare, paintDayNight, sunVector, type DayNightImages } from './overlay.ts';
import { iconPaint } from './icons.ts';
import { cityLights } from './symbols.ts';

/** The 2D context calls the layer makes (a CanvasRenderingContext2D has them all). */
export type LayerCtx = {
    clearRect(x: number, y: number, w: number, h: number): void;
    putImageData(image: never, x: number, y: number): void;
    drawImage(image: never, dx: number, dy: number, dw: number, dh: number): void;
    save(): void;
    restore(): void;
    beginPath(): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    stroke(): void;
    fill(): void;
    globalAlpha: number;
    imageSmoothingEnabled: boolean;
    lineWidth: number;
    strokeStyle: unknown;
    fillStyle: unknown;
    createRadialGradient(x0: number, y0: number, r0: number, x1: number, y1: number, r1: number): { addColorStop(offset: number, colour: string): void };
    fillRect(x: number, y: number, w: number, h: number): void;
};

export type LayerCanvas = { readonly canvas: unknown; readonly ctx: LayerCtx };

/** What the layer needs from the page (or from the renderer in tests). */
export type LayerHost = {
    readonly reducedMotion: boolean;
    canvas(width: number, height: number): LayerCanvas | null;
    imageData(pixels: Uint8ClampedArray, width: number, height: number): unknown;
};

export type LayerInput = {
    readonly model: HybridModel;
    /** The clock's subsolar point (orbit/sun.ts), or null when unknown. */
    readonly sub: Subsolar | null;
    readonly playing: boolean;
    /** Days per second. */
    readonly rate: number;
    /** The clock was set (a typed date, Now) since the last frame. */
    readonly jumped: boolean;
    readonly nowMs: number;
};

export type LayerFrame = {
    /** False when there was nothing to draw (no sun known): the canvases are clear. */
    readonly drawn: boolean;
    /** True while the next frame would differ: a running clock, a jump in travel, a crossfade. */
    readonly busy: boolean;
    /** The clock runs fast enough for the averaged shading (the crossfade's target). */
    readonly averaged: boolean;
    /** A locked world: the shadow never moves. */
    readonly still: boolean;
    readonly pose: SunPose | null;
    /** 0 instant, 1 averaged. */
    readonly mix: number;
};

/** The sheen's pace along the terminator line, radians per ms of real time. */
const SHEEN_PER_MS = 0.0011;

export type DayNightLayer = {
    /** Draw one frame on the shadow and glow contexts (each the sheet's size). */
    draw(input: LayerInput, shadow: LayerCtx, glow: LayerCtx, layout: SheetLayout): LayerFrame;
    /** A new body: the next frame shows its sun at once, without travel. */
    reset(): void;
};

/** End colours of the sun sprite and the reticle, read once when the layer is built. */
type SunPaint = {
    core: string;
    inner: string;
    mid: string;
    edge: string;
    twilightCore: string;
    twilightMid: string;
    twilightEdge: string;
    lit: string;
    signal: string;
};

function sunPaint(): SunPaint {
    return {
        core: iconPaint('--surface-sun-core'),
        inner: iconPaint('--surface-sun-inner'),
        mid: iconPaint('--surface-sun-mid'),
        edge: iconPaint('--surface-sun-edge'),
        twilightCore: iconPaint('--surface-twilight-core'),
        twilightMid: iconPaint('--surface-twilight-mid'),
        twilightEdge: iconPaint('--surface-twilight-edge'),
        lit: iconPaint('--surface-terminator-lit'),
        signal: iconPaint('--surface-terminator-signal'),
    };
}

export function createDayNightLayer(host: LayerHost): DayNightLayer {
    const paint = sunPaint();
    const motion = createSunMotion({ reducedMotion: host.reducedMotion });
    const mixFade = createFade(0, AVERAGE_FADE_MS, host.reducedMotion);
    let images: DayNightImages | undefined;
    let half: LayerCanvas | null = null;
    let halfGlow: LayerCanvas | null = null;
    let sprite: LayerCanvas | null = null;
    let lastMs: number | null = null;
    let model: HybridModel | null = null;

    const lightSprite = (): LayerCanvas | null => {
        if (sprite) return sprite;
        sprite = host.canvas(32, 32);
        if (!sprite) return null;
        const g = sprite.ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, paint.core);
        g.addColorStop(0.18, paint.inner);
        g.addColorStop(0.5, paint.mid);
        g.addColorStop(1, paint.edge);
        sprite.ctx.fillStyle = g;
        sprite.ctx.fillRect(0, 0, 32, 32);
        return sprite;
    };

    const clear = (shadow: LayerCtx, glow: LayerCtx, layout: SheetLayout): void => {
        shadow.clearRect(0, 0, layout.width, layout.height);
        glow.clearRect(0, 0, layout.width, layout.height);
    };

    return {
        draw(input, shadow, glow, layout) {
            if (input.model !== model) {
                model = input.model;
                motion.reset();
            }
            const m = input.model;
            const dt = lastMs === null ? 0 : input.nowMs - lastMs;
            lastMs = input.nowMs;
            let target: SunPose | null = null;
            let averaged = false;
            let solarDay: number | null = null;
            const still = m.sub !== null;
            if (m.sub) {
                target = { lat: latOf(m.sub), lon: lonOf(m.sub) };
            } else if (input.sub) {
                solarDay = input.sub.solarDayHours;
                target = { lat: input.sub.latDeg, lon: wrapLon((m.starportLon ?? 0) + input.sub.lonFromPortDeg) };
                averaged = input.playing && localDaysPerSecond(input.rate, solarDay) > AVERAGED_ABOVE_DAYS_PER_SECOND;
            }
            if (!target) {
                clear(shadow, glow, layout);
                return { drawn: false, busy: false, averaged: false, still, pose: null, mix: 0 };
            }
            mixFade.set(averaged ? 1 : 0, input.nowMs);
            const step = clockStepDeg(input.rate, solarDay, input.playing && !still, dt);
            const pose = motion.step(target, input.nowMs, step, input.jumped && !still);
            const mix = mixFade.value(input.nowMs);
            const sun = sunVector(pose.lat, pose.lon);

            const hl = halfLayout(layout);
            const field = fieldOf(hl, m.grid.n);
            const sheen = host.reducedMotion ? 0 : input.nowMs * SHEEN_PER_MS;
            images = paintDayNight(field, { sun, declinationDeg: pose.lat, mix, airless: m.airless, sheenPhase: sheen }, images);
            if (!half) half = host.canvas(hl.width, hl.height);
            if (!halfGlow) halfGlow = host.canvas(hl.width, hl.height);
            clear(shadow, glow, layout);
            if (half && halfGlow) {
                half.ctx.putImageData(host.imageData(images.shadow, hl.width, hl.height) as never, 0, 0);
                halfGlow.ctx.putImageData(host.imageData(images.glow, hl.width, hl.height) as never, 0, 0);
                shadow.imageSmoothingEnabled = true;
                glow.imageSmoothingEnabled = true;
                shadow.drawImage(half.canvas as never, 0, 0, layout.width, layout.height);
                glow.drawImage(halfGlow.canvas as never, 0, 0, layout.width, layout.height);
            }

            // Settlement lights on the dark side.
            const dot = lightSprite();
            if (dot) {
                const lights = cityLights(m, layout, sun, mix > 0 ? (s) => nightShare(s, pose.lat) : null, mix, host.reducedMotion ? 0 : input.nowMs * 0.001);
                glow.save();
                for (const light of lights) {
                    glow.globalAlpha = light.glow;
                    glow.drawImage(dot.canvas as never, light.x - light.radius, light.y - light.radius, light.radius * 2, light.radius * 2);
                }
                glow.restore();
            }

            // The subsolar reticle: a slowly turning ring with four ticks, gone when averaged.
            if (!still && mix < 0.99) drawReticle(glow, sheetPoint(layout, sun), 1 - mix, sheen, paint);

            const busy = motion.tweening || mixFade.moving(input.nowMs) || (input.playing && !still);
            return { drawn: true, busy, averaged, still, pose, mix };
        },
        reset() {
            motion.reset();
            lastMs = null;
        },
    };
}

function drawReticle(ctx: LayerCtx, at: [number, number], alpha: number, phase: number, paint: SunPaint): void {
    const [x, y] = at;
    ctx.save();
    ctx.globalAlpha = alpha;
    const core = ctx.createRadialGradient(x, y, 0, x, y, 9);
    core.addColorStop(0, paint.twilightCore);
    core.addColorStop(0.3, paint.twilightMid);
    core.addColorStop(1, paint.twilightEdge);
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = paint.lit;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(x, y, 7.5, 0, Math.PI * 2);
    ctx.stroke();
    ctx.strokeStyle = paint.signal;
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    const turn = phase * 0.35;
    for (let i = 0; i < 4; i += 1) {
        const a = turn + i * Math.PI / 2;
        ctx.moveTo(x + Math.cos(a) * 10, y + Math.sin(a) * 10);
        ctx.lineTo(x + Math.cos(a) * 14, y + Math.sin(a) * 14);
    }
    ctx.stroke();
    ctx.restore();
}
