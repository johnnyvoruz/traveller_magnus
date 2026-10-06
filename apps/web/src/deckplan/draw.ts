/**
 * Stamps a placed ship onto a canvas. Each tile's top-left, top-right and
 * bottom-left pixels land on the three map corners. Screen Y is map Y flipped.
 * With no frame, the ship is fitted to the canvas. A frame pans and zooms in
 * the same units.
 */
import type { PlacedShip, PlacedTile, ShipBounds } from './place.ts';

export const DECK_PAD = 16;
export const GEOMORPH_BASE = '/dev/geomorphs';
/** The shipyard map tile. Not a part. One copy is 10 squares, 50 map units. */
export const SQUARE_BASE_PATH = 'Square Base (10x10).png';
const SQUARE_BASE_SPAN = 50;

const CDN_DEFAULT = 'https://cdn.traveller.voyage';

export type DeckImage = CanvasImageSource & {
    width?: number;
    height?: number;
    naturalWidth?: number;
    naturalHeight?: number;
};

/** Screen origin and scale. `pan` is in canvas pixels; `scale` is pixels per map unit. */
export type DeckFrame = {
    panX: number;
    panY: number;
    scale: number;
};

/** `dev` serves tiles from the dev middleware. Otherwise they come from the CDN. */
export type TileUrlConfig = {
    dev?: boolean;
    cdnBase?: string;
};

const cache = new Map<string, Promise<DeckImage | null>>();

function envConfig(): TileUrlConfig {
    const env = (import.meta as ImportMeta & { env?: { DEV?: boolean; VITE_CDN_BASE?: string } }).env;
    return {
        dev: env?.DEV === true,
        cdnBase: env?.VITE_CDN_BASE || CDN_DEFAULT,
    };
}

/**
 * One tile address. Dev uses `/dev/geomorphs/`. Production uses the same CDN
 * base as the map (`VITE_CDN_BASE`, or https://cdn.traveller.voyage) plus `/geomorphs/`.
 * Tests pass `config` because Node does not set `import.meta.env`.
 */
export function tileUrl(path: string, config?: TileUrlConfig): string {
    const chosen = config ?? envConfig();
    const encoded = path.split('/').filter((part) => part.length > 0).map((part) => encodeURIComponent(part)).join('/');
    if (chosen.dev) return GEOMORPH_BASE + '/' + encoded;
    const base = (chosen.cdnBase || CDN_DEFAULT).replace(/\/+$/, '');
    return base + '/geomorphs/' + encoded;
}

/** Dev-middleware address. Production drawing uses `tileUrl`. */
export function geomorphUrl(path: string): string {
    return tileUrl(path, { dev: true });
}

function loadImage(url: string): Promise<DeckImage | null> {
    return new Promise((resolve) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => resolve(null);
        image.src = url;
    });
}

function remember(url: string, load: (url: string) => Promise<DeckImage | null>): Promise<DeckImage | null> {
    const hit = cache.get(url);
    if (hit) return hit;
    const pending = Promise.resolve().then(() => load(url));
    cache.set(url, pending);
    return pending;
}

/** One request per URL. A tile that fails to load stays skipped. */
export function loadTile(url: string): Promise<DeckImage | null> {
    return remember(url, loadImage);
}

function imageSize(image: DeckImage): { w: number; h: number } | null {
    const w = image.naturalWidth || image.width || 0;
    const h = image.naturalHeight || image.height || 0;
    if (!(w > 0) || !(h > 0)) return null;
    return { w, h };
}

/** The frame that fits `bounds` in the canvas with the same padding as an unframed draw. */
export function fitFrame(bounds: ShipBounds, width: number, height: number): DeckFrame | null {
    const spanX = bounds.maxX - bounds.minX;
    const spanY = bounds.maxY - bounds.minY;
    if (!(spanX > 0) || !(spanY > 0)) return null;
    const innerW = width - DECK_PAD * 2;
    const innerH = height - DECK_PAD * 2;
    if (!(innerW > 0) || !(innerH > 0)) return null;
    const scale = Math.min(innerW / spanX, innerH / spanY);
    const ox = DECK_PAD + (innerW - spanX * scale) / 2;
    const oy = DECK_PAD + (innerH - spanY * scale) / 2;
    return { panX: ox - bounds.minX * scale, panY: oy + bounds.maxY * scale, scale };
}

function project(frame: DeckFrame, x: number, y: number): [number, number] {
    return [frame.panX + x * frame.scale, frame.panY - y * frame.scale];
}

/**
 * One repeating fill of the square-base image, across the whole canvas.
 * 600 image pixels are 50 map units, so a grid line falls on every multiple
 * of 5, including map 0. Image top is the higher map Y, the same way as a part.
 * One fill, not a stamp per cell: the main thread does not repaint a tile per square.
 */
function drawSquareBase(
    ctx: CanvasRenderingContext2D,
    image: DeckImage,
    size: { w: number; h: number },
    frame: DeckFrame,
    width: number,
    height: number,
): void {
    const scale = frame.scale;
    if (!(scale > 0) || !(size.w > 0) || !(size.h > 0)) return;
    const pattern = ctx.createPattern(image, 'repeat');
    if (!pattern) return;
    const span = SQUARE_BASE_SPAN;
    const a = (span / size.w) * scale;
    const d = (span / size.h) * scale;
    const e = frame.panX;
    const f = frame.panY - span * scale;
    ctx.save();
    ctx.setTransform(a, 0, 0, d, e, f);
    ctx.fillStyle = pattern;
    const left = (0 - e) / a;
    const right = (width - e) / a;
    const top = (0 - f) / d;
    const bottom = (height - f) / d;
    ctx.fillRect(Math.min(left, right), Math.min(top, bottom), Math.abs(right - left), Math.abs(bottom - top));
    ctx.restore();
}

function quadTransform(size: { w: number; h: number }, topLeft: [number, number], topRight: [number, number], bottomLeft: [number, number]): [number, number, number, number, number, number] {
    return [
        (topRight[0] - topLeft[0]) / size.w,
        (topRight[1] - topLeft[1]) / size.w,
        (bottomLeft[0] - topLeft[0]) / size.h,
        (bottomLeft[1] - topLeft[1]) / size.h,
        topLeft[0],
        topLeft[1],
    ];
}

/**
 * Draws `placed` in array order. `load` defaults to the cached tile loader.
 * `frame` defaults to fit-to-view. Returns the paths whose images did not load.
 * `isCurrent` lets a newer paint cancel this one before it stamps the canvas.
 */
export async function drawDeck(
    ctx: CanvasRenderingContext2D,
    placed: PlacedShip,
    opts: {
        width: number;
        height: number;
        frame?: DeckFrame;
        resolve?: (path: string) => string;
        load?: (url: string) => Promise<DeckImage | null>;
        isCurrent?: () => boolean;
    },
): Promise<string[]> {
    const resolve = opts.resolve ?? tileUrl;
    const load = opts.load ?? loadImage;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, opts.width, opts.height);
    const bounds = placed.bounds;
    if (!bounds) return [];
    const frame = opts.frame ?? fitFrame(bounds, opts.width, opts.height);
    if (!frame) return [];
    const skipped: string[] = [];
    const baseUrl = resolve(SQUARE_BASE_PATH);
    const [baseImage, ...loaded] = await Promise.all([
        remember(baseUrl, load),
        ...placed.tiles.map(async (tile) => {
            const image = await remember(resolve(tile.path), load);
            return { tile, image, size: image ? imageSize(image) : null };
        }),
    ]);
    if (opts.isCurrent && !opts.isCurrent()) return skipped;
    const baseSize = baseImage ? imageSize(baseImage) : null;
    if (baseImage && baseSize) drawSquareBase(ctx, baseImage, baseSize, frame, opts.width, opts.height);
    const ready: { tile: PlacedTile; image: DeckImage; size: { w: number; h: number } }[] = [];
    for (const item of loaded) {
        if (!item.image || !item.size) {
            skipped.push(item.tile.path);
            continue;
        }
        ready.push({ tile: item.tile, image: item.image, size: item.size });
    }
    for (const item of ready) {
        const topLeft = project(frame, item.tile.topLeft[0], item.tile.topLeft[1]);
        const topRight = project(frame, item.tile.topRight[0], item.tile.topRight[1]);
        const bottomLeft = project(frame, item.tile.bottomLeft[0], item.tile.bottomLeft[1]);
        ctx.setTransform(...quadTransform(item.size, topLeft, topRight, bottomLeft));
        ctx.drawImage(item.image, 0, 0, item.size.w, item.size.h);
    }
    return skipped;
}
