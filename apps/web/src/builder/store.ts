/**
 * The universe map, speaking packages/shared/src/schemas/builder.ts and
 * apps/api/src/routes/builder.ts.
 *
 * Rows load one sector at a time. One hex is that page plus the chart entry already
 * in memory. Remove, restore and revert are one POST per hex. A second change while
 * that POST is in flight keeps the first baseRev, then adopts the rev the POST applied.
 * Many hexes are a job: the browser reads its counts, stop leaves what is done, and
 * one undo route puts the lot back. Page hide flushes.
 *
 * Preview is the stateless POST /api/generate/preview. Its seed is generationSeed
 * from apps/api/src/universe/hexes.ts (roll 0 is the universe seed; a later roll is
 * seed + "/roll/" + roll). The kept generate does not send that seed: the server pins it.
 * Edit in place is openDraft. The draft stays local until Keep, and Keep is one
 * more op on this queue. A tree is handed on whole.
 */
import { reactive, ref, type Ref } from 'vue';
import {
    BuilderAbsent,
    BuilderGenerateDone,
    BuilderHex,
    BuilderHexPage,
    BuilderJob,
    BuilderJobUndo,
    FormMessage,
    SectorHex,
    type BuilderGenerator,
    type BuilderHex as HexRow,
    type FormChange,
    type FormMessage as FormMessageRow,
    type FormRoll,
    type Settings,
} from '@voyage/shared';
import { onPageHide } from '../platform/browser.ts';
import { apiFetch } from '../platform/http.ts';
import { clearToasts, showToast } from '../shell/toast.ts';
import { parseHexKey } from '../workspace/places.ts';
import { startDraft, type DraftHandle, type KeepOutcome } from './draft.ts';
import { mergeHex } from './overlay.ts';
import type { GenerateHandle, HexView, JobProgress, UndoToken } from './types.ts';

type FetchLike = typeof fetch;
type Schedule = (fn: () => void, ms: number) => () => void;

const FLUSH_MS = 800;
const RETRY_CAP_MS = 30_000;
const JOB_POLL_MS = 400;
const MAX_PAGES = 20;
const MAX_POLLS = 10_000;

const GENERATORS = new Set<BuilderGenerator>(['bottom-up', 'top-down']);

export type MapUniverse = { id: string; name: string; truthVersion: string | null };

export type OpenMapOptions = {
    fetch: FetchLike;
    schedule?: Schedule;
    truthVersion: string | null;
    universeId: string | null;
    universeName?: string;
    /** Preview only. Absent until the chart manifest is in. */
    seed?: string | null;
    settings?: Settings | null;
};

type ChangeOp = 'remove' | 'restore' | 'keep';
type KeepPayload = { hash: string; changes: FormChange[]; roll?: FormRoll[] };
type Queued = {
    hexKey: string;
    baseRev: number;
    op: ChangeOp;
    before: HexRow | null;
    keep?: KeepPayload;
    settle?: (value: KeepOutcome) => void;
    fail?: (err: unknown) => void;
};
type RevertItem = { hexKey: string; toRev: number; before: HexRow | null; op: ChangeOp | 'generate' };
type UndoRecord =
    | { kind: 'reverts'; items: RevertItem[] }
    | { kind: 'job'; jobId: string; sectors: string[] };

class HttpError extends Error {
    readonly status: number;
    readonly details: unknown;
    constructor(status: number, message: string, details?: unknown) {
        super(message);
        this.status = status;
        this.details = details;
    }
}

function defaultSchedule(fn: () => void, ms: number): () => void {
    const id = setTimeout(fn, ms);
    return () => clearTimeout(id);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === 'object' && !Array.isArray(value);
}

function sectorOf(hexKey: string): string | null {
    const place = parseHexKey(hexKey);
    return place ? place.slug : null;
}

/** Roll 0 is the universe seed. Copied from generationSeed in the API. */
export function previewSeed(seed: string, roll: number): string {
    if (roll === 0) return seed;
    return seed + '/roll/' + roll;
}

function hexPath(id: string, hexKey: string, suffix = ''): string {
    const place = parseHexKey(hexKey);
    if (!place) throw new Error('Name the hex.');
    return `/api/universes/${encodeURIComponent(id)}/hexes/${encodeURIComponent(place.slug)}/${place.hex}${suffix}`;
}

function readRow(value: unknown): HexRow | null {
    const row = BuilderHex.safeParse(value);
    if (row.success) return row.data;
    const absent = BuilderAbsent.safeParse(value);
    if (absent.success) return null;
    throw new Error('The server sent a row the store could not read.');
}

function copyRow(row: HexRow | null): HexRow | null {
    return row ? { ...row } : null;
}

function progressOf(job: ReturnType<typeof BuilderJob.parse>, state: JobProgress['state'] = job.state): JobProgress {
    return {
        total: job.total,
        done: job.done,
        failed: job.failures.map((item) => item.hexKey),
        skipped: job.skipped,
        state,
    };
}

export type Builder = {
    pending: Ref<boolean>;
    lastError: Ref<string>;
    universe(): MapUniverse | null;
    tick(): number;
    loadSector(slug: string): Promise<void>;
    sectorLoaded(slug: string): boolean;
    rows(slug: string): HexRow[];
    row(hexKey: string): HexRow | null;
    /** Null until that sector's page is in memory, unless a row was just written. */
    hexView(hexKey: string, truth: SectorHex | null): HexView | null;
    preview(hexKey: string, edition: string, generator: BuilderGenerator, roll: number): Promise<{ envelope: unknown; hash: string; roll: number; entry: SectorHex | null }>;
    generate(body: { hexKeys: readonly string[]; edition: string; generator: BuilderGenerator; roll: number; filledToo: boolean }, onProgress?: (progress: JobProgress) => void): GenerateHandle;
    /**
     * `truthOf` is the chart row under a hex that has no universe row yet.
     * Removing that chart system writes a removed row at baseRev 0.
     */
    remove(hexKeys: readonly string[], truthOf?: (hexKey: string) => SectorHex | null): UndoToken;
    restore(hexKeys: readonly string[]): UndoToken;
    undo(token: UndoToken): Promise<void>;
    /** The edit form for one stored system. Local until `keep` on the handle. */
    openDraft(hexKey: string): Promise<DraftHandle>;
    flushMap(): Promise<void>;
    /** The object stored for the row's hash. One fetch. The body is not read. */
    tree(hexKey: string): Promise<unknown | null>;
    close(): void;
};

export function openMap(options: OpenMapOptions): Builder {
    const schedule = options.schedule ?? defaultSchedule;
    const universeId = options.universeId;
    const rows = new Map<string, HexRow>();
    const envelopes = new Map<string, unknown>();
    const loaded = new Set<string>();
    const queue = new Map<string, Queued>();
    const undos = new Map<string, UndoRecord>();
    const state = reactive({ tick: 0 });
    const pending = ref(false);
    const lastError = ref('');
    let serial = 0;
    let attempt = 0;
    let cancelTimer: (() => void) | null = null;
    let cancelRetry: (() => void) | null = null;
    let flight: Promise<void> | null = null;
    let askStop = false;
    let wake: (() => void) | null = null;
    let generating = false;
    /** Hexes whose generate request has not landed. A remove of one of them still queues. */
    const pendingGenerate = new Set<string>();

    function bump(): void {
        state.tick += 1;
    }

    function universe(): MapUniverse | null {
        if (!universeId) return null;
        return { id: universeId, name: options.universeName ?? '', truthVersion: options.truthVersion };
    }

    function requireId(): string {
        if (!universeId) throw new Error('offline');
        return universeId;
    }

    async function request(method: string, url: string, body?: unknown): Promise<unknown> {
        requireId();
        let res: Response;
        try {
            res = await apiFetch(options.fetch, url, {
                method,
                body: body === undefined ? undefined : JSON.stringify(body),
            });
        } catch (err) {
            throw new HttpError(0, err instanceof Error ? err.message : 'offline');
        }
        const payload = await res.json().catch(() => null) as { data?: unknown; error?: { message?: string; details?: unknown } } | null;
        if (!res.ok) {
            const message = payload && payload.error && payload.error.message;
            throw new HttpError(res.status, message || 'offline', payload && payload.error ? payload.error.details : undefined);
        }
        if (!payload || !isRecord(payload) || !('data' in payload)) throw new HttpError(res.status, 'offline');
        return payload.data;
    }

    function writeRow(row: HexRow): void {
        rows.set(row.hexKey, { ...row });
    }

    function dropRow(hexKey: string): void {
        rows.delete(hexKey);
        envelopes.delete(hexKey);
    }

    function putBack(hexKey: string, before: HexRow | null): void {
        if (before) writeRow(before);
        else dropRow(hexKey);
    }

    /** A follow-up queued during a save takes the rev that save applied, and keeps its own op. */
    function land(hexKey: string, value: unknown): void {
        const row = readRow(value);
        const queued = queue.get(hexKey);
        if (queued) queued.baseRev = row ? row.rev : 0;
        if (!row) {
            if (!queued) dropRow(hexKey);
            return;
        }
        if (queued) {
            const local = rows.get(hexKey);
            if (local) local.rev = row.rev;
            return;
        }
        writeRow(row);
    }

    function remember(change: Queued): void {
        const previous = queue.get(change.hexKey);
        queue.set(change.hexKey, previous ? { ...change, baseRev: previous.baseRev } : change);
    }

    function scheduleFlush(): void {
        if (cancelTimer || flight) return;
        cancelTimer = schedule(() => {
            cancelTimer = null;
            void flushMap();
        }, FLUSH_MS);
    }

    function scheduleRetry(): void {
        if (cancelRetry) return;
        const ms = Math.min(FLUSH_MS * 2 ** attempt, RETRY_CAP_MS);
        attempt += 1;
        cancelRetry = schedule(() => {
            cancelRetry = null;
            void flushMap();
        }, ms);
    }

    function conflictCurrent(err: HttpError): unknown {
        return isRecord(err.details) ? err.details.current : undefined;
    }

    /** The row a 409 carried. The change behind this save is dropped. */
    function takeConflict(hexKey: string, err: HttpError): HexRow | null {
        queue.delete(hexKey);
        const current = conflictCurrent(err);
        if (current == null) {
            dropRow(hexKey);
            return null;
        }
        const row = readRow(current);
        if (row) writeRow(row);
        else dropRow(hexKey);
        return row;
    }

    function formMessages(err: HttpError): FormMessageRow[] {
        if (!isRecord(err.details) || !Array.isArray(err.details.messages)) return [];
        const out: FormMessageRow[] = [];
        for (const item of err.details.messages) {
            const parsed = FormMessage.safeParse(item);
            if (parsed.success) out.push(parsed.data);
        }
        return out;
    }

    function keepBody(change: Queued): { hash: string; baseRev: number; changes: FormChange[]; roll?: FormRoll[] } {
        const payload = change.keep;
        if (!payload) throw new Error('Name the draft.');
        const body = { hash: payload.hash, baseRev: change.baseRev, changes: payload.changes };
        if (payload.roll && payload.roll.length) return { ...body, roll: payload.roll };
        return body;
    }

    async function sendOne(change: Queued): Promise<void> {
        const id = requireId();
        const suffix = change.op === 'remove' ? '/remove' : change.op === 'restore' ? '/restore' : '/keep';
        const body = change.op === 'keep' ? keepBody(change) : { baseRev: change.baseRev };
        try {
            const data = await request('POST', hexPath(id, change.hexKey, suffix), body);
            if (change.op === 'keep') {
                const saved = readRow(data);
                land(change.hexKey, data);
                if (!saved) {
                    change.fail?.(new Error('The server sent a row the store could not read.'));
                    return;
                }
                const undo = mint({
                    kind: 'reverts',
                    items: [{
                        hexKey: change.hexKey,
                        toRev: change.before ? change.before.rev : 0,
                        before: change.before,
                        op: 'keep',
                    }],
                });
                lastError.value = '';
                change.settle?.({ status: 'kept', row: saved, undo });
                return;
            }
            land(change.hexKey, data);
            lastError.value = '';
        } catch (err) {
            if (err instanceof HttpError && err.status === 409) {
                const current = takeConflict(change.hexKey, err);
                if (change.op === 'keep') change.settle?.({ status: 'conflict', current });
                else showToast('Saved changes conflicted with a newer copy. The server copy is now shown.');
                lastError.value = '';
                return;
            }
            if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
                putBack(change.hexKey, change.before);
                if (change.op === 'keep') {
                    change.settle?.({
                        status: 'refused',
                        message: err.message,
                        messages: formMessages(err),
                    });
                    lastError.value = '';
                    return;
                }
                lastError.value = err.message;
                return;
            }
            throw err;
        }
    }

    async function flushMap(): Promise<void> {
        if (flight) return flight;
        if (cancelTimer) {
            cancelTimer();
            cancelTimer = null;
        }
        if (cancelRetry) {
            cancelRetry();
            cancelRetry = null;
        }
        if (queue.size === 0) {
            pending.value = false;
            return;
        }
        if (!universeId) {
            lastError.value = 'offline';
            pending.value = true;
            return;
        }
        const batch = [...queue.values()];
        queue.clear();
        pending.value = true;
        const run = (async () => {
            for (let index = 0; index < batch.length; index += 1) {
                try {
                    await sendOne(batch[index]);
                } catch (err) {
                    for (let rest = index; rest < batch.length; rest += 1) {
                        if (!queue.has(batch[rest].hexKey)) queue.set(batch[rest].hexKey, batch[rest]);
                    }
                    lastError.value = err instanceof Error ? err.message : 'offline';
                    scheduleRetry();
                    return;
                }
            }
            attempt = 0;
        })().finally(() => {
            flight = null;
            pending.value = queue.size > 0;
            if (queue.size > 0 && !cancelRetry) scheduleFlush();
            bump();
        });
        flight = run;
        return run;
    }

    async function loadSector(slug: string): Promise<void> {
        const id = requireId();
        const fresh: HexRow[] = [];
        let cursor: string | null = null;
        const seen = new Set<string>();
        for (let page = 0; page < MAX_PAGES; page += 1) {
            const url = `/api/universes/${encodeURIComponent(id)}/hexes?sector=${encodeURIComponent(slug)}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
            const data = BuilderHexPage.parse(await request('GET', url));
            fresh.push(...data.items);
            const next = data.nextCursor;
            if (!next || seen.has(next)) break;
            seen.add(next);
            cursor = next;
        }
        for (const key of [...rows.keys()]) {
            if (sectorOf(key) === slug && !queue.has(key)) dropRow(key);
        }
        for (const row of fresh) {
            if (queue.has(row.hexKey)) continue;
            writeRow(row);
        }
        loaded.add(slug);
        bump();
    }

    function sectorsOf(keys: readonly string[]): string[] {
        const out: string[] = [];
        for (const key of keys) {
            const slug = sectorOf(key);
            if (slug && !out.includes(slug)) out.push(slug);
        }
        return out;
    }

    async function reload(slugs: readonly string[]): Promise<void> {
        for (const slug of slugs) await loadSector(slug);
    }

    function hexView(hexKey: string, truth: SectorHex | null): HexView | null {
        const slug = sectorOf(hexKey);
        if (!slug || (!loaded.has(slug) && !rows.has(hexKey))) return null;
        return mergeHex(hexKey, truth, rows.get(hexKey) ?? null);
    }

    async function preview(hexKey: string, edition: string, generator: BuilderGenerator, roll: number): Promise<{ envelope: unknown; hash: string; roll: number; entry: SectorHex | null }> {
        if (!parseHexKey(hexKey)) throw new Error('Name the hex.');
        if (!edition) throw new Error('Name the engine.');
        if (!GENERATORS.has(generator)) throw new Error('Name the generator.');
        if (!Number.isInteger(roll) || roll < 0) throw new Error('Name the roll.');
        const seed = options.seed;
        const settings = options.settings;
        if (!seed || !settings) throw new Error('The chart is still loading.');
        const data = await request('POST', '/api/generate/preview', {
            edition,
            mode: generator,
            seed: previewSeed(seed, roll),
            settings,
            hexKey,
            inputs: { type: 'SYSTEM_PRESENT' },
        });
        if (!isRecord(data) || data.envelope == null || typeof data.hash !== 'string') {
            throw new Error('The server did not send a system.');
        }
        const parsed = SectorHex.safeParse(data.entry);
        return { envelope: data.envelope, hash: data.hash, roll, entry: parsed.success ? parsed.data : null };
    }

    function mint(record: UndoRecord): UndoToken {
        const token = { id: 'undo-' + (++serial) };
        undos.set(token.id, record);
        return token;
    }

    function wait(ms: number): Promise<void> {
        return new Promise((resolve) => {
            const cancel = schedule(() => resolve(), ms);
            wake = () => {
                cancel();
                resolve();
            };
        });
    }

    async function readJob(id: string, jobId: string): Promise<ReturnType<typeof BuilderJob.parse>> {
        return BuilderJob.parse(await request('GET', `/api/universes/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}`));
    }

    async function watch(jobId: string, slugs: readonly string[], onProgress?: (progress: JobProgress) => void): Promise<JobProgress> {
        const id = requireId();
        let polls = 0;
        let stopSent = false;
        while (polls < MAX_POLLS) {
            polls += 1;
            let job = await readJob(id, jobId);
            await reload(slugs);
            onProgress?.(progressOf(job));
            if (job.state === 'done' || job.state === 'stopped' || job.state === 'failed') return progressOf(job);
            if (askStop && !stopSent) {
                stopSent = true;
                onProgress?.(progressOf(job, 'stopping'));
                job = BuilderJob.parse(await request('POST', `/api/universes/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}/stop`, {}));
                await reload(slugs);
                onProgress?.(progressOf(job));
                if (job.state === 'done' || job.state === 'stopped' || job.state === 'failed') return progressOf(job);
            }
            await wait(JOB_POLL_MS);
            wake = null;
        }
        throw new Error('The job did not finish.');
    }

    function checkGenerate(body: { hexKeys: readonly string[]; edition: string; generator: BuilderGenerator; roll: number; filledToo: boolean }): void {
        if (!Array.isArray(body.hexKeys) || body.hexKeys.length === 0) throw new Error('Name the hexes to generate.');
        const seen = new Set<string>();
        for (const key of body.hexKeys) {
            if (typeof key !== 'string' || !parseHexKey(key) || seen.has(key)) throw new Error('Name the hexes to generate.');
            seen.add(key);
        }
        if (typeof body.edition !== 'string' || !body.edition) throw new Error('Name the engine.');
        if (!GENERATORS.has(body.generator)) throw new Error('Name the generator.');
        if (typeof body.roll !== 'number' || !Number.isInteger(body.roll) || body.roll < 0) throw new Error('Name the roll.');
        if (typeof body.filledToo !== 'boolean') throw new Error('Name whether filled hexes are generated too.');
    }

    function generate(body: { hexKeys: readonly string[]; edition: string; generator: BuilderGenerator; roll: number; filledToo: boolean }, onProgress?: (progress: JobProgress) => void): GenerateHandle {
        checkGenerate(body);
        if (generating) throw new Error('A build is already running.');
        generating = true;
        askStop = false;
        for (const key of body.hexKeys) pendingGenerate.add(key);
        const slugs = sectorsOf(body.hexKeys);
        const finished = (async () => {
            const previous = new Map<string, HexRow | null>();
            for (const key of body.hexKeys) previous.set(key, copyRow(rows.get(key) ?? null));
            await flushMap();
            if (queue.size > 0) throw new Error(lastError.value || 'offline');
            const id = requireId();
            const payload: Record<string, unknown> = {
                hexKeys: [...body.hexKeys],
                edition: body.edition,
                generator: body.generator,
                roll: body.roll,
                filledToo: body.filledToo,
            };
            if (body.hexKeys.length === 1) {
                const prior = previous.get(body.hexKeys[0]);
                payload.baseRev = prior ? prior.rev : 0;
            }
            const data = await request('POST', `/api/universes/${encodeURIComponent(id)}/generate`, payload);
            if (isRecord(data) && typeof data.jobId === 'string') {
                const undo = mint({ kind: 'job', jobId: data.jobId, sectors: slugs });
                const progress = await watch(data.jobId, slugs, onProgress);
                if (queue.size > 0 && !cancelRetry) scheduleFlush();
                lastError.value = '';
                return { undo, progress };
            }
            const done = BuilderGenerateDone.parse(data);
            for (const row of done.rows) land(row.hexKey, row);
            for (const slug of slugs) loaded.add(slug);
            bump();
            const undo = mint({
                kind: 'reverts',
                items: done.rows.map((row) => ({
                    hexKey: row.hexKey,
                    toRev: previous.get(row.hexKey)?.rev ?? 0,
                    before: previous.get(row.hexKey) ?? null,
                    op: 'generate' as const,
                })),
            });
            const progress: JobProgress = {
                total: body.hexKeys.length,
                done: done.rows.length,
                failed: [],
                skipped: done.skipped.length,
                state: 'done',
            };
            onProgress?.(progress);
            if (queue.size > 0 && !cancelRetry) scheduleFlush();
            lastError.value = '';
            return { undo, progress };
        })().catch((err: unknown) => {
            if (!lastError.value) lastError.value = err instanceof Error ? err.message : 'offline';
            throw err;
        }).finally(() => {
            for (const key of body.hexKeys) pendingGenerate.delete(key);
            generating = false;
        });
        return {
            stop() {
                askStop = true;
                if (wake) wake();
            },
            finished,
        };
    }

    function remove(hexKeys: readonly string[], truthOf?: (hexKey: string) => SectorHex | null): UndoToken {
        const items: RevertItem[] = [];
        for (const hexKey of hexKeys) {
            if (!parseHexKey(hexKey)) continue;
            const before = copyRow(rows.get(hexKey) ?? null);
            const rev = before ? before.rev : 0;
            if (before && options.truthVersion !== null) {
                writeRow({ ...before, state: 'removed', treeHash: null });
            } else if (before) {
                dropRow(hexKey);
            } else {
                const truth = truthOf ? truthOf(hexKey) : null;
                const chartSystem = options.truthVersion !== null && !!truth && truth.tree !== null;
                // An empty hex, or an own map with no row, is not a remove. A generate
                // still in flight is: the row arrives, and this remove follows it.
                if (!chartSystem && !pendingGenerate.has(hexKey)) continue;
                if (chartSystem && truth) {
                    writeRow({
                        hexKey,
                        state: 'removed',
                        treeHash: null,
                        baseHash: truth.tree,
                        roll: 0,
                        rev: 1,
                        updatedAt: '1970-01-01T00:00:00.000Z',
                        entry: truth,
                    });
                }
            }
            remember({ hexKey, baseRev: rev, op: 'remove', before });
            items.push({ hexKey, toRev: rev, before, op: 'remove' });
        }
        bump();
        if (items.length) {
            pending.value = true;
            scheduleFlush();
        }
        return mint({ kind: 'reverts', items });
    }

    function restore(hexKeys: readonly string[]): UndoToken {
        const items: RevertItem[] = [];
        for (const hexKey of hexKeys) {
            const before = copyRow(rows.get(hexKey) ?? null);
            if (!before) continue;
            dropRow(hexKey);
            remember({ hexKey, baseRev: before.rev, op: 'restore', before });
            items.push({ hexKey, toRev: before.rev, before, op: 'restore' });
        }
        bump();
        if (items.length) {
            pending.value = true;
            scheduleFlush();
        }
        return mint({ kind: 'reverts', items });
    }

    async function revertOne(item: RevertItem): Promise<void> {
        const id = requireId();
        const local = rows.get(item.hexKey);
        const baseRev = local ? local.rev : 0;
        const data = await request('POST', hexPath(id, item.hexKey, '/revert'), { toRev: item.toRev, baseRev });
        land(item.hexKey, data);
    }

    async function undo(token: UndoToken): Promise<void> {
        const rec = undos.get(token.id);
        if (!rec) return;
        if (rec.kind === 'job') {
            await flushMap();
            if (queue.size > 0) throw new Error(lastError.value || 'offline');
            const id = requireId();
            BuilderJobUndo.parse(await request('POST', `/api/universes/${encodeURIComponent(id)}/jobs/${encodeURIComponent(rec.jobId)}/undo`, {}));
            await reload(rec.sectors);
            undos.delete(token.id);
            lastError.value = '';
            bump();
            return;
        }
        const unsent = !flight && rec.items.length > 0 && rec.items.every((item) => {
            const queued = queue.get(item.hexKey);
            return !!queued && queued.op === item.op;
        });
        if (unsent) {
            for (const item of rec.items) {
                queue.delete(item.hexKey);
                putBack(item.hexKey, item.before);
            }
            undos.delete(token.id);
            pending.value = queue.size > 0;
            bump();
            return;
        }
        await flushMap();
        if (queue.size > 0) throw new Error(lastError.value || 'offline');
        for (const item of rec.items) await revertOne(item);
        undos.delete(token.id);
        lastError.value = '';
        bump();
    }

    async function tree(hexKey: string): Promise<unknown | null> {
        const row = rows.get(hexKey);
        if (!row || !row.treeHash) return null;
        const cached = envelopes.get(row.treeHash);
        if (cached !== undefined) return cached;
        const id = requireId();
        let res: Response;
        try {
            res = await apiFetch(options.fetch, `/api/universes/${encodeURIComponent(id)}/objects/${row.treeHash}`);
        } catch (err) {
            throw new Error(err instanceof Error ? err.message : 'offline');
        }
        if (!res.ok) throw new Error('offline');
        const envelope = await res.json();
        envelopes.set(row.treeHash, envelope);
        return envelope;
    }

    const cancelHide = onPageHide(() => { void flushMap(); });

    /** Drain this hex, then Keep. A save already in flight applies its rev first. */
    async function keepHex(hexKey: string, body: { hash: string; changes: FormChange[]; roll?: FormRoll[] }): Promise<KeepOutcome> {
        if (!universeId) throw new Error('offline');
        for (let pass = 0; pass < 5; pass += 1) {
            await flushMap();
            if (!queue.has(hexKey) && !flight) break;
        }
        if (queue.has(hexKey) || flight) throw new Error(lastError.value || 'offline');
        const before = copyRow(rows.get(hexKey) ?? null);
        const box: { settle: (value: KeepOutcome) => void; fail: (err: unknown) => void } = {
            settle: () => {},
            fail: () => {},
        };
        const result = new Promise<KeepOutcome>((resolve, reject) => {
            box.settle = resolve;
            box.fail = reject;
        });
        remember({
            hexKey,
            baseRev: before ? before.rev : 0,
            op: 'keep',
            before,
            keep: {
                hash: body.hash,
                changes: body.changes.map((item) => ({ id: item.id, value: item.value })),
                roll: body.roll && body.roll.length ? body.roll.map((item) => ({ id: item.id })) : undefined,
            },
            settle: box.settle,
            fail: box.fail,
        });
        pending.value = true;
        await flushMap();
        return result;
    }

    function openDraft(hexKey: string): Promise<DraftHandle> {
        if (!parseHexKey(hexKey)) throw new Error('Name the hex.');
        return startDraft({
            request,
            schedule,
            delay: FLUSH_MS,
            hexPath: (key, suffix = '') => hexPath(requireId(), key, suffix),
            keep: (key, body) => keepHex(key, body),
        }, hexKey);
    }

    function close(): void {
        cancelHide();
        if (cancelTimer) cancelTimer();
        if (cancelRetry) cancelRetry();
        cancelTimer = null;
        cancelRetry = null;
        for (const change of queue.values()) change.fail?.(new Error('offline'));
        queue.clear();
        pending.value = false;
        lastError.value = '';
        clearToasts();
    }

    return {
        pending,
        lastError,
        universe,
        tick: () => state.tick,
        loadSector,
        sectorLoaded: (slug) => loaded.has(slug),
        rows: (slug) => {
            const out: HexRow[] = [];
            for (const row of rows.values()) {
                if (sectorOf(row.hexKey) === slug) out.push(row);
            }
            return out;
        },
        row: (hexKey) => rows.get(hexKey) ?? null,
        hexView,
        preview,
        generate,
        remove,
        restore,
        undo,
        openDraft,
        flushMap,
        tree,
        close,
    };
}
