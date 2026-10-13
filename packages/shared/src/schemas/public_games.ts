import { z } from 'zod';

/** Owner's on/off switch. `.strict()`. */
export const PublicGamesSetting = z.object({
    public: z.boolean(),
}).strict();
export type PublicGamesSetting = z.infer<typeof PublicGamesSetting>;

const LOCAL_HEX = /^\d{4}$/;

/** One hex on the public layer. `name` is set only when `count` is 1. */
export const PublicGamesHex = z.object({
    hex: z.string().regex(LOCAL_HEX),
    count: z.number().int().positive(),
    name: z.string().nullable(),
}).strict();
export type PublicGamesHex = z.infer<typeof PublicGamesHex>;

/** The sector feed. One entry per local hex, at most 1,280. */
export const PublicGamesSector = z.object({
    hexes: z.array(PublicGamesHex).max(1280),
}).strict();
export type PublicGamesSector = z.infer<typeof PublicGamesSector>;

/** Chart slug. An own sector id (`~`) is not a public sector. */
export const PublicGamesSectorSlug = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/);

/** Released truth version string. Existence is not checked here. */
export const PublicGamesTruthVersion = z.string().min(1).max(64);
