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
 *
 * Signed out, the map asks too: once migration 0018 is applied the server answers a visitor.
 * Before it, a signed-out ask is 401: that one answer is taken quietly, as no ships, and nothing
 * more is asked until the visitor signs in (contracts/b_party_ships.md, "Signed-out viewers").
 */
import type { PublicGamesHex } from '@voyage/shared';
import { CAMPAIGN_LIMITS, PUBLIC_NAMES_PER_SHIP, PUBLIC_SHIPS_PER_HEX, type PublicShipMark } from '@voyage/shared';
import { apiFetch } from '../platform/http.ts';

/** Calls kept in any 60 seconds. The server's cap is 60. */
export const PUBLIC_GAMES_BUDGET = 12;
export const PUBLIC_GAMES_WINDOW_MS = 60_000;
/** A sector that left the screen is not asked again until this has passed. */
export const PUBLIC_GAMES_REVISIT_MS = 60_000;

export type PublicGameMark = PublicGamesHex;
export type { PublicShipMark };

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
/** A public ship's opaque id: `pm_` and 26 Crockford characters. */
const MARK_ID = /^pm_[0-9A-HJKMNP-TV-Z]{26}$/;
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
/** A signed-out ask was refused (a server before 0018): no more asks until a sign-in. */
let refusedSignedOut = false;
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
    refusedSignedOut = false;
    held.clear();
    sentAt.length = 0;
    flight.clear();
    queue.length = 0;
    queued.clear();
    fetchImpl = fetch;
    clock = realClock;
    overview = { truth: null, rows: EMPTY_OVERVIEW, askedAt: null, flying: false, refused: false };
    overviewNotify = null;
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

/** A text the feed sent: kept when it is a non-empty string, cut to the schema's length. */
function text(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const kept = value.trim();
    return kept.length > 0 ? kept.slice(0, CAMPAIGN_LIMITS.name) : null;
}

/**
 * The ships on one hex, once migration 0017 is applied (contracts/b_party_ships.md, "The feed").
 * Only `mark`, `ship`, `aboard` and `example` are read: a key added later is left unread. A ship that
 * cannot be read is left out. Null when there is no list, so the hex keeps today's dot.
 */
function readShips(value: unknown): PublicShipMark[] | null {
    if (!Array.isArray(value)) return null;
    const out: PublicShipMark[] = [];
    for (const item of value) {
        if (out.length >= PUBLIC_SHIPS_PER_HEX) break;
        if (!item || typeof item !== 'object') continue;
        const row = item as { mark?: unknown; ship?: unknown; aboard?: unknown; example?: unknown };
        const ship = text(row.ship);
        if (typeof row.mark !== 'string' || !MARK_ID.test(row.mark) || !ship) continue;
        const aboard: string[] = [];
        if (Array.isArray(row.aboard)) {
            for (const name of row.aboard) {
                const kept = text(name);
                if (kept && aboard.length < PUBLIC_NAMES_PER_SHIP) aboard.push(kept);
            }
        }
        const mark: PublicShipMark = { mark: row.mark, ship, aboard };
        // An example game's ship (once 0018 is applied). Any other key is left unread.
        if (row.example === true) mark.example = true;
        out.push(mark);
    }
    return out.length > 0 ? out : null;
}

function readSector(body: unknown): PublicGameMark[] | null {
    if (!body || typeof body !== 'object') return null;
    const hexes = (body as { hexes?: unknown }).hexes;
    if (!Array.isArray(hexes) || hexes.length > 1280) return null;
    const out: PublicGameMark[] = [];
    for (const item of hexes) {
        if (!item || typeof item !== 'object') return null;
        const row = item as { hex?: unknown; count?: unknown; name?: unknown; ships?: unknown };
        if (typeof row.hex !== 'string' || !LOCAL_HEX.test(row.hex)) return null;
        if (typeof row.count !== 'number' || !Number.isInteger(row.count) || row.count < 1) return null;
        let mark: PublicGameMark;
        if (row.count === 1) {
            if (typeof row.name !== 'string') return null;
            mark = { hex: row.hex, count: row.count, name: row.name };
        } else if (row.name === null) {
            mark = { hex: row.hex, count: row.count, name: null };
        } else {
            return null;
        }
        // A server before 0017 sends no list: the hex is today's dot and count, exactly as before.
        const ships = readShips(row.ships);
        if (ships) mark.ships = ships;
        out.push(mark);
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
        if (res.status === 401 && !watch.signedIn) refusedSignedOut = true;
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
    const inView = watch.truthVersion === truth && watch.sectors.includes(slug);
    held.set(key, { marks: failed ? [] : marks, leftAt: inView ? null : clock.now() });
    if (watch.truthVersion === truth && notify) notify();
}

function pump(): void {
    const now = clock.now();
    const truth = watch.truthVersion;
    if (!truth || (refusedSignedOut && !watch.signedIn)) return;
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
    // Signing in clears a signed-out refusal, and a sector refused that way is asked again.
    if (next.signedIn && refusedSignedOut) {
        refusedSignedOut = false;
        held.clear();
    }
    const truth = next.truthVersion && next.truthVersion.length > 0 ? next.truthVersion : null;
    watch = {
        signedIn: next.signedIn,
        truthVersion: truth,
        sectors: [...next.sectors],
    };
    if (!watch.truthVersion) {
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
    if (!watch.truthVersion) return EMPTY;
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

/**
 * A ship whose card answered 404 is no longer public: its mark goes now, and the hex's count
 * with it. The next load of the sector says the same. Returns true when a mark was dropped.
 */
export function dropPublicShip(mark: string): boolean {
    let dropped = false;
    for (const row of held.values()) {
        const next: PublicGameMark[] = [];
        for (const hex of row.marks) {
            const ships = hex.ships;
            if (!ships || !ships.some((ship) => ship.mark === mark)) {
                next.push(hex);
                continue;
            }
            dropped = true;
            const kept = ships.filter((ship) => ship.mark !== mark);
            if (hex.count <= 1 || kept.length === 0) continue;
            next.push({ hex: hex.hex, count: hex.count - 1, name: null, ships: kept });
        }
        row.marks = next;
    }
    return dropped;
}

// ---- The overview: every hex with public ships on the chart, for the zoomed-out map ----------------

/** One hex holding public ships, from `GET /api/public-games/overview`: its full key and how many. */
export type PublicOverviewHex = { key: string; count: number };

/** The overview is cached for 60 s by the server: asked at most once a minute while the map stays out. */
export const PUBLIC_OVERVIEW_EVERY_MS = 60_000;
/** The most hexes read from one answer (B's cap is named in contracts/b_party_ships.md, "The overview"). */
export const PUBLIC_OVERVIEW_MAX = 20_000;

const OVERVIEW_KEY = /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}\/\d{4}$/;
const EMPTY_OVERVIEW: readonly PublicOverviewHex[] = [];

type OverviewState = {
    truth: string | null;
    rows: readonly PublicOverviewHex[];
    /** When the last ask went out, for the once-a-minute rule. Null before the first. */
    askedAt: number | null;
    flying: boolean;
    /** A signed-out ask was refused (a server before 0018): none again until a sign-in. */
    refused: boolean;
};

let overview: OverviewState = { truth: null, rows: EMPTY_OVERVIEW, askedAt: null, flying: false, refused: false };
let overviewNotify: (() => void) | null = null;

/** The answer read leniently: a hex that cannot be read is left out, and so is any key it carries besides `key` and `count`. */
export function readOverview(body: unknown): PublicOverviewHex[] | null {
    if (!body || typeof body !== 'object') return null;
    const hexes = (body as { hexes?: unknown }).hexes;
    if (!Array.isArray(hexes)) return null;
    const out: PublicOverviewHex[] = [];
    for (const item of hexes) {
        if (out.length >= PUBLIC_OVERVIEW_MAX) break;
        if (!item || typeof item !== 'object') continue;
        const row = item as { key?: unknown; count?: unknown };
        if (typeof row.key !== 'string' || !OVERVIEW_KEY.test(row.key)) continue;
        if (typeof row.count !== 'number' || !Number.isInteger(row.count) || row.count < 1) continue;
        out.push({ key: row.key, count: row.count });
    }
    return out;
}

async function askOverview(truth: string, signedIn: boolean): Promise<void> {
    const gen = generation;
    overview.flying = true;
    overview.askedAt = clock.now();
    let rows: readonly PublicOverviewHex[] | null = null;
    try {
        const res = await apiFetch(fetchImpl, '/api/public-games/overview?' + new URLSearchParams({ truthVersion: truth }).toString());
        if (res.status === 401 && !signedIn) overview.refused = true;
        if (res.ok) rows = readOverview(await res.json().catch(() => null));
    } catch {
        // Offline, or no such route yet: nothing to draw, and the next ask waits its minute.
    }
    if (gen !== generation) return;
    overview.flying = false;
    if (overview.truth !== truth) return;
    if (rows) overview.rows = rows;
    if (overviewNotify) overviewNotify();
}

/**
 * The map is zoomed out past the hex level (`out`) on the chart `truthVersion`. Safe to call on
 * every frame: it asks when the map first leaves the hex zoom, then at most once a minute while it
 * stays out. A null pin asks nothing. `onChange` runs when an answer has arrived.
 */
export function watchPublicOverview(next: { signedIn: boolean; truthVersion: string | null; out: boolean }, onChange?: () => void): void {
    if (onChange) overviewNotify = onChange;
    const truth = next.truthVersion && next.truthVersion.length > 0 ? next.truthVersion : null;
    if (truth !== overview.truth) overview = { truth, rows: EMPTY_OVERVIEW, askedAt: null, flying: false, refused: false };
    if (next.signedIn && overview.refused) {
        overview.refused = false;
        overview.askedAt = null;
    }
    if (!truth || !next.out || overview.flying) return;
    if (overview.refused && !next.signedIn) return;
    const now = clock.now();
    if (overview.askedAt !== null && now - overview.askedAt < PUBLIC_OVERVIEW_EVERY_MS) return;
    void askOverview(truth, next.signedIn);
}

/** The hexes with public ships on the watched chart. Empty until an answer has arrived. */
export function publicOverview(): readonly PublicOverviewHex[] {
    return overview.rows;
}
