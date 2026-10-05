/**
 * Page side of the disc worker. prepareDiscs posts a batch and returns.
 * Tiles arrive on a later message. drawDisc paints whatever is already held.
 */
import { closeBitmap, sliceBitmap, startDiscWorker } from '../platform/browser.ts';
import { rememberDisc } from './disc_hold.ts';
import { DISC_DELIVERY, type WorkerState, type WorkerTiles } from './vanilla/gl_messages.ts';
import type { ShadeRequest } from './vanilla/gl_shade.ts';

export type DiscLink = {
    ready(): boolean;
    lost(): boolean;
    failed(): boolean;
    submit(requests: readonly ShadeRequest[]): void;
    dispose(): void;
};

type Incoming = WorkerState | (WorkerTiles & { error?: string });

export function openDiscLink(): DiscLink {
    const worker = startDiscWorker();
    let isReady = false;
    let isLost = false;
    let isFailed = false;
    const accept = (data: Incoming): void => {
        if (data.op === 'state' || data.op === 'tiles') {
            isReady = data.ready;
            isLost = data.lost;
            isFailed = data.failed;
        }
        if (data.op !== 'tiles') return;
        void hold(data);
    };
    worker.addEventListener('message', (event: MessageEvent<Incoming>) => {
        if (event.data) accept(event.data);
    });
    worker.addEventListener('error', () => {
        isFailed = true;
        isReady = false;
    });
    return {
        ready: () => isReady && !isLost && !isFailed,
        lost: () => isLost,
        failed: () => isFailed,
        submit(requests) {
            worker.postMessage({ op: 'watch', requests, delivery: DISC_DELIVERY });
        },
        dispose() {
            worker.terminate();
        },
    };
}

async function hold(data: WorkerTiles): Promise<void> {
    if (data.delivery === 'tiles') {
        for (const tile of data.tiles ?? []) {
            rememberDisc(tile.key, { image: tile.image, size: tile.size, radiusPx: tile.radiusPx });
        }
        return;
    }
    const atlas = data.image;
    if (!atlas) return;
    try {
        for (const slot of data.table ?? []) {
            const image = await sliceBitmap(atlas, slot.sx, slot.sy, slot.size, slot.size);
            rememberDisc(slot.key, { image, size: slot.size, radiusPx: slot.radiusPx });
        }
    } finally {
        closeBitmap(atlas);
    }
}
