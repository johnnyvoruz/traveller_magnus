/**
 * The system map as a print-quality image (streams/C.md CP2). The pure parts are at the top and
 * run in node: which paper way, and the camera for the system as framed or fitted. `captureOrbit`
 * draws one frame of a new OrbitRenderer into an off-screen canvas at the paper's pixels, writes
 * the caption, and hands the PNG to the browser through platform/browser.ts. The canvas on screen
 * is not passed in and is not drawn to. Discs are the renderer's own flat discs, so a machine
 * with no WebGL saves the same image.
 */
import { createCanvas, canvasToBlob, saveBlob } from '../platform/browser.ts';
import {
    CAPTION_PX, captionY, orientationFor, paperPixels,
    type Look, type Orientation, type Paper, type PaperPixels,
} from '../capture/paper.ts';
import {
    fitCamera, lineupFit, startCamera, viewOf, type Camera, type Size,
} from './camera.ts';
import { layoutScene, sceneBounds, type Plan, type View } from './layout.ts';
import { legendFor, type LegendEntry } from './legend.ts';
import { layoutLineup } from './lineup.ts';
import { OrbitRenderer } from './OrbitRenderer.ts';
import { orbitPicture, type Layers, type Mode, type Picture } from './picture.ts';
import type { OrbitTheme } from './theme.ts';

/** Room under the picture for the legend and the caption, in CSS pixels. */
export const CAPTURE_FOOT = 56;

/**
 * What the stage is showing. The view reads this and does not hand over its canvas.
 * `days` is the picture's date. The campaign date, when one is open, is the caption's.
 */
export type OrbitShot = {
    plan: Plan;
    days: number;
    cam: Camera;
    size: Size;
    layers: Layers;
    mode: Mode;
    selected: string | null;
};

/** The picture's CSS size: the paper, minus the foot. */
export function captureSize(px: PaperPixels): Size {
    return { w: px.width, h: Math.max(20, px.height - CAPTURE_FOOT) };
}

/** The whole system, fitted in `size`. A line-up is fitted at zoom 1. */
export function fittedCamera(plan: Plan, size: Size, days: number, layers: Layers, mode: Mode): Camera {
    if (mode !== 'orbits') return lineupFit(startCamera(), false);
    return fitCamera(plan, size, days, startCamera(), false, layers.linear, layers.moons, layers.jump);
}

/**
 * The system as framed. A fitted view refits in the new size. A zoomed view keeps its zoom
 * relative to the fit, the same way the stage keeps a view when the canvas changes size.
 */
export function framedCamera(plan: Plan, size: Size, days: number, cam: Camera, layers: Layers, mode: Mode): Camera {
    if (mode !== 'orbits') return lineupFit(cam, true);
    return fitCamera(plan, size, days, cam, true, layers.linear, layers.moons, layers.jump);
}

/** Portrait unless the fitted system is wider than it is tall. A row is landscape; a column is portrait. */
export function fittedOrientation(plan: Plan, days: number, layers: Layers, mode: Mode): Orientation {
    if (mode === 'row') return 'landscape';
    if (mode === 'column') return 'portrait';
    const size: Size = { w: 1000, h: 1000 };
    const cam = fittedCamera(plan, size, days, layers, 'orbits');
    const view = viewOf(cam, size, layers.linear, layers.moons, layers.jump);
    const bounds = sceneBounds(plan, view, days);
    return orientationFor(bounds.right - bounds.left, bounds.bottom - bounds.top);
}

function laidOut(plan: Plan, cam: Camera, size: Size, days: number, layers: Layers, mode: Mode): { view: View; picture: Picture } {
    const view = viewOf(cam, size, layers.linear, layers.moons, layers.jump);
    if (mode !== 'orbits') return { view, picture: layoutLineup(plan, view, mode, days, layers) };
    return { view, picture: orbitPicture(plan, layoutScene(plan, view, days), layers, view.z) };
}

/** The caption, one line centred in the lower margin. The same line the chart writes. */
function drawCaption(ctx: CanvasRenderingContext2D, text: string, width: number, height: number, font: string, ink: string): void {
    ctx.save();
    ctx.font = CAPTION_PX + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.globalAlpha = 1;
    ctx.fillText(text, width / 2, captionY(height));
    ctx.restore();
}

/** The legend, one row in the foot: the habitable zone, the jump limit, the mainworld. */
function drawKey(ctx: CanvasRenderingContext2D, entries: readonly LegendEntry[], theme: OrbitTheme, width: number, height: number): void {
    if (entries.length === 0) return;
    const y = height - CAPTURE_FOOT + 18;
    let x = 18;
    ctx.save();
    ctx.font = CAPTION_PX + 'px ' + theme.fontText;
    ctx.textBaseline = 'middle';
    ctx.globalAlpha = 1;
    for (const entry of entries) {
        if (entry.kind === 'jump') {
            ctx.strokeStyle = theme.jump;
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(x + 6, y, 5, 0, Math.PI * 2);
            ctx.stroke();
        } else if (entry.kind === 'mainworld') {
            ctx.fillStyle = theme.mainworld;
            ctx.beginPath();
            ctx.arc(x + 6, y, 3.5, 0, Math.PI * 2);
            ctx.fill();
        } else {
            ctx.fillStyle = theme.hzMid;
            ctx.fillRect(x, y - 5, 14, 10);
        }
        x += 20;
        ctx.fillStyle = theme.text;
        ctx.textAlign = 'left';
        const label = entry.label;
        ctx.fillText(label, x, y);
        x += ctx.measureText(label).width + 18;
        if (x > width - 24) break;
    }
    ctx.restore();
}

export type OrbitCapture = {
    shot: OrbitShot;
    /** What's on screen, or the whole system fitted. */
    area: 'framed' | 'fitted';
    paper: Paper;
    look: Look;
    /** The print theme, or the screen's. Read by the caller; this file does not touch the page. */
    theme: OrbitTheme;
    caption: string;
    fileName: string;
};

/**
 * Draws and saves. False when the browser refused the image (no context at that size, or no PNG):
 * nothing is downloaded and the caller says so.
 */
export async function captureOrbit(input: OrbitCapture): Promise<boolean> {
    const orientation = input.area === 'framed'
        ? orientationFor(input.shot.size.w, input.shot.size.h)
        : fittedOrientation(input.shot.plan, input.shot.days, input.shot.layers, input.shot.mode);
    const px = paperPixels(input.paper, orientation);
    const canvas = createCanvas(px.deviceWidth, px.deviceHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const size = captureSize(px);
    const cam = input.area === 'fitted'
        ? fittedCamera(input.shot.plan, size, input.shot.days, input.shot.layers, input.shot.mode)
        : framedCamera(input.shot.plan, size, input.shot.days, input.shot.cam, input.shot.layers, input.shot.mode);
    const frame = laidOut(input.shot.plan, cam, size, input.shot.days, input.shot.layers, input.shot.mode);
    // No shaded-disc painter: the flat discs, on a machine with a GPU and on one without.
    const renderer = new OrbitRenderer(ctx, input.theme, {
        makeCanvas: input.look === 'screen' ? createCanvas : null,
        loadImage: null,
        artBase: '',
        stale: () => undefined,
        discs: null,
    });
    renderer.resize(px.width, px.height, px.dpr);
    renderer.draw(input.shot.plan, frame.picture, frame.view, {
        selected: input.look === 'screen' ? input.shot.selected : null,
        days: input.shot.days,
        time: 0,
        motion: false,
        layers: input.shot.layers,
    });
    ctx.setTransform(px.dpr, 0, 0, px.dpr, 0, 0);
    ctx.globalAlpha = 1;
    ctx.fillStyle = input.theme.space;
    ctx.fillRect(0, px.height - CAPTURE_FOOT, px.width, CAPTURE_FOOT);
    if (input.look === 'paper') drawKey(ctx, legendFor(input.shot.plan, frame.picture, input.shot.layers), input.theme, px.width, px.height);
    drawCaption(ctx, input.caption, px.width, px.height, input.theme.fontText, input.theme.textMuted);
    const blob = await canvasToBlob(canvas);
    if (!blob) return false;
    saveBlob(blob, input.fileName);
    return true;
}

/** The one line said when the browser refuses the size. The chart says the same. */
export const TOO_LARGE = 'This browser can\'t make an image that large. Try a smaller paper.';
