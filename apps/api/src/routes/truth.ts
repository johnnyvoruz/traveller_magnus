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
    const counts = await c.env.DB.prepare(
        `SELECT version,
                SUM(CASE WHEN state = 'done' THEN 1 ELSE 0 END) AS sectors_done,
                SUM(CASE WHEN state = 'failed' THEN 1 ELSE 0 END) AS sectors_failed
         FROM truth_build_sectors GROUP BY version`,
    ).all<{ version: string; sectors_done: number; sectors_failed: number }>();
    const byVersion = new Map(counts.results.map((row) => [row.version, row]));
    return ok(c, rows.map((row) => {
        const count = byVersion.get(row.version);
        return {
            version: row.version,
            engineVersion: row.engineVersion,
            milieu: row.milieu,
            seed: row.seed,
            settings: JSON.parse(row.settings),
            sectors: JSON.parse(row.sectors),
            state: row.state,
            startedAt: row.startedAt,
            releasedAt: row.releasedAt,
            notes: row.notes,
            sectorsFailed: Number(count?.sectors_failed ?? 0),
            manifestHash: row.manifestHash,
            sectorsTotal: row.sectorsTotal,
            sectorsDone: Number(count?.sectors_done ?? 0),
        };
    }));
});

function ftsQuery(q: string): string | null {
    const tokens = q.split(/\s+/).map((token) => token.replaceAll('"', '')).filter((token) => token.length > 0);
    if (!tokens.length) return null;
    return tokens.map((token, index) => index === tokens.length - 1 ? `"${token}"*` : `"${token}"`).join(' ');
}

function likePrefix(query: string): string {
    return `${query.toLowerCase().replace(/[\\%_]/g, (ch) => `\\${ch}`)}%`;
}

truth.get('/search', async (c) => {
    const q = (c.req.query('q') ?? '').trim();
    const version = c.req.query('version') ?? '';
    const match = ftsQuery(q);
    if (!match) return ok(c, { items: [] });
    const result = await c.env.DB.prepare(
        `SELECT ts.version, ts.sector_slug AS sectorSlug, ts.hex, ts.name, ts.uwp,
                ts.allegiance, ts.zone, ts.tree_hash AS treeHash
         FROM truth_systems_fts
         JOIN truth_systems ts ON ts.rowid = truth_systems_fts.rowid
         JOIN truth_versions tv ON tv.version = ts.version
         WHERE truth_systems_fts MATCH ? AND tv.state = 'released' AND (? = '' OR ts.version = ?)
         ORDER BY CASE
             WHEN lower(ts.name) = ? THEN 0
             WHEN lower(ts.name) LIKE ? ESCAPE '\\' THEN 1
             ELSE 2
         END, ts.name
         LIMIT 50`,
    ).bind(match, version, version, q.toLowerCase(), likePrefix(q)).all();
    return ok(c, { items: result.results });
});
