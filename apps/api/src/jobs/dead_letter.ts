import type { Env } from '../env';
import { claimNext } from './truth_build.ts';

const DEAD_ERROR = 'dead-lettered: the invocation died without throwing; see Workers Logs';

type Pinned = { seed: string; settings: Record<string, unknown>; engineVersion: string };
type DeadBody = {
    version?: unknown; slug?: unknown; offset?: unknown; pinned?: unknown; from?: unknown;
    transform?: unknown; policyDigest?: unknown;
};

export async function deadLetterConsumer(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
        const body = message.body as DeadBody | undefined;
        if (body && typeof body.version === 'string' && typeof body.slug === 'string') {
            const now = new Date().toISOString();
            const written = await env.DB.prepare(
                `INSERT INTO truth_build_sectors (version, sector_slug, state, systems, built, partial, index_hash, error, updated_at)
                 VALUES (?, ?, 'failed', 0, 0, 0, NULL, ?, ?)
                 ON CONFLICT(version, sector_slug) DO UPDATE SET
                    state = 'failed', error = excluded.error, updated_at = excluded.updated_at
                 WHERE truth_build_sectors.state = 'building'`,
            ).bind(body.version, body.slug, DEAD_ERROR, now).run();
            console.log(JSON.stringify({
                job: 'dead-letter',
                version: body.version,
                slug: body.slug,
                offset: body.offset ?? null,
            }));
            if ((written?.meta?.changes ?? 0) > 0) {
                const pinned = readPinned(body.pinned) ?? await pinnedFromVersion(env, body.version);
                if (pinned) {
                    const from = readFrom(body.from) ?? await derivedFromVersion(env, body.version);
                    await claimNext(env, body.version, pinned, from, readReconcile(body));
                }
            }
        }
        message.ack();
    }
}

function readFrom(value: unknown): string | undefined {
    return typeof value === 'string' && value.length > 0 ? value : undefined;
}

function readReconcile(body: DeadBody): { name: string; policyDigest: string } | undefined {
    if (body.transform !== 'reconcile-environment') return undefined;
    if (typeof body.policyDigest !== 'string' || body.policyDigest.length === 0) return undefined;
    return { name: body.transform, policyDigest: body.policyDigest };
}

async function derivedFromVersion(env: Env, version: string): Promise<string | undefined> {
    const row = await env.DB.prepare(
        `SELECT derived_from AS derivedFrom FROM truth_versions WHERE version = ?`,
    ).bind(version).first<{ derivedFrom: string | null }>();
    return row?.derivedFrom || undefined;
}

function readPinned(value: unknown): Pinned | null {
    if (!value || typeof value !== 'object') return null;
    const pinned = value as { seed?: unknown; settings?: unknown; engineVersion?: unknown };
    if (typeof pinned.seed !== 'string' || typeof pinned.engineVersion !== 'string') return null;
    if (!pinned.settings || typeof pinned.settings !== 'object' || Array.isArray(pinned.settings)) return null;
    return {
        seed: pinned.seed,
        settings: pinned.settings as Record<string, unknown>,
        engineVersion: pinned.engineVersion,
    };
}

async function pinnedFromVersion(env: Env, version: string): Promise<Pinned | null> {
    const row = await env.DB.prepare(
        `SELECT seed, settings, engine_version AS engineVersion FROM truth_versions WHERE version = ?`,
    ).bind(version).first<{ seed: string; settings: string; engineVersion: string }>();
    if (!row) return null;
    return { seed: row.seed, settings: JSON.parse(row.settings) as Record<string, unknown>, engineVersion: row.engineVersion };
}
