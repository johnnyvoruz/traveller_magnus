/**
 * The Build screens' store (workspace/build/seam.ts), backed by this folder.
 * useBuildStore(asBuildStore(openMap(...))) replaces the stand-in.
 *
 * A row's entry is the chart entry the server put on it. Preview uses the entry
 * the stateless route returns. When that response has none, the entry is blank:
 * this store does not read the envelope to invent a name or a UWP.
 *
 * The screen already chooses which hexes to generate, so filledToo is true:
 * the server writes each key the screen named.
 */
import type { SectorHex, TreeEnvelope } from '@voyage/shared';
import type { BuildRow, BuildStore, BuildUniverse, JobProgress as ScreenProgress } from '../workspace/build/seam.ts';
import { rowEntry } from './overlay.ts';
import type { Builder } from './store.ts';
import type { JobProgress } from './types.ts';

function screenProgress(progress: JobProgress): ScreenProgress {
    const state = progress.state === 'stopping' || progress.state === 'stopped' || progress.state === 'running' || progress.state === 'done'
        ? progress.state
        : progress.state === 'failed' ? 'done' : 'running';
    return { total: progress.total, done: progress.done, failed: progress.failed, state };
}

/** A chart row with no name. Not read from a tree. */
function blankEntry(hash: string): SectorHex {
    return {
        tree: hash,
        type: 'SYSTEM_PRESENT',
        name: '',
        uwp: '',
        allegiance: '',
        zone: '',
        bases: '',
        tradeCodes: [],
        pbg: '',
        ix: 0,
        partial: null,
    };
}

function buildRow(row: ReturnType<Builder['row']>): BuildRow | null {
    if (!row) return null;
    return { hexKey: row.hexKey, state: row.state, entry: rowEntry(row), roll: row.roll, rev: row.rev };
}

export function asBuildStore(builder: Builder): BuildStore {
    return {
        universe(): BuildUniverse | null {
            return builder.universe();
        },
        tick: () => builder.tick(),
        row: (hexKey) => buildRow(builder.row(hexKey)),
        rows: (slug) => {
            const out: BuildRow[] = [];
            for (const row of builder.rows(slug)) {
                const built = buildRow(row);
                if (built) out.push(built);
            }
            return out;
        },
        tree: async (hexKey) => {
            const envelope = await builder.tree(hexKey);
            return envelope as TreeEnvelope | null;
        },
        preview: async (hexKey, choice, roll) => {
            const made = await builder.preview(hexKey, choice.engine, choice.generator, roll);
            return { hexKey, choice, roll: made.roll, entry: made.entry ?? blankEntry(made.hash), tree: made.envelope as TreeEnvelope };
        },
        keep: async (preview) => {
            const handle = builder.generate({
                hexKeys: [preview.hexKey],
                edition: preview.choice.engine,
                generator: preview.choice.generator,
                roll: preview.roll,
                filledToo: true,
            });
            const done = await handle.finished;
            return { id: done.undo.id };
        },
        generateMany: (hexes, choice, onProgress) => {
            const handle = builder.generate({
                hexKeys: hexes.map((item) => item.hexKey),
                edition: choice.engine,
                generator: choice.generator,
                roll: 0,
                filledToo: true,
            }, (progress) => onProgress(screenProgress(progress)));
            return {
                stop: () => handle.stop(),
                finished: handle.finished.then(({ undo, progress }) => ({ token: { id: undo.id }, progress: screenProgress(progress) })),
            };
        },
        remove: async (hexes) => {
            const truth = new Map(hexes.map((item) => [item.hexKey, item.truth]));
            return { id: builder.remove(hexes.map((item) => item.hexKey), (key) => truth.get(key) ?? null).id };
        },
        restore: async (hexKeys) => ({ id: builder.restore(hexKeys).id }),
        undo: (token) => builder.undo(token),
    };
}
