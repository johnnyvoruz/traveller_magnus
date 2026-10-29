/**
 * The painted hexes on the orbit view's disc (streams/D.md DW2c; design §13.9). The WebGL disc draws
 * its own program from the world's profile (enhanced/draw.ts), not from the hybrid sheet, so a kept
 * map showed on the dossier's stage and the soft globe but not there. The page builds one small
 * equirectangular texture per body from the edited model: the painted hexes in the palette's colours
 * with alpha 255, everything else clear. The disc program lays it over the albedo before the light
 * (premultiplied, so the edge blends to the hex outline and nothing darkens), under the same sun,
 * clouds and city lights; an unpainted pixel is untouched, and a body with no paint sends nothing.
 * Keyed on the world and the edits' digest, so a kept map repaints and the generated world is the
 * answer with none. Vanilla has no edits. The texel grid is the soft globe's (soft/globe.ts
 * texelLat, texelLon) and the disc reads it the way the soft disc reads its globe.
 */
import { afterTask } from '../platform/browser.ts';
import { terrainRgb, type RGB } from './hybrid/codes.ts';
import { fieldOf, SHEET_LAYOUT } from './hybrid/field.ts';
import { cachedHybridModel, hybridModelWith, rememberHybridModel } from './hybrid/index.ts';
import { worldDigest, type HybridWorld } from './hybrid/inputs.ts';
import { startHybridBuild, type HexRecord, type HybridModel } from './hybrid/model.ts';
import { seaColoursOf, type SeaColours } from './hybrid/paint.ts';
import type { HexEdits } from './hybrid/serialize.ts';
import { editsDigest } from './paint_edits.ts';
import { netPixel, texelLat, texelLon } from './soft/globe.ts';

/** Rows of the texture: 1024 × 512 texels, about one per pixel at the equator of the largest disc. */
export const PAINT_ROWS = 512;

export type PaintTexture = {
    readonly key: string;
    readonly width: number;
    readonly height: number;
    /** RGBA, premultiplied: the colour where a hex is painted, zero elsewhere. */
    readonly pixels: Uint8ClampedArray;
};

/** The key a body's paint is held under: the world, its data and the edits; '' for no edits. */
export function paintKeyOf(world: HybridWorld, edits: HexEdits | null): string {
    const digest = editsDigest(edits);
    return digest ? world.seed + '|' + worldDigest(world) + '|' + digest : '';
}

/** A painted hex's flat colour: the sea's own for water (deep, shallow, the two ices), the palette's for land. */
export function hexPaintRgb(rec: Pick<HexRecord, 'water' | 'terrain'>, sea: SeaColours): RGB {
    if (rec.water) {
        if (rec.terrain === 'SH') return sea.shallow;
        if (rec.terrain === 'SI') return sea.iceShallow;
        if (rec.terrain === 'IF') return sea.iceDeep;
        return sea.deep;
    }
    return terrainRgb(rec.terrain);
}

export type PaintBuild = {
    /** One slice of rows. True when the texture is finished. */
    step(): boolean;
    /** The texture, or null when no hex is painted. Only after step() returned true. */
    texture(): PaintTexture | null;
};

/**
 * The texture built in slices (the page paints without stalling a frame): each row is one latitude,
 * each texel the hex under it on the net, through the sheet's field (the nearest hex per sheet pixel).
 */
export function startPaintTexture(model: HybridModel, rows = PAINT_ROWS, rowsPerStep = 32): PaintBuild {
    const W = rows * 2;
    const H = rows;
    const pixels = new Uint8ClampedArray(W * H * 4);
    const painted = model.edits !== null && model.hexes.some((hex) => hex.edited);
    const layout = SHEET_LAYOUT;
    const field = painted ? fieldOf(layout, model.world.size) : null;
    const sea = seaColoursOf(model.world.liquid);
    const colours = new Map<number, RGB>();
    let row = 0;
    let any = false;
    const paintRow = (i: number): void => {
        if (!field) return;
        const lat = texelLat(i, rows);
        const cosLat = Math.cos(lat);
        const sinLat = Math.sin(lat);
        for (let j = 0; j < W; j += 1) {
            const lon = texelLon(j, W);
            const [x, y] = netPixel(layout, [cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)]);
            const px = Math.min(layout.width - 1, Math.max(0, Math.floor(x)));
            const py = Math.min(layout.height - 1, Math.max(0, Math.floor(y)));
            const id = field.hex[py * layout.width + px];
            if (id < 0) continue;
            const rec = model.hexes[id];
            if (!rec || !rec.edited) continue;
            let rgb = colours.get(id);
            if (!rgb) {
                rgb = hexPaintRgb(rec, sea);
                colours.set(id, rgb);
            }
            const k = (i * W + j) * 4;
            pixels[k] = rgb[0];
            pixels[k + 1] = rgb[1];
            pixels[k + 2] = rgb[2];
            pixels[k + 3] = 255;
            any = true;
        }
    };
    return {
        step(): boolean {
            if (!painted) return true;
            const until = Math.min(H, row + rowsPerStep);
            for (; row < until; row += 1) paintRow(row);
            return row >= H;
        },
        texture(): PaintTexture | null {
            if (!painted || !any) return null;
            return { key: paintKeyOf(model.world, model.edits), width: W, height: H, pixels };
        },
    };
}

/** The texture in one call (tests, and a model already at hand). */
export function paintDiscTexture(model: HybridModel, rows = PAINT_ROWS): PaintTexture | null {
    const build = startPaintTexture(model, rows, rows);
    while (!build.step()) { /* to the end */ }
    return build.texture();
}

type Held =
    | { status: 'building'; cancel: () => void }
    | { status: 'ready'; texture: PaintTexture | null };

const held = new Map<string, Held>();
const HELD_MAX = 6;

function remember(key: string, texture: PaintTexture | null): void {
    if (held.size >= HELD_MAX) {
        for (const [k, item] of held) {
            if (item.status === 'ready') {
                held.delete(k);
                break;
            }
        }
    }
    held.set(key, { status: 'ready', texture });
}

/**
 * The texture for a body's paint, building it when nothing holds it yet: the generated model in slices
 * when the page has not built it (as the sheet does, and remembered for every other view), then the
 * rows. Null until it is ready, and for a world whose edits paint nothing.
 */
export function discPaintTexture(world: HybridWorld, edits: HexEdits | null, schedule: (fn: () => void) => () => void = afterTask): PaintTexture | null {
    const key = paintKeyOf(world, edits);
    if (!key) return null;
    const have = held.get(key);
    if (have) return have.status === 'ready' ? have.texture : null;
    const entry: { status: 'building'; cancel: () => void } = { status: 'building', cancel: () => {} };
    held.set(key, entry);
    const cached = cachedHybridModel(world);
    const modelBuild = cached ? null : startHybridBuild(world);
    let rows: PaintBuild | null = null;
    const tick = (): void => {
        if (held.get(key) !== entry) return;
        if (!rows) {
            if (modelBuild && !modelBuild.step()) {
                entry.cancel = schedule(tick);
                return;
            }
            const base = cached ?? (modelBuild as NonNullable<typeof modelBuild>).model();
            if (!cached) rememberHybridModel(world, base);
            rows = startPaintTexture(hybridModelWith(base, edits));
        }
        if (!rows.step()) {
            entry.cancel = schedule(tick);
            return;
        }
        remember(key, rows.texture());
    };
    entry.cancel = schedule(tick);
    return null;
}

/** What is held for a key: the texture, null when ready with none, undefined while building or unasked. */
export function discPaintHeld(key: string): PaintTexture | null | undefined {
    const have = held.get(key);
    return have && have.status === 'ready' ? have.texture : undefined;
}

/** The keys held, ready or building (tests and the browser probes). */
export function discPaintKeys(): { key: string; status: 'building' | 'ready'; painted: number }[] {
    return [...held.entries()].map(([key, item]) => {
        let painted = 0;
        if (item.status === 'ready' && item.texture) for (let k = 3; k < item.texture.pixels.length; k += 4) if (item.texture.pixels[k]) painted += 1;
        return { key, status: item.status, painted };
    });
}

/** Forgets every texture and stops the builds on their way (disposeSurfaces, tests). */
export function resetDiscPaint(): void {
    for (const item of held.values()) if (item.status === 'building') item.cancel();
    held.clear();
}
