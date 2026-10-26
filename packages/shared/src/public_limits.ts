/**
 * The public-games card limits. No zod, so the map and the Worker read them without the schema
 * library. `schemas/public_games.ts` re-exports these names.
 */

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

/**
 * Bytes of `legs`, `course`, and `journal` stored on one ship.
 * A longer card drops the oldest finished legs, then the oldest notes. The course is kept.
 */
export const PUBLIC_CARD_BYTES = 100_000;
