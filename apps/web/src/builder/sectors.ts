/**
 * The referee's sectors of the open universe (findings/builder_sector_ready.md)
 * and the one-way switch into a hand-designed system (findings/builder_hand_ready.md).
 * One request per act. The answer is the sector the server stored.
 *
 * A rename, a move and a subsector name keep the copy from before at the revision
 * they were sent with, so Undo names that revision. A delete's own revision holds
 * the sector and its hexes from before, so Undo names the revision the delete made.
 */
import { reactive } from 'vue';
import { FormRead, RefereeSector, RefereeSectorPage } from '@voyage/shared';
import { parseHexKey } from '../workspace/places.ts';
import type { OwnSector, OwnSectors, SectorUndoToken } from '../workspace/build/seam.ts';

export type SectorPort = {
    universeId: string;
    request(method: string, url: string, body?: unknown): Promise<unknown>;
    /** Read that sector's hex rows again. A deleted sector may have none. */
    reload(slug: string): Promise<void>;
};

function asOwn(row: RefereeSector): OwnSector {
    return {
        id: row.id,
        slot: { x: row.slot.x, y: row.slot.y },
        name: row.name,
        subsectors: [...row.subsectors],
        rev: row.rev,
    };
}

function statusOf(err: unknown): number {
    if (!err || typeof err !== 'object' || !('status' in err)) return 0;
    const status = (err as { status: unknown }).status;
    return typeof status === 'number' ? status : 0;
}

function messageOf(err: unknown): string {
    return err instanceof Error && err.message ? err.message : 'The server could not be reached. Nothing was changed.';
}

function conflictSector(err: unknown): unknown {
    if (statusOf(err) !== 409 || !err || typeof err !== 'object' || !('details' in err)) return undefined;
    const details = (err as { details: unknown }).details;
    if (!details || typeof details !== 'object' || Array.isArray(details) || !('current' in details)) return undefined;
    return (details as { current: unknown }).current;
}

/** The sector list, plus the grow act's land and drop. `sectors()` does not expose those two. */
export type SectorBook = OwnSectors & {
    load(): Promise<void>;
    adopt(rows: readonly unknown[]): OwnSector[];
    forget(ids: readonly string[]): void;
};

export function openSectors(port: SectorPort): SectorBook {
    const base = '/api/universes/' + encodeURIComponent(port.universeId);
    const state = reactive({ tick: 0, loaded: false });
    const held = new Map<string, OwnSector>();
    /** A deleted sector's revision, so its Undo can still name it. */
    const lastRev = new Map<string, number>();

    function sectorUrl(id: string, act: string): string {
        return base + '/sectors/' + encodeURIComponent(id) + '/' + act;
    }

    function hexUrl(hexKey: string, act: string): string {
        const place = parseHexKey(hexKey);
        if (!place) throw new Error('Name the hex.');
        return base + '/hexes/' + encodeURIComponent(place.slug) + '/' + place.hex + act;
    }

    /** The sector as the server answered it: held, or dropped when it says deleted. */
    function land(data: unknown): OwnSector {
        const row = RefereeSector.parse(data);
        const sector = asOwn(row);
        if (row.deleted) held.delete(row.id);
        else held.set(row.id, sector);
        state.tick += 1;
        return sector;
    }

    async function call(method: string, url: string, body?: unknown): Promise<unknown> {
        try {
            return await port.request(method, url, body);
        } catch (err) {
            const current = conflictSector(err);
            if (current !== undefined && RefereeSector.safeParse(current).success) land(current);
            throw new Error(messageOf(err));
        }
    }

    function revOf(id: string): number {
        const sector = held.get(id);
        if (!sector) throw new Error('That sector is no longer here.');
        return sector.rev;
    }

    async function load(): Promise<void> {
        const page = RefereeSectorPage.parse(await call('GET', base + '/sectors'));
        held.clear();
        for (const row of page.items) if (!row.deleted) held.set(row.id, asOwn(row));
        state.loaded = true;
        state.tick += 1;
    }

    /** One act. Undo of it puts back the copy from the revision this act was sent with. */
    async function act(id: string, name: string, body: Record<string, unknown>): Promise<SectorUndoToken> {
        const before = revOf(id);
        const sector = land(await call('POST', sectorUrl(id, name), { ...body, baseRev: before }));
        return { id, toRev: before, atRev: sector.rev };
    }

    return {
        tick: () => state.tick,
        loaded: () => state.loaded,
        list: () => {
            void state.tick;
            return [...held.values()];
        },
        get: (id) => {
            void state.tick;
            return held.get(id) ?? null;
        },
        load,
        make: async (name, slot) => land(await call('POST', base + '/sectors', { name, slot })),
        rename: (id, name) => act(id, 'rename', { name }),
        move: (id, slot) => act(id, 'move', { slot }),
        remove: async (id) => {
            const rev = revOf(id);
            const gone = land(await call('POST', sectorUrl(id, 'delete'), { baseRev: rev }));
            lastRev.set(id, gone.rev);
            await port.reload(id);
            return { id, toRev: gone.rev, atRev: gone.rev };
        },
        renameSubsector: (id, letter, name) => act(id, 'subsectors/' + letter, { name }),
        undo: async (token) => {
            const sector = held.get(token.id);
            const baseRev = sector ? sector.rev : lastRev.get(token.id);
            if (!baseRev) throw new Error('That sector is no longer here.');
            if (baseRev !== token.atRev) throw new Error('That sector has changed since. This Undo no longer applies.');
            land(await call('POST', sectorUrl(token.id, 'undo'), { toRev: token.toRev, baseRev }));
            lastRev.delete(token.id);
            await port.reload(token.id);
        },
        formMode: async (hexKey) => {
            let data: unknown;
            try {
                data = await call('GET', hexUrl(hexKey, '/form'));
            } catch {
                return null;
            }
            const read = FormRead.safeParse(data);
            if (!read.success) return null;
            return read.data.form.mode === 'hand' ? 'hand' : 'generated';
        },
        /** Sectors the grow act just made, or the sector already in a slot (a 409). */
        adopt(rows: readonly unknown[]): OwnSector[] {
            return rows.map((row) => land(row));
        },
        /** Made sectors leave memory. Their hex rows are the store's. */
        forget(ids: readonly string[]): void {
            for (const id of ids) held.delete(id);
            state.tick += 1;
        },
        designByHand: async (hexKey, baseRev) => {
            const place = parseHexKey(hexKey);
            if (!place) throw new Error('Name the hex.');
            const data = await call('POST', hexUrl(hexKey, '/design'), { baseRev }) as { rev?: unknown };
            const rev = typeof data.rev === 'number' ? data.rev : baseRev + 1;
            await port.reload(place.slug);
            return async () => {
                await call('POST', hexUrl(hexKey, '/revert'), { toRev: baseRev, baseRev: rev });
                await port.reload(place.slug);
            };
        },
    };
}
