/**
 * The move pair (DS6; Johnny 142, "moving one item at a time to the locker and from the locker
 * to the character"): one locker row to a crew character's Equipment table, and an Equipment
 * row to the locker. Two writes each way, the second's failure putting the item back on the
 * first (append-only, no undo). The ship's rows are written as the vessel page writes them
 * (the referee's whole-record save) or through the append door (a player with the locker
 * switch). The character's boxes are written the way the sheet writes them today: a plain
 * sheet on the person record through the record save (the referee's), a Character kept on
 * the Characters screen through `POST /api/characters/:id/fields` (its owner's or an editor's).
 */
import type { CampaignRecord, LockerRow, StatusAppend } from '@voyage/shared';
import { appendStatus } from '../campaign/append.ts';
import { campaign, transport } from '../campaign/store.ts';
import { apiFetch } from '../platform/http.ts';
import { saveRecord } from './actions.ts';
import { characterDoc, characterSheetWith } from './character_sheet.ts';
import { characterIdOf, characterSource } from './person_character.ts';
import { equipmentSets, firstEmptyEquipment, lockerOf, lockerWith, lockerWithout, withSets } from './locker.ts';
import { statusWithTrade, writeTrade } from './vessel_trade.ts';

export type Who = 'referee' | 'player';

/** Where a character's boxes are written: the person record's own sheet, or a Character by its id. */
export type SheetTaker = { kind: 'record' } | { kind: 'character'; id: string };

/**
 * Whether, and where, this person's Equipment table can be written by whoever presses: the
 * referee writes a plain sheet (or starts one on a person with none); a Character is written
 * by an account the Characters store lists it for (its owner, or an editor), the referee's
 * included when it is shared with them. A player cannot write a plain sheet: it is the record's.
 */
export function sheetTaker(person: CampaignRecord, who: Who): SheetTaker | null {
    const id = characterIdOf(person.sheet);
    if (id) {
        const source = characterSource();
        return source && source.list().some((item) => item.character.id === id) ? { kind: 'character', id } : null;
    }
    return who === 'referee' ? { kind: 'record' } : null;
}

type Sets = { field: string; value: string }[];

/** The boxes as they stand now: the record's own, or the Character's from the server. Null when they cannot be read. */
async function currentFields(taker: SheetTaker, person: CampaignRecord): Promise<Record<string, string | boolean> | null> {
    if (taker.kind === 'record') return characterDoc(person.sheet)?.fields ?? {};
    try {
        const res = await apiFetch(transport.fetch, '/api/characters/' + encodeURIComponent(taker.id));
        if (!res.ok) return null;
        const body = await res.json() as { data?: { fields?: unknown } };
        const held = body.data && body.data.fields && typeof body.data.fields === 'object' ? body.data.fields as Record<string, unknown> : {};
        const out: Record<string, string | boolean> = {};
        for (const [name, value] of Object.entries(held)) if (typeof value === 'string' || typeof value === 'boolean') out[name] = value;
        return out;
    } catch {
        return null;
    }
}

async function writeSheet(taker: SheetTaker, person: CampaignRecord, fields: Record<string, string | boolean>, sets: Sets): Promise<boolean> {
    if (taker.kind === 'record') {
        const now = campaign.records[person.id];
        if (!now || now.deleted) return false;
        saveRecord(person.id, { sheet: characterSheetWith(now.sheet, withSets(fields, sets)) });
        return true;
    }
    try {
        const res = await apiFetch(transport.fetch, '/api/characters/' + encodeURIComponent(taker.id) + '/fields', {
            method: 'POST',
            body: JSON.stringify({ sets }),
        });
        return res.ok;
    } catch {
        return false;
    }
}

/** The ship's locker written: the referee's record save, or a player's piece through the door. */
export async function writeLocker(ship: CampaignRecord, who: Who, next: LockerRow[], append: StatusAppend['append']): Promise<boolean> {
    if (who === 'referee') {
        const now = campaign.records[ship.id];
        if (!now || now.deleted) return false;
        writeTrade(now, { status: statusWithTrade(now, { locker: next }) });
        return true;
    }
    const result = await appendStatus(ship.id, append);
    return result.ok;
}

export type MoveOutcome = { ok: true; name: string } | { ok: false; why: 'no_taker' | 'unread' | 'full' | 'not_moved' };

/**
 * Locker row `index` to `person`'s Equipment table: the row leaves the locker, then lands in the
 * first empty Equipment row. A failed landing puts the row back in the locker.
 */
export async function toCharacter(ship: CampaignRecord, index: number, person: CampaignRecord, who: Who): Promise<MoveOutcome> {
    const rows = lockerOf(ship);
    const row = rows[index];
    const taker = sheetTaker(person, who);
    if (!row || !taker) return { ok: false, why: 'no_taker' };
    const fields = await currentFields(taker, person);
    if (!fields) return { ok: false, why: 'unread' };
    const n = firstEmptyEquipment(fields);
    if (n === null) return { ok: false, why: 'full' };
    const left = await writeLocker(ship, who, lockerWithout(rows, index), { locker: { remove: [index] } });
    if (!left) return { ok: false, why: 'not_moved' };
    const landed = await writeSheet(taker, person, fields, equipmentSets(n, row));
    if (!landed) {
        const back = campaign.records[ship.id] ?? ship;
        await writeLocker(back, who, lockerWith(lockerOf(back), row), { locker: { add: [row] } });
        return { ok: false, why: 'not_moved' };
    }
    return { ok: true, name: person.name };
}

/**
 * An Equipment row to the ship's locker: the sheet's four boxes are cleared through the page's
 * own writer (`clear`), then the row is added to the locker. A failed add puts the boxes back
 * (`restore`). The referee's writes both ride the record save; a player's locker add is the door.
 */
export async function toLocker(ship: CampaignRecord, row: LockerRow, who: Who, clear: () => Promise<boolean> | boolean, restore: () => void): Promise<MoveOutcome> {
    const cleared = await clear();
    if (!cleared) return { ok: false, why: 'not_moved' };
    const now = campaign.records[ship.id] ?? ship;
    const added = await writeLocker(now, who, lockerWith(lockerOf(now), row), { locker: { add: [row] } });
    if (!added) {
        restore();
        return { ok: false, why: 'not_moved' };
    }
    return { ok: true, name: ship.name };
}
