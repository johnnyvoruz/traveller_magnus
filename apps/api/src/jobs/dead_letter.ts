import type { Env } from '../env';

const DEAD_ERROR = 'dead-lettered: the invocation died without throwing; see Workers Logs';

type DeadBody = { version?: unknown; slug?: unknown; offset?: unknown };

export async function deadLetterConsumer(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
        const body = message.body as DeadBody | undefined;
        if (body && typeof body.version === 'string' && typeof body.slug === 'string') {
            const now = new Date().toISOString();
            await env.DB.prepare(
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
        }
        message.ack();
    }
}
