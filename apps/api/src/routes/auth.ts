import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { requireUser, type AppContext } from '../auth/session';
import { profile, user } from '../db/schema';
import { ok } from '../http';

function db(c: AppContext) {
    return drizzle(c.env.DB, { schema: { profile, user } });
}

function handleBase(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return slug || 'user';
}

export async function me(c: AppContext) {
    const actor = await requireUser(c);
    if (actor instanceof Response) return actor;
    const database = db(c);
    let row = await database.select().from(profile).where(eq(profile.userId, actor.id)).get();
    const now = new Date().toISOString();
    if (!row) {
        const identity = await database.select({ name: user.name, image: user.image }).from(user).where(eq(user.id, actor.id)).get();
        const displayName = identity?.name || actor.email;
        let handle = handleBase(displayName);
        let suffix = 2;
        while (await database.select({ userId: profile.userId }).from(profile).where(eq(profile.handle, handle)).get()) {
            handle = `${handleBase(displayName)}${suffix}`;
            suffix += 1;
        }
        await database.insert(profile).values({
            userId: actor.id,
            handle,
            displayName,
            avatarUrl: identity?.image ?? null,
            createdAt: now,
            lastSeenAt: now,
        }).run();
        row = await database.select().from(profile).where(eq(profile.userId, actor.id)).get();
    } else {
        await database.update(profile).set({ lastSeenAt: now }).where(eq(profile.userId, actor.id)).run();
        row = { ...row, lastSeenAt: now };
    }
    return ok(c, {
        id: actor.id,
        email: actor.email,
        role: actor.role,
        profile: row,
    });
}
