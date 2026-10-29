import { z } from 'zod';
import { HexKey } from './builder.ts';
import { SURFACE_BODY_KEY, SurfaceEdits } from './surface.ts';

const RECORD_ID = /^cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** data_model.md §7. */
export const PackageHex = z.object({
    baseHash: z.string().nullable().optional(),
    treeHash: z.string().optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    deleted: z.literal(true).optional(),
    /**
     * Painted surfaces for this hex, keyed by dossier body. Absent when the hex has no paint.
     * The system tree and the hex rev do not move when only this changes.
     */
    surfaces: z.record(z.string().regex(SURFACE_BODY_KEY), SurfaceEdits).optional(),
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
/** F18. `hexKeys` may be empty: a records-only version. The route asks for at least one hex or one record. */
export const PackagePublish = z.object({
    universeId: z.string().min(1),
    hexKeys: z.array(HexKey),
    recordIds: z.array(z.string().regex(RECORD_ID)),
}).strict().superRefine((value, ctx) => {
    if (new Set(value.hexKeys).size !== value.hexKeys.length) {
        ctx.addIssue({ code: 'custom', path: ['hexKeys'], message: 'duplicate hex key' });
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

/**
 * F17. A package's cover: the publisher's upload, else the first image of the first record
 * that has one in the latest done version. Both hashes are objects in the public bucket.
 * Null when there is neither; the browser shows the default for the kind.
 */
export const PackageCover = z.object({
    hash: z.string().regex(/^[0-9a-f]{64}$/),
    thumbHash: z.string().regex(/^[0-9a-f]{64}$/),
    source: z.enum(['upload', 'record']),
}).strict();
export type PackageCover = z.infer<typeof PackageCover>;

/** Full marketplace, contracts/b_marketplace.md F2. The catalogue card. */
export const PackageCard = PackageListing.extend({
    /**
     * The latest version's record count, from the same version as `hexCount`; 0 with no version.
     * This server always sends it; optional so a card from an older server still parses.
     */
    recordCount: z.number().int().nonnegative().optional(),
    installs: z.number().int().nonnegative(),
    updatedAt: z.string(),
    hidden: z.boolean(),
    /**
     * F17. Null before 0019, with no cover, and on a hidden package for anyone but an admin.
     * This server always sends it; optional so a card from an older server still parses.
     */
    cover: PackageCover.nullable().optional(),
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
/**
 * The store's kind families, as `apps/web/src/marketplace/covers.ts` `KIND_FAMILIES` maps them:
 * first match in this order, case-insensitive, by keyword anywhere in the kind; no match is `other`.
 * The catalogue's `family=` filters by the same table.
 */
export const PACKAGE_KIND_FAMILIES = [
    { family: 'map', words: ['sector', 'subsector', 'piece', 'map', 'region'] },
    { family: 'system', words: ['system'] },
    { family: 'ship', words: ['ship', 'ships', 'vessel', 'fleet'] },
    { family: 'people', words: ['people', 'contact', 'npc', 'crew', 'character'] },
    { family: 'patrons', words: ['patron', 'job', 'mission', 'hook'] },
    { family: 'organization', words: ['organization', 'organisation', 'faction', 'corporation', 'house'] },
    { family: 'adventure', words: ['adventure', 'scenario', 'event', 'campaign'] },
] as const;
export const PackageFamily = z.enum(['map', 'system', 'ship', 'people', 'patrons', 'organization', 'adventure', 'other']);
export type PackageFamily = z.infer<typeof PackageFamily>;

export const PackageCatalogueQuery = z.object({
    q: z.string().trim().min(1).max(100).optional(),
    kind: z.string().trim().min(1).max(40).optional(),
    /** Repeatable: OR within the key, AND with the other keys. */
    family: z.array(PackageFamily).min(1).max(8).optional(),
    /** A publisher's handle, exact. */
    author: z.string().trim().min(1).max(64).optional(),
    tag: z.string().trim().min(1).max(40).optional(),
    sort: PackageSort.optional(),
    mine: z.literal('1').optional(),
    hidden: z.literal('1').optional(),
}).strict();
export type PackageCatalogueQuery = z.infer<typeof PackageCatalogueQuery>;

/** What a package holds, as the store's Contents section says it: map hexes, or records only. */
export const PackageContents = z.enum(['hexes', 'records']);
export type PackageContents = z.infer<typeof PackageContents>;

/** `GET /api/packages/facets` (Z6). Repeatable keys are OR within the key, AND across keys. */
export const PackageFacetsQuery = z.object({
    q: z.string().trim().min(1).max(100).optional(),
    family: z.array(PackageFamily).min(1).max(8).optional(),
    contents: z.array(PackageContents).min(1).max(2).optional(),
    edition: z.array(z.string().trim().min(1).max(40)).min(1).max(20).optional(),
    tag: z.array(z.string().trim().min(1).max(40)).min(1).max(20).optional(),
    updated: z.enum(['7', '30']).optional(),
    author: z.array(z.string().trim().min(1).max(64)).min(1).max(20).optional(),
}).strict();
export type PackageFacetsQuery = z.infer<typeof PackageFacetsQuery>;

const FacetCount = z.number().int().nonnegative();
export const PackageFacet = z.object({ value: z.string(), count: FacetCount });
export type PackageFacet = z.infer<typeof PackageFacet>;

/**
 * The store's column over the whole catalogue for a query. Each section's counts are taken over the
 * packages every other section lets through; `total` passes every section. `scanned` packages
 * matched `q`; `capped` is true when there were more than the server counts.
 */
export const PackageFacets = z.object({
    total: FacetCount,
    scanned: FacetCount,
    capped: z.boolean(),
    kinds: z.array(z.object({ value: PackageFamily, count: FacetCount })),
    contents: z.array(z.object({ value: PackageContents, count: FacetCount })),
    editions: z.array(PackageFacet),
    tags: z.array(PackageFacet),
    updated: z.array(z.object({ value: z.enum(['7', '30', '']), count: FacetCount })),
    by: z.array(PackageFacet),
});
export type PackageFacets = z.infer<typeof PackageFacets>;

/** The package page for a reader. The author's view of their own package uses the same shape. */
export const PackagePublicPage = PackagePage.extend({
    installs: z.number().int().nonnegative(),
    updatedAt: z.string(),
    hidden: z.boolean(),
    /** F17. As on the card. */
    cover: PackageCover.nullable().optional(),
    /** As on the card: the latest version's record count. Optional for an older server. */
    recordCount: z.number().int().nonnegative().optional(),
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
        /** F18. Own-sector anchors a records-only import drops. Absent from a server before F18. */
        anchorsDropped: z.number().int().nonnegative().optional(),
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
        ctx.addIssue({ code: 'custom', path: ['placement'], message: 'an update keeps its placement' });
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