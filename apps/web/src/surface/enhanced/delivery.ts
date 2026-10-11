/**
 * Disc delivery epoch. A result is kept only when its mode, version and
 * generation are the ones the page is on now. The page posts a watch on every
 * frame, so a later watch of that same envelope must not throw the in-flight
 * bitmaps away: they are the textures for the discs already on screen. A
 * change of mode, version or generation still closes them.
 */
import { closeBitmap, sliceBitmap } from '../../platform/browser.ts';
import type { SurfaceMode } from '../contracts.ts';
import { rememberDisc, type HeldDisc } from '../disc_hold.ts';
import type { WorkerTiles } from '../vanilla/gl_messages.ts';

export type DiscEnvelope = {
    readonly mode: SurfaceMode;
    readonly version: string;
    readonly generation: number;
};

export function sameEnvelope(live: DiscEnvelope | null, job: DiscEnvelope): boolean {
    if (!live) return false;
    return live.mode === job.mode && live.version === job.version && live.generation === job.generation;
}

/**
 * True when a watch queued after `job` should make `job` throw its bitmaps away.
 * Same mode, version and generation is one picture: the answer is handed to the
 * painter. A different envelope is a new picture, and the old answer is dropped.
 */
export function watchSuperseded(queued: DiscEnvelope | null, job: DiscEnvelope | null): boolean {
    if (!queued || !job) return false;
    return queued.mode !== job.mode || queued.version !== job.version || queued.generation !== job.generation;
}

/** The painter takes a finished answer unless a later watch changed the envelope. */
export function handOverDiscAnswer(queued: DiscEnvelope | null, finished: DiscEnvelope): boolean {
    return !watchSuperseded(queued, finished);
}

export async function settleDiscDelivery(
    data: WorkerTiles,
    live: () => DiscEnvelope | null,
    keys: () => ReadonlySet<string>,
): Promise<void> {
    const stamp: DiscEnvelope = { mode: data.mode, version: data.version, generation: data.generation };
    if (!sameEnvelope(live(), stamp)) {
        releaseTiles(data);
        return;
    }
    if (data.delivery === 'tiles') {
        for (const tile of data.tiles ?? []) {
            if (!sameEnvelope(live(), stamp) || !keys().has(tile.key)) {
                closeBitmap(tile.image);
                continue;
            }
            rememberHeld(tile.key, tile.image, tile.size, tile.radiusPx, stamp);
        }
        return;
    }
    const atlas = data.image;
    if (!atlas) return;
    try {
        for (const slot of data.table ?? []) {
            const image = await sliceBitmap(atlas, slot.sx, slot.sy, slot.size, slot.size);
            if (!sameEnvelope(live(), stamp) || !keys().has(slot.key)) {
                closeBitmap(image);
                continue;
            }
            rememberHeld(slot.key, image, slot.size, slot.radiusPx, stamp);
        }
    } finally {
        closeBitmap(atlas);
    }
}

function rememberHeld(
    key: string,
    image: HeldDisc['image'],
    size: number,
    radiusPx: number,
    stamp: DiscEnvelope,
): void {
    rememberDisc(key, {
        image,
        size,
        radiusPx,
        mode: stamp.mode,
        version: stamp.version,
        generation: stamp.generation,
    });
}

function releaseTiles(data: WorkerTiles): void {
    for (const tile of data.tiles ?? []) closeBitmap(tile.image);
    if (data.image) closeBitmap(data.image);
}
