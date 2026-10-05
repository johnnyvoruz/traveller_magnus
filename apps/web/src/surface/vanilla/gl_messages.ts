/**
 * Disc worker messages. Plain data. The page posts requests. The worker posts tiles.
 * 'tiles' is one bitmap per disc. 'atlas' is one bitmap plus the tile rectangles.
 */
import type { BakeProfile, GpuSpan } from './gl_bake.ts';
import type { ShadeRequest } from './gl_shade.ts';

/** The delivery the page keeps. Changed only after the cold measurement. */
export const DISC_DELIVERY: DiscDelivery = 'tiles';

export type DiscDelivery = 'tiles' | 'atlas';

export type WorkerTile = {
    key: string;
    size: number;
    radiusPx: number;
    image: ImageBitmap;
};

export type AtlasSlot = {
    key: string;
    sx: number;
    sy: number;
    size: number;
    radiusPx: number;
};

export type WorkerState = {
    op: 'state';
    ready: boolean;
    lost: boolean;
    failed: boolean;
};

export type WorkerTiles = {
    op: 'tiles';
    ready: boolean;
    lost: boolean;
    failed: boolean;
    slow: GpuSpan[];
    delivery: DiscDelivery;
    tiles?: WorkerTile[];
    image?: ImageBitmap;
    table?: AtlasSlot[];
};

export type RpcRequest = {
    id: number;
    op: string;
    profile?: BakeProfile;
    requests?: ShadeRequest[];
    radius?: number;
    uTime?: number;
    size?: number;
    profileId?: string;
    key?: string;
    delivery?: DiscDelivery;
};

export type WatchRequest = {
    op: 'watch';
    requests: ShadeRequest[];
    delivery: DiscDelivery;
};
