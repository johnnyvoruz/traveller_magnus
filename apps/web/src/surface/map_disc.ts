/**
 * The hex map on the orbit view's disc (Johnny, 2026-11-14: "texture the globe from the hex map"). Until
 * now the WebGL disc painted continents of its own (the disc program's bake) and the surface map
 * generated different ones, so a world's map and its globe did not agree. Here the page paints the
 * world's own hybrid sheet (the map the dossier shows, with any kept edits), turns it into one
 * equirectangular texture, and the enhanced disc program draws the globe from that: the land, seas and
 * ice of the map are what is seen from orbit. Clouds, the air, the sun, the night and the city lights
 * stay the disc program's.
 *
 * The texture rides the painted hexes' road (paint_disc.ts, DW2c): the same texel grid (soft/globe.ts
 * texelLat, texelLon), the same message to the worker, the same sampler. Its alpha is not coverage: it is
 * open liquid (255 open sea, 0 land and ice), which the program reads for the glint and to keep city
 * light off the water. `map: true` on the request tells the program which of the two it holds. Lava (the
 * map's Lava hexes, and the hot ground of a Volcano hex) is alpha LAVA_ALPHA, a value no coast passes
 * through with a hot colour under it, so the program can light it on the night side.
 *
 * Two sizes, so nothing waits on the large one: a quick texture first (a few frames' work), then the
 * full one for a disc drawn large. A small disc keeps the quick one. Built in slices on the page, one
 * world at a time, the nearest asked first; nothing is stored and nothing is sent anywhere.
 */
import { afterTask, now } from '../platform/browser.ts';
import { fieldOf, layoutFor, SHEET_LAYOUT, type SheetLayout } from './hybrid/field.ts';
import { hexSpacing, NET_HEIGHT, NET_WIDTH } from './hybrid/grid.ts';
import { cachedHybridModel, hybridModelWith, rememberHybridModel } from './hybrid/index.ts';
import { worldDigest, type HybridWorld } from './hybrid/inputs.ts';
import { startHybridBuild, type HybridModel } from './hybrid/model.ts';
import { createHybridPaint, seaColoursOf, type HybridPaintJob } from './hybrid/paint.ts';
import type { HexEdits } from './hybrid/serialize.ts';
import type { PaintTexture } from './paint_disc.ts';
import { editsDigest } from './paint_edits.ts';
import { netPixel, texelLat, texelLon } from './soft/globe.ts';

export type MapStage = 'quick' | 'full';

/** The texture's rows (its width is twice that) and the triangle side of the sheet it is read from. */
export const MAP_STAGES: Record<MapStage, { rows: number; side: number }> = {
    quick: { rows: 256, side: 104 },
    full: { rows: 1024, side: 416 },
};

/**
 * A disc at least this many device pixels in radius is drawn from the map: every disc that is more than a
 * dot. There was a floor of 22 here for an afternoon, and zooming across it swapped one world's continents
 * for another's (Johnny, 2026-11-14: "a sudden snap at a certain zoom"). A body has one geography at every
 * size, so the map is asked for as soon as the disc is drawn at all.
 */
export const MAP_DISC_MIN = 3;
/** From this radius the full texture is asked for. */
export const MAP_DISC_FULL = 110;

/** The sheet a stage is painted on: the net alone, edge to edge. */
export function mapSheet(stage: MapStage): SheetLayout {
    const side = MAP_STAGES[stage].side;
    return layoutFor(NET_WIDTH * side, Math.ceil(NET_HEIGHT * side), side);
}

/** What a texture is of: the world, its data, its edits and the stage. A built texture adds a serial (see `discMapTexture`). */
export function mapKeyOf(world: HybridWorld, edits: HexEdits | null, stage: MapStage): string {
    return 'map|' + stage + '|' + world.seed + '|' + worldDigest(world) + '|' + editsDigest(edits);
}

/** Lava's alpha, between land's 0 and open liquid's 255. The program reads a band about it (enhanced/draw.ts). */
export const LAVA_ALPHA = 96;

/** How far a colour is from the line between two colours, in RGB units. */
function offRamp(r: number, g: number, b: number, a: readonly number[], c: readonly number[]): number {
    const dx = c[0] - a[0];
    const dy = c[1] - a[1];
    const dz = c[2] - a[2];
    const len = dx * dx + dy * dy + dz * dz;
    let t = len > 0 ? ((r - a[0]) * dx + (g - a[1]) * dy + (b - a[2]) * dz) / len : 0;
    t = t < 0 ? 0 : t > 1 ? 1 : t;
    return Math.hypot(r - (a[0] + dx * t), g - (a[1] + dy * t), b - (a[2] + dz * t));
}

export type MapBuild = {
    /** One slice of work. True when the texture is finished. */
    step(): boolean;
    /** The texture. Only after step() returned true. */
    texture(): PaintTexture;
};

/**
 * The texture built in slices: the sheet painted by the map's own painter, then each row of the
 * texture read from it. A texel's colour is the sheet's under that latitude and longitude (two by two,
 * weighted by what is on the net); its alpha is open liquid. Liquid is told from the colour (the sea's
 * own ramp, so the coast follows the painted coast and not the hexes' edges), and only where the hex
 * there, or a hex beside it, is open sea, so no dark rock inland is taken for water.
 */
export function startMapTexture(model: HybridModel, stage: MapStage, key: string, clock: () => number = now, budgetMs = 10): MapBuild {
    const { rows } = MAP_STAGES[stage];
    const W = rows * 2;
    const H = rows;
    const layout = mapSheet(stage);
    const out = new Uint8ClampedArray(W * H * 4);
    // A sheet finer than the dossier's keeps its accents where the dossier's sheet put them.
    const job: HybridPaintJob = createHybridPaint(() => model, layout, clock, budgetMs, [], null,
        layout.side > SHEET_LAYOUT.side ? { cacheField: false, place: SHEET_LAYOUT } : { cacheField: false });
    const sea = seaColoursOf(model.world.liquid);
    const open = (id: number): boolean => {
        const rec = model.hexes[id];
        return !!rec && rec.water && rec.terrain !== 'SI' && rec.terrain !== 'IF';
    };
    const count = model.hexes.length;
    const nearSea = new Uint8Array(count);
    let anySea = false;
    for (let id = 0; id < count; id += 1) {
        let near = open(id);
        if (!near) for (const nb of model.grid.nb[id]) if (open(nb)) { near = true; break; }
        nearSea[id] = near ? 1 : 0;
        if (near) anySea = true;
    }
    // Molten ground: 2 a Lava hex (all of it glows), 1 a Volcano hex (only where the painter put hot colour).
    const molten = new Uint8Array(count);
    let anyLava = false;
    for (let id = 0; id < count; id += 1) {
        const rec = model.hexes[id];
        if (!rec) continue;
        if (rec.terrain === 'LV') molten[id] = 2;
        else if ((rec.accents as readonly string[]).includes('VO')) molten[id] = 1;
        if (molten[id]) anyLava = true;
    }
    const coarse = anySea || anyLava ? fieldOf(SHEET_LAYOUT, model.grid.n) : null;
    // A vent is about a seventh of the way from a hex's middle to the next hex's.
    const ventCos = Math.cos(hexSpacing(model.grid.n) * 0.14);
    let painted = false;
    let row = 0;
    const sw = layout.width;
    const sh = layout.height;
    const readRow = (i: number): void => {
        const src = job.pixels;
        const lat = texelLat(i, rows);
        const cosLat = Math.cos(lat);
        const sinLat = Math.sin(lat);
        for (let j = 0; j < W; j += 1) {
            const lon = texelLon(j, W);
            const v: [number, number, number] = [cosLat * Math.cos(lon), sinLat, cosLat * Math.sin(lon)];
            const [x, y] = netPixel(layout, v);
            const fx = Math.min(sw - 1, Math.max(0, x - 0.5));
            const fy = Math.min(sh - 1, Math.max(0, y - 0.5));
            const x0 = Math.floor(fx);
            const y0 = Math.floor(fy);
            const x1 = Math.min(sw - 1, x0 + 1);
            const y1 = Math.min(sh - 1, y0 + 1);
            const tx = fx - x0;
            const ty = fy - y0;
            let r = 0;
            let g = 0;
            let b = 0;
            let weight = 0;
            const tap = (px: number, py: number, w: number): void => {
                const k = (py * sw + px) * 4;
                // Off the net (past a cut, or a notch between the polar triangles) there is nothing to read.
                if (src[k + 3] < 128 || w <= 0) return;
                r += src[k] * w;
                g += src[k + 1] * w;
                b += src[k + 2] * w;
                weight += w;
            };
            tap(x0, y0, (1 - tx) * (1 - ty));
            tap(x1, y0, tx * (1 - ty));
            tap(x0, y1, (1 - tx) * ty);
            tap(x1, y1, tx * ty);
            if (weight <= 0) {
                // A texel whose four neighbours are all off the net: the nearest pixel on it, found by stepping in.
                const cx = Math.round(Math.min(sw - 1, Math.max(0, x - 0.5)));
                const cy = Math.round(Math.min(sh - 1, Math.max(0, y - 0.5)));
                for (let reach = 1; reach <= 3 && weight <= 0; reach += 1) {
                    for (let dy = -reach; dy <= reach; dy += 1) {
                        for (let dx = -reach; dx <= reach; dx += 1) {
                            const px = cx + dx;
                            const py = cy + dy;
                            if (px >= 0 && py >= 0 && px < sw && py < sh) tap(px, py, 1);
                        }
                    }
                }
            }
            const k = (i * W + j) * 4;
            if (weight <= 0) continue;
            r /= weight;
            g /= weight;
            b /= weight;
            out[k] = r;
            out[k + 1] = g;
            out[k + 2] = b;
            let liquid = 0;
            if (coarse) {
                const [lx, ly] = netPixel(SHEET_LAYOUT, v);
                const px = Math.min(SHEET_LAYOUT.width - 1, Math.max(0, Math.floor(lx)));
                const py = Math.min(SHEET_LAYOUT.height - 1, Math.max(0, Math.floor(ly)));
                let id = coarse.hex[py * SHEET_LAYOUT.width + px];
                // On a face's edge the pixel under the point can be just off the net: the hex beside it answers.
                for (let reach = 1; id < 0 && reach <= 2; reach += 1) {
                    for (let dy = -reach; dy <= reach && id < 0; dy += 1) {
                        for (let dx = -reach; dx <= reach && id < 0; dx += 1) {
                            const qx = px + dx;
                            const qy = py + dy;
                            if (qx >= 0 && qy >= 0 && qx < SHEET_LAYOUT.width && qy < SHEET_LAYOUT.height) id = coarse.hex[qy * SHEET_LAYOUT.width + qx];
                        }
                    }
                }
                if (id >= 0 && nearSea[id]) {
                    const off = offRamp(r, g, b, sea.deep, sea.shallow);
                    liquid = off <= 20 ? 1 : off >= 52 ? 0 : 1 - (off - 20) / 32;
                }
                // Molten ground. A Lava hex is lava all over: the painter's own colour says where the crust is
                // dark and where it glows. A Volcano hex has a vent at its middle, painted hot here.
                if (id >= 0 && molten[id] === 2 && liquid < 0.5) {
                    out[k + 3] = LAVA_ALPHA;
                    continue;
                }
                if (id >= 0 && molten[id] === 1 && liquid < 0.5) {
                    const p = model.grid.P[id];
                    const near = v[0] * p[0] + v[1] * p[1] + v[2] * p[2];
                    if (near >= ventCos) {
                        const heart = Math.min(1, (near - ventCos) / (1 - ventCos) * 1.6);
                        out[k] = r + (244 - r) * heart;
                        out[k + 1] = g + (96 - g) * heart;
                        out[k + 2] = b + (28 - b) * heart;
                        out[k + 3] = LAVA_ALPHA;
                        continue;
                    }
                }
            }
            out[k + 3] = Math.round(liquid * 255);
        }
    };
    return {
        step(): boolean {
            if (!painted) {
                painted = job.step();
                return false;
            }
            const began = clock();
            while (row < H) {
                readRow(row);
                row += 1;
                if (clock() - began >= budgetMs) break;
            }
            return row >= H;
        },
        texture(): PaintTexture {
            return { key, width: W, height: H, pixels: out };
        },
    };
}

/** The texture in one call (tests, the contact sheet). */
export function mapDiscTexture(model: HybridModel, stage: MapStage, key = 'map|' + stage): PaintTexture {
    const build = startMapTexture(model, stage, key, () => 0, Number.POSITIVE_INFINITY);
    while (!build.step()) { /* to the end */ }
    return build.texture();
}

type Held = { texture: PaintTexture; stage: MapStage; used: number };
type Waiting = { world: HybridWorld; edits: HexEdits | null; stage: MapStage; near: number; asked: number };

const held = new Map<string, Held>();
const waiting = new Map<string, Waiting>();
let building: { base: string; cancel: () => void } | null = null;
let serial = 0;
let tick = 0;

/** Textures kept on the page: the quick ones are small (half a megabyte; a system's every body has one), the full ones eight megabytes. */
const KEPT: Record<MapStage, number> = { quick: 56, full: 3 };

function trim(stage: MapStage): void {
    const mine = [...held.entries()].filter(([, item]) => item.stage === stage).sort((a, b) => a[1].used - b[1].used);
    while (mine.length > KEPT[stage]) {
        const oldest = mine.shift();
        if (oldest) held.delete(oldest[0]);
    }
}

function startNext(schedule: (fn: () => void) => () => void): void {
    if (building || waiting.size === 0) return;
    // The nearest body asked this frame first; quick before full, so every disc agrees with its map soon.
    const [base, want] = [...waiting.entries()].sort((a, b) =>
        (a[1].stage === b[1].stage ? 0 : a[1].stage === 'quick' ? -1 : 1) || b[1].asked - a[1].asked || a[1].near - b[1].near)[0];
    waiting.delete(base);
    const entry = { base, cancel: () => {} };
    building = entry;
    const cached = cachedHybridModel(want.world);
    const modelBuild = cached ? null : startHybridBuild(want.world);
    let rows: MapBuild | null = null;
    const run = (): void => {
        if (building !== entry) return;
        if (!rows) {
            if (modelBuild && !modelBuild.step()) {
                entry.cancel = schedule(run);
                return;
            }
            const model = cached ?? (modelBuild as NonNullable<typeof modelBuild>).model();
            if (!cached) rememberHybridModel(want.world, model);
            serial += 1;
            // A serial in the key: the worker keeps a few textures and forgets the oldest, so a texture
            // built again must cross again, and a key it has seen would not be sent.
            rows = startMapTexture(hybridModelWith(model, want.edits), want.stage, base + '#' + String(serial));
        }
        if (!rows.step()) {
            entry.cancel = schedule(run);
            return;
        }
        tick += 1;
        held.set(base, { texture: rows.texture(), stage: want.stage, used: tick });
        trim(want.stage);
        building = null;
        startNext(schedule);
    };
    entry.cancel = schedule(run);
}

/**
 * The map texture for a body, the best one ready: the full one when it is built and asked for, else the
 * quick one, else null (and the build is queued). `near` orders the queue (smaller is nearer the selected
 * body, as the disc requests say).
 */
export function discMapTexture(world: HybridWorld, edits: HexEdits | null, wantFull: boolean, near = 0, schedule: (fn: () => void) => () => void = afterTask): PaintTexture | null {
    tick += 1;
    let best: PaintTexture | null = null;
    const stages: MapStage[] = wantFull ? ['full', 'quick'] : ['quick'];
    for (const stage of stages) {
        const base = mapKeyOf(world, edits, stage);
        const have = held.get(base);
        if (have) {
            have.used = tick;
            if (!best) best = have.texture;
            continue;
        }
        if (building && building.base === base) continue;
        waiting.set(base, { world, edits, stage, near, asked: tick });
    }
    // The quick one is kept in use while the full one stands in for it, so it is there if the full one goes.
    if (wantFull) {
        const quick = held.get(mapKeyOf(world, edits, 'quick'));
        if (quick) quick.used = tick;
    }
    startNext(schedule);
    return best;
}

/** What is held and what waits (tests and the browser probes). */
export function discMapState(): { held: { key: string; stage: MapStage }[]; waiting: number; building: boolean } {
    return { held: [...held.values()].map((item) => ({ key: item.texture.key, stage: item.stage })), waiting: waiting.size, building: building !== null };
}

/** Forgets every texture and stops the build on its way (disposeSurfaces, tests). */
export function resetDiscMaps(): void {
    if (building) building.cancel();
    building = null;
    held.clear();
    waiting.clear();
}
