import type { Context } from 'hono';
import { APIError } from '@better-auth/core/error';
import { createAuth } from './auth';
import type { AppEnv } from '../env';
import { fail } from '../http';
import { detectPasskeyColumns } from './passkey_schema';
import { isRecoverySession, RECOVERY_CODE, RECOVERY_MESSAGE } from './recovery_gate';
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

/** The before hook throws this when get-session loads a recovery session. Map it to the app envelope. */
function recoveryRefusal(error: unknown): boolean {
    if (!(error instanceof APIError)) return false;
    const body = error.body as { code?: string } | undefined;
    return body?.code === RECOVERY_CODE;
}

export async function requireUser(c: AppContext): Promise<SessionUser | Response> {
    await detectPasskeyColumns(c.env.DB);
    let session: Awaited<ReturnType<ReturnType<typeof createAuth>['api']['getSession']>>;
    try {
        session = await createAuth(c.env).api.getSession({ headers: c.req.raw.headers });
    } catch (error) {
        if (recoveryRefusal(error)) return fail(c, 403, RECOVERY_CODE, RECOVERY_MESSAGE);
        throw error;
    }
    if (!session?.user) return fail(c, 401, 'unauthenticated', 'Sign in to continue.');
    if (isRecoverySession(session as { session?: { mustAddPasskey?: boolean | number } })) {
        return fail(c, 403, RECOVERY_CODE, RECOVERY_MESSAGE);
    }
    const account = session.user as typeof session.user & { role?: string };
    const role = account.role ?? '';
    const user = { id: account.id, email: account.email, role };
    c.set('userId', user.id);
    return user;
}

export async function requireRole(c: AppContext, role: RoleName): Promise<SessionUser | Response> {
    const user = await requireUser(c);
    if (user instanceof Response) return user;
    if (!roleSatisfies(user.role, role)) return fail(c, 403, 'forbidden', 'You do not have access to that.');
    return user;
}
