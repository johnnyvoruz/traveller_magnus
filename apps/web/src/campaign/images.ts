import { CAMPAIGN_LIMITS, type CampaignImage, type CampaignRecord } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';
import { commit } from './commit.ts';
import { campaign, transport } from './store.ts';

const FULL_SIDE = 2048;
const THUMB_SIDE = 320;
const WEBP_QUALITY = 0.85;

export type EncodedWebp = {
    bytes: Uint8Array;
    width: number;
    height: number;
};

/** Returns null when this browser cannot encode WebP. */
export type WebpEncode = (source: Blob, longest: number, quality: number) => Promise<EncodedWebp | null>;

export type PreparedImage = {
    hash: string;
    thumbHash: string;
    width: number;
    height: number;
    bytes: number;
    image: Uint8Array;
    thumb: Uint8Array;
};

export type ImageResult = { ok: true } | { ok: false; message: string };

async function sha256Hex(bytes: Uint8Array): Promise<string> {
    const copy = new Uint8Array(bytes.byteLength);
    copy.set(bytes);
    const digest = await crypto.subtle.digest('SHA-256', copy);
    return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function encodeWebp(source: Blob, longest: number, quality: number): Promise<EncodedWebp | null> {
    if (typeof createImageBitmap !== 'function') return null;
    let bitmap: ImageBitmap;
    try {
        bitmap = await createImageBitmap(source);
    } catch {
        return null;
    }
    try {
        const longestSide = Math.max(bitmap.width, bitmap.height);
        if (longestSide < 1) return null;
        const scale = Math.min(1, longest / longestSide);
        const width = Math.max(1, Math.round(bitmap.width * scale));
        const height = Math.max(1, Math.round(bitmap.height * scale));
        let blob: Blob | null = null;
        if (typeof OffscreenCanvas === 'function') {
            const canvas = new OffscreenCanvas(width, height);
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(bitmap, 0, 0, width, height);
            blob = await canvas.convertToBlob({ type: 'image/webp', quality });
        } else if (typeof document !== 'undefined') {
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) return null;
            ctx.drawImage(bitmap, 0, 0, width, height);
            blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/webp', quality));
        }
        if (!blob || blob.type !== 'image/webp') return null;
        return { bytes: new Uint8Array(await blob.arrayBuffer()), width, height };
    } finally {
        bitmap.close();
    }
}

/** Decodes a file into a WebP and a 320 px thumbnail, each named by its SHA-256. */
export async function prepareImage(file: Blob, encode: WebpEncode = encodeWebp): Promise<
    { ok: true; image: PreparedImage } | { ok: false; message: string }
> {
    let full: EncodedWebp | null;
    let thumb: EncodedWebp | null;
    try {
        full = await encode(file, FULL_SIDE, WEBP_QUALITY);
        thumb = full ? await encode(file, THUMB_SIDE, WEBP_QUALITY) : null;
    } catch {
        return { ok: false, message: 'This image could not be read.' };
    }
    if (!full || !thumb) return { ok: false, message: 'This browser cannot encode WebP.' };
    return {
        ok: true,
        image: {
            hash: await sha256Hex(full.bytes),
            thumbHash: await sha256Hex(thumb.bytes),
            width: full.width,
            height: full.height,
            bytes: full.bytes.byteLength,
            image: full.bytes,
            thumb: thumb.bytes,
        },
    };
}

async function putObject(universeId: string, hash: string, bytes: Uint8Array): Promise<ImageResult> {
    let res: Response;
    try {
        res = await apiFetch(transport.fetch, `/api/universes/${encodeURIComponent(universeId)}/objects/${hash}`, {
            method: 'PUT',
            headers: { 'content-type': 'image/webp' },
            body: bytes as unknown as BodyInit,
        });
    } catch {
        return { ok: false, message: 'The image could not be saved.' };
    }
    if (res.status === 200 || res.status === 201) return { ok: true };
    let message = 'The image could not be saved.';
    try {
        const body = await res.json();
        if (body && body.error && body.error.code === 'too_large' && typeof body.error.message === 'string' && body.error.message) {
            message = body.error.message;
        }
    } catch {
        /* the status is enough */
    }
    return { ok: false, message };
}

/** Stores the WebP and its thumbnail. 200 means the hash was already there. */
export async function uploadImage(universeId: string, prepared: PreparedImage): Promise<ImageResult> {
    const image = await putObject(universeId, prepared.hash, prepared.image);
    if (!image.ok) return image;
    return putObject(universeId, prepared.thumbHash, prepared.thumb);
}

function listed(record: CampaignRecord): CampaignImage[] {
    return record.images ? record.images.slice() : [];
}

function writeImages(record: CampaignRecord, images: CampaignImage[] | null): void {
    commit({ records: [{ ...record, images, baseRev: record.rev }] });
}

function toImage(prepared: PreparedImage): CampaignImage {
    return {
        hash: prepared.hash,
        thumbHash: prepared.thumbHash,
        width: prepared.width,
        height: prepared.height,
        bytes: prepared.bytes,
    };
}

/** Uploads the image, then appends it. The first entry is the primary image. */
export async function addImage(recordId: string, prepared: PreparedImage): Promise<ImageResult> {
    const record = campaign.records[recordId];
    if (!record || record.deleted) return { ok: false, message: 'That record is not open.' };
    if (listed(record).length >= CAMPAIGN_LIMITS.images) {
        return { ok: false, message: 'A record can have twelve images.' };
    }
    if (!campaign.universeId) return { ok: false, message: 'The image could not be saved.' };
    const uploaded = await uploadImage(campaign.universeId, prepared);
    if (!uploaded.ok) return uploaded;
    const latest = campaign.records[recordId];
    if (!latest || latest.deleted) return { ok: false, message: 'That record is not open.' };
    const images = [...listed(latest), toImage(prepared)];
    if (images.length > CAMPAIGN_LIMITS.images) {
        return { ok: false, message: 'A record can have twelve images.' };
    }
    writeImages(latest, images);
    return { ok: true };
}

/** Drops the entry. The object stays until the bucket sweep. */
export function removeImage(recordId: string, hash: string): void {
    const record = campaign.records[recordId];
    if (!record || !record.images) return;
    if (!record.images.some((image) => image.hash === hash)) return;
    const images = record.images.filter((image) => image.hash !== hash);
    writeImages(record, images.length ? images : null);
}

/** Moves this image to the front of the gallery. */
export function makePrimary(recordId: string, hash: string): void {
    const record = campaign.records[recordId];
    if (!record || !record.images) return;
    const index = record.images.findIndex((image) => image.hash === hash);
    if (index <= 0) return;
    const chosen = record.images[index];
    const images = record.images.filter((image) => image.hash !== hash);
    images.unshift(chosen);
    writeImages(record, images);
}

/** Sets the caption on one image. A blank caption clears it. */
export function setCaption(recordId: string, hash: string, caption: string): void {
    const record = campaign.records[recordId];
    if (!record || !record.images) return;
    const index = record.images.findIndex((image) => image.hash === hash);
    if (index < 0) return;
    const trimmed = caption.trim().slice(0, CAMPAIGN_LIMITS.caption);
    const images = record.images.slice();
    const current = images[index];
    const next: CampaignImage = {
        hash: current.hash,
        thumbHash: current.thumbHash,
        width: current.width,
        height: current.height,
        bytes: current.bytes,
    };
    if (trimmed) next.caption = trimmed;
    images[index] = next;
    writeImages(record, images);
}
