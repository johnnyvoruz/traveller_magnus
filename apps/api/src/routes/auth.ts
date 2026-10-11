import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { ensureProfile } from '../auth/profile';
import { requireUser, type AppContext } from '../auth/session';
import { profile } from '../db/schema';
import { ok } from '../http';

function db(c: AppContext) {
    return drizzle(c.env.DB, { schema: { profile } });
}

export async function me(c: AppContext) {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const row = await ensureProfile(c.env, actor.id, actor.email);
    const now = new Date().toISOString();
    await db(c).update(profile).set({ lastSeenAt: now }).where(eq(profile.userId, actor.id)).run();
    return ok(c, {
        id: actor.id,
        email: actor.email,
        role: actor.role,
        profile: { ...row, lastSeenAt: now },
    });
}
