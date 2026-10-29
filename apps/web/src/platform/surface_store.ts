/**
 * Where a world's painted hexes are kept (DW2; Lane B's BW1 route, `contracts/b_builder.md`
 * "Painted surfaces"). One seam: the views ask `HexEditStore` and never know which store answers.
 *
 * With a universe open, the route is asked: `GET /api/universes/:id/builder/hexes/:sector/:local/surface/:body`
 * answers `{ rev, edits }` (anyone who can read the universe), `PUT` the same path with
 * `{ baseRev, edits }` saves (the owner; 409 when the map changed under the referee; `edits: null`
 * clears). Without a universe, or when the route is not there (an older server: 404 or 405 on a
 * path the universe would otherwise answer), the memory store stands in for this page.
 */
import { memoryEditStore, parseEdits, serializeEdits, type HexEditStore, type HexEdits } from '../surface/hybrid/serialize.ts';
import { apiFetch } from './http.ts';

export type SurfaceStoreOptions = {
    readonly fetch: typeof fetch;
    /** The open universe, or null when none is: the memory store then. */
    readonly universeId: () => string | null;
};

/** The route's error, with the server's sentence. */
export class SurfaceStoreError extends Error {
    readonly status: number;
    readonly code: string;
    constructor(status: number, message: string, code = '') {
        super(message);
        this.status = status;
        this.code = code;
    }
}

export const SURFACE_CHANGED = 'This map changed. Reload it, then try again.';
const OFFLINE = 'Can’t reach the server, so the map wasn’t kept. Check your connection and try again.';

/** `Spinward_Marches/1910` → the route's `:sector/:local`, or null for a key that is not a hex. */
export function surfacePath(universeId: string, hexKey: string, dossierKey: string): string | null {
    const slash = hexKey.lastIndexOf('/');
    if (slash <= 0) return null;
    const sector = hexKey.slice(0, slash);
    const local = hexKey.slice(slash + 1);
    if (!/^\d{4}$/.test(local) || !/^(?:s\d+|w\d+(?:m\d+)?)$/.test(dossierKey)) return null;
    return '/api/universes/' + encodeURIComponent(universeId) + '/builder/hexes/' + encodeURIComponent(sector) + '/' + local + '/surface/' + dossierKey;
}

type Answer = { rev: number; edits: HexEdits | null };

function readAnswer(data: unknown): Answer {
    const row = data as { rev?: unknown; edits?: unknown } | null;
    const rev = row && typeof row.rev === 'number' ? row.rev : 0;
    if (!row || row.edits === null || row.edits === undefined) return { rev, edits: null };
    try {
        return { rev, edits: parseEdits(JSON.stringify(row.edits)) };
    } catch {
        return { rev, edits: null };
    }
}

/**
 * The store for this page. `rev` is remembered per body from the last read or save, so a save
 * carries the right `baseRev`; `revOf` tells the views what the server holds (0 when nothing).
 */
export function createSurfaceStore(options: SurfaceStoreOptions): HexEditStore & { revOf(hexKey: string, dossierKey: string): number } {
    const memory = memoryEditStore();
    const revs = new Map<string, number>();
    /** Bodies the route would not answer for (not there, or not this reader's): memory for them. */
    const fallback = new Set<string>();
    const slot = (hexKey: string, dossierKey: string): string => hexKey + '|' + dossierKey;

    async function call(method: 'GET' | 'PUT', url: string, body?: unknown): Promise<{ status: number; data: unknown; message: string; code: string; details: unknown }> {
        let res: Response;
        try {
            res = await apiFetch(options.fetch, url, { method, body: body === undefined ? undefined : JSON.stringify(body) });
        } catch {
            throw new SurfaceStoreError(0, OFFLINE);
        }
        const payload = await res.json().catch(() => null) as { data?: unknown; error?: { message?: string; code?: string; details?: unknown } } | null;
        const message = payload && payload.error && typeof payload.error.message === 'string' ? payload.error.message : '';
        const code = payload && payload.error && typeof payload.error.code === 'string' ? payload.error.code : '';
        return { status: res.status, data: payload && 'data' in payload ? payload.data : null, message, code, details: payload && payload.error ? payload.error.details ?? null : null };
    }

    return {
        async load(hexKey, dossierKey) {
            const id = options.universeId();
            const url = id ? surfacePath(id, hexKey, dossierKey) : null;
            if (!url || fallback.has(slot(hexKey, dossierKey))) return memory.load(hexKey, dossierKey);
            const answer = await call('GET', url);
            if (answer.status === 404 || answer.status === 405 || answer.status === 401) {
                fallback.add(slot(hexKey, dossierKey));
                return memory.load(hexKey, dossierKey);
            }
            if (answer.status < 200 || answer.status >= 300) throw new SurfaceStoreError(answer.status, answer.message || OFFLINE, answer.code);
            const read = readAnswer(answer.data);
            revs.set(slot(hexKey, dossierKey), read.rev);
            return read.edits;
        },
        async save(hexKey, dossierKey, edits) {
            const id = options.universeId();
            const url = id ? surfacePath(id, hexKey, dossierKey) : null;
            if (!url || fallback.has(slot(hexKey, dossierKey))) {
                await memory.save(hexKey, dossierKey, edits);
                return;
            }
            const baseRev = revs.get(slot(hexKey, dossierKey)) ?? 0;
            const answer = await call('PUT', url, { baseRev, edits: JSON.parse(serializeEdits(edits.n, edits.edits, edits)) as unknown });
            if (answer.status === 404 || answer.status === 405) {
                fallback.add(slot(hexKey, dossierKey));
                await memory.save(hexKey, dossierKey, edits);
                return;
            }
            if (answer.status === 409) {
                // The map changed under the referee: the stored rev is learned, so the next save after a reload carries it.
                const details = answer.details as { current?: unknown } | null;
                const current = readAnswer(details && details.current ? details.current : null);
                if (current.rev) revs.set(slot(hexKey, dossierKey), current.rev);
                throw new SurfaceStoreError(409, answer.message || SURFACE_CHANGED, 'surface_changed');
            }
            if (answer.status < 200 || answer.status >= 300) throw new SurfaceStoreError(answer.status, answer.message || OFFLINE, answer.code);
            revs.set(slot(hexKey, dossierKey), readAnswer(answer.data).rev);
        },
        async clear(hexKey, dossierKey) {
            const id = options.universeId();
            const url = id ? surfacePath(id, hexKey, dossierKey) : null;
            if (!url || fallback.has(slot(hexKey, dossierKey))) {
                await memory.clear(hexKey, dossierKey);
                return;
            }
            const baseRev = revs.get(slot(hexKey, dossierKey)) ?? 0;
            const answer = await call('PUT', url, { baseRev, edits: null });
            if (answer.status === 404 || answer.status === 405) {
                fallback.add(slot(hexKey, dossierKey));
                await memory.clear(hexKey, dossierKey);
                return;
            }
            if (answer.status === 409) throw new SurfaceStoreError(409, answer.message || SURFACE_CHANGED, 'surface_changed');
            if (answer.status < 200 || answer.status >= 300) throw new SurfaceStoreError(answer.status, answer.message || OFFLINE, answer.code);
            revs.set(slot(hexKey, dossierKey), 0);
        },
        revOf(hexKey, dossierKey) {
            return revs.get(slot(hexKey, dossierKey)) ?? 0;
        },
    };
}
