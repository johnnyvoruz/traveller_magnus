import { z } from 'zod';
import { SectorHex } from './truth.ts';

/**
 * Builder step 1. Create, read, and delete one system or many.
 * The tree stays a hash. Nothing here describes an engine body.
 * Editing a system in place is a later step.
 */

export const BUILDER_LIMITS = {
    /** One sector address is 32 by 40. */
    hexesPerJob: 1280,
    /** architecture.md §5: one transaction per batch. */
    batch: 64,
    page: 100,
    reason: 200,
} as const;

/** `<slug>/<hhhh>`. The same rule as the overlay document. */
export const HexKey = z.string().regex(/^[^/]+\/\d{4}$/);
export type HexKey = z.infer<typeof HexKey>;

/**
 * What a hex is on this universe.
 * `truth` and a missing row are the chart. `own` with `rev` 0 is an empty hex
 * on a universe with no chart. The page of rows never includes `rev` 0.
 */
export const HexPlace = z.enum(['truth', 'override', 'removed', 'own']);
export type HexPlace = z.infer<typeof HexPlace>;

export const BuilderEdition = z.enum(['MgT2E', 'CT', 'T5', 'RTT', 'AoW']);
export type BuilderEdition = z.infer<typeof BuilderEdition>;

export const BuilderGenerator = z.enum(['top-down', 'bottom-up']);
export type BuilderGenerator = z.infer<typeof BuilderGenerator>;

/**
 * Pairs `generateHex` actually runs today.
 * Mongoose goes through `buildOne`, which generates top down.
 * Architect of Worlds goes through `generateAoWSystemBottomUp`.
 * The other editions, and the other pairing of these two, are not offered.
 */
export function builderPairReady(edition: string, generator: string): boolean {
    return (edition === 'MgT2E' && generator === 'top-down')
        || (edition === 'AoW' && generator === 'bottom-up');
}

const Hash = z.string().regex(/^[0-9a-f]{64}$/);

/** A row the universe stores. `rev` starts at 1. */
export const BuilderHex = z.object({
    hexKey: HexKey,
    state: z.enum(['override', 'removed', 'own']),
    treeHash: Hash.nullable(),
    baseHash: Hash.nullable(),
    roll: z.number().int().nonnegative(),
    rev: z.number().int().positive(),
    updatedAt: z.string().min(1),
    /**
     * The sector-index entry for this hex. The map draws this and does not read the tree.
     * The server always sends it. A caller that omits it still parses.
     */
    entry: SectorHex.optional(),
}).strict();
export type BuilderHex = z.infer<typeof BuilderHex>;

/** No row. `rev` is 0. Pinned universe: `truth`. Own map: `own`. */
export const BuilderAbsent = z.object({
    hexKey: HexKey,
    state: z.enum(['truth', 'own']),
    treeHash: z.null(),
    baseHash: z.null(),
    roll: z.literal(0),
    rev: z.literal(0),
}).strict();
export type BuilderAbsent = z.infer<typeof BuilderAbsent>;

export const BuilderHexView = z.union([BuilderHex, BuilderAbsent]);
export type BuilderHexView = z.infer<typeof BuilderHexView>;

export const BuilderHexPage = z.object({
    items: z.array(BuilderHex),
    nextCursor: z.string().nullable(),
}).strict();
export type BuilderHexPage = z.infer<typeof BuilderHexPage>;

export const HexRemove = z.object({
    baseRev: z.number().int().nonnegative(),
}).strict();
export type HexRemove = z.infer<typeof HexRemove>;

export const HexRestore = HexRemove;
export type HexRestore = z.infer<typeof HexRestore>;

export const HexRevert = z.object({
    toRev: z.number().int().nonnegative(),
    baseRev: z.number().int().nonnegative(),
}).strict();
export type HexRevert = z.infer<typeof HexRevert>;

export const BuilderGenerate = z.object({
    hexKeys: z.array(HexKey).min(1).max(BUILDER_LIMITS.hexesPerJob),
    edition: BuilderEdition,
    generator: BuilderGenerator,
    /** 0 is the universe seed alone. A higher roll is a different, repeatable system. */
    roll: z.number().int().nonnegative().default(0),
    /** Default false: hexes that already hold a system are left alone. */
    filledToo: z.boolean().default(false),
    /** Required when `hexKeys` has one entry. 0 means the universe has no row yet. */
    baseRev: z.number().int().nonnegative().optional(),
}).strict().superRefine((value, ctx) => {
    if (new Set(value.hexKeys).size !== value.hexKeys.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hexKeys'], message: 'duplicate hex key' });
    }
    if (value.hexKeys.length === 1 && value.baseRev === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseRev'], message: 'baseRev is required for one hex' });
    }
});
export type BuilderGenerate = z.infer<typeof BuilderGenerate>;

export const BuilderGenerateDone = z.object({
    rows: z.array(BuilderHex),
    skipped: z.array(HexKey),
}).strict();
export type BuilderGenerateDone = z.infer<typeof BuilderGenerateDone>;

export const BuilderJobAccepted = z.object({
    jobId: z.string().min(1),
}).strict();
export type BuilderJobAccepted = z.infer<typeof BuilderJobAccepted>;

export const BuilderJobState = z.enum(['queued', 'running', 'done', 'stopped', 'failed']);
export type BuilderJobState = z.infer<typeof BuilderJobState>;

export const BuilderFailure = z.object({
    hexKey: HexKey,
    reason: z.string().min(1).max(BUILDER_LIMITS.reason),
}).strict();
export type BuilderFailure = z.infer<typeof BuilderFailure>;

export const BuilderJob = z.object({
    id: z.string().min(1),
    kind: z.literal('generate'),
    state: BuilderJobState,
    total: z.number().int().nonnegative(),
    done: z.number().int().nonnegative(),
    failed: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    failures: z.array(BuilderFailure),
    createdAt: z.string().min(1),
    finishedAt: z.string().nullable(),
}).strict();
export type BuilderJob = z.infer<typeof BuilderJob>;

export const BuilderJobUndo = z.object({
    restored: z.number().int().nonnegative(),
    conflicts: z.array(HexKey),
}).strict();
export type BuilderJobUndo = z.infer<typeof BuilderJobUndo>;

/** Which sign-in buttons exist. A false provider is not registered. */
export const SignInProviders = z.object({
    twitter: z.boolean(),
    discord: z.boolean(),
    google: z.boolean(),
}).strict();
export type SignInProviders = z.infer<typeof SignInProviders>;
