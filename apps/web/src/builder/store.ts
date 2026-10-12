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
    FieldRefusalDetails,
    FormMessage,
    RefereeSector,
    SectorGenerateDone,
    SectorGenerateUndone,
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
import { startDraft, type BlankOpened, type DraftHandle, type KeepOutcome } from './draft.ts';
import { mergeHex } from './overlay.ts';
import { openSectors } from './sectors.ts';
import type { GenerateGrowingBody, GenerateGrowingHandle, GenerateHandle, HexView, JobProgress, UndoOutcome, UndoToken } from './types.ts';
import type { OwnSectors } from '../workspace/build/seam.ts';

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

type ChangeOp = 'remove' | 'restore' | 'keep' | 'blank';
type KeepPayload = { hash: string; changes: FormChange[]; roll?: FormRoll[] };
type Queued = {
    hexKey: string;
    baseRev: number;
    op: ChangeOp;
    before: HexRow | null;
    keep?: KeepPayload;
    /** Present when this save is a blank. The post body is only `baseRev`. */
    blank?: true;
    settle?: (value: KeepOutcome) => void;
    fail?: (err: unknown) => void;
};
type RevertItem = { hexKey: string; toRev: number; before: HexRow | null; op: ChangeOp | 'generate'; /** The rev this act wrote. A later edit makes this baseRev stale. */ atRev?: number };
type GrowUndoBody = { sectorId: string; baseRev: number } | { jobId: string };
type GrowRestoreSector = { id: string; toRev: number; baseRev: number };
type GrowRestoreHex = { hexKey: string; toRev: number; baseRev: number };
type UndoRecord =
    | { kind: 'reverts'; items: RevertItem[] }
    | { kind: 'job'; jobId: string; sectors: string[] }
    | { kind: 'grow'; body: GrowUndoBody; sectorIds: string[]; reloadSlugs: string[] }
    | { kind: 'grow-restore'; sectors: GrowRestoreSector[]; hexes: GrowRestoreHex[] };

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

/**
 * A generate job keeps running after the store that started it closes.
 * The next store for that universe takes the progress and a new Undo token.
 * A job that finishes while its store is still open is not kept: that store holds the token.
 */
type FollowedJob = {
    jobId: string;
    sectors: readonly string[];
    record: UndoRecord;
    progress: JobProgress;
    hear: Set<(progress: JobProgress) => void>;
    stop: () => void;
    spent: boolean;
};

const followedJobs = new Map<string, FollowedJob>();

function copyUndo(record: UndoRecord): UndoRecord {
    if (record.kind === 'job') return { kind: 'job', jobId: record.jobId, sectors: [...record.sectors] };
    if (record.kind === 'grow') {
        return {
            kind: 'grow',
            body: { ...record.body },
            sectorIds: [...record.sectorIds],
            reloadSlugs: [...record.reloadSlugs],
        };
    }
    return record;
}

function spendFollowed(jobId: string): void {
    for (const [universeId, live] of followedJobs) {
        if (live.jobId !== jobId) continue;
        live.spent = true;
        followedJobs.delete(universeId);
    }
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

/** Counts only. The job answer names failed hexes, not the ones that landed. */
function started(total: number): JobProgress {
    return { total, done: 0, failed: [], skipped: 0, state: 'running' };
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
    /** One generate that also makes sectors. Undo is `POST .../sectors/undo-generate`. */
    generateGrowing(body: GenerateGrowingBody, onProgress?: (progress: JobProgress) => void): GenerateGrowingHandle;
    /**
     * `truthOf` is the chart row under a hex that has no universe row yet.
     * Removing that chart system writes a removed row at baseRev 0.
     */
    remove(hexKeys: readonly string[], truthOf?: (hexKey: string) => SectorHex | null): UndoToken;
    restore(hexKeys: readonly string[]): UndoToken;
    /**
     * A grow act's token returns the Restore (sector undos, then hex reverts), or null when
     * the answer cannot be read. Every other token returns null.
     */
    undo(token: UndoToken): Promise<UndoToken | UndoOutcome | null>;
    /** The job this store started or picked up after another store closed. Null when there is none. */
    job: Ref<{ progress: JobProgress; undo: UndoToken } | null>;
    /** Stop the followed job. The store that started it is the one that sends the stop. */
    stopJob(): void;
    /** The edit form for one stored system. Local until `keep` on the handle. */
    openDraft(hexKey: string): Promise<DraftHandle>;
    /** An empty hand system on this hex, then that system's draft. A hex that already has a tree is refused. */
    blank(hexKey: string): Promise<BlankOpened>;
    flushMap(): Promise<void>;
    /** The object stored for the row's hash. One fetch. The body is not read. */
    tree(hexKey: string): Promise<unknown | null>;
    /** The referee's sectors, and the one-way switch into a hand-designed system. */
    sectors(): OwnSectors & { load(): Promise<void> };
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
    /** A grow job whose undo-generate has succeeded. Its poll ends as `stopped`. */
    let releasedJob: string | null = null;
    /** Hexes whose generate request has not landed. A remove of one of them still queues. */
    const pendingGenerate = new Set<string>();
    const currentJob = ref<{ progress: JobProgress; undo: UndoToken } | null>(null);
    let dropHear: (() => void) | null = null;
    let closed = false;

    function terminal(progress: JobProgress): boolean {
        return progress.state === 'done' || progress.state === 'stopped' || progress.state === 'failed';
    }

    function announce(progress: JobProgress): void {
        if (!universeId) return;
        const live = followedJobs.get(universeId);
        if (!live || live.spent) return;
        live.progress = progress;
        if (currentJob.value) currentJob.value = { progress, undo: currentJob.value.undo };
        for (const hear of [...live.hear]) hear(progress);
        if (!terminal(progress)) return;
        if (!closed || live.hear.size > 0) followedJobs.delete(universeId);
    }

    function rememberJob(jobId: string, sectors: readonly string[], record: UndoRecord, undo: UndoToken, progress: JobProgress): void {
        if (!universeId) return;
        const prior = followedJobs.get(universeId);
        if (prior && prior.jobId !== jobId) {
            prior.spent = true;
            followedJobs.delete(universeId);
        }
        followedJobs.set(universeId, {
            jobId,
            sectors,
            record,
            progress,
            hear: new Set(),
            stop: () => {
                askStop = true;
                if (wake) wake();
            },
            spent: false,
        });
        currentJob.value = { progress, undo };
    }

    function stopJob(): void {
        if (!universeId) return;
        const live = followedJobs.get(universeId);
        if (!live || live.spent) return;
        live.stop();
    }

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

    function detailCode(err: HttpError): string | null {
        return isRecord(err.details) && typeof err.details.code === 'string' ? err.details.code : null;
    }

    function conflictCurrent(err: HttpError): unknown {
        return isRecord(err.details) ? err.details.current : undefined;
    }

    /** The rev a remove or a restore wrote, so a later edit makes that Undo stale. */
    function noteActRev(hexKey: string, op: ChangeOp, rev: number): void {
        for (const rec of undos.values()) {
            if (rec.kind !== 'reverts') continue;
            for (const item of rec.items) {
                if (item.hexKey === hexKey && item.op === op && item.atRev === undefined) item.atRev = rev;
            }
        }
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
        const listed: FormMessageRow[] = [];
        if (isRecord(err.details) && Array.isArray(err.details.messages)) {
            for (const item of err.details.messages) {
                const parsed = FormMessage.safeParse(item);
                if (parsed.success) listed.push(parsed.data);
            }
        }
        const field = FieldRefusalDetails.safeParse(err.details);
        if (field.success && listed.length === 1 && listed[0].id === null) {
            return [{ ...listed[0], id: field.data.id }];
        }
        if (listed.length) return listed;
        if (field.success) return [{ id: field.data.id, text: err.message, holds: true }];
        return [];
    }

    function keepBody(change: Queued): { hash: string; baseRev: number; changes: FormChange[]; roll?: FormRoll[] } {
        const payload = change.keep;
        if (!payload) throw new Error('Name the draft.');
        const body = { hash: payload.hash, baseRev: change.baseRev, changes: payload.changes };
        if (payload.roll && payload.roll.length) return { ...body, roll: payload.roll };
        return body;
    }

    function blankBody(change: Queued): { baseRev: number } {
        if (!change.blank) throw new Error('Name the hex.');
        return { baseRev: change.baseRev };
    }

    function suffixOf(op: ChangeOp): string {
        if (op === 'remove') return '/remove';
        if (op === 'restore') return '/restore';
        if (op === 'blank') return '/blank';
        return '/keep';
    }

    function bodyOf(change: Queued): unknown {
        if (change.op === 'keep') return keepBody(change);
        if (change.op === 'blank') return blankBody(change);
        return { baseRev: change.baseRev };
    }

    function settleSaved(change: Queued, data: unknown): void {
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
                op: change.op,
                atRev: saved.rev,
            }],
        });
        lastError.value = '';
        change.settle?.({ status: 'kept', row: saved, undo });
    }

    async function sendOne(change: Queued): Promise<void> {
        const id = requireId();
        try {
            const data = await request('POST', hexPath(id, change.hexKey, suffixOf(change.op)), bodyOf(change));
            if (change.op === 'keep' || change.op === 'blank') {
                settleSaved(change, data);
                return;
            }
            land(change.hexKey, data);
            const saved = readRow(data);
            noteActRev(change.hexKey, change.op, saved ? saved.rev : 0);
            lastError.value = '';
        } catch (err) {
            if (err instanceof HttpError && err.status === 409) {
                const current = takeConflict(change.hexKey, err);
                if (change.op === 'keep' || change.op === 'blank') change.settle?.({ status: 'conflict', current, message: err.message });
                else showToast('Saved changes conflicted with a newer copy. The server copy is now shown.');
                lastError.value = '';
                return;
            }
            if (err instanceof HttpError && err.status >= 400 && err.status < 500) {
                putBack(change.hexKey, change.before);
                if (change.op === 'keep' || change.op === 'blank') {
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

    async function loadSector(slug: string, stale?: () => boolean): Promise<void> {
        const id = requireId();
        const fresh: HexRow[] = [];
        let cursor: string | null = null;
        const seen = new Set<string>();
        for (let page = 0; page < MAX_PAGES; page += 1) {
            if (stale?.()) return;
            const url = `/api/universes/${encodeURIComponent(id)}/hexes?sector=${encodeURIComponent(slug)}&limit=100` + (cursor ? `&cursor=${encodeURIComponent(cursor)}` : '');
            const data = BuilderHexPage.parse(await request('GET', url));
            fresh.push(...data.items);
            const next = data.nextCursor;
            if (!next || seen.has(next)) break;
            seen.add(next);
            cursor = next;
        }
        // A grow Undo may have dropped these rows while the page was in flight.
        if (stale?.()) return;
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

    async function reload(slugs: readonly string[], stale?: () => boolean): Promise<void> {
        for (const slug of slugs) {
            if (stale?.()) return;
            await loadSector(slug, stale);
        }
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

    /** A grow undo that landed while this poll was asleep. The poll then ends as stopped. */
    function released(jobId: string, last: JobProgress): JobProgress | null {
        if (releasedJob !== jobId) return null;
        releasedJob = null;
        const progress: JobProgress = { ...last, state: 'stopped' };
        announce(progress);
        return progress;
    }

    async function watch(jobId: string, slugs: readonly string[], onProgress?: (progress: JobProgress) => void): Promise<JobProgress> {
        const id = requireId();
        let polls = 0;
        let stopSent = false;
        const stale = (): boolean => releasedJob === jobId;
        let last: JobProgress = { total: 0, done: 0, failed: [], skipped: 0, state: 'running' };
        while (polls < MAX_POLLS) {
            const early = released(jobId, last);
            if (early) return early;
            polls += 1;
            let job = await readJob(id, jobId);
            const afterRead = released(jobId, progressOf(job));
            if (afterRead) return afterRead;
            if (!closed) await reload(slugs, stale);
            const afterReload = released(jobId, progressOf(job));
            if (afterReload) return afterReload;
            last = progressOf(job);
            announce(last);
            onProgress?.(last);
            const afterNote = released(jobId, last);
            if (afterNote) return afterNote;
            if (job.state === 'done' || job.state === 'stopped' || job.state === 'failed') return last;
            if (askStop && !stopSent) {
                stopSent = true;
                const stopping = progressOf(job, 'stopping');
                announce(stopping);
                onProgress?.(stopping);
                job = BuilderJob.parse(await request('POST', `/api/universes/${encodeURIComponent(id)}/jobs/${encodeURIComponent(jobId)}/stop`, {}));
                if (!closed) await reload(slugs);
                last = progressOf(job);
                announce(last);
                onProgress?.(last);
                if (job.state === 'done' || job.state === 'stopped' || job.state === 'failed') return last;
            }
            await wait(JOB_POLL_MS);
            wake = null;
            const afterWait = released(jobId, last);
            if (afterWait) return afterWait;
        }
        const late = released(jobId, last);
        if (late) return late;
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
        // After this call returns, before the request, so the bar can paint on the click.
        queueMicrotask(() => onProgress?.(started(body.hexKeys.length)));
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
                const record: UndoRecord = { kind: 'job', jobId: data.jobId, sectors: slugs };
                const undo = mint(record);
                rememberJob(data.jobId, slugs, record, undo, started(body.hexKeys.length));
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
                    atRev: row.rev,
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

    const SLOT_KEY = /^~slot_(-?\d+)_(-?\d+)\/(\d{4})$/;

    function checkSeeds(seeds: GenerateGrowingBody['makeSectors']): void {
        if (!Array.isArray(seeds) || seeds.length === 0) throw new Error('Name the sectors to make.');
        for (const seed of seeds) {
            if (!seed || typeof seed.name !== 'string' || !seed.name.trim()) throw new Error('Name the sectors to make.');
            const slot = seed.slot;
            if (!slot || !Number.isInteger(slot.x) || !Number.isInteger(slot.y)) throw new Error('Name the sectors to make.');
        }
    }

    /** Placeholder keys become `<id>/<hhhh>` for the sector that was made in that slot. */
    function growKeys(hexKeys: readonly string[], made: { id: string; slot: { x: number; y: number } }[]): Record<string, string> {
        const keys: Record<string, string> = {};
        for (const hexKey of hexKeys) {
            const match = SLOT_KEY.exec(hexKey);
            if (!match) continue;
            const x = Number(match[1]);
            const y = Number(match[2]);
            const sector = made.find((item) => item.slot.x === x && item.slot.y === y);
            if (!sector) throw new Error('The server did not send the sector.');
            keys[hexKey] = sector.id + '/' + match[3];
        }
        return keys;
    }

    function growSlugs(hexKeys: readonly string[], sectorIds: readonly string[]): { watch: string[]; existing: string[] } {
        const existing: string[] = [];
        for (const key of hexKeys) {
            const slug = sectorOf(key);
            if (!slug || slug.startsWith('~slot_')) continue;
            if (!existing.includes(slug)) existing.push(slug);
        }
        const watch = [...sectorIds];
        for (const slug of existing) if (!watch.includes(slug)) watch.push(slug);
        return { watch, existing };
    }

    function dropSectorRows(ids: readonly string[]): void {
        const made = new Set(ids);
        for (const key of [...rows.keys()]) {
            const slug = sectorOf(key);
            if (slug && made.has(slug)) dropRow(key);
        }
    }

    function generateGrowing(body: GenerateGrowingBody, onProgress?: (progress: JobProgress) => void): GenerateGrowingHandle {
        checkGenerate(body);
        checkSeeds(body.makeSectors);
        if (generating) throw new Error('A build is already running.');
        generating = true;
        askStop = false;
        releasedJob = null;
        for (const key of body.hexKeys) pendingGenerate.add(key);
        queueMicrotask(() => onProgress?.(started(body.hexKeys.length)));
        let accept: (value: { sectors: ReturnType<ReturnType<typeof openSectors>['adopt']>; keys: Record<string, string>; undo: UndoToken }) => void = () => {};
        let rejectAccepted: (err: unknown) => void = () => {};
        let acceptedSettled = false;
        const accepted = new Promise<{ sectors: ReturnType<ReturnType<typeof openSectors>['adopt']>; keys: Record<string, string>; undo: UndoToken }>((resolve, reject) => {
            accept = resolve;
            rejectAccepted = reject;
        });
        const finished = (async () => {
            try {
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
                    makeSectors: body.makeSectors.map((seed) => ({ name: seed.name, slot: { x: seed.slot.x, y: seed.slot.y } })),
                };
                if (body.hexKeys.length === 1) {
                    const only = body.hexKeys[0];
                    const slug = sectorOf(only);
                    const prior = previous.get(only);
                    payload.baseRev = slug && slug.startsWith('~slot_') ? 0 : (prior ? prior.rev : 0);
                }
                const data = await request('POST', `/api/universes/${encodeURIComponent(id)}/generate`, payload);
                const done = SectorGenerateDone.parse(data);
                const made = sectorBook().adopt(done.sectors);
                if (made.length === 0) throw new Error('The server did not send the sector.');
                const sectorIds = made.map((sector) => sector.id);
                const slugs = growSlugs(body.hexKeys, sectorIds);
                const keys = growKeys(body.hexKeys, made);
                for (const row of done.rows) land(row.hexKey, row);
                for (const slug of slugs.watch) loaded.add(slug);
                bump();
                const undoBody: GrowUndoBody = done.jobId
                    ? { jobId: done.jobId }
                    : { sectorId: made[0].id, baseRev: made[0].rev };
                const record: UndoRecord = { kind: 'grow', body: undoBody, sectorIds, reloadSlugs: slugs.existing };
                const undo = mint(record);
                if (done.jobId) rememberJob(done.jobId, slugs.watch, record, undo, started(body.hexKeys.length));
                const opened = { sectors: made, keys, undo };
                acceptedSettled = true;
                accept(opened);
                if (done.jobId) {
                    const progress = await watch(done.jobId, slugs.watch, onProgress);
                    if (queue.size > 0 && !cancelRetry) scheduleFlush();
                    lastError.value = '';
                    return { undo, progress };
                }
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
            } catch (err) {
                if (err instanceof HttpError && err.status === 409 && detailCode(err) === 'slot_in_use') {
                    const details = err.details;
                    const current = isRecord(details) ? details.current : undefined;
                    if (RefereeSector.safeParse(current).success) sectorBook().adopt([current]);
                }
                if (!lastError.value) lastError.value = err instanceof Error ? err.message : 'offline';
                if (!acceptedSettled) {
                    acceptedSettled = true;
                    rejectAccepted(err);
                }
                throw err;
            } finally {
                for (const key of body.hexKeys) pendingGenerate.delete(key);
                generating = false;
            }
        })();
        return {
            stop() {
                askStop = true;
                if (wake) wake();
            },
            accepted,
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
        const baseRev = item.atRev !== undefined ? item.atRev : (local ? local.rev : 0);
        try {
            const data = await request('POST', hexPath(id, item.hexKey, '/revert'), { toRev: item.toRev, baseRev });
            land(item.hexKey, data);
        } catch (err) {
            if (err instanceof HttpError && err.status === 409 && detailCode(err) === 'hex_changed') {
                const current = conflictCurrent(err);
                if (current != null) {
                    const row = readRow(current);
                    if (row) writeRow(row);
                    else dropRow(item.hexKey);
                }
            }
            throw err;
        }
    }

    async function undoGrow(tokenId: string, rec: Extract<UndoRecord, { kind: 'grow' }>): Promise<UndoToken | null> {
        await flushMap();
        if (queue.size > 0) throw new Error(lastError.value || 'offline');
        const id = requireId();
        const data = await request('POST', `/api/universes/${encodeURIComponent(id)}/sectors/undo-generate`, rec.body);
        const undone = SectorGenerateUndone.safeParse(data);
        sectorBook().forget(rec.sectorIds);
        if ('jobId' in rec.body) spendFollowed(rec.body.jobId);
        dropSectorRows(rec.sectorIds);
        for (const sectorId of rec.sectorIds) loaded.delete(sectorId);
        undos.delete(tokenId);
        if ('jobId' in rec.body) {
            releasedJob = rec.body.jobId;
            if (wake) wake();
        }
        await reload(rec.reloadSlugs);
        lastError.value = '';
        bump();
        if (!undone.success) return null;
        return mint({ kind: 'grow-restore', sectors: undone.data.sectors, hexes: undone.data.hexes });
    }

    async function undoGrowRestore(tokenId: string, rec: Extract<UndoRecord, { kind: 'grow-restore' }>): Promise<null> {
        await flushMap();
        if (queue.size > 0) throw new Error(lastError.value || 'offline');
        const id = requireId();
        const slugs: string[] = [];
        for (const sector of rec.sectors) {
            const data = await request('POST', `/api/universes/${encodeURIComponent(id)}/sectors/${encodeURIComponent(sector.id)}/undo`, {
                toRev: sector.toRev,
                baseRev: sector.baseRev,
            });
            if (RefereeSector.safeParse(data).success) sectorBook().adopt([data]);
            if (!slugs.includes(sector.id)) slugs.push(sector.id);
        }
        for (const hex of rec.hexes) {
            const data = await request('POST', hexPath(id, hex.hexKey, '/revert'), { toRev: hex.toRev, baseRev: hex.baseRev });
            land(hex.hexKey, data);
            const slug = sectorOf(hex.hexKey);
            if (slug && !slugs.includes(slug)) slugs.push(slug);
        }
        await reload(slugs);
        undos.delete(tokenId);
        lastError.value = '';
        bump();
        return null;
    }

    async function undo(token: UndoToken): Promise<UndoToken | UndoOutcome | null> {
        const rec = undos.get(token.id);
        if (!rec) return null;
        if (rec.kind === 'grow') return undoGrow(token.id, rec);
        if (rec.kind === 'grow-restore') return undoGrowRestore(token.id, rec);
        if (rec.kind === 'job') {
            await flushMap();
            if (queue.size > 0) throw new Error(lastError.value || 'offline');
            const id = requireId();
            const undone = BuilderJobUndo.parse(await request('POST', `/api/universes/${encodeURIComponent(id)}/jobs/${encodeURIComponent(rec.jobId)}/undo`, {}));
            spendFollowed(rec.jobId);
            await reload(rec.sectors);
            undos.delete(token.id);
            lastError.value = '';
            bump();
            if (undone.conflicts.length > 0) {
                return { id: token.id, restored: undone.restored, left: [...undone.conflicts], message: '' };
            }
            return null;
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
            return null;
        }
        await flushMap();
        if (queue.size > 0) throw new Error(lastError.value || 'offline');
        const left: string[] = [];
        let restored = 0;
        let message = '';
        for (const item of rec.items) {
            try {
                await revertOne(item);
                restored += 1;
            } catch (err) {
                if (err instanceof HttpError && err.status === 409 && detailCode(err) === 'hex_changed') {
                    left.push(item.hexKey);
                    if (!message) message = err.message;
                    continue;
                }
                throw err;
            }
        }
        if (left.length === 0) {
            undos.delete(token.id);
            lastError.value = '';
            bump();
            return null;
        }
        rec.items = rec.items.filter((item) => left.includes(item.hexKey));
        lastError.value = '';
        bump();
        return { id: token.id, restored, left, message };
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

    /** Drain this hex, then Keep or blank. A save already in flight applies its rev first. */
    async function enqueueSaved(hexKey: string, change: Pick<Queued, 'op' | 'keep' | 'blank'>): Promise<KeepOutcome> {
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
            op: change.op,
            before,
            keep: change.keep,
            blank: change.blank,
            settle: box.settle,
            fail: box.fail,
        });
        pending.value = true;
        await flushMap();
        return result;
    }

    function keepHex(hexKey: string, body: { hash: string; changes: FormChange[]; roll?: FormRoll[] }): Promise<KeepOutcome> {
        return enqueueSaved(hexKey, {
            op: 'keep',
            keep: {
                hash: body.hash,
                changes: body.changes.map((item) => ({ id: item.id, value: item.value })),
                roll: body.roll && body.roll.length ? body.roll.map((item) => ({ id: item.id })) : undefined,
            },
        });
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

    async function blank(hexKey: string): Promise<BlankOpened> {
        if (!parseHexKey(hexKey)) throw new Error('Name the hex.');
        const outcome = await enqueueSaved(hexKey, { op: 'blank', blank: true });
        if (outcome.status === 'conflict') throw new Error(outcome.message);
        if (outcome.status === 'refused') throw new Error(outcome.message);
        return { draft: await openDraft(hexKey), undo: outcome.undo };
    }

    let ownSectors: ReturnType<typeof openSectors> | null = null;

    function sectorBook(): NonNullable<typeof ownSectors> {
        sectors();
        if (!ownSectors) throw new Error('offline');
        return ownSectors;
    }

    function sectors(): OwnSectors & { load(): Promise<void> } {
        if (!ownSectors) {
            ownSectors = openSectors({
                universeId: requireId(),
                request,
                reload: async (slug) => {
                    await loadSector(slug).catch(() => undefined);
                },
            });
        }
        return ownSectors;
    }

    function adoptJob(): void {
        if (!universeId) return;
        const live = followedJobs.get(universeId);
        if (!live || live.spent) return;
        const undo = mint(copyUndo(live.record));
        currentJob.value = { progress: live.progress, undo };
        const hear = (progress: JobProgress) => {
            currentJob.value = { progress, undo };
            if (terminal(progress)) generating = false;
            void reload(live.sectors).catch(() => undefined);
            bump();
        };
        if (terminal(live.progress)) followedJobs.delete(universeId);
        else {
            live.hear.add(hear);
            dropHear = () => { live.hear.delete(hear); };
            generating = true;
        }
        void reload(live.sectors).catch(() => undefined);
    }

    function close(): void {
        closed = true;
        if (dropHear) dropHear();
        dropHear = null;
        currentJob.value = null;
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

    adoptJob();

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
        generateGrowing,
        remove,
        restore,
        undo,
        job: currentJob,
        stopJob,
        openDraft,
        blank,
        flushMap,
        tree,
        sectors,
        close,
    };
}
