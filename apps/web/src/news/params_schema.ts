/**
 * The zod schema for the X-boat ripple parameters in `params.ts`. The map does not load it:
 * `params.ts` holds the values and the types with no schema library, so the first paint stays
 * free of zod (ZP2). tests/web/news_graph.test.js checks that NEWS_PARAMS passes this schema
 * and that a bad route rule or a wait of 12 hours is judged as before.
 *
 * The schema package is the root zod, the same 4 the shared package uses.
 * The map does not import this file.
 */
import { z } from 'zod';

/** `rules/mgt2e_space_travel.json` `jump.durationHours`: base hours plus that many D. */
export const JumpHours = z.object({
    base: z.number().finite(),
    dice: z.number().int().positive(),
}).strict();

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
