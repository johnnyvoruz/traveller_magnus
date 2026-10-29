/**
 * The chart as a print-quality image (streams/D.md DP1). The pure parts are at the top and run in
 * node: the fit, the file name and the caption come from capture/paper.ts. `captureChart` draws one
 * frame of the live renderer into an off-screen canvas at the paper's pixels, lays the ring, the
 * ripple and the ships' tracks over it as the screen does, writes the caption, and hands the PNG
 * to the browser through platform/browser.ts. Nothing on screen is drawn to.
 */
import { createCanvas, canvasToBlob, saveBlob } from '../platform/browser.ts';
import { clampPpp, toScreen, type Camera, type Viewport } from './camera.ts';
import { hexCentre, hexCorners, type Rect } from './geometry.ts';
import type { MapRenderer } from './MapRenderer.ts';
import type { MapTheme } from './theme.ts';
import { drawTracks, type TrafficInk } from './traffic.ts';
import { drawRing, type JumpRing, type RingInk } from './jump_ring.ts';
import { drawRipple, type NewsInk, type RippleFrame } from './news_layer.ts';
import {
    CAPTION_PX, captionY, FILL, orientationFor, paperPixels,
    type CaptureArea, type Look, type Paper, type PaperPixels,
} from '../capture/paper.ts';

export { captionText, captureName } from '../capture/paper.ts';

/**
 * A camera that puts `rect` in the middle of a `width` by `height` image, filling `fill` of the room
 * on its tighter side. The zoom is clamped as the chart's is, so a tiny area never goes past the
 * chart's closest zoom.
 */
export function captureCamera(rect: Rect, width: number, height: number, fill: number = FILL): Camera {
    const worldW = rect.x1 - rect.x0;
    const worldH = rect.y1 - rect.y0;
    let ppp = Number.POSITIVE_INFINITY;
    if (worldW > 0) ppp = Math.min(ppp, (width * fill) / worldW);
    if (worldH > 0) ppp = Math.min(ppp, (height * fill) / worldH);
    if (!Number.isFinite(ppp)) ppp = 1;
    return { x: (rect.x0 + rect.x1) / 2, y: (rect.y0 + rect.y1) / 2, ppp: clampPpp(ppp) };
}

/** The paper's pixels for this area: the orientation follows the area's own shape. */
export function paperFor(rect: Rect, paper: Paper): PaperPixels {
    return paperPixels(paper, orientationFor(rect.x1 - rect.x0, rect.y1 - rect.y0));
}

/** The caption, one line centred in the lower margin. The font and ink come from the theme in use. */
export function drawCaption(ctx: CanvasRenderingContext2D, text: string, width: number, height: number, font: string, ink: string): void {
    ctx.save();
    ctx.font = CAPTION_PX + 'px ' + font;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = ink;
    ctx.globalAlpha = 1;
    ctx.fillText(text, width / 2, captionY(height));
    ctx.restore();
}

/** What the image keeps: a box of the chart (the screen), or a set of hexes (a subsector, a sector). */
export type CaptureClip = { rect: Rect; hexes?: readonly { q: number; r: number }[] };

/**
 * The rest is paper: the chart drew to the canvas's edge, as it does on screen, so the room outside
 * the area is painted back in the background. A subsector or a sector ends along its own hexes, as
 * hex columns interleave and a box round them would keep slivers of the next column and row; the
 * screen's area is a plain box. The caption below never meets a hex.
 */
export function paintMargins(ctx: CanvasRenderingContext2D, cam: Camera, vp: Viewport, clip: CaptureClip, paper: string): void {
    const outside = new Path2D();
    outside.rect(-1, -1, vp.width + 2, vp.height + 2);
    if (clip.hexes && clip.hexes.length > 0) {
        for (const hex of clip.hexes) {
            const centre = hexCentre(hex.q, hex.r);
            const corners = hexCorners(centre.x, centre.y);
            for (let i = 0; i < 6; i++) {
                const at = toScreen(cam, vp, corners[i * 2], corners[i * 2 + 1]);
                if (i === 0) outside.moveTo(at.sx, at.sy);
                else outside.lineTo(at.sx, at.sy);
            }
            outside.closePath();
        }
    } else {
        const a = toScreen(cam, vp, clip.rect.x0, clip.rect.y0);
        const b = toScreen(cam, vp, clip.rect.x1, clip.rect.y1);
        outside.rect(Math.min(a.sx, b.sx), Math.min(a.sy, b.sy), Math.abs(b.sx - a.sx), Math.abs(b.sy - a.sy));
    }
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = paper;
    // Every point in exactly one hex (or in the box) is odd, so it stays; the rest is filled.
    ctx.fill(outside, 'evenodd');
    ctx.restore();
}

export type ChartCapture = {
    renderer: MapRenderer;
    /** The area to fit, in parsecs. */
    rect: Rect;
    /** The hexes the image keeps (a subsector, a sector); absent keeps the box of `rect` (the screen). */
    hexes?: readonly { q: number; r: number }[];
    area: CaptureArea;
    paper: Paper;
    look: Look;
    /** The theme the frame is drawn in: the print theme, or the screen's with no title fade. */
    theme: MapTheme;
    inks: { traffic: TrafficInk; ring: RingInk; news: NewsInk };
    /** What the screen shows at this moment, or null when it is off. */
    ring: JumpRing | null;
    ripple: RippleFrame | null;
    caption: string;
    fileName: string;
};

/**
 * Draws and saves. False when the browser refused the image (no context at that size, or no PNG):
 * nothing is downloaded and the caller says so.
 */
export async function captureChart(input: ChartCapture): Promise<boolean> {
    const px = paperFor(input.rect, input.paper);
    const canvas = createCanvas(px.deviceWidth, px.deviceHeight);
    const cam = captureCamera(input.rect, px.width, px.height);
    // An area (a subsector, a sector) draws only its own worlds (DF20): the margins cover the rest, but a name below a
    // world in the row above would otherwise run over the area's top hexes.
    const frame = input.renderer.drawInto(canvas, cam, px.width, px.height, px.dpr, input.theme, { titleTop: 0, workspaceLeft: 0, selection: null, only: input.hexes });
    if (!frame) return false;
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const vp: Viewport = { width: px.width, height: px.height };
    ctx.setTransform(px.dpr, 0, 0, px.dpr, 0, 0);
    // Over the chart in the screen's order: the jump ring, the news ripple, then the ships' tracks at rest.
    if (input.ring) drawRing(ctx, cam, vp, input.ring, input.inks.ring);
    if (input.ripple) drawRipple(ctx, cam, vp, input.ripple, input.inks.news);
    if (frame.tracks.length > 0) drawTracks(ctx, frame.tracks, { alpha: 1, scale: 1 }, input.inks.traffic);
    paintMargins(ctx, cam, vp, { rect: input.rect, hexes: input.hexes }, input.theme.bg0);
    drawCaption(ctx, input.caption, px.width, px.height, input.theme.fontData, input.theme.textMuted);
    const blob = await canvasToBlob(canvas);
    if (!blob) return false;
    saveBlob(blob, input.fileName);
    return true;
}

/** The one line said when the browser refuses the size. */
export const TOO_LARGE = 'This browser can\'t make an image that large. Try a smaller paper.';
