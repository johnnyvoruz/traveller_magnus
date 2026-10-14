import {
    PublicGamesSectorSlug,
    PublicGamesSetting,
    PublicGamesTruthVersion,
} from '@voyage/shared';
import { detectPublicGames, publicGamesReady, readPublicGames } from '../auth/public_schema';
import { requireUser, type AppContext } from '../auth/session';
import { fail } from '../http';
import type { Env } from '../env';
import { deletePublicMark, placeTouched, writePublicMark } from '../universe/public_mark';
import type { OwnedUniverse } from '../universe/forward';

export const PUBLIC_GAMES_UNAVAILABLE = 'Public games are not available yet.';

const WINDOW_MS = 60 * 1000;
const LIMIT = 60;
const hits = new Map<string, number[]>();

function rateLimited(userId: string): boolean {
    const now = Date.now();
    const recent = (hits.get(userId) ?? []).filter((at) => now - at < WINDOW_MS);
    if (recent.length >= LIMIT) {
        hits.set(userId, recent);
        return true;
    }
    recent.push(now);
    hits.set(userId, recent);
    return false;
}

export async function getPublicGames(c: AppContext): Promise<Response> {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    if (rateLimited(actor.id)) return fail(c, 429, 'rate_limited', 'Too many requests.');
    c.header('cache-control', 'private, no-store');
    await detectPublicGames(c.env.DB);
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
    const listed = await c.env.DB.prepare(
        `SELECT m.local_hex AS hex, u.name AS name
         FROM public_marks m
         JOIN universes u ON u.id = m.universe_id
         WHERE m.truth_version = ? AND m.sector_slug = ? AND u.deleted_at IS NULL AND u.public_games = 1
           AND u.owner_id != ?`,
    ).bind(truthVersion, sector, actor.id).all<{ hex: string; name: string }>();
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

export async function setPublicGames(c: AppContext, owned: OwnedUniverse): Promise<Response> {
    await detectPublicGames(c.env.DB);
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
    await c.env.DB.prepare(
        `UPDATE universes SET public_games = ?, updated_at = ? WHERE id = ?`,
    ).bind(flag, now, owned.row.id).run();
    if (flag === 1) await writePublicMark(c.env, owned.row.id, owned.row.truthVersion);
    else await deletePublicMark(c.env, owned.row.id);
    return c.json({ public: parsed.data.public });
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
