/**
 * Paints one picture (orbit/picture.ts) on a 2D canvas. For the orbits layout the order is
 * the legacy one (js/system_viewer.js _paintOrrery, 2906-3016): star field, the primary's
 * habitable band, the 100D jump circles, each companion (its orbit, its band, its worlds),
 * the primary's worlds, the stars on top, the scan overlay, the
 * selection lock. A line-up (_drawLineup, 2607-2668) and the move between two layouts are
 * the same passes over a different picture. Where a body sits is the layout's business; this
 * file only draws what the picture says. Every colour comes from the theme.
 *
 * Worlds are flat discs with a night half (the legacy fallback, 4226-4231) until planet
 * imagery lands.
 */
import { shortLabel } from './bodies.ts';
import { backdropBox, backdropShift, paintBackdrop, type BackdropBox } from './backdrop.ts';
import {
    chaseAngle, highportArt, highportPlace, highportSize, spriteWidth, HIGHPORT_MIN_WORLD_PX,
    type Chase, type HighportArt, type Port,
} from './highport.ts';
import {
    arcSpan, bodyOf, hitOf, layoutScene, mainworldMark, placeWorld, selectionLabel, shadowCover, MAX_RING_RADIUS,
    type Hit, type MoonAt, type Plan, type Scene, type View, type WorldSet,
} from './layout.ts';
import { bodyAngle } from './maths.ts';
import {
    PATH_ALPHA_WORLD, type BandAt, type Caption, type JumpAt, type Layers, type Panel, type PathAt,
    type Picture, type Rocks, type StarDraw, type WorldDraw,
} from './picture.ts';
import { discBatch, sunColour, visualRate, type OrbitDiscBatch } from './disc_batch.ts';
import { pictureOfAu, pointWords } from './distance.ts';
import { dockedBeside, pictureBodies, plotText, readoutPlace, type DrawnWaypoint, type PlotReadout, type ShipMark, type ShipShape } from './ships.ts';
import { whenWords } from './ship_list.ts';
import { cssSeconds, easeOutAt, withAlpha, type EaseOut, type OrbitTheme, type PortPaint } from './theme.ts';

/** The layer switches that ease. Linear scale and ring strength stay where the slider put them. */
type ToggleKey = 'habitable' | 'jump' | 'paths' | 'moons' | 'dayNight' | 'scan' | 'markMainworld';
type LayerRun = { from: number; to: number; t0: number; seconds: number };
type JumpPhase = 'mark' | 'out' | 'in';
type BubbleRun = { from: number; to: number; t0: number; seconds: number; kind: 'out' | 'in'; mark: ShipMark };
type BubblePaint = { id: string; kind: 'out' | 'in'; share: number; mark: ShipMark };
type GhostRun = { from: number; to: number; t0: number; seconds: number; kind: 'in' | 'move' | 'out' };
type GhostSpot = { x: number; y: number };
type GhostBody = {
    key: string;
    kind: 'world' | 'moon';
    name: string;
    x: number;
    y: number;
    r: number;
    cx: number;
    cy: number;
    epoch: number;
    period: number;
};
type WaySlot = {
    span: number;
    share: number;
    run: GhostRun | null;
    spec: GhostSpec | null;
    drawn: GhostSpot | null;
};
type GhostSpec = {
    key: string;
    dest: boolean;
    label: string;
    now: GhostSpot;
    then: GhostSpot;
    r: number;
    cx: number;
    cy: number;
    /** Signed sweep along the orbit, radians. An arc is drawn only while this stays within half a turn. */
    sweep: number;
};
type HeldLayer = { bands: BandAt[]; jumps: JumpAt[]; paths: PathAt[]; panels: Panel[] };
const TOGGLE_KEYS: readonly ToggleKey[] = ['habitable', 'jump', 'paths', 'moons', 'dayNight', 'scan', 'markMainworld'];

const TAU = Math.PI * 2;
/** About three seconds of frames: how long a still picture keeps painting after its last missing tile. */
const SETTLE_FRAMES = 180;
/**
 * Lat/long quads. Five parallels on a disc under 20px across sit closer than two pixels
 * and smear, so below this radius the sweep is one solid band. 20px is where the quads
 * stay crisp.
 */
const WIRE_GRID_MIN_PX = 10;
/** Under this radius a band is a speck, so a moon that small carries no wireframe. */
const WIRE_SWEEP_MIN_PX = 4;
/** Pole lean, in radians, so the parallels read as ellipses rather than a flat stack. */
const WIRE_TILT = 0.55;
/**
 * The largest step of the teal sweep between two frames. The sweep is a sine, whose
 * steepest slope is π. A body's own sweep lasts --t-slow, and a frame at 60fps is a
 * 27th of that, so one frame moves the alpha by at most π/27 of full strength. A
 * larger step would read as a pop.
 */
export const TEAL_STEP = Math.PI / 27;

/** The teal sweep's strength. Zero at the start and the end, so a frame on either side shows none. */
export function tealSweepAlpha(local: number): number {
    if (!(local > 0) || local >= 1) return 0;
    return Math.sin(Math.PI * local);
}

/**
 * Where a body is in its own sweep. `share` is the gesture, 0 hidden and 1 revealed.
 * The front takes the `--t-long` portion and reaches this body at `distance` (0 at the
 * star, 1 at the farthest body). The sweep then takes the `--t-slow` portion.
 */
export function waveLocal(share: number, distance: number, travel: number, sweep: number): number {
    const total = travel + sweep;
    if (!(total > 0)) return share > 0 ? 1 : 0;
    const start = distance * (travel / total);
    const span = sweep / total;
    if (!(span > 0)) return share >= 1 ? 1 : 0;
    const local = (share - start) / span;
    if (local <= 0) return 0;
    if (local >= 1) return 1;
    return local;
}

function smoothstep(t: number): number {
    const u = Math.min(1, Math.max(0, t));
    return u * u * (3 - 2 * u);
}

/**
 * The surface service as the painter uses it (directives/handoff.md §61): one batch a frame,
 * then a tile per body. The stage adapts the service's two calls to this; tests pass a fake.
 */
export type DiscPainter = {
    /** The device's surface mode, sent with the batch. */
    mode(): 'vanilla' | 'enhanced';
    /** Submits this frame's batch. It never blocks. Only 'ready' means tiles may be drawn. */
    prepare(batch: OrbitDiscBatch): 'unavailable' | 'pending' | 'ready';
    /**
     * Draws the tile held for a body, centred on (x, y) with radius r in the context's own
     * units. False when there is none: the painter then draws its flat disc.
     */
    draw(ctx: CanvasRenderingContext2D, key: string, x: number, y: number, r: number): boolean;
};

export type RendererDeps = {
    /** An off-screen canvas of the given pixel size, or null where there is none (tests). */
    makeCanvas: ((w: number, h: number) => HTMLCanvasElement) | null;
    /** Starts loading an image and calls done when it can be drawn. */
    loadImage: ((src: string, done: () => void) => CanvasImageSource) | null;
    /** Where the highport paintings are served from, with a trailing slash. */
    artBase: string;
    /** Called when something loaded after a paint: the picture should be painted again. */
    stale: () => void;
    /** Shaded discs. Absent, or answering anything but 'ready', the discs are the flat ones. */
    discs?: DiscPainter | null;
};

export type DrawState = {
    /** The key of the selected body, or null. */
    selected: string | null;
    days: number;
    /** Wall time in milliseconds. */
    time: number;
    /** False under reduced motion: no lock animation, no pulse, lights steady. */
    motion: boolean;
    layers: Layers;
    /** Ship designators. Omitted, the frame is the one without them. */
    ships?: readonly ShipMark[];
    /** Plotting hairlines for this frame only. Omitted or null, the overlay is off. */
    plot?: PlotReadout | null;
    /**
     * One leg, or an ordered course of legs, or null. A body ghost stands at that leg's
     * arrival. The flight line runs from the ship through each waypoint. Omitted, the picture is today's.
     */
    preview?: FlightPreview | null;
    /**
     * The selected ship's stored legs from this frame's date on: the leg under way, then
     * those to come. Drawn as the committed course. Omitted, the picture is unchanged.
     * A preview, when also set, is drawn over it from the waypoint where they part.
     */
    route?: FlightPreview | null;
    /**
     * When set, a ship drawn beside a body is not given a designator, so a tag can stand
     * for it. Omitted, the designator is drawn.
     */
    dockTag?: boolean;
    /**
     * D's tags name every ship. Every designator is drawn, including one beside a body,
     * and no ship name is. Omitted, names are drawn and `dockTag` still hides a docked designator.
     */
    shipTags?: boolean;
};

/**
 * One leg of a course. A body (`toKey`) is ghosted at this leg's arrival.
 * A point is a target, not a ghost: a point does not move. `tag` is the label when the view has one.
 */
export type CourseLeg = {
    toKey?: string;
    /** AU from the primary, in the frame realPositionAu answers in. */
    point?: { x: number; y: number };
    departs: number;
    arrives: number;
    tag?: string;
};

/**
 * One leg, or an ordered list of legs. The one-leg object is the form already in use.
 */
export type FlightPreview = CourseLeg | readonly CourseLeg[];

type Sprite = { lit: HTMLCanvasElement; dark: HTMLCanvasElement };
type ArtImage = { image: CanvasImageSource; ready: boolean };

export class OrbitRenderer {
    private ctx: CanvasRenderingContext2D;
    private theme: OrbitTheme;
    private deps: RendererDeps;
    private w = 0;
    private h = 0;
    private dpr = 1;
    private z = 1;
    private backdrop: { canvas: HTMLCanvasElement; box: BackdropBox; key: string } | null = null;
    private lockKey: string | null = null;
    private lockStart = 0;
    private lockLabel: [string, string] = ['', ''];
    private eclipse = new Map<string, { value: number; at: number }>();
    private chases = new Map<string, Chase>();
    private images = new Map<string, ArtImage>();
    private sprites = new Map<string, Sprite>();
    private lastTime = 0;
    private frameSeconds = 1 / 60;
    private layers: Layers | null = null;
    private pathWidth = 1;
    private scanLabels = new Map<string, string>();
    private scanPlan: Plan | null = null;
    /** The bodies of this frame's batch when the service is ready: key, and whether rings were asked for. */
    private shaded: Map<string, boolean> | null = null;
    private discStatus: 'unavailable' | 'pending' | 'ready' = 'unavailable';
    private lastDays: number | null = null;
    private rate = 0;
    /** A body of this frame's batch had no tile yet. */
    private missing = false;
    /** Frames still to paint after the last missing tile, so sharper tiles can arrive on a still picture. */
    private settling = 0;
    /**
     * True when the discs want another frame: the service is still starting, a tile has not
     * arrived, sharper tiles may follow, or (with motion) the shaded worlds are turning and
     * their clouds drifting. The stage keeps painting while this holds.
     */
    discsBusy = false;
    /** For measuring: the service's last answer and how many tiles the last frame drew, as "ready:19". */
    discsReport = 'none';
    private tilesDrawn = 0;
    /**
     * True while a layer toggle or a jump bubble is between its two settled frames. The canvas
     * keeps painting for that long; a settled frame leaves it false.
     */
    layersBusy = false;
    /** The switches of the previous frame. Null until the first paint, which never eases. */
    private seenLayers: Layers | null = null;
    private layerRuns = new Map<ToggleKey, LayerRun>();
    /** Jump phase of each ship last frame. Null until the first paint, which never eases. */
    private seenShips: Map<string, JumpPhase> | null = null;
    private seenShipDays: number | null = null;
    private bubbleRuns = new Map<string, BubbleRun>();
    /** Bubbles to paint this frame. Empty on a settled frame. */
    private bubbleFrame: BubblePaint[] = [];
    /** 0.5 while a preview is up, so the selection lock is not a second amber ring. */
    private lockDim = 1;
    /** False until the first paint, which draws ghosts settled and does not ease. */
    private ghostReady = false;
    private ghostKey = '';
    private ghostSpan = 0;
    private ghostRun: GhostRun | null = null;
    /** 0 hides, 1 is settled. An arrive opens along the arc; a move slides; a leave fades. */
    private ghostShare = 1;
    private ghostKind: 'in' | 'move' | 'out' | 'show' = 'show';
    /** Where each ghost was drawn last frame, so a new slide starts from there. */
    private ghostLatch = new Map<string, GhostSpot>();
    private ghostLast: GhostSpec[] = [];
    /** Per-waypoint fade for a course of two or more legs. Empty while the preview is one leg. */
    private ways = new Map<string, WaySlot>();
    /** Waypoints drawn this frame, so a drag starts where the picture put them. */
    private routeDrawn: DrawnWaypoint[] = [];
    private previewDrawn: DrawnWaypoint[] = [];
    /** The first preview waypoint that is not also the stored route's. 0 draws the preview from the ship. */
    private previewPart = 0;
    /**
     * From this route index on, a preview has taken over, so the stored course is what was.
     * Null when this frame has no preview.
     */
    private dimFrom: number | null = null;
    /** --t-fast from the canvas, read once. Null when the token is missing: the slide snaps. */
    private fastSecondsCache: number | null | undefined = undefined;
    private habLive = false;
    private habShare = 1;
    private jumpLive = false;
    private jumpShare = 1;
    private pathsLive = false;
    private pathsShare = 1;
    private moonsLive = false;
    private moonsShare = 1;
    private dayLive = false;
    private dayShare = 1;
    /**
     * This day/night run began before the disc service was ready. The sweep then reveals
     * the flat night, and a tile that arrives halfway cannot pop in under it.
     */
    private dayHold = false;
    /** The day/night run started this frame, so dayHold is set once the discs have been asked. */
    private dayArm = false;
    /** Farthest body of each star this frame, keyed by the star's place. */
    private starFar = new Map<string, { x: number; y: number; far: number }>();
    private worldByKey = new Map<string, WorldDraw>();
    /** Tiles present on the first paint are settled. A tile that arrives later fades. */
    private tilePrimed = false;
    private tileSeen = new Set<string>();
    private tileRuns = new Map<string, number>();
    /** Keys the day/night sweep itself is fading, so the settled frame does not fade them again. */
    private tileSweep = new Set<string>();
    private frameTime = 0;
    private scanLive = false;
    private scanShare = 1;
    private mainLive = false;
    private mainShare = 1;
    /** Multiplies the scan overlay. 1 on a settled frame, so those alphas stay as written. */
    private scanFade = 1;
    private heldMode: Picture['mode'] | null = null;
    private heldLayers: HeldLayer[] = [];
    /** The last picture whose moons were placed. Its moon objects are not reused. */
    private heldMoonPicture: Picture | null = null;
    private heldMainKeys = new Set<string>();

    constructor(ctx: CanvasRenderingContext2D, theme: OrbitTheme, deps: RendererDeps) {
        this.ctx = ctx;
        this.theme = theme;
        this.deps = deps;
    }

    resize(w: number, h: number, dpr: number): void {
        this.w = w;
        this.h = h;
        this.dpr = dpr;
    }

    draw(plan: Plan, picture: Picture, view: View, state: DrawState): void {
        const ctx = this.ctx;
        this.z = picture.z;
        this.layers = state.layers;
        // 3227: the stroke width follows the ring strength.
        this.pathWidth = 1 + state.layers.pathStrength * 1.5;
        // js/system_viewer.js:2024-2026: a smoothed frame time, for the station's pace.
        if (this.lastTime) {
            const dt = Math.max(0.001, (state.time - this.lastTime) / 1000);
            this.frameSeconds += (Math.min(0.1, dt) - this.frameSeconds) * 0.25;
        }
        this.lastTime = state.time;
        this.frameTime = state.time;
        this.beginChannels(state);
        this.beginGhosts(state);
        this.indexStars(picture, state);
        this.prepareDiscs(plan, picture, state);
        this.syncTiles(state);

        ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
        ctx.clearRect(0, 0, this.w, this.h);
        this.starField(plan, view);
        for (const [index, layer] of picture.layers.entries()) {
            if (!this.habLive) {
                for (const band of layer.bands) this.band(band);
                for (const panel of layer.panels) this.panel(panel);
            } else {
                const held = this.heldLayers[index];
                const bands = layer.bands.length > 0 ? layer.bands : (held ? held.bands : []);
                for (const band of bands) this.grow(band.cx, band.cy, this.habShare, () => this.band(band));
                const panels = layer.panels.length > 0 ? layer.panels : (held ? held.panels : []);
                for (const panel of panels) this.growPanel(panel);
            }
            if (!this.jumpLive) {
                for (const ring of layer.jumps) this.jump(ring);
            } else {
                const held = this.heldLayers[index];
                const rings = layer.jumps.length > 0 ? layer.jumps : (held ? held.jumps : []);
                for (const ring of rings) this.grow(ring.cx, ring.cy, this.jumpShare, () => this.jump(ring));
            }
            if (!this.pathsLive) {
                for (const path of layer.paths) this.path(path);
            } else {
                this.pathsOf(layer.paths, index);
            }
            for (const rocks of layer.rocks) this.rocks(rocks);
            for (const at of layer.worlds) this.world(plan, at, state);
        }
        this.waveFronts();
        for (const at of picture.stars) this.star(at);
        if (!this.mainLive) {
            for (const caption of picture.captions) this.caption(caption);
        } else {
            for (const caption of picture.captions) this.captionOf(caption);
        }
        if (this.moonsLive || this.dayLive) this.wireframes(picture, state);
        if (!this.scanLive) {
            if (state.layers.scan) this.scan(plan, picture, state);
        } else if (this.scanShare > 0) {
            this.scanFade = this.scanShare >= 1 ? 1 : this.scanShare;
            this.scan(plan, picture, state);
            this.scanFade = 1;
        }
        this.selection(plan, picture, state);
        this.routeDrawn = [];
        this.previewDrawn = [];
        this.previewPart = this.partIndex(state);
        this.dimFrom = null;
        const routeAt = this.paintRoute(plan, picture, view, state);
        const ghostAt = this.paintGhosts(plan, picture, view, state);
        this.beginBubbles(state);
        this.shipTags = state.shipTags === true;
        this.ships(state.ships, picture.hits, state.dockTag === true);
        this.plot(state.plot, plan, picture, view, state.days, ghostAt, state.ships, routeAt);
        this.settleDiscs(state);
        this.keepHeld(picture, state.layers);
    }

    /**
     * Starts a toggle's run on the frame the switch changes, and drops it before the frame
     * where it has finished, so that frame is the settled one. The first paint only records
     * the switches. Reduced motion, or a theme without --ease-out, snaps. A channel whose
     * own duration token is missing snaps on its own. Bands, rings and paths use --t-slow.
     * Moons and day/night run for --t-long plus --t-slow, linearly, so the last body's
     * sweep really lasts --t-slow. Scan and the mainworld mark use --t-base. The other
     * channels use --ease-out.
     */
    private beginChannels(state: DrawState): void {
        this.habLive = false;
        this.habShare = 1;
        this.jumpLive = false;
        this.jumpShare = 1;
        this.pathsLive = false;
        this.pathsShare = 1;
        this.moonsLive = false;
        this.moonsShare = 1;
        this.dayLive = false;
        this.dayShare = 1;
        this.scanLive = false;
        this.scanShare = 1;
        this.mainLive = false;
        this.mainShare = 1;
        this.scanFade = 1;
        this.layersBusy = false;
        const layers = state.layers;
        const ease = this.theme.easeOut;
        if (!state.motion || !ease) {
            this.layerRuns.clear();
            this.dayHold = false;
            this.seenLayers = { ...layers };
            return;
        }
        if (!this.seenLayers) {
            this.seenLayers = { ...layers };
            return;
        }
        for (const key of TOGGLE_KEYS) {
            if (layers[key] === this.seenLayers[key]) continue;
            const seconds = this.channelSeconds(key);
            if (seconds === null) continue;
            const prev = this.layerRuns.get(key);
            const linear = key === 'moons' || key === 'dayNight';
            const from = prev
                ? (linear ? this.linearShare(prev, state.time) : this.runShare(prev, state.time, ease))
                : (layers[key] ? 0 : 1);
            this.layerRuns.set(key, { from, to: layers[key] ? 1 : 0, t0: state.time, seconds });
            if (key === 'dayNight' && !prev) this.dayArm = true;
        }
        this.seenLayers = { ...layers };
        let dayRunning = false;
        for (const [key, run] of this.layerRuns) {
            const u = (state.time - run.t0) / 1000 / run.seconds;
            if (u >= 1) {
                this.layerRuns.delete(key);
                continue;
            }
            // Moons and day/night cross linearly. --ease-out would crush the first body's
            // sweep into a few frames, and the teal would pop. A hide runs the same line backwards.
            const paced = key === 'moons' || key === 'dayNight';
            const share = paced
                ? run.from + (run.to - run.from) * Math.min(1, Math.max(0, u))
                : this.shareAt(run, Math.max(0, u), ease);
            this.layersBusy = true;
            if (key === 'habitable') { this.habLive = true; this.habShare = share; }
            else if (key === 'jump') { this.jumpLive = true; this.jumpShare = share; }
            else if (key === 'paths') { this.pathsLive = true; this.pathsShare = share; }
            else if (key === 'moons') { this.moonsLive = true; this.moonsShare = share; }
            else if (key === 'dayNight') { this.dayLive = true; this.dayShare = share; dayRunning = true; }
            else if (key === 'scan') { this.scanLive = true; this.scanShare = share; }
            else { this.mainLive = true; this.mainShare = share; }
        }
        if (!dayRunning) this.dayHold = false;
    }

    /** Seconds for one channel, from its token. Null when that token is missing: the channel snaps. */
    private channelSeconds(key: ToggleKey): number | null {
        const theme = this.theme;
        if (key === 'moons' || key === 'dayNight') {
            const travel = theme.tLong;
            const sweep = theme.tSlow;
            if (typeof travel === 'number' && travel > 0 && typeof sweep === 'number' && sweep > 0) return travel + sweep;
            return null;
        }
        const raw = (key === 'scan' || key === 'markMainworld') ? theme.tBase : theme.tSlow;
        return typeof raw === 'number' && raw > 0 ? raw : null;
    }

    /**
     * A reveal runs through --ease-out. A hide is that reveal played backwards: its share at
     * `u` is the reveal's share at `1 - u`. A reverse that starts mid-run uses the share it
     * already reached as `from`, so it carries on from there.
     */
    private shareAt(run: LayerRun, u: number, ease: EaseOut): number {
        const f = run.to >= run.from ? easeOutAt(ease, u) : 1 - easeOutAt(ease, 1 - u);
        return run.from + (run.to - run.from) * f;
    }

    private runShare(run: LayerRun, now: number, ease: EaseOut): number {
        const u = (now - run.t0) / 1000 / run.seconds;
        if (u >= 1) return run.to;
        return this.shareAt(run, Math.max(0, u), ease);
    }

    /** The share a linear channel (moons, day/night) has reached. A reverse continues from it. */
    private linearShare(run: LayerRun, now: number): number {
        const u = (now - run.t0) / 1000 / run.seconds;
        if (u >= 1) return run.to;
        const t = Math.min(1, Math.max(0, u));
        return run.from + (run.to - run.from) * t;
    }

    /** Scale about a centre while a ring is between its endpoints. At rest, draw it as written. */
    private grow(cx: number, cy: number, share: number, draw: () => void): void {
        if (!(share > 0)) return;
        if (share >= 1) {
            draw();
            return;
        }
        const ctx = this.ctx;
        ctx.save();
        ctx.translate(cx, cy);
        ctx.scale(share, share);
        ctx.translate(-cx, -cy);
        draw();
        ctx.restore();
    }

    /** A line-up habitable panel grows from its own centre and fades. It has no star to leave. */
    private growPanel(panel: Panel): void {
        const share = this.habShare;
        if (!(share > 0)) return;
        if (share >= 1) {
            this.panel(panel);
            return;
        }
        this.grow(panel.x + panel.w / 2, panel.y + panel.h / 2, share, () => {
            this.panel({ ...panel, alpha: panel.alpha * share });
        });
    }

    /** Belts stay put. World and companion orbits grow from their primary and fade. */
    private pathsOf(paths: readonly PathAt[], index: number): void {
        for (const path of paths) if (path.style === 'belt') this.path(path);
        const source = paths.some((path) => path.style !== 'belt')
            ? paths
            : (this.heldLayers[index] ? this.heldLayers[index].paths : []);
        const share = this.pathsShare;
        for (const path of source) {
            if (path.style === 'belt') continue;
            if (!(share > 0)) continue;
            if (share >= 1) this.path(path);
            else this.grow(path.cx, path.cy, share, () => this.path({ ...path, alpha: path.alpha * share }));
        }
    }

    private captionOf(caption: Caption): void {
        const fadingOff = this.mainShare >= 1 && this.layers !== null && !this.layers.markMainworld && this.heldMainKeys.has(caption.key);
        if (this.mainShare >= 1) {
            this.caption(fadingOff ? { ...caption, main: true } : caption);
            return;
        }
        if (this.mainShare > 0 && (caption.main || this.heldMainKeys.has(caption.key))) {
            this.caption({ ...caption, main: true, alpha: caption.alpha * this.mainShare });
            return;
        }
        this.caption(caption);
    }

    /**
     * A band of latitude and longitude lines in --signal. One front leaves the star; a body's
     * own sweep starts when the front reaches it and runs away from the star. Quads under
     * WIRE_GRID_MIN_PX smear, so those discs get the same sweep as one soft band.
     * Moons and day/night share this wave. Equal shares draw it once.
     */
    private wireframes(picture: Picture, state: DrawState): void {
        const moonsOn = this.moonsLive && this.moonsShare > 0;
        const dayOn = this.dayLive && this.dayShare > 0;
        if (!moonsOn && !dayOn) return;
        const same = moonsOn && dayOn && this.moonsShare === this.dayShare;
        const moonsDrawn = moonsOn || (dayOn && state.layers.moons);
        for (const layer of picture.layers) {
            for (const at of layer.worlds) {
                const reach = this.reachOf(at.x, at.y, at.starX, at.starY);
                const hasMoon = at.world.moons.some((moon) => !moon.ring);
                if (dayOn) this.globeWave(at.x, at.y, at.r, this.bodyLocal(this.dayShare, reach), at.starX, at.starY);
                if (moonsOn && hasMoon && !same) {
                    this.globeWave(at.x, at.y, at.r, this.bodyLocal(this.moonsShare, reach), at.starX, at.starY);
                }
                if (!moonsDrawn) continue;
                for (const moon of this.moonsOf(at, state)) {
                    if (moon.moon.ring || moon.r < WIRE_SWEEP_MIN_PX) continue;
                    const moonReach = this.reachOf(moon.x, moon.y, at.starX, at.starY);
                    if (dayOn) this.globeWave(moon.x, moon.y, moon.r, this.bodyLocal(this.dayShare, moonReach), at.starX, at.starY);
                    if (moonsOn && !same) {
                        this.globeWave(moon.x, moon.y, moon.r, this.bodyLocal(this.moonsShare, moonReach), at.starX, at.starY);
                    }
                }
            }
        }
    }

    /** One disc's wireframe, clipped to the disc. The wave enters at the limb facing the star. */
    private globeWave(x: number, y: number, r: number, local: number, starX: number, starY: number): void {
        const env = tealSweepAlpha(local);
        if (!(env > 0) || r < WIRE_SWEEP_MIN_PX) return;
        const away = Math.atan2(y - starY, x - starX);
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.clip();
        ctx.translate(x, y);
        if (r < WIRE_GRID_MIN_PX) {
            this.softBand(r, local, away);
            ctx.restore();
            return;
        }
        const rot = -0.5;
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const ax = Math.cos(away);
        const ay = Math.sin(away);
        const bins = 16;
        const buckets: number[][] = [];
        for (let i = 0; i < bins; i++) buckets.push([]);
        const add = (x0: number, y0: number, x1: number, y1: number) => {
            const mx = (x0 + x1) / 2;
            const my = (y0 + y1) / 2;
            const sx = mx * cos - my * sin;
            const sy = mx * sin + my * cos;
            const along = sx * ax + sy * ay;
            const alpha = this.waveAlpha(along, r, local);
            if (alpha < 0.02) return;
            const bin = Math.min(bins - 1, Math.floor(alpha * bins));
            buckets[bin]?.push(x0, y0, x1, y1);
        };
        const ellipse = (cx: number, cy: number, rx: number, ry: number) => {
            const steps = 24;
            for (let i = 0; i < steps; i++) {
                const a0 = (i / steps) * TAU;
                const a1 = ((i + 1) / steps) * TAU;
                add(cx + rx * Math.cos(a0), cy + ry * Math.sin(a0), cx + rx * Math.cos(a1), cy + ry * Math.sin(a1));
            }
        };
        const tilt = Math.sin(WIRE_TILT);
        const stand = Math.cos(WIRE_TILT);
        for (const lat of [-50, -25, 0, 25, 50]) {
            const phi = lat * Math.PI / 180;
            const rx = r * Math.cos(phi);
            ellipse(0, r * Math.sin(phi) * stand, rx, Math.max(0.6, rx * tilt));
        }
        for (const lambda of [18, 40, 62, 80]) {
            ellipse(0, 0, r * Math.sin(lambda * Math.PI / 180), r * stand);
        }
        ctx.rotate(rot);
        ctx.strokeStyle = this.theme.signal;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        for (let bin = 0; bin < buckets.length; bin++) {
            const seg = buckets[bin];
            if (!seg || seg.length === 0) continue;
            ctx.beginPath();
            for (let k = 0; k < seg.length; k += 4) {
                ctx.moveTo(seg[k] ?? 0, seg[k + 1] ?? 0);
                ctx.lineTo(seg[k + 2] ?? 0, seg[k + 3] ?? 0);
            }
            ctx.globalAlpha = (bin + 0.5) / bins;
            ctx.stroke();
        }
        ctx.restore();
    }

    /** A soft --signal band along `away`, strong at the front and gone at both edges. */
    private softBand(r: number, local: number, away: number): void {
        const env = tealSweepAlpha(local);
        if (!(env > 0)) return;
        const front = -r + local * 2 * r;
        const trail = front - Math.max(2, r * 0.62);
        const c = Math.cos(away);
        const s = Math.sin(away);
        const ctx = this.ctx;
        const grad = ctx.createLinearGradient(trail * c, trail * s, front * c, front * s);
        grad.addColorStop(0, withAlpha(this.theme.signal, 0));
        grad.addColorStop(0.5, withAlpha(this.theme.signal, env));
        grad.addColorStop(1, withAlpha(this.theme.signal, 0));
        ctx.globalAlpha = 1;
        ctx.fillStyle = grad;
        ctx.fillRect(-r, -r, r * 2, r * 2);
    }

    /**
     * Bright at the wavefront, fading in ahead of it and fading out behind it, and gone
     * with the body's sweep. `along` grows away from the star.
     */
    private waveAlpha(along: number, r: number, local: number): number {
        const env = tealSweepAlpha(local);
        if (!(env > 0)) return 0;
        const front = -r + local * 2 * r;
        const band = r * 0.7;
        const behind = front - along;
        const ahead = along - front;
        let spatial = 0;
        if (behind >= 0 && behind < band) spatial = 1 - behind / band;
        else if (ahead >= 0 && ahead < band) spatial = 1 - ahead / band;
        return spatial * env;
    }

    /** The gesture share of one body. `p` is 0 at its star and 1 at that star's farthest body. */
    private bodyLocal(share: number, p: number): number {
        const travel = this.theme.tLong;
        const sweep = this.theme.tSlow;
        if (typeof travel !== 'number' || typeof sweep !== 'number') return share > 0 ? 1 : 0;
        return waveLocal(share, p, travel, sweep);
    }

    /** How far this body sits from its star, as a fraction of that star's farthest body. */
    private reachOf(x: number, y: number, starX: number, starY: number): number {
        const star = this.starFar.get(starX + ',' + starY);
        if (!star || !(star.far > 0)) return 0;
        return Math.min(1, Math.hypot(x - starX, y - starY) / star.far);
    }

    /** The stars on this picture, and how far their farthest body sits. */
    private indexStars(picture: Picture, state: DrawState): void {
        this.starFar.clear();
        this.worldByKey.clear();
        const touch = (x: number, y: number, starX: number, starY: number) => {
            const id = starX + ',' + starY;
            let star = this.starFar.get(id);
            if (!star) {
                star = { x: starX, y: starY, far: 0 };
                this.starFar.set(id, star);
            }
            const d = Math.hypot(x - starX, y - starY);
            if (d > star.far) star.far = d;
        };
        for (const layer of picture.layers) {
            for (const at of layer.worlds) {
                this.worldByKey.set(at.world.key, at);
                touch(at.x, at.y, at.starX, at.starY);
                for (const moon of this.moonsOf(at, state)) {
                    if (moon.moon.ring) continue;
                    touch(moon.x, moon.y, at.starX, at.starY);
                }
            }
        }
    }

    /**
     * One thin --signal ring leaving the star with the front, faint, and fainter as it
     * travels. Gone at the star and gone again once the front has passed the last body.
     */
    private waveFronts(): void {
        const paint = (share: number) => {
            const travel = this.theme.tLong;
            const sweep = this.theme.tSlow;
            if (typeof travel !== 'number' || typeof sweep !== 'number' || !(travel > 0)) return;
            const along = share / (travel / (travel + sweep));
            if (!(along > 0) || along >= 1) return;
            const alpha = tealSweepAlpha(along) * (1 - along * 0.65) * 0.35;
            if (!(alpha > 0.015)) return;
            const ctx = this.ctx;
            ctx.save();
            ctx.strokeStyle = this.theme.signal;
            ctx.globalAlpha = alpha;
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            for (const star of this.starFar.values()) {
                if (!(star.far > 2)) continue;
                this.strokeVisible(star.x, star.y, along * star.far, 1);
            }
            ctx.restore();
        };
        if (this.moonsLive && this.dayLive && this.moonsShare === this.dayShare) paint(this.moonsShare);
        else {
            if (this.moonsLive) paint(this.moonsShare);
            if (this.dayLive) paint(this.dayShare);
        }
    }

    /**
     * Remember the geometry a shrink will need. A picture that still contains a layer
     * replaces the stash (a reveal, or a reverse that has not finished). An empty picture
     * leaves it, so the shrink and a mid-run reverse still have something to draw. Each
     * picture builds new objects and never mutates them, so the stash holds references.
     */
    private keepHeld(picture: Picture, layers: Layers): void {
        if (picture.mode !== this.heldMode) {
            this.heldMode = picture.mode;
            this.heldLayers = [];
            this.heldMoonPicture = null;
            this.heldMainKeys = new Set();
        }
        while (this.heldLayers.length < picture.layers.length) {
            this.heldLayers.push({ bands: [], jumps: [], paths: [], panels: [] });
        }
        if (this.heldLayers.length > picture.layers.length) this.heldLayers.length = picture.layers.length;
        picture.layers.forEach((layer, i) => {
            const held = this.heldLayers[i];
            if (!held) return;
            if (layer.bands.length > 0) held.bands = layer.bands;
            if (layer.panels.length > 0) held.panels = layer.panels;
            if (layer.jumps.length > 0) held.jumps = layer.jumps;
            if (layer.paths.some((path) => path.style !== 'belt')) held.paths = layer.paths;
        });
        if (layers.moons && picture.layers.some((layer) => layer.worlds.some((world) => world.moons.length > 0))) {
            this.heldMoonPicture = picture;
        }
        if (layers.markMainworld && picture.captions.some((caption) => caption.main)) {
            this.heldMainKeys = new Set(picture.captions.filter((caption) => caption.main).map((caption) => caption.key));
        }
    }

    // ---- Shaded discs ---------------------------------------------------------------------

    /**
     * js/system_viewer.js:2672-2681: one batch for the whole frame, before anything is painted.
     * As legacy, discs are shaded only with the Day / night layer on. Whatever the service
     * answers short of 'ready', and whenever there is no service, the frame is the flat one.
     * A moons hide keeps the moon discs in the batch until the run ends, so their tiles stay.
     */
    private prepareDiscs(plan: Plan, picture: Picture, state: DrawState): void {
        this.shaded = null;
        this.missing = false;
        this.tilesDrawn = 0;
        this.discStatus = 'unavailable';
        if (this.lastDays !== null) this.rate = visualRate(this.rate, state.days - this.lastDays, this.frameSeconds);
        this.lastDays = state.days;
        const painter = this.deps.discs;
        // A hide still asks for the tiles, so the shaded rings can fade instead of vanishing.
        const want = state.layers.dayNight || this.dayLive;
        if (!painter || !want) {
            this.latchDay();
            return;
        }
        const primary = plan.stars[0];
        const paint = primary ? (this.theme.stars[String(primary.body.sType || '')] || this.theme.starUnknown) : this.theme.starUnknown;
        const batch = discBatch(plan, this.discPicture(picture, state), { width: this.w, height: this.h, dpr: this.dpr }, {
            days: state.days, timeSeconds: state.time / 1000, rate: this.rate, frameSeconds: this.frameSeconds, motion: state.motion,
        }, {
            mode: painter.mode(), sun: sunColour(paint.solid), lightMode: false,
            moonsShown: state.layers.moons || this.moonsLive, selected: state.selected,
        });
        if (!batch.discs.length) {
            this.latchDay();
            return;
        }
        // The ring's fill stays as the batch built it. Fading it would rebake the tile on
        // every frame of a sweep (a late tile then arrives at full strength and pops) and
        // would fade the ring's shadow on the planet. The cross-fade is the blit below.
        this.discStatus = painter.prepare(batch);
        this.latchDay();
        if (this.discStatus !== 'ready') return;
        this.shaded = new Map(batch.discs.map((disc) => [disc.key, disc.ring !== null]));
    }

    /**
     * The picture a hide is drawn from has already dropped its moons. Until that run ends
     * the batch is given the moons still on screen, so retainDiscs keeps their tiles.
     */
    private discPicture(picture: Picture, state: DrawState): Picture {
        if (!this.moonsLive || state.layers.moons) return picture;
        let changed = false;
        const layers = picture.layers.map((layer) => {
            let layerChanged = false;
            const worlds = layer.worlds.map((at) => {
                const moons = this.moonsOf(at, state);
                if (moons === at.moons) return at;
                layerChanged = true;
                return { ...at, moons: [...moons] };
            });
            if (!layerChanged) return layer;
            changed = true;
            return { ...layer, worlds };
        });
        return changed ? { ...picture, layers } : picture;
    }

    /** dayHold is the service's answer on the frame a day/night run starts, after the discs were asked. */
    private latchDay(): void {
        if (!this.dayArm) return;
        this.dayHold = this.discStatus !== 'ready';
        this.dayArm = false;
    }

    /**
     * How much of the shaded ring is showing, 0 to 1. Day/night cross-fades it with this
     * body's sweep. A tile that was not ready when the run started stays out until it
     * fades up over --t-base, so a late tile does not pop in at the end of the sweep.
     */
    private ringShown(key: string): number {
        const tile = this.tileMix(key);
        if (!this.dayLive) return this.layers?.dayNight === true ? tile : 0;
        if (this.dayHold && !(tile > 0)) return 0;
        return this.dayFactor(key) * (this.dayHold ? tile : 1);
    }

    /** 0 at the star, 1 at that star's farthest body. A moon uses its world's reach. */
    private bodyReach(key: string): number {
        const at = this.worldByKey.get(key);
        if (!at) return 0;
        return this.reachOf(at.x, at.y, at.starX, at.starY);
    }

    private moonFactor(key: string): number {
        return this.gestureFactor(this.moonsLive, this.moonsShare, this.layers?.moons === true, this.bodyReach(key));
    }

    private dayFactor(key: string): number {
        return this.gestureFactor(this.dayLive, this.dayShare, this.layers?.dayNight === true, this.bodyReach(key));
    }

    /** A live channel eases with the body's own sweep. A settled switch is on or off. */
    private gestureFactor(live: boolean, share: number, on: boolean, p: number): number {
        if (!live) return on ? 1 : 0;
        return smoothstep(this.bodyLocal(share, p));
    }

    /**
     * Tiles on the first paint are already there, so they do not fade. A tile the day/night
     * sweep reveals is marked once the sweep ends. Any other arrival fades over --t-base.
     */
    private syncTiles(state: DrawState): void {
        const keys = this.shaded ? [...this.shaded.keys()] : [];
        if (!this.tilePrimed) {
            for (const key of keys) this.tileSeen.add(key);
            this.tilePrimed = true;
        } else if (this.dayLive && this.dayHold) {
            // The sweep started on the flat night. A tile under it waits, then fades on its own.
        } else if (this.dayLive) {
            for (const key of keys) this.tileSweep.add(key);
        } else {
            for (const key of this.tileSweep) this.tileSeen.add(key);
            this.tileSweep.clear();
            const seconds = this.theme.tBase;
            const canFade = state.motion && typeof seconds === 'number' && seconds > 0 && !!this.theme.easeOut;
            for (const key of keys) {
                if (this.tileSeen.has(key) || this.tileRuns.has(key)) continue;
                if (!canFade) {
                    this.tileSeen.add(key);
                    continue;
                }
                this.tileRuns.set(key, this.frameTime);
            }
        }
        const seconds = this.theme.tBase;
        if (typeof seconds === 'number' && seconds > 0) {
            for (const [key, started] of this.tileRuns) {
                if ((this.frameTime - started) / 1000 / seconds >= 1) {
                    this.tileRuns.delete(key);
                    this.tileSeen.add(key);
                }
            }
        } else if (this.tileRuns.size > 0) {
            for (const key of this.tileRuns.keys()) this.tileSeen.add(key);
            this.tileRuns.clear();
        }
        if (this.tileRuns.size > 0) this.layersBusy = true;
    }

    /** How much of a late tile is showing. 1 when it was here from the start or its fade has finished. */
    private tileMix(key: string): number {
        if (!this.tilePrimed || this.tileSeen.has(key)) return 1;
        const started = this.tileRuns.get(key);
        if (started === undefined) return this.tileSweep.has(key) ? 1 : 0;
        const seconds = this.theme.tBase;
        const ease = this.theme.easeOut;
        if (typeof seconds !== 'number' || !(seconds > 0) || !ease) return 1;
        const u = (this.frameTime - started) / 1000 / seconds;
        if (u >= 1) return 1;
        return easeOutAt(ease, Math.max(0, u));
    }

    /**
     * Flat ring circles. Settled, they are on unless a shaded tile replaced them. While a
     * toggle moves, they trade places with the shaded rings over that body's sweep.
     */
    private flatRingAlpha(key: string, lit: boolean): number {
        const moons = this.moonFactor(key);
        const anim = this.moonsLive || this.dayLive || this.tileRuns.has(key);
        if (!anim) return lit ? 0 : moons;
        if (this.shaded?.get(key) !== true) return moons;
        return moons * (1 - this.ringShown(key));
    }

    /** The flat circles. Alpha under 1 multiplies whatever the caller already faded. */
    private flatRings(x: number, y: number, radii: readonly number[], alpha: number): void {
        if (!(alpha > 0.004) || radii.length === 0) return;
        if (alpha >= 1) {
            for (const r of radii) this.staticRing(x, y, r);
            return;
        }
        const ctx = this.ctx;
        const current = ctx.globalAlpha;
        ctx.save();
        ctx.globalAlpha = (typeof current === 'number' ? current : 1) * alpha;
        for (const r of radii) this.staticRing(x, y, r);
        ctx.restore();
    }

    /**
     * Ring radii for this world. A moons hide drops them from the picture; the stash still
     * has the circles the fade draws.
     */
    private ringRadii(at: WorldDraw): readonly number[] {
        if (at.rings.length > 0 || !this.moonsLive) return at.rings;
        const picture = this.heldMoonPicture;
        if (!picture) return at.rings;
        for (const layer of picture.layers) {
            for (const world of layer.worlds) {
                if (world.world.key === at.world.key && world.rings.length > 0) return world.rings;
            }
        }
        return at.rings;
    }

    /** After the frame: whether the discs want another one. */
    private settleDiscs(state: DrawState): void {
        this.discsReport = this.deps.discs ? this.discStatus + ':' + this.tilesDrawn : 'none';
        if (this.discStatus === 'unavailable') {
            this.settling = 0;
            this.discsBusy = false;
            return;
        }
        // 'ready' means the frame was submitted; a tile may come a frame or more later, and
        // sharper ones after that. A still picture is painted for a while longer to take them.
        if (this.discStatus === 'pending' || this.missing) this.settling = SETTLE_FRAMES;
        else if (this.settling > 0) this.settling -= 1;
        this.discsBusy = this.discStatus === 'pending' || this.settling > 0 || state.motion;
    }

    /** A body's shaded disc, when this frame's batch holds it and the service has its tile. */
    private shadedDisc(key: string, x: number, y: number, r: number): boolean {
        const painter = this.deps.discs;
        if (!painter || !this.shaded || !this.shaded.has(key)) return false;
        const ctx = this.ctx;
        ctx.save();
        const drawn = painter.draw(ctx, key, x, y, r);
        ctx.restore();
        if (drawn) this.tilesDrawn += 1;
        else this.missing = true;
        return drawn;
    }

    // ---- Backdrop ------------------------------------------------------------------------

    /** js/system_viewer.js:3321-3331. */
    private starField(plan: Plan, view: View): void {
        const ctx = this.ctx;
        const make = this.deps.makeCanvas;
        if (!make) {
            ctx.fillStyle = this.theme.space;
            ctx.fillRect(0, 0, this.w, this.h);
            return;
        }
        const key = plan.hexKey + '|' + this.w + '|' + this.h + '|' + this.dpr;
        if (!this.backdrop || this.backdrop.key !== key) {
            const box = backdropBox(this.w, this.h);
            const canvas = make(Math.max(1, Math.round(box.bw * this.dpr)), Math.max(1, Math.round(box.bh * this.dpr)));
            const inner = canvas.getContext('2d');
            if (inner) paintBackdrop(inner, box, this.dpr, plan.hexKey, this.theme);
            this.backdrop = { canvas, box, key };
        }
        const box = this.backdrop.box;
        const at = backdropShift(box, view.offX, view.offY);
        ctx.drawImage(this.backdrop.canvas, at.x, at.y, box.bw, box.bh);
    }

    // ---- Circles ---------------------------------------------------------------------------

    /** js/system_viewer.js:3113-3121. Strokes only the part of a circle that can be seen. */
    private strokeVisible(cx: number, cy: number, r: number, lineWidth: number, dashLength = 0, dashOffset = 0): void {
        const span = arcSpan(cx, cy, r, this.w, this.h, lineWidth + 4);
        if (!span) return;
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(cx, cy, r, span[0], span[1]);
        if (dashLength) ctx.lineDashOffset = ((dashOffset + span[0] * r) % dashLength + dashLength) % dashLength;
        ctx.stroke();
        if (dashLength) ctx.lineDashOffset = 0;
    }

    private offCanvas(x: number, y: number, reach: number): boolean {
        return x + reach < 0 || y + reach < 0 || x - reach > this.w || y - reach > this.h;
    }

    /** js/system_viewer.js:3338-3389. */
    private band(band: BandAt): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { cx, cy } = band;
        const outerR = band.outer;
        if (!(band.alpha > 0) || outerR <= band.inner || band.inner < 0) return;
        const inner = Math.max(0, band.inner);
        const span = arcSpan(cx, cy, outerR, this.w, this.h);
        const fromCentre = Math.hypot(cx - this.w / 2, cy - this.h / 2);
        if (inner > 0 && !arcSpan(cx, cy, inner, this.w, this.h) && fromCentre < inner) return;
        if (!span && !(fromCentre < outerR)) return;
        const grad = ctx.createRadialGradient(cx, cy, inner, cx, cy, outerR);
        grad.addColorStop(0, theme.hzEdge);
        grad.addColorStop(0.5, theme.hzMid);
        grad.addColorStop(1, theme.hzEdge);
        ctx.save();
        ctx.globalAlpha = Math.min(1, band.alpha);
        ctx.fillStyle = grad;
        ctx.beginPath();
        if (!span) {
            // The whole canvas lies inside the band's outer edge.
            ctx.rect(0, 0, this.w, this.h);
            const hole = inner > 0 ? arcSpan(cx, cy, inner, this.w, this.h) : null;
            if (hole) {
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, inner, hole[0], hole[1]);
                ctx.closePath();
            }
            ctx.fill(hole ? 'evenodd' : 'nonzero');
            ctx.restore();
            return;
        }
        if (span[1] - span[0] >= TAU) {
            ctx.arc(cx, cy, outerR, 0, TAU, false);
            ctx.arc(cx, cy, inner, 0, TAU, true);
        } else {
            ctx.arc(cx, cy, outerR, span[0], span[1], false);
            ctx.arc(cx, cy, inner, span[1], span[0], true);
            ctx.closePath();
        }
        ctx.fill();
        ctx.strokeStyle = theme.hzLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        if (inner >= 2) this.strokeVisible(cx, cy, inner, 1.5, 11);
        if (outerR >= 2) this.strokeVisible(cx, cy, outerR, 1.5, 11);
        ctx.setLineDash([]);
        ctx.restore();
    }

    /** js/system_viewer.js:2613-2631: the habitable panel behind a body in a line-up. */
    private panel(panel: Panel): void {
        if (!(panel.alpha > 0) || this.offCanvas(panel.x + panel.w / 2, panel.y + panel.h / 2, Math.max(panel.w, panel.h))) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.min(1, panel.alpha);
        ctx.fillStyle = this.theme.hzPanel;
        ctx.strokeStyle = this.theme.hzLine;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([7, 4]);
        ctx.beginPath();
        ctx.roundRect(panel.x, panel.y, panel.w, panel.h, panel.radius);
        ctx.fill();
        ctx.stroke();
        ctx.restore();
    }

    /** js/system_viewer.js:3123-3136, without its "100D jump" words: the legend names the circle. */
    private jump(ring: JumpAt): void {
        if (!(ring.alpha > 0) || !(ring.r >= 6) || ring.r > MAX_RING_RADIUS) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.min(1, ring.alpha);
        ctx.strokeStyle = this.theme.jump;
        ctx.lineWidth = 1.5;
        this.strokeVisible(ring.cx, ring.cy, ring.r, 1.5);
        ctx.restore();
    }

    /**
     * An orbit path: a world's ring (3221-3229), a companion's dashed orbit (2959-2966), a
     * belt's band of dashes (4644-4652, its phase turning with the belt, 3205), or a
     * line-up's arc behind the row (2634-2647).
     */
    private path(path: PathAt): void {
        if (!(path.alpha > 0) || path.r < 2) return;
        if (path.style !== 'solid' && path.r > MAX_RING_RADIUS) return;
        const ctx = this.ctx;
        const theme = this.theme;
        ctx.save();
        ctx.globalAlpha = Math.min(1, path.alpha);
        if (path.style === 'belt') {
            const width = path.width || 5;
            ctx.strokeStyle = theme.beltBand;
            ctx.lineWidth = width;
            ctx.setLineDash([3, 7]);
            this.strokeVisible(path.cx, path.cy, path.r, width, 10, path.phase);
        } else {
            const width = path.width || this.pathWidth;
            ctx.strokeStyle = theme.pathBase;
            ctx.lineWidth = width;
            if (path.style === 'dashed') {
                ctx.setLineDash([4, 6]);
                this.strokeVisible(path.cx, path.cy, path.r, width, 10);
            } else {
                this.strokeVisible(path.cx, path.cy, path.r, width);
            }
        }
        ctx.setLineDash([]);
        ctx.restore();
        // 3206-3214: a mainworld belt carries the mark and its name at the top of its ring.
        if (path.main !== null && this.layers && !this.mainLive && this.layers.markMainworld) {
            this.mainworldStar(path.cx, path.cy - path.r, 2, this.z);
            if (path.main) this.name(path.main, path.cx, path.cy - path.r - 10, 11, path.alpha);
        } else if (path.main !== null && this.layers && this.mainLive && this.mainShare > 0) {
            if (this.mainShare >= 1) {
                this.mainworldStar(path.cx, path.cy - path.r, 2, this.z);
                if (path.main) this.name(path.main, path.cx, path.cy - path.r - 10, 11, path.alpha);
            } else {
                const mark = this.ctx;
                mark.save();
                mark.globalAlpha = this.mainShare;
                this.mainworldStar(path.cx, path.cy - path.r, 2, this.z);
                mark.restore();
                if (path.main) this.name(path.main, path.cx, path.cy - path.r - 10, 11, path.alpha * this.mainShare);
            }
        }
    }

    /** js/system_viewer.js:2504-2520: a belt in a line-up, as a band of rocks. */
    private rocks(rocks: Rocks): void {
        if (!(rocks.alpha > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.fillStyle = this.theme.rock;
        for (const dot of rocks.dots) {
            if (this.offCanvas(dot.x, dot.y, 4)) continue;
            ctx.globalAlpha = Math.min(1, dot.alpha * rocks.alpha);
            ctx.beginPath();
            ctx.arc(dot.x, dot.y, dot.r, 0, TAU);
            ctx.fill();
        }
        ctx.restore();
        if (rocks.mark && this.layers && !this.mainLive && this.layers.markMainworld) {
            this.mainworldStar(rocks.mark.x, rocks.mark.y, rocks.mark.r, this.z);
        } else if (rocks.mark && this.layers && this.mainLive && this.mainShare > 0) {
            if (this.mainShare >= 1) {
                this.mainworldStar(rocks.mark.x, rocks.mark.y, rocks.mark.r, this.z);
            } else {
                ctx.save();
                ctx.globalAlpha = this.mainShare;
                this.mainworldStar(rocks.mark.x, rocks.mark.y, rocks.mark.r, this.z);
                ctx.restore();
            }
        }
    }

    /** js/system_viewer.js:2538-2572: a line-up caption, fitted to its slot. */
    private caption(caption: Caption): void {
        if (!(caption.alpha > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.min(1, caption.alpha);
        ctx.font = '600 ' + caption.fontPx + 'px ' + this.theme.fontText;
        ctx.fillStyle = caption.main ? this.theme.mainworld : this.theme.text;
        let label = caption.text;
        // Legacy cuts the full name; a row of "Regin…" says nothing, so the short name is tried first.
        if (ctx.measureText(label).width > caption.maxW) label = caption.short;
        if (ctx.measureText(label).width > caption.maxW) {
            while (label.length > 1 && ctx.measureText(label + '\u2026').width > caption.maxW) label = label.slice(0, -1);
            label = label.replace(/\s+$/, '') + '\u2026';
        }
        ctx.textAlign = caption.align;
        ctx.textBaseline = caption.align === 'center' ? 'top' : 'middle';
        ctx.fillText(label, caption.x, caption.y);
        ctx.restore();
    }

    // ---- Worlds ----------------------------------------------------------------------------

    /** js/system_viewer.js:4532-4641. */
    private world(plan: Plan, at: WorldDraw, state: DrawState): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const layers = state.layers;
        const w = at.world;
        const { starX, starY } = at;
        let reach = at.r;
        for (const m of at.moons) reach = Math.max(reach, m.orbitR + m.r);
        for (const r of at.rings) reach = Math.max(reach, r);
        if (this.offCanvas(at.x, at.y, reach + 60)) return;

        const port = w.port && at.r >= HIGHPORT_MIN_WORLD_PX
            ? this.portAngle(w.key, bodyAngle(plan.portEpoch, w.portPeriod, state.days))
            : null;
        if (w.port && port !== null) this.highport(plan, w.port, w.key, at.x, at.y, at.r, port, starX, starY, false, state);
        // 4218-4224: the shaded tile where there is one, else the flat disc and its night half.
        const lit = this.paintDisc(w.key, at.x, at.y, at.r, theme.tones[w.tone], starX, starY, layers.dayNight);
        if (w.port && port !== null) this.highport(plan, w.port, w.key, at.x, at.y, at.r, port, starX, starY, true, state);
        // Rings shaded with the disc replace the flat circles, cross-faded while a toggle moves.
        const flatA = this.flatRingAlpha(w.key, lit);

        const moonList = this.moonsOf(at, state);
        // 4543-4554: the moons' paths, with the Paths layer. A moons toggle brings each path
        // up as the wave passes its moon, and takes it back on the way down.
        if (!this.pathsLive) {
            if (layers.paths && layers.pathStrength > 0) {
                ctx.save();
                ctx.strokeStyle = theme.pathBase;
                ctx.lineWidth = this.pathWidth;
                for (const m of moonList) {
                    if (m.moon.ring || m.orbitR < 2) continue;
                    const cover = this.moonCover(m.x, m.y, starX, starY);
                    if (!(cover > 0)) continue;
                    ctx.globalAlpha = Math.min(1, layers.pathStrength * PATH_ALPHA_WORLD * cover);
                    ctx.beginPath();
                    ctx.arc(at.x, at.y, m.orbitR, 0, TAU);
                    ctx.stroke();
                }
                ctx.restore();
            }
        } else if (this.pathsShare > 0 && layers.pathStrength > 0) {
            const share = this.pathsShare;
            ctx.save();
            if (share < 1) {
                ctx.translate(at.x, at.y);
                ctx.scale(share, share);
                ctx.translate(-at.x, -at.y);
            }
            ctx.strokeStyle = theme.pathBase;
            ctx.lineWidth = this.pathWidth;
            for (const m of moonList) {
                if (m.moon.ring || m.orbitR < 2) continue;
                const cover = this.moonCover(m.x, m.y, starX, starY);
                if (!(cover > 0)) continue;
                ctx.globalAlpha = Math.min(1, layers.pathStrength * PATH_ALPHA_WORLD * (share < 1 ? share : 1) * cover);
                ctx.beginPath();
                ctx.arc(at.x, at.y, m.orbitR, 0, TAU);
                ctx.stroke();
            }
            ctx.restore();
        }
        for (const m of moonList) {
            const cover = this.moonCover(m.x, m.y, starX, starY);
            if (!(cover > 0)) continue;
            if (cover < 1) {
                ctx.save();
                ctx.globalAlpha = cover;
                this.moon(plan, m, at, state, flatA);
                ctx.restore();
            } else {
                this.moon(plan, m, at, state, flatA);
            }
        }
        this.flatRings(at.x, at.y, this.ringRadii(at), flatA);

        if (w.mainworld && !this.mainLive && layers.markMainworld) {
            this.mainworldStar(at.x, at.y, at.r, at.z);
            if (w.name && at.label > 0) this.name(w.name, at.x, at.y - at.r - 8, 11, at.label);
        } else if (w.mainworld && this.mainLive && this.mainShare > 0) {
            if (this.mainShare >= 1) {
                this.mainworldStar(at.x, at.y, at.r, at.z);
                if (w.name && at.label > 0) this.name(w.name, at.x, at.y - at.r - 8, 11, at.label);
            } else {
                ctx.save();
                ctx.globalAlpha = this.mainShare;
                this.mainworldStar(at.x, at.y, at.r, at.z);
                ctx.restore();
                if (w.name && at.label > 0) this.name(w.name, at.x, at.y - at.r - 8, 11, at.label * this.mainShare);
            }
        }
    }

    private moon(plan: Plan, m: MoonAt, parent: WorldDraw, state: DrawState, flatA: number): void {
        const moon = m.moon;
        if (moon.ring) {
            this.flatRings(m.x, m.y, [m.orbitR], flatA);
            return;
        }
        const ctx = this.ctx;
        const { starX, starY } = parent;
        const port = moon.port && m.r >= HIGHPORT_MIN_WORLD_PX
            ? this.portAngle(moon.key, bodyAngle(plan.portEpoch, moon.portPeriod, state.days))
            : null;
        if (moon.port && port !== null) this.highport(plan, moon.port, moon.key, m.x, m.y, m.r, port, starX, starY, false, state);
        const lit = this.paintDisc(moon.key, m.x, m.y, m.r, this.theme.moon, starX, starY, state.layers.dayNight);
        if (moon.port && port !== null) this.highport(plan, moon.port, moon.key, m.x, m.y, m.r, port, starX, starY, true, state);
        // 4586-4603: the moon dims as it slides into its world's shadow. A shaded disc carries its
        // own eclipse (its casters), so the wash is for the flat disc only (4585).
        const cover = state.layers.dayNight && !lit && !this.dayLive ? this.eased(moon.key, m.cover, state) : 0;
        if (cover > 0.02) {
            ctx.save();
            const wash = ctx.createRadialGradient(m.x, m.y, m.r * 0.15, m.x, m.y, m.r);
            wash.addColorStop(0, this.theme.shadow[0]);
            wash.addColorStop(0.7, this.theme.shadow[1]);
            wash.addColorStop(1, this.theme.shadow[2]);
            ctx.globalAlpha = Math.min(1, cover);
            ctx.fillStyle = wash;
            ctx.beginPath();
            ctx.arc(m.x, m.y, m.r, 0, TAU);
            ctx.fill();
            ctx.restore();
        }
        if (moon.mainworld && !this.mainLive && state.layers.markMainworld) {
            this.mainworldStar(m.x, m.y, m.r, parent.z);
            if (moon.name && parent.label > 0) this.name(moon.name, m.x, m.y - m.r - 5, 10, parent.label);
        } else if (moon.mainworld && this.mainLive && this.mainShare > 0) {
            if (this.mainShare >= 1) {
                this.mainworldStar(m.x, m.y, m.r, parent.z);
                if (moon.name && parent.label > 0) this.name(moon.name, m.x, m.y - m.r - 5, 10, parent.label);
            } else {
                ctx.save();
                ctx.globalAlpha = this.mainShare;
                this.mainworldStar(m.x, m.y, m.r, parent.z);
                ctx.restore();
                if (moon.name && parent.label > 0) this.name(moon.name, m.x, m.y - m.r - 5, 10, parent.label * this.mainShare);
            }
        }
    }

    /** js/system_viewer.js:3162-3177. A short ease, so a fast clock fades the shadow instead of popping it. */
    private eased(key: string, target: number, state: DrawState): number {
        if (!state.motion) return target;
        const rec = this.eclipse.get(key);
        if (!rec) {
            this.eclipse.set(key, { value: target, at: state.time });
            return target;
        }
        const dt = Math.min(0.05, Math.max(0, (state.time - rec.at) / 1000));
        rec.at = state.time;
        rec.value += (target - rec.value) * (1 - Math.exp(-dt / 0.16));
        if (Math.abs(rec.value - target) < 0.01) rec.value = target;
        return rec.value;
    }

    /**
     * Moons for this world. The picture drops them while they hide; the stash keeps the last
     * placed ones when the world has not moved, and otherwise they are placed again.
     */
    private moonsOf(at: WorldDraw, state: DrawState): readonly MoonAt[] {
        if (!this.moonsLive || state.layers.moons) return at.moons;
        const picture = this.heldMoonPicture;
        if (picture) {
            for (const layer of picture.layers) {
                for (const world of layer.worlds) {
                    if (world.world.key === at.world.key && world.x === at.x && world.y === at.y && world.moons.length > 0) {
                        return world.moons;
                    }
                }
            }
        }
        return placeWorld(at.world, at.x, at.y, at.z, state.days, at.starX, at.starY, [], true).moons;
    }

    /**
     * How far this moon has arrived with the wave that leaves its star. 1 when moons are
     * not toggling. The sweep starts when the front reaches the moon and then stays.
     */
    private moonCover(x: number, y: number, starX: number, starY: number): number {
        if (!this.moonsLive) return 1;
        return smoothstep(this.bodyLocal(this.moonsShare, this.reachOf(x, y, starX, starY)));
    }

    /**
     * The body's disc. During a day/night toggle the wireframe wave (the same one the moons
     * use) crosses the disc, and the shading is uncovered behind that front. A hide runs
     * the front back, so the shading leaves ahead of it. A tile that arrives after the
     * sweep fades over --t-base. Returns whether a shaded tile was fully on.
     */
    private paintDisc(key: string, x: number, y: number, r: number, colour: string, starX: number, starY: number, night: boolean): boolean {
        if (this.dayLive) {
            this.daySweep(key, x, y, r, colour, starX, starY);
            return false;
        }
        const tile = this.tileMix(key);
        if (tile <= 0) {
            this.disc(x, y, r, colour, starX, starY, night);
            return false;
        }
        if (tile >= 1) {
            const lit = this.shadedDisc(key, x, y, r);
            if (!lit) this.disc(x, y, r, colour, starX, starY, night);
            return lit;
        }
        this.disc(x, y, r, colour, starX, starY, night);
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = tile;
        this.shadedDisc(key, x, y, r);
        ctx.restore();
        return false;
    }

    /**
     * Shading uncovered behind the day/night front. The front itself is the shared
     * wireframe wave. At the start of a reveal, and once a hide has passed back off
     * the disc, the body is the flat disc.
     */
    private daySweep(key: string, x: number, y: number, r: number, colour: string, starX: number, starY: number): void {
        this.disc(x, y, r, colour, starX, starY, false);
        if (!(r > 0)) return;
        const local = this.bodyLocal(this.dayShare, this.reachOf(x, y, starX, starY));
        if (!(local > 0)) return;
        const ang = Math.atan2(starY - y, starX - x);
        const mid = Math.atan2(-Math.sin(ang), -Math.cos(ang));
        // The planet face is clipped to the disc, which hides the ring. The ring is drawn
        // again, outside that disc, at this body's sweep, so it cross-fades instead of
        // appearing on the frame the front leaves the disc.
        let covered = false;
        if (local >= 1) {
            covered = this.revealDisc(key, x, y, r);
            if (!covered) this.disc(x, y, r, colour, starX, starY, true);
        } else {
            const front = -r + local * 2 * r;
            const ctx = this.ctx;
            ctx.save();
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.clip();
            ctx.beginPath();
            if (this.litCap(ctx, x, y, r, mid, front)) {
                ctx.clip();
                const lit = this.revealDisc(key, x, y, r);
                if (!lit) this.disc(x, y, r, colour, starX, starY, true);
            }
            ctx.restore();
        }
        if (!covered) this.shadeRings(key, x, y, r);
    }

    /**
     * The shaded tile may join a sweep once it is actually in hand. dayHold remembers that
     * the run started without tiles; a tile already seen still cross-fades with the sweep,
     * and one that arrives later fades over --t-base instead of popping at the end.
     */
    private revealDisc(key: string, x: number, y: number, r: number): boolean {
        if (this.dayHold && !(this.tileMix(key) > 0)) return false;
        return this.shadedDisc(key, x, y, r);
    }

    /** The part of the shaded tile outside the planet disc, at the ring's sweep amount. */
    private shadeRings(key: string, x: number, y: number, r: number): void {
        const amount = this.ringShown(key);
        if (!(amount > 0.004) || !(r > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, this.w, this.h);
        ctx.arc(x, y, r, 0, TAU, true);
        ctx.clip('evenodd');
        const current = ctx.globalAlpha;
        ctx.globalAlpha = (typeof current === 'number' ? current : 1) * Math.min(1, amount);
        this.shadedDisc(key, x, y, r);
        ctx.restore();
    }

    /** The part of the disc on the lit side of a line `front` px toward the night limb. */
    private litCap(ctx: CanvasRenderingContext2D, x: number, y: number, r: number, mid: number, front: number): boolean {
        if (front >= r) {
            ctx.arc(x, y, r, 0, TAU);
            return true;
        }
        if (front <= -r) return false;
        const phi = Math.acos(Math.max(-1, Math.min(1, front / r)));
        ctx.arc(x, y, r, mid + phi, mid - phi, false);
        ctx.closePath();
        return true;
    }

    /** js/system_viewer.js:4226-4231 with 4201-4209: the flat disc and its night half. */
    private disc(x: number, y: number, r: number, colour: string, starX: number, starY: number, night: boolean): void {
        const ctx = this.ctx;
        ctx.fillStyle = colour;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
        if (!night) return;
        const angle = Math.atan2(starY - y, starX - x) + Math.PI;
        ctx.fillStyle = this.theme.night;
        ctx.beginPath();
        ctx.arc(x, y, r, angle - Math.PI / 2, angle + Math.PI / 2);
        ctx.closePath();
        ctx.fill();
    }

    /** js/system_viewer.js:3460-3466. */
    private staticRing(x: number, y: number, r: number): void {
        const ctx = this.ctx;
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.strokeStyle = this.theme.ring;
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    /** js/system_viewer.js:274-299. */
    private mainworldStar(x: number, y: number, bodyR: number, z: number): void {
        const ctx = this.ctx;
        const mark = mainworldMark(x, y, bodyR, z);
        ctx.save();
        ctx.fillStyle = this.theme.mainworld;
        ctx.beginPath();
        for (let i = 0; i < 5; i++) {
            const a = -Math.PI / 2 + i * (TAU / 5);
            const b = a + Math.PI / 5;
            if (i === 0) ctx.moveTo(mark.x + Math.cos(a) * mark.outer, mark.y + Math.sin(a) * mark.outer);
            else ctx.lineTo(mark.x + Math.cos(a) * mark.outer, mark.y + Math.sin(a) * mark.outer);
            ctx.lineTo(mark.x + Math.cos(b) * mark.inner, mark.y + Math.sin(b) * mark.inner);
        }
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    /** The mainworld's name (4607-4612, 4632-4637, 3208-3213). */
    private name(text: string, x: number, y: number, px: number, alpha: number): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.globalAlpha = Math.max(0, Math.min(1, alpha));
        ctx.fillStyle = this.theme.mainworld;
        ctx.font = px + 'px ' + this.theme.fontText;
        ctx.textAlign = 'center';
        ctx.fillText(text, x, y);
        ctx.restore();
    }

    // ---- Stars -----------------------------------------------------------------------------

    /** js/system_viewer.js:3414-3451. */
    private star(at: StarDraw): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const { x, y, r } = at;
        const paint = theme.stars[String(at.star.body.sType || '')] || theme.starUnknown;
        if (!this.offCanvas(x, y, r * at.glow + 4)) {
            ctx.save();
            const reach = r * at.glow;
            const glow = ctx.createRadialGradient(x, y, r * 0.2, x, y, reach);
            glow.addColorStop(0, paint.glow);
            glow.addColorStop(1, paint.clear);
            ctx.fillStyle = glow;
            ctx.beginPath();
            ctx.arc(x, y, reach, 0, TAU);
            ctx.fill();
            ctx.restore();

            const disc = ctx.createRadialGradient(x - r * 0.3, y - r * 0.3, 0, x, y, r);
            disc.addColorStop(0, theme.starCore);
            disc.addColorStop(0.4, paint.solid);
            disc.addColorStop(1, paint.rim);
            ctx.fillStyle = disc;
            ctx.beginPath();
            ctx.arc(x, y, r, 0, TAU);
            ctx.fill();
        }
        // 3441: the name and the separation belong to the orbits layout.
        if (!(at.label > 0) || this.offCanvas(x, y, r + 200)) return;
        ctx.save();
        ctx.globalAlpha = Math.min(1, at.label);
        ctx.fillStyle = theme.text;
        ctx.font = '11px ' + theme.fontText;
        ctx.textAlign = 'center';
        ctx.fillText(at.star.name, x, y + r + 15);
        if (at.star.separation) {
            ctx.fillStyle = theme.textMuted;
            ctx.font = '10px ' + theme.fontText;
            ctx.fillText(at.star.separation, x, y + r + 27);
        }
        ctx.restore();
    }

    // ---- Highport --------------------------------------------------------------------------

    private portAngle(key: string, want: number): number {
        const result = chaseAngle(this.chases.get(key) || null, want, this.frameSeconds);
        this.chases.set(key, result.state);
        return result.angle;
    }

    private artImage(art: HighportArt): ArtImage | null {
        const load = this.deps.loadImage;
        if (!load) return null;
        let found = this.images.get(art.file);
        if (!found) {
            const entry: ArtImage = { image: null as unknown as CanvasImageSource, ready: false };
            entry.image = load(this.deps.artBase + art.file, () => {
                entry.ready = true;
                this.deps.stale();
            });
            this.images.set(art.file, entry);
            found = entry;
        }
        return found;
    }

    /** js/system_viewer.js:4379-4400. One kept downscale per on-screen width, and its shaded copy. */
    private sprite(art: HighportArt, image: CanvasImageSource, widthPx: number): Sprite | null {
        const make = this.deps.makeCanvas;
        if (!make) return null;
        const w = spriteWidth(widthPx);
        const key = art.file + ':' + w;
        const kept = this.sprites.get(key);
        if (kept) return kept;
        const [sx, sy, sw, sh] = art.crop;
        const h = Math.max(4, Math.round(w * sh / sw));
        const lit = make(w, h);
        const c = lit.getContext('2d');
        const dark = make(w, h);
        const d = dark.getContext('2d');
        if (!c || !d) return null;
        c.imageSmoothingEnabled = true;
        c.imageSmoothingQuality = 'high';
        c.drawImage(image, sx, sy, sw, sh, 0, 0, w, h);
        d.drawImage(lit, 0, 0);
        d.globalCompositeOperation = 'source-atop';
        d.fillStyle = this.theme.portShade;
        d.fillRect(0, 0, w, h);
        const sprite = { lit, dark };
        this.sprites.set(key, sprite);
        return sprite;
    }

    /**
     * js/system_viewer.js:4418-4522. Drawn in two passes: the far half before the world, the
     * near half after. Without the planet renderer the station circles in the picture plane,
     * so it is always on the near pass (4424-4425).
     *
     * A departure from legacy, asked for by Johnny (2026-10-04): the legacy station snaps from
     * lit to dark as it crosses its world's shadow line. Here it fades as a moon does, by the
     * same shadowCover and the same short ease, the dark hull and wash laid over the lit ones.
     */
    private highport(
        plan: Plan, port: Port, key: string, x: number, y: number, r: number, angle: number,
        starX: number, starY: number, front: boolean, state: DrawState,
    ): void {
        const place = highportPlace(x, y, r, angle, starX, starY);
        if (place.behind === front || place.hidden) return;
        const ctx = this.ctx;
        const theme = this.theme;
        const size = highportSize(r);
        const now = state.motion ? state.time / 1000 : 0;
        const phase = plan.portPhase;
        const art = highportArt(port.cls);
        const paint: PortPaint = port.major ? theme.port.major : theme.port.minor;
        const aspect = art.crop[3] / art.crop[2];
        const sizeY = size * aspect;
        const ox = -art.pivot[0] * size;
        const oy = -art.pivot[1] * sizeY;
        const lampR = Math.max(0.7, size * 0.075);
        ctx.save();
        ctx.translate(place.x, place.y);
        // How deep in its world's shadow the station is: 0 lit, 1 dark, eased like a moon's.
        const cover = this.eased('port:' + key, shadowCover(place.x, place.y, x, y, r, starX, starY), state);
        // Running lights: the whole station's wash, breathing slowly.
        const breath = 0.85 + 0.15 * Math.sin(now * 1.3 + phase);
        this.portWash(paint.washLit, size, breath * (1 - cover));
        this.portWash(paint.washDark, size, breath * cover);
        ctx.globalAlpha = 1;
        // The station turns about its hub on the wall clock alone.
        ctx.rotate(now * 0.25 + phase);
        const loaded = this.artImage(art);
        if (loaded && loaded.ready) {
            const sprite = this.sprite(art, loaded.image, size * 2 * this.dpr);
            if (sprite) {
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                // The dark hull is the lit one shaded, so laid over it at the cover it fades without a seam.
                if (cover < 0.995) ctx.drawImage(sprite.lit, ox - size, oy - sizeY, size * 2, sizeY * 2);
                if (cover > 0.005) {
                    ctx.globalAlpha = cover < 0.995 ? cover : 1;
                    ctx.drawImage(sprite.dark, ox - size, oy - sizeY, size * 2, sizeY * 2);
                    ctx.globalAlpha = 1;
                }
            }
        }
        // The hub's own glow, pulsing, over the painted core.
        ctx.globalCompositeOperation = 'lighter';
        const hub = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.3);
        hub.addColorStop(0, paint.hub[0]);
        hub.addColorStop(0.45, paint.hub[1]);
        hub.addColorStop(1, paint.hub[2]);
        ctx.globalAlpha = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(now * 2.1 + phase));
        ctx.fillStyle = hub;
        ctx.fillRect(-size * 0.3, -size * 0.3, size * 0.6, size * 0.6);
        // Navigation lights: red to port, green to starboard, blinking in turn.
        const blink = Math.floor(now * 1.2 + phase) % 2;
        for (const [nx, ny] of art.nav) {
            const starboard = nx - art.pivot[0] > 0;
            this.lamp(nx * size + ox, ny * sizeY + oy, lampR, starboard ? theme.portStarboard : theme.portPort, starboard ? blink === 0 : blink === 1);
        }
        // Anti-collision strobes: a white double flash every second and a half; steady with motion reduced.
        const cycle = (now + phase * 0.3) % 1.5;
        const flash = !now || cycle < 0.07 || (cycle > 0.18 && cycle < 0.25);
        if (flash) for (const [nx, ny] of art.strobe) this.lamp(nx * size + ox, ny * sizeY + oy, lampR, theme.portStrobe, true);
        ctx.restore();
    }

    /** The station's wash of running lights at one strength; nothing is painted for a share too faint to see. */
    private portWash(stops: [string, string, string], size: number, alpha: number): void {
        if (!(alpha > 0.004)) return;
        const ctx = this.ctx;
        const wash = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 2.6);
        wash.addColorStop(0, stops[0]);
        wash.addColorStop(0.5, stops[1]);
        wash.addColorStop(1, stops[2]);
        ctx.globalAlpha = Math.min(1, alpha);
        ctx.fillStyle = wash;
        ctx.fillRect(-size * 2.6, -size * 2.6, size * 5.2, size * 5.2);
    }

    /** js/system_viewer.js:4500-4508. */
    private lamp(x: number, y: number, r: number, paint: [string, string, string], on: boolean): void {
        const ctx = this.ctx;
        ctx.globalAlpha = on ? 1 : 0.22;
        const halo = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
        halo.addColorStop(0, paint[0]);
        halo.addColorStop(1, paint[1]);
        ctx.fillStyle = halo;
        ctx.fillRect(x - r * 2.6, y - r * 2.6, r * 5.2, r * 5.2);
        ctx.fillStyle = paint[2];
        ctx.beginPath();
        ctx.arc(x, y, r, 0, TAU);
        ctx.fill();
    }

    // ---- Selection -------------------------------------------------------------------------

    /** js/system_viewer.js:2199-2347: the lock on the selected body, and its tag. */
    private selection(plan: Plan, picture: Picture, state: DrawState): void {
        const hit: Hit | null = hitOf(picture, state.selected);
        if (!hit) {
            if (!state.selected) this.lockKey = null;
            return;
        }
        const ctx = this.ctx;
        const theme = this.theme;
        const now = state.time;
        const dim = this.lockDim;
        if (this.lockKey !== hit.key) {
            this.lockKey = hit.key;
            this.lockStart = now;
            this.lockLabel = selectionLabel(bodyOf(plan, hit.key) || {});
        }
        const lockMs = theme.tLock * 1000;
        const k = state.motion && lockMs > 0 ? Math.min(1, (now - this.lockStart) / lockMs) : 1;
        const easeOut = 1 - Math.pow(1 - k, 3);
        // A slight overshoot as the brackets land.
        const snap = state.motion ? 1 + 2.4 * Math.pow(k - 1, 3) + 1.4 * Math.pow(k - 1, 2) : 1;
        const time = state.motion ? now / 1000 : 0;
        let cx = hit.cx;
        let cy = hit.cy;
        let R = (hit.visualR ?? hit.r) + 5;
        ctx.save();
        ctx.strokeStyle = theme.lock;
        if (hit.innerR !== undefined) {
            // A belt runs the whole way round: the lock sits on one point of it and its edges are traced.
            const mid = (hit.r + hit.innerR) / 2;
            let angle = -Math.PI / 2;
            if (cy - mid < -20) angle = Math.atan2(this.h / 2 - cy, this.w / 2 - cx);
            ctx.globalAlpha = 0.55 * easeOut * dim;
            ctx.lineWidth = 1;
            if (hit.innerR > 2) this.strokeVisible(cx, cy, hit.innerR, 1);
            if (hit.r > 2) this.strokeVisible(cx, cy, hit.r, 1);
            cx += Math.cos(angle) * mid;
            cy += Math.sin(angle) * mid;
            R = Math.max(9, (hit.r - hit.innerR) / 2 + 4);
        }
        if (this.offCanvas(cx, cy, R * 2 + 300)) {
            ctx.restore();
            return;
        }
        // Glow under the lock.
        const glow = ctx.createRadialGradient(cx, cy, R * 0.9, cx, cy, R + 22);
        glow.addColorStop(0, theme.lockGlow[0]);
        glow.addColorStop(1, theme.lockGlow[1]);
        ctx.globalAlpha = easeOut * dim;
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(cx, cy, R + 22, 0, TAU);
        ctx.arc(cx, cy, R * 0.9, 0, TAU, true);
        ctx.fill();
        // The ring draws itself on.
        ctx.globalAlpha = 0.95 * dim;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(cx, cy, R, -Math.PI / 2, -Math.PI / 2 + TAU * easeOut);
        ctx.stroke();
        // Range scale: 72 ticks, every sixth long, turning slowly, with gaps where the brackets sit.
        const scaleR = R + 8;
        const turn = time * 0.12;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.5 * easeOut * dim;
        ctx.beginPath();
        for (let i = 0; i < 72; i++) {
            const a = turn + i * Math.PI / 36;
            const fromBracket = Math.abs(((a - Math.PI / 4) % (Math.PI / 2) + Math.PI / 2) % (Math.PI / 2) - Math.PI / 4);
            if (fromBracket < 0.22) continue;
            const len = i % 6 === 0 ? 5 : 2.5;
            ctx.moveTo(cx + Math.cos(a) * scaleR, cy + Math.sin(a) * scaleR);
            ctx.lineTo(cx + Math.cos(a) * (scaleR + len), cy + Math.sin(a) * (scaleR + len));
        }
        ctx.stroke();
        // Three counter-rotating arcs further out.
        const arcR = R + 17;
        ctx.strokeStyle = theme.signal;
        ctx.globalAlpha = 0.55 * easeOut * dim;
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const a = -time * 0.35 + i * TAU / 3;
            ctx.beginPath();
            ctx.arc(cx, cy, arcR, a, a + 0.75);
            ctx.stroke();
        }
        // Brackets swing in from wide and a quarter-turn round, then breathe.
        const breathe = k >= 1 && state.motion ? Math.sin(time * 2.4) * 1.2 : 0;
        const bracketR = (R + 4) * (1 + 1.1 * (1 - snap)) + breathe;
        const spin = (1 - easeOut) * Math.PI / 2;
        const arm = Math.max(5, Math.min(12, R * 0.35));
        ctx.strokeStyle = theme.lock;
        ctx.globalAlpha = Math.min(1, 0.2 + easeOut) * dim;
        ctx.lineWidth = 2;
        ctx.lineCap = 'square';
        for (let i = 0; i < 4; i++) {
            const a = Math.PI / 4 + i * Math.PI / 2 + spin;
            const bx = cx + Math.cos(a) * bracketR * Math.SQRT2 * 0.78;
            const by = cy + Math.sin(a) * bracketR * Math.SQRT2 * 0.78;
            const ax = Math.sign(-Math.cos(a)) || 1;
            const ay = Math.sign(-Math.sin(a)) || 1;
            ctx.save();
            ctx.translate(bx, by);
            ctx.rotate(spin);
            ctx.beginPath();
            ctx.moveTo(ax * arm, 0);
            ctx.lineTo(0, 0);
            ctx.lineTo(0, ay * arm);
            ctx.stroke();
            ctx.restore();
        }
        ctx.lineCap = 'butt';
        // Cardinal notches pointing in.
        ctx.globalAlpha = 0.8 * easeOut * dim;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            ctx.moveTo(cx + Math.cos(a) * (R + 3), cy + Math.sin(a) * (R + 3));
            ctx.lineTo(cx + Math.cos(a) * (R + 7), cy + Math.sin(a) * (R + 7));
        }
        ctx.stroke();
        // The readout tag, up and to the right on a leader (left, near the edge); orbits layout only (2311).
        if (k > 0.35 && picture.mode === 'orbits') {
            const [name, detail] = this.lockLabel;
            const show = Math.min(1, (k - 0.35) / 0.4);
            const nameFont = '700 11px ' + theme.fontCode;
            const detailFont = '10px ' + theme.fontCode;
            ctx.font = nameFont;
            const nameW = ctx.measureText(name.toUpperCase()).width;
            ctx.font = detailFont;
            const detailW = detail ? ctx.measureText(detail).width : 0;
            const w = Math.max(nameW, detailW) + 16;
            const h = detail ? 34 : 20;
            const corner = (arcR + 2) * Math.SQRT1_2;
            const flip = cx + corner + 22 + w > this.w - 8;
            const dir = flip ? -1 : 1;
            const ex = cx + dir * corner;
            const ey = cy - corner;
            const kx = ex + dir * 14;
            const ky = ey - 14;
            const tx = flip ? kx - 8 - w : kx + 8;
            const ty = ky - h / 2;
            ctx.globalAlpha = show * 0.75 * dim;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(ex, ey);
            ctx.lineTo(kx, ky);
            ctx.lineTo(kx + dir * 8, ky);
            ctx.stroke();
            ctx.globalAlpha = show * dim;
            ctx.fillStyle = theme.tag;
            ctx.beginPath();
            ctx.roundRect(tx, ty, w, h, 3);
            ctx.fill();
            ctx.globalAlpha = show * 0.8 * dim;
            ctx.stroke();
            ctx.globalAlpha = show * dim;
            ctx.fillStyle = theme.lock;
            ctx.fillRect(flip ? tx + w - 3 : tx, ty, 3, h);
            ctx.textBaseline = 'alphabetic';
            ctx.font = nameFont;
            ctx.fillText(name.toUpperCase(), tx + 8, ty + 14);
            if (detail) {
                ctx.font = detailFont;
                ctx.fillStyle = theme.signal;
                ctx.globalAlpha = show * 0.95 * dim;
                ctx.fillText(detail, tx + 8, ty + 28);
            }
        }
        ctx.restore();
        this.pulse(cx, cy, R, state);
    }

    /**
     * js/system_viewer.js:2104-2185: the scan view. A slow sweep round the primary (orbits
     * layout only), and on every world and moon a ring with four turning marks that
     * brightens as the sweep passes; in the orbits layout, its designation on a short leader.
     */
    private scan(plan: Plan, picture: Picture, state: DrawState): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const now = state.motion ? state.time / 1000 : 0;
        const period = theme.tSweep > 0 ? theme.tSweep : 8;
        const sweep = ((now / period) % 1) * TAU;
        const centre = picture.centre;
        if (this.scanPlan !== plan) {
            this.scanPlan = plan;
            this.scanLabels.clear();
        }
        ctx.save();
        ctx.strokeStyle = theme.signal;
        ctx.fillStyle = theme.signal;
        if (centre && state.motion) {
            // The sweep: a soft wedge trailing a bright leading edge.
            const trail = 0.7;
            const wedge = ctx.createConicGradient(sweep - trail, centre.x, centre.y);
            wedge.addColorStop(0, theme.scanWedge[0]);
            wedge.addColorStop(trail / TAU, theme.scanWedge[1]);
            wedge.addColorStop(trail / TAU + 0.0005, theme.scanWedge[0]);
            wedge.addColorStop(1, theme.scanWedge[0]);
            ctx.fillStyle = wedge;
            ctx.fillRect(0, 0, this.w, this.h);
            ctx.fillStyle = theme.signal;
            const reach = Math.hypot(Math.max(centre.x, this.w - centre.x), Math.max(centre.y, this.h - centre.y));
            ctx.globalAlpha = 0.22 * this.scanFade;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(centre.x, centre.y);
            ctx.lineTo(centre.x + Math.cos(sweep) * reach, centre.y + Math.sin(sweep) * reach);
            ctx.stroke();
        }
        ctx.font = '600 10px ' + theme.fontCode;
        ctx.textBaseline = 'alphabetic';
        for (const hit of picture.hits) {
            if ((hit.kind !== 'world' && hit.kind !== 'moon') || hit.innerR !== undefined) continue;
            const { cx, cy } = hit;
            const visual = hit.visualR ?? hit.r;
            if (cx < -40 || cy < -40 || cx > this.w + 40 || cy > this.h + 40) continue;
            const moon = hit.kind === 'moon';
            const body = bodyOf(plan, hit.key);
            const main = !!body && body.type === 'Mainworld';
            // Brighten as the sweep passes, then fade over a second or so.
            let ping = 0;
            if (centre && state.motion) {
                const since = ((sweep - Math.atan2(cy - centre.y, cx - centre.x)) % TAU + TAU) % TAU;
                ping = Math.exp(-since * 2.2);
            }
            const alpha = Math.min(1, (moon ? 0.42 : 0.68) + (main ? 0.2 : 0) + ping * 0.45);
            // A moon too small to show detail gets a quiet ring, so a crowded moon system stays readable.
            if (moon && visual < 2.5 && !main) {
                ctx.globalAlpha = alpha * 0.55 * this.scanFade;
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.arc(cx, cy, 4 + ping * 2, 0, TAU);
                ctx.stroke();
                continue;
            }
            const R = Math.max(visual + 5, moon ? 7 : 9) + ping * 3;
            ctx.globalAlpha = alpha * 0.32 * this.scanFade;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.arc(cx, cy, R, 0, TAU);
            ctx.stroke();
            ctx.globalAlpha = alpha * this.scanFade;
            ctx.lineWidth = main ? 2 : 1.5;
            const turn = now * (moon ? 0.5 : 0.3) + (cx * 0.013 + cy * 0.007);
            for (let k = 0; k < 4; k++) {
                const a = turn + k * Math.PI / 2;
                ctx.beginPath();
                ctx.arc(cx, cy, R + 3, a - 0.3, a + 0.3);
                ctx.stroke();
            }
            if (picture.mode !== 'orbits' || (moon && R < 12)) continue;
            // Designation up and to the right, on a short leader.
            let label = this.scanLabels.get(hit.key);
            if (label === undefined) {
                label = body ? shortLabel(String(body.name || body.type || ''), plan.name) : '';
                this.scanLabels.set(hit.key, label);
            }
            const corner = (R + 3) * Math.SQRT1_2;
            const lx = cx + corner + 6;
            const ly = cy - corner - 6;
            ctx.lineWidth = 1;
            ctx.globalAlpha = alpha * 0.55 * this.scanFade;
            ctx.beginPath();
            ctx.moveTo(cx + corner, cy - corner);
            ctx.lineTo(lx - 2, ly + 3);
            ctx.stroke();
            ctx.globalAlpha = Math.min(1, alpha + 0.1) * this.scanFade;
            ctx.fillText(label, lx, ly);
        }
        ctx.restore();
    }

    /** js/system_viewer.js:3021-3037. Two pings, a little apart, every beat. */
    private pulse(cx: number, cy: number, baseR: number, state: DrawState): void {
        const beat = this.theme.tPulse * 1000;
        if (!state.motion || !(beat > 0)) return;
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = this.theme.signal;
        for (const offset of [0, 0.22]) {
            const t = ((state.time / beat) + 1 - offset) % 1;
            if (t > 0.6) continue;
            const ease = 1 - Math.pow(1 - t / 0.6, 3);
            ctx.globalAlpha = (1 - ease) * (offset ? 0.35 : 0.6) * this.lockDim;
            ctx.lineWidth = offset ? 1 : 1.5;
            ctx.beginPath();
            ctx.arc(cx, cy, baseR + 4 + ease * (baseR * 0.8 + 26), 0, TAU);
            ctx.stroke();
        }
        ctx.restore();
    }

    /**
     * Starts a jump bubble on the frame the ship enters jump or arrives, and drops it before
     * the frame where it has finished, so that frame is the settled one. The first paint only
     * records the ships. Reduced motion, or a theme without --ease-out, snaps. Leaving takes
     * --t-long; arriving takes --t-slow. A scrub back across the same moment reverses it.
     */
    private beginBubbles(state: DrawState): void {
        this.bubbleFrame = [];
        const ease = this.theme.easeOut;
        const phases = new Map<string, { phase: JumpPhase; mark: ShipMark }>();
        for (const mark of state.ships ?? []) phases.set(mark.id, { phase: mark.jump ?? 'mark', mark });
        if (!state.motion || !ease) {
            this.bubbleRuns.clear();
            this.seenShips = new Map([...phases].map(([id, row]) => [id, row.phase]));
            this.seenShipDays = state.days;
            return;
        }
        if (!this.seenShips || this.seenShipDays === null) {
            this.seenShips = new Map([...phases].map(([id, row]) => [id, row.phase]));
            this.seenShipDays = state.days;
            return;
        }
        const forward = state.days >= this.seenShipDays;
        const seen = this.seenShips;
        const ids = new Set<string>([...seen.keys(), ...phases.keys()]);
        for (const id of ids) {
            const prev: JumpPhase | 'absent' = seen.get(id) ?? 'absent';
            const row = phases.get(id);
            const cur: JumpPhase | 'absent' = row ? row.phase : 'absent';
            if (prev === cur) continue;
            const moment = this.bubbleMoment(prev, cur, forward);
            if (!moment || !row && moment.to === 1) continue;
            const mark = row ? row.mark : this.bubbleRuns.get(id)?.mark;
            if (!mark) continue;
            this.startBubble(id, moment.kind, moment.to, mark, state.time, ease);
        }
        this.seenShips = new Map([...phases].map(([id, row]) => [id, row.phase]));
        this.seenShipDays = state.days;
        for (const [id, run] of this.bubbleRuns) {
            const u = (state.time - run.t0) / 1000 / run.seconds;
            if (u >= 1) {
                this.bubbleRuns.delete(id);
                continue;
            }
            const live = phases.get(id);
            if (live) run.mark = live.mark;
            this.layersBusy = true;
            this.bubbleFrame.push({
                id, kind: run.kind, mark: run.mark,
                share: this.shareAt(run, Math.max(0, u), ease),
            });
        }
    }

    /** Which bubble a phase change is, or null when nothing on the picture changed. */
    private bubbleMoment(
        prev: JumpPhase | 'absent',
        cur: JumpPhase | 'absent',
        forward: boolean,
    ): { kind: 'out' | 'in'; to: number } | null {
        if (cur === 'out' && (prev === 'mark' || prev === 'absent') && forward) return { kind: 'out', to: 1 };
        if (prev === 'out' && cur === 'mark' && !forward) return { kind: 'out', to: 0 };
        if (cur === 'mark' && prev === 'in' && forward) return { kind: 'in', to: 1 };
        if (cur === 'mark' && prev === 'out' && forward) return { kind: 'in', to: 1 };
        if (prev === 'mark' && cur === 'in' && !forward) return { kind: 'in', to: 0 };
        if (prev === 'mark' && cur === 'out' && !forward) return { kind: 'in', to: 0 };
        return null;
    }

    private bubbleSeconds(kind: 'out' | 'in'): number | null {
        const raw = kind === 'out' ? this.theme.tLong : this.theme.tSlow;
        return typeof raw === 'number' && raw > 0 ? raw : null;
    }

    private startBubble(
        id: string,
        kind: 'out' | 'in',
        to: number,
        mark: ShipMark,
        now: number,
        ease: EaseOut,
    ): void {
        const seconds = this.bubbleSeconds(kind);
        if (seconds === null) return;
        const prev = this.bubbleRuns.get(id);
        const from = prev && prev.kind === kind ? this.runShare(prev, now, ease) : (to === 1 ? 0 : 1);
        this.bubbleRuns.set(id, { from, to, t0: now, seconds, kind, mark });
    }

    // ---- Ships -----------------------------------------------------------------------------

    /**
     * Sensor designators after the bodies. The shape is a fixed pixel wireframe,
     * so a zoom that rebuilds the picture does not grow the stroke. A jump report is
     * not drawn; the bubble for that moment is drawn in its place while it runs.
     */
    /** True for this frame when D's tags name the ships, so the canvas draws no name. */
    private shipTags = false;

    private ships(marks: readonly ShipMark[] | undefined, hits: readonly Hit[], dockTag: boolean): void {
        const bubbling = new Set<string>();
        for (const bubble of this.bubbleFrame) {
            bubbling.add(bubble.id);
            this.paintBubble(bubble.mark, bubble.kind, bubble.share);
        }
        if (!marks || marks.length === 0) return;
        for (const mark of marks) {
            if (bubbling.has(mark.id) || mark.jump) continue;
            const at = this.beside(mark, marks, hits);
            if (!this.shipTags && dockTag && at !== mark) continue;
            this.paintDesignator(at === mark ? mark : { ...mark, x: at.x, y: at.y }, 1, 1);
        }
    }

    /**
     * A docked or orbiting ship is drawn down and to the right of the body's centre,
     * one disc-radius plus 16 px clear of the name above the disc, and further ships
     * at that body step 20 px along that same diagonal in id order.
     * A mark within 1.5 px of a star, world, or moon counts. A ship under way, and a
     * jump, stay on the mark. The stored mark is not moved.
     */
    private beside(mark: ShipMark, marks: readonly ShipMark[], hits: readonly Hit[]): { x: number; y: number } {
        if (typeof mark.heading === 'number') return mark;
        const limit = 1.5;
        let hit: Hit | null = null;
        let best = limit * limit;
        for (const item of hits) {
            if (item.kind !== 'star' && item.kind !== 'world' && item.kind !== 'moon') continue;
            const d = (mark.x - item.cx) ** 2 + (mark.y - item.cy) ** 2;
            if (d <= best) {
                best = d;
                hit = item;
            }
        }
        if (!hit) return mark;
        const centre = hit;
        const crowd = marks.filter((other) => {
            if (other.jump || typeof other.heading === 'number') return false;
            return (other.x - centre.cx) ** 2 + (other.y - centre.cy) ** 2 <= limit * limit;
        });
        crowd.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
        const index = Math.max(0, crowd.findIndex((item) => item.id === mark.id));
        return dockedBeside({ x: centre.cx, y: centre.cy }, centre.visualR ?? centre.r, index);
    }

    /** The leaving bubble swells and fades. The arriving bubble shows first, then yields the designator. */
    private paintBubble(mark: ShipMark, kind: 'out' | 'in', share: number): void {
        const s = Math.min(1, Math.max(0, share));
        let designatorAlpha = 0;
        let designatorScale = 1;
        let bubbleAlpha = 0;
        let bubbleRadius = 0;
        if (kind === 'out') {
            designatorAlpha = 1 - s;
            designatorScale = 1 + s * 0.45;
            bubbleAlpha = Math.sin(Math.PI * s);
            bubbleRadius = 8 + s * 28;
        } else {
            const rise = s < 0.45 ? s / 0.45 : 1;
            const fall = s < 0.45 ? 0 : (s - 0.45) / 0.55;
            bubbleAlpha = rise * (1 - fall);
            bubbleRadius = 36 - fall * 26;
            designatorAlpha = fall;
            designatorScale = 0.4 + fall * 0.6;
        }
        if (bubbleAlpha > 0 && !this.offCanvas(mark.x, mark.y, bubbleRadius + 4)) {
            const ctx = this.ctx;
            ctx.save();
            ctx.translate(mark.x, mark.y);
            ctx.strokeStyle = this.theme.attention;
            ctx.lineWidth = 1;
            ctx.lineCap = 'butt';
            ctx.setLineDash([]);
            ctx.globalAlpha = bubbleAlpha;
            ctx.beginPath();
            ctx.arc(0, 0, bubbleRadius, 0, TAU);
            ctx.stroke();
            ctx.globalAlpha = bubbleAlpha * 0.65;
            ctx.beginPath();
            ctx.arc(0, 0, bubbleRadius * 0.62, 0, TAU);
            ctx.stroke();
            ctx.restore();
        }
        this.paintDesignator(mark, designatorAlpha, designatorScale);
    }

    /** One designator and its name. `alpha` 1 and `scale` 1 is the settled stroke. */
    private paintDesignator(mark: ShipMark, alpha: number, scale: number): void {
        if (!(alpha > 0) || this.offCanvas(mark.x, mark.y, 40)) return;
        const ctx = this.ctx;
        const theme = this.theme;
        const colour = mark.kind === 'party' ? theme.signal : mark.kind === 'traffic' ? theme.textMuted : theme.text;
        ctx.save();
        ctx.translate(mark.x, mark.y);
        if (scale !== 1) ctx.scale(scale, scale);
        if (typeof mark.heading === 'number') ctx.rotate(mark.heading);
        ctx.strokeStyle = colour;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1;
        ctx.lineJoin = 'miter';
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        ctx.beginPath();
        this.designator(mark.shape);
        ctx.stroke();
        ctx.restore();
        if (this.shipTags) return;
        ctx.save();
        ctx.fillStyle = colour;
        ctx.globalAlpha = alpha;
        ctx.font = '10px ' + theme.fontText;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(mark.name, mark.x + 12, mark.y);
        ctx.restore();
    }

    /** One closed wireframe. Drawn in a context already centred on the mark. */
    private designator(shape: ShipShape): void {
        const ctx = this.ctx;
        if (shape === 'triangle') {
            ctx.moveTo(8, 0);
            ctx.lineTo(-6, 5);
            ctx.lineTo(-6, -5);
            ctx.closePath();
            return;
        }
        if (shape === 'circle') {
            ctx.arc(0, 0, 6, 0, TAU);
            return;
        }
        if (shape === 'square') {
            ctx.rect(-5, -5, 10, 10);
            return;
        }
        ctx.rect(-9, -4, 18, 8);
    }

    /**
     * Ghosts of where the bodies will be (findings/plot_ghosts_design.md §2, §3).
     * A run starts on the frame the preview changes. The first paint only records it.
     * Reduced motion, or a missing duration, snaps. Arrive takes --t-base and opens
     * along the arc. A change of hours slides over --t-fast. Leaving fades over --t-fast.
     * The clock moving both dates together does not start a run: the ghosts just stand
     * where the new dates put them.
     */
    private beginGhosts(state: DrawState): void {
        const course = this.courseLegs(state);
        if (course) {
            this.beginCourse(state, course);
            return;
        }
        if (this.ways.size > 0) this.beginCourse(state, null);
        const preview = this.livePreview(state);
        const span = preview ? preview.arrives - preview.departs : 0;
        const key = preview ? (preview.toKey || this.pointKey(preview.point)) : '';
        const ease = this.theme.easeOut;
        this.ghostShare = preview ? 1 : 0;
        this.ghostKind = preview ? 'show' : 'out';
        if (!state.motion || !ease) {
            this.ghostRun = null;
            this.ghostReady = true;
            this.ghostKey = key;
            this.ghostSpan = span;
            this.lockDim = preview ? 0.5 : 1;
            return;
        }
        if (!this.ghostReady) {
            this.ghostReady = true;
            this.ghostKey = key;
            this.ghostSpan = span;
            this.lockDim = preview ? 0.5 : 1;
            return;
        }
        const same = key === this.ghostKey && Math.abs(span - this.ghostSpan) < 1e-9;
        if (!same) {
            const kind: 'in' | 'move' | 'out' = !preview ? 'out' : (this.ghostKey && key === this.ghostKey ? 'move' : 'in');
            const seconds = kind === 'in' ? this.baseSeconds() : this.fastSeconds();
            if (kind === 'move') this.ghostLatch = new Map(this.ghostLast.map((spec) => [spec.key, { x: spec.then.x, y: spec.then.y }]));
            if (seconds) {
                const from = this.ghostRun ? this.runShare(this.ghostRun, state.time, ease) : (kind === 'out' ? 1 : 0);
                this.ghostRun = { from, to: kind === 'out' ? 0 : 1, t0: state.time, seconds, kind };
            } else {
                this.ghostRun = null;
            }
            this.ghostKey = key;
            this.ghostSpan = span;
        }
        if (this.ghostRun) {
            const u = (state.time - this.ghostRun.t0) / 1000 / this.ghostRun.seconds;
            if (u >= 1) {
                this.ghostShare = this.ghostRun.to;
                this.ghostKind = this.ghostRun.kind === 'out' ? 'out' : 'show';
                this.ghostRun = null;
            } else {
                this.ghostShare = this.shareAt(this.ghostRun, Math.max(0, u), ease);
                this.ghostKind = this.ghostRun.kind;
                this.layersBusy = true;
            }
        }
        this.lockDim = preview || this.ghostShare > 0 ? 0.5 : 1;
        if (this.ways.size > 0) this.lockDim = 0.5;
    }

    private pointKey(point: { x: number; y: number } | undefined): string {
        if (!point) return '';
        return 'point:' + point.x + ',' + point.y;
    }

    /** A course is an array. A one-leg object is not, and the checker keeps the two apart. */
    private isCourse(preview: FlightPreview): preview is readonly CourseLeg[] {
        return Array.isArray(preview);
    }

    /** The one-leg preview. A course of two or more legs is handled apart from this. */
    private livePreview(state: DrawState): CourseLeg | null {
        const preview = state.preview;
        if (!preview) return null;
        if (this.isCourse(preview)) {
            const legs = this.legList(preview);
            return legs.length === 1 ? legs[0] : null;
        }
        if (!(preview.arrives > preview.departs)) return null;
        if (!preview.toKey && !preview.point) return null;
        return preview;
    }

    /** An ordered course. One leg, and the one-leg object, stay on the single-leg path. */
    private courseLegs(state: DrawState): CourseLeg[] | null {
        const preview = state.preview;
        if (!preview || !this.isCourse(preview)) return null;
        const legs = this.legList(preview);
        return legs.length >= 2 ? legs : null;
    }

    private legList(preview: readonly CourseLeg[]): CourseLeg[] {
        const legs: CourseLeg[] = [];
        for (const leg of preview) {
            if (!leg || !(leg.arrives > leg.departs)) continue;
            if (!leg.toKey && !leg.point) continue;
            legs.push(leg);
        }
        return legs;
    }

    /** Stable id for a waypoint: its end, and which visit that is when the course repeats an end. */
    private wayId(legs: readonly CourseLeg[], index: number): string {
        const end = legs[index].toKey || this.pointKey(legs[index].point) || 'leg';
        let n = 0;
        for (let i = 0; i < index; i++) {
            const other = legs[i].toKey || this.pointKey(legs[i].point) || 'leg';
            if (other === end) n += 1;
        }
        return end + '#' + n;
    }

    /**
     * A waypoint added fades in over --t-base. One removed leaves over --t-fast.
     * The first paint records the course and does not run. Reduced motion snaps.
     * A clock that moves every leg's two dates together does not start a run.
     */
    private beginCourse(state: DrawState, legs: readonly CourseLeg[] | null): void {
        const list = legs ?? [];
        const ease = this.theme.easeOut;
        const next = new Map<string, number>();
        for (let i = 0; i < list.length; i++) next.set(this.wayId(list, i), list[i].arrives - list[i].departs);
        if (!state.motion || !ease || !this.ghostReady) {
            this.ghostReady = true;
            const keep = new Map<string, WaySlot>();
            for (const [id, span] of next) {
                const prev = this.ways.get(id);
                keep.set(id, {
                    span,
                    share: 1,
                    run: null,
                    spec: prev ? prev.spec : null,
                    drawn: prev ? prev.drawn : null,
                });
            }
            this.ways = keep;
            this.lockDim = list.length > 0 ? 0.5 : 1;
            return;
        }
        for (const [id, span] of next) {
            const prev = this.ways.get(id);
            if (!prev) {
                const seconds = this.baseSeconds();
                this.ways.set(id, {
                    span,
                    share: 1,
                    run: seconds ? { from: 0, to: 1, t0: state.time, seconds, kind: 'in' } : null,
                    spec: null,
                    drawn: null,
                });
                continue;
            }
            if (Math.abs(prev.span - span) >= 1e-9 && (!prev.run || prev.run.kind === 'move')) {
                const seconds = this.fastSeconds();
                if (seconds) prev.run = { from: 0, to: 1, t0: state.time, seconds, kind: 'move' };
            }
            prev.span = span;
        }
        const gone: string[] = [];
        for (const [id, slot] of this.ways) {
            if (next.has(id)) continue;
            if (!slot.run || slot.run.kind !== 'out') {
                const seconds = this.fastSeconds();
                if (!seconds) {
                    gone.push(id);
                    continue;
                }
                slot.run = { from: slot.share, to: 0, t0: state.time, seconds, kind: 'out' };
            }
        }
        for (const id of gone) this.ways.delete(id);
        const finished: string[] = [];
        for (const [id, slot] of this.ways) {
            if (!slot.run) {
                if (next.has(id)) slot.share = 1;
                continue;
            }
            const u = (state.time - slot.run.t0) / 1000 / slot.run.seconds;
            if (u >= 1) {
                slot.share = slot.run.to;
                const kind = slot.run.kind;
                slot.run = null;
                if (kind === 'out') finished.push(id);
            } else {
                slot.share = this.shareAt(slot.run, Math.max(0, u), ease);
                this.layersBusy = true;
            }
        }
        for (const id of finished) this.ways.delete(id);
        this.lockDim = list.length > 0 || this.ways.size > 0 ? 0.5 : 1;
    }

    private baseSeconds(): number | null {
        const raw = this.theme.tBase;
        return typeof raw === 'number' && raw > 0 ? raw : null;
    }

    /** --t-fast, from the canvas. Null in a test theme or when the token is missing. */
    private fastSeconds(): number | null {
        if (this.fastSecondsCache !== undefined) return this.fastSecondsCache;
        let seconds: number | null = null;
        const canvas = this.ctx.canvas;
        if (canvas && typeof getComputedStyle === 'function') {
            try {
                const n = cssSeconds(getComputedStyle(canvas).getPropertyValue('--t-fast'));
                if (n > 0) seconds = n;
            } catch {
                seconds = null;
            }
        }
        this.fastSecondsCache = seconds;
        return seconds;
    }

    /** Waypoint centres, in order, for the flight line. One leg returns that one centre. */
    private paintGhosts(plan: Plan, picture: Picture, view: View, state: DrawState): GhostSpot | readonly GhostSpot[] | null {
        if (picture.mode !== 'orbits') return null;
        this.previewPart = this.partIndex(state);
        const legs = this.courseLegs(state);
        if (legs || this.ways.size > 0) return this.paintCourse(plan, view, state.days, legs, this.previewPart);
        if (this.previewPart >= 1) return null;
        const preview = this.livePreview(state);
        if (!preview) {
            if (this.ghostLast.length > 0 && this.ghostShare > 0) this.drawGhosts(this.ghostLast, 'out');
            if (!(this.ghostShare > 0)) this.ghostLast = [];
            return null;
        }
        const specs = preview.toKey ? this.ghostSpecs(plan, view, state.days, preview) : [];
        const drawn = this.drawGhosts(specs, this.ghostKind);
        this.ghostLast = drawn;
        const dest = drawn.find((spec) => spec.dest);
        if (dest) return dest.then;
        if (preview.point) return this.paintPointTarget(plan, view, state.days, preview);
        return null;
    }

    /** A small target at a point, in the destination's style. A point needs no ghost. */
    private paintPointTarget(plan: Plan, view: View, days: number, preview: CourseLeg): GhostSpot | null {
        if (!preview.point) return null;
        const at = pictureOfAu(preview.point, view, plan, 'orbits');
        if (!at) return null;
        const label = preview.tag || pointWords(plan, preview.point, days);
        const spec: GhostSpec = {
            key: 'point',
            dest: true,
            label,
            now: at,
            then: at,
            r: 8,
            cx: at.x,
            cy: at.y,
            sweep: 0,
        };
        this.strokeGhost(spec, spec, 'show', 1);
        if (label) this.ghostTag(spec, 1);
        return at;
    }

    private ghostSpecs(plan: Plan, view: View, days: number, preview: CourseLeg): GhostSpec[] {
        const now = this.ghostBodies(layoutScene(plan, view, days));
        const then = this.ghostBodies(layoutScene(plan, view, preview.arrives));
        const specs: GhostSpec[] = [];
        for (const future of then.values()) {
            const present = now.get(future.key);
            if (!present) continue;
            const dest = future.key === preview.toKey;
            if (!dest && future.kind !== 'world') continue;
            if (dest && future.kind !== 'world' && future.kind !== 'moon') continue;
            const moved = Math.hypot(present.x - future.x, present.y - future.y);
            if (!dest && moved < Math.max(8, 1.5 * present.r)) continue;
            const sweep = future.period > 0 ? bodyAngle(future.epoch, future.period, preview.arrives) - bodyAngle(future.epoch, future.period, preview.departs) : 0;
            const label = dest
                ? (preview.tag || shortLabel(future.name, plan.name) + ' \u00B7 ' + whenWords(preview.arrives))
                : '';
            specs.push({
                key: future.key,
                dest,
                label,
                now: { x: present.x, y: present.y },
                then: { x: future.x, y: future.y },
                r: Math.max(5, future.r + 2.5),
                cx: future.cx,
                cy: future.cy,
                sweep: Number.isFinite(sweep) ? sweep : 0,
            });
        }
        return specs;
    }

    /** Worlds, and moons. A belt is not a point. The centre is the orbit the body is drawn on. */
    private ghostBodies(scene: Scene): Map<string, GhostBody> {
        const out = new Map<string, GhostBody>();
        const take = (set: WorldSet | null): void => {
            if (!set) return;
            for (const at of set.bodies) {
                if (at.world.belt) continue;
                out.set(at.world.key, {
                    key: at.world.key, kind: 'world', name: at.world.name,
                    x: at.x, y: at.y, r: at.r, cx: set.cx, cy: set.cy,
                    epoch: at.world.epoch, period: at.world.period,
                });
                for (const moon of at.moons) {
                    if (moon.moon.ring || !(moon.r > 0)) continue;
                    out.set(moon.moon.key, {
                        key: moon.moon.key, kind: 'moon', name: moon.moon.name,
                        x: moon.x, y: moon.y, r: moon.r, cx: at.x, cy: at.y,
                        epoch: moon.moon.epoch, period: moon.moon.period,
                    });
                }
            }
        };
        take(scene.primary);
        for (const companion of scene.companions) take(companion.set);
        return out;
    }

    /** Draws each ghost and returns the specs with `then` set to the place actually drawn. */
    private drawGhosts(specs: readonly GhostSpec[], kind: 'in' | 'move' | 'out' | 'show'): GhostSpec[] {
        const drawn: GhostSpec[] = [];
        let dest: GhostSpec | null = null;
        for (const spec of specs) {
            const at = this.ghostAt(spec, kind);
            const placed: GhostSpec = { ...spec, then: at };
            drawn.push(placed);
            const alpha = (spec.dest ? 1 : 0.62) * (kind === 'show' || kind === 'move' ? 1 : this.ghostShare);
            if (!(alpha > 0)) continue;
            this.strokeGhost(placed, spec, kind, alpha);
            if (spec.dest) dest = placed;
        }
        if (dest && dest.label && (kind === 'show' || kind === 'move' || this.ghostShare > 0.35)) this.ghostTag(dest, kind === 'show' || kind === 'move' ? 1 : this.ghostShare);
        return drawn;
    }

    /** Where this ghost is drawn. An arrive opens along the arc. A move slides from where it was. Past half a turn, it does not take the short way. */
    private ghostAt(spec: GhostSpec, kind: 'in' | 'move' | 'out' | 'show'): GhostSpot {
        if (kind === 'out' || kind === 'show' || this.ghostShare >= 1) return spec.then;
        if (kind === 'move') {
            const from = this.ghostLatch.get(spec.key) ?? spec.now;
            return this.alongOrbit(from, spec.then, spec.cx, spec.cy, this.ghostShare);
        }
        if (Math.abs(spec.sweep) > Math.PI) return spec.then;
        return this.alongOrbit(spec.now, spec.then, spec.cx, spec.cy, this.ghostShare);
    }

    private alongOrbit(from: GhostSpot, to: GhostSpot, cx: number, cy: number, share: number): GhostSpot {
        const r0 = Math.hypot(from.x - cx, from.y - cy);
        const r1 = Math.hypot(to.x - cx, to.y - cy);
        if (!(r0 > 0) || !(r1 > 0)) return { x: from.x + (to.x - from.x) * share, y: from.y + (to.y - from.y) * share };
        let sweep = Math.atan2(to.y - cy, to.x - cx) - Math.atan2(from.y - cy, from.x - cx);
        while (sweep > Math.PI) sweep -= TAU;
        while (sweep < -Math.PI) sweep += TAU;
        const angle = Math.atan2(from.y - cy, from.x - cx) + sweep * share;
        const radius = r0 + (r1 - r0) * share;
        return { x: cx + radius * Math.cos(angle), y: cy + radius * Math.sin(angle) };
    }

    private strokeGhost(drawn: GhostSpec, spec: GhostSpec, kind: 'in' | 'move' | 'out' | 'show', alpha: number): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const colour = spec.dest ? theme.lock : withAlpha(theme.signal, 0.62);
        const x = drawn.then.x;
        const y = drawn.then.y;
        if (this.offCanvas(x, y, drawn.r + 24)) return;
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = colour;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'miter';
        const arc = Math.abs(spec.sweep) <= Math.PI && Math.abs(spec.sweep) > 1e-3;
        if (arc && kind !== 'out') {
            const end = kind === 'in' ? this.ghostShare : 1;
            if (end > 0) {
                ctx.lineWidth = 1;
                ctx.setLineDash([1, 5]);
                ctx.beginPath();
                const a0 = Math.atan2(spec.now.y - spec.cy, spec.now.x - spec.cx);
                const radius = Math.hypot(spec.then.x - spec.cx, spec.then.y - spec.cy);
                if (radius > 0) {
                    ctx.arc(spec.cx, spec.cy, radius, a0, a0 + spec.sweep * end, spec.sweep < 0);
                    ctx.stroke();
                }
            }
        }
        ctx.lineWidth = spec.dest ? 1.5 : 1;
        ctx.setLineDash(spec.dest ? [] : [3, 3]);
        ctx.beginPath();
        ctx.arc(x, y, drawn.r, 0, TAU);
        ctx.stroke();
        const tick = spec.dest ? 5 : 3;
        ctx.setLineDash([]);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            const a = i * Math.PI / 2;
            ctx.moveTo(x + Math.cos(a) * (drawn.r + 2), y + Math.sin(a) * (drawn.r + 2));
            ctx.lineTo(x + Math.cos(a) * (drawn.r + 2 + tick), y + Math.sin(a) * (drawn.r + 2 + tick));
        }
        ctx.stroke();
        ctx.restore();
    }

    /** The destination's tag: the selection tag's fill, 11px mono, the short name and the arrival. */
    private ghostTag(spec: GhostSpec, alpha: number): void {
        const ctx = this.ctx;
        const theme = this.theme;
        const text = spec.label;
        ctx.save();
        ctx.font = '700 11px ' + theme.fontCode;
        const width = ctx.measureText(text).width + 16;
        const height = 20;
        const corner = spec.r * Math.SQRT1_2;
        const flip = spec.then.x + corner + 22 + width > this.w - 8;
        const dir = flip ? -1 : 1;
        const tx = spec.then.x + dir * (spec.r + 12);
        const ty = spec.then.y - spec.r - 8 - height;
        const left = flip ? tx - width : tx;
        ctx.globalAlpha = alpha * 0.7;
        ctx.strokeStyle = theme.lock;
        ctx.lineWidth = 1;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(spec.then.x + dir * corner, spec.then.y - corner);
        ctx.lineTo(left + (flip ? width : 0), ty + height);
        ctx.stroke();
        ctx.globalAlpha = alpha;
        ctx.fillStyle = theme.tag;
        ctx.beginPath();
        ctx.roundRect(left, ty, width, height, 3);
        ctx.fill();
        ctx.fillStyle = theme.lock;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, left + 8, ty + height / 2);
        ctx.restore();
    }

    /** Hairlines and a readout. This frame only: nothing is added to the picture. A destination replaces the ship-to-pointer line with the line to its ghost. */
    private plot(
        plot: PlotReadout | null | undefined, plan: Plan, picture: Picture, view: View, days: number,
        ghostAt: GhostSpot | readonly GhostSpot[] | null, ships: readonly ShipMark[] | undefined,
        routeAt: readonly GhostSpot[] | null,
    ): void {
        const from = plot && plot.from ? plot.from : this.partyMark(ships);
        if (routeAt && routeAt.length > 0 && from) {
            let cursor: GhostSpot = from;
            for (let i = 0; i < routeAt.length; i += 1) {
                const spot = routeAt[i];
                const index = this.routeDrawn[i] ? this.routeDrawn[i].index : i;
                const dim = this.dimFrom !== null && index >= this.dimFrom;
                this.flightLine(cursor, spot, true, dim);
                cursor = spot;
            }
        }
        if (ghostAt && from) {
            const spots = Array.isArray(ghostAt) ? ghostAt : [ghostAt];
            this.previewDrawn = spots.map((spot, index) => ({ index: this.previewPart + index, x: spot.x, y: spot.y }));
            const join = this.previewPart > 0 ? this.routeDrawn[this.previewPart - 1] : null;
            let cursor: GhostSpot = join ? { x: join.x, y: join.y } : from;
            for (const spot of spots) {
                this.flightLine(cursor, spot, false);
                cursor = spot;
            }
        }
        if (!plot) return;
        const ctx = this.ctx;
        const theme = this.theme;
        ctx.save();
        ctx.strokeStyle = theme.text;
        ctx.globalAlpha = 1;
        ctx.lineWidth = 1;
        ctx.lineCap = 'butt';
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(0, plot.y);
        ctx.lineTo(this.w, plot.y);
        ctx.moveTo(plot.x, 0);
        ctx.lineTo(plot.x, this.h);
        ctx.stroke();
        const text = plotText(plot, {
            plan, view, mode: picture.mode, days, bodies: pictureBodies(picture),
        });
        if (text) {
            ctx.fillStyle = theme.text;
            const nameH = 10;
            ctx.font = '10px ' + theme.fontText;
            const names = this.shipTags ? [] : (ships ?? []).map((mark) => {
                const w = ctx.measureText(mark.name).width;
                return { x: mark.x + 12, y: mark.y - nameH / 2, w, h: nameH };
            });
            ctx.font = '10px ' + theme.fontCode;
            const width = ctx.measureText(text).width;
            const at = readoutPlace(plot, { w: width, h: nameH }, { w: this.w, h: this.h }, names);
            ctx.textAlign = at.align;
            ctx.textBaseline = at.baseline;
            ctx.fillText(text, at.x, at.y);
        }
        ctx.restore();
    }

    /** The party's mark, when the plotting overlay has not named a ship. */
    private partyMark(ships: readonly ShipMark[] | undefined): GhostSpot | null {
        if (!ships) return null;
        const party = ships.find((mark) => mark.kind === 'party' && !mark.jump);
        return party ? { x: party.x, y: party.y } : null;
    }

    /**
     * The course: a line through the waypoints, each body ghosted at its own arrival,
     * each point a target, numbers on the earlier waypoints and the arrival tag on the last.
     * Other worlds ghost at the final arrival (option 1). Returns the waypoint centres in order.
     */
    private paintCourse(plan: Plan, view: View, days: number, legs: readonly CourseLeg[] | null, fromIndex = 0): GhostSpot[] | null {
        const list = legs ?? [];
        const cache = new Map<number, Map<string, GhostBody>>();
        const bodiesAt = (at: number): Map<string, GhostBody> => {
            let found = cache.get(at);
            if (!found) {
                found = this.ghostBodies(layoutScene(plan, view, at));
                cache.set(at, found);
            }
            return found;
        };
        const spots: GhostSpot[] = [];
        const skip = new Set<string>();
        const live = new Set<string>();
        for (let i = 0; i < list.length; i++) {
            const leg = list[i];
            if (leg.toKey) skip.add(leg.toKey);
            const id = this.wayId(list, i);
            live.add(id);
            const slot = this.ways.get(id);
            const last = i === list.length - 1;
            const spec = this.waySpec(plan, view, days, leg, id, bodiesAt, last);
            if (spec && !last) spec.label = String(i + 1);
            if (slot && spec) slot.spec = spec;
            if (i < fromIndex) continue;
            if (!slot || !spec) continue;
            const at = this.paintWay(slot, spec, true);
            if (at) spots.push(at);
        }
        for (const [id, slot] of this.ways) {
            if (live.has(id) || !slot.spec) continue;
            this.paintWay(slot, slot.spec, false);
        }
        if (list.length > 0) {
            const last = list[list.length - 1];
            const ordinary = this.ghostSpecs(plan, view, days, { departs: last.departs, arrives: last.arrives });
            const rest: GhostSpec[] = [];
            for (const spec of ordinary) {
                if (spec.dest || skip.has(spec.key)) continue;
                rest.push(spec);
            }
            this.drawStill(rest);
        }
        return spots.length > 0 ? spots : null;
    }

    /** One waypoint. The last one carries the arrival tag; the earlier ones carry their number. */
    private waySpec(
        plan: Plan,
        view: View,
        days: number,
        leg: CourseLeg,
        id: string,
        bodiesAt: (at: number) => Map<string, GhostBody>,
        last: boolean,
    ): GhostSpec | null {
        if (!leg.toKey && leg.point) {
            const at = pictureOfAu(leg.point, view, plan, 'orbits');
            if (!at) return null;
            const label = last ? (leg.tag || pointWords(plan, leg.point, leg.arrives)) : '';
            return { key: id, dest: true, label: last ? label : '', now: at, then: at, r: 8, cx: at.x, cy: at.y, sweep: 0 };
        }
        if (!leg.toKey) return null;
        const present = bodiesAt(days).get(leg.toKey);
        const future = bodiesAt(leg.arrives).get(leg.toKey);
        if (!present || !future) return null;
        if (future.kind !== 'world' && future.kind !== 'moon') return null;
        const sweep = future.period > 0
            ? bodyAngle(future.epoch, future.period, leg.arrives) - bodyAngle(future.epoch, future.period, leg.departs)
            : 0;
        const label = last
            ? (leg.tag || shortLabel(future.name, plan.name) + ' \u00B7 ' + whenWords(leg.arrives))
            : '';
        return {
            key: id,
            dest: true,
            label,
            now: { x: present.x, y: present.y },
            then: { x: future.x, y: future.y },
            r: Math.max(5, future.r + 2.5),
            cx: future.cx,
            cy: future.cy,
            sweep: Number.isFinite(sweep) ? sweep : 0,
        };
    }

    /** Draws one waypoint and returns where it was drawn. A leaver is not a vertex of the line. */
    private paintWay(slot: WaySlot, spec: GhostSpec, onCourse: boolean): GhostSpot | null {
        const kind: 'in' | 'move' | 'out' | 'show' = slot.run ? slot.run.kind : (onCourse ? 'show' : 'out');
        const share = slot.share;
        if (kind === 'move' && slot.drawn) this.ghostLatch.set(spec.key, slot.drawn);
        const saved = this.ghostShare;
        this.ghostShare = share;
        const at = this.ghostAt(spec, kind);
        this.ghostShare = saved;
        slot.drawn = at;
        const placed: GhostSpec = { ...spec, then: at };
        const alpha = kind === 'show' || kind === 'move' ? 1 : share;
        if (alpha > 0) {
            this.strokeGhost(placed, spec, kind, alpha);
            if (placed.label && (kind === 'show' || kind === 'move' || share > 0.35)) {
                this.ghostTag(placed, kind === 'show' || kind === 'move' ? 1 : share);
            }
        }
        return onCourse ? at : null;
    }

    /** Option-1 ghosts sit still. Their share is not the course's per-waypoint share. */
    private drawStill(specs: readonly GhostSpec[]): void {
        if (specs.length === 0) return;
        const share = this.ghostShare;
        const kind = this.ghostKind;
        this.ghostShare = 1;
        this.ghostKind = 'show';
        this.drawGhosts(specs, 'show');
        this.ghostShare = share;
        this.ghostKind = kind;
    }

    /**
     * One segment from the ship through the waypoints.
     * The committed course is solid, heavier, and quieter. The preview stays dashed 7-4.
     */
    private flightLine(from: GhostSpot, to: GhostSpot, committed = false, dim = false): void {
        const ctx = this.ctx;
        ctx.save();
        ctx.strokeStyle = this.theme.signal;
        ctx.globalAlpha = committed ? (dim ? 0.28 : 0.72) : 1;
        ctx.lineWidth = committed ? 2 : 1.25;
        ctx.lineCap = 'butt';
        ctx.setLineDash(committed ? [] : [7, 4]);
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.restore();
    }

    /** Where this frame drew each waypoint, for a drag. Empty until a route or a preview is painted. */
    waypoints(): { route: readonly DrawnWaypoint[]; preview: readonly DrawnWaypoint[] } {
        return { route: this.routeDrawn, preview: this.previewDrawn };
    }

    /** The stored legs, including a single one. Invalid legs are left out. */
    private routeList(state: DrawState): CourseLeg[] | null {
        const route = state.route;
        if (!route) return null;
        if (this.isCourse(route)) {
            const legs = this.legList(route);
            return legs.length > 0 ? legs : null;
        }
        if (!(route.arrives > route.departs) || (!route.toKey && !route.point)) return null;
        return [route];
    }

    /** The preview as a list. A one-leg object is one entry. */
    private previewList(state: DrawState): CourseLeg[] | null {
        const preview = state.preview;
        if (!preview) return null;
        if (this.isCourse(preview)) {
            const legs = this.legList(preview);
            return legs.length > 0 ? legs : null;
        }
        const one = this.livePreview(state);
        return one ? [one] : null;
    }

    /** True when two legs end at the same body or the same point. */
    private sameEnd(a: CourseLeg, b: CourseLeg): boolean {
        if (a.toKey || b.toKey) return a.toKey === b.toKey;
        if (a.point && b.point) return a.point.x === b.point.x && a.point.y === b.point.y;
        return false;
    }

    /**
     * The first preview waypoint that is not the stored route's.
     * A preview that only extends the route parts at the first new leg.
     */
    private partIndex(state: DrawState): number {
        const route = this.routeList(state);
        const preview = this.previewList(state);
        if (!route || !preview) return 0;
        const n = Math.min(route.length, preview.length);
        for (let i = 0; i < n; i += 1) {
            if (!this.sameEnd(route[i], preview[i])) return i;
        }
        return n;
    }

    /**
     * The committed course. The same waypoints as a preview: each body at its own arrival,
     * a point as a target, numbers on the earlier ones. Solid, and still. It does not
     * ease, and it does not ghost the other worlds. From the parting waypoint on, a preview
     * owns the tags, and this course is drawn dimmer, with no tag and no number. The line
     * is drawn later, from the ship, so an under-way leg shows only what is left of it.
     */
    private paintRoute(plan: Plan, picture: Picture, view: View, state: DrawState): GhostSpot[] | null {
        if (picture.mode !== 'orbits') return null;
        const legs = this.routeList(state);
        if (!legs) return null;
        this.dimFrom = this.previewList(state) ? this.previewPart : null;
        const cache = new Map<number, Map<string, GhostBody>>();
        const bodiesAt = (at: number): Map<string, GhostBody> => {
            let found = cache.get(at);
            if (!found) {
                found = this.ghostBodies(layoutScene(plan, view, at));
                cache.set(at, found);
            }
            return found;
        };
        const spots: GhostSpot[] = [];
        for (let i = 0; i < legs.length; i += 1) {
            const leg = legs[i];
            const last = i === legs.length - 1;
            const spec = this.waySpec(plan, view, state.days, leg, 'route-' + i, bodiesAt, last);
            if (!spec) continue;
            const past = this.dimFrom !== null && i >= this.dimFrom;
            if (past) spec.label = '';
            else if (!last) spec.label = String(i + 1);
            spots.push(spec.then);
            this.routeDrawn.push({ index: i, x: spec.then.x, y: spec.then.y });
            this.strokeSettled(spec, past);
            if (spec.label) this.ghostTag(spec, 1);
        }
        return spots.length > 0 ? spots : null;
    }

    /** A settled waypoint: a solid ring, no travel arc. Quieter than the preview's mark. The old tail is quieter still. */
    private strokeSettled(spec: GhostSpec, dim = false): void {
        const ctx = this.ctx;
        const x = spec.then.x;
        const y = spec.then.y;
        if (this.offCanvas(x, y, spec.r + 24)) return;
        ctx.save();
        ctx.globalAlpha = dim ? 0.22 : 0.55;
        ctx.strokeStyle = this.theme.lock;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'miter';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.arc(x, y, spec.r, 0, TAU);
        ctx.stroke();
        ctx.beginPath();
        for (let i = 0; i < 4; i += 1) {
            const a = i * Math.PI / 2;
            ctx.moveTo(x + Math.cos(a) * (spec.r + 2), y + Math.sin(a) * (spec.r + 2));
            ctx.lineTo(x + Math.cos(a) * (spec.r + 2 + 5), y + Math.sin(a) * (spec.r + 2 + 5));
        }
        ctx.stroke();
        ctx.restore();
    }
}
