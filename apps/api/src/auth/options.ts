import { createAuthMiddleware } from 'better-auth/api';
import { admin, username } from 'better-auth/plugins';
import { passkey } from '@better-auth/passkey';
import { finishRegistration, guardAuth, resolveSignupUser, voyageAccount } from './passkey_flow';
import { syncHandle } from './passkey_data';
import { accountLinking } from './linking';
import { usernameAllowed } from './passkey_words';

const DAY_SECONDS = 60 * 60 * 24;

export type AuthSecretEnv = {
    DB?: D1Database;
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
    TWITTER_CLIENT_ID?: string;
    TWITTER_CLIENT_SECRET?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
};

export function relyingParty(baseURL: string | undefined): { rpID: string; origin?: string } {
    if (!baseURL) return { rpID: 'localhost' };
    const url = new URL(baseURL);
    return { rpID: url.hostname, origin: url.origin };
}

function provider(id: string | undefined, secret: string | undefined) {
    if (!id || !secret) return undefined;
    return { clientId: id, clientSecret: secret };
}

export function authOptions(env: AuthSecretEnv, ready = true) {
    const twitter = provider(env.TWITTER_CLIENT_ID, env.TWITTER_CLIENT_SECRET);
    const discord = provider(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET);
    const google = provider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    const socialProviders = {
        ...(twitter ? { twitter } : {}),
        ...(discord ? { discord } : {}),
        ...(google ? { google } : {}),
    };
    if (!ready) {
        return {
            baseURL: env.BETTER_AUTH_URL,
            secret: env.BETTER_AUTH_SECRET,
            socialProviders,
            plugins: [admin()],
            session: {
                expiresIn: 30 * DAY_SECONDS,
                updateAge: DAY_SECONDS,
            },
        };
    }
    const party = relyingParty(env.BETTER_AUTH_URL);
    return {
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        socialProviders,
        account: {
            accountLinking,
        },
        databaseHooks: {
            user: {
                update: {
                    async after(user: { id: string; username?: string | null }) {
                        if (!env.DB || !user.username) return;
                        await syncHandle(env.DB, user.id, user.username);
                    },
                },
            },
        },
        plugins: [
            username({
                minUsernameLength: 3,
                maxUsernameLength: 24,
                displayUsername: false,
                validationOrder: { username: 'post-normalization' },
                usernameValidator: (value) => usernameAllowed(value),
            }),
            passkey({
                rpID: party.rpID,
                rpName: 'Traveller.voyage',
                origin: party.origin,
                registration: {
                    requireSession: false,
                    resolveUser: ({ ctx }) => resolveSignupUser(env, ctx),
                    afterVerification: (args) => finishRegistration(env, args),
                },
            }),
            voyageAccount(env),
            admin(),
        ],
        session: {
            expiresIn: 30 * DAY_SECONDS,
            updateAge: DAY_SECONDS,
            additionalFields: {
                mustAddPasskey: {
                    type: 'boolean' as const,
                    required: false,
                    defaultValue: false,
                    input: false,
                },
            },
        },
        hooks: {
            before: createAuthMiddleware(async (ctx) => {
                await guardAuth(env, ctx);
            }),
        },
    };
}
