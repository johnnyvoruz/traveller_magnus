/** How many non-read builder calls one universe accepts in a minute. */
export const MUTATION_BUDGET = 120;
export const MUTATION_WINDOW_MS = 60_000;

/** Submits a minute on one universe. This does not spend `allowMutation`. */
export const PROPOSAL_SUBMIT_BUDGET = 10;

/**
 * One more call inside the minute. `stamps` keeps only the times still inside it.
 * The same count and window the universe uses for a burst of builder writes.
 */
export function allowWindow(stamps: number[], now: number, budget: number, windowMs: number): boolean {
    let keep = 0;
    for (let i = 0; i < stamps.length; i++) {
        if (now - stamps[i] < windowMs) stamps[keep++] = stamps[i];
    }
    stamps.length = keep;
    if (stamps.length >= budget) return false;
    stamps.push(now);
    return true;
}

/**
 * A generate job's own batch and fail posts are the worker finishing work the
 * person already asked for. They do not spend the budget that protects the
 * object from a burst of map edits. Every other builder write does.
 */
export function chargesMutationBudget(method: string, pathname: string, workerHeader: string | null): boolean {
    if (method === 'GET' || method === 'HEAD') return false;
    const builder = pathname === '/pin' || pathname.startsWith('/hexes') || pathname.startsWith('/jobs') || pathname.startsWith('/sectors');
    if (!builder) return false;
    if (workerHeader === 'generate' && /^\/jobs\/[^/]+\/(batch|fail|settled)$/.test(pathname)) return false;
    return true;
}
