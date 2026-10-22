/**
 * Client shapes around @voyage/shared builder.ts.
 * The row is a hash, a roll and a rev. It has no chart columns.
 * A tree envelope is never read here.
 */
import type { SectorHex } from '@voyage/shared';
import type { BuilderGenerator, BuilderJobState } from '@voyage/shared';
import type { OwnSector } from '../workspace/build/seam.ts';

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

/** Absent on the wire means `every`. The store omits the field in that case. */
export type GenerateDensityName = 'every' | 'sparse' | 'standard' | 'dense';

export type JobProgress = {
    total: number;
    /** Hexes finished: written, skipped, failed, or left empty. Not the systems written. */
    done: number;
    /** Hex keys, from the job's failures. The count on the wire is separate. */
    failed: string[];
    skipped: number;
    /** Empty hexes the density roll did not write. Not part of `skipped`. */
    leftEmpty: number;
    /** Hex keys written, in write order. Systems generated is `placed.length`. */
    placed: string[];
    /** Keys written since the previous callback, in that same order. Empty on the opening callback. */
    landed: string[];
    state: JobState;
    /** Set when the job failed and named no hex. Absent otherwise. */
    error?: string;
};

export type UndoToken = { id: string };

/**
 * An Undo that did not put everything back. `left` is the hex keys still as they were.
 * `message` is the server's sentence when a hex had moved, or empty when a job listed conflicts.
 */
export type UndoOutcome = {
    id: string;
    restored: number;
    left: string[];
    message: string;
};

export type GenerateHandle = {
    stop(): void;
    finished: Promise<{ undo: UndoToken; progress: JobProgress }>;
};

/** One sector the grow act makes. The id is the server's. */
export type GrowSectorSeed = { name: string; slot: { x: number; y: number } };

export type GenerateGrowingBody = {
    hexKeys: readonly string[];
    edition: string;
    generator: BuilderGenerator;
    roll: number;
    filledToo: boolean;
    /** Absent means `every`, and the field is left off the request. */
    density?: GenerateDensityName;
    makeSectors: readonly GrowSectorSeed[];
};

/**
 * One generate that also makes sectors. `accepted` is the 201 or 202.
 * `finished` is the end of the job, or the same moment when the act was inline.
 */
export type GenerateGrowingHandle = {
    stop(): void;
    accepted: Promise<{ sectors: OwnSector[]; keys: Record<string, string>; undo: UndoToken }>;
    finished: Promise<{ undo: UndoToken; progress: JobProgress }>;
};
