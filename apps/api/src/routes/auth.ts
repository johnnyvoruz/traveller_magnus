import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { readAllowance } from '../auth/allowance';
import { passkeyColumnsReady } from '../auth/passkey_schema';
import { readProfileCard } from '../auth/passkey_data';
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
    const now = new Date().toISOString();
    let username: string | null = null;
    let hasPasskey = false;
    let unusedRecoveryCodes = 0;
    let linkedProviders: string[] = [];
    let row = passkeyColumnsReady() ? await readProfileCard(c.env.DB, actor.id) : null;
    const stored = row?.profile ?? await ensureProfile(c.env, actor.id, actor.email);
    if (!row && passkeyColumnsReady()) row = await readProfileCard(c.env.DB, actor.id);
    if (row) {
        username = row.username;
        hasPasskey = row.hasPasskey;
        unusedRecoveryCodes = row.unusedRecoveryCodes;
        linkedProviders = row.linkedProviders;
    }
    await db(c).update(profile).set({ lastSeenAt: now }).where(eq(profile.userId, actor.id)).run();
    return ok(c, {
        id: actor.id,
        email: actor.email,
        role: actor.role,
        username,
        hasPasskey,
        unusedRecoveryCodes,
        linkedProviders,
        profile: { ...stored, lastSeenAt: now },
        allowance: await readAllowance(c.env, actor.id, actor.role),
    });
}
