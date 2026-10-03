import { Hono } from 'hono';
import enginesPackage from '../../../../packages/engines/package.json' with { type: 'json' };
import type { AppEnv } from '../env';
import { ok } from '../http';

export const health = new Hono<AppEnv>();

health.get('/health', async (c) => {
    await c.env.DB.prepare('SELECT 1 AS ok').first();
    const released = await c.env.DB.prepare(
        "SELECT version FROM truth_versions WHERE state = 'released' ORDER BY released_at DESC LIMIT 1",
    ).first<{ version: string }>();
    const stub = c.env.UNIVERSE.get(c.env.UNIVERSE.idFromName('schema'));
    await stub.fetch('https://universe.internal/schema');
    return ok(c, {
        version: enginesPackage.version,
        engineVersion: enginesPackage.version,
        truthVersion: released?.version ?? null,
        db: 'ok',
    });
});
