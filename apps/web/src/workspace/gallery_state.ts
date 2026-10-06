/**
 * What the image screens share across a record page: the upload under way on each record
 * (the saving mark says it in its own words), and the image the lightbox shows.
 */
import { reactive, ref } from 'vue';
import type { Upload } from './images.ts';

/** The upload under way, by record id; absent when none. */
export const uploads = reactive<Record<string, Upload>>({});

/** The lightbox: which record's gallery, at which image; null when shut. */
export const lightbox = ref<{ id: string; index: number } | null>(null);

export function openLightbox(id: string, index: number): void {
    lightbox.value = { id, index };
}

export function closeLightbox(): void {
    lightbox.value = null;
}
