/**
 * Swappable symbol sets for the hybrid map's symbol overlay.
 *
 * A set lives at public/surface-icons/<name>/: one SVG per code of codes.ts and a
 * manifest.json mapping code → file (with a display name and optional tint, scale and anchor).
 * The renderer loads the set named in the preferences (default 'default'), caches it, and
 * draws a built-in glyph for any code the set leaves out or fails to load. Generator code
 * never changes when a set does. See public/surface-icons/README.md.
 */
import { SURFACE_CODES, codeRow, type SurfaceCode } from './codes.ts';

export const DEFAULT_ICON_SET = 'default';
export const ICON_MANIFEST_VERSION = 1;

export type IconEntry = {
    readonly code: SurfaceCode;
    readonly file: string;
    readonly name: string;
    /** null: draw the SVG as it is. 'auto': recolour to the map's ink (dark on light ground, light on dark). Else a CSS colour. */
    readonly tint: string | null;
    /** Multiplier on the hex's symbol size. */
    readonly scale: number;
    /** Point of the icon placed on the hex centre, 0..1 of its box. */
    readonly anchor: readonly [number, number];
};

export type IconManifest = {
    readonly name: string;
    readonly version: number;
    readonly entries: ReadonlyMap<SurfaceCode, IconEntry>;
    /** Problems found in the manifest: unknown codes, bad fields. The rest of it still loads. */
    readonly problems: readonly string[];
};

/** Anything drawImage takes. */
export type IconImage = CanvasImageSource | { readonly width: number; readonly height: number };

export type IconSet = {
    readonly name: string;
    readonly manifest: IconManifest;
    readonly images: ReadonlyMap<SurfaceCode, IconImage>;
    /** Codes drawn with the built-in glyph: not in the manifest, or their file did not load. */
    readonly fallback: readonly SurfaceCode[];
};

/** How a set is fetched. The page uses fetch and Image; tests and the sheet renderer pass their own. */
export type IconSource = {
    fetchJson(url: string): Promise<unknown>;
    loadImage(url: string): Promise<IconImage | null>;
};

const SET_NAME = /^[a-z0-9][a-z0-9_-]{0,40}$/;

/** A set name is a folder name: lower case letters, digits, - and _. */
export function validSetName(name: unknown): name is string {
    return typeof name === 'string' && SET_NAME.test(name);
}

function num(value: unknown, fallback: number): number {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Read a manifest. Never throws: what cannot be read is listed in problems. */
export function parseManifest(json: unknown, setName: string): IconManifest {
    const problems: string[] = [];
    const entries = new Map<SurfaceCode, IconEntry>();
    const root = json && typeof json === 'object' ? json as Record<string, unknown> : null;
    if (!root) return { name: setName, version: 0, entries, problems: ['manifest is not an object'] };
    const version = num(root.version, 0);
    if (version !== ICON_MANIFEST_VERSION) problems.push('manifest version ' + String(root.version) + ', expected ' + ICON_MANIFEST_VERSION);
    const icons = root.icons && typeof root.icons === 'object' ? root.icons as Record<string, unknown> : null;
    if (!icons) {
        problems.push('manifest has no "icons" object');
        return { name: setName, version, entries, problems };
    }
    for (const [code, raw] of Object.entries(icons)) {
        const row = codeRow(code);
        if (!row) {
            problems.push('unknown code ' + code);
            continue;
        }
        const item = typeof raw === 'string' ? { file: raw } : raw && typeof raw === 'object' ? raw as Record<string, unknown> : null;
        const file = item && typeof item.file === 'string' ? item.file : '';
        if (!file || file.includes('..') || file.includes('/') || file.includes('\\') || !/\.svg$/i.test(file)) {
            problems.push('code ' + code + ': file must be a plain .svg name in the set folder');
            continue;
        }
        const anchor = item && Array.isArray(item.anchor) && item.anchor.length === 2 ? [num(item.anchor[0], 0.5), num(item.anchor[1], 0.5)] as const : [0.5, 0.5] as const;
        const tint = item && typeof item.tint === 'string' && item.tint.trim() ? item.tint.trim() : null;
        entries.set(row.code as SurfaceCode, {
            code: row.code as SurfaceCode,
            file,
            name: item && typeof item.name === 'string' && item.name ? item.name : row.name,
            tint,
            scale: Math.max(0.1, Math.min(4, num(item?.scale, 1))),
            anchor,
        });
    }
    return { name: typeof root.name === 'string' ? root.name : setName, version, entries, problems };
}

/** Codes a manifest leaves to the built-in glyphs. */
export function missingCodes(manifest: IconManifest): SurfaceCode[] {
    return SURFACE_CODES.filter((code) => !manifest.entries.has(code));
}

/** Base URL of the icon sets, from Vite's base. */
export function iconRoot(): string {
    const env = (import.meta as unknown as { env?: { BASE_URL?: string } }).env;
    const base = env && typeof env.BASE_URL === 'string' ? env.BASE_URL : '/';
    return (base.endsWith('/') ? base : base + '/') + 'surface-icons/';
}

const sets = new Map<string, Promise<IconSet>>();

/** Load a set (cached by name). Falls back to the built-in glyphs code by code; never rejects. */
export function loadIconSet(name: string, source: IconSource, root = iconRoot()): Promise<IconSet> {
    const setName = validSetName(name) ? name : DEFAULT_ICON_SET;
    const key = root + setName;
    let pending = sets.get(key);
    if (!pending) {
        pending = readSet(setName, source, root);
        sets.set(key, pending);
    }
    return pending;
}

/** Forget cached sets (a set was edited, or tests). */
export function clearIconSets(): void {
    sets.clear();
}

async function readSet(name: string, source: IconSource, root: string): Promise<IconSet> {
    const folder = root + name + '/';
    let manifest: IconManifest;
    try {
        manifest = parseManifest(await source.fetchJson(folder + 'manifest.json'), name);
    } catch (err) {
        manifest = { name, version: 0, entries: new Map(), problems: ['manifest did not load: ' + (err instanceof Error ? err.message : String(err))] };
    }
    const images = new Map<SurfaceCode, IconImage>();
    await Promise.all([...manifest.entries.values()].map(async (entry) => {
        try {
            const image = await source.loadImage(folder + entry.file);
            if (image) images.set(entry.code, image);
        } catch {
            // The built-in glyph stands in.
        }
    }));
    const fallback = SURFACE_CODES.filter((code) => !images.has(code));
    return { name, manifest, images, fallback };
}

/** The minimal 2D context the symbol layer draws with (CanvasRenderingContext2D satisfies it). */
export type Ctx2D = {
    save(): void;
    restore(): void;
    beginPath(): void;
    closePath(): void;
    moveTo(x: number, y: number): void;
    lineTo(x: number, y: number): void;
    arc(x: number, y: number, r: number, a0: number, a1: number): void;
    rect(x: number, y: number, w: number, h: number): void;
    fill(): void;
    stroke(): void;
    clip(): void;
    fillRect(x: number, y: number, w: number, h: number): void;
    fillText(text: string, x: number, y: number): void;
    drawImage(image: never, dx: number, dy: number, dw: number, dh: number): void;
    strokeStyle: unknown;
    fillStyle: unknown;
    lineWidth: number;
    lineCap: string;
    lineJoin: string;
    font: string;
    textAlign: string;
    textBaseline: string;
    globalAlpha: number;
};

/**
 * A built-in glyph colour, read from the same tokens the public set is checked against.
 * Where the page has no stylesheet (a test), the token name is returned so the draw still runs.
 */
export function iconPaint(token: string): string {
    const root = typeof document !== 'undefined' ? document.documentElement : null;
    if (root && typeof getComputedStyle === 'function') {
        const value = getComputedStyle(root).getPropertyValue(token).trim();
        if (value) return value;
    }
    return 'var(' + token + ')';
}

/** A tinted copy of an icon, made once per colour. Supplied by the page (needs a canvas). */
export type Tinter = (image: IconImage, colour: string) => IconImage;

/**
 * Draw one code at (x, y) with symbol radius r: the set's icon when it has one, else the
 * built-in glyph. ink is the colour for glyphs and 'auto' tints.
 */
export function drawCode(ctx: Ctx2D, set: IconSet | null, code: SurfaceCode, x: number, y: number, r: number, ink: string, options?: { tint?: Tinter; port?: string; domed?: boolean }): void {
    const image = set ? set.images.get(code) : undefined;
    const entry = set ? set.manifest.entries.get(code) : undefined;
    if (image && entry) {
        const size = 2 * r * entry.scale;
        let drawn: IconImage = image;
        const colour = entry.tint === 'auto' ? ink : entry.tint;
        if (colour && options?.tint) drawn = options.tint(image, colour);
        ctx.drawImage(drawn as never, x - entry.anchor[0] * size, y - entry.anchor[1] * size, size, size);
        if (code === 'starport' && options?.port) portLetter(ctx, x, y, r, options.port);
    } else {
        builtinGlyph(ctx, code, x, y, r, ink, options?.port);
    }
    if (options?.domed && (code === 'starport' || code === 'city' || code === 'town' || code === 'outpost' || code === 'arcology')) {
        const domeImage = set ? set.images.get('dome') : undefined;
        const domeEntry = set ? set.manifest.entries.get('dome') : undefined;
        if (domeImage && domeEntry) {
            const size = 2 * r * domeEntry.scale;
            ctx.drawImage(domeImage as never, x - domeEntry.anchor[0] * size, y - domeEntry.anchor[1] * size, size, size);
        } else {
            builtinGlyph(ctx, 'dome', x, y, r, ink);
        }
    }
}

function portLetter(ctx: Ctx2D, x: number, y: number, r: number, port: string): void {
    ctx.fillStyle = iconPaint('--icon-port-letter');
    ctx.font = 'bold ' + Math.max(7, Math.round(r * 1.05)) + 'px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(port, x, y + r * 0.05);
}

/** The built-in glyphs: simple strokes, our own. Every code has one. */
export function builtinGlyph(ctx: Ctx2D, code: SurfaceCode, x: number, y: number, r: number, ink: string, port?: string): void {
    ctx.save();
    ctx.strokeStyle = ink;
    ctx.fillStyle = ink;
    ctx.lineWidth = Math.max(0.8, r * 0.12);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    const L = (pts: readonly (readonly [number, number])[]): void => {
        ctx.beginPath();
        pts.forEach(([a, b], i) => (i ? ctx.lineTo(x + a * r, y + b * r) : ctx.moveTo(x + a * r, y + b * r)));
        ctx.stroke();
    };
    const C = (a: number, b: number, rad: number, fill = false): void => {
        ctx.beginPath();
        ctx.arc(x + a * r, y + b * r, rad * r, 0, Math.PI * 2);
        if (fill) ctx.fill();
        else ctx.stroke();
    };
    const box = (w: number, h: number, fill: string): void => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = iconPaint('--icon-port');
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.rect(x - w * r, y - h * r, 2 * w * r, 2 * h * r);
        ctx.fill();
        ctx.stroke();
    };
    const dot = (rad: number, fill: string): void => {
        ctx.fillStyle = fill;
        ctx.strokeStyle = iconPaint('--icon-port');
        ctx.lineWidth = Math.max(1, r * 0.12);
        ctx.beginPath();
        ctx.arc(x, y, rad * r, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
    };
    switch (code) {
        case 'MT': L([[-0.9, 0.5], [-0.35, -0.45], [0.1, 0.5]]); L([[-0.15, 0.1], [0.35, -0.6], [0.9, 0.5]]); break;
        case 'VO': L([[-0.8, 0.55], [-0.2, -0.4], [0.2, -0.4], [0.8, 0.55]]); ctx.fillStyle = iconPaint('--icon-volcano'); C(0, -0.62, 0.22, true); break;
        case 'FO': for (const [a, b] of [[-0.45, 0.05], [0.4, -0.1], [0, 0.45]]) { C(a, b - 0.15, 0.24, true); L([[a, b + 0.05], [a, b + 0.35]]); } break;
        case 'TA': for (const [a, b] of [[-0.45, 0.1], [0.4, -0.05], [0, 0.45]]) { ctx.beginPath(); ctx.moveTo(x + a * r, y + (b - 0.45) * r); ctx.lineTo(x + (a - 0.22) * r, y + (b + 0.1) * r); ctx.lineTo(x + (a + 0.22) * r, y + (b + 0.1) * r); ctx.closePath(); ctx.fill(); } break;
        case 'JU': for (const [a, b] of [[-0.45, -0.2], [0.05, -0.35], [0.5, -0.1], [-0.25, 0.3], [0.3, 0.35]]) C(a, b, 0.24, true); break;
        case 'DE': for (const [a, b] of [[-0.5, -0.3], [0.1, -0.4], [0.5, 0], [-0.2, 0.15], [0.25, 0.45], [-0.55, 0.45]]) C(a, b, 0.07, true); L([[-0.7, 0.1], [-0.4, -0.05], [-0.1, 0.1]]); break;
        case 'TU': for (const a of [-0.45, 0, 0.45]) L([[a - 0.12, 0.3], [a, 0], [a + 0.12, 0.3]]); break;
        case 'SW': for (const a of [-0.4, 0, 0.4]) L([[a, 0.35], [a, -0.25]]); L([[-0.7, 0.45], [-0.35, 0.35], [0, 0.45], [0.35, 0.35], [0.7, 0.45]]); break;
        case 'GR': for (const a of [-0.4, 0.05, 0.45]) L([[a - 0.15, 0.25], [a, -0.1], [a + 0.1, 0.25]]); break;
        case 'IC': ctx.beginPath(); ctx.arc(x, y + 0.35 * r, 0.6 * r, Math.PI, 0); ctx.stroke(); L([[-0.75, 0.35], [0.75, 0.35]]); break;
        case 'FR': for (const [a, b] of [[-0.4, -0.3], [0.3, -0.35], [0, 0.05], [-0.45, 0.4], [0.45, 0.35]]) { L([[a - 0.1, b], [a + 0.1, b]]); L([[a, b - 0.1], [a, b + 0.1]]); } break;
        case 'SI': L([[-0.7, -0.2], [-0.2, 0.05], [0.15, -0.25], [0.7, 0.1]]); L([[-0.2, 0.05], [-0.05, 0.5]]); break;
        case 'IF': for (const a of [-0.4, 0, 0.4]) { L([[a - 0.25, -0.4], [a + 0.25, 0.4]]); L([[a + 0.25, -0.4], [a - 0.25, 0.4]]); } break;
        case 'EV': L([[-0.6, -0.2], [0.6, -0.2]]); L([[-0.4, 0.2], [0.4, 0.2]]); break;
        case 'BK': for (const b of [-0.25, 0.2]) L([[-0.7, b], [-0.35, b - 0.15], [0, b], [0.35, b - 0.15], [0.7, b]]); break;
        case 'XR': { ctx.beginPath(); for (let t = 0; t < 4 * Math.PI; t += 0.3) { const rr = 0.06 + t * 0.045; const a = x + Math.cos(t) * rr * r; const b = y + Math.sin(t) * rr * r; if (t) ctx.lineTo(a, b); else ctx.moveTo(a, b); } ctx.stroke(); break; }
        case 'RG': C(-0.3, -0.15, 0.16); C(0.35, 0.25, 0.12); break;
        case 'RK': L([[-0.6, 0.35], [-0.25, -0.1], [0.1, 0.35]]); C(0.4, 0.1, 0.12); break;
        case 'CR': C(0, 0, 0.62); C(0.12, 0.12, 0.12, true); break;
        case 'SH': L([[-0.45, 0], [-0.2, -0.12], [0.05, 0], [0.3, -0.12]]); break;
        case 'OC': L([[-0.6, 0], [-0.3, -0.15], [0, 0], [0.3, -0.15], [0.6, 0]]); break;
        case 'LV': L([[-0.6, -0.4], [0, 0], [-0.2, 0.5]]); L([[0, 0], [0.6, -0.2]]); break;
        case 'starport':
            ctx.fillStyle = iconPaint('--icon-port'); ctx.strokeStyle = iconPaint('--icon-port-ink'); ctx.lineWidth = Math.max(1, r * 0.12);
            ctx.beginPath(); ctx.arc(x, y, 0.72 * r, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
            if (port) portLetter(ctx, x, y, r, port);
            break;
        case 'city': box(0.42, 0.42, iconPaint('--icon-city')); break;
        case 'arcology': box(0.25, 0.6, iconPaint('--icon-arcology')); break;
        case 'town': dot(0.32, iconPaint('--icon-city')); break;
        case 'outpost': dot(0.26, iconPaint('--icon-outpost')); break;
        case 'rural': ctx.fillStyle = iconPaint('--icon-city'); for (const [a, b] of [[-0.5, 0.4], [0.5, 0.4], [0, -0.5]]) { ctx.beginPath(); ctx.arc(x + a * r, y + b * r, 0.11 * r, 0, Math.PI * 2); ctx.fill(); } break;
        case 'farm':
            ctx.strokeStyle = iconPaint('--icon-farm-line'); ctx.lineWidth = 1; ctx.beginPath();
            for (let d = -2; d <= 2; d += 1) { ctx.moveTo(x - 0.7 * r + d * 0.3 * r, y + 0.6 * r); ctx.lineTo(x + 0.7 * r + d * 0.3 * r - 0.8 * r, y - 0.6 * r); }
            ctx.stroke(); break;
        case 'resource':
            ctx.fillStyle = iconPaint('--icon-resource'); ctx.strokeStyle = iconPaint('--icon-resource-ink'); ctx.lineWidth = Math.max(1, r * 0.1);
            ctx.beginPath(); ctx.moveTo(x, y - 0.45 * r); ctx.lineTo(x + 0.32 * r, y); ctx.lineTo(x, y + 0.45 * r); ctx.lineTo(x - 0.32 * r, y); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'naval': ctx.fillStyle = iconPaint('--icon-naval'); ctx.strokeStyle = iconPaint('--icon-port'); ctx.lineWidth = Math.max(1, r * 0.1); star(ctx, x, y, 0.42 * r, 5); break;
        case 'scout': ctx.fillStyle = iconPaint('--icon-scout'); ctx.strokeStyle = iconPaint('--icon-port'); ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.moveTo(x, y - 0.42 * r); ctx.lineTo(x + 0.38 * r, y + 0.3 * r); ctx.lineTo(x - 0.38 * r, y + 0.3 * r); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'military': box(0.3, 0.3, iconPaint('--icon-military')); break;
        case 'estate': ctx.fillStyle = iconPaint('--icon-estate'); ctx.strokeStyle = iconPaint('--icon-port'); ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.moveTo(x - 0.4 * r, y + 0.3 * r); ctx.lineTo(x - 0.4 * r, y - 0.2 * r); ctx.lineTo(x - 0.2 * r, y); ctx.lineTo(x, y - 0.35 * r); ctx.lineTo(x + 0.2 * r, y); ctx.lineTo(x + 0.4 * r, y - 0.2 * r); ctx.lineTo(x + 0.4 * r, y + 0.3 * r); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
        case 'penal': box(0.32, 0.32, iconPaint('--icon-penal')); ctx.strokeStyle = iconPaint('--icon-port'); for (const a of [-0.12, 0.12]) L([[a, -0.3], [a, 0.3]]); break;
        case 'dome': ctx.strokeStyle = iconPaint('--icon-dome'); ctx.lineWidth = Math.max(1, r * 0.1); ctx.beginPath(); ctx.arc(x, y + 0.2 * r, 0.85 * r, Math.PI * 1.05, Math.PI * 1.95); ctx.stroke(); break;
    }
    ctx.restore();
}

function star(ctx: Ctx2D, x: number, y: number, R: number, points: number): void {
    ctx.beginPath();
    for (let i = 0; i < points * 2; i += 1) {
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        const rad = i % 2 === 0 ? R : R * 0.45;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
        else ctx.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}
