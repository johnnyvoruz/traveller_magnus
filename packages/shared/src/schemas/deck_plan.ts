import { z } from 'zod';

/**
 * A ship exported by the Geomorph Shipyard. The JSON is the ship.
 * Reject unless meta is the shipyard marker, parts is an array, and every
 * part has a code and a corner. Name and part count are capped.
 */
export const DECK_PLAN_LIMITS = {
    name: 200,
    parts: 2_000,
} as const;

const DeckPart = z.object({
    code: z.string().min(1),
    corner: z.tuple([z.number().finite(), z.number().finite()]),
    rotation: z.union([z.literal(0), z.literal(90), z.literal(180), z.literal(270)]),
    mirror: z.boolean().optional(),
    overlay: z.boolean().optional(),
});

export type DeckPlanPart = z.infer<typeof DeckPart>;

export const DeckPlan = z.object({
    meta: z.literal('Traveller Geomorph Ship'),
    name: z.string().max(DECK_PLAN_LIMITS.name),
    parts: z.array(DeckPart).max(DECK_PLAN_LIMITS.parts),
});

export type DeckPlan = z.infer<typeof DeckPlan>;
