import { z } from 'zod';
import { HexKey } from './builder.ts';

const RECORD_ID = /^cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** data_model.md §7. */
export const PackageHex = z.object({
    baseHash: z.string().nullable().optional(),
    treeHash: z.string().optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    deleted: z.literal(true).optional(),
});
export type PackageHex = z.infer<typeof PackageHex>;

export const PackageManifest = z.object({
    format: z.literal('voyage-package'),
    schemaVersion: z.number(),
    packageId: z.string(),
    version: z.number(),
    kind: z.string(),
    title: z.string(),
    author: z.object({ id: z.string(), handle: z.string() }),
    edition: z.string(),
    engineVersion: z.string(),
    /** Null when the package was published from an own map (contracts/b_marketplace.md F1). */
    truthVersion: z.string().nullable(),
    hexes: z.record(z.string(), PackageHex),
    /**
     * F15. Where each own sector of the piece sat on its source map, by sector id. A placed
     * import reads source slots from here, so it lands the same after the source map is
     * emptied or deleted. Absent on a manifest written before 1.2.0.
     */
    ownSectors: z.record(z.string(), z.object({ x: z.number().int(), y: z.number().int() })).optional(),
    lists: z.object({
        routes: z.string(),
        borderPaths: z.string(),
    }),
    records: z.object({
        contentHash: z.string(),
        count: z.number(),
        imageHashes: z.array(z.string()),
        /**
         * F16. The links whose two ends are both published records, as one content-addressed
         * list. Absent on a manifest written before 1.2.1 or with no such link.
         */
        links: z.object({ contentHash: z.string(), count: z.number() }).optional(),
    }),
    publishedAt: z.string(),
});
export type PackageManifest = z.infer<typeof PackageManifest>;

/** Marketplace stub, contracts/b_marketplace.md. Title and kind are trimmed. */
export const PackageCreate = z.object({
    title: z.string().trim().min(1).max(80),
    kind: z.string().trim().min(1).max(40),
    description: z.string().max(2000),
    tags: z.array(z.string().min(1).max(40)).max(32),
    universeId: z.string().min(1),
}).strict();
export type PackageCreate = z.infer<typeof PackageCreate>;

/** The version body. Caps are enforced by the route so the too-large sentences stay exact. */
export const PackagePublish = z.object({
    universeId: z.string().min(1),
    hexKeys: z.array(HexKey).min(1),
    recordIds: z.array(z.string().regex(RECORD_ID)),
}).strict().superRefine((value, ctx) => {
    if (new Set(value.hexKeys).size !== value.hexKeys.length) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['hexKeys'], message: 'duplicate hex key' });
    }
});
export type PackagePublish = z.infer<typeof PackagePublish>;

export const PackageListing = z.object({
    id: z.string(),
    title: z.string(),
    authorHandle: z.string(),
    kind: z.string(),
    truthVersion: z.string().nullable(),
    edition: z.string(),
    hexCount: z.number().int().nonnegative(),
    tags: z.array(z.string()),
    latestVersion: z.number().int().nonnegative(),
}).strict();
export type PackageListing = z.infer<typeof PackageListing>;

export const PackageVersion = z.object({
    version: z.number().int().positive(),
    state: z.enum(['queued', 'running', 'done', 'failed']),
    hexCount: z.number().int().nonnegative(),
    recordCount: z.number().int().nonnegative(),
    manifestHash: z.string().nullable(),
    error: z.string().nullable(),
}).strict();
export type PackageVersion = z.infer<typeof PackageVersion>;

export const PackagePage = PackageListing.extend({
    description: z.string(),
    versions: z.array(PackageVersion),
}).strict();
export type PackagePage = z.infer<typeof PackagePage>;

export const PackagePublishAccepted = z.object({
    jobId: z.string().min(1),
    version: z.number().int().positive(),
}).strict();
export type PackagePublishAccepted = z.infer<typeof PackagePublishAccepted>;

/** `nextCursor` is a string, or null when the page ends. Same rule as `BuilderHexPage`. */
export const PackageListPage = z.object({
    items: z.array(PackageListing),
    nextCursor: z.string().nullable(),
}).strict();
export type PackageListPage = z.infer<typeof PackageListPage>;

/** Full marketplace, contracts/b_marketplace.md F2. The catalogue card. */
export const PackageCard = PackageListing.extend({
    installs: z.number().int().nonnegative(),
    updatedAt: z.string(),
    hidden: z.boolean(),
}).strict();
export type PackageCard = z.infer<typeof PackageCard>;

export const PackageCardPage = z.object({
    items: z.array(PackageCard),
    nextCursor: z.string().nullable(),
}).strict();
export type PackageCardPage = z.infer<typeof PackageCardPage>;

export const PackageSort = z.enum(['updated', 'installs', 'title']);
export type PackageSort = z.infer<typeof PackageSort>;

/** Catalogue query. Every field optional; `mine` and `hidden` (admin only) are the literal "1". */
export const PackageCatalogueQuery = z.object({
    q: z.string().trim().min(1).max(100).optional(),
    kind: z.string().trim().min(1).max(40).optional(),
    tag: z.string().trim().min(1).max(40).optional(),
    sort: PackageSort.optional(),
    mine: z.literal('1').optional(),
    hidden: z.literal('1').optional(),
}).strict();
export type PackageCatalogueQuery = z.infer<typeof PackageCatalogueQuery>;

/** The package page for a reader. The author's view of their own package uses the same shape. */
export const PackagePublicPage = PackagePage.extend({
    installs: z.number().int().nonnegative(),
    updatedAt: z.string(),
    hidden: z.boolean(),
    /** Only on an admin's view of a hidden package. */
    takedownReason: z.string().nullable().optional(),
}).strict();
export type PackagePublicPage = z.infer<typeof PackagePublicPage>;

export const PackageReport = z.object({
    reason: z.string().trim().min(1).max(500),
}).strict();
export type PackageReport = z.infer<typeof PackageReport>;

export const PackageTakedown = z.object({
    reason: z.string().trim().min(1).max(500),
}).strict();
export type PackageTakedown = z.infer<typeof PackageTakedown>;

/** F5. Where the piece lands: the manifest hex `anchor` lands on `to`. The shift is done in cube coordinates. */
export const Placement = z.object({
    anchor: HexKey,
    to: HexKey,
}).strict();
export type Placement = z.infer<typeof Placement>;

/** F5. An own sector an install with a placement creates. */
export const OwnSectorPlan = z.object({
    id: z.string(),
    slot: z.object({ x: z.number().int(), y: z.number().int() }).strict(),
    name: z.string(),
}).strict();
export type OwnSectorPlan = z.infer<typeof OwnSectorPlan>;

/** F4. What an install would do to one hex. */
export const InstallOutcome = z.enum(['new', 'replaces chart', 'replaces own', 'conflict', 'already installed']);
export type InstallOutcome = z.infer<typeof InstallOutcome>;

export const InstallPreviewHex = z.object({
    from: HexKey,
    to: HexKey,
    outcome: InstallOutcome,
    /** The manifest marks this hex removed. */
    removes: z.boolean(),
    current: z.object({
        name: z.string(),
        uwp: z.string(),
        treeHash: z.string().nullable(),
    }).strict().nullable(),
}).strict();
export type InstallPreviewHex = z.infer<typeof InstallPreviewHex>;

export const InstallPreview = z.object({
    packageId: z.string(),
    version: z.number().int().positive(),
    /** Null in place. On an update of a placed import, the stored placement. */
    placement: Placement.nullable(),
    hexes: z.array(InstallPreviewHex),
    sectorsCreated: z.array(OwnSectorPlan),
    records: z.object({
        add: z.number().int().nonnegative(),
        replace: z.number().int().nonnegative(),
        conflicts: z.array(z.string()),
    }).strict(),
    bytes: z.number().int().nonnegative(),
    conflicts: z.number().int().nonnegative(),
}).strict();
export type InstallPreview = z.infer<typeof InstallPreview>;

const Choice = z.enum(['theirs', 'mine']);

export const InstallRequest = z.object({
    packageId: z.string().min(1),
    version: z.number().int().positive(),
    /** Omit for in place. Not given with `installId`: an update keeps its stored placement. */
    placement: Placement.optional(),
    /** Update this import (its stored placement is reused). */
    installId: z.string().min(1).optional(),
    resolutions: z.record(z.string(), Choice),
    recordResolutions: z.record(z.string(), Choice),
    expect: z.object({ conflicts: z.number().int().nonnegative() }).strict(),
}).strict().superRefine((value, ctx) => {
    if (value.placement && value.installId) {
        ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['placement'], message: 'an update keeps its placement' });
    }
});
export type InstallRequest = z.infer<typeof InstallRequest>;

export const InstallResult = z.object({
    installId: z.string(),
    written: z.number().int().nonnegative(),
    skipped: z.number().int().nonnegative(),
    records: z.number().int().nonnegative(),
    /** F16. Links written. Absent from a server before 1.2.1. */
    links: z.number().int().nonnegative().optional(),
}).strict();
export type InstallResult = z.infer<typeof InstallResult>;

export const InstallRow = z.object({
    installId: z.string(),
    packageId: z.string(),
    title: z.string(),
    version: z.number().int().positive(),
    latestVersion: z.number().int().nonnegative(),
    updateAvailable: z.boolean(),
    placement: Placement.nullable(),
    hexCount: z.number().int().nonnegative(),
    /** Phase 4: the Remove confirmation says how many records go. */
    recordCount: z.number().int().nonnegative(),
    installedAt: z.string(),
    updatedAt: z.string(),
}).strict();
export type InstallRow = z.infer<typeof InstallRow>;

export const InstallList = z.object({ items: z.array(InstallRow) }).strict();
export type InstallList = z.infer<typeof InstallList>;

/** F14. The answer of removing an import: what was deleted. */
export const InstallRemoved = z.object({
    hexes: z.number().int().nonnegative(),
    records: z.number().int().nonnegative(),
    sectors: z.number().int().nonnegative(),
}).strict();
export type InstallRemoved = z.infer<typeof InstallRemoved>;