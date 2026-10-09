/**
 * Client shapes around @voyage/shared builder.ts.
 * The row is a hash, a roll and a rev. It has no chart columns.
 * A tree envelope is never read here.
 */
import type { SectorHex } from '@voyage/shared';
import type { BuilderJobState } from '@voyage/shared';

export type { BuilderEdition, BuilderGenerator, BuilderHex, BuilderJob } from '@voyage/shared';

/** What one hex is after the chart and the loaded row are laid together. rev is 0 when there is no row. */
export type HexView = {
    hexKey: string;
    state: 'empty' | 'truth' | 'override' | 'own' | 'removed';
    /** The chart's own row when this is still the chart. An override's columns are not on the builder row. */
    entry: SectorHex | null;
    treeHash: string | null;
    baseHash: string | null;
    roll: number;
    rev: number;
};

/** `stopping` is local, while the stop request is in flight. The server then says `stopped`. */
export type JobState = BuilderJobState | 'stopping';

export type JobProgress = {
    total: number;
    done: number;
    /** Hex keys, from the job's failures. The count on the wire is separate. */
    failed: string[];
    skipped: number;
    state: JobState;
};

export type UndoToken = { id: string };

export type GenerateHandle = {
    stop(): void;
    finished: Promise<{ undo: UndoToken; progress: JobProgress }>;
};
