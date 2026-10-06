/**
 * Page side of the disc worker. prepareDiscs posts a batch and returns.
 * Tiles arrive on a later message. drawDisc paints whatever is already held.
 * A result whose mode, version or generation is no longer current is closed
 * and does not enter disc_hold. The atlas path checks again after every slice.
 */
import { startDiscWorker } from '../platform/browser.ts';
import { DISC_DELIVERY, type WorkerState, type WorkerTiles } from './vanilla/gl_messages.ts';
import type { ShadeRequest } from './vanilla/gl_shade.ts';
import { settleDiscDelivery, type DiscEnvelope } from './enhanced/delivery.ts';

export type DiscLink = {
    ready(): boolean;
    lost(): boolean;
    failed(): boolean;
    /** The envelope a later tile must match. Keys still in the frame may be remembered. */
    note(envelope: DiscEnvelope, keys: ReadonlySet<string>): void;
    submit(requests: readonly ShadeRequest[]): void;
    dispose(): void;
};

type Incoming = WorkerState | (WorkerTiles & { error?: string });

export function openDiscLink(): DiscLink {
    const worker = startDiscWorker();
    let isReady = false;
    let isLost = false;
    let isFailed = false;
    let live: DiscEnvelope | null = null;
    let keys = new Set<string>();
    const accept = (data: Incoming): void => {
        if (data.op === 'state' || data.op === 'tiles') {
            isReady = data.ready;
            isLost = data.lost;
            isFailed = data.failed;
        }
        if (data.op !== 'tiles') return;
        void settleDiscDelivery(data, () => live, () => keys);
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
        note(envelope, nextKeys) {
            live = envelope;
            keys = new Set(nextKeys);
        },
        submit(requests) {
            if (!live) return;
            worker.postMessage({
                op: 'watch',
                requests,
                delivery: DISC_DELIVERY,
                mode: live.mode,
                version: live.version,
                generation: live.generation,
            });
        },
        dispose() {
            worker.terminate();
        },
    };
}
