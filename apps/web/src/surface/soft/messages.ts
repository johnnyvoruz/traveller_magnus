/**
 * Software disc worker messages. Plain data. The page posts a watch every frame; the worker
 * answers with the gl worker's own 'state' and 'tiles' shapes (vanilla/gl_messages.ts), so
 * enhanced/delivery.ts settles them into disc_hold exactly as it settles WebGL tiles.
 */
import type { SurfaceMode } from '../contracts.ts';
import type { SoftDiscSpec } from './disc_paint.ts';
import type { GlobeRecipe } from './globe.ts';

/** The envelope version of a software tile. A WebGL tile never matches it. */
export const SOFT_DISC_VERSION = 'soft-1';

/** Past this radius a tile is painted at this size and drawDisc scales it up. */
export const SOFT_MAX_RADIUS = 360;

export type SoftDisc = SoftDiscSpec & {
    /** Discs that share a key share one globe. */
    readonly globe: { readonly key: string; readonly recipe: GlobeRecipe };
};

export type SoftWatch = {
    readonly op: 'watch';
    readonly discs: readonly SoftDisc[];
    readonly mode: SurfaceMode;
    readonly version: string;
    readonly generation: number;
};
