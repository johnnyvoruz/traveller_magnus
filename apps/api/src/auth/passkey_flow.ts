import { getCurrentAdapter, queueAfterTransactionHook } from '@better-auth/core/context';
import { APIError } from '@better-auth/core/error';
import { createAuthEndpoint, getSessionFromCtx, sessionMiddleware } from 'better-auth/api';
import type { GenericEndpointContext } from '@better-auth/core';
import { setSessionCookie } from 'better-auth/cookies';
import { z } from 'zod/v4';
import type { AuthSecretEnv } from './options';
import {
    assertCanDeletePasskey,
    assertCanUnlink,
    clearPasskeyGate,
    clientAddress,
    countSignup,
    insertAllowance,
    openEnvelope,
    redeemCode,
    recoveryError,
    sealEnvelope,
    syncHandle,
    usernameTaken,
    writeCodes,
} from './passkey_data';
import { judgeUsername, PASSKEY_REQUIRED, SIGNUP_SESSION, USERNAME_TAKEN } from './passkey_words';

type RegistrationUser = { id: string; name: string; displayName?: string };

function database(env: AuthSecretEnv): D1Database {
    if (!env.DB) throw new Error('Database is not configured.');
    return env.DB;
}

function secretOf(env: AuthSecretEnv): string {
    if (!env.BETTER_AUTH_SECRET) throw new Error('BETTER_AUTH_SECRET is unset.');
    return env.BETTER_AUTH_SECRET;
}

function restricted(session: { session: object } | null): boolean {
    const row = session?.session as { mustAddPasskey?: boolean | number } | undefined;
    const flag = row?.mustAddPasskey;
    return flag === true || flag === 1;
}

export async function resolveSignupUser(env: AuthSecretEnv, ctx: GenericEndpointContext): Promise<RegistrationUser> {
    const judged = judgeUsername(ctx.query?.name);
    if (!judged.ok) throw APIError.from('BAD_REQUEST', { code: judged.code, message: judged.message });
    if (await usernameTaken(database(env), judged.username, null)) {
        throw APIError.from('BAD_REQUEST', { code: 'username_taken', message: USERNAME_TAKEN });
    }
    return { id: crypto.randomUUID(), name: judged.username, displayName: judged.username };
}

export async function finishRegistration(env: AuthSecretEnv, args: {
    ctx: GenericEndpointContext;
    user: RegistrationUser;
}): Promise<{ name?: string } | void> {
    const db = database(env);
    const secret = secretOf(env);
    const adapter = await getCurrentAdapter(args.ctx.context.adapter);
    const existing = await adapter.findOne({
        model: 'user',
        where: [{ field: 'id', value: args.user.id }],
    });
    if (!existing) {
        const createSession = (args.ctx.body as { createSession?: boolean } | undefined)?.createSession === true;
        if (!createSession) throw APIError.from('BAD_REQUEST', { code: 'session_required', message: SIGNUP_SESSION });
        const judged = judgeUsername(args.user.name);
        if (!judged.ok) throw APIError.from('BAD_REQUEST', { code: judged.code, message: judged.message });
        if (await usernameTaken(db, judged.username, args.user.id)) {
            throw APIError.from('BAD_REQUEST', { code: 'username_taken', message: USERNAME_TAKEN });
        }
        await args.ctx.context.internalAdapter.createUser({
            id: args.user.id,
            name: judged.username,
            email: `${args.user.id}@users.invalid`,
            emailVerified: false,
            username: judged.username,
        }, { method: 'email-password' });
        const userId = args.user.id;
        await queueAfterTransactionHook(async () => {
            await syncHandle(db, userId, judged.username);
            await insertAllowance(db, userId);
            const codes = await writeCodes(db, secret, userId);
            await sealEnvelope(db, secret, userId, codes);
        });
        return { name: judged.username };
    }
    const userId = String((existing as { id: string }).id);
    await queueAfterTransactionHook(async () => {
        const row = await db.prepare(`SELECT COUNT(*) AS n FROM recovery_code WHERE user_id = ?`).bind(userId).first<{ n: number }>();
        if (Number(row?.n ?? 0) === 0) {
            const codes = await writeCodes(db, secret, userId);
            await sealEnvelope(db, secret, userId, codes);
        }
        await insertAllowance(db, userId);
        await clearPasskeyGate(db, userId);
    });
}

export async function guardAuth(env: AuthSecretEnv, ctx: GenericEndpointContext): Promise<void> {
    const session = await getSessionFromCtx(ctx);
    if (restricted(session) && ctx.path !== '/sign-out' && ctx.path !== '/passkey/generate-register-options' && ctx.path !== '/passkey/verify-registration') {
        throw APIError.from('FORBIDDEN', { code: 'passkey_required', message: PASSKEY_REQUIRED });
    }
    if (ctx.path === '/passkey/generate-register-options' && !session?.user) {
        const judged = judgeUsername(ctx.query?.name);
        if (!judged.ok) throw APIError.from('BAD_REQUEST', { code: judged.code, message: judged.message });
        if (await usernameTaken(database(env), judged.username, null)) {
            throw APIError.from('BAD_REQUEST', { code: 'username_taken', message: USERNAME_TAKEN });
        }
        const headers = ctx.headers ?? ctx.request?.headers;
        await countSignup(database(env), clientAddress(headers));
    }
    if (ctx.path === '/passkey/delete-passkey' && session?.user) await assertCanDeletePasskey(database(env), session.user.id);
    if (ctx.path === '/unlink-account' && session?.user) await assertCanUnlink(database(env), session.user.id);
    if (ctx.path === '/update-user' && typeof (ctx.body as { username?: unknown } | undefined)?.username === 'string') {
        const judged = judgeUsername((ctx.body as { username: string }).username);
        if (!judged.ok) throw APIError.from('BAD_REQUEST', { code: judged.code, message: judged.message });
        if (await usernameTaken(database(env), judged.username, session?.user?.id ?? null)) {
            throw APIError.from('BAD_REQUEST', { code: 'username_taken', message: USERNAME_TAKEN });
        }
    }
}

function requireSecret(env: AuthSecretEnv, ctx: GenericEndpointContext): string {
    try {
        return secretOf(env);
    } catch {
        throw APIError.fromStatus('INTERNAL_SERVER_ERROR', { message: 'Sign-in is not configured.', code: 'auth_unconfigured' });
    }
}

export function voyageAccount(env: AuthSecretEnv) {
    return {
        id: 'voyage-account',
        endpoints: {
            setUsername: createAuthEndpoint('/username', {
                method: 'POST',
                body: z.object({ username: z.string() }),
                use: [sessionMiddleware],
            }, async (ctx) => {
                const judged = judgeUsername(ctx.body.username);
                if (!judged.ok) throw APIError.from('BAD_REQUEST', { code: judged.code, message: judged.message });
                const db = database(env);
                if (await usernameTaken(db, judged.username, ctx.context.session.user.id)) {
                    throw APIError.from('BAD_REQUEST', { code: 'username_taken', message: USERNAME_TAKEN });
                }
                await ctx.context.internalAdapter.updateUser(ctx.context.session.user.id, { username: judged.username });
                await syncHandle(db, ctx.context.session.user.id, judged.username);
                return ctx.json({ username: judged.username });
            }),
            redeemRecovery: createAuthEndpoint('/recovery/redeem', {
                method: 'POST',
                body: z.object({ username: z.string(), code: z.string() }),
            }, async (ctx) => {
                const judged = judgeUsername(ctx.body.username);
                if (!judged.ok) throw recoveryError('invalid');
                const db = database(env);
                const row = await db.prepare(`SELECT id FROM user WHERE username = ?`).bind(judged.username).first<{ id: string }>();
                if (!row) throw recoveryError('invalid');
                const result = await redeemCode(db, requireSecret(env, ctx), row.id, ctx.body.code);
                if (result !== 'ok') throw recoveryError(result);
                const user = await ctx.context.internalAdapter.findUserById(row.id);
                if (!user) throw recoveryError('invalid');
                const session = await ctx.context.internalAdapter.createSession(row.id, false, { mustAddPasskey: true }, true);
                if (!session) throw APIError.from('INTERNAL_SERVER_ERROR', { code: 'session_failed', message: 'The recovery session was not created.' });
                await setSessionCookie(ctx, { session, user });
                return ctx.json({ mustAddPasskey: true });
            }),
            revealRecovery: createAuthEndpoint('/recovery/reveal', {
                method: 'POST',
                use: [sessionMiddleware],
            }, async (ctx) => {
                const codes = await openEnvelope(database(env), requireSecret(env, ctx), ctx.context.session.user.id);
                return ctx.json({ codes });
            }),
            regenerateRecovery: createAuthEndpoint('/recovery/regenerate', {
                method: 'POST',
                use: [sessionMiddleware],
            }, async (ctx) => {
                const db = database(env);
                const codes = await writeCodes(db, requireSecret(env, ctx), ctx.context.session.user.id);
                await db.prepare(`DELETE FROM recovery_envelope WHERE user_id = ?`).bind(ctx.context.session.user.id).run();
                return ctx.json({ codes });
            }),
        },
    };
}
