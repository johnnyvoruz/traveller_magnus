import { chartEntry, densityKeeps, generateHex } from '@voyage/generation';
import { BUILDER_LIMITS, SectorHex, sha256Hex, stable } from '@voyage/shared';
import type { Env } from '../env';
import { chartHoldsSystem, chartTree, generationSeed, sectorOf } from '../universe/hexes';
import { BUSY_SENTENCE, busyDelayMs, nextSliceOffset } from './generate_pace';

const OBJECT_QUOTA_BYTES = 250 * 1024 * 1024;
// Workers allow 6 simultaneous outgoing connections per invocation.
const OPEN_CONNECTIONS = 6;
// One post is one universe mutation. 32 is faster on an 80-hex subsector than
// 64, and a retry repeats the slice. A 32-hex generate step measured about 90 ms.
const GENERATE_SLICE = 32;

export async function enqueueGenerate(queue: Queue, universeId: string, jobId: string, hexCount: number): Promise<void> {
    if (hexCount < 1) return;
    await queue.send({ kind: 'generate', universeId, jobId, offset: 0 });
}

type GenerateMessage = { kind?: unknown; universeId?: unknown; jobId?: unknown; offset?: unknown };
type SliceRow = { state?: string; treeHash?: string | null; baseHash?: string | null } | null;
type SliceAnswer = {
    job: { state: string; done: number; total: number; applied?: number[]; objectBytes?: number; bytesSettled?: number };
    pin: { truthVersion: string | null };
    spec: {
        hexKeys: string[];
        total: number;
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
    rows: SliceRow[];
};

class UniverseBusy extends Error {
    constructor() {
        super(BUSY_SENTENCE);
    }
}

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

function since(at: number): number {
    return Date.now() - at;
}

async function call(env: Env, universeId: string, path: string, method = 'GET', body?: unknown, attempt = 0): Promise<{ status: number; data: any }> {
    const stub = env.UNIVERSE.get(env.UNIVERSE.idFromName(universeId));
    const headers = new Headers({ 'x-voyage-worker': 'generate' });
    if (body !== undefined) headers.set('content-type', 'application/json');
    const response = await stub.fetch(new Request(`https://universe.internal${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
    if (response.status === 429) {
        const wait = busyDelayMs(response.headers.get('retry-after'), attempt);
        if (wait !== null) {
            await new Promise((resolve) => setTimeout(resolve, wait));
            return call(env, universeId, path, method, body, attempt + 1);
        }
        throw new UniverseBusy();
    }
    const parsed = await response.json() as { ok?: boolean; data?: unknown; error?: { message?: string } };
    if (!response.ok) throw new Error(parsed.error?.message || `universe ${response.status}`);
    return { status: response.status, data: parsed.data };
}

function terminal(state: string): boolean {
    return state === 'done' || state === 'failed' || state === 'stopped';
}

async function runBatch(env: Env, universeId: string, jobId: string, offset: number): Promise<void> {
    try {
        await runSlices(env, universeId, jobId, offset);
    } catch (err) {
        if (!(err instanceof UniverseBusy)) throw err;
        const opened = await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/slice?offset=0&n=1`).catch(() => null);
        const hexKey = opened?.data?.spec?.hexKeys?.[0];
        await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/fail`, 'POST', {
            reason: BUSY_SENTENCE,
            hexKey: typeof hexKey === 'string' ? hexKey : undefined,
        });
    }
}

async function runSlices(env: Env, universeId: string, jobId: string, offset: number): Promise<void> {
    const wallStart = Date.now();
    const size = GENERATE_SLICE;
    const started = await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/slice?offset=${offset}&n=${size}`);
    const first = started.data as SliceAnswer;
    if (terminal(first.job.state)) {
        await finishCounts(env, universeId, jobId, first.job.objectBytes ?? 0, first.job.bytesSettled ?? 0);
        return;
    }
    const total = first.spec.total;
    let cursor = nextSliceOffset(first.job.applied ?? [], total, size);
    const charts = new Map<string, Record<string, unknown> | null>();
    let baseline = await objectBytes(env, universeId);
    let sliceMs = 0;
    let stopMs = 0;
    let generateMs = 0;
    let storeMs = 0;
    let batchMs = 0;
    let countMs = 0;
    let slices = 0;
    while (cursor < total) {
        const sliceAt = Date.now();
        const opened = cursor === offset
            ? first
            : (await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/slice?offset=${cursor}&n=${size}`)).data as SliceAnswer;
        sliceMs += since(sliceAt);
        if (terminal(opened.job.state)) {
            countMs += await finishCounts(env, universeId, jobId, opened.job.objectBytes ?? 0, opened.job.bytesSettled ?? 0);
            logTime(universeId, jobId, total, slices, sliceMs, stopMs, generateMs, storeMs, batchMs, countMs, since(wallStart));
            return;
        }
        const spec = opened.spec;
        if (spec.hexKeys.length === 0) break;
        const pending: Array<{ hexKey: string; bytes: string; body: Record<string, unknown>; row: SliceRow; entry: unknown }> = [];
        const writes: Array<Record<string, unknown>> = [];
        const skipped: string[] = [];
        const leftEmpty: string[] = [];
        const failures: Array<{ hexKey: string; reason: string }> = [];
        for (let index = 0; index < spec.hexKeys.length; index += 1) {
            const hexKey = spec.hexKeys[index];
            const row = opened.rows[index] ?? null;
            try {
                const { sector, local } = sectorOf(hexKey);
                const chart = await chartHexes(env, opened.pin.truthVersion, sector, charts);
                const entry = chart ? chart[local] : undefined;
                const holds = (row && row.state !== 'removed' && row.treeHash) || (!row && chartHoldsSystem(entry));
                const decision = densityKeeps({
                    universeSeed: spec.seed,
                    hexKey,
                    density: spec.density ?? 'every',
                    alone: spec.total === 1,
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
                const genAt = Date.now();
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
                generateMs += since(genAt);
                pending.push({ hexKey, bytes, body: envelope.body as Record<string, unknown>, row, entry });
            } catch (err) {
                failures.push({ hexKey, reason: String(err).slice(0, BUILDER_LIMITS.reason) });
            }
        }
        let addedBytes = 0;
        if (pending.length > 0) {
            try {
                const storeAt = Date.now();
                const stored = await storeTrees(env, universeId, pending.map((item) => item.bytes), baseline);
                storeMs += since(storeAt);
                baseline = stored.baseline;
                addedBytes = stored.added;
                pending.forEach((item, index) => {
                    const captured = spec.captured[item.hexKey];
                    const hash = stored.hashes[index];
                    writes.push({
                        hexKey: item.hexKey,
                        treeHash: hash,
                        baseHash: item.row?.baseHash ?? chartTree(item.entry),
                        roll: spec.roll,
                        baseRev: captured ? captured.rev : 0,
                        capturedRev: captured ? captured.rev : 0,
                        engineVersion: spec.engineVersion,
                        entry: SectorHex.parse(chartEntry(item.body, hash)),
                    });
                });
            } catch (err) {
                const reason = String(err).slice(0, BUILDER_LIMITS.reason);
                for (const item of pending) failures.push({ hexKey: item.hexKey, reason });
            }
        }
        // Stop writes the slice already in hand, and no slice after it.
        const stopAt = Date.now();
        const live = (await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/state`)).data as { state: string };
        stopMs += since(stopAt);
        const stopped = terminal(live.state);
        const finished = stopped || cursor + spec.hexKeys.length >= total;
        const batchAt = Date.now();
        const posted = await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/batch`, 'POST', {
            offset: cursor, writes, skipped, failures, finished, leftEmpty, addedBytes,
        });
        batchMs += since(batchAt);
        slices += 1;
        const pause = Number((env as Env & { GENERATE_PAUSE?: string }).GENERATE_PAUSE);
        if (pause > 0) await new Promise((resolve) => setTimeout(resolve, pause));
        const state = String(posted.data?.state ?? '');
        if (stopped || terminal(state)) {
            countMs += await finishCounts(env, universeId, jobId, Number(posted.data?.objectBytes ?? 0), opened.job.bytesSettled ?? 0);
            logTime(universeId, jobId, total, slices, sliceMs, stopMs, generateMs, storeMs, batchMs, countMs, since(wallStart));
            return;
        }
        cursor += spec.hexKeys.length;
    }
    countMs += await finishCounts(env, universeId, jobId, 0, 0);
    logTime(universeId, jobId, total, slices, sliceMs, stopMs, generateMs, storeMs, batchMs, countMs, since(wallStart));
}

function logTime(universeId: string, jobId: string, hexes: number, slices: number, sliceMs: number, stopMs: number, generateMs: number, storeMs: number, batchMs: number, countMs: number, wallMs: number): void {
    console.log(JSON.stringify({
        job: 'generate-time', universeId, jobId, hexes, slices, sliceMs, stopMs, generateMs, storeMs, batchMs, countMs, wallMs,
    }));
}

async function finishCounts(env: Env, universeId: string, jobId: string, accounted: number, settled: number): Promise<number> {
    const countAt = Date.now();
    const pending = Math.max(0, Math.floor(accounted) - Math.floor(settled));
    if (pending > 0) {
        await env.DB.prepare(
            `UPDATE universes SET object_bytes = object_bytes + ? WHERE id = ?`,
        ).bind(pending, universeId).run();
        await call(env, universeId, `/jobs/${encodeURIComponent(jobId)}/settled`, 'POST', { bytes: accounted });
    }
    const count = (await call(env, universeId, '/hexes/count')).data as { count: number };
    await env.DB.prepare(`UPDATE universes SET hex_override_count = ? WHERE id = ?`).bind(count.count, universeId).run();
    return since(countAt);
}

async function objectBytes(env: Env, universeId: string): Promise<number> {
    const row = await env.DB.prepare(`SELECT object_bytes AS objectBytes FROM universes WHERE id = ?`).bind(universeId).first<{ objectBytes: number }>();
    return row?.objectBytes ?? 0;
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

async function storeTrees(env: Env, universeId: string, payloads: string[], baseline: number): Promise<{ hashes: string[]; added: number; baseline: number }> {
    const prepared = await Promise.all(payloads.map(async (bytes) => {
        const hash = await sha256Hex(bytes);
        return { bytes, hash, key: `u/${universeId}/objects/${hash}`, size: new TextEncoder().encode(bytes).byteLength };
    }));
    const unique = new Map<string, { bytes: string; hash: string; key: string; size: number }>();
    for (const item of prepared) if (!unique.has(item.hash)) unique.set(item.hash, item);
    const missing: Array<{ bytes: string; hash: string; key: string; size: number }> = [];
    const list = [...unique.values()];
    for (let index = 0; index < list.length; index += OPEN_CONNECTIONS) {
        const chunk = list.slice(index, index + OPEN_CONNECTIONS);
        const heads = await Promise.all(chunk.map((item) => env.PRIVATE_BUCKET.head(item.key)));
        chunk.forEach((item, at) => {
            if (!heads[at]) missing.push(item);
        });
    }
    const added = missing.reduce((sum, item) => sum + item.size, 0);
    if (baseline + added > OBJECT_QUOTA_BYTES) throw new Error('250 MB of objects per universe.');
    for (let index = 0; index < missing.length; index += OPEN_CONNECTIONS) {
        const chunk = missing.slice(index, index + OPEN_CONNECTIONS);
        await Promise.all(chunk.map((item) => env.PRIVATE_BUCKET.put(item.key, item.bytes, {
            httpMetadata: { contentType: 'application/json' },
        })));
    }
    return { hashes: prepared.map((item) => item.hash), added, baseline: baseline + added };
}
