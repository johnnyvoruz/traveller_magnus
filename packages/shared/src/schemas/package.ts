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
    truthVersion: z.string(),
    hexes: z.record(z.string(), PackageHex),
    lists: z.object({
        routes: z.string(),
        borderPaths: z.string(),
    }),
    records: z.object({
        contentHash: z.string(),
        count: z.number(),
        imageHashes: z.array(z.string()),
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
