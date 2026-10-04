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

export type DiscRequest = {
    readonly mode: SurfaceMode;
    readonly hexKey: string;
    readonly dossierKey: string;
    readonly body: BodySnapshot;
    readonly kind: string;
    readonly pixels: number;
};

export type DiscBatchRequest = {
    readonly mode: SurfaceMode;
    readonly discs: readonly DiscRequest[];
};

export type SurfaceReply = {
    readonly status: 'unavailable';
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

export type SurfaceWorkerMessage = {
    readonly version: typeof SURFACE_MESSAGE_VERSION;
    readonly requestId: string;
    readonly op: 'map' | 'prepare-discs' | 'draw-disc' | 'cancel';
    readonly mode: SurfaceMode;
    readonly generation: number;
    readonly inputs?: VanillaPaintInputs;
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
