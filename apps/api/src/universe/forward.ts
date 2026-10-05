import { and, eq, isNull } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { originAllowed, requireUser, type AppContext } from '../auth/session';
import { universes } from '../db/schema';
import { fail } from '../http';

export type UniverseRow = typeof universes.$inferSelect;

export type OwnedUniverse = {
    row: UniverseRow;
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
    const row = await database(c).select().from(universes).where(and(
        eq(universes.id, id),
        eq(universes.ownerId, actor.id),
        isNull(universes.deletedAt),
    )).get();
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
    return { row, forward };
}
