/** Request and result shapes shared by both surface modes. No painter lives here. */

export type SurfaceMode = 'vanilla' | 'enhanced';

/** Cheap enhanced switches. They default off and never change vanilla geography. */
export type EnhancedFlags = {
    readonly seasonalIce: boolean;
    readonly paletteVariants: boolean;
    readonly movingClouds: boolean;
    readonly lightning: boolean;
};

/** Public coordinates. Latitude is north-positive. Longitude is east-positive. Degrees. */
export type GeoDegrees = { readonly lat: number; readonly lon: number };

/** Internal sampling coordinates. Same signs as GeoDegrees. Radians. */
export type GeoRadians = { readonly lat: number; readonly lon: number };

/**
 * Immutable copy of one released body. Callers pass a snapshot.
 * Painters must not write back into a live dossier or profile object.
 */
export type BodySnapshot = Readonly<Record<string, unknown>>;

export type MapResolution = { readonly width: number; readonly height: number };

export type DrawingOptions = {
    readonly continentalDefinition: number;
    readonly coastlineComplexity: number;
    readonly flags: EnhancedFlags;
};

export type MapRequest = {
    readonly mode: SurfaceMode;
    readonly hexKey: string;
    readonly dossierKey: string;
    readonly body: BodySnapshot;
    readonly resolution: MapResolution;
    readonly options: DrawingOptions;
};

/**
 * One disc for this frame. Plain data, safe to clone.
 * The caller does not build legacyDiscId or the profile. prepareDiscs derives both
 * from hexKey and body. radiusPx is the radius the tile is rendered for, in device pixels.
 * Drawing at another radius scales that tile. light is x and y; the shade pass supplies z.
 * There is no separate scale field: drawDisc scales from the radius it is given.
 */
export type DiscRing = {
    readonly inner: number;
    readonly outer: number;
    readonly fill: number;
    readonly phase: number;
    readonly detail: number;
};

export type DiscRequest = {
    /** Unique among discs in this batch. drawDisc addresses the tile by this key. */
    readonly key: string;
    readonly hexKey: string;
    readonly dossierKey: string;
    readonly body: BodySnapshot;
    readonly radiusPx: number;
    readonly spin: number;
    readonly cloudSpin: number;
    readonly sweep: number;
    readonly samples: number;
    readonly tiltDeg: number;
    /** Toward the star. x right, y down the screen. */
    readonly light: readonly [number, number];
    readonly sun: readonly [number, number, number];
    readonly ring: DiscRing | null;
    /** Eclipsing bodies: offset x, offset y, radius, in this disc's radii. */
    readonly casters: readonly (readonly number[])[];
    readonly lightMode: boolean;
    /** Smaller is nearer the selected body. Omitted when nothing is selected. */
    readonly near?: number;
};

/** This frame. timeSeconds is the animation clock the shade pass reads as uTime. */
export type DiscBatchRequest = {
    readonly mode: SurfaceMode;
    readonly timeSeconds: number;
    readonly discs: readonly DiscRequest[];
};

/**
 * The context drawDisc paints into. A CanvasRenderingContext2D satisfies it.
 * The service does not touch the canvas except through platform/browser.ts.
 */
export type DiscContext = {
    drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void;
};

export type SurfaceReply = {
    readonly status: 'unavailable' | 'pending' | 'ready';
    readonly mode: SurfaceMode;
    readonly requestId: string;
};

/** Worker messages stay versioned so a later painter can reject a stale queue. */
export const SURFACE_MESSAGE_VERSION = 1;

/** Plain inputs for the vanilla sheet. The worker does not import the page. */
export type VanillaPaintInputs = {
    readonly worldData: {
        readonly atmosphere?: unknown;
        readonly hydrographics?: unknown;
        readonly temperature?: unknown;
        readonly temperatureK?: unknown;
        readonly size?: unknown;
    };
    readonly imageSeed: string;
    readonly masterSeed: string;
    readonly continentalDefinition: number;
    readonly coastlineComplexity: number;
    readonly printMode: boolean;
};

/**
 * The sea of an enhanced sheet, decided on the page by enhanced/seas.ts and sent as plain
 * data: the share of the sphere covered (null when the body gives none), the liquid's name
 * in the exotic liquids table (null when unknown or absent), and where it is frozen.
 */
export type EnhancedSea = {
    readonly coverage: number | null;
    readonly liquid: string | null;
    readonly ice:
        | { readonly kind: 'none' | 'all' | 'locked' }
        | { readonly kind: 'caps'; readonly fromLatDeg: number };
};

/** Plain inputs for the enhanced sheet: the vanilla ones (the same continents) and the sea. */
export type EnhancedPaintInputs = VanillaPaintInputs & { readonly sea: EnhancedSea };

export type SurfaceWorkerMessage = {
    readonly version: typeof SURFACE_MESSAGE_VERSION;
    readonly requestId: string;
    readonly op: 'map' | 'prepare-discs' | 'draw-disc' | 'cancel';
    readonly mode: SurfaceMode;
    readonly generation: number;
    readonly inputs?: VanillaPaintInputs;
    /** Present on an enhanced map request: the worker then paints the enhanced sheet. */
    readonly enhanced?: EnhancedPaintInputs;
};

export type SurfaceWorkerReply = {
    readonly version: typeof SURFACE_MESSAGE_VERSION;
    readonly requestId: string;
    readonly op: 'map' | 'dropped' | 'ready';
    readonly mode: SurfaceMode;
    readonly generation: number;
    readonly width?: number;
    readonly height?: number;
    readonly pixels?: Uint8ClampedArray;
};
