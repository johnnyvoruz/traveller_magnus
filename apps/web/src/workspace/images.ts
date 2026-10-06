/**
 * Images on records as the screens read them (slice_2_campaign.md K14 point 5): the
 * primary image, its address, which files are taken, the upload's words, and what an undo
 * sends back. The encoding, hashing, upload and the record change are
 * campaign/images.ts (Agent A); nothing here touches the network. Pure: it runs under Node.
 */
import type { CampaignImage, CampaignRecord } from '@voyage/shared';

/** The Worker caps an object at 8 MB; a file past that is refused before it is read. */
export const FILE_MAX_BYTES = 8 * 1024 * 1024;

export type UploadStage = 'reading' | 'uploading' | 'failed';
export type Upload = { stage: UploadStage; message: string; file: string };

/** The first image is the primary one. */
export function primaryImage(record: Pick<CampaignRecord, 'images'>): CampaignImage | null {
    return record.images && record.images.length ? record.images[0] : null;
}

/** Where an object is served from, for the signed-in owner. */
export function imageUrl(universeId: string, hash: string): string {
    return '/api/universes/' + encodeURIComponent(universeId) + '/objects/' + encodeURIComponent(hash);
}

/** A thumbnail's address for a record's primary image, or null. */
export function thumbUrl(universeId: string | null, record: Pick<CampaignRecord, 'images'>): string | null {
    const image = primaryImage(record);
    return universeId && image ? imageUrl(universeId, image.thumbHash) : null;
}

/** Whether a chosen file can be taken, and why not. */
export function acceptFile(file: { type: string; size: number; name: string }): { ok: true } | { ok: false; message: string } {
    if (!file.type.startsWith('image/')) return { ok: false, message: (file.name || 'That file') + ' is not an image.' };
    if (file.size > FILE_MAX_BYTES) return { ok: false, message: (file.name || 'That file') + ' is over 8 MB.' };
    return { ok: true };
}

/** The upload's words, in the saving mark's language. */
export function uploadWords(upload: Upload | null): string {
    if (!upload) return '';
    if (upload.stage === 'reading') return 'Reading the image…';
    if (upload.stage === 'uploading') return 'Uploading…';
    return 'Not saved';
}

/** The gallery with an image put back where it was (an undo of a remove). */
export function withImageBack(images: readonly CampaignImage[] | null, image: CampaignImage, at: number): CampaignImage[] {
    const list = images ? images.filter((item) => item.hash !== image.hash) : [];
    const index = Math.max(0, Math.min(at, list.length));
    list.splice(index, 0, image);
    return list;
}

/** True when two galleries list the same images in the same order with the same captions. */
export function sameImages(a: readonly CampaignImage[] | null, b: readonly CampaignImage[] | null): boolean {
    const x = a ?? [];
    const y = b ?? [];
    return x.length === y.length && x.every((item, i) => item.hash === y[i].hash && (item.caption ?? '') === (y[i].caption ?? ''));
}

/** "1,200 × 800 · 240 kB" */
export function imageWords(image: CampaignImage): string {
    const kb = Math.round(image.bytes / 1024);
    return image.width.toLocaleString() + ' × ' + image.height.toLocaleString() + ' · ' + (kb >= 1024 ? (kb / 1024).toFixed(1) + ' MB' : kb + ' kB');
}
