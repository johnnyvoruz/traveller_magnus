import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { detectPlayers } from '../auth/players_schema';
import { originAllowed, requireUser, type AppContext, type SessionUser } from '../auth/session';
import type { AgentActor } from '../auth/tokens';
import { universes } from '../db/schema';
import { fail } from '../http';
import { headersForDoor } from './door_headers';

export type UniverseRow = typeof universes.$inferSelect;

export type DoorForward = (request: Request, extra?: Record<string, string>) => Promise<Response>;

export type OwnedUniverse = {
    row: UniverseRow;
    actor: SessionUser;
    forward: DoorForward;
};

export type MemberRole = 'owner' | 'member' | 'archived' | 'none';

export type MemberUniverse = {
    row: UniverseRow;
    actor: SessionUser;
    role: MemberRole;
    forward: DoorForward;
};

function database(c: AppContext) {
    return drizzle(c.env.DB, { schema: { universes } });
}

/** 404 for a missing, deleted, or not-owned universe. Origin is checked on mutations. */
export async function ownedUniverse(c: AppContext, actor?: AgentActor): Promise<OwnedUniverse | Response> {
    let user: SessionUser;
    if (actor) {
        user = actor;
    } else {
        const loaded = await requireUser(c);
        if (loaded instanceof Response) return loaded;
        user = loaded;
    }
    const id = c.req.param('id');
    if (!id) return fail(c, 404, 'not_found', 'No such universe.');
    if (actor?.universeId && actor.universeId !== id) return fail(c, 404, 'not_found', 'No such universe.');
    // `public_games` stays off this table. A select of a column that 0013 has not
    // added yet would fail every Builder route. The routes that need the flag read it.
    const row = await database(c).select().from(universes).where(and(
        eq(universes.id, id),
        eq(universes.ownerId, user.id),
        isNull(universes.deletedAt),
    )).get();
    if (!row) return fail(c, 404, 'not_found', 'No such universe.');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !originAllowed(c)) {
        return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
    }
    return { row, actor: user, forward: doorForward(c, user.id, row.id) };
}

function doorForward(c: AppContext, actorId: string, universeId: string): DoorForward {
    return (request, extra) => {
        const headers = headersForDoor(request.headers, actorId, universeId);
        if (extra) {
            for (const [key, value] of Object.entries(extra)) headers.set(key, value);
        }
        const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName(universeId));
        return stub.fetch(new Request(request, { headers }));
    };
}

/**
 * Owner, active member, archived member, or a signed-in stranger.
 * A missing or deleted universe is 404. Before 0021 only the owner is a role;
 * everyone else is `none`, and the campaign routes answer 404.
 */
export async function memberUniverse(c: AppContext): Promise<MemberUniverse | Response> {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const id = c.req.param('id');
    if (!id) return fail(c, 404, 'not_found', 'No such universe.');
    const row = await database(c).select().from(universes).where(and(
        eq(universes.id, id),
        isNull(universes.deletedAt),
    )).get();
    if (!row) return fail(c, 404, 'not_found', 'No such universe.');
    let role: MemberRole = row.ownerId === actor.id ? 'owner' : 'none';
    if (role !== 'owner' && await detectPlayers(c.env.DB)) {
        const member = await c.env.DB.prepare(
            `SELECT status FROM universe_members WHERE universe_id = ? AND user_id = ?`,
        ).bind(row.id, actor.id).first<{ status: string }>();
        if (member?.status === 'active') role = 'member';
        else if (member) role = 'archived';
    }
    return { row, actor, role, forward: doorForward(c, actor.id, row.id) };
}

/** Profile handles for the owner and every member row. A missing handle is an empty string. */
export async function loadHandles(db: D1Database, universeId: string, ownerId: string): Promise<Record<string, string>> {
    try {
        if (!await detectPlayers(db)) {
            const owner = await db.prepare(`SELECT handle FROM profile WHERE user_id = ?`).bind(ownerId).first<{ handle: string }>();
            return { [ownerId]: owner?.handle ?? '' };
        }
        const listed = await db.prepare(
            `SELECT ids.user_id AS userId, profile.handle AS handle
             FROM (
                SELECT ? AS user_id
                UNION
                SELECT user_id FROM universe_members WHERE universe_id = ?
             ) ids
             LEFT JOIN profile ON profile.user_id = ids.user_id`,
        ).bind(ownerId, universeId).all<{ userId: string; handle: string | null }>();
        const handles: Record<string, string> = {};
        for (const row of listed.results ?? []) handles[row.userId] = row.handle ?? '';
        return handles;
    } catch {
        return {};
    }
}

export function originBlocked(c: AppContext): Response | null {
    if (c.req.method === 'GET' || c.req.method === 'HEAD' || originAllowed(c)) return null;
    return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
}
