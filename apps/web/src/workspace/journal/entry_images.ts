/**
 * The image list on a journal entry. Encoding and upload stay in campaign/images.ts.
 * Nothing here reads the clock or an entry's date.
 */
import { CAMPAIGN_LIMITS, type CampaignImage } from '@voyage/shared';

/** The same cap a record states, said for an entry. */
export const ENTRY_FULL = 'An entry can have twelve images.';

export function entryImages(images: readonly CampaignImage[] | null | undefined): CampaignImage[] {
    return images ? [...images] : [];
}

/** Appends one image. `front` makes it the avatar. A hash already in the list moves, it is not repeated. */
export function withEntryImage(
    images: readonly CampaignImage[] | null | undefined,
    image: CampaignImage,
    front = false,
): { images: CampaignImage[] } | { error: 'full' } {
    const rest = entryImages(images).filter((item) => item.hash !== image.hash);
    if (rest.length >= CAMPAIGN_LIMITS.images) return { error: 'full' };
    return { images: front ? [image, ...rest] : [...rest, image] };
}

/** Drops one image. An empty list is stored as null, which clears the field. */
export function withoutEntryImage(
    images: readonly CampaignImage[] | null | undefined,
    hash: string,
): CampaignImage[] | null {
    const list = entryImages(images).filter((item) => item.hash !== hash);
    return list.length ? list : null;
}

/** Puts this image first. Null when it is already first or missing. */
export function entryImageFirst(
    images: readonly CampaignImage[] | null | undefined,
    hash: string,
): CampaignImage[] | null {
    const list = entryImages(images);
    const index = list.findIndex((item) => item.hash === hash);
    if (index <= 0) return null;
    const chosen = list[index];
    return [chosen, ...list.filter((item) => item.hash !== hash)];
}

/** Sets one caption. A blank caption removes it. Null when the image is not in the list. */
export function entryImageCaption(
    images: readonly CampaignImage[] | null | undefined,
    hash: string,
    caption: string,
): CampaignImage[] | null {
    const list = entryImages(images);
    const index = list.findIndex((item) => item.hash === hash);
    if (index < 0) return null;
    const trimmed = caption.trim().slice(0, CAMPAIGN_LIMITS.caption);
    const next = list.slice();
    const current = next[index];
    if (!current) return null;
    if (trimmed) next[index] = { ...current, caption: trimmed };
    else {
        const rest = { ...current };
        delete rest.caption;
        next[index] = rest;
    }
    return next;
}
