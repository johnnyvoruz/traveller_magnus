import { z } from 'zod';
import { CAMPAIGN_LIMITS } from './campaign.ts';
import { PUBLIC_CARD_BODY, PUBLIC_CARD_BYTES, PUBLIC_CARD_ENTRIES, PUBLIC_NAMES_PER_SHIP, PUBLIC_SHIPS_PER_HEX } from '../public_limits.ts';

/** The card limits live in `../public_limits.ts`, which has no zod. They are re-exported here. */
export { PUBLIC_CARD_BODY, PUBLIC_CARD_BYTES, PUBLIC_CARD_ENTRIES, PUBLIC_NAMES_PER_SHIP, PUBLIC_SHIPS_PER_HEX };

/**
 * Owner's on/off switch. `showReferee` is optional so a 1.2.x tab can still send `{ public }` alone.
 * The server ignores `showReferee` until migration 0018 is applied.
 */
export const PublicGamesSetting = z.object({
    public: z.boolean(),
    showReferee: z.boolean().optional(),
    /**
     * The referee's course switch. Optional so a tab can still send `{ public }` alone.
     * The server refuses `showCourse` until migration 0020 is applied.
     */
    showCourse: z.boolean().optional(),
}).strict();
export type PublicGamesSetting = z.infer<typeof PublicGamesSetting>;

const LOCAL_HEX = /^\d{4}$/;

const MARK_ID = /^pm_[0-9A-HJKMNP-TV-Z]{26}$/;

/** One public ship on a hex. `mark` is stable for that ship and is not a record id. */
export const PublicShipMark = z.object({
    mark: z.string().regex(MARK_ID),
    ship: z.string().min(1).max(CAMPAIGN_LIMITS.name),
    aboard: z.array(z.string().min(1).max(CAMPAIGN_LIMITS.name)).max(PUBLIC_NAMES_PER_SHIP),
    /** Present once migration 0018 is applied. */
    example: z.boolean().optional(),
}).strict();
export type PublicShipMark = z.infer<typeof PublicShipMark>;

/**
 * One hex on the public layer. `name` is set only when `count` is 1.
 * `ships` is present once migration 0017 is applied. A 1.2.0 tab reads `hex`, `count`, and `name` and leaves `ships` unread.
 */
export const PublicGamesHex = z.object({
    hex: z.string().regex(LOCAL_HEX),
    count: z.number().int().positive(),
    name: z.string().nullable(),
    ships: z.array(PublicShipMark).max(PUBLIC_SHIPS_PER_HEX).optional(),
}).strict();
export type PublicGamesHex = z.infer<typeof PublicGamesHex>;

/** The sector feed. One entry per local hex, at most 1,280. */
export const PublicGamesSector = z.object({
    hexes: z.array(PublicGamesHex).max(1280),
}).strict();
export type PublicGamesSector = z.infer<typeof PublicGamesSector>;

/** Hexes returned by one overview. Past this, the rest are omitted, in key order. */
export const PUBLIC_OVERVIEW_MAX = 20_000;

/** One hex on the zoomed-out feed. `key` is `sector/1910`. `count` is public ships there. */
export const PublicGamesOverviewHex = z.object({
    key: z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\/\d{4}$/),
    count: z.number().int().positive(),
}).strict();
export type PublicGamesOverviewHex = z.infer<typeof PublicGamesOverviewHex>;

/** The zoomed-out feed. The same body for every caller. */
export const PublicGamesOverview = z.object({
    hexes: z.array(PublicGamesOverviewHex).max(PUBLIC_OVERVIEW_MAX),
}).strict();
export type PublicGamesOverview = z.infer<typeof PublicGamesOverview>;

/** Chart slug. An own sector id (`~`) is not a public sector. */
export const PublicGamesSectorSlug = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/);

/** Released truth version string. Existence is not checked here. */
export const PublicGamesTruthVersion = z.string().min(1).max(64);

const HEX_KEY = /^[^/]+\/\d{4}$/;

/** One finished leg. `from` and `to` are system hex keys. No body, point, or note. */
export const PublicFinishedLeg = z.object({
    from: z.string().regex(HEX_KEY),
    to: z.string().regex(HEX_KEY),
    departs: z.number().finite().nonnegative(),
    arrives: z.number().finite().nonnegative(),
}).strict();
export type PublicFinishedLeg = z.infer<typeof PublicFinishedLeg>;

/** One public journal entry. No id, anchor, or mention. */
export const PublicJournalNote = z.object({
    title: z.string().max(CAMPAIGN_LIMITS.entryTitle),
    body: z.string().max(PUBLIC_CARD_BODY),
    when: z.object({
        year: z.number().int(),
        day: z.number().int().min(1).max(365),
    }).strict().nullable(),
    realDate: z.string().nullable(),
}).strict();
export type PublicJournalNote = z.infer<typeof PublicJournalNote>;

/** `GET /api/public-ships/:mark`. */
export const PublicShipCard = z.object({
    game: z.string().min(1).max(CAMPAIGN_LIMITS.name),
    referee: z.string().nullable(),
    example: z.boolean(),
    ship: z.string().min(1).max(CAMPAIGN_LIMITS.name),
    aboard: z.array(z.string().min(1).max(CAMPAIGN_LIMITS.name)).max(PUBLIC_NAMES_PER_SHIP),
    legs: z.array(PublicFinishedLeg).max(CAMPAIGN_LIMITS.track),
    /**
     * The leg under way, then the planned legs. Same shape as `legs`.
     * Empty when nothing ahead is a chart hex, or when the game's course switch is off.
     * An open 1.2.2 tab drops this key.
     */
    course: z.array(PublicFinishedLeg).max(CAMPAIGN_LIMITS.track),
    journal: z.array(PublicJournalNote).max(PUBLIC_CARD_ENTRIES),
    /**
     * The ship sheet's Class box, copied when the ship was made public.
     * Null when that box was empty. Absent on a card read before migration 0026.
     */
    shipClass: z.string().min(1).max(CAMPAIGN_LIMITS.name).nullable().optional(),
}).strict();
export type PublicShipCard = z.infer<typeof PublicShipCard>;
