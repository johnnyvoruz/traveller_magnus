import type { SectorHex, SectorIndex, TruthManifest, TruthOverview, TruthPolities } from '@voyage/shared';
import farLabels from '../../../../universe/far_labels.json' with { type: 'json' };
import { now, prefersReducedMotion } from '../platform/browser.ts';
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
import { routeSegments, type RouteSegment } from './route_lines.ts';
import { drawCampaignLayer, partyContains, vesselContains, type CampaignPartyShip, type CampaignSnapshot, type PartyMark, type VesselHit } from './campaign_layer.ts';
import type { PublicGameMark, PublicShipMark } from './public_games.ts';
import type { MapTheme } from './theme.ts';
import { arrowHead, mergeTracks, routeChains, TRACK_CASE, TRACK_MERGE_PX, TRACK_SHOWN, TRACK_STEP, trackBox, type RouteLeg, type Track, type TrackBox } from './traffic.ts';
import { PPP_DOTS, PPP_GRID, PPP_NAMES, tierFor, type Tier } from './tiers.ts';
import { boxesOverlap, clampTitle, fadeToward, separateTitles, stepScale, titleAnchor, titleInView, zoomStep, type Box } from './titles.ts';
import { baseMarks, hasGasGiant, starport, worldHasWater, worldIsBelt } from './uwp.ts';

const HEX_OUTLINE_CAP = 12000;
/** The grid's outlines are cached in world space a sector-sized block of hexes at a time. */
const OUTLINE_TILE_COLS = SECTOR_COLS;
const OUTLINE_TILE_ROWS = SECTOR_ROWS;
const OUTLINE_TILES_KEPT = 96;
/** prefers-reduced-motion is read again at most this often (ms): each read is a media query. */
const REDUCED_MOTION_TTL_MS = 1000;
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
 * Other people's ships and yours are tracks on their own layer (map/traffic.ts). At the hex zoom a
 * hex's first track sits this far right of and above the hex centre, in parsecs, clear of the hex
 * number, the starport letter, the name and the gas giant; and never nearer the centre than
 * TRACK_NEAR pixels, so at the low hex zooms it stays off the world.
 */
const SHIP_X = 0.3;
const SHIP_Y = -0.36;
const TRACK_NEAR = 10;
/**
 * The open card's route (prompts/d_store_2.md item 3): solid lines, cased in the chart's dark like
 * the tracks. The course ahead is the bright line, the finished track the same colour dimmed.
 */
const ROUTE_LINE = 2;
const ROUTE_CASE = TRACK_CASE;
const ROUTE_CASE_ALPHA = 0.9;
/** The finished track's ink: 70%, not the 45% first asked for, which measured 2.3:1 on the chart (findings: d_store_2 report). */
const ROUTE_TRACK_ALPHA = 0.7;
/** The arrowhead at the end of the course, and the small one at the present hex when there is no course: length along the line. */
const ROUTE_HEAD = 10;
const ROUTE_HEAD_SMALL = 7;

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
    /** Every ship the feed listed on this hex, so a card opened here can step through them all. */
    fleet: readonly PublicShipMark[];
    /** The mark's centre and its world's, for a finger: the nearer of the two takes the tap. */
    cx: number;
    cy: number;
    wx: number;
    wy: number;
};

/** A track on the traffic layer, and what pressing it does. */
export type TrafficTrack = Track & {
    box: TrackBox;
    /** Someone else's ships under it, for the card. Null zoomed out: the overview carries no names. */
    hit: PublicShipHit | null;
    /** One of the party's ships: a press opens the Party tab. */
    ownId: string | null;
    /** Zoomed out: the hex a press flies to, in world units. */
    fly: { x: number; y: number } | null;
    /** The world the track sits by, on screen: a finger nearer the world than the track is the world's. */
    wx: number;
    wy: number;
};

/** A finger's target is at least this many pixels across (prompts/d_public_overview_map.md item 6). */
export const TOUCH_PX = 44;

/** How far a point is outside a box, 0 inside it. */
function outside(box: { x0: number; y0: number; x1: number; y1: number }, x: number, y: number): number {
    const dx = x < box.x0 ? box.x0 - x : x > box.x1 ? x - box.x1 : 0;
    const dy = y < box.y0 ? box.y0 - y : y > box.y1 ? y - box.y1 : 0;
    return Math.hypot(dx, dy);
}

/** The box grown about its centre to at least TOUCH_PX each way. */
function touchBox(box: { x0: number; y0: number; x1: number; y1: number }): { x0: number; y0: number; x1: number; y1: number } {
    const growX = Math.max(0, TOUCH_PX - (box.x1 - box.x0)) / 2;
    const growY = Math.max(0, TOUCH_PX - (box.y1 - box.y0)) / 2;
    return { x0: box.x0 - growX, y0: box.y0 - growY, x1: box.x1 + growX, y1: box.y1 + growY };
}

/** A finger on a party marker: within half of TOUCH_PX of it, and nearer it than its world. A point is never a hit. */
function fingerOn(mark: PartyMark, sx: number, sy: number): boolean {
    if (mark.tier === 'point') return false;
    const d = Math.hypot(sx - mark.cx, sy - mark.cy);
    return d <= Math.max(mark.hitR, TOUCH_PX / 2) && d < Math.hypot(sx - mark.worldX, sy - mark.worldY);
}

/** A ship's name as a data block says it. */
function blockWords(name: string): string {
    return name.toUpperCase();
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

/** One sector's galaxy-zoom dots as a bitmap (DF9), and what it was drawn for. */
type DotTile = { ppp: number; dpr: number; cells: string; ink: string; tile: OffscreenCanvas; pad: number };

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

type HexBounds = { q0: number; q1: number; r0: number; r1: number; count: number };

/** The rows and columns visibleHexes covers, and how many hexes that is, without building the list. */
function visibleHexBounds(view: Rect): HexBounds {
    const q0 = Math.floor(view.x0) - 1;
    const q1 = Math.ceil(view.x1) + 1;
    let r0 = Infinity, r1 = -Infinity, count = 0;
    for (let q = q0; q <= q1; q++) {
        const offset = (q & 1) ? 0.5 : 0;
        const from = Math.floor(view.y0 / ROW_STEP - offset) - 1;
        const to = Math.ceil(view.y1 / ROW_STEP - offset) + 1;
        if (from < r0) r0 = from;
        if (to > r1) r1 = to;
        count += Math.max(0, to - from + 1);
    }
    return { q0, q1, r0, r1, count };
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
    /** The screen's canvas, context and theme. drawInto (DP1) swaps them for one frame and puts them back. */
    private canvas: HTMLCanvasElement;
    private ctx: CanvasRenderingContext2D;
    private theme: MapTheme;
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
    private labelNames: Map<string, string> | null = null;
    /** The galaxy zoom's dot bitmaps by sector slug (DF9), and the zoom the last frame drew dots at. */
    private readonly dotTiles = new Map<string, DotTile>();
    private lastDotPpp = -1;
    private selected: Selection | null = null;
    /** Left inset for subsector titles, in CSS pixels. 0 keeps titles at the viewport edge. */
    private workspaceLeft = 0;
    /** Subsector titles stick below this y, in CSS pixels: below the floating controls at the top (DS5). */
    private titleTop = TITLE_TOP;
    /** Subsector titles by "slug:letter": placement per zoom step and the current fade. */
    private readonly titleStates = new Map<string, TitleState>();
    /** World centres per index object, for title placement. */
    private readonly titleWorlds = new WeakMap<object, { x: number; y: number }[]>();
    private titleTime = 0;
    private readonly outlineTiles = new Map<string, Path2D>();
    private reducedAt = Number.NEGATIVE_INFINITY;
    private reduced = false;
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
    /** Zoomed out: every hex with public ships on the chart, from the overview. */
    private publicOverview: readonly { key: string; count: number }[] | null = null;
    /** Sectors by slug, for keys like "Spinward_Marches/1910". */
    private sectorBySlug = new Map<string, DrawSector>();
    /** The tracks this frame: someone else's first, then yours, as the traffic layer draws them. */
    private tracks: TrafficTrack[] = [];
    /** The ship whose card is open, by its mark, and the track that stands for it this frame. */
    private selectedMark: string | null = null;
    private selectedKey: string | null = null;
    /** The route of the ship whose card is open: its finished legs and its course ahead. */
    private publicRoute: { legs: RouteLeg[]; course: RouteLeg[] } | null = null;
    /** The party's selected ship's route (the lead's when none is selected), drawn in the signal colour while no card is open. */
    private partyRoute: { legs: RouteLeg[]; course: RouteLeg[] } | null = null;
    /** The traffic colour (traffic.ts), for that route. */
    private trafficColour = '';

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
        this.sectorBySlug = new Map(this.sectors.map((sector) => [sector.slug, sector]));
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
        this.labelNames = null;
    }

    /** A world's far label, by sector slug and hex, for the zoomed-out hover's words (DF8); null for none. */
    farLabelName(slug: string, hhhh: string): string | null {
        if (!this.labelNames) {
            this.labelNames = new Map();
            for (const label of this.labels) this.labelNames.set(label.sector + '/' + label.hex, label.name);
        }
        return this.labelNames.get(slug + '/' + hhhh) ?? null;
    }

    setSelection(selection: Selection | null): void {
        this.selected = selection;
    }

    /** Public games for the sectors on screen, drawn as tracks at the hex zoom. Null clears them. */
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
    partyAt(sx: number, sy: number, touch = false): boolean {
        if (this.partyShipAt(sx, sy, touch) !== null) return true;
        if (!this.partyMark) return false;
        return partyContains(this.partyMark, sx, sy) || (touch && fingerOn(this.partyMark, sx, sy));
    }

    /**
     * The party ship whose marker is under the point, or null. The system glyph and a point are not
     * a hit. For a finger the marker is TOUCH_PX across, unless the point is nearer its world.
     */
    partyShipAt(sx: number, sy: number, touch = false): string | null {
        for (let i = this.partyShips.length - 1; i >= 0; i -= 1) {
            const mark = this.partyShips[i];
            if (mark.id && partyContains(mark, sx, sy)) return mark.id;
        }
        // Your other ships are filled tracks at the hex zoom. Zoomed out a press on any track flies in (trackAt).
        const track = this.trackAt(sx, sy, touch);
        if (track && track.ownId && !track.fly) return track.ownId;
        if (!touch) return null;
        let best: string | null = null;
        let bestD = Infinity;
        for (const mark of this.partyShips) {
            if (!mark.id || !fingerOn(mark, sx, sy)) continue;
            const d = Math.hypot(sx - mark.cx, sy - mark.cy);
            if (d < bestD) {
                best = mark.id;
                bestD = d;
            }
        }
        return best;
    }

    /**
     * Where the hover ring goes (DF8) for a mouse over a mark a click acts on: a track, a party ship's
     * marker, the party's, a vessel's. Its centre and radius on screen, by the same tests as the click.
     */
    markRing(sx: number, sy: number): { x: number; y: number; r: number } | null {
        const track = this.trackAt(sx, sy);
        if (track) return { x: track.x, y: track.y, r: Math.max(8, Math.hypot(track.box.x1 - track.box.x0, track.box.y1 - track.box.y0) / 2 + 2) };
        for (let i = this.partyShips.length - 1; i >= 0; i -= 1) {
            const mark = this.partyShips[i];
            if (mark.id && partyContains(mark, sx, sy)) return { x: mark.cx, y: mark.cy, r: Math.max(8, mark.hitR + 2) };
        }
        if (this.partyMark && partyContains(this.partyMark, sx, sy)) return { x: this.partyMark.cx, y: this.partyMark.cy, r: Math.max(8, this.partyMark.hitR + 2) };
        for (let i = this.vesselMarks.length - 1; i >= 0; i -= 1) {
            const hit = this.vesselMarks[i];
            if (vesselContains(hit, sx, sy)) return { x: hit.cx, y: hit.cy, r: Math.max(8, hit.hitR + 2) };
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

    /**
     * Subsector titles stick below this y (DS5): the host measures its floating controls, as on a
     * phone the date sits on a second row under the search. Never above the search row's own line.
     */
    setTitleTop(px: number): void {
        this.titleTop = px > TITLE_TOP ? px : TITLE_TOP;
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

    /** Polity and region fills at the theme's share of their alpha: 1 on screen, --print-chart-fill on paper. */
    private fillScale(): number {
        const scale = this.theme.fillScale;
        return scale !== undefined && scale > 0 ? scale : 1;
    }

    /**
     * One frame into another canvas (DP1, a saved image): the chart as it stands, under this camera,
     * at this size and device pixel ratio, in this theme, with no selection and the title insets at
     * zero. The screen's canvas, context, theme, size, insets, selection, title states and the frame's
     * hit targets are saved first and put back in a finally, as the legacy captureSubsector did: the
     * chart on screen is not drawn to and its next frame is the same as before. Titles come at full
     * when the theme has no fade (tFast 0). Dot tiles made at the capture's zoom are dropped after.
     * Returns the frame's tracks, for the caller to draw as the traffic layer would, or null when the
     * canvas gives no context (the browser refused the size).
     */
    drawInto(
        canvas: HTMLCanvasElement,
        cam: Camera,
        width: number,
        height: number,
        dpr: number,
        theme: MapTheme,
        opts: { titleTop: number; workspaceLeft: number; selection: Selection | null },
    ): { tier: Tier; tracks: readonly TrafficTrack[] } | null {
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        const live = {
            canvas: this.canvas,
            ctx: this.ctx,
            theme: this.theme,
            width: this.width,
            height: this.height,
            dpr: this.dpr,
            titleTop: this.titleTop,
            workspaceLeft: this.workspaceLeft,
            selected: this.selected,
            tracks: this.tracks,
            partyMark: this.partyMark,
            vesselMarks: this.vesselMarks,
            partyShips: this.partyShips,
            selectedKey: this.selectedKey,
            titleTime: this.titleTime,
            titles: [...this.titleStates].map(([key, state]): [string, TitleState] => [key, { ...state, out: state.out ? { ...state.out } : null }]),
        };
        try {
            this.canvas = canvas;
            this.ctx = ctx;
            this.theme = theme;
            this.titleTop = opts.titleTop > TITLE_TOP ? opts.titleTop : TITLE_TOP;
            this.workspaceLeft = opts.workspaceLeft > 0 ? opts.workspaceLeft : 0;
            this.selected = opts.selection;
            this.dotTiles.clear();
            this.lastDotPpp = -1;
            this.resize(width, height, dpr);
            const drawn = this.draw(cam);
            return { tier: drawn.tier, tracks: this.tracks };
        } finally {
            this.canvas = live.canvas;
            this.ctx = live.ctx;
            this.theme = live.theme;
            this.width = live.width;
            this.height = live.height;
            this.dpr = live.dpr;
            this.titleTop = live.titleTop;
            this.workspaceLeft = live.workspaceLeft;
            this.selected = live.selected;
            this.tracks = live.tracks;
            this.partyMark = live.partyMark;
            this.vesselMarks = live.vesselMarks;
            this.partyShips = live.partyShips;
            this.selectedKey = live.selectedKey;
            this.titleTime = live.titleTime;
            this.titleStates.clear();
            for (const [key, state] of live.titles) this.titleStates.set(key, state);
            this.dotTiles.clear();
            this.lastDotPpp = -1;
            this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        }
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
        }

        if (tier !== 'galaxy') {
            this.subsectorLines(on, cam, vp);
            this.strokeRects(on, cam, vp, this.theme.line2);
        }
        // Zoomed out the dots go over the subsector and sector lines (DF10): a line crossing a system's
        // dot no longer splits it in two.
        if (tier !== 'hex') this.overviewPoints(on, cam, vp);
        if (tier === 'hex') {
            const hexes = visibleHexBounds(view);
            const fillAlpha = TERRITORY_FILL_ALPHA;
            this.paintPolityFills(cam, vp, view, fillAlpha);
            if (cam.ppp >= PPP_GRID) this.paintRegions(ready, cam, vp);
            if (hexes.count <= HEX_OUTLINE_CAP) this.hexOutlines(hexes, view, cam, vp);
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
        this.paintRoute(cam, vp);
        if (this.paintCampaign(cam, vp, tier)) animating = true;
        this.tracks = tier === 'hex' ? this.hexTracks(on, cam, vp) : this.farTracks(cam, vp, view);

        return { tier, sectorsOnScreen: on.map((sector) => sector.slug), ms: now() - started, animating };
    }

    /**
     * At the hex zoom: one track per ship at the hex's upper right, side by side: your other ships
     * first (filled; the lead keeps its chevron on the chart), then everyone else's (open). Past
     * TRACK_SHOWN of theirs, a fourth with an inner diamond stands for the rest. The lead is a ghost
     * track over its chevron, there only for its hover block.
     */
    private hexTracks(sectors: DrawSector[], cam: Camera, vp: Viewport): TrafficTrack[] {
        const hexes = new Map<string, { sx: number; sy: number; own: CampaignPartyShip[]; row: PublicGameMark | null }>();
        const ships = this.campaignSnapshot && this.campaignSnapshot.ships ? this.campaignSnapshot.ships : [];
        for (const ship of ships) {
            if (ship.lead) continue;
            const held = hexes.get(ship.hexKey);
            if (held) {
                held.own.push(ship);
                continue;
            }
            const at = this.hexKeyScreen(ship.hexKey, cam, vp);
            if (at) hexes.set(ship.hexKey, { sx: at.sx, sy: at.sy, own: [ship], row: null });
        }
        for (const sector of sectors) {
            const rows = this.publicGames.get(sector.slug);
            if (!rows) continue;
            for (const row of rows) {
                const key = sector.slug + '/' + row.hex;
                const held = hexes.get(key);
                if (held) {
                    held.row = row;
                    continue;
                }
                const local = parseHex(row.hex);
                if (!local) continue;
                const global = toGlobal(sector.x, sector.y, local.col, local.row);
                const centre = hexCentre(global.q, global.r);
                const at = toScreen(cam, vp, centre.x, centre.y);
                hexes.set(key, { sx: at.sx, sy: at.sy, own: [], row });
            }
        }
        const theirs: TrafficTrack[] = [];
        const mine: TrafficTrack[] = [];
        const pad = TRACK_STEP * (TRACK_SHOWN + 2);
        for (const [key, hex] of hexes) {
            const ax = hex.sx + Math.max(SHIP_X * cam.ppp, TRACK_NEAR);
            const ay = hex.sy + Math.min(SHIP_Y * cam.ppp, -TRACK_NEAR);
            if (ax < -pad || ay < -pad || ax > vp.width + pad || ay > vp.height + pad) continue;
            let slot = 0;
            const place = (): { x: number; y: number; box: TrackBox } => {
                const x = ax + slot * TRACK_STEP;
                slot += 1;
                return { x, y: ay, box: trackBox(x, ay) };
            };
            for (const ship of hex.own) {
                const at = place();
                mine.push({ key: 'own|' + ship.id, mine: true, many: false, label: ship.label, x: at.x, y: at.y, box: at.box, hit: null, ownId: ship.id, fly: null, wx: hex.sx, wy: hex.sy });
            }
            const row = hex.row;
            if (!row) continue;
            const listed = row.ships ?? [];
            const total = Math.max(row.count, listed.length);
            const hits: PublicShipHit[] = [];
            const track = (k: string, many: boolean, label: string | null, list: readonly PublicShipMark[], more: number): void => {
                const at = place();
                const hit: PublicShipHit = { key: k, ships: list, more, box: at.box, place: at.box, fleet: listed, cx: at.x, cy: at.y, wx: hex.sx, wy: hex.sy };
                hits.push(hit);
                theirs.push({ key: k, mine: false, many, label, x: at.x, y: at.y, box: at.box, hit, ownId: null, fly: null, wx: hex.sx, wy: hex.sy });
            };
            if (listed.length === 0) {
                // A server before 0017 sends the hex without its ships: one track for them all, with no card.
                track(key + '|all', total > 1, null, [], total);
            } else {
                const shown = listed.slice(0, TRACK_SHOWN);
                for (const ship of shown) track(key + '|' + ship.mark, false, blockWords(ship.ship), [ship], 0);
                const rest = total - shown.length;
                if (rest > 0) {
                    const left = listed.slice(shown.length);
                    const words = left.length > 0 ? blockWords(left[0].ship) + (rest > 1 ? ' +' + String(rest - 1) : '') : '+' + String(rest);
                    track(key + '|more', true, words, left, total - listed.length);
                }
            }
            // The card opens beside, or on a phone above, all of the hex's tracks, never over one of them.
            const all = {
                x0: Math.min(...hits.map((hit) => hit.box.x0)),
                y0: Math.min(...hits.map((hit) => hit.box.y0)),
                x1: Math.max(...hits.map((hit) => hit.box.x1)),
                y1: Math.max(...hits.map((hit) => hit.box.y1)),
            };
            for (const hit of hits) hit.place = all;
        }
        for (const mark of this.partyShips) {
            if (!mark.lead || !mark.id || mark.tier === 'point') continue;
            const ship = ships.find((item) => item.id === mark.id);
            const box = { x0: mark.cx - mark.hitR, y0: mark.cy - mark.hitR, x1: mark.cx + mark.hitR, y1: mark.cy + mark.hitR };
            mine.push({ key: 'own|' + mark.id, mine: true, many: false, ghost: true, label: ship ? ship.label : null, x: mark.cx, y: mark.cy, box, hit: null, ownId: mark.id, fly: null, wx: mark.worldX, wy: mark.worldY });
        }
        this.selectedKey = null;
        const open = this.selectedMark;
        if (open) {
            const one = theirs.find((item) => item.hit !== null && !item.many && item.hit.ships.length === 1 && item.hit.ships[0].mark === open);
            const any = one ?? theirs.find((item) => item.hit !== null && item.hit.ships.some((ship) => ship.mark === open));
            this.selectedKey = any ? any.key : null;
        }
        return [...theirs, ...mine];
    }

    /**
     * Zoomed out past the hex level: one track per system with ships, centred on it so the open
     * diamond frames the world's dot. Someone else's come from the overview, which carries no names;
     * yours from the campaign, the lead included. Tracks closer than TRACK_MERGE_PX become one with an
     * inner diamond. Where yours and theirs share a place, theirs stands one step to the right.
     */
    private farTracks(cam: Camera, vp: Viewport, view: Rect): TrafficTrack[] {
        this.selectedKey = null;
        const margin = 2;
        const seen = (x: number, y: number) => x >= view.x0 - margin && x <= view.x1 + margin && y >= view.y0 - margin && y <= view.y1 + margin;
        const own: { x: number; y: number; world: { x: number; y: number }; ship: CampaignPartyShip }[] = [];
        const ships = this.campaignSnapshot && this.campaignSnapshot.ships ? [...this.campaignSnapshot.ships] : [];
        ships.sort((a, b) => Number(b.lead) - Number(a.lead));
        for (const ship of ships) {
            const world = this.hexKeyWorld(ship.hexKey);
            if (!world || !seen(world.x, world.y)) continue;
            const at = toScreen(cam, vp, world.x, world.y);
            own.push({ x: at.sx, y: at.sy, world, ship });
        }
        const mine: TrafficTrack[] = mergeTracks(own).map((group) => {
            const head = group[0];
            const label = head.ship.label + (group.length > 1 ? ' +' + String(group.length - 1) : '');
            return { key: 'own|' + head.ship.id, mine: true, many: group.length > 1, label, x: head.x, y: head.y, box: trackBox(head.x, head.y), hit: null, ownId: head.ship.id, fly: head.world, wx: head.x, wy: head.y };
        });
        const far: { x: number; y: number; world: { x: number; y: number }; key: string; count: number }[] = [];
        for (const row of this.publicOverview ?? []) {
            const slash = row.key.lastIndexOf('/');
            const sector = this.sectorBySlug.get(row.key.slice(0, slash));
            if (!sector || (this.layer === 'canonical' && !sector.canonical)) continue;
            const world = this.hexKeyWorld(row.key);
            if (!world || !seen(world.x, world.y)) continue;
            const at = toScreen(cam, vp, world.x, world.y);
            far.push({ x: at.sx, y: at.sy, world, key: row.key, count: row.count });
        }
        // The busiest hex stands for a group.
        far.sort((a, b) => b.count - a.count || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const theirs: TrafficTrack[] = mergeTracks(far).map((group) => {
            const head = group[0];
            const count = group.reduce((sum, item) => sum + item.count, 0);
            const shared = mine.some((item) => Math.hypot(item.x - head.x, item.y - head.y) < TRACK_MERGE_PX);
            const x = shared ? head.x + TRACK_STEP : head.x;
            return { key: 'far|' + head.key, mine: false, many: count > 1, label: null, x, y: head.y, box: trackBox(x, head.y), hit: null, ownId: null, fly: head.world, wx: head.x, wy: head.y };
        });
        return [...theirs, ...mine];
    }

    /** The tracks this frame, for the traffic layer. */
    trafficTracks(): readonly TrafficTrack[] {
        return this.tracks;
    }

    /** The track that stands for the open card's ship this frame, or null. */
    selectedTrackKey(): string | null {
        return this.selectedKey;
    }

    /** The ship whose card is open, by its mark: its track gets the bracket. Null for none. */
    setSelectedShip(mark: string | null): void {
        this.selectedMark = mark;
    }

    /** The traffic colour, read by the view through readTrafficInk: the open card's route is drawn in it. */
    setTrafficColour(colour: string): void {
        this.trafficColour = colour;
    }

    /**
     * The track under a point. Null off every track. For a finger (`touch`) each track is at least
     * TOUCH_PX across and the nearest wins, unless the point is nearer the world the track sits
     * beside: that tap is the world's. A mouse keeps the drawn box. Ghosts (the lead's hover block)
     * count only when `ghosts` is set.
     */
    trackAt(sx: number, sy: number, touch = false, ghosts = false): TrafficTrack | null {
        for (let i = this.tracks.length - 1; i >= 0; i -= 1) {
            const track = this.tracks[i];
            if (track.ghost && !ghosts) continue;
            if (outside(track.box, sx, sy) === 0) return track;
        }
        if (!touch) return null;
        let best: TrafficTrack | null = null;
        let bestGap = Infinity;
        for (const track of this.tracks) {
            if (track.ghost && !ghosts) continue;
            if (outside(touchBox(track.box), sx, sy) > 0) continue;
            if (Math.hypot(sx - track.wx, sy - track.wy) < Math.hypot(sx - track.x, sy - track.y)) continue;
            const gap = outside(track.box, sx, sy);
            if (gap < bestGap) {
                best = track;
                bestGap = gap;
            }
        }
        return best;
    }

    /** Someone else's ship under a point, at the hex zoom: what its card says. Null elsewhere. */
    publicShipAt(sx: number, sy: number, touch = false): PublicShipHit | null {
        const track = this.trackAt(sx, sy, touch);
        return track && track.hit && track.hit.ships.length > 0 ? track.hit : null;
    }

    /** The mark a card was opened on, where it is drawn now. Null once it has left the screen. */
    publicShipByKey(key: string): PublicShipHit | null {
        const track = this.tracks.find((item) => item.hit !== null && item.hit.key === key);
        return track ? track.hit : null;
    }

    /**
     * One route at a time, at every zoom. It does not move. The ship whose card is open, in the
     * traffic colour; else the party's selected ship, in the signal colour. The finished track
     * (`legs`) is a dimmed line that runs into the ship's present hex, with no arrowhead. The course
     * ahead (`course`) is the bright line, with rounded joins and an arrowhead at its end, the last
     * planned hex. With no course, a small arrowhead at the present hex points the way the ship came
     * in. Both lines are cased in the chart's dark, as the tracks are.
     */
    private paintRoute(cam: Camera, vp: Viewport): void {
        const route = this.publicRoute ?? this.partyRoute;
        if (!route) return;
        const at = (key: string) => {
            const point = this.hexKeyScreen(key, cam, vp);
            return point ? { x: point.sx, y: point.sy } : null;
        };
        const track = routeChains(route.legs, at);
        const course = routeChains(route.course, at);
        if (track.length === 0 && course.length === 0) return;
        const colour = this.publicRoute ? this.trafficColour || this.theme.chart.publicGame : this.theme.signal;
        const ctx = this.ctx;
        ctx.save();
        ctx.setLineDash([]);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        const head = course.length > 0 ? arrowHead(course, ROUTE_HEAD) : arrowHead(track, ROUTE_HEAD_SMALL);
        const lines = (chains: readonly { x: number; y: number }[][]) => {
            ctx.beginPath();
            for (const chain of chains) {
                ctx.moveTo(chain[0].x, chain[0].y);
                for (let i = 1; i < chain.length; i += 1) ctx.lineTo(chain[i].x, chain[i].y);
            }
        };
        const drawn: { chains: { x: number; y: number }[][]; alpha: number }[] = [
            { chains: track, alpha: ROUTE_TRACK_ALPHA },
            { chains: course, alpha: 1 },
        ];
        for (const item of drawn) {
            if (item.chains.length === 0) continue;
            lines(item.chains);
            ctx.globalAlpha = ROUTE_CASE_ALPHA;
            ctx.strokeStyle = this.theme.bg0;
            ctx.lineWidth = ROUTE_LINE + ROUTE_CASE * 2;
            ctx.stroke();
            ctx.globalAlpha = item.alpha;
            ctx.strokeStyle = colour;
            ctx.lineWidth = ROUTE_LINE;
            ctx.stroke();
        }
        if (head) {
            ctx.beginPath();
            ctx.moveTo(head[0].x, head[0].y);
            ctx.lineTo(head[1].x, head[1].y);
            ctx.lineTo(head[2].x, head[2].y);
            ctx.closePath();
            ctx.globalAlpha = ROUTE_CASE_ALPHA;
            ctx.strokeStyle = this.theme.bg0;
            ctx.lineWidth = ROUTE_CASE * 2;
            ctx.lineJoin = 'miter';
            ctx.stroke();
            ctx.globalAlpha = 1;
            ctx.fillStyle = colour;
            ctx.fill();
        }
        ctx.restore();
    }

    /** A chart hex key ("Spinward_Marches/1910") in world units, or null for a sector the chart does not hold. */
    private hexKeyWorld(key: string): { x: number; y: number } | null {
        const slash = key.lastIndexOf('/');
        if (slash <= 0) return null;
        const local = parseHex(key.slice(slash + 1));
        if (!local) return null;
        const sector = this.sectorBySlug.get(key.slice(0, slash));
        if (!sector) return null;
        const global = toGlobal(sector.x, sector.y, local.col, local.row);
        return hexCentre(global.q, global.r);
    }

    /** A chart hex key on the screen, or null for a sector the chart does not hold. */
    private hexKeyScreen(key: string, cam: Camera, vp: Viewport): { sx: number; sy: number } | null {
        const world = this.hexKeyWorld(key);
        return world ? toScreen(cam, vp, world.x, world.y) : null;
    }

    /** The open card's finished legs and course ahead, drawn until it closes. Null clears them. */
    setPublicRoute(route: { legs: readonly RouteLeg[]; course?: readonly RouteLeg[] } | null): void {
        const legs = route ? [...route.legs] : [];
        const course = route && route.course ? [...route.course] : [];
        this.publicRoute = legs.length > 0 || course.length > 0 ? { legs, course } : null;
    }

    /** The party's selected ship's finished legs and course ahead; an open card's route is drawn instead while it is open. Null clears them. */
    setPartyRoute(route: { legs: readonly RouteLeg[]; course?: readonly RouteLeg[] } | null): void {
        const legs = route ? [...route.legs] : [];
        const course = route && route.course ? [...route.course] : [];
        this.partyRoute = legs.length > 0 || course.length > 0 ? { legs, course } : null;
    }

    /** Zoomed out: the hexes with public ships, from the overview. Null clears them. */
    setPublicOverview(rows: readonly { key: string; count: number }[] | null): void {
        this.publicOverview = rows && rows.length > 0 ? rows : null;
    }

    /**
     * The campaign's marks on the chart. The party's ships are tracks now (traffic.ts): only the lead
     * is drawn here, as the party's chevron, at the hex zoom and without its name, which is its hover
     * block. Zoomed out the lead is a track like the others.
     */
    private paintCampaign(cam: Camera, vp: Viewport, tier: Tier): boolean {
        if (!this.campaignSnapshot) {
            this.partyMark = null;
            this.vesselMarks = [];
            this.partyShips = [];
            return false;
        }
        const snapshot = this.campaignSnapshot;
        const ships = snapshot.ships && snapshot.ships.length > 0
            ? snapshot.ships.filter((ship) => ship.lead && tier === 'hex').map((ship) => ({ ...ship, label: '' }))
            : snapshot.ships;
        const frame = drawCampaignLayer(this.ctx, {
            cam,
            vp,
            sectors: this.sectors,
            snapshot: ships === snapshot.ships ? snapshot : { ...snapshot, ships },
            ink: {
                signal: this.theme.signal,
                tag: this.theme.tag ? this.theme.tag : this.theme.bg0,
                bg: this.theme.bg0,
                font: this.theme.fontText,
                pulseMs: (this.theme.tPulse > 0 ? this.theme.tPulse : 2.4) * 1000,
                then: this.theme.signalEdge || this.theme.signal,
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
        // DF9: at the galaxy zoom a sector's dots are drawn once into a bitmap and copied while the map
        // pans; the zoom must hold still for a frame first, so a zoom in progress draws them as before.
        const steady = cam.ppp === this.lastDotPpp;
        this.lastDotPpp = cam.ppp;
        if (!steady && this.dotTiles.size) this.dotTiles.clear();
        const tiles = steady && cam.ppp < PPP_DOTS && typeof OffscreenCanvas === 'function';
        // In device pixels, each dot on a whole pixel: drawn here or copied from its sector's bitmap, the
        // pixels are the same, and a dot is never smeared across two.
        const sizeDev = size * this.dpr;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        for (const sector of sectors) {
            const cells = this.dotOverlay.get(sector.slug) ?? sector.cells;
            if (!cells) continue;
            const origin = toScreen(cam, vp, sector.rect.x0, sector.rect.y0);
            const ox = Math.round(origin.sx * this.dpr);
            const oy = Math.round(origin.sy * this.dpr);
            const tile = tiles ? this.dotTile(sector, cells, cam.ppp, sizeDev) : null;
            if (tile) ctx.drawImage(tile.tile, ox - tile.pad, oy - tile.pad);
            else this.sectorDots(ctx, sector, cells, cam.ppp, sizeDev, ox, oy);
        }
        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    }

    /** One sector's dots, a square each, in device pixels, from the sector's top-left corner at whole pixel (ox, oy). */
    private sectorDots(target: { fillRect(x: number, y: number, w: number, h: number): void }, sector: DrawSector, cells: string, ppp: number, sizeDev: number, ox: number, oy: number): void {
        const scale = ppp * this.dpr;
        for (let i = 0; i < cells.length; i++) {
            if (cells.charAt(i) === '.') continue;
            const col = Math.floor(i / SECTOR_ROWS) + 1;
            const row = (i % SECTOR_ROWS) + 1;
            const global = toGlobal(sector.x, sector.y, col, row);
            const centre = hexCentre(global.q, global.r);
            const x = ox + Math.round((centre.x - sector.rect.x0) * scale - sizeDev / 2);
            const y = oy + Math.round((centre.y - sector.rect.y0) * scale - sizeDev / 2);
            target.fillRect(x, y, sizeDev, sizeDev);
        }
    }

    /** A sector's dots as a bitmap at this zoom (DF9), kept until the zoom, the pixel ratio, the ink or the cells change. */
    private dotTile(sector: DrawSector, cells: string, ppp: number, sizeDev: number): DotTile | null {
        const ink = this.theme.textMuted;
        const have = this.dotTiles.get(sector.slug);
        if (have && have.ppp === ppp && have.dpr === this.dpr && have.cells === cells && have.ink === ink) return have;
        const pad = Math.ceil(sizeDev) + 1;
        const w = Math.ceil((sector.rect.x1 - sector.rect.x0) * ppp * this.dpr) + 2 * pad;
        const h = Math.ceil((sector.rect.y1 - sector.rect.y0) * ppp * this.dpr) + 2 * pad;
        const tile = new OffscreenCanvas(Math.max(1, w), Math.max(1, h));
        const tctx = tile.getContext('2d');
        if (!tctx) return null;
        tctx.fillStyle = ink;
        this.sectorDots(tctx, sector, cells, ppp, sizeDev, pad, pad);
        const kept: DotTile = { ppp, dpr: this.dpr, cells, ink, tile, pad };
        this.dotTiles.set(sector.slug, kept);
        return kept;
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
            ctx.globalAlpha = alpha * this.fillScale();
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
            ctx.globalAlpha = REGION_FILL_ALPHA * this.fillScale();
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

    /** prefers-reduced-motion, read again at most once a second (it was a media query on every frame). */
    private reducedMotion(time: number): boolean {
        if (time - this.reducedAt >= REDUCED_MOTION_TTL_MS) {
            this.reduced = prefersReducedMotion();
            this.reducedAt = time;
        }
        return this.reduced;
    }

    /**
     * The grid. Its outlines are fixed in world space, so each sector-sized block is built once as a
     * Path2D and stroked under the camera's transform, with the line kept 1 px wide. Building some
     * twelve thousand hexes' corners every frame was the sector zoom's longest task. Where there is no
     * Path2D (tests), the hexes are drawn one by one as before.
     */
    private hexOutlines(hexes: HexBounds, view: Rect, cam: Camera, vp: Viewport): void {
        if (hexes.count === 0) return;
        if (typeof Path2D === 'undefined') {
            this.hexOutlinesEach(visibleHexes(view), cam, vp);
            return;
        }
        const minQ = hexes.q0, maxQ = hexes.q1, minR = hexes.r0, maxR = hexes.r1;
        const ctx = this.ctx;
        const scale = this.dpr * cam.ppp;
        ctx.save();
        ctx.setTransform(scale, 0, 0, scale, this.dpr * (vp.width / 2 - cam.x * cam.ppp), this.dpr * (vp.height / 2 - cam.y * cam.ppp));
        ctx.strokeStyle = this.theme.chart.grid;
        ctx.lineWidth = 1 / cam.ppp;
        for (let tq = Math.floor(minQ / OUTLINE_TILE_COLS); tq <= Math.floor(maxQ / OUTLINE_TILE_COLS); tq += 1) {
            for (let tr = Math.floor(minR / OUTLINE_TILE_ROWS); tr <= Math.floor(maxR / OUTLINE_TILE_ROWS); tr += 1) {
                ctx.stroke(this.outlineTile(tq, tr));
            }
        }
        ctx.restore();
    }

    /** One block of the grid in world space, kept until OUTLINE_TILES_KEPT newer blocks push it out. */
    private outlineTile(tq: number, tr: number): Path2D {
        const key = tq + ',' + tr;
        const held = this.outlineTiles.get(key);
        if (held) {
            this.outlineTiles.delete(key);
            this.outlineTiles.set(key, held);
            return held;
        }
        const path = new Path2D();
        for (let q = tq * OUTLINE_TILE_COLS; q < (tq + 1) * OUTLINE_TILE_COLS; q += 1) {
            for (let r = tr * OUTLINE_TILE_ROWS; r < (tr + 1) * OUTLINE_TILE_ROWS; r += 1) {
                const centre = hexCentre(q, r);
                const corners = hexCorners(centre.x, centre.y);
                path.moveTo(corners[0], corners[1]);
                for (let i = 2; i < corners.length; i += 2) path.lineTo(corners[i], corners[i + 1]);
                path.closePath();
            }
        }
        this.outlineTiles.set(key, path);
        if (this.outlineTiles.size > OUTLINE_TILES_KEPT) {
            const oldest = this.outlineTiles.keys().next().value;
            if (oldest !== undefined) this.outlineTiles.delete(oldest);
        }
        return path;
    }

    private hexOutlinesEach(hexes: { q: number; r: number }[], cam: Camera, vp: Viewport): void {
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
        const instant = !(duration > 0) || this.reducedMotion(time);
        const amount = instant ? 1 : elapsed / duration;
        const step = zoomStep(cam.ppp);
        const bounds: Box = {
            x: this.workspaceLeft,
            y: this.titleTop,
            w: vp.width - this.workspaceLeft,
            h: vp.height - this.titleTop,
        };
        const guard = this.selectedGuard(cam, vp, cam.ppp / 1.5);
        const spanX = SECTOR_COLS / 4;
        const spanY = (SECTOR_ROWS / 4) * ROW_STEP;
        const live = new Set<string>();
        let moving = false;
        let drew = false;
        const selectedKey = this.selectedSubsector();
        const titles: { key: string; state: TitleState; pill: TitlePill; spot: { x: number; y: number }; home: Box; inView: boolean; first: boolean; seen: number }[] = [];
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
                    const seenW = Math.min(home.x + home.w, bounds.x + bounds.w) - Math.max(home.x, bounds.x);
                    const seenH = Math.min(home.y + home.h, bounds.y + bounds.h) - Math.max(home.y, bounds.y);
                    titles.push({
                        key, state, pill, spot, home,
                        inView: titleInView(spot, pill.w, pill.h, bounds),
                        first: key === selectedKey,
                        seen: Math.max(0, seenW) * Math.max(0, seenH),
                    });
                }
            }
        }
        // Kept apart (DS5): the selected hex's subsector first, then a title already showing (so two
        // titles don't trade places while panning), then the subsector with more of it on screen.
        titles.sort((a, b) => Number(b.first) - Number(a.first)
            || Number(b.state.alpha > 0) - Number(a.state.alpha > 0)
            || b.seen - a.seen
            || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0));
        const inView = titles.filter((title) => title.inView);
        const apart = separateTitles(inView.map((title) => ({ ...title.spot, w: title.pill.w, h: title.pill.h, home: title.home })), bounds);
        const placed = new Map(inView.map((title, i) => [title, apart[i]]));
        for (const title of titles) {
            const { state, pill } = title;
            const kept = placed.get(title) ?? null;
            const spot = kept ?? title.spot;
            const covers = guard !== null && boxesOverlap({ x: spot.x, y: spot.y, w: pill.w, h: pill.h }, guard);
            const target = kept !== null && !covers ? 1 : 0;
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

    /** The selected hex's subsector as "slug:letter" (A to P, four across, ten rows and eight columns each). */
    private selectedSubsector(): string | null {
        const selected = this.selected;
        if (!selected) return null;
        const local = parseHex(selected.hhhh);
        if (!local) return null;
        const letter = String.fromCharCode(65 + Math.floor((local.row - 1) / (SECTOR_ROWS / 4)) * 4 + Math.floor((local.col - 1) / (SECTOR_COLS / 4)));
        return selected.slug + ':' + letter;
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
