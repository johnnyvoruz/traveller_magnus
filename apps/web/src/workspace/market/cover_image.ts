/**
 * A package cover from a file chosen, dropped or pasted (contracts/b_marketplace.md F17): a WebP
 * at most 1600 px on its long side and 2 MB, and a thumbnail at most 640 px and 200 KB, each named
 * by its SHA-256. The same approach as a record image (campaign/images.ts, Lane A), at the cover's
 * limits; the quality steps down until both files fit. Any aspect ratio goes: the card crops to 16:9.
 * A map package's screenshot is first trimmed to its systems (cover_trim.ts, D5), so it reads on a card.
 */
import type { CoverUpload } from '../../marketplace/catalogue.ts';
import { encodeWebp, sha256Hex, type EncodedWebp, type WebpEncode } from '../../campaign/images.ts';
import { acceptFile } from '../images.ts';
import { chartTrim, lumaOf } from './cover_trim.ts';

export const COVER_LIMITS = { side: 1600, bytes: 2 * 1024 * 1024, thumbSide: 640, thumbBytes: 200 * 1024 } as const;

/** The qualities tried in turn, best first. */
export const COVER_QUALITIES = [0.85, 0.72, 0.6, 0.45] as const;

export type PreparedCover = CoverUpload & { width: number; height: number; bytes: number };

async function fitted(file: Blob, side: number, max: number, encode: WebpEncode): Promise<EncodedWebp | null | 'large'> {
    for (const quality of COVER_QUALITIES) {
        const out = await encode(file, side, quality);
        if (!out) return null;
        if (out.bytes.byteLength <= max) return out;
    }
    return 'large';
}

/** The picture is looked at this small to find the systems: enough to see them, quick on any file. */
const TRIM_LOOK = 400;

/**
 * A map screenshot trimmed to its systems, as a lossless picture to encode, or null to use the file
 * as it is (not a map screenshot, nothing to gain, or a browser without OffscreenCanvas).
 */
export async function trimmedChart(file: Blob): Promise<Blob | null> {
    if (typeof createImageBitmap !== 'function' || typeof OffscreenCanvas !== 'function') return null;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(file);
    } catch {
        return null;
    }
    try {
        const scale = Math.min(1, TRIM_LOOK / Math.max(bitmap.width, bitmap.height));
        const w = Math.max(1, Math.round(bitmap.width * scale));
        const h = Math.max(1, Math.round(bitmap.height * scale));
        const look = new OffscreenCanvas(w, h);
        const seen = look.getContext('2d', { willReadFrequently: true });
        if (!seen) return null;
        seen.drawImage(bitmap, 0, 0, w, h);
        const box = chartTrim(lumaOf(seen.getImageData(0, 0, w, h).data, w * h), w, h);
        if (!box) return null;
        const sx = Math.round(box.x / scale);
        const sy = Math.round(box.y / scale);
        const sw = Math.min(bitmap.width - sx, Math.round(box.w / scale));
        const sh = Math.min(bitmap.height - sy, Math.round(box.h / scale));
        const cut = new OffscreenCanvas(sw, sh);
        const ctx = cut.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, sw, sh);
        return await cut.convertToBlob({ type: 'image/png' });
    } catch {
        return null;
    } finally {
        bitmap.close();
    }
}

/**
 * Reads a file into a cover pair. Says why not in a sentence. `trim`: a map package's cover, trimmed
 * to its systems when it is a screenshot of the map.
 */
export async function prepareCover(file: File, encode: WebpEncode = encodeWebp, trim = false): Promise<{ ok: true; cover: PreparedCover; trimmed: boolean } | { ok: false; message: string }> {
    const accepted = acceptFile(file);
    if (!accepted.ok) return accepted;
    let full: EncodedWebp | null | 'large';
    let thumb: EncodedWebp | null | 'large';
    let trimmed = false;
    try {
        const cut = trim ? await trimmedChart(file) : null;
        trimmed = cut !== null;
        const source = cut ?? file;
        full = await fitted(source, COVER_LIMITS.side, COVER_LIMITS.bytes, encode);
        thumb = full && full !== 'large' ? await fitted(source, COVER_LIMITS.thumbSide, COVER_LIMITS.thumbBytes, encode) : null;
    } catch {
        return { ok: false, message: 'This image could not be read.' };
    }
    if (full === 'large' || thumb === 'large') return { ok: false, message: 'This image is too detailed to fit in 2 MB. Try a smaller picture.' };
    if (!full || !thumb) return { ok: false, message: 'This browser cannot encode WebP.' };
    return {
        ok: true,
        trimmed,
        cover: {
            image: full.bytes,
            thumb: thumb.bytes,
            hash: await sha256Hex(full.bytes),
            thumbHash: await sha256Hex(thumb.bytes),
            width: full.width,
            height: full.height,
            bytes: full.bytes.byteLength,
        },
    };
}

/** The image files among those dropped or pasted. */
export function imageFiles(files: readonly File[]): File[] {
    return files.filter((file) => file.type.startsWith('image/'));
}
