import { z } from 'zod';
import { Milieu, Settings } from './generate.ts';

export const SectorHex = z.object({
    tree: z.string().nullable(),
    partial: z.enum(['full', 'partial']).nullable(),
    type: z.string(),
    name: z.string().optional(),
    uwp: z.string().optional(),
    allegiance: z.string().optional(),
    zone: z.string().optional(),
    bases: z.string().optional(),
    tradeCodes: z.array(z.string()).optional(),
    pbg: z.string().optional(),
    ix: z.number().optional(),
    summary: z.record(z.string(), z.unknown()),
});
export type SectorHex = z.infer<typeof SectorHex>;

/** data_model.md §5 sectors/<slug>/index.json */
export const SectorIndex = z.object({
    slug: z.string(),
    name: z.string(),
    x: z.number(),
    y: z.number(),
    truthVersion: z.string(),
    hexes: z.record(z.string(), SectorHex),
    metadata: z.object({
        routes: z.array(z.unknown()),
        borders: z.array(z.unknown()),
        names: z.record(z.string(), z.string()),
    }),
    wiki: z.record(z.string(), z.unknown()).optional(),
});
export type SectorIndex = z.infer<typeof SectorIndex>;

/** data_model.md §5 manifest.json */
export const TruthManifest = z.object({
    truthVersion: z.string(),
    milieu: Milieu,
    seed: z.string(),
    settings: Settings,
    engineVersion: z.string(),
    attribution: z.string().optional(),
    releasedAt: z.string().optional(),
    sectors: z.array(z.object({
        slug: z.string(),
        name: z.string(),
        x: z.number(),
        y: z.number(),
        systems: z.number(),
        indexHash: z.string(),
    })),
});
export type TruthManifest = z.infer<typeof TruthManifest>;
