/**
 * Async page client for the disc worker. Parity and the cold measure use it.
 * Calls wait. They do not run WebGL on the page.
 */
import { closeBitmap, now, sliceBitmap, startDiscWorker } from '../../platform/browser.ts';
import type { BakeProfile, GpuSpan } from './gl_bake.ts';
import type { DiscCapture, DiscTile } from './gl.ts';
import type { DiscDelivery } from './gl_messages.ts';
import type { ShadeRequest } from './gl_shade.ts';

export type FrameResult = {
    ready: boolean;
    lost: boolean;
    failed: boolean;
    lit: boolean;
    full: boolean;
    slow: GpuSpan[];
    memory: number;
    withinBudget: boolean;
    delivery: DiscDelivery;
    tiles?: { key: string; size: number; radiusPx: number; image: ImageBitmap }[];
    image?: ImageBitmap;
    table?: { key: string; sx: number; sy: number; size: number; radiusPx: number }[];
    mainMs: number;
};

export type DiscPort = {
    pump(): Promise<{ ready: boolean; lost: boolean; failed: boolean }>;
    ready(): Promise<boolean>;
    lost(): Promise<boolean>;
    clear(): Promise<void>;
    dispose(): void;
    step(profile: BakeProfile, radius: number, uTime: number): Promise<number>;
    takeSpans(): Promise<GpuSpan[]>;
    sync(): Promise<number>;
    jobPending(id: string): Promise<boolean>;
    hasCube(id: string, size: number): Promise<boolean>;
    capture(id: string): Promise<DiscCapture>;
    renderBatch(requests: ShadeRequest[]): Promise<Map<string, DiscTile>>;
    readTile(key: string): Promise<Uint8Array | null>;
    tile(key: string): Promise<DiscTile | null>;
    openMs(): Promise<number>;
    prepare(profile: BakeProfile, uTime: number): Promise<number>;
    bakeSize(profile: BakeProfile, size: number, uTime: number): Promise<{ ms: number; maxFaceMs: number }>;
    dropCubes(id: string): Promise<void>;
    longestSliceMs(): Promise<number>;
    memory(): Promise<number>;
    costs(): Promise<{ label: string; ms: number }[]>;
    loseForTest(): Promise<boolean>;
    restoreForTest(): Promise<boolean>;
    frame(requests: ShadeRequest[], delivery: DiscDelivery, draw: (result: FrameResult) => void | Promise<void>): Promise<FrameResult>;
};

type Waiter = {
    op: string;
    draw: ((result: FrameResult) => void | Promise<void>) | null;
    resolve: (value: unknown) => void;
    reject: (error: Error) => void;
};

export function connectDiscPort(): DiscPort {
    const worker = startDiscWorker();
    let nextId = 0;
    const pending = new Map<number, Waiter>();
    const rejectAll = (error: Error): void => {
        for (const waiter of pending.values()) waiter.reject(error);
        pending.clear();
    };
    worker.addEventListener('message', (event: MessageEvent) => {
        const data = event.data as { id?: number; ok?: boolean; result?: unknown; error?: string } | null;
        if (!data || typeof data.id !== 'number') return;
        const waiter = pending.get(data.id);
        if (!waiter) return;
        pending.delete(data.id);
        void (async () => {
            if (!data.ok) {
                waiter.reject(new Error(data.error || 'disc worker failed'));
                return;
            }
            const started = now();
            const result = data.result;
            if (waiter.op === 'frame' && result && typeof result === 'object') {
                const frame = result as FrameResult;
                if (waiter.draw) await waiter.draw(frame);
                frame.mainMs = now() - started;
            }
            waiter.resolve(result);
        })();
    });
    worker.addEventListener('error', () => {
        rejectAll(new Error('disc worker failed'));
    });
    function call<T>(op: string, extra: object, draw?: (result: FrameResult) => void): Promise<T> {
        const id = ++nextId;
        return new Promise((resolve, reject) => {
            pending.set(id, {
                op,
                draw: draw ?? null,
                resolve: (value) => resolve(value as T),
                reject,
            });
            worker.postMessage({ id, op, ...extra });
        });
    }
    return {
        pump: () => call('pump', {}),
        ready: () => call('ready', {}),
        lost: () => call('lost', {}),
        clear: () => call('clear', {}),
        dispose() {
            rejectAll(new Error('disposed'));
            worker.terminate();
        },
        step: (profile, radius, uTime) => call('step', { profile, radius, uTime }),
        takeSpans: () => call('spans', {}),
        sync: () => call('sync', {}),
        jobPending: (profileId) => call('pending', { profileId }),
        hasCube: (profileId, size) => call('hasCube', { profileId, size }),
        capture: (profileId) => call('capture', { profileId }),
        renderBatch: async (requests) => {
            const listed = await call<(DiscTile & { key: string })[]>('render', { requests });
            const tiles = new Map<string, DiscTile>();
            for (const tile of listed) tiles.set(tile.key, tile);
            return tiles;
        },
        readTile: (key) => call('readTile', { key }),
        tile: (key) => call('tile', { key }),
        openMs: () => call('openMs', {}),
        prepare: (profile, uTime) => call('prepare', { profile, uTime }),
        bakeSize: (profile, size, uTime) => call('bakeSize', { profile, size, uTime }),
        dropCubes: (profileId) => call('drop', { profileId }),
        longestSliceMs: () => call('longest', {}),
        memory: () => call('memory', {}),
        costs: () => call('costs', {}),
        loseForTest: () => call('lose', {}),
        restoreForTest: () => call('restore', {}),
        frame: (requests, delivery, draw) => call('frame', { requests, delivery }, draw),
    };
}

/** Draw one delivered frame into ctx. Closes the bitmaps after the blit. */
export async function paintFrame(
    ctx: { drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void },
    result: FrameResult,
    blit: (ctx: { drawImage(image: CanvasImageSource, dx: number, dy: number, dw: number, dh: number): void }, image: CanvasImageSource, x: number, y: number, w: number, h: number) => void,
): Promise<void> {
    if (result.delivery === 'tiles') {
        let index = 0;
        for (const tile of result.tiles ?? []) {
            blit(ctx, tile.image, index, index, tile.size, tile.size);
            closeBitmap(tile.image);
            index += 1;
        }
        return;
    }
    const atlas = result.image;
    if (!atlas) return;
    try {
        let index = 0;
        for (const slot of result.table ?? []) {
            const image = await sliceBitmap(atlas, slot.sx, slot.sy, slot.size, slot.size);
            blit(ctx, image, index, index, slot.size, slot.size);
            closeBitmap(image);
            index += 1;
        }
    } finally {
        closeBitmap(atlas);
    }
}
