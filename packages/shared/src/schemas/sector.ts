import { z } from 'zod';
import { BUILDER_LIMITS, BuilderEdition, BuilderGenerator, BuilderHex, GenerateDensity, HexKey } from './builder.ts';

/**
 * A sector the referee made.
 * The id is not the grid slot. Chart slugs never contain "~"
 * (data_model.md, where homebrew lives), so a hex key
 * `<id>/<hhhh>` cannot be a chart key.
 */

/** Crockford ULID, the same alphabet as `ulid` in the Worker. */
export const OwnSectorId = z.string().regex(/^~[0-9A-HJKMNP-TV-Z]{26}$/);
export type OwnSectorId = z.infer<typeof OwnSectorId>;

export const SUBSECTOR_LETTERS = [
    'A', 'B', 'C', 'D', 'E', 'F', 'G', 'H',
    'I', 'J', 'K', 'L', 'M', 'N', 'O', 'P',
] as const;
export type SubsectorLetter = (typeof SUBSECTOR_LETTERS)[number];

export const SubsectorLetter = z.enum(SUBSECTOR_LETTERS);

/** Sixteen names, index 0 is A and index 15 is P. Empty is an unnamed subsector. */
export const SubsectorNames = z.array(z.string().max(80)).length(16);
export type SubsectorNames = z.infer<typeof SubsectorNames>;

export const SectorSlot = z.object({
    x: z.number().int().min(-1000).max(1000),
    y: z.number().int().min(-1000).max(1000),
}).strict();
export type SectorSlot = z.infer<typeof SectorSlot>;

export const RefereeSector = z.object({
    id: OwnSectorId,
    slot: SectorSlot,
    name: z.string().min(1).max(80),
    subsectors: SubsectorNames,
    rev: z.number().int().positive(),
    deleted: z.boolean(),
}).strict();
export type RefereeSector = z.infer<typeof RefereeSector>;

export const RefereeSectorPage = z.object({
    items: z.array(RefereeSector),
}).strict();
export type RefereeSectorPage = z.infer<typeof RefereeSectorPage>;

export const SectorMake = z.object({
    name: z.string().trim().min(1).max(80),
    slot: SectorSlot,
}).strict();
export type SectorMake = z.infer<typeof SectorMake>;

export const SectorRename = z.object({
    name: z.string().trim().min(1).max(80),
    baseRev: z.number().int().positive(),
}).strict();
export type SectorRename = z.infer<typeof SectorRename>;

export const SectorMove = z.object({
    slot: SectorSlot,
    baseRev: z.number().int().positive(),
}).strict();
export type SectorMove = z.infer<typeof SectorMove>;

export const SectorRev = z.object({
    baseRev: z.number().int().positive(),
}).strict();
export type SectorRev = z.infer<typeof SectorRev>;

export const SubsectorRename = z.object({
    name: z.string().max(80),
    baseRev: z.number().int().positive(),
}).strict();
export type SubsectorRename = z.infer<typeof SubsectorRename>;

/**
 * Undo one sector revision.
 * A delete's rev holds the copy taken before the rows were removed.
 * Undoing that rev puts the sector and its hexes back.
 */
export const SectorUndo = z.object({
    toRev: z.number().int().positive(),
    baseRev: z.number().int().positive(),
}).strict();
export type SectorUndo = z.infer<typeof SectorUndo>;

/** One sector this generate act makes. The client does not send an id. */
export const SectorSeed = z.object({
    name: z.string().trim().min(1).max(80),
    slot: SectorSlot,
}).strict();
export type SectorSeed = z.infer<typeof SectorSeed>;

/**
 * `POST .../generate` when the box also makes sectors.
 * A hex in a sector that does not exist yet is `~slot_<x>_<y>/<hhhh>`.
 */
export const SectorGenerate = z.object({
    hexKeys: z.array(HexKey).min(1).max(BUILDER_LIMITS.hexesPerJob),
    edition: BuilderEdition,
    generator: BuilderGenerator,
    roll: z.number().int().nonnegative().default(0),
    filledToo: z.boolean().default(false),
    /** Default `every`. The same field as `BuilderGenerate`. */
    density: GenerateDensity.default('every'),
    baseRev: z.number().int().nonnegative().optional(),
    makeSectors: z.array(SectorSeed).min(1).max(BUILDER_LIMITS.hexesPerJob),
}).strict().superRefine((value, ctx) => {
    if (new Set(value.hexKeys).size !== value.hexKeys.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hexKeys'], message: 'duplicate hex key' });
    }
    if (value.hexKeys.length === 1 && value.baseRev === undefined) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['baseRev'], message: 'baseRev is required for one hex' });
    }
});
export type SectorGenerate = z.infer<typeof SectorGenerate>;

export const SectorGenerateDone = z.object({
    sectors: z.array(RefereeSector),
    rows: z.array(BuilderHex),
    skipped: z.array(HexKey),
    jobId: z.string().nullable(),
    /** 0 on this answer. The queued job carries the count. */
    leftEmpty: z.number().int().nonnegative().default(0),
}).strict();
export type SectorGenerateDone = z.infer<typeof SectorGenerateDone>;

/** Inline act: `sectorId` and `baseRev`. Queued act: `jobId`. */
export const SectorGenerateUndo = z.union([
    z.object({
        sectorId: OwnSectorId,
        baseRev: z.number().int().positive(),
    }).strict(),
    z.object({
        jobId: z.string().min(1),
    }).strict(),
]);
export type SectorGenerateUndo = z.infer<typeof SectorGenerateUndo>;

export const SectorGenerateUndone = z.object({
    sectors: z.array(z.object({
        id: OwnSectorId,
        toRev: z.number().int().positive(),
        baseRev: z.number().int().positive(),
    }).strict()),
    restored: z.number().int().nonnegative(),
    hexes: z.array(z.object({
        hexKey: HexKey,
        toRev: z.number().int().positive(),
        baseRev: z.number().int().nonnegative(),
    }).strict()),
}).strict();
export type SectorGenerateUndone = z.infer<typeof SectorGenerateUndone>;

export function emptySubsectors(): SubsectorNames {
    return ['', '', '', '', '', '', '', '', '', '', '', '', '', '', '', ''];
}
