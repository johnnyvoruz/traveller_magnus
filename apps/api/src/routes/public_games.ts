import {
    PUBLIC_OVERVIEW_MAX,
    PUBLIC_SHIPS_PER_HEX,
    PublicGamesOverviewHex,
    PublicGamesSectorSlug,
    PublicGamesSetting,
    PublicGamesTruthVersion,
} from '@voyage/shared';
import { detectPublicCards, detectPublicGames, detectPublicShips, publicCardsReady, publicGamesReady, publicShipsReady, readPublicGames } from '../auth/public_schema';
import { requireUser, type AppContext } from '../auth/session';
import { fail } from '../http';
import type { Env } from '../env';
import { deletePublicMark, placeTouched, writePublicMark } from '../universe/public_mark';
import type { OwnedUniverse } from '../universe/forward';

export const PUBLIC_GAMES_UNAVAILABLE = 'Public games are not available yet.';

const WINDOW_MS = 60 * 1000;
const LIMIT = 60;
const hits = new Map<string, number[]>();

function rateLimited(key: string): boolean {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= LIMIT) {
        hits.set(key, recent);
        return true;
    }
    recent.push(now);
    hits.set(key, recent);
    return false;
}

/** Signed-in callers count by user id. Signed-out callers count by `CF-Connecting-IP`. */
export function publicLimited(c: AppContext, userId: string | null): boolean {
    const ip = c.req.header('cf-connecting-ip') || 'local';
    return rateLimited(userId ?? `ip:${ip}`);
}

export async function getPublicGames(c: AppContext): Promise<Response> {
    c.header('cache-control', 'private, no-store');
    await detectPublicGames(c.env.DB);
    await detectPublicShips(c.env.DB);
    await detectPublicCards(c.env.DB);
    const actor = await requireUser(c);
    let callerId: string | null;
    if (actor instanceof Response) {
        if (!(publicCardsReady() && actor.status === 401)) return actor;
        callerId = null;
    } else {
        callerId = actor.id;
    }
    if (publicLimited(c, callerId)) return fail(c, 429, 'rate_limited', 'Too many requests.');
    if (!publicGamesReady()) return c.json({ hexes: [] });
    const truthVersion = c.req.query('truthVersion');
    const sector = c.req.query('sector');
    if (truthVersion === undefined || truthVersion === '') {
        return fail(c, 400, 'validation', 'truthVersion is required.');
    }
    if (sector === undefined || sector === '') return fail(c, 400, 'validation', 'sector is required.');
    if (!PublicGamesTruthVersion.safeParse(truthVersion).success || !PublicGamesSectorSlug.safeParse(sector).success) {
        return fail(c, 400, 'validation', 'Invalid request.');
    }
    if (publicShipsReady()) return c.json({ hexes: await shipHexes(c.env, truthVersion, sector, callerId, publicCardsReady()) });
    if (!callerId) return c.json({ hexes: [] });
    const listed = await c.env.DB.prepare(
        `SELECT m.local_hex AS hex, u.name AS name
         FROM public_marks m
         JOIN universes u ON u.id = m.universe_id
         WHERE m.truth_version = ? AND m.sector_slug = ? AND u.deleted_at IS NULL AND u.public_games = 1
           AND u.owner_id != ?`,
    ).bind(truthVersion, sector, callerId).all<{ hex: string; name: string }>();
    const names = new Map<string, string[]>();
    for (const row of listed.results ?? []) {
        const have = names.get(row.hex) ?? [];
        have.push(row.name);
        names.set(row.hex, have);
    }
    const hexes = [...names.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, 1280)
        .map(([hex, group]) => ({
            hex,
            count: group.length,
            name: group.length === 1 ? group[0] : null,
        }));
    return c.json({ hexes });
}

function aboardNames(text: string): string[] {
    try {
        const parsed = JSON.parse(text) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((item): item is string => typeof item === 'string');
    } catch {
        return [];
    }
}

async function shipHexes(env: Env, truthVersion: string, sector: string, callerId: string | null, withExample: boolean) {
    const owner = callerId ? ' AND u.owner_id != ?' : '';
    const example = withExample ? ', u.example AS example' : '';
    const query = env.DB.prepare(
        `SELECT m.local_hex AS hex, u.name AS game, m.mark_id AS mark, m.ship_name AS ship, m.aboard_names AS aboard${example}
         FROM public_ships m
         JOIN universes u ON u.id = m.universe_id
         WHERE m.truth_version = ? AND m.sector_slug = ? AND u.deleted_at IS NULL AND u.public_games = 1${owner}`,
    );
    const bound = callerId ? query.bind(truthVersion, sector, callerId) : query.bind(truthVersion, sector);
    const listed = await bound.all<{ hex: string; game: string; mark: string; ship: string; aboard: string; example?: number }>();
    const groups = new Map<string, { game: string; mark: string; ship: string; aboard: string[]; example?: boolean }[]>();
    for (const row of listed.results ?? []) {
        const have = groups.get(row.hex) ?? [];
        const ship: { game: string; mark: string; ship: string; aboard: string[]; example?: boolean } = {
            game: row.game,
            mark: row.mark,
            ship: row.ship,
            aboard: aboardNames(row.aboard),
        };
        if (withExample) ship.example = Number(row.example) === 1;
        have.push(ship);
        groups.set(row.hex, have);
    }
    return [...groups.entries()]
        .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
        .slice(0, 1280)
        .map(([hex, group]) => {
            const ships = [...group].sort((a, b) => (a.mark < b.mark ? -1 : a.mark > b.mark ? 1 : 0));
            return {
                hex,
                count: ships.length,
                name: ships.length === 1 ? ships[0]!.game : null,
                ships: ships.slice(0, PUBLIC_SHIPS_PER_HEX).map((ship) => {
                    const item: { mark: string; ship: string; aboard: string[]; example?: boolean } = {
                        mark: ship.mark,
                        ship: ship.ship,
                        aboard: ship.aboard,
                    };
                    if (ship.example !== undefined) item.example = ship.example;
                    return item;
                }),
            };
        });
}

/** Zoomed-out counts. The same body for every caller, so the success answer is cacheable. */
export async function getPublicOverview(c: AppContext): Promise<Response> {
    await detectPublicGames(c.env.DB);
    await detectPublicShips(c.env.DB);
    await detectPublicCards(c.env.DB);
    const actor = await requireUser(c);
    let callerId: string | null;
    if (actor instanceof Response) {
        if (!(publicCardsReady() && actor.status === 401)) return actor;
        callerId = null;
    } else {
        callerId = actor.id;
    }
    if (publicLimited(c, callerId)) return fail(c, 429, 'rate_limited', 'Too many requests.');
    const truthVersion = c.req.query('truthVersion');
    if (truthVersion === undefined || truthVersion === '') {
        return fail(c, 400, 'validation', 'truthVersion is required.');
    }
    if (!PublicGamesTruthVersion.safeParse(truthVersion).success) {
        return fail(c, 400, 'validation', 'Invalid request.');
    }
    if (!publicShipsReady()) return c.json({ hexes: [] }, 200, { 'cache-control': 'public, max-age=60' });
    const listed = await c.env.DB.prepare(
        `SELECT m.sector_slug || '/' || m.local_hex AS key, COUNT(*) AS count
         FROM public_ships m
         JOIN universes u ON u.id = m.universe_id
         WHERE m.truth_version = ?
           AND u.deleted_at IS NULL
           AND u.public_games = 1
           AND m.sector_slug NOT LIKE '~%'
           AND length(m.local_hex) = 4
           AND m.local_hex GLOB '[0-9][0-9][0-9][0-9]'
         GROUP BY m.sector_slug, m.local_hex
         ORDER BY m.sector_slug, m.local_hex
         LIMIT ?`,
    ).bind(truthVersion, PUBLIC_OVERVIEW_MAX).all<{ key: string; count: number }>();
    const hexes = [];
    for (const row of listed.results ?? []) {
        const parsed = PublicGamesOverviewHex.safeParse({ key: row.key, count: Number(row.count) });
        if (parsed.success) hexes.push(parsed.data);
    }
    return c.json({ hexes }, 200, { 'cache-control': 'public, max-age=60' });
}

export async function setPublicGames(c: AppContext, owned: OwnedUniverse): Promise<Response> {
    await detectPublicGames(c.env.DB);
    await detectPublicCards(c.env.DB);
    const current = await readPublicGames(c.env.DB, owned.row.id);
    if (!publicGamesReady() || current === null) {
        return fail(c, 503, 'public_games_unavailable', PUBLIC_GAMES_UNAVAILABLE);
    }
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
    const parsed = PublicGamesSetting.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.');
    const flag = parsed.data.public ? 1 : 0;
    const now = new Date().toISOString();
    const cards = publicCardsReady();
    if (cards && parsed.data.showReferee !== undefined) {
        await c.env.DB.prepare(
            `UPDATE universes SET public_games = ?, show_referee = ?, updated_at = ? WHERE id = ?`,
        ).bind(flag, parsed.data.showReferee ? 1 : 0, now, owned.row.id).run();
    } else {
        await c.env.DB.prepare(
            `UPDATE universes SET public_games = ?, updated_at = ? WHERE id = ?`,
        ).bind(flag, now, owned.row.id).run();
    }
    if (flag === 1) await writePublicMark(c.env, owned.row.id, owned.row.truthVersion);
    else await deletePublicMark(c.env, owned.row.id);
    if (!cards) return c.json({ public: parsed.data.public });
    const row = await c.env.DB.prepare(
        `SELECT show_referee AS showReferee FROM universes WHERE id = ?`,
    ).bind(owned.row.id).first<{ showReferee: number }>();
    return c.json({ public: parsed.data.public, showReferee: Number(row?.showReferee) === 1 });
}

/** After a campaign save. No D1 call when 0013 is absent or the save failed. */
export async function refreshAfterCampaign(env: Env, owned: OwnedUniverse, response: Response): Promise<void> {
    if (!response.ok) return;
    await detectPublicGames(env.DB);
    const flag = await readPublicGames(env.DB, owned.row.id);
    if (flag !== 1) return;
    const body = await response.clone().json() as { data?: { applied?: { table: string }[] } };
    const applied = body.data?.applied ?? [];
    if (!placeTouched(applied)) return;
    await writePublicMark(env, owned.row.id, owned.row.truthVersion);
}
