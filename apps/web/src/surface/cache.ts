/** Byte-counted LRU of finished map sheets. Blank sheets count. No disk copy. */

export const MAP_CACHE_BYTES = 24 * 1024 * 1024;
export const MAP_CACHE_SHEETS = 16;

export class SheetCache {
    private readonly maxBytes: number;
    private readonly maxSheets: number;
    private readonly entries = new Map<string, Uint8ClampedArray>();
    private used = 0;
    private dropped = 0;

    constructor(maxBytes = MAP_CACHE_BYTES, maxSheets = MAP_CACHE_SHEETS) {
        this.maxBytes = maxBytes;
        this.maxSheets = maxSheets;
    }

    get bytes(): number {
        return this.used;
    }

    get sheets(): number {
        return this.entries.size;
    }

    get evictions(): number {
        return this.dropped;
    }

    get(key: string): Uint8ClampedArray | undefined {
        const hit = this.entries.get(key);
        if (!hit) return undefined;
        this.entries.delete(key);
        this.entries.set(key, hit);
        return hit;
    }

    has(key: string): boolean {
        return this.entries.has(key);
    }

    set(key: string, pixels: Uint8ClampedArray): void {
        const prev = this.entries.get(key);
        if (prev) {
            this.used -= prev.byteLength;
            this.entries.delete(key);
        }
        this.entries.set(key, pixels);
        this.used += pixels.byteLength;
        this.evict();
    }

    clear(): void {
        this.entries.clear();
        this.used = 0;
    }

    private evict(): void {
        while (this.entries.size > 0 && (this.entries.size > this.maxSheets || this.used > this.maxBytes)) {
            const oldest = this.entries.keys().next().value;
            if (oldest === undefined) return;
            const pixels = this.entries.get(oldest);
            this.entries.delete(oldest);
            this.used -= pixels ? pixels.byteLength : 0;
            this.dropped += 1;
        }
    }
}
