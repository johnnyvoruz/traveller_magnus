/**
 * One surface map, off screen, at the paper's pixels (CS11). The live canvases are not
 * touched. Paper is ink on white. Full colour is the painted sheet, without the hover tags
 * and without the day-and-night layer, which is the WebGL pass.
 */
import { captionY, CAPTION_PX, FILL, paperPixels, type Look, type Paper } from '../capture/paper.ts';
import { createCanvas, canvasToBlob, now, saveBlob } from '../platform/browser.ts';
import { CONTINENTAL_DEFINITION, COASTLINE_COMPLEXITY, VANILLA_MASTER_SEED, diamondMapSpec, worldMapData } from './identity.ts';
import { createHybridPaint } from './hybrid/paint.ts';
import { layoutFor, type SheetLayout } from './hybrid/field.ts';
import { latticeNet, NET_HEIGHT, NET_WIDTH } from './hybrid/grid.ts';
import { drawCode, type IconSet } from './hybrid/icons.ts';
import { CODE_TABLE, type SurfaceCode } from './hybrid/codes.ts';
import type { HexRecord, HybridModel } from './hybrid/model.ts';
import { drawSymbols, legendBlocks, legendGroups } from './hybrid/symbols.ts';
import { createChunkedMap } from './map_chunks.ts';
import type { SurfaceInk } from './print_theme.ts';
import { applyDiamondClip, drawDiamondSeparators, drawHexGrid } from './vanilla/map_grid.ts';
import { parseStat } from './vanilla/map_palette.ts';
import type { DiamondMapInputs } from './vanilla/map.ts';

/** Room under the projection for the key and the caption, in CSS pixels. */
export const SURFACE_BAND = 188;

export const TOO_LARGE = 'This browser can\'t make an image that large. Try a smaller paper.';

export type SurfaceModeName = 'enhanced' | 'vanilla';

export type SurfaceShot = {
    mode: SurfaceModeName;
    model: HybridModel | null;
    iconSet: IconSet | null;
    body: Record<string, unknown>;
    hexKey: string;
    /** Symbols are on in the view. The saved full-colour sheet draws them, and not the hover. */
    symbols: boolean;
    worldName: string;
};

/** Wider than tall: the hybrid net, and the vanilla diamond. */
export function projectionAspect(mode: SurfaceModeName): number {
    return mode === 'enhanced' ? NET_WIDTH / NET_HEIGHT : 2;
}

/**
 * Where the projection sits, in CSS pixels. It keeps its aspect, inside the fill, and leaves
 * SURFACE_BAND along the bottom for the key and the caption.
 */
export function projectionFrame(cssW: number, cssH: number, aspect: number): { x: number; y: number; w: number; h: number } {
    const margin = cssW * (1 - FILL) / 2;
    const maxW = Math.max(1, cssW - margin * 2);
    const maxH = Math.max(1, cssH - SURFACE_BAND - margin);
    let w = maxW;
    let h = w / aspect;
    if (h > maxH) {
        h = maxH;
        w = h * aspect;
    }
    return { x: (cssW - w) / 2, y: margin, w, h };
}

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

function channels(colour: string): [number, number, number] {
    const text = colour.trim();
    const hex = /^#([0-9a-f]{6})$/i.exec(text);
    if (hex) {
        const n = parseInt(hex[1], 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    const rgb = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/i.exec(text);
    if (rgb) return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])];
    return [22, 24, 28];
}

/** Four grey steps from the print tokens. Pale ground becomes ice; the darkest water stays sea. */
function greyTerrain(pixels: Uint8ClampedArray, ink: SurfaceInk): void {
    const sea = channels(ink.sea);
    const shallow = channels(ink.shallow);
    const land = channels(ink.land);
    const ice = channels(ink.ice);
    const paper = channels(ink.paper);
    for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i + 3] < 16) {
            pixels[i] = paper[0];
            pixels[i + 1] = paper[1];
            pixels[i + 2] = paper[2];
            pixels[i + 3] = 255;
            continue;
        }
        const lum = (0.2126 * pixels[i] + 0.7152 * pixels[i + 1] + 0.0722 * pixels[i + 2]) / 255;
        const tone = lum < 0.22 ? sea : lum < 0.42 ? shallow : lum < 0.72 ? land : ice;
        pixels[i] = tone[0];
        pixels[i + 1] = tone[1];
        pixels[i + 2] = tone[2];
        pixels[i + 3] = 255;
    }
}

function terrainInk(hex: HexRecord, ink: SurfaceInk): string {
    if (hex.terrain === 'SI' || hex.terrain === 'IF' || hex.terrain === 'IC' || hex.terrain === 'FR') return ink.ice;
    if (hex.terrain === 'SH') return ink.shallow;
    if (hex.water) return ink.sea;
    if (hex.accents.includes('MT')) return ink.high;
    return ink.land;
}

function swatchInk(code: SurfaceCode, ink: SurfaceInk): string {
    const kind = CODE_TABLE[code].kind;
    if (code === 'SH') return ink.shallow;
    if (kind === 'sea') return ink.sea;
    if (kind === 'ice') return ink.ice;
    if (code === 'MT') return ink.high;
    if (kind === 'land' || kind === 'accent') return ink.land;
    return ink.text;
}

type Point = [number, number];

function drawPaperNet(ctx: CanvasRenderingContext2D, model: HybridModel, layout: SheetLayout, ink: SurfaceInk, worldName: string, font: string): void {
    const grid = model.grid;
    const n = grid.n;
    const s = layout.side;
    const at = (face: (typeof grid.faces)[number], i: number, j: number): Point => {
        const [nx, ny] = latticeNet(face, n, i, j);
        return [layout.ox + nx * s, layout.oy + ny * s];
    };
    const hexAt = (fi: number, i: number, j: number): HexRecord | null => {
        if (i < 0 || j < 0 || i + j > n) return null;
        const id = grid.vid[fi][i * (n + 1) + j];
        return id >= 0 ? model.hexes[id] : null;
    };
    grid.faces.forEach((face, fi) => {
        for (let i = 0; i < n; i += 1) {
            for (let j = 0; i + j < n; j += 1) {
                const tris: [number, number][][] = [[[i, j], [i + 1, j], [i, j + 1]]];
                if (i + j + 2 <= n) tris.push([[i + 1, j], [i + 1, j + 1], [i, j + 1]]);
                for (const tri of tris) {
                    const hex = hexAt(fi, tri[0][0], tri[0][1]);
                    if (!hex) continue;
                    const p = tri.map(([a, b]) => at(face, a, b));
                    ctx.fillStyle = terrainInk(hex, ink);
                    ctx.beginPath();
                    ctx.moveTo(p[0][0], p[0][1]);
                    ctx.lineTo(p[1][0], p[1][1]);
                    ctx.lineTo(p[2][0], p[2][1]);
                    ctx.closePath();
                    ctx.fill();
                }
            }
        }
    });
    const strokeEdges = (coast: boolean): void => {
        ctx.beginPath();
        grid.faces.forEach((face, fi) => {
            for (let i = 0; i < n; i += 1) {
                for (let j = 0; i + j < n; j += 1) {
                    const pairs: [Point, Point][] = [];
                    const edge = (ai: number, aj: number, bi: number, bj: number): void => {
                        const a = hexAt(fi, ai, aj);
                        const b = hexAt(fi, bi, bj);
                        if (!a || !b) return;
                        if (coast && a.water === b.water) return;
                        pairs.push([at(face, ai, aj), at(face, bi, bj)]);
                    };
                    edge(i, j, i + 1, j);
                    edge(i, j, i, j + 1);
                    if (i + j + 1 <= n) edge(i + 1, j, i, j + 1);
                    for (const [a, b] of pairs) {
                        ctx.moveTo(a[0], a[1]);
                        ctx.lineTo(b[0], b[1]);
                    }
                }
            }
        });
        ctx.stroke();
    };
    ctx.lineJoin = 'round';
    ctx.strokeStyle = ink.grid;
    ctx.lineWidth = Math.max(0.3, (s / n) * 0.035);
    strokeEdges(false);
    ctx.strokeStyle = ink.coast;
    ctx.lineWidth = Math.max(0.7, (s / n) * 0.07);
    strokeEdges(true);
    if (model.starportHex === null || !worldName) return;
    grid.faces.forEach((face, fi) => {
        for (let i = 0; i <= n; i += 1) {
            for (let j = 0; i + j <= n; j += 1) {
                const hex = hexAt(fi, i, j);
                if (!hex || hex.id !== model.starportHex) continue;
                const [x, y] = at(face, i, j);
                ctx.font = '12px ' + font;
                ctx.textAlign = 'center';
                ctx.textBaseline = 'bottom';
                ctx.lineWidth = 3;
                ctx.strokeStyle = ink.paper;
                ctx.strokeText(worldName, x, y - 2);
                ctx.fillStyle = ink.text;
                ctx.fillText(worldName, x, y - 2);
            }
        }
    });
}

function drawLegend(ctx: CanvasRenderingContext2D, model: HybridModel, iconSet: IconSet | null, ink: SurfaceInk, frame: { x: number; y: number; w: number; h: number }, font: string, look: Look, screenText: string): void {
    const codes = legendBlocks(legendGroups(model).here).flatMap((block) => block.codes);
    if (codes.length === 0) return;
    const cols = codes.length > 18 ? 4 : 3;
    const rowH = 14;
    const colW = frame.w / cols;
    const top = frame.y + frame.h + 10;
    ctx.font = '11px ' + font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    codes.forEach((code, index) => {
        const x = frame.x + (index % cols) * colW;
        const y = top + Math.floor(index / cols) * rowH;
        ctx.fillStyle = look === 'paper' ? swatchInk(code, ink) : ink.text;
        ctx.fillRect(x, y - 5, 10, 10);
        if (look === 'screen') drawCode(ctx, iconSet, code, x + 5, y, 5, ink.text);
        ctx.fillStyle = look === 'paper' ? ink.text : screenText;
        ctx.fillText(CODE_TABLE[code].name, x + 14, y);
    });
}

async function paintVanilla(inputs: DiamondMapInputs, width: number, height: number, wait: () => Promise<void>): Promise<Uint8ClampedArray | null> {
    const job = createChunkedMap(inputs, now, 24, { width, height });
    while (!job.step()) await wait();
    return job.pixels;
}

async function paintHybrid(model: HybridModel, layout: SheetLayout, wait: () => Promise<void>): Promise<Uint8ClampedArray> {
    const job = createHybridPaint(() => model, layout, now, 24, [], null, { cacheField: false });
    while (!job.step()) await wait();
    return job.pixels;
}

export type SurfaceCaptureInput = {
    shot: SurfaceShot;
    paper: Paper;
    look: Look;
    ink: SurfaceInk;
    ground: string;
    /** Words on the full-colour page. Paper uses the print text tokens. */
    screenText: string;
    font: string;
    caption: string;
    fileName: string;
    /** Yields between paint steps so the page can breathe. */
    wait?: () => Promise<void>;
};

/** Draws one frame and downloads it. False when the browser refuses the canvas or the blob. */
export async function captureSurface(input: SurfaceCaptureInput): Promise<boolean> {
    const px = paperPixels(input.paper, 'landscape');
    const canvas = createCanvas(px.deviceWidth, px.deviceHeight);
    const ctx = canvas.getContext('2d');
    if (!ctx) return false;
    const wait = input.wait ?? ((): Promise<void> => Promise.resolve());
    const frame = projectionFrame(px.width, px.height, projectionAspect(input.shot.mode));
    const dw = Math.max(1, Math.round(frame.w * px.dpr));
    const dh = Math.max(1, Math.round(frame.h * px.dpr));
    ctx.setTransform(px.dpr, 0, 0, px.dpr, 0, 0);
    ctx.fillStyle = input.look === 'paper' ? input.ink.paper : input.ground;
    ctx.fillRect(0, 0, px.width, px.height);

    if (input.shot.mode === 'enhanced' && input.shot.model) {
        const model = input.shot.model;
        if (input.look === 'paper') {
            ctx.save();
            ctx.translate(frame.x, frame.y);
            const layout = layoutFor(frame.w, frame.h, frame.h / NET_HEIGHT);
            drawPaperNet(ctx, model, layout, input.ink, input.shot.worldName, input.font);
            ctx.restore();
        } else {
            const layout = layoutFor(dw, dh, dh / NET_HEIGHT);
            const pixels = await paintHybrid(model, layout, wait);
            const scratch = createCanvas(dw, dh);
            const painted = scratch.getContext('2d');
            if (!painted) return false;
            painted.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, dw, dh), 0, 0);
            if (input.shot.symbols) {
                drawSymbols(painted, model, layout, { set: input.shot.iconSet, outlines: false, icons: true });
            }
            ctx.drawImage(scratch, frame.x, frame.y, frame.w, frame.h);
        }
        drawLegend(ctx, model, input.shot.iconSet, input.ink, frame, input.font, input.look, input.screenText);
    } else {
        const spec = diamondMapSpec(input.shot.body, input.shot.hexKey);
        if (!spec) return false;
        const vanilla: DiamondMapInputs = {
            worldData: spec.worldData,
            imageSeed: spec.seed,
            masterSeed: VANILLA_MASTER_SEED,
            continentalDefinition: CONTINENTAL_DEFINITION,
            coastlineComplexity: COASTLINE_COMPLEXITY,
            printMode: false,
        };
        const pixels = await paintVanilla(vanilla, dw, dh, wait);
        if (!pixels) return false;
        if (input.look === 'paper') greyTerrain(pixels, input.ink);
        const scratch = createCanvas(dw, dh);
        const painted = scratch.getContext('2d');
        if (!painted) return false;
        painted.putImageData(new ImageData(pixels as Uint8ClampedArray<ArrayBuffer>, dw, dh), 0, 0);
        ctx.drawImage(scratch, frame.x, frame.y, frame.w, frame.h);
        if (input.look === 'paper') {
            const sizeCode = parseStat(worldMapData(input.shot.body).size);
            ctx.save();
            ctx.translate(frame.x, frame.y);
            ctx.save();
            applyDiamondClip(ctx, frame.w, frame.h, 5);
            drawHexGrid(ctx, frame.w, frame.h, sizeCode, 5, input.ink.grid, 0.6);
            ctx.restore();
            drawDiamondSeparators(ctx, frame.w, frame.h, 5, input.ink.coast, 1);
            ctx.font = '12px ' + input.font;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.lineWidth = 3;
            ctx.strokeStyle = input.ink.paper;
            ctx.strokeText(input.shot.worldName, frame.w / 2, frame.h / 2);
            ctx.fillStyle = input.ink.text;
            ctx.fillText(input.shot.worldName, frame.w / 2, frame.h / 2);
            ctx.restore();
        }
    }

    ctx.setTransform(px.dpr, 0, 0, px.dpr, 0, 0);
    drawCaption(ctx, input.caption, px.width, px.height, input.font, input.look === 'paper' ? input.ink.muted : input.screenText);
    const blob = await canvasToBlob(canvas);
    if (!blob) return false;
    saveBlob(blob, input.fileName);
    return true;
}
