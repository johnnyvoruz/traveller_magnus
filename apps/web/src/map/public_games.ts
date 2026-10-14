/**
 * Public games for the sectors on screen. One GET per sector for a visit.
 * A sector that leaves and comes back is not asked again for 60 seconds.
 * The server allows 60 calls a minute. This client allows 12, so a pan stays
 * under that cap. At the hex tier a sector is about 720 by 1040 pixels, so an
 * 8K screen can show about 72 sectors. The worst case is those 72 arriving at
 * once: 12 calls go out, and the rest wait until a slot is 60 seconds old.
 *
 * The server leaves the caller's own universes out of the answer. Every hex
 * in that answer is drawn. `ownName` may still be passed and is not read.
 */
import type { PublicGamesHex } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';

/** Calls kept in any 60 seconds. The server's cap is 60. */
export const PUBLIC_GAMES_BUDGET = 12;
export const PUBLIC_GAMES_WINDOW_MS = 60_000;
/** A sector that left the screen is not asked again until this has passed. */
export const PUBLIC_GAMES_REVISIT_MS = 60_000;

export type PublicGameMark = PublicGamesHex;

export type PublicGamesWatch = {
    signedIn: boolean;
    /** The map's truth pin. Null skips the call. */
    truthVersion: string | null;
    /** Sectors drawn this frame. A slug that starts with `~` is not requested. */
    sectors: readonly string[];
    /**
     * Open universe name. Ignored: the server already left this viewer's games out.
     * Optional so a caller can still pass it.
     */
    ownName?: string | null;
};

type WatchState = {
    signedIn: boolean;
    truthVersion: string | null;
    sectors: readonly string[];
};

type Clock = {
    now(): number;
    later(fn: () => void, ms: number): void;
};

type Held = {
    marks: PublicGameMark[];
    /** When the sector left the screen. Null while it is in view. */
    leftAt: number | null;
};

const SECTOR_SLUG = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/;
const LOCAL_HEX = /^\d{4}$/;
const EMPTY: readonly PublicGameMark[] = [];

const realClock: Clock = {
    now: () => Date.now(),
    later: (fn, ms) => {
        setTimeout(fn, ms);
    },
};

let fetchImpl: typeof fetch = fetch;
let clock: Clock = realClock;
let generation = 0;
let timerToken = 0;
let notify: (() => void) | null = null;
let watch: WatchState = { signedIn: false, truthVersion: null, sectors: [] };
const held = new Map<string, Held>();
const sentAt: number[] = [];
const flight = new Set<string>();
const queue: string[] = [];
const queued = new Set<string>();

function cacheKey(truth: string, slug: string): string {
    return truth + '\n' + slug;
}

/** Tests replace fetch. Pass null to restore the page fetch. */
export function bindPublicGames(next: typeof fetch | null): void {
    fetchImpl = next ?? fetch;
}

/** Tests replace the clock. Pass null to restore the real clock. */
export function _clockForTests(next: Clock | null): void {
    clock = next ?? realClock;
}

/** Tests drop the cache, the budget, and any paced call. */
export function resetPublicGames(): void {
    generation += 1;
    timerToken = 0;
    notify = null;
    watch = { signedIn: false, truthVersion: null, sectors: [] };
    held.clear();
    sentAt.length = 0;
    flight.clear();
    queue.length = 0;
    queued.clear();
    fetchImpl = fetch;
    clock = realClock;
}

function prune(now: number): void {
    const cut = now - PUBLIC_GAMES_WINDOW_MS;
    while (sentAt.length > 0 && (sentAt[0] ?? 0) <= cut) sentAt.shift();
}

function budgetLeft(now: number): number {
    prune(now);
    return PUBLIC_GAMES_BUDGET - sentAt.length;
}

function delayUntilBudget(now: number): number {
    prune(now);
    if (sentAt.length < PUBLIC_GAMES_BUDGET) return 0;
    return Math.max(0, (sentAt[0] ?? now) + PUBLIC_GAMES_WINDOW_MS - now);
}

let timerSerial = 0;

/** A reset clears `timerToken`, so a callback that was already booked does not pump. */
function armLater(wait: number): void {
    if (timerToken !== 0) return;
    const stamp = ++timerSerial;
    timerToken = stamp;
    clock.later(() => {
        if (timerToken !== stamp) return;
        timerToken = 0;
        pump();
    }, wait);
}

function markTruthLeft(truth: string, now: number): void {
    const prefix = truth + '\n';
    for (const [key, row] of held) {
        if (row.leftAt !== null) continue;
        if (key.startsWith(prefix)) row.leftAt = now;
    }
}

function markLeft(now: number): void {
    const truth = watch.truthVersion;
    if (!truth) return;
    const seen = new Set(watch.sectors);
    const prefix = truth + '\n';
    for (const [key, row] of held) {
        if (row.leftAt !== null) continue;
        if (!key.startsWith(prefix)) continue;
        if (!seen.has(key.slice(prefix.length))) row.leftAt = now;
    }
}

function enqueue(slug: string): void {
    if (queued.has(slug)) return;
    queued.add(slug);
    queue.push(slug);
}

function consider(slug: string, now: number): void {
    if (!SECTOR_SLUG.test(slug)) return;
    const truth = watch.truthVersion;
    if (!truth) return;
    const key = cacheKey(truth, slug);
    const row = held.get(key);
    if (row && row.leftAt !== null) {
        if (now - row.leftAt < PUBLIC_GAMES_REVISIT_MS) {
            row.leftAt = null;
            return;
        }
        row.leftAt = null;
    } else if (row) {
        return;
    }
    if (flight.has(key)) return;
    enqueue(slug);
}

function readSector(body: unknown): PublicGameMark[] | null {
    if (!body || typeof body !== 'object') return null;
    const hexes = (body as { hexes?: unknown }).hexes;
    if (!Array.isArray(hexes) || hexes.length > 1280) return null;
    const out: PublicGameMark[] = [];
    for (const item of hexes) {
        if (!item || typeof item !== 'object') return null;
        const row = item as { hex?: unknown; count?: unknown; name?: unknown };
        if (typeof row.hex !== 'string' || !LOCAL_HEX.test(row.hex)) return null;
        if (typeof row.count !== 'number' || !Number.isInteger(row.count) || row.count < 1) return null;
        if (row.count === 1) {
            if (typeof row.name !== 'string') return null;
            out.push({ hex: row.hex, count: row.count, name: row.name });
        } else if (row.name === null) {
            out.push({ hex: row.hex, count: row.count, name: null });
        } else {
            return null;
        }
    }
    return out;
}

async function fetchOne(truth: string, slug: string): Promise<void> {
    const key = cacheKey(truth, slug);
    const gen = generation;
    flight.add(key);
    sentAt.push(clock.now());
    let marks: PublicGameMark[] = [];
    let failed = true;
    try {
        const params = new URLSearchParams({ truthVersion: truth, sector: slug });
        const res = await apiFetch(fetchImpl, '/api/public-games?' + params.toString());
        if (res.ok) {
            const body = await res.json().catch(() => null);
            const read = readSector(body);
            if (read) {
                marks = read;
                failed = false;
            }
        }
    } catch {
        // Offline, or the body could not be read: no mark and no retry this visit.
    }
    flight.delete(key);
    if (gen !== generation) return;
    const inView = watch.signedIn && watch.truthVersion === truth && watch.sectors.includes(slug);
    held.set(key, { marks: failed ? [] : marks, leftAt: inView ? null : clock.now() });
    if (watch.truthVersion === truth && notify) notify();
}

function pump(): void {
    const now = clock.now();
    const truth = watch.truthVersion;
    if (!watch.signedIn || !truth) return;
    while (queue.length > 0 && budgetLeft(now) > 0) {
        const slug = queue.shift();
        if (!slug) break;
        queued.delete(slug);
        if (!watch.sectors.includes(slug)) continue;
        const key = cacheKey(truth, slug);
        if (flight.has(key)) continue;
        void fetchOne(truth, slug);
    }
    if (queue.length > 0) armLater(delayUntilBudget(now));
}

/**
 * Sectors drawn at the hex tier. Safe to call on every frame: a sector that
 * stays in view is not asked again. `onChange` runs when a request settles,
 * so the map can draw the marks.
 */
export function watchPublicGames(next: PublicGamesWatch, onChange?: () => void): void {
    if (onChange) notify = onChange;
    const now = clock.now();
    const prevTruth = watch.truthVersion;
    const truth = next.truthVersion && next.truthVersion.length > 0 ? next.truthVersion : null;
    watch = {
        signedIn: next.signedIn,
        truthVersion: truth,
        sectors: [...next.sectors],
    };
    if (!watch.signedIn || !watch.truthVersion) {
        if (prevTruth) markTruthLeft(prevTruth, now);
        return;
    }
    if (prevTruth && prevTruth !== watch.truthVersion) markTruthLeft(prevTruth, now);
    markLeft(now);
    for (const slug of watch.sectors) consider(slug, now);
    pump();
}

/** Marks for one sector in view. The count and the names are as the server sent them. */
export function publicMarks(slug: string): readonly PublicGameMark[] {
    if (!watch.signedIn || !watch.truthVersion) return EMPTY;
    const row = held.get(cacheKey(watch.truthVersion, slug));
    if (!row || row.leftAt !== null) return EMPTY;
    return row.marks;
}

/** The map the renderer draws. Empty sectors are left out. */
export function publicGamesOverlay(slugs: readonly string[]): Map<string, readonly PublicGameMark[]> {
    const out = new Map<string, readonly PublicGameMark[]>();
    for (const slug of slugs) {
        const rows = publicMarks(slug);
        if (rows.length > 0) out.set(slug, rows);
    }
    return out;
}
