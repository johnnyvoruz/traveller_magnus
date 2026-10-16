/**
 * Package takedown and restore (contracts/b_marketplace.md F2). Admin only, audit logged.
 * Kept out of routes/admin.ts on purpose (z_marketplace.md phase 2 go).
 * A takedown hides the package and moves each version's manifest off the public bucket
 * into the private one, so restore can put it back. Content-addressed objects stay, except an
 * uploaded cover, which goes to the private bucket as manifests do (F17).
 */
import { Hono } from 'hono';
import { PackageTakedown } from '@voyage/shared';
import { restoreCover, takeDownCover } from './package_covers';
import { originAllowed, requireRole, ulid } from '../auth/session';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';

type Ctx = Parameters<typeof fail>[0];

export const adminPackagesRoute = new Hono<AppEnv>();

function heldKey(packageId: string, version: number): string {
    return `takedown/packages/${packageId}/${version}/manifest.json`;
}

function publicKey(packageId: string, version: number): string {
    return `packages/${packageId}/${version}/manifest.json`;
}

async function doneVersions(c: Ctx, packageId: string): Promise<number[]> {
    const rows = await c.env.DB.prepare(`SELECT version FROM package_versions WHERE package_id = ? AND state = 'done'`)
        .bind(packageId).all<{ version: number }>();
    return (rows.results ?? []).map((row) => Number(row.version));
}

async function audit(c: Ctx, actorId: string, action: string, packageId: string, details: unknown): Promise<void> {
    await c.env.DB.prepare(
        `INSERT INTO audit_log (id, at, actor_id, action, target_kind, target_id, details) VALUES (?, ?, ?, ?, 'package', ?, ?)`,
    ).bind(ulid(), new Date().toISOString(), actorId, action, packageId, JSON.stringify(details)).run();
}

adminPackagesRoute.post('/:packageId/takedown', async (c) => {
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    let body: unknown;
    try {
        body = await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
    const parsed = PackageTakedown.safeParse(body);
    if (!parsed.success) return fail(c, 400, 'validation', 'Invalid request.', parsed.error.flatten());
    const pkg = await c.env.DB.prepare(`SELECT id FROM packages WHERE id = ?`).bind(c.req.param('packageId') ?? '').first<{ id: string }>();
    if (!pkg) return fail(c, 404, 'not_found', 'No such package.');
    const versions = await doneVersions(c, pkg.id);
    for (const version of versions) {
        const object = await c.env.PUBLIC_BUCKET.get(publicKey(pkg.id, version));
        if (!object) continue;
        await c.env.PRIVATE_BUCKET.put(heldKey(pkg.id, version), await object.arrayBuffer(), {
            httpMetadata: { contentType: 'application/json' },
        });
        await c.env.PUBLIC_BUCKET.delete(publicKey(pkg.id, version));
    }
    const covers = await takeDownCover(c.env, pkg.id);
    await c.env.DB.prepare(`UPDATE packages SET hidden = 1, takedown_reason = ?, takedown_by = ? WHERE id = ?`)
        .bind(parsed.data.reason, actor.id, pkg.id).run();
    const reports = await c.env.DB.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'package_reports'`).first<{ name: string }>();
    if (reports?.name === 'package_reports') {
        await c.env.DB.prepare(`UPDATE package_reports SET state = 'closed' WHERE package_id = ? AND state = 'open'`).bind(pkg.id).run();
    }
    await audit(c, actor.id, 'package.takedown', pkg.id, { reason: parsed.data.reason, versions, covers });
    return ok(c, { hidden: true });
});

adminPackagesRoute.post('/:packageId/restore', async (c) => {
    const actor = await requireRole(c, 'admin');
    if (actor instanceof Response) return actor;
    if (!originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    const pkg = await c.env.DB.prepare(`SELECT id FROM packages WHERE id = ?`).bind(c.req.param('packageId') ?? '').first<{ id: string }>();
    if (!pkg) return fail(c, 404, 'not_found', 'No such package.');
    const versions = await doneVersions(c, pkg.id);
    for (const version of versions) {
        const held = await c.env.PRIVATE_BUCKET.get(heldKey(pkg.id, version));
        if (!held) continue;
        await c.env.PUBLIC_BUCKET.put(publicKey(pkg.id, version), await held.arrayBuffer(), {
            httpMetadata: { contentType: 'application/json' },
        });
        await c.env.PRIVATE_BUCKET.delete(heldKey(pkg.id, version));
    }
    const covers = await restoreCover(c.env, pkg.id);
    await c.env.DB.prepare(`UPDATE packages SET hidden = 0, takedown_reason = NULL, takedown_by = NULL WHERE id = ?`).bind(pkg.id).run();
    await audit(c, actor.id, 'package.restore', pkg.id, { versions, covers });
    return ok(c, { hidden: false });
});