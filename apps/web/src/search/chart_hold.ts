/**
 * The released chart, once anyone on the page has read it.
 * The map writes it as it boots. A search from another screen reads it,
 * and loads it once when the map has not.
 */
import { ref } from 'vue';
import type { TruthManifest } from '@voyage/shared';
import { TruthClient } from '../map/truth_client.ts';
import { pageOrigin } from '../platform/browser.ts';

export const chartVersion = ref('');
export const chartManifest = ref<TruthManifest | null>(null);

export function holdChart(version: string, manifest: TruthManifest | null): void {
    if (version) chartVersion.value = version;
    if (manifest) chartManifest.value = manifest;
}

export function chartNow(): { version: string; manifest: TruthManifest | null } {
    return { version: chartVersion.value, manifest: chartManifest.value };
}

let pending: Promise<void> | null = null;

/** One load per page. A failed load can be tried again. */
export function ensureChart(): Promise<void> {
    if (chartVersion.value && chartManifest.value) return Promise.resolve();
    if (!pending) {
        pending = (async () => {
            const client = new TruthClient({
                cdnBase: import.meta.env.VITE_CDN_BASE || 'https://cdn.traveller.voyage',
                apiBase: pageOrigin(),
                fetch,
            });
            const version = chartVersion.value || await client.currentVersion();
            const manifest = chartManifest.value ?? await client.manifest(version);
            holdChart(version, manifest);
        })().catch((err: unknown) => {
            pending = null;
            throw err;
        });
    }
    return pending;
}
