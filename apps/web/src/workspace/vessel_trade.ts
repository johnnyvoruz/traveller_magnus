/**
 * A vessel's cargo, passengers and ledger on its page (streams/D.md DT1; backlog Epic T, step T1, Lane D's
 * half; Lane A's campaign/cargo.ts and ledger.ts are the shapes). One source: `status.cargo` and
 * `status.passengers` are the manifest, and the ship sheet's sixteen Cargo rows and sixteen Passenger
 * rows are a view of them (Johnny, 15:30: yes). A vessel saved before the manifest existed has its rows
 * on the sheet: they are the manifest until the first edit writes it. Pure apart from `writeTrade`, which
 * is one commit, as the track's writes are.
 */
import type { CampaignRecord, CargoLot, LedgerLine, OwnerShare, PassengerLot, ShipPayment } from '@voyage/shared';
import { cargoFromSheet, MANIFEST_ROWS, passengersFromSheet, sheetFromCargo, sheetFromPassengers } from '../campaign/cargo.ts';
import { commit } from '../campaign/commit.ts';
import { splitDays } from '../orbit/clock.ts';
import { recordKey } from './sheet_people.ts';
import { fieldsOf, type SheetValues } from './sheet_fields.ts';
import { sheetWithFields } from './ship_sheet.ts';

/** A campaign day, as a ledger line dates it. */
export type Day = LedgerLine['when'];

const CARGO_ROW = /^Cargo (Type|Tons|Notes) (\d+)$/;
const PASSENGER_ROW = /^(Passenger Name|Passage|Passenger Notes) (\d+)$/;
const PASSENGER_RECORD = /^Passenger Name (\d+) record$/;

/** A box of the sheet that shows the manifest, not the sheet's own value. */
export function isManifestField(name: string): boolean {
    const row = CARGO_ROW.exec(name) ?? PASSENGER_ROW.exec(name) ?? PASSENGER_RECORD.exec(name);
    if (!row) return false;
    const n = Number(row[row.length - 1]);
    return n >= 1 && n <= MANIFEST_ROWS;
}

type Status = { cargo?: unknown; passengers?: unknown; ledger?: unknown; [key: string]: unknown };
const statusOf = (record: CampaignRecord): Status => (record.status && typeof record.status === 'object' ? record.status as Status : {});

/** The person each Passenger Name row holds on the sheet, by row (a vessel from before the manifest). */
function sheetPersonIds(values: SheetValues | null): (string | undefined)[] {
    const ids: (string | undefined)[] = [];
    for (let n = 1; n <= MANIFEST_ROWS; n += 1) {
        const held = values ? values[recordKey('Passenger Name ' + n)] : undefined;
        ids.push(typeof held === 'string' && held ? held : undefined);
    }
    return ids;
}

/** Passengers from sheet values, with each row's person (its record key) carried onto its lot. */
function passengersWithPeople(values: SheetValues, kept: readonly PassengerLot[]): PassengerLot[] {
    const ids = sheetPersonIds(values);
    const rows: number[] = [];
    for (let n = 1; n <= MANIFEST_ROWS; n += 1) {
        const filled = ['Passenger Name ', 'Passage ', 'Passenger Notes '].some((name) => {
            const value = values[name + n];
            return typeof value === 'string' && value.trim() !== '';
        });
        if (filled) rows.push(n - 1);
    }
    return passengersFromSheet(values, kept).map((lot, i) => {
        const id = i < rows.length ? ids[rows[i]] : lot.personId;
        const next: PassengerLot = { ...lot };
        if (id) next.personId = id;
        else delete next.personId;
        return next;
    });
}

/** The vessel's manifest: its status lists, or, before the first edit, what its sheet rows hold. */
export function manifestOf(record: CampaignRecord): { cargo: CargoLot[]; passengers: PassengerLot[] } {
    const status = statusOf(record);
    const values = fieldsOf(record.sheet) ?? {};
    const cargo = Array.isArray(status.cargo) ? status.cargo as CargoLot[] : cargoFromSheet(values);
    const passengers = Array.isArray(status.passengers) ? status.passengers as PassengerLot[] : passengersWithPeople(values, []);
    return { cargo, passengers };
}

export function ledgerOf(record: CampaignRecord): LedgerLine[] {
    const status = statusOf(record);
    return Array.isArray(status.ledger) ? status.ledger as LedgerLine[] : [];
}

/** What the ship sheet shows: its own values, with the Cargo and Passenger rows written from the manifest. */
export function sheetView(record: CampaignRecord): SheetValues {
    const own: SheetValues = {};
    for (const [name, value] of Object.entries(fieldsOf(record.sheet) ?? {})) if (!isManifestField(name)) own[name] = value;
    const { cargo, passengers } = manifestOf(record);
    const shown = sheetFromPassengers(sheetFromCargo(own, cargo), passengers);
    passengers.slice(0, MANIFEST_ROWS).forEach((lot, i) => { if (lot.personId) shown[recordKey('Passenger Name ' + (i + 1))] = lot.personId; });
    return shown;
}

/**
 * A sheet edit as the record's new sheet and status: the manifest rows become `status.cargo` and
 * `status.passengers` (lots past the sixteen rows kept), and the sheet keeps only its own boxes.
 */
export function editedSheet(record: CampaignRecord, values: SheetValues): { sheet: Record<string, unknown>; status: Status } {
    const { cargo, passengers } = manifestOf(record);
    const own: SheetValues = {};
    for (const [name, value] of Object.entries(values)) if (!isManifestField(name)) own[name] = value;
    return {
        sheet: sheetWithFields(record.sheet, own),
        status: { ...statusOf(record), cargo: cargoFromSheet(values, cargo), passengers: passengersWithPeople(values, passengers) },
    };
}

/** The status with the lists given replaced. */
export function statusWithTrade(
    record: CampaignRecord,
    change: { cargo?: CargoLot[]; passengers?: PassengerLot[]; ledger?: LedgerLine[]; owners?: OwnerShare[]; payment?: ShipPayment; fuelTons?: number; fuelMark?: FuelMark },
): Status {
    return { ...statusOf(record), ...change };
}

/** One commit of the record's new sheet and status, as the track's writes are (campaign/track.ts). */
export function writeTrade(record: CampaignRecord, change: { sheet?: Record<string, unknown>; status: Status }): void {
    commit({ records: [{ ...record, ...(change.sheet ? { sheet: change.sheet } : {}), status: change.status as CampaignRecord['status'], baseRev: record.rev }] });
}

/** The referee's mark on a party vessel (DT2b): naval or scout, for base fuel; undefined clears it. */
export type FuelMark = 'naval' | 'scout' | undefined;

/** The mark as stored (status.fuelMark), or null for none or anything else. */
export function fuelMarkOf(record: CampaignRecord): 'naval' | 'scout' | null {
    const status = record.status as { fuelMark?: unknown } | null;
    const mark = status ? status.fuelMark : null;
    return mark === 'naval' || mark === 'scout' ? mark : null;
}

/** The campaign day of a clock's day count: the day the ledger dates a line. */
export function dayOf(days: number): Day {
    const split = splitDays(days);
    return { year: split.year, day: Math.min(365, Math.max(1, Math.floor(split.day))) };
}

/** "014-1105", as the campaign's dates are written. */
export function dayWords(when: Day): string {
    return String(when.day).padStart(3, '0') + '-' + when.year;
}

/** The amount a line stores: income as typed, an expense or a recurring cost taken away (Lane A's AT1, question 1). */
export function signedAmount(amount: number, kind: LedgerLine['kind']): number {
    const size = Math.abs(amount);
    return kind === 'income' ? size : -size;
}
