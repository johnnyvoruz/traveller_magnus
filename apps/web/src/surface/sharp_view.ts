/**
 * Draws the sharp window over the baked sheet and keeps it aligned while
 * the visitor pans. A wheel or pinch burst waits until it stops, then the
 * window is painted in slices of about one frame. The bake shows through
 * until those pixels are ready, and through any strip still being filled.
 */
import { cancelFrame, createCanvas, nextFrame, now } from '../platform/browser.ts';
import type { SurfaceMode } from './contracts.ts';
import type { SheetLayout } from './hybrid/field.ts';
import { createHybridPaint, type HybridPaintJob } from './hybrid/paint.ts';
import type { HybridModel } from './hybrid/model.ts';
import type { MapView } from './hybrid/view.ts';
import { cropFrame, panStrips, sharpFrame, sharpPlacement, type SharpFrame } from './sharp.ts';
import type { DiamondMapInputs } from './vanilla/map.ts';
import { createDiamondWindow, type DiamondWindowJob } from './vanilla/map_window.ts';

/** Quiet time after the last wheel or pinch event before the window is redrawn. */
export const SHARP_BURST_MS = 120;
/** Quiet time after the last pan before the new edge is filled. */
export const SHARP_PAN_MS = 80;

const MARGIN = 2;

export type SharpRead = {
    readonly active: boolean;
    readonly mode: SurfaceMode;
    readonly model: HybridModel | null;
    readonly vanilla: DiamondMapInputs | null;
    readonly base: SheetLayout;
    readonly view: MapView;
    readonly stageW: number;
    readonly stageH: number;
    readonly dpr: number;
};

export type SharpBox = {
    live: boolean;
    placement: { left: string; top: string; width: string; height: string } | null;
};

type Hold = {
    view: MapView;
    stageW: number;
    stageH: number;
    dpr: number;
    frame: SharpFrame;
};

type Job = HybridPaintJob | DiamondWindowJob;

export function mountSharpView(args: {
    canvas: () => HTMLCanvasElement | null;
    read: () => SharpRead | null;
    onChange: () => void;
    onPaint?: (info: { ms: number; kind: 'window' | 'edge'; pixels: number; longestMs: number }) => void;
}): { box: SharpBox; note: (reason: 'burst' | 'step' | 'pan') => void; stop: () => void } {
    const box: SharpBox = { live: false, placement: null };
    let gen = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    let raf = 0;
    let hold: Hold | null = null;
    let spare: HTMLCanvasElement | null = null;
    /** True while an edge strip is still being painted. A pan then redraws the whole view. */
    let filling = false;

    function changed(): void {
        args.onChange();
    }

    function hide(): void {
        if (!box.live && box.placement === null) return;
        box.live = false;
        changed();
    }

    function clearTimer(): void {
        if (timer !== null) {
            clearTimeout(timer);
            timer = null;
        }
        if (raf) {
            cancelFrame(raf);
            raf = 0;
        }
    }

    function show(at: Hold): void {
        hold = at;
        const place = sharpPlacement(at.view, at.stageW, at.stageH);
        box.placement = {
            left: place.left + 'px',
            top: place.top + 'px',
            width: place.width + 'px',
            height: place.height + 'px',
        };
        box.live = true;
        changed();
    }

    function paintFull(token: number): void {
        const spec = args.read();
        if (!spec || !spec.active) {
            hide();
            hold = null;
            return;
        }
        const frame = sharpFrame(spec.base, spec.view, spec.stageW, spec.stageH, spec.dpr);
        if (!frame) {
            hide();
            hold = null;
            return;
        }
        const view = spec.view;
        const stageW = spec.stageW;
        const stageH = spec.stageH;
        const dpr = spec.dpr;
        const mode = spec.mode;
        const began = now();
        let job: Job;
        if (mode === 'enhanced' && spec.model) {
            const model = spec.model;
            job = createHybridPaint(() => model, frame.layout, now, 16, [], null, { place: spec.base, cacheField: false });
        } else if (spec.vanilla) {
            job = createDiamondWindow(
                spec.vanilla, frame.width, frame.height,
                frame.bakeX, frame.bakeY, frame.bakeX + frame.bakeW, frame.bakeY + frame.bakeH,
                now, 16,
            );
        } else {
            return;
        }
        const tick = (): void => {
            if (token !== gen) return;
            if (!job.step()) {
                raf = nextFrame(tick);
                return;
            }
            raf = 0;
            const canvas = args.canvas();
            const ctx = canvas ? canvas.getContext('2d') : null;
            if (!canvas || !ctx) return;
            if (canvas.width !== frame.width || canvas.height !== frame.height) {
                canvas.width = frame.width;
                canvas.height = frame.height;
            }
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            ctx.putImageData(new ImageData(job.pixels as Uint8ClampedArray<ArrayBuffer>, frame.width, frame.height), 0, 0);
            const at: Hold = { view, stageW, stageH, dpr, frame };
            show(at);
            args.onPaint?.({ ms: now() - began, kind: 'window', pixels: frame.pixels, longestMs: job.longestMs });
            settlePan(token);
        };
        raf = nextFrame(tick);
    }

    function shift(canvas: HTMLCanvasElement, kx: number, ky: number): void {
        const w = canvas.width;
        const h = canvas.height;
        if (!spare || spare.width !== w || spare.height !== h) spare = createCanvas(w, h);
        const from = spare.getContext('2d');
        const ctx = canvas.getContext('2d');
        if (!from || !ctx) return;
        from.setTransform(1, 0, 0, 1, 0, 0);
        from.clearRect(0, 0, w, h);
        from.drawImage(canvas, kx, ky);
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, w, h);
        ctx.drawImage(spare, 0, 0);
    }

    function paintStrips(token: number, rects: Array<[number, number, number, number]>, index: number, began: number): void {
        if (token !== gen) return;
        const spec = args.read();
        const canvas = args.canvas();
        if (!spec || !spec.active || !hold || !canvas || index >= rects.length) {
            filling = false;
            if (hold && token === gen) {
                args.onPaint?.({
                    ms: now() - began,
                    kind: 'edge',
                    pixels: rects.reduce((sum, r) => sum + Math.max(0, r[2] - r[0]) * Math.max(0, r[3] - r[1]), 0),
                    longestMs: 0,
                });
                settlePan(token);
            }
            return;
        }
        const [x0, y0, x1, y1] = rects[index];
        if (x1 <= x0 || y1 <= y0) {
            paintStrips(token, rects, index + 1, began);
            return;
        }
        const frame = hold.frame;
        let job: Job;
        let destW = x1 - x0;
        let destH = y1 - y0;
        let originX = x0;
        let originY = y0;
        let copyX = 0;
        let copyY = 0;
        if (spec.mode === 'enhanced' && spec.model) {
            const gx0 = Math.max(0, x0 - MARGIN);
            const gy0 = Math.max(0, y0 - MARGIN);
            const gx1 = Math.min(frame.width, x1 + MARGIN);
            const gy1 = Math.min(frame.height, y1 + MARGIN);
            destW = gx1 - gx0;
            destH = gy1 - gy0;
            originX = gx0;
            originY = gy0;
            copyX = x0 - gx0;
            copyY = y0 - gy0;
            const model = spec.model;
            job = createHybridPaint(() => model, cropFrame(frame.layout, gx0, gy0, gx1, gy1), now, 16, [], null, {
                place: spec.base,
                cacheField: false,
            });
        } else if (spec.vanilla) {
            const mapX0 = frame.bakeX + (x0 / frame.width) * frame.bakeW;
            const mapY0 = frame.bakeY + (y0 / frame.height) * frame.bakeH;
            const mapX1 = frame.bakeX + (x1 / frame.width) * frame.bakeW;
            const mapY1 = frame.bakeY + (y1 / frame.height) * frame.bakeH;
            job = createDiamondWindow(spec.vanilla, destW, destH, mapX0, mapY0, mapX1, mapY1, now, 16);
        } else {
            filling = false;
            return;
        }
        const tick = (): void => {
            if (token !== gen) return;
            if (!job.step()) {
                raf = nextFrame(tick);
                return;
            }
            raf = 0;
            const ctx = canvas.getContext('2d');
            if (!ctx) return;
            const cropW = x1 - x0;
            const cropH = y1 - y0;
            const image = new ImageData(cropW, cropH);
            const src = job.pixels;
            for (let row = 0; row < cropH; row += 1) {
                const from = ((copyY + row) * destW + copyX) * 4;
                image.data.set(src.subarray(from, from + cropW * 4), row * cropW * 4);
            }
            ctx.putImageData(image, originX + copyX, originY + copyY);
            paintStrips(token, rects, index + 1, began);
        };
        raf = nextFrame(tick);
    }

    function settlePan(token: number): void {
        if (token !== gen || !hold) return;
        const spec = args.read();
        if (!spec || !spec.active) return;
        if (spec.view.zoom !== hold.view.zoom || spec.stageW !== hold.stageW || spec.stageH !== hold.stageH || spec.dpr !== hold.dpr) {
            hide();
            paintFull(token);
            return;
        }
        const kx = Math.trunc((spec.view.x - hold.view.x) * hold.dpr);
        const ky = Math.trunc((spec.view.y - hold.view.y) * hold.dpr);
        if (kx === 0 && ky === 0) return;
        const canvas = args.canvas();
        if (!canvas || Math.abs(kx) >= canvas.width || Math.abs(ky) >= canvas.height) {
            hide();
            paintFull(token);
            return;
        }
        shift(canvas, kx, ky);
        const view = { zoom: hold.view.zoom, x: hold.view.x + kx / hold.dpr, y: hold.view.y + ky / hold.dpr };
        const frame = sharpFrame(spec.base, view, hold.stageW, hold.stageH, hold.dpr);
        if (!frame) {
            hide();
            paintFull(token);
            return;
        }
        // The shifted bitmap is this frame: pixel kx holds what pixel 0 held.
        show({ ...hold, view, frame });
        const rects = panStrips(canvas.width, canvas.height, kx, ky);
        filling = rects.length > 0;
        paintStrips(token, rects, 0, now());
    }

    function note(reason: 'burst' | 'step' | 'pan'): void {
        gen += 1;
        const token = gen;
        clearTimer();
        const spec = args.read();
        if (!spec || !spec.active) {
            hide();
            hold = null;
            return;
        }
        const frame = sharpFrame(spec.base, spec.view, spec.stageW, spec.stageH, spec.dpr);
        if (!frame) {
            hide();
            hold = null;
            return;
        }
        if (reason === 'pan' && !filling && hold && hold.view.zoom === spec.view.zoom && hold.dpr === spec.dpr && hold.stageW === spec.stageW && hold.stageH === spec.stageH) {
            timer = setTimeout(() => {
                timer = null;
                settlePan(token);
            }, SHARP_PAN_MS);
            return;
        }
        filling = false;
        hide();
        const wait = reason === 'burst' ? SHARP_BURST_MS : reason === 'pan' ? SHARP_PAN_MS : 0;
        timer = setTimeout(() => {
            timer = null;
            paintFull(token);
        }, wait);
    }

    function stop(): void {
        gen += 1;
        clearTimer();
        filling = false;
        hide();
        hold = null;
        spare = null;
    }

    return { box, note, stop };
}
