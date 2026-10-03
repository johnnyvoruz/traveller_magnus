import { eq } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/d1';
import { Hono } from 'hono';
import type { AppEnv } from '../env';
import { truthVersions } from '../db/schema';
import { ok } from '../http';

export const truth = new Hono<AppEnv>();

truth.get('/versions', async (c) => {
    const db = drizzle(c.env.DB, { schema: { truthVersions } });
    const rows = await db.select().from(truthVersions).where(eq(truthVersions.state, 'released'));
    return ok(c, rows.map((row) => ({
        version: row.version,
        engineVersion: row.engineVersion,
        milieu: row.milieu,
        seed: row.seed,
        settings: row.settings,
        sectors: row.sectors,
        state: row.state,
        startedAt: row.startedAt,
        releasedAt: row.releasedAt,
        notes: row.notes,
        sectorsFailed: row.sectorsFailed,
        manifestHash: row.manifestHash,
        sectorsTotal: row.sectorsTotal,
        sectorsDone: row.sectorsDone,
    })));
});

truth.get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const version = c.req.query('version') ?? '';
    if (!q) return ok(c, { items: [] });
    const match = `"${q.replaceAll('"', ' ')}"`;
    const result = await c.env.DB.prepare(
        `SELECT ts.version, ts.sector_slug AS sectorSlug, ts.hex, ts.name, ts.uwp,
                ts.allegiance, ts.zone, ts.tree_hash AS treeHash
         FROM truth_systems_fts
         JOIN truth_systems ts ON ts.rowid = truth_systems_fts.rowid
         WHERE truth_systems_fts MATCH ? AND (? = '' OR ts.version = ?)
         LIMIT 50`,
    ).bind(match, version, version).all();
    return ok(c, { items: result.results });
});
