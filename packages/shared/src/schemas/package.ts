import { z } from 'zod';

/** data_model.md §7. */
export const PackageHex = z.object({
    baseHash: z.string().nullable().optional(),
    treeHash: z.string().optional(),
    summary: z.record(z.string(), z.unknown()).optional(),
    deleted: z.literal(true).optional(),
});

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
