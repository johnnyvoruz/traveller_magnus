import type { Context } from 'hono';
import { createAuth } from './auth';
import type { AppEnv } from '../env';
import { fail } from '../http';
import { roleSatisfies, type RoleName } from './roles';

export type AppContext = Context<AppEnv>;

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

export function ulid(now = Date.now()): string {
    let time = '';
    let t = now;
    for (let i = 0; i < 10; i++) {
        time = CROCKFORD[t % 32] + time;
        t = Math.floor(t / 32);
    }
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    let rand = '';
    for (let i = 0; i < 16; i++) rand += CROCKFORD[bytes[i]! % 32];
    return time + rand;
}

export function originAllowed(c: AppContext): boolean {
    const origin = c.req.header('origin');
    if (!origin) return true;
    return origin === new URL(c.req.url).origin;
}

export type SessionUser = {
    id: string;
    email: string;
    role: string;
};

export async function requireUser(c: AppContext): Promise<SessionUser | Response> {
    const session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    if (!session?.user) return fail(c, 401, 'unauthenticated', 'Sign in required.');
    const account = session.user as typeof session.user & { role?: string };
    const role = account.role ?? '';
    const user = { id: account.id, email: account.email, role };
    c.set('userId', user.id);
    return user;
}

export async function requireRole(c: AppContext, role: RoleName): Promise<SessionUser | Response> {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    if (!roleSatisfies(user.role, role)) return fail(c, 403, 'forbidden', 'Role required.');
    return user;
}
