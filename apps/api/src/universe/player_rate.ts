/**
 * Player limits. Each map is its own counter.
 * Join is 3 per 10 seconds per user. Preview is 60 a minute by IP.
 * A member's notes are 10 a minute, and their campaign and object reads are 60 a minute,
 * both per universe. Neither map is the public-games bucket or the character claim bucket.
 */

const WRITE_LIMIT = 10;
const READ_LIMIT = 60;
const JOIN_LIMIT = 3;
const PREVIEW_LIMIT = 60;
const MINUTE_MS = 60_000;
const JOIN_WINDOW_MS = 10_000;
const HASH_TTL_MS = 60_000;

const memberWrites = new Map<string, number[]>();
const memberReads = new Map<string, number[]>();
const joinClaims = new Map<string, number[]>();
const joinPreviews = new Map<string, number[]>();

function limited(map: Map<string, number[]>, key: string, cap: number, windowMs: number): boolean {
    const now = Date.now();
    const recent = (map.get(key) ?? []).filter((at) => now - at < windowMs);
    if (recent.length >= cap) {
        map.set(key, recent);
        return true;
    }
    recent.push(now);
    map.set(key, recent);
    return false;
}

function fresh(map: Map<string, number[]>, key: string, windowMs: number): number[] {
    const now = Date.now();
    const recent = (map.get(key) ?? []).filter((at) => now - at < windowMs);
    map.set(key, recent);
    return recent;
}

/** True when this member already has 10 accepted notes in the last minute. A refused write does not count. */
export function memberWriteBlocked(universeId: string, userId: string): boolean {
    return fresh(memberWrites, `${universeId}:${userId}`, MINUTE_MS).length >= WRITE_LIMIT;
}

export function memberWriteCommit(universeId: string, userId: string): void {
    fresh(memberWrites, `${universeId}:${userId}`, MINUTE_MS).push(Date.now());
}

export function memberReadLimited(universeId: string, userId: string): boolean {
    return limited(memberReads, `${universeId}:${userId}`, READ_LIMIT, MINUTE_MS);
}

export function joinLimited(userId: string): boolean {
    return limited(joinClaims, userId, JOIN_LIMIT, JOIN_WINDOW_MS);
}

export function joinPreviewLimited(ip: string): boolean {
    return limited(joinPreviews, ip, PREVIEW_LIMIT, MINUTE_MS);
}

type HashCache = { seq: number; at: number; hashes: ReadonlySet<string> };

const hashCache = new Map<string, HashCache>();

/** The projected object hashes for one universe at one campaign seq, for one minute. */
export function cachedHashes(universeId: string, seq: number): ReadonlySet<string> | null {
    const hit = hashCache.get(universeId);
    if (!hit || hit.seq !== seq || Date.now() - hit.at >= HASH_TTL_MS) return null;
    return hit.hashes;
}

export function storeHashes(universeId: string, seq: number, hashes: readonly string[]): ReadonlySet<string> {
    const set = new Set(hashes);
    hashCache.set(universeId, { seq, at: Date.now(), hashes: set });
    return set;
}
