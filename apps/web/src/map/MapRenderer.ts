import type { SectorIndex, TruthManifest, TruthOverview } from '@voyage/shared';
import { now } from '../platform/browser.ts';
import type { Camera, Viewport } from './camera.ts';
import { toScreen, visibleRect } from './camera.ts';
import { formatHex, fromGlobal, hexCentre, hexCorners, parseHex, ROW_STEP, sectorRect, SECTOR_COLS, SECTOR_ROWS, toGlobal, type Rect } from './geometry.ts';
import type { MapTheme } from './theme.ts';
import { PPP_NAMES, tierFor, type Tier } from './tiers.ts';

const HEX_OUTLINE_CAP = 12000;
const NAME_MIN_PX = 60;
const NAME_MAX_PX = 2400;
const DOT_PARSEC = 0.18;
const POINT_PARSEC = 0.35;

type DrawSector = {
    slug: string;
    name: string;
    x: number;
    y: number;
    canonical: boolean;
    rect: Rect;
    cells: string | null;
};

function intersects(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function visibleHexes(view: Rect): { q: number; r: number }[] {
    const q0 = Math.floor(view.x0) - 1;
    const q1 = Math.ceil(view.x1) + 1;
    const out: { q: number; r: number }[] = [];
    for (let q = q0; q <= q1; q++) {
        const offset = (q & 1) ? 0.5 : 0;
        const r0 = Math.floor(view.y0 / ROW_STEP - offset) - 1;
        const r1 = Math.ceil(view.y1 / ROW_STEP - offset) + 1;
        for (let r = r0; r <= r1; r++) out.push({ q, r });
    }
    return out;
}

export class MapRenderer {
    private readonly canvas: HTMLCanvasElement;
    private readonly ctx: CanvasRenderingContext2D;
    private readonly theme: MapTheme;
    private sectors: DrawSector[] = [];
    private layer: 'canonical' | 'all' = 'canonical';
    private getIndex: (slug: string) => SectorIndex | null = () => null;
    private width = 0;
    private height = 0;
    private dpr = 1;

    constructor(canvas: HTMLCanvasElement, theme: MapTheme) {
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('MapRenderer: 2d context unavailable');
        this.canvas = canvas;
        this.ctx = ctx;
        this.theme = theme;
    }

    setChart(manifest: TruthManifest, overview: TruthOverview, layer: 'canonical' | 'all'): void {
        const cells = new Map<string, string>();
        for (const sector of overview.sectors) cells.set(sector.slug, sector.cells);
        this.layer = layer;
        this.sectors = manifest.sectors.map((sector) => ({
            slug: sector.slug,
            name: sector.name,
            x: sector.x,
            y: sector.y,
            canonical: sector.canonical,
            rect: sectorRect(sector.x, sector.y),
            cells: cells.get(sector.slug) ?? null,
        }));
    }

    setIndexSource(get: (slug: string) => SectorIndex | null): void {
        this.getIndex = get;
    }

    resize(width: number, height: number, dpr: number): void {
        this.width = width;
        this.height = height;
        this.dpr = dpr > 0 ? dpr : 1;
        const devW = Math.max(1, Math.round(this.width * this.dpr));
        const devH = Math.max(1, Math.round(this.height * this.dpr));
        if (this.canvas.width !== devW) this.canvas.width = devW;
        if (this.canvas.height !== devH) this.canvas.height = devH;
        this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    draw(cam: Camera): { tier: Tier; sectorsOnScreen: string[]; ms: number } {
        const started = now();
        const tier = tierFor(cam.ppp);
        const vp: Viewport = { width: this.width, height: this.height };
        const view = visibleRect(cam, vp);
        const ctx = this.ctx;
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.fillStyle = this.theme.bg0;
        ctx.fillRect(0, 0, this.width, this.height);

        const on = this.sectors.filter((sector) => {
            if (this.layer === 'canonical' && !sector.canonical) return false;
            return intersects(sector.rect, view);
        });
        on.sort((a, b) => this.distance(a, cam) - this.distance(b, cam));

        this.strokeRects(on, cam, vp, this.theme.line1);
        if (tier === 'hex') {
            const waiting: DrawSector[] = [];
            const ready: { sector: DrawSector; index: SectorIndex }[] = [];
            for (const sector of on) {
                const index = this.getIndex(sector.slug);
                if (index) ready.push({ sector, index });
                else waiting.push(sector);
            }
            this.overviewPoints(waiting, cam, vp);
            this.systemCircles(ready, cam, vp);
        } else {
            this.overviewPoints(on, cam, vp);
        }

        if (tier !== 'galaxy') {
            this.subsectorLines(on, cam, vp);
            this.strokeRects(on, cam, vp, this.theme.line2);
        }
        if (tier === 'hex') {
            const hexes = visibleHexes(view);
            if (hexes.length <= HEX_OUTLINE_CAP) this.hexOutlines(hexes, cam, vp);
            this.hexNumbers(hexes, cam, vp);
            if (cam.ppp >= PPP_NAMES) this.worldNames(on, cam, vp);
        }
        this.sectorNames(on, cam, vp);

        return { tier, sectorsOnScreen: on.map((sector) => sector.slug), ms: now() - started };
    }

    private distance(sector: DrawSector, cam: Camera): number {
        const x = (sector.rect.x0 + sector.rect.x1) / 2 - cam.x;
        const y = (sector.rect.y0 + sector.rect.y1) / 2 - cam.y;
        return Math.hypot(x, y);
    }

    private strokeRects(sectors: DrawSector[], cam: Camera, vp: Viewport, style: string): void {
        if (!sectors.length) return;
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.strokeStyle = style;
        ctx.lineWidth = 1;
        for (const sector of sectors) {
            const a = toScreen(cam, vp, sector.rect.x0, sector.rect.y0);
            const b = toScreen(cam, vp, sector.rect.x1, sector.rect.y1);
            ctx.rect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
        }
        ctx.stroke();
    }

    private overviewPoints(sectors: DrawSector[], cam: Camera, vp: Viewport): void {
        const size = Math.max(1, cam.ppp * POINT_PARSEC) / this.dpr;
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.textMuted;
        for (const sector of sectors) {
            const cells = sector.cells;
            if (!cells) continue;
            for (let i = 0; i < cells.length; i++) {
                if (cells.charAt(i) === '.') continue;
                const col = Math.floor(i / SECTOR_ROWS) + 1;
                const row = (i % SECTOR_ROWS) + 1;
                const global = toGlobal(sector.x, sector.y, col, row);
                const centre = hexCentre(global.q, global.r);
                const screen = toScreen(cam, vp, centre.x, centre.y);
                ctx.fillRect(screen.sx - size / 2, screen.sy - size / 2, size, size);
            }
        }
    }

    private systemCircles(ready: { sector: DrawSector; index: SectorIndex }[], cam: Camera, vp: Viewport): void {
        const ctx = this.ctx;
        const radius = DOT_PARSEC * cam.ppp;
        ctx.beginPath();
        ctx.fillStyle = this.theme.text1;
        let any = false;
        for (const item of ready) {
            for (const hhhh of Object.keys(item.index.hexes)) {
                const local = parseHex(hhhh);
                if (!local) continue;
                const global = toGlobal(item.sector.x, item.sector.y, local.col, local.row);
                const centre = hexCentre(global.q, global.r);
                const screen = toScreen(cam, vp, centre.x, centre.y);
                ctx.moveTo(screen.sx + radius, screen.sy);
                ctx.arc(screen.sx, screen.sy, radius, 0, Math.PI * 2);
                any = true;
            }
        }
        if (any) ctx.fill();
    }

    private subsectorLines(sectors: DrawSector[], cam: Camera, vp: Viewport): void {
        if (!sectors.length) return;
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.strokeStyle = this.theme.line1;
        ctx.lineWidth = 1;
        for (const sector of sectors) {
            for (let col = 8; col < SECTOR_COLS; col += 8) {
                const x = sector.rect.x0 + col;
                this.line(cam, vp, x, sector.rect.y0, x, sector.rect.y1);
            }
            for (let row = 10; row < SECTOR_ROWS; row += 10) {
                const y = sector.rect.y0 + row * ROW_STEP;
                this.line(cam, vp, sector.rect.x0, y, sector.rect.x1, y);
            }
        }
        ctx.stroke();
    }

    private line(cam: Camera, vp: Viewport, x0: number, y0: number, x1: number, y1: number): void {
        const a = toScreen(cam, vp, x0, y0);
        const b = toScreen(cam, vp, x1, y1);
        this.ctx.moveTo(a.sx, a.sy);
        this.ctx.lineTo(b.sx, b.sy);
    }

    private hexOutlines(hexes: { q: number; r: number }[], cam: Camera, vp: Viewport): void {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.strokeStyle = this.theme.line1;
        ctx.lineWidth = 1;
        for (const hex of hexes) {
            const centre = hexCentre(hex.q, hex.r);
            const corners = hexCorners(centre.x, centre.y);
            const first = toScreen(cam, vp, corners[0], corners[1]);
            ctx.moveTo(first.sx, first.sy);
            for (let i = 2; i < corners.length; i += 2) {
                const point = toScreen(cam, vp, corners[i], corners[i + 1]);
                ctx.lineTo(point.sx, point.sy);
            }
            ctx.closePath();
        }
        ctx.stroke();
    }

    private hexNumbers(hexes: { q: number; r: number }[], cam: Camera, vp: Viewport): void {
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.textMuted;
        ctx.font = '13px ' + this.theme.fontData;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'bottom';
        const top = (ROW_STEP / 2) * cam.ppp;
        for (const hex of hexes) {
            const local = fromGlobal(hex.q, hex.r);
            const centre = hexCentre(hex.q, hex.r);
            const screen = toScreen(cam, vp, centre.x, centre.y);
            ctx.fillText(formatHex(local.col, local.row), screen.sx, screen.sy - top);
        }
    }

    private worldNames(sectors: DrawSector[], cam: Camera, vp: Viewport): void {
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.text1;
        ctx.font = '14px ' + this.theme.fontText;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const below = DOT_PARSEC * cam.ppp;
        for (const sector of sectors) {
            const index = this.getIndex(sector.slug);
            if (!index) continue;
            for (const [hhhh, entry] of Object.entries(index.hexes)) {
                if (!entry.name) continue;
                const local = parseHex(hhhh);
                if (!local) continue;
                const global = toGlobal(sector.x, sector.y, local.col, local.row);
                const centre = hexCentre(global.q, global.r);
                const screen = toScreen(cam, vp, centre.x, centre.y);
                ctx.fillText(entry.name, screen.sx, screen.sy + below);
            }
        }
    }

    private sectorNames(sectors: DrawSector[], cam: Camera, vp: Viewport): void {
        const widthPx = SECTOR_COLS * cam.ppp;
        if (widthPx < NAME_MIN_PX || widthPx > NAME_MAX_PX) return;
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.textMuted;
        ctx.font = '18px ' + this.theme.fontDisplay;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (const sector of sectors) {
            const screen = toScreen(
                cam,
                vp,
                (sector.rect.x0 + sector.rect.x1) / 2,
                (sector.rect.y0 + sector.rect.y1) / 2,
            );
            ctx.fillText(sector.name, screen.sx, screen.sy);
        }
    }
}
