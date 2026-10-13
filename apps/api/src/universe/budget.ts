/** How many non-read builder calls one universe accepts in a minute. */
export const MUTATION_BUDGET = 120;
export const MUTATION_WINDOW_MS = 60_000;

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
