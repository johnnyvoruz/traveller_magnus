import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { detectPublicGames } from '../auth/public_schema';
import { originAllowed, requireUser, type AppContext, type SessionUser } from '../auth/session';
import { universes } from '../db/schema';
import { fail } from '../http';

export type UniverseRow = typeof universes.$inferSelect;

export type OwnedUniverse = {
    row: UniverseRow;
    /** 1 or 0 when migration 0013 is applied. Null when that column is absent. */
    publicGames: 0 | 1 | null;
    actor: SessionUser;
    forward: (request: Request) => Promise<Response>;
};

function database(c: AppContext) {
    return drizzle(c.env.DB, { schema: { universes } });
}

/** 404 for a missing, deleted, or not-owned universe. Origin is checked on mutations. */
export async function ownedUniverse(c: AppContext): Promise<OwnedUniverse | Response> {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const id = c.req.param('id');
    if (!id) return fail(c, 404, 'not_found', 'No such universe.');
    const ready = await detectPublicGames(c.env.DB);
    let row: UniverseRow | undefined;
    let publicGames: 0 | 1 | null = null;
    if (ready) {
        const raw = await c.env.DB.prepare(
            `SELECT id, owner_id, name, slug, truth_version, engine_version, edition_default,
                    created_at, updated_at, deleted_at, purge_after, hex_override_count,
                    object_bytes, last_snapshot_at, public_games
             FROM universes WHERE id = ? AND owner_id = ? AND deleted_at IS NULL`,
        ).bind(id, actor.id).first<Record<string, string | number | null>>();
        if (raw) {
            publicGames = Number(raw.public_games) === 1 ? 1 : 0;
            row = {
                id: String(raw.id),
                ownerId: String(raw.owner_id),
                name: String(raw.name),
                slug: String(raw.slug),
                truthVersion: raw.truth_version == null ? null : String(raw.truth_version),
                engineVersion: String(raw.engine_version),
                editionDefault: String(raw.edition_default),
                createdAt: String(raw.created_at),
                updatedAt: String(raw.updated_at),
                deletedAt: raw.deleted_at == null ? null : String(raw.deleted_at),
                purgeAfter: raw.purge_after == null ? null : String(raw.purge_after),
                hexOverrideCount: Number(raw.hex_override_count),
                objectBytes: Number(raw.object_bytes),
                lastSnapshotAt: raw.last_snapshot_at == null ? null : String(raw.last_snapshot_at),
            };
        }
    } else {
        row = await database(c).select().from(universes).where(and(
            eq(universes.id, id),
            eq(universes.ownerId, actor.id),
            isNull(universes.deletedAt),
        )).get();
    }
    if (!row) return fail(c, 404, 'not_found', 'No such universe.');
    if (c.req.method !== 'GET' && c.req.method !== 'HEAD' && !originAllowed(c)) {
        return fail(c, 403, 'forbidden', 'Origin check failed.');
    }
    const forward = (request: Request) => {
        const headers = new Headers(request.headers);
        headers.set('x-voyage-user-id', actor.id);
        headers.set('x-voyage-universe-id', row.id);
        const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName(row.id));
        return stub.fetch(new Request(request, { headers }));
    };
    return { row, publicGames, actor, forward };
}
