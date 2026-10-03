import { z } from 'zod';
import { Milieu, Settings } from './generate.ts';

/** Chart row stored once. stars is omitted when the chart has no Stars column. */
export const SectorHex = z.object({
    tree: z.string().nullable(),
    type: z.string(),
    name: z.string(),
    uwp: z.string(),
    allegiance: z.string(),
    zone: z.string(),
    bases: z.string(),
    tradeCodes: z.array(z.string()),
    pbg: z.string(),
    ix: z.number(),
    stars: z.string().optional(),
    partial: z.enum(['full', 'partial']).nullable(),
}).strict();
export type SectorHex = z.infer<typeof SectorHex>;

/** data_model.md §5 sectors/<slug>/index.json */
export const SectorIndex = z.object({
    slug: z.string(),
    name: z.string(),
    x: z.number(),
    y: z.number(),
    tags: z.array(z.string()),
    canonical: z.boolean(),
    truthVersion: z.string(),
    systems: z.number(),
    built: z.number(),
    partial: z.number(),
    hexes: z.record(z.string(), SectorHex),
    metadata: z.object({
        routes: z.array(z.unknown()),
        borders: z.array(z.unknown()),
        names: z.record(z.string(), z.string()),
    }),
}).strict();
export type SectorIndex = z.infer<typeof SectorIndex>;

/** data_model.md §5 manifest.json. releasedAt is set by the release endpoint, not a local build. */
export const TruthManifest = z.object({
    truthVersion: z.string(),
    milieu: Milieu,
    seed: z.string(),
    settings: Settings,
    engineVersion: z.string(),
    overviewHash: z.string(),
    attribution: z.string(),
    releasedAt: z.string().optional(),
    sectors: z.array(z.object({
        slug: z.string(),
        name: z.string(),
        x: z.number(),
        y: z.number(),
        tags: z.array(z.string()),
        canonical: z.boolean(),
        systems: z.number(),
        built: z.number(),
        partial: z.number(),
        indexHash: z.string(),
    }).strict()),
}).strict();
export type TruthManifest = z.infer<typeof TruthManifest>;

/** data_model.md §5 overview.json: one entry per sector, one character per hex. */
export const SectorOverview = z.object({
    slug: z.string(), name: z.string(), x: z.number(), y: z.number(),
    tags: z.array(z.string()), canonical: z.boolean(), systems: z.number(),
    cells: z.string().length(1280),
}).strict();
export type SectorOverview = z.infer<typeof SectorOverview>;

export const TruthOverview = z.object({
    truthVersion: z.string(),
    sectors: z.array(SectorOverview),
}).strict();
export type TruthOverview = z.infer<typeof TruthOverview>;
