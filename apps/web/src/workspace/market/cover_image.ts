/**
 * A package cover from a file chosen, dropped or pasted (contracts/b_marketplace.md F17): a WebP
 * at most 1600 px on its long side and 2 MB, and a thumbnail at most 640 px and 200 KB, each named
 * by its SHA-256. The same approach as a record image (campaign/images.ts, Lane A), at the cover's
 * limits; the quality steps down until both files fit. Any aspect ratio goes: the card crops to 16:9.
 */
import type { CoverUpload } from '../../marketplace/catalogue.ts';
import type { EncodedWebp, WebpEncode } from '../../campaign/images.ts';
import { acceptFile } from '../images.ts';

export const COVER_LIMITS = { side: 1600, bytes: 2 * 1024 * 1024, thumbSide: 640, thumbBytes: 200 * 1024 } as const;

/** The qualities tried in turn, best first. */
export const COVER_QUALITIES = [0.85, 0.72, 0.6, 0.45] as const;

export type PreparedCover = CoverUpload & { width: number; height: number; bytes: number };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function encodeWebp(source: Blob, longest: number, quality: number): Promise<EncodedWebp | null> {
    if (typeof createImageBitmap !== 'function' || typeof document === 'undefined') return null;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(source);
    } catch {
        return null;
    }
    try {
        const scale = Math.min(1, longest / Math.max(1, bitmap.width, bitmap.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, Math.round(bitmap.width * scale));
        canvas.height = Math.max(1, Math.round(bitmap.height * scale));
        const ctx = canvas.getContext('2d');
        if (!ctx) return null;
        ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        if (!blob || blob.type !== 'image/webp') return null;
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
    } finally {
        bitmap.close();
    }
}

async function fitted(file: Blob, side: number, max: number, encode: WebpEncode): Promise<EncodedWebp | null | 'large'> {
    for (const quality of COVER_QUALITIES) {
        const out = await encode(file, side, quality);
        if (!out) return null;
        if (out.bytes.byteLength <= max) return out;
    }
    return 'large';
}

/** Reads a file into a cover pair. Says why not in a sentence. */
export async function prepareCover(file: File, encode: WebpEncode = encodeWebp): Promise<{ ok: true; cover: PreparedCover } | { ok: false; message: string }> {
    const accepted = acceptFile(file);
    if (!accepted.ok) return accepted;
    let full: EncodedWebp | null | 'large';
    let thumb: EncodedWebp | null | 'large';
    try {
        full = await fitted(file, COVER_LIMITS.side, COVER_LIMITS.bytes, encode);
        thumb = full && full !== 'large' ? await fitted(file, COVER_LIMITS.thumbSide, COVER_LIMITS.thumbBytes, encode) : null;
    } catch {
        return { ok: false, message: 'This image could not be read.' };
    }
    if (full === 'large' || thumb === 'large') return { ok: false, message: 'This image is too detailed to fit in 2 MB. Try a smaller picture.' };
    if (!full || !thumb) return { ok: false, message: 'This browser cannot encode WebP.' };
    return {
        ok: true,
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
