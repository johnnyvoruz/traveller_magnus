/**
 * The one seam between the Build screens and the store that holds a universe's map
 * (findings/builder_system_design.md; directives/prompts/builder_step1.md). The screens call
 * only what is declared here. Agent A's `apps/web/src/builder/` takes the stand-in's place by
 * one call to `useBuildStore`; `stand_in.ts` is then deleted.
 *
 * Nothing here reads an engine's tree: a tree is handed to the dossier whole.
 */
import type { SectorHex, TreeEnvelope } from '@voyage/shared';
import { shallowRef } from 'vue';

/** What a hex is on this map. `truth` and `empty` have no row of the builder's. */
export type HexState = 'empty' | 'truth' | 'override' | 'own' | 'removed';

export type Generator = 'bottom-up' | 'top-down';
export type GenerateChoice = { engine: string; generator: Generator };

/** A row of the builder's: a system of theirs, or a chart system they removed. */
export type BuildRow = {
    hexKey: string;
    state: 'override' | 'own' | 'removed';
    /** The chart row the map draws; null for a removed hex. */
    entry: SectorHex | null;
    roll: number;
    rev: number;
};

/** A system rolled and not kept. */
export type Preview = {
    hexKey: string;
    choice: GenerateChoice;
    roll: number;
    entry: SectorHex;
    tree: TreeEnvelope;
};

export type JobState = 'running' | 'stopping' | 'stopped' | 'done';
export type JobProgress = { total: number; done: number; failed: string[]; state: JobState };

/** What one Undo puts back. Opaque to the screens. */
export type UndoToken = { id: string };

export type BuildUniverse = { id: string; name: string; truthVersion: string | null };

export type BuildStore = {
    /** The universe being built, or null when none is open. */
    universe(): BuildUniverse | null;
    /** A number that changes whenever any row does; reactive. */
    tick(): number;
    row(hexKey: string): BuildRow | null;
    /** Every row in one sector, for laying over that sector's chart index. */
    rows(slug: string): BuildRow[];
    tree(hexKey: string): Promise<TreeEnvelope | null>;
    /** Rolls a system and stores nothing. `truth` is the chart row under the hex, if any. */
    preview(hexKey: string, choice: GenerateChoice, roll: number, truth: SectorHex | null): Promise<Preview>;
    keep(preview: Preview, truth: SectorHex | null): Promise<UndoToken>;
    /** Many hexes. `onProgress` is called as each lands. `stop` leaves what is done. */
    generateMany(
        hexes: { hexKey: string; truth: SectorHex | null }[],
        choice: GenerateChoice,
        onProgress: (progress: JobProgress) => void,
    ): { stop: () => void; finished: Promise<{ token: UndoToken; progress: JobProgress }> };
    /** A chart system is hidden (`removed`); a system with no chart under it is gone. */
    remove(hexes: { hexKey: string; truth: SectorHex | null }[]): Promise<UndoToken>;
    /** The builder's row is dropped: the chart shows again. */
    restore(hexKeys: string[]): Promise<UndoToken>;
    undo(token: UndoToken): Promise<void>;
};

/**
 * Held in a ref: the store is opened after the screens are (when the universe is known), and a
 * screen that asked for it while it was null must hear when it arrives.
 */
const current = shallowRef<BuildStore | null>(null);

export function useBuildStore(store: BuildStore | null): void {
    current.value = store;
}

export function buildStore(): BuildStore | null {
    return current.value;
}
