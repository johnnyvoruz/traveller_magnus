import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../db/schema';
import type { Env } from '../env';
import { authOptions } from './options';

export function createAuth(env: Env) {
    return betterAuth({
        ...authOptions(env),
        database: drizzleAdapter(drizzle(env.DB, { schema }), {
            provider: 'sqlite',
            schema,
        }),
    });
}
