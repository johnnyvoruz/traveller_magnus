import { z } from 'zod';
import { CAMPAIGN_LIMITS } from './campaign.ts';

/**
 * Owner's on/off switch. `showReferee` is optional so a 1.2.x tab can still send `{ public }` alone.
 * The server ignores `showReferee` until migration 0018 is applied.
 */
export const PublicGamesSetting = z.object({
    public: z.boolean(),
    showReferee: z.boolean().optional(),
}).strict();
export type PublicGamesSetting = z.infer<typeof PublicGamesSetting>;

const LOCAL_HEX = /^\d{4}$/;

/** Ships named on one hex. `count` stays the full number when this list is shorter. */
export const PUBLIC_SHIPS_PER_HEX = 20;

/** Names aboard one public ship, in party order. A longer crew is cut here. */
export const PUBLIC_NAMES_PER_SHIP = 20;

/** Public journal entries on one card, newest first. */
export const PUBLIC_CARD_ENTRIES = 20;

/**
 * Characters of one public entry body. A stored journal body may be 100,000 characters.
 * The card is copied onto each ship, and 2,000 characters is what the card shows.
 */
export const PUBLIC_CARD_BODY = 2_000;

/** Bytes of `legs` plus `journal` stored on one ship. A longer card drops the oldest legs, then the oldest notes. */
export const PUBLIC_CARD_BYTES = 100_000;

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
    journal: z.array(PublicJournalNote).max(PUBLIC_CARD_ENTRIES),
}).strict();
export type PublicShipCard = z.infer<typeof PublicShipCard>;
