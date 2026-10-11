import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { profile, user } from '../db/schema';
import type { Env } from '../env';

export type ProfileRow = typeof profile.$inferSelect;

function database(env: Env) {
    return drizzle(env.DB, { schema: { profile, user } });
}

function handleBase(name: string): string {
    const slug = name.toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24);
    return slug || 'user';
}

/** The profile `GET /api/me` would create. Does not bump `last_seen_at` on an existing row. */
export async function ensureProfile(env: Env, userId: string, fallbackEmail = ''): Promise<ProfileRow> {
    const db = database(env);
    const existing = await db.select().from(profile).where(eq(profile.userId, userId)).get();
    if (existing) return existing;
    const identity = await db.select({ name: user.name, email: user.email, image: user.image }).from(user).where(eq(user.id, userId)).get();
    const displayName = identity?.name || fallbackEmail || identity?.email || userId;
    let handle = handleBase(displayName);
    let suffix = 2;
    while (await db.select({ userId: profile.userId }).from(profile).where(eq(profile.handle, handle)).get()) {
        handle = `${handleBase(displayName)}${suffix}`;
        suffix += 1;
    }
    const now = new Date().toISOString();
    await db.insert(profile).values({
        userId,
        handle,
        displayName,
        avatarUrl: identity?.image ?? null,
        createdAt: now,
        lastSeenAt: now,
    }).run();
    const row = await db.select().from(profile).where(eq(profile.userId, userId)).get();
    if (!row) throw new Error('Profile was not stored.');
    return row;
}
