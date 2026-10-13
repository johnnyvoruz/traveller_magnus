import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { legacySession, legacySessionRelations, legacyUser, legacyUserRelations } from '../db/auth-schema-legacy';
import * as schema from '../db/schema';
import type { Env } from '../env';
import { authOptions } from './options';
import { passkeyColumnsReady } from './passkey_schema';

function authTables() {
    if (passkeyColumnsReady()) return schema;
    return {
        ...schema,
        user: legacyUser,
        session: legacySession,
        userRelations: legacyUserRelations,
        sessionRelations: legacySessionRelations,
    };
}

export function createAuth(env: Env) {
    const tables = authTables();
    return betterAuth({
        ...authOptions(env, passkeyColumnsReady()),
        database: drizzleAdapter(drizzle(env.DB, { schema: tables }), {
            provider: 'sqlite',
            schema: tables,
        }),
    });
}
