/**
 * The X-boat ripple parameters (spec_xboat_ripples.md §1.4). One object.
 * Cited numbers stay cited. Johnny 2026-10-17 20:27 set the defaults the
 * rules do not: station hold 0, the bare route rule, off-network within
 * 2 parsecs, and no off-network wait yet.
 *
 * Zod 3 lives with @voyage/shared. The app does not import the root zod.
 */
import { z } from '../../../../packages/shared/node_modules/zod/index.js';

/** `rules/mgt2e_space_travel.json` `jump.durationHours`: base hours plus that many D. */
export const JumpHours = z.object({
    base: z.number().finite(),
    dice: z.number().int().positive(),
}).strict();
export type JumpHours = z.infer<typeof JumpHours>;

/**
 * `bare`: no Allegiance, no Type, no Color, plus Type "Xboat".
 * `chart`: no Allegiance and no Color.
 * `allegiances:<codes>`: those Allegiance codes, on top of `bare`.
 */
export const RouteRule = z.string().regex(/^(bare|chart|allegiances:[^,]+(,[^,]+)*)$/);

export const NewsParams = z.object({
    jumpHours: JumpHours,
    xboatLegHours: JumpHours,
    stationHoldHours: z.number().finite(),
    xboatMaxParsecs: z.number().int().positive(),
    xboatRouteRule: RouteRule,
    offNetworkOn: z.boolean(),
    offNetworkParsecs: z.number().int().positive(),
    offNetworkWaitHours: z.number().finite().nullable(),
    horizonDays: z.number().int().positive(),
    sectorCap: z.number().int().positive(),
}).strict();
export type NewsParams = z.infer<typeof NewsParams>;

/** All 1s, the mean (3.5 per die), and all 6s. Arithmetic over the cited dice, not a roll. */
export function jumpSpan(hours: JumpHours): { earliest: number; likely: number; latest: number } {
    return {
        earliest: hours.base + hours.dice,
        likely: hours.base + hours.dice * 3.5,
        latest: hours.base + hours.dice * 6,
    };
}

export const NEWS_PARAMS: NewsParams = NewsParams.parse({
    // rules/mgt2e_space_travel.json jump.durationHours. 148 + 6D is 154 / 169 / 184 hours.
    jumpHours: { base: 148, dice: 6 },
    // The same jump. Nothing in the rules says an X-boat leg is faster or slower.
    xboatLegHours: { base: 148, dice: 6 },
    // No rule gives a station wait. Johnny 20:27: 0 until he gives a number.
    stationHoldHours: 0,
    // rules/guideline_4_4_trade_density_and_interconnectivity.md line 5: capable of Jump-4.
    // Johnny 20:27: the longer routes stay in the data; raising this setting keeps them.
    xboatMaxParsecs: 4,
    // Johnny 20:27 question 37: bare records plus Type "Xboat".
    xboatRouteRule: 'bare',
    // Johnny 20:27: off-network traffic within 2 parsecs is on.
    offNetworkOn: true,
    // assets/2eWorldCreation.txt 132-137: a trade route needs a jump-1 or jump-2 path. The spec reads that as 2.
    offNetworkParsecs: 2,
    // No rule gives the wait for a ship. Johnny 20:27: X-boat only until he gives the hours.
    offNetworkWaitHours: null,
    // Product, Johnny's "day 0 to day 60". Not a rule.
    horizonDays: 60,
    // Product: at most nine sectors in one ripple.
    sectorCap: 9,
});
