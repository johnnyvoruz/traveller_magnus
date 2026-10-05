/**
 * Newest shaded tile for each disc key. A tile can arrive a frame after its batch.
 * drawDisc paints whatever is held. The next ready frame replaces a key's tile.
 */
import { closeBitmap } from '../platform/browser.ts';

export type HeldDisc = {
    readonly image: CanvasImageSource;
    readonly size: number;
    /** Device pixels the tile was rendered for. drawDisc scales from this. */
    readonly radiusPx: number;
};

const held = new Map<string, HeldDisc>();

export function rememberDisc(key: string, tile: HeldDisc): void {
    const previous = held.get(key);
    held.set(key, tile);
    if (previous && previous.image !== tile.image) closeBitmap(previous.image);
}

export function discHeld(key: string): HeldDisc | undefined {
    return held.get(key);
}

/** Forget tiles for keys that are not in this frame's batch. */
export function retainDiscs(keys: ReadonlySet<string>): void {
    for (const key of [...held.keys()]) {
        if (keys.has(key)) continue;
        const previous = held.get(key);
        held.delete(key);
        if (previous) closeBitmap(previous.image);
    }
}

export function clearDiscs(): void {
    for (const tile of held.values()) closeBitmap(tile.image);
    held.clear();
}
