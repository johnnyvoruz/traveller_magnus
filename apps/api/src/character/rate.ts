const CLAIM_WINDOW_MS = 10_000;
const CLAIM_MAX = 3;
const claimHits = new Map<string, number[]>();

/** Same window as better-auth's sign-in rule: 3 requests in 10 seconds. */
export function claimRateLimited(userId: string, now = Date.now()): boolean {
    const recent = (claimHits.get(userId) ?? []).filter((at) => now - at < CLAIM_WINDOW_MS);
    if (recent.length >= CLAIM_MAX) {
        claimHits.set(userId, recent);
        return true;
    }
    recent.push(now);
    claimHits.set(userId, recent);
    return false;
}
