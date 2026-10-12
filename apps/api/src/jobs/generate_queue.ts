import { chartEntry, densityKeeps, generateHex } from '@voyage/generation';
import { BUILDER_LIMITS, SectorHex, sha256Hex, stable } from '@voyage/shared';
import type { Env } from '../env';
import { chartHoldsSystem, chartTree, generationSeed, hexDoorPath, sectorOf } from '../universe/hexes';

const OBJECT_QUOTA_BYTES = 250 * 1024 * 1024;
// One post is one universe mutation, and a universe allows 120 mutations a
// minute. Thirty-two hexes keeps a subsector to three posts. The transaction
// cap stays BUILDER_LIMITS.batch (64).
const GENERATE_SLICE = 32;

export async function enqueueGenerate(queue: Queue, universeId: string, jobId: string, hexCount: number): Promise<void> {
    if (hexCount < 1) return;
    await queue.send({ kind: 'generate', universeId, jobId, offset: 0 });
}

type GenerateMessage = { kind?: unknown; universeId?: unknown; jobId?: unknown; offset?: unknown };
type HexView = { state?: string; treeHash?: string | null; baseHash?: string | null; rev?: number };

export async function generateConsumer(batch: MessageBatch, env: Env): Promise<void> {
    for (const message of batch.messages) {
        const body = message.body as GenerateMessage;
        if (!body || body.kind !== 'generate' || typeof body.universeId !== 'string' || typeof body.jobId !== 'string') {
            message.ack();
            continue;
        }
        const offset = typeof body.offset === 'number' ? body.offset : 0;
        try {
            await runBatch(env, body.universeId, body.jobId, offset);
            message.ack();
        } catch (err) {
            console.log(JSON.stringify({ job: 'generate', universeId: body.universeId, jobId: body.jobId, offset, error: String(err) }));
            message.retry();
        }
    }
}

async function call(env: Env, universeId: string, path: string, method = 'GET', body?: unknown): Promise<{ status: number; data: any }> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const response = await stub.fetch(new Request(`https://universe.internal${path}`, {
        method,
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
    const parsed = await response.json() as { ok?: boolean; data?: unknown; error?: { message?: string } };
    if (!response.ok) throw new Error(parsed.error?.message || `universe ${response.status}`);
    return { status: response.status, data: parsed.data };
}

async function runBatch(env: Env, universeId: string, jobId: string, offset: number): Promise<void> {
    const opened = await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/spec`);
    const job = opened.data.job as { state: string };
    const spec = opened.data.spec as {
        hexKeys: string[];
        edition: string;
        generator: string;
        roll: number;
        filledToo: boolean;
        density?: 'every' | 'sparse' | 'standard' | 'dense';
        seed: string;
        settings: Record<string, unknown>;
        engineVersion: string;
        captured: Record<string, { rev: number; baseHash: string | null } | null>;
    };
    if (job.state === 'done' || job.state === 'failed' || job.state === 'stopped') return;
    // A retry continues from the hexes already counted. The same message walks
    // the rest. A follow-up message is what the local queue broker drops.
    let cursor = typeof (opened.data.job as { done?: unknown }).done === 'number' ? (opened.data.job as { done: number }).done : offset;
    const charts = new Map<string, Record<string, unknown> | null>();
    const pin = (await call(env, universeId, '/pin')).data as { truthVersion: string | null };
    while (cursor < spec.hexKeys.length) {
        const slice = spec.hexKeys.slice(cursor, cursor + GENERATE_SLICE);
        const writes: Array<Record<string, unknown>> = [];
        const skipped: string[] = [];
        const leftEmpty: string[] = [];
        const failures: Array<{ hexKey: string; reason: string }> = [];
        let addedBytes = 0;
        let stopped = false;
        for (const hexKey of slice) {
            const live = (await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}`)).data as { state: string };
            if (live.state === 'stopped') {
                stopped = true;
                break;
            }
            try {
                const row = await readRow(env, universeId, hexKey);
                const { sector, local } = sectorOf(hexKey);
                const chart = await chartHexes(env, pin.truthVersion, sector, charts);
                const entry = chart ? chart[local] : undefined;
                const holds = (row && row.state !== 'removed' && row.treeHash) || (!row && chartHoldsSystem(entry));
                const decision = densityKeeps({
                    universeSeed: spec.seed,
                    hexKey,
                    density: spec.density ?? 'every',
                    alone: spec.hexKeys.length === 1,
                    holds: Boolean(holds),
                    filledToo: spec.filledToo,
                });
                if (decision === 'skip') {
                    skipped.push(hexKey);
                    continue;
                }
                if (decision === 'empty') {
                    leftEmpty.push(hexKey);
                    continue;
                }
                const captured = spec.captured[hexKey];
                const envelope = generateHex({
                    hexKey,
                    edition: spec.edition,
                    mode: spec.generator,
                    summary: { type: 'SYSTEM_PRESENT' },
                    pinned: {
                        seed: generationSeed(spec.seed, spec.roll),
                        settings: spec.settings,
                        engineVersion: spec.engineVersion,
                    },
                });
                const bytes = stable(envelope);
                const stored = await storeTree(env, universeId, bytes);
                addedBytes += stored.added;
                writes.push({
                    hexKey,
                    treeHash: stored.hash,
                    baseHash: row?.baseHash ?? chartTree(entry),
                    roll: spec.roll,
                    baseRev: captured ? captured.rev : 0,
                    capturedRev: captured ? captured.rev : 0,
                    engineVersion: spec.engineVersion,
                    entry: SectorHex.parse(chartEntry(envelope.body as Record<string, unknown>, stored.hash)),
                });
            } catch (err) {
                failures.push({ hexKey, reason: String(err).slice(0, BUILDER_LIMITS.reason) });
            }
        }
        const finished = stopped || cursor + slice.length >= spec.hexKeys.length;
        await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/batch`, 'POST', {
            offset: cursor, writes, skipped, failures, finished, leftEmpty,
        });
        if (addedBytes > 0) {
            await env.DB.prepare(
                `UPDATE universes SET object_bytes = object_bytes + ? WHERE id = ?`,
            ).bind(addedBytes, universeId).run();
        }
        const count = (await call(env, universeId, '/hexes/count')).data as { count: number };
        await env.DB.prepare(`UPDATE universes SET hex_override_count = ? WHERE id = ?`).bind(count.count, universeId).run();
        if (finished) return;
        cursor += slice.length;
    }
}

async function readRow(env: Env, universeId: string, hexKey: string): Promise<HexView | null> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const response = await stub.fetch(new Request(`https://universe.internal${hexDoorPath(hexKey)}`));
    if (response.status === 404) return null;
    const parsed = await response.json() as { ok?: boolean; data?: HexView; error?: { message?: string } };
    if (!response.ok) throw new Error(parsed.error?.message || 'hex read failed');
    return parsed.data ?? null;
}

async function chartHexes(env: Env, version: string | null, sector: string, cache: Map<string, Record<string, unknown> | null>): Promise<Record<string, unknown> | null> {
    if (!version) return null;
    const key = `${version}/${sector}`;
    if (cache.has(key)) return cache.get(key) ?? null;
    const object = await env.PUBLIC_BUCKET.get(`truth/${version}/sectors/${sector}/index.json`);
    if (!object) {
        cache.set(key, null);
        return null;
    }
    const parsed = JSON.parse(await object.text()) as { hexes?: Record<string, unknown> };
    const hexes = parsed.hexes ?? {};
    cache.set(key, hexes);
    return hexes;
}

async function storeTree(env: Env, universeId: string, bytes: string): Promise<{ hash: string; added: number }> {
    const hash = await sha256Hex(bytes);
    const key = `u/${universeId}/objects/${hash}`;
    const existing = await env.PRIVATE_BUCKET.head(key);
    if (existing) return { hash, added: 0 };
    const size = new TextEncoder().encode(bytes).byteLength;
    const row = await env.DB.prepare(`SELECT object_bytes AS objectBytes FROM universes WHERE id = ?`).bind(universeId).first<{ objectBytes: number }>();
    if (row && row.objectBytes + size > OBJECT_QUOTA_BYTES) throw new Error('250 MB of objects per universe.');
    await env.PRIVATE_BUCKET.put(key, bytes, { httpMetadata: { contentType: 'application/json' } });
    return { hash, added: size };
}
