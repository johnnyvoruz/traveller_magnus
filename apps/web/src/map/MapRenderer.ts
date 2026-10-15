import type { SectorHex, SectorIndex, TruthManifest, TruthOverview, TruthPolities } from '@voyage/shared';
import farLabels from '../../../../universe/far_labels.json' with { type: 'json' };
import { now, prefersReducedMotion } from '../platform/browser.ts';
import type { Camera, Viewport } from './camera.ts';
import { toScreen, visibleRect } from './camera.ts';
import { hexCentre, hexCorners, parseHex, ROW_STEP, sectorRect, SECTOR_COLS, SECTOR_ROWS, toGlobal, type Rect } from './geometry.ts';
import {
    BASE_TEXT_X, BASE_TEXT_Y, BELT_DOTS, BELT_R, DISC_R, FONT_NAME, FONT_PORT, FONT_SMALL,
    PUBLIC_R, PUBLIC_X, PUBLIC_Y,
    GAS_R, GAS_X, GAS_Y, HALO_FILL, HALO_R, HALO_STROKE, NAME_Y, NAVAL_INNER, NAVAL_OUTER,
    NAVAL_X, NAVAL_Y, NUMBER_Y, PORT_Y, RING_R, RING_SCALE_X, RING_SCALE_Y, RING_STROKE,
    POLITY_FILL_ALPHA, REGION_FILL_ALPHA, SCOUT_R, SCOUT_X, SCOUT_Y, SELECT_STROKE,
    TERRITORY_FILL_ALPHA, TERRITORY_STROKE, UWP_Y,
} from './glyphs.ts';
import { routeSegments, type RouteSegment } from './route_lines.ts';
import { drawCampaignLayer, partyContains, vesselContains, type CampaignSnapshot, type PartyMark, type VesselHit } from './campaign_layer.ts';
import type { PublicGameMark, PublicShipMark } from './public_games.ts';
import type { MapTheme } from './theme.ts';
import { PPP_GRID, PPP_NAMES, tierFor, type Tier } from './tiers.ts';
import { boxesOverlap, clampTitle, fadeToward, stepScale, titleAnchor, titleInView, zoomStep, type Box } from './titles.ts';
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
/** Titles stay below the omnibox row: its bottom edge (14 + 48) plus 6, as legacy insetT does. */
const TITLE_TOP = 68;
const TITLE_PAD_X = 0.55;
const TITLE_PAD_Y = 0.32;
const TITLE_RADIUS = 0.3;
const TITLE_PILL_ALPHA = 0.55;
const TITLE_TEXT_ALPHA = 0.95;
/** A new zoom step whose spot lands within this many pixels of the old one is the same spot: no cross-fade. */
const TITLE_SAME_PX = 2;
/**
 * Public ships: the first dart sits this far right of and above the hex centre, in parsecs. Inside
 * the hex, clear of the hex number, the starport letter and the gas giant.
 */
const SHIP_X = 0.3;
const SHIP_Y = -0.36;
/** The dart's half length: 0.08 parsec, held between 6 and 8 pixels so it reads at every hex zoom. */
const SHIP_HALF = 0.08;
const SHIP_HALF_MIN = 6;
const SHIP_HALF_MAX = 8;
/** Pixels between darts where names show. */
const SHIP_ROW = 18;
/** Further out, each dart of a hex's stack sits this many half lengths up and right of the one in front. */
const SHIP_DECK = 0.55;
/** Darts on one hex. Past it: two darts and a "+N". */
const SHIP_SHOWN = 3;
const SHIP_FONT = 12;
const SHIP_TAG_H = 17;
const SHIP_TAG_PAD = 5;
const SHIP_TAG_ALPHA = 0.82;
/** A longer name is cut with an ellipsis on the map; the card says it whole. */
const SHIP_TAG_MAX = 150;
/** The dart's glow, in half lengths of blur. */
const SHIP_GLOW = 1.6;
const SHIP_EXAMPLE_FONT = 10;
const EXAMPLE_WORD = 'Example';
/** The open card's route: dot size per parsec, the gap in dot widths, its alpha, its stop rings, and one gap's march. */
const ROUTE_WIDTH = 0.045;
const ROUTE_GAP = 2.6;
const ROUTE_ALPHA = 0.9;
const ROUTE_RING = 0.09;
const ROUTE_MARCH_MS = 140;
/** A dart this far off the left or top edge may still have its name on screen. */
const SHIP_PAD = 200;

/** One hex of other people's ships, at the first dart's screen point. */
type Fleet = { sx: number; sy: number; key: string; count: number; ships: readonly PublicShipMark[] };

/**
 * What a public ship mark says when hovered or tapped: the ships under it, how many more the
 * hex holds that the feed did not list, and the mark's screen box. `key` is the sector, the
 * hex and the mark (or `more`), so a card can follow its mark while the map moves.
 */
export type PublicShipHit = {
    key: string;
    ships: readonly PublicShipMark[];
    more: number;
    box: { x0: number; y0: number; x1: number; y1: number };
    /** Where the card goes beside: the box around every mark of the hex. */
    place: { x0: number; y0: number; x1: number; y1: number };
};

type ShipHit = PublicShipHit;

/** Where a hex of public ships stands on the screen this frame, keyed by sector and hex. */
export type ShipPing = { key: string; x: number; y: number };

function shipHit(key: string, ships: readonly PublicShipMark[], more: number, x0: number, cy: number, x1: number, half: number): ShipHit {
    const reach = Math.max(half, SHIP_TAG_H / 2) + 1;
    const box = { x0: x0 - 1, y0: cy - reach, x1: x1 + 1, y1: cy + reach };
    return { key, ships, more, box, place: { ...box } };
}

/** The label cut to fit `max` pixels, with an ellipsis when it was cut. */
export function fitLabel(label: string, width: (text: string) => number, max: number): string {
    if (width(label) <= max) return label;
    let keep = label.length;
    while (keep > 1 && width(label.slice(0, keep).trimEnd() + '…') > max) keep -= 1;
    return label.slice(0, keep).trimEnd() + '…';
}

type FarLabel = { sector: string; hex: string; name: string };
type Selection = { slug: string; hhhh: string };

/** A placed title: top-left anchor in map units, size in pixels. */
type TitlePill = { x: number; y: number; w: number; h: number; fontPx: number };

/** One subsector's title: where it was placed for a zoom step, and how visible it is now. */
type TitleState = {
    step: number;
    index: SectorIndex;
    label: string;
    pill: TitlePill | null;
    alpha: number;
    moving: boolean;
    /** The previous step's pill, fading out while the new one fades in. */
    out: { label: string; pill: TitlePill; alpha: number } | null;
};

type DrawSector = {
    slug: string;
    name: string;
    x: number;
    y: number;
    canonical: boolean;
    rect: Rect;
    cells: string | null;
};

type DrawnPolity = {
    color: string;
    path: Path2D;
    box: [number, number, number, number];
};

type DrawnRegion = { color: string; path: Path2D };

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

function boxHits(box: [number, number, number, number], view: Rect): boolean {
    return box[0] < view.x1 && box[2] > view.x0 && box[1] < view.y1 && box[3] > view.y0;
}

function pathFromLoops(loops: number[][]): Path2D {
    const path = new Path2D();
    for (const loop of loops) {
        if (loop.length < 4) continue;
        path.moveTo(loop[0], loop[1]);
        for (let i = 2; i < loop.length; i += 2) path.lineTo(loop[i], loop[i + 1]);
        path.closePath();
    }
    return path;
}

function subsectorName(index: SectorIndex, letter: string): string {
    const names = index.metadata?.names;
    const found = names ? names[letter] : undefined;
    return found ? found : 'Subsector ' + letter;
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
    /**
     * Referee cells that differ from the chart string. A sector absent here
     * draws `sector.cells`. Signed out, this stays empty.
     */
    private dotOverlay = new Map<string, string>();
    private layer: 'canonical' | 'all' = 'canonical';
    private getIndex: (slug: string) => SectorIndex | null = () => null;
    /** Width of each sector name at 18 px. One measureText per name, not per frame. */
    private readonly nameWidthAt18 = new Map<string, number>();
    /** True after those widths were taken with the display font, not its fallback. */
    private nameWidthsReady = false;
    /** fonts.load has been asked. A second ask only follows a failed first batch. */
    private nameFontAsked = false;
    private nameFontTries = 0;
    /** routeSegments cached per index object. */
    private readonly routeCache = new WeakMap<SectorIndex, RouteSegment[]>();
    /** Polity paths from polities.json. Built once in setPolities. */
    private polityPaths: DrawnPolity[] = [];
    /** Region paths cached per index object. An index without loops stores an empty list. */
    private readonly regionPaths = new WeakMap<object, DrawnRegion[]>();
    /** code and canonical in the file are ignored. */
    private labels: FarLabel[] = farLabels.labels;
    private selected: Selection | null = null;
    /** Left inset for subsector titles, in CSS pixels. 0 keeps titles at the viewport edge. */
    private workspaceLeft = 0;
    /** Subsector titles by "slug:letter": placement per zoom step and the current fade. */
    private readonly titleStates = new Map<string, TitleState>();
    /** World centres per index object, for title placement. */
    private readonly titleWorlds = new WeakMap<object, { x: number; y: number }[]>();
    private titleTime = 0;
    private width = 0;
    private height = 0;
    private dpr = 1;
    private campaignSnapshot: CampaignSnapshot | null = null;
    private partyMark: PartyMark | null = null;
    private vesselMarks: VesselHit[] = [];
    /** The party's ships drawn this frame, lead included. */
    private partyShips: PartyMark[] = [];
    /** Public games by sector slug. Empty draws nothing and adds no hit target. */
    private publicGames = new Map<string, readonly PublicGameMark[]>();
    /** Public ship marks drawn this frame, for the hover card. Never a click target. */
    private publicShipHits: ShipHit[] = [];
    /** The front dart of each hex of public ships this frame. */
    private publicPings: ShipPing[] = [];
    /** The finished legs of the ship whose card is open. */
    private publicRoute: { from: string; to: string }[] | null = null;

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

    /**
     * Cells with the referee's rows applied, one string per sector slug.
     * A string equal to that sector's chart is not kept: the draw uses the chart's.
     * Null clears the overlay. An own sector has no chart string, so its overlay is drawn.
     */
    setDotOverlay(overlay: ReadonlyMap<string, string> | null): void {
        const next = new Map<string, string>();
        if (overlay) {
            for (const [slug, cells] of overlay) {
                const sector = this.sectors.find((item) => item.slug === slug);
                if (sector && sector.cells === cells) continue;
                next.set(slug, cells);
            }
        }
        this.dotOverlay = next;
    }

    /** One Path2D per polity, built when the document arrives. Replaces any previous list. */
    setPolities(doc: TruthPolities): void {
        const drawn: DrawnPolity[] = [];
        for (const polity of doc.polities) {
            drawn.push({ color: polity.color, box: polity.box, path: pathFromLoops(polity.loops) });
        }
        this.polityPaths = drawn;
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

    /**
     * Public games for the sectors on screen. Null clears them.
     * The diamond and the ship darts are not a hit: `partyAt` and `vesselAt` do not read them,
     * so a click still lands on the hex underneath. `publicShipAt` is for the hover card only.
     */
    setPublicGames(marks: ReadonlyMap<string, readonly PublicGameMark[]> | null): void {
        this.publicGames = marks ? new Map(marks) : new Map();
    }

    /** The campaign snapshot. Null draws nothing and does not fetch. */
    setCampaign(snapshot: CampaignSnapshot | null): void {
        this.campaignSnapshot = snapshot;
        if (!snapshot) {
            this.partyMark = null;
            this.vesselMarks = [];
            this.partyShips = [];
        }
    }

    /**
     * True when the point is on the party marker and not on the system glyph.
     * A zoomed-out point shares its pixels with the system, so it is never a hit.
     */
    partyAt(sx: number, sy: number): boolean {
        if (this.partyShipAt(sx, sy) !== null) return true;
        return this.partyMark ? partyContains(this.partyMark, sx, sy) : false;
    }

    /** The party ship whose marker is under the point, or null. The system glyph and a point are not a hit. */
    partyShipAt(sx: number, sy: number): string | null {
        for (let i = this.partyShips.length - 1; i >= 0; i -= 1) {
            const mark = this.partyShips[i];
            if (mark.id && partyContains(mark, sx, sy)) return mark.id;
        }
        return null;
    }

    /** The vessel under the point, or null. The system glyph and a zoomed-out point are not a hit. */
    vesselAt(sx: number, sy: number): string | null {
        for (let i = this.vesselMarks.length - 1; i >= 0; i -= 1) {
            const hit = this.vesselMarks[i];
            if (vesselContains(hit, sx, sy)) return hit.id;
        }
        return null;
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

    /** `animating` is true while a title fade is in progress: the caller should draw again next frame. */
    draw(cam: Camera): { tier: Tier; sectorsOnScreen: string[]; ms: number; animating: boolean } {
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
            this.paintPolityFills(cam, vp, view, POLITY_FILL_ALPHA);
            this.paintPolityStrokes(cam, vp, view);
            this.overviewPoints(on, cam, vp);
        }

        if (tier !== 'galaxy') {
            this.subsectorLines(on, cam, vp);
            this.strokeRects(on, cam, vp, this.theme.line2);
        }
        if (tier === 'hex') {
            const hexes = visibleHexes(view);
            const fillAlpha = TERRITORY_FILL_ALPHA;
            this.paintPolityFills(cam, vp, view, fillAlpha);
            if (cam.ppp >= PPP_GRID) this.paintRegions(ready, cam, vp);
            if (hexes.length <= HEX_OUTLINE_CAP) this.hexOutlines(hexes, cam, vp);
            if (cam.ppp >= PPP_GRID) this.routes(ready, cam, vp);
            this.paintPolityStrokes(cam, vp, view);
            marks = this.marks(ready, cam, vp);
            if (cam.ppp >= PPP_NAMES) this.chartMarks(marks, cam.ppp);
            else this.chartDiscs(marks, cam.ppp);
        }
        const namesPending = this.settleNameFont();
        this.sectorNames(on, cam, vp);
        if (tier !== 'hex' && cam.ppp >= FAR_LABEL_MIN_PPP) this.farLabels(on, cam, vp, view);
        this.selectionOutline(cam, vp, tier);
        let animating = tier === 'hex' && cam.ppp >= PPP_NAMES ? this.subsectorTitles(ready, marks, cam, vp) : false;
        if (namesPending) animating = true;
        if (this.paintRoute(cam, vp)) animating = true;
        if (tier === 'hex') this.paintPublic(on, cam, vp);
        else {
            this.publicShipHits = [];
            this.publicPings = [];
        }
        if (this.paintCampaign(cam, vp)) animating = true;

        return { tier, sectorsOnScreen: on.map((sector) => sector.slug), ms: now() - started, animating };
    }

    /**
     * One diamond per public game, off the world disc, or one dart per ship where the feed lists
     * them. Names and counts are drawn at the same zoom as hex labels. Nothing is drawn
     * when the map is empty, and the canvas is not touched in that case.
     */
    private paintPublic(sectors: DrawSector[], cam: Camera, vp: Viewport): void {
        this.publicShipHits = [];
        this.publicPings = [];
        if (this.publicGames.size === 0) return;
        const drawn: { sx: number; sy: number; label: string | null }[] = [];
        const fleets: Fleet[] = [];
        const pad = 24;
        for (const sector of sectors) {
            const rows = this.publicGames.get(sector.slug);
            if (!rows || rows.length === 0) continue;
            for (const row of rows) {
                const local = parseHex(row.hex);
                if (!local) continue;
                const global = toGlobal(sector.x, sector.y, local.col, local.row);
                const centre = hexCentre(global.q, global.r);
                const screen = toScreen(cam, vp, centre.x, centre.y);
                // Once 0017 is applied a hex lists its ships: one mark each. Without the list it is today's diamond.
                if (row.ships && row.ships.length > 0) {
                    const fx = screen.sx + SHIP_X * cam.ppp;
                    const fy = screen.sy + SHIP_Y * cam.ppp;
                    if (fx < -SHIP_PAD || fy < -SHIP_PAD || fx > vp.width + pad || fy > vp.height + pad) continue;
                    fleets.push({ sx: fx, sy: fy, key: sector.slug + '/' + row.hex, count: row.count, ships: row.ships });
                    continue;
                }
                const sx = screen.sx + PUBLIC_X * cam.ppp;
                const sy = screen.sy + PUBLIC_Y * cam.ppp;
                if (sx < -pad || sy < -pad || sx > vp.width + pad || sy > vp.height + pad) continue;
                const label = cam.ppp >= PPP_NAMES
                    ? (row.count > 1 ? String(row.count) : row.name)
                    : null;
                drawn.push({ sx, sy, label });
            }
        }
        if (drawn.length > 0) this.paintDiamonds(drawn, cam);
        if (fleets.length > 0) this.paintShips(fleets, cam);
    }

    /** Today's mark, for a hex the server sent without its ships: a diamond, and a name or a count. */
    private paintDiamonds(drawn: { sx: number; sy: number; label: string | null }[], cam: Camera): void {
        const ctx = this.ctx;
        const radius = Math.max(2, PUBLIC_R * cam.ppp);
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = this.theme.chart.publicGame;
        ctx.lineWidth = 1.5;
        for (const mark of drawn) {
            ctx.moveTo(mark.sx, mark.sy - radius);
            ctx.lineTo(mark.sx + radius, mark.sy);
            ctx.lineTo(mark.sx, mark.sy + radius);
            ctx.lineTo(mark.sx - radius, mark.sy);
            ctx.closePath();
        }
        ctx.stroke();
        ctx.fillStyle = this.theme.chart.publicGame;
        ctx.font = (FONT_SMALL * cam.ppp) + 'px ' + this.theme.fontText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        for (const mark of drawn) {
            if (!mark.label) continue;
            ctx.fillText(mark.label, mark.sx + radius + 4, mark.sy);
        }
        ctx.restore();
    }

    /**
     * Other people's ships. Where world names show: one dart each, stacked up from the top right
     * of the hex, each with its ship's name on a backed tag; more than SHIP_SHOWN on one hex is
     * two darts and a "+N" for the rest. Further out: one stack of up to SHIP_SHOWN darts per hex,
     * and "+N" past that. The marks are hover targets for the card, never click targets: a click
     * still lands on the hex underneath.
     */
    private paintShips(fleets: Fleet[], cam: Camera): void {
        const ctx = this.ctx;
        const names = cam.ppp >= PPP_NAMES;
        const half = Math.min(SHIP_HALF_MAX, Math.max(SHIP_HALF_MIN, SHIP_HALF * cam.ppp));
        const hits: ShipHit[] = [];
        const pings: ShipPing[] = [];
        ctx.save();
        ctx.font = 'italic 600 ' + SHIP_FONT + 'px ' + this.theme.fontText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.lineJoin = 'round';
        for (const fleet of fleets) {
            const total = Math.max(fleet.count, fleet.ships.length);
            const rows: ShipHit[] = [];
            if (names) {
                const step = Math.max(SHIP_ROW, half * 2.6);
                const shown = fleet.ships.slice(0, total <= SHIP_SHOWN ? SHIP_SHOWN : SHIP_SHOWN - 1);
                for (let i = 0; i < shown.length; i += 1) {
                    const ship = shown[i];
                    const cy = fleet.sy - i * step;
                    this.shipDart(fleet.sx, cy, half);
                    let right = this.shipTag(ship.ship, fleet.sx + half + 4, cy).x1;
                    if (ship.example) right = this.exampleTag(right + 3, cy);
                    rows.push(shipHit(fleet.key + '|' + ship.mark, [ship], 0, fleet.sx - half, cy, right, half));
                }
                const hidden = total - shown.length;
                if (hidden > 0) {
                    const cy = fleet.sy - shown.length * step;
                    const right = this.shipTag('+' + String(hidden), fleet.sx - half - 2, cy).x1;
                    rows.push(shipHit(fleet.key + '|more', fleet.ships.slice(shown.length), total - fleet.ships.length, fleet.sx - half, cy, right, half));
                }
            } else {
                // One stack for the hex, the front dart at the place and each one behind it up and to the right.
                const deck = Math.min(SHIP_SHOWN, total);
                const off = half * SHIP_DECK;
                for (let i = deck - 1; i >= 0; i -= 1) this.shipDart(fleet.sx + i * off, fleet.sy - i * off, half);
                let right = fleet.sx + half + (deck - 1) * off;
                if (total > SHIP_SHOWN) right = this.shipTag('+' + String(total - SHIP_SHOWN), right + 3, fleet.sy - (deck - 1) * off).x1;
                const hit = shipHit(fleet.key + '|all', fleet.ships, total - fleet.ships.length, fleet.sx - half, fleet.sy, right, half);
                hit.box.y0 -= (deck - 1) * off;
                rows.push(hit);
            }
            // The card opens beside, or on a phone above, all of the hex's marks, never over one of them.
            const place = {
                x0: Math.min(...rows.map((row) => row.box.x0)),
                y0: Math.min(...rows.map((row) => row.box.y0)),
                x1: Math.max(...rows.map((row) => row.box.x1)),
                y1: Math.max(...rows.map((row) => row.box.y1)),
            };
            for (const row of rows) row.place = place;
            hits.push(...rows);
            pings.push({ key: fleet.key, x: fleet.sx, y: fleet.sy });
        }
        ctx.restore();
        this.publicShipHits = hits;
        this.publicPings = pings;
    }

    /** A dart pointing right, with a notched tail: a ship, not a world, a base or the party's ring. */
    private shipDart(cx: number, cy: number, half: number): void {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.moveTo(cx + half, cy);
        ctx.lineTo(cx - half, cy - half * 0.8);
        ctx.lineTo(cx - half * 0.4, cy);
        ctx.lineTo(cx - half, cy + half * 0.8);
        ctx.closePath();
        ctx.strokeStyle = this.theme.bg0;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        // A soft glow of its own colour: the ship is lit, not printed on the chart.
        ctx.shadowColor = this.theme.chart.publicGame;
        ctx.shadowBlur = half * SHIP_GLOW;
        ctx.fillStyle = this.theme.chart.publicGame;
        ctx.fill();
        ctx.shadowBlur = 0;
    }

    /** "Example" after a ship's name: outlined, smaller and muted, quieter than the name. Returns its right edge. */
    private exampleTag(x: number, cy: number): number {
        const ctx = this.ctx;
        const font = ctx.font;
        ctx.font = '600 ' + SHIP_EXAMPLE_FONT + 'px ' + this.theme.fontText;
        const w = ctx.measureText(EXAMPLE_WORD).width + SHIP_TAG_PAD * 1.6;
        const h = SHIP_TAG_H - 4;
        ctx.globalAlpha = SHIP_TAG_ALPHA;
        ctx.fillStyle = this.theme.bg0;
        ctx.beginPath();
        ctx.roundRect(x, cy - h / 2, w, h, h / 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.strokeStyle = this.theme.textMuted;
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.fillStyle = this.theme.textMuted;
        ctx.fillText(EXAMPLE_WORD, x + SHIP_TAG_PAD * 0.8, cy);
        ctx.font = font;
        return x + w;
    }

    /**
     * The finished route of the ship whose card is open: each leg a line of round dots from hex to
     * hex, marching slowly the way the ship went, with a ring at each stop. Violet and dotted, so it
     * is not a trade route (solid or dashed, in an allegiance's colour) and not a track of your own.
     * Drawn at every zoom while the card is open. Returns true while it marches.
     */
    private paintRoute(cam: Camera, vp: Viewport): boolean {
        const legs = this.publicRoute;
        if (!legs || legs.length === 0) return false;
        const ctx = this.ctx;
        const stops = new Map<string, { sx: number; sy: number }>();
        const lines: [{ sx: number; sy: number }, { sx: number; sy: number }][] = [];
        for (const leg of legs) {
            const a = this.hexKeyScreen(leg.from, cam, vp);
            const b = this.hexKeyScreen(leg.to, cam, vp);
            if (!a || !b) continue;
            stops.set(leg.from, a);
            stops.set(leg.to, b);
            if (leg.from !== leg.to) lines.push([a, b]);
        }
        if (stops.size === 0) return false;
        const still = prefersReducedMotion();
        const width = Math.max(2.5, Math.min(4, cam.ppp * ROUTE_WIDTH));
        const gap = width * ROUTE_GAP;
        ctx.save();
        ctx.strokeStyle = this.theme.chart.publicGame;
        ctx.lineCap = 'round';
        ctx.lineWidth = width;
        ctx.setLineDash([0.1, gap]);
        ctx.lineDashOffset = still ? 0 : -(((now() / ROUTE_MARCH_MS) * gap) % gap);
        ctx.globalAlpha = ROUTE_ALPHA;
        ctx.beginPath();
        for (const [a, b] of lines) {
            ctx.moveTo(a.sx, a.sy);
            ctx.lineTo(b.sx, b.sy);
        }
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.lineWidth = 1.5;
        const ring = Math.max(4, Math.min(9, cam.ppp * ROUTE_RING));
        ctx.beginPath();
        for (const stop of stops.values()) {
            ctx.moveTo(stop.sx + ring, stop.sy);
            ctx.arc(stop.sx, stop.sy, ring, 0, Math.PI * 2);
        }
        ctx.stroke();
        ctx.restore();
        return !still && lines.length > 0;
    }

    /** A chart hex key ("Spinward_Marches/1910") on the screen, or null for a sector the chart does not hold. */
    private hexKeyScreen(key: string, cam: Camera, vp: Viewport): { sx: number; sy: number } | null {
        const slash = key.lastIndexOf('/');
        if (slash <= 0) return null;
        const local = parseHex(key.slice(slash + 1));
        if (!local) return null;
        const slug = key.slice(0, slash);
        const sector = this.sectors.find((item) => item.slug === slug);
        if (!sector) return null;
        const global = toGlobal(sector.x, sector.y, local.col, local.row);
        const centre = hexCentre(global.q, global.r);
        return toScreen(cam, vp, centre.x, centre.y);
    }

    /** The open card's finished legs, drawn until it closes. Null clears them. */
    setPublicRoute(legs: readonly { from: string; to: string }[] | null): void {
        this.publicRoute = legs && legs.length > 0 ? [...legs] : null;
    }

    /** One point per hex of other people's ships, where its front dart is: the map's pings sit there. */
    publicShipPings(): readonly ShipPing[] {
        return this.publicPings;
    }

    /** A name or a count on a backed tag, so it reads over the chart. Returns its right edge. */
    private shipTag(label: string, x: number, cy: number): { x1: number } {
        const ctx = this.ctx;
        const said = fitLabel(label, (text) => ctx.measureText(text).width, SHIP_TAG_MAX);
        const w = ctx.measureText(said).width + SHIP_TAG_PAD * 2;
        ctx.globalAlpha = SHIP_TAG_ALPHA;
        ctx.fillStyle = this.theme.bg0;
        ctx.beginPath();
        ctx.roundRect(x, cy - SHIP_TAG_H / 2, w, SHIP_TAG_H, 3);
        ctx.fill();
        ctx.globalAlpha = 1;
        ctx.fillStyle = this.theme.chart.publicGame;
        ctx.fillText(said, x + SHIP_TAG_PAD, cy);
        return { x1: x + w };
    }

    /** The public ship mark under a point: what its card says. Null off every mark. */
    publicShipAt(sx: number, sy: number): PublicShipHit | null {
        for (let i = this.publicShipHits.length - 1; i >= 0; i -= 1) {
            const hit = this.publicShipHits[i];
            if (sx >= hit.box.x0 && sx <= hit.box.x1 && sy >= hit.box.y0 && sy <= hit.box.y1) return hit;
        }
        return null;
    }

    /** The mark a card was opened on, where it is drawn now. Null once it has left the screen. */
    publicShipByKey(key: string): PublicShipHit | null {
        return this.publicShipHits.find((hit) => hit.key === key) ?? null;
    }

    private paintCampaign(cam: Camera, vp: Viewport): boolean {
        if (!this.campaignSnapshot) {
            this.partyMark = null;
            this.vesselMarks = [];
            this.partyShips = [];
            return false;
        }
        const frame = drawCampaignLayer(this.ctx, {
            cam,
            vp,
            sectors: this.sectors,
            snapshot: this.campaignSnapshot,
            ink: {
                signal: this.theme.signal,
                tag: this.theme.tag ? this.theme.tag : this.theme.bg0,
                bg: this.theme.bg0,
                font: this.theme.fontText,
                pulseMs: (this.theme.tPulse > 0 ? this.theme.tPulse : 2.4) * 1000,
            },
            nowMs: now(),
        });
        this.partyMark = frame.mark;
        this.vesselMarks = frame.vessels;
        this.partyShips = frame.ships;
        return frame.animating;
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
            const cells = this.dotOverlay.get(sector.slug) ?? sector.cells;
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

    private visiblePolities(view: Rect): DrawnPolity[] {
        return this.polityPaths.filter((item) => boxHits(item.box, view));
    }

    /** Paths are in parsecs. The transform is the camera, so a stroke of TERRITORY_STROKE / ppp is 2.5 px. */
    private withCamera(cam: Camera, vp: Viewport, paint: () => void): void {
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
        paint();
        ctx.restore();
    }

    private paintPolityFills(cam: Camera, vp: Viewport, view: Rect, alpha: number): void {
        const visible = this.visiblePolities(view);
        if (!visible.length) return;
        const ctx = this.ctx;
        this.withCamera(cam, vp, () => {
            ctx.globalAlpha = alpha;
            for (const item of visible) {
                ctx.fillStyle = item.color;
                ctx.fill(item.path, 'evenodd');
            }
            ctx.globalAlpha = 1;
        });
    }

    private paintPolityStrokes(cam: Camera, vp: Viewport, view: Rect): void {
        const visible = this.visiblePolities(view);
        if (!visible.length) return;
        const ctx = this.ctx;
        this.withCamera(cam, vp, () => {
            ctx.globalAlpha = 1;
            for (const item of visible) {
                ctx.strokeStyle = item.color;
                ctx.stroke(item.path);
            }
        });
    }

    private regionsOf(index: SectorIndex): DrawnRegion[] {
        const found = this.regionPaths.get(index);
        if (found) return found;
        const regions = index.regions;
        const drawn: DrawnRegion[] = [];
        if (regions) {
            for (const region of regions) {
                if (!region.loops || region.loops.length === 0) continue;
                drawn.push({ color: region.color ?? '', path: pathFromLoops(region.loops) });
            }
        }
        this.regionPaths.set(index, drawn);
        return drawn;
    }

    private paintRegions(ready: { sector: DrawSector; index: SectorIndex }[], cam: Camera, vp: Viewport): void {
        const shapes: DrawnRegion[] = [];
        for (const item of ready) {
            for (const shape of this.regionsOf(item.index)) shapes.push(shape);
        }
        if (!shapes.length) return;
        const ctx = this.ctx;
        this.withCamera(cam, vp, () => {
            ctx.globalAlpha = REGION_FILL_ALPHA;
            for (const shape of shapes) {
                ctx.fillStyle = shape.color;
                ctx.fill(shape.path, 'evenodd');
            }
            ctx.globalAlpha = 1;
        });
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

    private selectionOutline(cam: Camera, vp: Viewport, tier: Tier): void {
        const selected = this.selected;
        if (!selected) return;
        let sector: DrawSector | null = null;
        for (const item of this.sectors) if (item.slug === selected.slug) sector = item;
        if (!sector) return;
        // Zoomed out, a hex polygon is drawn after the dots and covers them. The sector border does not.
        if (tier !== 'hex') {
            const ctx = this.ctx;
            ctx.beginPath();
            ctx.strokeStyle = this.theme.chart.selected;
            ctx.lineWidth = SELECT_STROKE;
            const a = toScreen(cam, vp, sector.rect.x0, sector.rect.y0);
            const b = toScreen(cam, vp, sector.rect.x1, sector.rect.y1);
            ctx.rect(a.sx, a.sy, b.sx - a.sx, b.sy - a.sy);
            ctx.stroke();
            return;
        }
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
     * One pill per subsector, from PPP_NAMES up (B1.12a). Where a pill sits is decided once
     * per subsector and zoom step, in map space, and cached; while panning it rides with the
     * map. Each frame only holds it at the top edge (sticky, B1.12b) and fades it: out where it
     * would cover the selected hex or is no longer wholly in view (it left by a side or the
     * bottom, or its subsector pushed it out at the top), and across a zoom step that picks a
     * different spot. Returns true while any fade is in progress.
     */
    private subsectorTitles(
        ready: { sector: DrawSector; index: SectorIndex }[],
        _marks: Mark[],
        cam: Camera,
        vp: Viewport,
    ): boolean {
        const time = now();
        const elapsed = time - this.titleTime;
        this.titleTime = time;
        const duration = this.theme.tFast * 1000;
        const instant = !(duration > 0) || prefersReducedMotion();
        const amount = instant ? 1 : elapsed / duration;
        const step = zoomStep(cam.ppp);
        const bounds: Box = {
            x: this.workspaceLeft,
            y: TITLE_TOP,
            w: vp.width - this.workspaceLeft,
            h: vp.height - TITLE_TOP,
        };
        const guard = this.selectedGuard(cam, vp, cam.ppp / 1.5);
        const spanX = SECTOR_COLS / 4;
        const spanY = (SECTOR_ROWS / 4) * ROW_STEP;
        const live = new Set<string>();
        let moving = false;
        let drew = false;
        for (const item of ready) {
            for (let row = 0; row < 4; row++) {
                for (let col = 0; col < 4; col++) {
                    const rect: Box = { x: item.sector.rect.x0 + col * spanX, y: item.sector.rect.y0 + row * spanY, w: spanX, h: spanY };
                    const topLeft = toScreen(cam, vp, rect.x, rect.y);
                    const home: Box = { x: topLeft.sx, y: topLeft.sy, w: rect.w * cam.ppp, h: rect.h * cam.ppp };
                    if (home.x >= vp.width || home.y >= vp.height || home.x + home.w <= 0 || home.y + home.h <= 0) continue;
                    const letter = String.fromCharCode(65 + row * 4 + col);
                    const key = item.sector.slug + ':' + letter;
                    live.add(key);

                    let state = this.titleStates.get(key);
                    if (!state || state.step !== step || state.index !== item.index) {
                        const label = item.sector.name + ' - ' + subsectorName(item.index, letter);
                        const pill = this.placeSubsectorTitle(item, rect, label, step);
                        const kept = state && state.index === item.index && state.pill && pill
                            && state.pill.fontPx === pill.fontPx
                            && Math.abs(state.pill.x - pill.x) * cam.ppp < TITLE_SAME_PX
                            && Math.abs(state.pill.y - pill.y) * cam.ppp < TITLE_SAME_PX;
                        if (state && kept) {
                            state.step = step;
                            state.pill = pill;
                        } else {
                            const leaving = !instant && state && state.pill && state.alpha > 0
                                ? { label: state.label, pill: state.pill, alpha: state.alpha }
                                : null;
                            state = { step, index: item.index, label, pill, alpha: 0, moving: false, out: leaving };
                            this.titleStates.set(key, state);
                        }
                    }

                    const out = state.out;
                    if (out) {
                        out.alpha = fadeToward(out.alpha, 0, amount);
                        if (out.alpha > 0) {
                            const at = toScreen(cam, vp, out.pill.x, out.pill.y);
                            const spot = clampTitle({ x: at.sx, y: at.sy }, out.pill.h, home, bounds);
                            this.paintTitle(out.label, out.pill, spot, out.alpha);
                            drew = true;
                            moving = true;
                        } else {
                            state.out = null;
                        }
                    }

                    const pill = state.pill;
                    if (!pill) continue;
                    const at = toScreen(cam, vp, pill.x, pill.y);
                    const spot = clampTitle({ x: at.sx, y: at.sy }, pill.h, home, bounds);
                    const covers = guard !== null && boxesOverlap({ x: spot.x, y: spot.y, w: pill.w, h: pill.h }, guard);
                    const target = !covers && titleInView(spot, pill.w, pill.h, bounds) ? 1 : 0;
                    if (instant) {
                        state.alpha = target;
                        state.moving = false;
                    } else if (state.moving) {
                        state.alpha = fadeToward(state.alpha, target, amount);
                        state.moving = state.alpha !== target;
                    } else if (state.alpha !== target) {
                        // The fade starts this frame; it advances from the next one.
                        state.moving = true;
                    }
                    if (state.moving) moving = true;
                    if (state.alpha > 0) {
                        this.paintTitle(state.label, pill, spot, state.alpha);
                        drew = true;
                    }
                }
            }
        }
        for (const key of this.titleStates.keys()) if (!live.has(key)) this.titleStates.delete(key);
        if (drew) this.ctx.globalAlpha = 1;
        return moving;
    }

    /** Label size and anchor for one subsector at one zoom step. The font is fixed for the step. */
    private placeSubsectorTitle(
        item: { sector: DrawSector; index: SectorIndex },
        rect: Box,
        label: string,
        step: number,
    ): TitlePill | null {
        const ctx = this.ctx;
        let fontPx = TITLE_FONT;
        ctx.font = '600 ' + fontPx + 'px ' + this.theme.fontText;
        let textW = ctx.measureText(label).width;
        const room = rect.w * stepScale(step) - 24;
        if (room > 0 && textW > room) {
            fontPx *= room / textW;
            if (fontPx < TITLE_MIN_FONT) return null;
            ctx.font = '600 ' + fontPx + 'px ' + this.theme.fontText;
            textW = ctx.measureText(label).width;
        }
        const w = textW + fontPx * TITLE_PAD_X * 2;
        const h = fontPx + fontPx * TITLE_PAD_Y * 2;
        const anchor = titleAnchor(rect, step, w, h, this.titleWorldsOf(item.sector, item.index));
        return anchor ? { x: anchor.x, y: anchor.y, w, h, fontPx } : null;
    }

    /** World centres of one sector in map units, built once per index object. */
    private titleWorldsOf(sector: DrawSector, index: SectorIndex): { x: number; y: number }[] {
        const cached = this.titleWorlds.get(index);
        if (cached) return cached;
        const worlds: { x: number; y: number }[] = [];
        for (const hhhh of Object.keys(index.hexes)) {
            const local = parseHex(hhhh);
            if (!local) continue;
            const global = toGlobal(sector.x, sector.y, local.col, local.row);
            worlds.push(hexCentre(global.q, global.r));
        }
        this.titleWorlds.set(index, worlds);
        return worlds;
    }

    private paintTitle(label: string, pill: TitlePill, spot: { x: number; y: number }, alpha: number): void {
        const ctx = this.ctx;
        ctx.font = '600 ' + pill.fontPx + 'px ' + this.theme.fontText;
        ctx.beginPath();
        ctx.roundRect(spot.x, spot.y, pill.w, pill.h, Math.min(pill.fontPx * TITLE_RADIUS, pill.h / 2));
        ctx.globalAlpha = TITLE_PILL_ALPHA * alpha;
        ctx.fillStyle = this.theme.chart.titlePill;
        ctx.fill();
        ctx.globalAlpha = TITLE_TEXT_ALPHA * alpha;
        ctx.fillStyle = this.theme.chart.titleText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, spot.x + pill.fontPx * TITLE_PAD_X, spot.y + pill.h / 2);
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

    /** The first family of the display token, without quotes. */
    private displayFamily(): string {
        const raw = this.theme.fontDisplay.split(',')[0].trim();
        const quoted = raw.length >= 2 && (raw[0] === "'" || raw[0] === '"') && raw[raw.length - 1] === raw[0];
        return quoted ? raw.slice(1, -1) : raw;
    }

    /** True when measureText will see the display face. No document means the test font is the face. */
    private displayFontLoaded(): boolean {
        const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
        if (!fonts || typeof fonts.check !== 'function') return true;
        const family = this.displayFamily();
        if (!family) return true;
        try {
            return fonts.check(NAME_SIZE + "px '" + family + "'");
        } catch {
            return true;
        }
    }

    /**
     * Widths taken before the display font loads belong to the fallback, which is
     * narrower, so a later frame would draw the real face past the sector.
     * Asks for one more frame until the face is the one being measured.
     * Returns true while that frame is still owed.
     */
    private settleNameFont(): boolean {
        if (this.nameWidthsReady) return false;
        if (this.displayFontLoaded()) {
            this.nameWidthAt18.clear();
            this.nameWidthsReady = true;
            return false;
        }
        if (!this.nameFontAsked) {
            this.nameFontAsked = true;
            const fonts = typeof document !== 'undefined' ? document.fonts : undefined;
            const family = this.displayFamily();
            const load = fonts && typeof fonts.load === 'function' ? fonts.load(NAME_SIZE + "px '" + family + "'") : null;
            if (load && typeof load.then === 'function') {
                void load.then(() => {
                    this.nameWidthAt18.clear();
                    this.nameFontTries += 1;
                    this.nameWidthsReady = this.displayFontLoaded() || this.nameFontTries >= 2;
                    if (!this.nameWidthsReady) this.nameFontAsked = false;
                }, () => {
                    this.nameWidthsReady = true;
                });
            } else {
                this.nameWidthsReady = true;
            }
        }
        return !this.nameWidthsReady;
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
     * Layer 7, sector names only. Subsector titles are a later pass and already
     * drop below 9 px. Measure at 18 px, once per name. Wider than the sector
     * less a 16% margin (84% of the drawn width): scale down to that width.
     * Below a 9 px floor, or a rectangle over 2400 px, draw nothing. 9 px is
     * half the display size; under it the name is noise on a sector this narrow.
     * No ellipsis. The drawn name is never wider than the sector.
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
