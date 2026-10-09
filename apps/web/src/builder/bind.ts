/**
 * One universe's builder store, opened for whichever view is on screen.
 * The map and the orbit view are not mounted together. Each calls sync when the
 * signed-in universe or the chart manifest changes, and close when it goes.
 */
import type { Settings } from '@voyage/shared';
import { shallowRef } from 'vue';
import { apiFetch } from '../platform/http.ts';
import { useBuildStore } from '../workspace/build/seam.ts';
import { attachDraftMap } from './draft.ts';
import { asBuildStore } from './screen.ts';
import { openMap, type Builder, type OpenMapOptions } from './store.ts';

/** Bumps when the signed-in store is opened or closed, so a view can subscribe before it exists. */
export const builderEpoch = shallowRef(0);

export type BoundUniverse = {
    id: string;
    name: string;
    truthVersion: string | null;
    seed: string | null;
    settings: Settings | null;
};

export type BoundBuilder = {
    sync(): void;
    load(slug: string): void;
    builder(): Builder | null;
    close(): void;
};

export function bindBuilder(read: () => BoundUniverse | null, fetchImpl: typeof fetch = fetch): BoundBuilder {
    let builder: Builder | null = null;
    let options: OpenMapOptions | null = null;

    function sync(): void {
        const next = read();
        if (!next) {
            close();
            return;
        }
        if (!builder || !options || options.universeId !== next.id) {
            if (builder) builder.close();
            options = {
                fetch: (url, init) => apiFetch(fetchImpl, typeof url === 'string' ? url : url instanceof URL ? url.href : url.url, init),
                truthVersion: next.truthVersion,
                universeId: next.id,
                universeName: next.name,
                seed: next.seed,
                settings: next.settings,
            };
            builder = openMap(options);
            attachDraftMap(builder);
            useBuildStore(asBuildStore(builder));
            builderEpoch.value += 1;
            return;
        }
        options.truthVersion = next.truthVersion;
        options.universeName = next.name;
        options.seed = next.seed;
        options.settings = next.settings;
    }

    function load(slug: string): void {
        if (!builder || !slug || builder.sectorLoaded(slug)) return;
        void builder.loadSector(slug);
    }

    function close(): void {
        if (builder) builder.close();
        builder = null;
        options = null;
        attachDraftMap(null);
        useBuildStore(null);
        builderEpoch.value += 1;
    }

    return {
        sync,
        load,
        builder: () => builder,
        close,
    };
}
