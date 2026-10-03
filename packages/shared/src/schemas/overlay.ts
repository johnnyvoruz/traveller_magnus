import { z } from 'zod';
import { Milieu } from './generate.ts';

/** data_model.md §6. */
export const OverlaySector = z.object({
    slug: z.string(),
    x: z.number(),
    y: z.number(),
});

export const OverlayBase = z.object({
    milieu: Milieu,
    truthVersion: z.string(),
    engineVersion: z.string(),
    sectors: z.array(OverlaySector),
});
export type OverlayBase = z.infer<typeof OverlayBase>;

export const Tombstone = z.object({
    deleted: z.literal(true),
    rev: z.number(),
    updatedAt: z.string(),
});
export type Tombstone = z.infer<typeof Tombstone>;

const HEX_KEY = /^[^/]+\/\d{4}$/;

export const OverlayDoc = z.object({
    base: OverlayBase.nullable(),
    hexes: z.record(z.string(), z.union([Tombstone, z.record(z.string(), z.unknown())])),
}).superRefine((doc, ctx) => {
    for (const key of Object.keys(doc.hexes)) {
        if (!HEX_KEY.test(key)) {
            ctx.addIssue({ code: z.ZodIssueCode.custom, message: `hex key ${key} is not <slug>/<hhhh>`, path: ['hexes', key] });
        }
    }
});
export type OverlayDoc = z.infer<typeof OverlayDoc>;
