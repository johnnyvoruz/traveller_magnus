import type { SectorHex, SectorIndex, TruthManifest, TruthOverview } from '@voyage/shared';
import farLabels from '../../../../universe/far_labels.json' with { type: 'json' };
import { now } from '../platform/browser.ts';
import type { Camera, Viewport } from './camera.ts';
import { toScreen, visibleRect } from './camera.ts';
import { hexCentre, hexCorners, parseHex, ROW_STEP, sectorRect, SECTOR_COLS, SECTOR_ROWS, toGlobal, type Rect } from './geometry.ts';
import {
    BASE_TEXT_X, BASE_TEXT_Y, BELT_DOTS, BELT_R, DISC_R, FONT_NAME, FONT_PORT, FONT_SMALL,
    GAS_R, GAS_X, GAS_Y, HALO_FILL, HALO_R, HALO_STROKE, NAME_Y, NAVAL_INNER, NAVAL_OUTER,
    NAVAL_X, NAVAL_Y, NUMBER_Y, PORT_Y, RING_R, RING_SCALE_X, RING_SCALE_Y, RING_STROKE,
    POLITY_FILL_ALPHA, REGION_FILL_ALPHA, SCOUT_R, SCOUT_X, SCOUT_Y, SELECT_STROKE,
    TERRITORY_FILL_ALPHA, TERRITORY_STROKE, UWP_Y,
} from './glyphs.ts';
import { outlineLoops } from './outline.ts';
import { polityHexes, type PolityHexes } from './polity_layer.ts';
import { routeSegments, type RouteSegment } from './route_lines.ts';
import { regionShapes, territoryShapes, type Shape } from './territory_layer.ts';
import type { MapTheme } from './theme.ts';
import { PPP_GRID, PPP_NAMES, tierFor, type Tier } from './tiers.ts';
import { placeTitle, type Box } from './titles.ts';
import { baseMarks, hasGasGiant, starport, worldHasWater, worldIsBelt } from './uwp.ts';

const HEX_OUTLINE_CAP = 12000;
const NAME_MAX_PX = 2400;
const NAME_SIZE = 18;
const NAME_MIN_SIZE = 9;
const NAME_FIT = 0.84;
const POINT_PARSEC = 0.35;
const FAR_LABEL_MIN_PPP = 1.2;
const FAR_LABEL_FONT = 12;
const FAR_LABEL_DOT = 3;
const TITLE_FONT = 13;
const TITLE_MIN_FONT = 9;
const TITLE_TOP = 56;
const TITLE_MIN_W = 56;
const TITLE_MIN_H = 24;
const TITLE_PAD_X = 0.55;
const TITLE_PAD_Y = 0.32;
const TITLE_RADIUS = 0.3;
const TITLE_PILL_ALPHA = 0.55;
const TITLE_TEXT_ALPHA = 0.95;

type FarLabel = { sector: string; hex: string; name: string };
type Selection = { slug: string; hhhh: string };

type DrawSector = {
    slug: string;
    name: string;
    x: number;
    y: number;
    canonical: boolean;
    rect: Rect;
    cells: string | null;
};

type Mark = {
    sx: number;
    sy: number;
    water: boolean;
    belt: boolean;
    zone: '' | 'A' | 'R';
    hhhh: string;
    port: string;
    uwp: string;
    name: string;
    gas: boolean;
    ring: boolean;
    naval: boolean;
    scout: boolean;
    baseText: string;
};

function markOf(sx: number, sy: number, hhhh: string, entry: SectorHex): Mark {
    const uwp = entry.uwp ?? '';
    const bases = baseMarks(entry.bases ?? '');
    const zone = entry.zone === 'A' || entry.zone === 'R' ? entry.zone : '';
    const codes = entry.tradeCodes ?? [];
    return {
        sx, sy, hhhh, uwp,
        water: worldHasWater(uwp),
        belt: worldIsBelt(uwp),
        zone,
        port: starport(uwp),
        name: entry.name ?? '',
        gas: hasGasGiant(entry.pbg ?? ''),
        ring: codes.includes('Sa'),
        naval: bases.naval,
        scout: bases.scout,
        baseText: bases.text,
    };
}

function intersects(a: Rect, b: Rect): boolean {
    return a.x0 < b.x1 && a.x1 > b.x0 && a.y0 < b.y1 && a.y1 > b.y0;
}

function subsectorName(index: SectorIndex, letter: string): string {
    const names = index.metadata?.names;
    const found = names ? names[letter] : undefined;
    return found ? found : 'Subsector ' + letter;
}

function worldsNear(worlds: { x: number; y: number }[], visible: Box, reach: number): { x: number; y: number }[] {
    const x1 = visible.x + visible.w + reach;
    const y1 = visible.y + visible.h + reach;
    return worlds.filter((world) => world.x > visible.x - reach && world.x < x1 && world.y > visible.y - reach && world.y < y1);
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
    /** Width of each sector name at 18 px. One measureText per name, not per frame. */
    private readonly nameWidthAt18 = new Map<string, number>();
    /** routeSegments cached per index object. */
    private readonly routeCache = new WeakMap<SectorIndex, RouteSegment[]>();
    /** Territory and region outlines. Rebuilt when the loaded slugs change, not per frame. */
    private shapeKey = '';
    private territoryCache: Shape[] = [];
    private regionCache: Shape[] = [];
    /** Zoomed-out polities. One outlineLoops per galaxy or sector frame, largest first. */
    private polities: PolityHexes[] = [];
    private polityRank: number[] = [];
    private polityCursor = 0;
    private readonly polityPaths: { color: string; path: Path2D }[] = [];
    /** code and canonical in the file are ignored. */
    private labels: FarLabel[] = farLabels.labels;
    private selected: Selection | null = null;
    /** Left inset for subsector titles, in CSS pixels. 0 keeps titles at the viewport edge. */
    private workspaceLeft = 0;
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
        this.polities = polityHexes(overview, layer, manifest);
        this.polityRank = this.polities.map((_item, index) => index).sort((a, b) => {
            const bySize = this.polities[b].hexes.length - this.polities[a].hexes.length;
            return bySize !== 0 ? bySize : a - b;
        });
        this.polityCursor = 0;
        this.polityPaths.length = 0;
    }

    setIndexSource(get: (slug: string) => SectorIndex | null): void {
        this.getIndex = get;
    }

    /** Test hook. The bundled list is the default. */
    setLabels(labels: FarLabel[]): void {
        this.labels = labels;
    }

    setSelection(selection: Selection | null): void {
        this.selected = selection;
    }

    /** Subsector titles start at this x when the panel covers the left of the map. */
    setWorkspaceLeft(px: number): void {
        this.workspaceLeft = px > 0 ? px : 0;
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

    draw(cam: Camera): { tier: Tier; sectorsOnScreen: string[]; ms: number; pending: boolean } {
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
        const waiting: DrawSector[] = [];
        const ready: { sector: DrawSector; index: SectorIndex }[] = [];
        let marks: Mark[] = [];
        if (tier === 'hex') {
            for (const sector of on) {
                const index = this.getIndex(sector.slug);
                if (index) ready.push({ sector, index });
                else waiting.push(sector);
            }
            this.overviewPoints(waiting, cam, vp);
        } else {
            this.advancePolity();
            this.paintPolities(cam, vp);
            this.overviewPoints(on, cam, vp);
        }

        if (tier !== 'galaxy') {
            this.subsectorLines(on, cam, vp);
            this.strokeRects(on, cam, vp, this.theme.line2);
        }
        if (tier === 'hex') {
            const hexes = visibleHexes(view);
            if (cam.ppp >= PPP_GRID) {
                this.cachedShapes(ready);
                this.fillShapes(this.territoryCache, TERRITORY_FILL_ALPHA, cam, vp);
                this.fillShapes(this.regionCache, REGION_FILL_ALPHA, cam, vp);
            }
            if (hexes.length <= HEX_OUTLINE_CAP) this.hexOutlines(hexes, cam, vp);
            if (cam.ppp >= PPP_GRID) this.routes(ready, cam, vp);
            if (cam.ppp >= PPP_GRID) this.strokeShapes(this.territoryCache, cam, vp);
            marks = this.marks(ready, cam, vp);
            if (cam.ppp >= PPP_NAMES) this.chartMarks(marks, cam.ppp);
            else this.chartDiscs(marks, cam.ppp);
        }
        this.sectorNames(on, cam, vp);
        if (tier !== 'hex' && cam.ppp >= FAR_LABEL_MIN_PPP) this.farLabels(on, cam, vp, view);
        this.selectionOutline(cam, vp);
        if (tier === 'hex' && cam.ppp >= PPP_NAMES) this.subsectorTitles(ready, marks, cam, vp);

        const pending = tier !== 'hex' && this.polityCursor < this.polityRank.length;
        return { tier, sectorsOnScreen: on.map((sector) => sector.slug), ms: now() - started, pending };
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

    private routes(ready: { sector: DrawSector; index: SectorIndex }[], cam: Camera, vp: Viewport): void {
        const groups = new Map<string, RouteSegment[]>();
        for (const item of ready) {
            let segments = this.routeCache.get(item.index);
            if (!segments) {
                segments = routeSegments(item.index);
                this.routeCache.set(item.index, segments);
            }
            for (const segment of segments) {
                const key = segment.colourKey + '\n' + segment.dash;
                const group = groups.get(key);
                if (group) group.push(segment);
                else groups.set(key, [segment]);
            }
        }
        if (!groups.size) return;
        const ctx = this.ctx;
        ctx.lineWidth = 2;
        for (const [key, segments] of groups) {
            const split = key.indexOf('\n');
            const colourKey = key.slice(0, split);
            const dash = key.slice(split + 1);
            ctx.beginPath();
            ctx.strokeStyle = this.routeColour(colourKey);
            if (dash === 'dashed') ctx.setLineDash([(8 / 75) * cam.ppp, (5 / 75) * cam.ppp]);
            else if (dash === 'dotted') ctx.setLineDash([(1.5 / 75) * cam.ppp, (3 / 75) * cam.ppp]);
            else ctx.setLineDash([]);
            for (const segment of segments) this.line(cam, vp, segment.x0, segment.y0, segment.x1, segment.y1);
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    /** Builds one polity outline. Stays unfinished until every entry has a path. */
    private advancePolity(): void {
        if (this.polityCursor >= this.polityRank.length) return;
        const item = this.polities[this.polityRank[this.polityCursor]];
        this.polityCursor += 1;
        const path = new Path2D();
        for (const loop of outlineLoops(item.hexes)) {
            const pts = loop.points;
            if (pts.length < 4) continue;
            path.moveTo(pts[0], pts[1]);
            for (let i = 2; i < pts.length; i += 2) path.lineTo(pts[i], pts[i + 1]);
            path.closePath();
        }
        this.polityPaths.push({ color: item.color, path });
    }

    /** Cached paths in parsecs. The transform is the camera, so the stroke is 2.5 px. */
    private paintPolities(cam: Camera, vp: Viewport): void {
        if (!this.polityPaths.length) return;
        const ctx = this.ctx;
        const ppp = cam.ppp;
        ctx.save();
        ctx.setTransform(
            this.dpr * ppp, 0, 0, this.dpr * ppp,
            this.dpr * (vp.width / 2 - cam.x * ppp),
            this.dpr * (vp.height / 2 - cam.y * ppp),
        );
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.lineWidth = TERRITORY_STROKE / ppp;
        for (const item of this.polityPaths) {
            ctx.fillStyle = item.color;
            ctx.strokeStyle = item.color;
            ctx.globalAlpha = POLITY_FILL_ALPHA;
            ctx.fill(item.path, 'evenodd');
            ctx.globalAlpha = 1;
            ctx.stroke(item.path);
        }
        ctx.restore();
    }

    /** Slugs of the indexes on screen, sorted. The same set keeps the cached loops. */
    private cachedShapes(ready: { sector: DrawSector; index: SectorIndex }[]): void {
        const key = ready.map((item) => item.index.slug || item.sector.slug).sort().join('\n');
        if (key === this.shapeKey) return;
        this.shapeKey = key;
        const indexes = ready.map((item) => item.index);
        this.territoryCache = territoryShapes(indexes);
        this.regionCache = regionShapes(indexes);
    }

    private fillShapes(shapes: Shape[], alpha: number, cam: Camera, vp: Viewport): void {
        if (!shapes.length) return;
        const ctx = this.ctx;
        ctx.globalAlpha = alpha;
        for (const shape of shapes) {
            ctx.beginPath();
            ctx.fillStyle = shape.color;
            this.addLoops(shape.loops, cam, vp);
            ctx.fill('evenodd');
        }
        ctx.globalAlpha = 1;
    }

    /** Solid territory outline. Legacy drawBorderGroups is 2.5 / zoom, round joins and caps. */
    private strokeShapes(shapes: Shape[], cam: Camera, vp: Viewport): void {
        if (!shapes.length) return;
        const ctx = this.ctx;
        ctx.lineWidth = TERRITORY_STROKE;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.setLineDash([]);
        for (const shape of shapes) {
            ctx.beginPath();
            ctx.strokeStyle = shape.color;
            this.addLoops(shape.loops, cam, vp);
            ctx.stroke();
        }
    }

    private addLoops(loops: Shape['loops'], cam: Camera, vp: Viewport): void {
        const ctx = this.ctx;
        for (const loop of loops) {
            const pts = loop.points;
            if (pts.length < 4) continue;
            const first = toScreen(cam, vp, pts[0], pts[1]);
            ctx.moveTo(first.sx, first.sy);
            for (let i = 2; i < pts.length; i += 2) {
                const point = toScreen(cam, vp, pts[i], pts[i + 1]);
                ctx.lineTo(point.sx, point.sy);
            }
            ctx.closePath();
        }
    }

    private routeColour(key: string): string {
        if (key.startsWith('own:')) return key.slice(4);
        if (key === 'xboat') return this.theme.chart.routeXboat;
        const known = this.theme.routeColours[key];
        return known ? known : this.theme.chart.routeOther;
    }

    private marks(ready: { sector: DrawSector; index: SectorIndex }[], cam: Camera, vp: Viewport): Mark[] {
        const marks: Mark[] = [];
        for (const item of ready) {
            for (const [hhhh, entry] of Object.entries(item.index.hexes)) {
                const local = parseHex(hhhh);
                if (!local) continue;
                const global = toGlobal(item.sector.x, item.sector.y, local.col, local.row);
                const centre = hexCentre(global.q, global.r);
                const screen = toScreen(cam, vp, centre.x, centre.y);
                marks.push(markOf(screen.sx, screen.sy, hhhh, entry));
            }
        }
        return marks;
    }

    /** One disc per world. Water keeps its colour; the belt shape does not. */
    private chartDiscs(marks: Mark[], ppp: number): void {
        const radius = DISC_R * ppp;
        this.fillDiscs(marks.filter((mark) => !mark.water), radius, this.theme.chart.world);
        this.fillDiscs(marks.filter((mark) => mark.water), radius, this.theme.chart.water);
    }

    /**
     * Full chart, one font and one fill style per pass.
     * An empty name still gets its gas giant and base marks.
     */
    private chartMarks(marks: Mark[], ppp: number): void {
        this.halos(marks.filter((mark) => mark.zone === 'A'), ppp, this.theme.chart.zoneAmber);
        this.halos(marks.filter((mark) => mark.zone === 'R'), ppp, this.theme.chart.zoneRed);
        const worlds = marks.filter((mark) => !mark.belt);
        this.fillDiscs(worlds.filter((mark) => !mark.water), DISC_R * ppp, this.theme.chart.world);
        this.fillDiscs(worlds.filter((mark) => mark.water), DISC_R * ppp, this.theme.chart.water);
        this.beltDots(marks.filter((mark) => mark.belt && !mark.water), ppp, this.theme.chart.world);
        this.beltDots(marks.filter((mark) => mark.belt && mark.water), ppp, this.theme.chart.water);
        this.gasGiants(marks.filter((mark) => mark.gas), ppp);
        this.bases(marks, ppp);
        this.chartText(marks, ppp, 'number');
        this.chartText(marks, ppp, 'port');
        this.chartText(marks, ppp, 'uwp');
        this.chartText(marks.filter((mark) => mark.baseText !== ''), ppp, 'bases');
        this.chartText(marks.filter((mark) => mark.name !== ''), ppp, 'name');
    }

    private fillDiscs(marks: Mark[], radius: number, colour: string): void {
        if (!marks.length) return;
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.fillStyle = colour;
        for (const mark of marks) {
            ctx.moveTo(mark.sx + radius, mark.sy);
            ctx.arc(mark.sx, mark.sy, radius, 0, Math.PI * 2);
        }
        ctx.fill();
    }

    private halos(marks: Mark[], ppp: number, colour: string): void {
        if (!marks.length) return;
        const ctx = this.ctx;
        const radius = HALO_R * ppp;
        ctx.beginPath();
        for (const mark of marks) {
            ctx.moveTo(mark.sx + radius, mark.sy);
            ctx.arc(mark.sx, mark.sy, radius, 0, Math.PI * 2);
        }
        ctx.fillStyle = colour;
        ctx.globalAlpha = HALO_FILL;
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = colour;
        ctx.lineWidth = HALO_STROKE;
        ctx.stroke();
    }

    private beltDots(marks: Mark[], ppp: number, colour: string): void {
        if (!marks.length) return;
        const ctx = this.ctx;
        const radius = BELT_R * ppp;
        ctx.beginPath();
        ctx.fillStyle = colour;
        for (const mark of marks) {
            for (const dot of BELT_DOTS) {
                const x = mark.sx + dot.x * ppp;
                const y = mark.sy + dot.y * ppp;
                ctx.moveTo(x + radius, y);
                ctx.arc(x, y, radius, 0, Math.PI * 2);
            }
        }
        ctx.fill();
    }

    private gasGiants(marks: Mark[], ppp: number): void {
        if (!marks.length) return;
        const ctx = this.ctx;
        const radius = GAS_R * ppp;
        ctx.beginPath();
        ctx.fillStyle = this.theme.chart.world;
        for (const mark of marks) {
            const x = mark.sx + GAS_X * ppp;
            const y = mark.sy + GAS_Y * ppp;
            ctx.moveTo(x + radius, y);
            ctx.arc(x, y, radius, 0, Math.PI * 2);
        }
        ctx.fill();
        const ringed = marks.filter((mark) => mark.ring);
        if (!ringed.length) return;
        ctx.strokeStyle = this.theme.chart.world;
        ctx.lineWidth = RING_STROKE;
        for (const mark of ringed) {
            ctx.save();
            ctx.translate(mark.sx + GAS_X * ppp, mark.sy + GAS_Y * ppp);
            ctx.scale(RING_SCALE_X, RING_SCALE_Y);
            ctx.beginPath();
            ctx.arc(0, 0, RING_R * ppp, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    /** Naval stars and scout triangles share one fill style. */
    private bases(marks: Mark[], ppp: number): void {
        const naval = marks.filter((mark) => mark.naval);
        const scout = marks.filter((mark) => mark.scout);
        if (!naval.length && !scout.length) return;
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.chart.world;
        const outer = NAVAL_OUTER * ppp;
        const inner = NAVAL_INNER * ppp;
        for (const mark of naval) {
            const x = mark.sx + NAVAL_X * ppp;
            const y = mark.sy + NAVAL_Y * ppp;
            ctx.beginPath();
            for (let i = 0; i < 12; i++) {
                const angle = (Math.PI / 6) * i - Math.PI / 2;
                const radius = i % 2 === 0 ? outer : inner;
                const px = x + Math.cos(angle) * radius;
                const py = y + Math.sin(angle) * radius;
                if (i === 0) ctx.moveTo(px, py);
                else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fill();
        }
        const scoutR = SCOUT_R * ppp;
        for (const mark of scout) {
            const x = mark.sx + SCOUT_X * ppp;
            const y = mark.sy + SCOUT_Y * ppp;
            ctx.beginPath();
            ctx.moveTo(x, y - scoutR);
            ctx.lineTo(x + scoutR, y + 0.6 * scoutR);
            ctx.lineTo(x - scoutR, y + 0.6 * scoutR);
            ctx.closePath();
            ctx.fill();
        }
    }

    private chartText(marks: Mark[], ppp: number, kind: 'number' | 'port' | 'uwp' | 'bases' | 'name'): void {
        if (!marks.length) return;
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.chart.world;
        if (kind === 'number') {
            ctx.font = (FONT_SMALL * ppp) + 'px ' + this.theme.fontData;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (const mark of marks) ctx.fillText(mark.hhhh, mark.sx, mark.sy + NUMBER_Y * ppp);
        } else if (kind === 'port') {
            ctx.font = 'bold ' + (FONT_PORT * ppp) + 'px ' + this.theme.fontText;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (const mark of marks) {
                if (!mark.port) continue;
                ctx.fillText(mark.port, mark.sx, mark.sy + PORT_Y * ppp);
            }
        } else if (kind === 'uwp') {
            ctx.font = (FONT_SMALL * ppp) + 'px ' + this.theme.fontData;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            for (const mark of marks) {
                if (!mark.uwp) continue;
                ctx.fillText(mark.uwp, mark.sx, mark.sy + UWP_Y * ppp);
            }
        } else if (kind === 'bases') {
            ctx.font = (FONT_SMALL * ppp) + 'px ' + this.theme.fontData;
            ctx.textAlign = 'right';
            ctx.textBaseline = 'middle';
            for (const mark of marks) ctx.fillText(mark.baseText, mark.sx + BASE_TEXT_X * ppp, mark.sy + BASE_TEXT_Y * ppp);
        } else {
            ctx.font = (FONT_NAME * ppp) + 'px ' + this.theme.fontText;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            for (const mark of marks) ctx.fillText(mark.name, mark.sx, mark.sy + NAME_Y * ppp);
        }
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
        ctx.strokeStyle = this.theme.chart.grid;
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

    private farLabels(sectors: DrawSector[], cam: Camera, vp: Viewport, view: Rect): void {
        const bySlug = new Map<string, DrawSector>();
        for (const sector of sectors) bySlug.set(sector.slug, sector);
        const ctx = this.ctx;
        ctx.font = FAR_LABEL_FONT + 'px ' + this.theme.fontText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        const placed: Rect[] = [];
        const drawn: { name: string; sx: number; sy: number; box: Rect }[] = [];
        for (const label of this.labels) {
            const sector = bySlug.get(label.sector);
            if (!sector) continue;
            const local = parseHex(label.hex);
            if (!local) continue;
            const global = toGlobal(sector.x, sector.y, local.col, local.row);
            const centre = hexCentre(global.q, global.r);
            if (centre.x < view.x0 || centre.x > view.x1 || centre.y < view.y0 || centre.y > view.y1) continue;
            const screen = toScreen(cam, vp, centre.x, centre.y);
            const width = ctx.measureText(label.name).width;
            const box: Rect = {
                x0: screen.sx + FAR_LABEL_DOT,
                y0: screen.sy - FAR_LABEL_FONT / 2,
                x1: screen.sx + FAR_LABEL_DOT + width,
                y1: screen.sy + FAR_LABEL_FONT / 2,
            };
            if (placed.some((other) => intersects(other, box))) continue;
            placed.push(box);
            drawn.push({ name: label.name, sx: screen.sx, sy: screen.sy, box });
        }
        if (!drawn.length) return;
        ctx.fillStyle = this.theme.signal;
        for (const label of drawn) {
            ctx.fillRect(label.sx - FAR_LABEL_DOT / 2, label.sy - FAR_LABEL_DOT / 2, FAR_LABEL_DOT, FAR_LABEL_DOT);
        }
        ctx.fillStyle = this.theme.text1;
        for (const label of drawn) ctx.fillText(label.name, label.box.x0, label.sy);
    }

    private selectionOutline(cam: Camera, vp: Viewport): void {
        const selected = this.selected;
        if (!selected) return;
        let sector: DrawSector | null = null;
        for (const item of this.sectors) if (item.slug === selected.slug) sector = item;
        if (!sector) return;
        const local = parseHex(selected.hhhh);
        if (!local) return;
        const global = toGlobal(sector.x, sector.y, local.col, local.row);
        const centre = hexCentre(global.q, global.r);
        const corners = hexCorners(centre.x, centre.y);
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.strokeStyle = this.theme.chart.selected;
        ctx.lineWidth = SELECT_STROKE;
        const first = toScreen(cam, vp, corners[0], corners[1]);
        ctx.moveTo(first.sx, first.sy);
        for (let i = 2; i < corners.length; i += 2) {
            const point = toScreen(cam, vp, corners[i], corners[i + 1]);
            ctx.lineTo(point.sx, point.sy);
        }
        ctx.closePath();
        ctx.stroke();
    }

    /**
     * One pill per subsector, in screen space, from PPP_NAMES up.
     * The selected hex is blocked as the square of radius one hex size.
     */
    private subsectorTitles(
        ready: { sector: DrawSector; index: SectorIndex }[],
        marks: Mark[],
        cam: Camera,
        vp: Viewport,
    ): void {
        if (!ready.length) return;
        const hexSizePx = cam.ppp / 1.5;
        const worlds = marks.map((mark) => ({ x: mark.sx, y: mark.sy }));
        const blocked: Box[] = [];
        const guard = this.selectedGuard(cam, vp, hexSizePx);
        if (guard) blocked.push(guard);
        const ctx = this.ctx;
        let drew = false;
        for (const item of ready) {
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    const visible = this.subsectorVisible(item.sector, col, row, cam, vp);
                    if (!visible) continue;
                    const letter = String.fromCharCode(65 + row * 4 + col);
                    const label = item.sector.name + ' - ' + subsectorName(item.index, letter);
                    let fontPx = TITLE_FONT;
                    ctx.font = '600 ' + fontPx + 'px ' + this.theme.fontText;
                    let textW = ctx.measureText(label).width;
                    const room = visible.w - 24;
                    if (room > 0 && textW > room) {
                        fontPx *= room / textW;
                        if (fontPx < TITLE_MIN_FONT) continue;
                        ctx.font = '600 ' + fontPx + 'px ' + this.theme.fontText;
                        textW = ctx.measureText(label).width;
                    }
                    const hPad = fontPx * TITLE_PAD_X;
                    const vPad = fontPx * TITLE_PAD_Y;
                    const pillW = textW + hPad * 2;
                    const pillH = fontPx + vPad * 2;
                    const spot = placeTitle(
                        visible,
                        pillW,
                        pillH,
                        worldsNear(worlds, visible, hexSizePx * 0.8),
                        hexSizePx,
                        blocked,
                    );
                    if (!spot) continue;
                    blocked.push({ x: spot.x, y: spot.y, w: pillW, h: pillH });
                    const radius = Math.min(fontPx * TITLE_RADIUS, pillH / 2);
                    ctx.beginPath();
                    ctx.roundRect(spot.x, spot.y, pillW, pillH, radius);
                    ctx.globalAlpha = TITLE_PILL_ALPHA;
                    ctx.fillStyle = this.theme.chart.titlePill;
                    ctx.fill();
                    ctx.globalAlpha = TITLE_TEXT_ALPHA;
                    ctx.fillStyle = this.theme.chart.titleText;
                    ctx.textAlign = 'left';
                    ctx.textBaseline = 'middle';
                    ctx.fillText(label, spot.x + hPad, spot.y + pillH / 2);
                    drew = true;
                }
            }
        }
        if (drew) ctx.globalAlpha = 1;
    }

    private subsectorVisible(sector: DrawSector, col: number, row: number, cam: Camera, vp: Viewport): Box | null {
        const spanX = SECTOR_COLS / 4;
        const spanY = (SECTOR_ROWS / 4) * ROW_STEP;
        const x0 = sector.rect.x0 + col * spanX;
        const y0 = sector.rect.y0 + row * spanY;
        const topLeft = toScreen(cam, vp, x0, y0);
        const bottomRight = toScreen(cam, vp, x0 + spanX, y0 + spanY);
        const x = Math.max(topLeft.sx, this.workspaceLeft);
        const y = Math.max(topLeft.sy, TITLE_TOP);
        const right = Math.min(bottomRight.sx, vp.width);
        const bottom = Math.min(bottomRight.sy, vp.height);
        const w = right - x;
        const h = bottom - y;
        if (w < TITLE_MIN_W || h < TITLE_MIN_H) return null;
        return { x, y, w, h };
    }

    /** Axis-aligned square around the selected hex. Radius is one hex size. */
    private selectedGuard(cam: Camera, vp: Viewport, hexSizePx: number): Box | null {
        const selected = this.selected;
        if (!selected) return null;
        let sector: DrawSector | null = null;
        for (const item of this.sectors) if (item.slug === selected.slug) sector = item;
        if (!sector) return null;
        const local = parseHex(selected.hhhh);
        if (!local) return null;
        const global = toGlobal(sector.x, sector.y, local.col, local.row);
        const centre = hexCentre(global.q, global.r);
        const screen = toScreen(cam, vp, centre.x, centre.y);
        return { x: screen.sx - hexSizePx, y: screen.sy - hexSizePx, w: hexSizePx * 2, h: hexSizePx * 2 };
    }

    /** Width at 18 px, cached by name. */
    private measuredNameWidth(name: string): number {
        const cached = this.nameWidthAt18.get(name);
        if (cached !== undefined) return cached;
        this.ctx.font = NAME_SIZE + 'px ' + this.theme.fontDisplay;
        const width = this.ctx.measureText(name).width;
        this.nameWidthAt18.set(name, width);
        return width;
    }

    /**
     * Layer 7. Measure at 18 px. Wider than 84% of the rectangle: scale to that
     * width. Below 9 px, or a rectangle over 2400 px, draw nothing. The result
     * is never wider than the rectangle.
     */
    private sectorNames(sectors: DrawSector[], cam: Camera, vp: Viewport): void {
        const widthPx = SECTOR_COLS * cam.ppp;
        if (widthPx > NAME_MAX_PX) return;
        const ctx = this.ctx;
        ctx.fillStyle = this.theme.textMuted;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fitWidth = widthPx * NAME_FIT;
        for (const sector of sectors) {
            const natural = this.measuredNameWidth(sector.name);
            let size = NAME_SIZE;
            if (natural > fitWidth && natural > 0) size = NAME_SIZE * (fitWidth / natural);
            if (size < NAME_MIN_SIZE) continue;
            ctx.font = size + 'px ' + this.theme.fontDisplay;
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
