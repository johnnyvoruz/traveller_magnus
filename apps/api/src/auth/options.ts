import { admin } from 'better-auth/plugins';

const DAY_SECONDS = 60 * 60 * 24;

export type AuthSecretEnv = {
    BETTER_AUTH_URL?: string;
    BETTER_AUTH_SECRET?: string;
    TWITTER_CLIENT_ID?: string;
    TWITTER_CLIENT_SECRET?: string;
    DISCORD_CLIENT_ID?: string;
    DISCORD_CLIENT_SECRET?: string;
    GOOGLE_CLIENT_ID?: string;
    GOOGLE_CLIENT_SECRET?: string;
};

function provider(id: string | undefined, secret: string | undefined) {
    if (!id || !secret) return undefined;
    return { clientId: id, clientSecret: secret };
}

export function authOptions(env: AuthSecretEnv) {
    const twitter = provider(env.TWITTER_CLIENT_ID, env.TWITTER_CLIENT_SECRET);
    const discord = provider(env.DISCORD_CLIENT_ID, env.DISCORD_CLIENT_SECRET);
    const google = provider(env.GOOGLE_CLIENT_ID, env.GOOGLE_CLIENT_SECRET);
    return {
        baseURL: env.BETTER_AUTH_URL,
        secret: env.BETTER_AUTH_SECRET,
        socialProviders: {
            ...(twitter ? { twitter } : {}),
            ...(discord ? { discord } : {}),
            ...(google ? { google } : {}),
        },
        plugins: [admin()],
        session: {
            expiresIn: 30 * DAY_SECONDS,
            updateAge: DAY_SECONDS,
        },
    };
}
