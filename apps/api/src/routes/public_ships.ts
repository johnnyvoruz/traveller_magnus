import { PublicShipCard } from '@voyage/shared';
import { detectPublicCards, publicCardsReady } from '../auth/public_schema';
import { requireUser, type AppContext } from '../auth/session';
import { fail } from '../http';
import { publicLimited } from './public_games';

export const PUBLIC_CARD_UNAVAILABLE = 'Public ship cards are not available yet.';

const MARK = /^pm_[0-9A-HJKMNP-TV-Z]{26}$/;

function names(text: string): string[] {
    try {
        const parsed = JSON.parse(text) as unknown;
        return Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === 'string') : [];
    } catch {
        return [];
    }
}

function parseList(text: string): unknown {
    try {
        const parsed = JSON.parse(text) as unknown;
        return Array.isArray(parsed) ? parsed : [];
    } catch {
        return [];
    }
}

/** The public card. Signed in or out, once migration 0018 is applied. */
export async function getPublicShip(c: AppContext): Promise<Response> {
    c.header('cache-control', 'private, no-store');
    await detectPublicCards(c.env.DB);
    const actor = await requireUser(c);
    let callerId: string | null = null;
    if (actor instanceof Response) {
        if (!(publicCardsReady() && actor.status === 401)) return actor;
    } else {
        callerId = actor.id;
    }
    if (!publicCardsReady()) return fail(c, 503, 'public_card_unavailable', PUBLIC_CARD_UNAVAILABLE);
    if (publicLimited(c, callerId)) return fail(c, 429, 'rate_limited', 'Too many requests.');
    const mark = c.req.param('mark') ?? '';
    if (!MARK.test(mark)) return fail(c, 404, 'not_found', 'No such ship.');
    const row = await c.env.DB.prepare(
        `SELECT u.name AS game, u.example AS example,
                CASE WHEN u.show_referee = 1 THEN (SELECT handle FROM profile WHERE user_id = u.owner_id) ELSE NULL END AS referee,
                s.ship_name AS ship, s.aboard_names AS aboard, c.legs AS legs, c.journal AS journal
         FROM public_cards c
         JOIN public_ships s ON s.mark_id = c.mark_id
         JOIN universes u ON u.id = c.universe_id
         WHERE c.mark_id = ? AND u.deleted_at IS NULL AND u.public_games = 1`,
    ).bind(mark).first<{
        game: string;
        example: number;
        referee: string | null;
        ship: string;
        aboard: string;
        legs: string;
        journal: string;
    }>();
    if (!row) return fail(c, 404, 'not_found', 'No such ship.');
    const parsed = PublicShipCard.safeParse({
        game: row.game,
        referee: typeof row.referee === 'string' ? row.referee : null,
        example: Number(row.example) === 1,
        ship: row.ship,
        aboard: names(row.aboard),
        legs: parseList(row.legs),
        journal: parseList(row.journal),
    });
    if (!parsed.success) return fail(c, 404, 'not_found', 'No such ship.');
    return c.json(parsed.data);
}
