import { z } from 'zod';

/** The twelve generation keys pinned for truth. tools/truth/settings.js. */
export const Settings = z.object({
    generationPopMax: z.number(),
    generationPopMod: z.number(),
    generationTlMax: z.number(),
    generationTlMod: z.number(),
    generationUseRealisticStellar: z.boolean(),
    generationUseTlFloor: z.boolean(),
    generationRttSettlement: z.number(),
    generationRttTL: z.number(),
    generationStarportMax: z.string(),
    generationStarportMod: z.number(),
    generationNoTravelZones: z.boolean(),
    generationPopCheckFrequency: z.number(),
}).strict();
export type Settings = z.infer<typeof Settings>;

export const Milieu = z.string().regex(/^M\d{4}$/);

/** POST /api/generate/preview body. */
export const GeneratePreview = z.object({
    edition: z.string(),
    mode: z.string(),
    seed: z.string(),
    settings: Settings,
    hexKey: z.string(),
    inputs: z.unknown(),
});
export type GeneratePreview = z.infer<typeof GeneratePreview>;

/** POST /api/generate body. */
export const GenerateRequest = z.object({
    hexKeys: z.array(z.string()),
    edition: z.string(),
    mode: z.string(),
    stage: z.string().optional(),
});
export type GenerateRequest = z.infer<typeof GenerateRequest>;

/** POST /api/generate/sector body. */
export const GenerateSector = z.object({
    sectorSlug: z.string(),
    density: z.number(),
    edition: z.string(),
    mode: z.string(),
});
export type GenerateSector = z.infer<typeof GenerateSector>;

/** POST /api/admin/truth/build body. sectors are slug strings, or "all" for every catalogue slug. */
export const TruthBuild = z.object({
    milieu: Milieu,
    version: z.string(),
    engineVersion: z.string(),
    seed: z.string(),
    settings: Settings,
    sectors: z.union([z.literal('all'), z.array(z.string())]),
    from: z.string().optional(),
});
export type TruthBuild = z.infer<typeof TruthBuild>;

/** POST /api/admin/truth/builds/:version/retry body. Absent sectors retries every failed sector. */
export const TruthRetry = z.object({
    sectors: z.array(z.string()).optional(),
});
export type TruthRetry = z.infer<typeof TruthRetry>;
