import { betterAuth } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { drizzle } from 'drizzle-orm/d1';
import { authOptions } from './options';

export const auth = betterAuth({
    ...authOptions(process.env),
    database: drizzleAdapter(drizzle({} as any), { provider: 'sqlite' }),
});
