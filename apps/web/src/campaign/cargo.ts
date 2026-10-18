/**
 * A vessel's cargo and passengers (Epic T, decision 2). Pure.
 * The ship sheet's sixteen Cargo rows and sixteen Passenger rows are a view of
 * `status.cargo` and `status.passengers`: row n is list entry n, the first
 * sixteen, and the rest are "and N more". Editing a sheet row edits that entry.
 * Field names are the PDF's own (`mgt2e_ship_sheet_fields`).
 */
import type { CargoLot, PassengerLot } from '@voyage/shared';
import type { SheetValues } from '../workspace/sheet_fields.ts';

/** Rows the ship sheet prints for cargo, and the same count for passengers. */
export const MANIFEST_ROWS = 16;

export const CARGO_CAPACITY = 'Cargo Capacity';

export type ManifestView<T> = {
    rows: T[];
    /** Lots past the sixteen sheet rows. */
    more: number;
};

function text(values: SheetValues, name: string): string {
    const value = values[name];
    return typeof value === 'string' ? value.trim() : '';
}

function tonsOf(raw: string): number {
    if (!raw) return 0;
    const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return 0;
    const n = Number(match[0]);
    return Number.isFinite(n) && n > 0 ? n : 0;
}

/** The number written in Cargo Capacity, or null when that box has no number. */
export function capacityTons(values: SheetValues | null | undefined): number | null {
    if (!values) return null;
    const raw = text(values, CARGO_CAPACITY);
    if (!raw) return null;
    const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
}

export function tonsUsed(cargo: readonly CargoLot[]): number {
    return cargo.reduce((sum, lot) => sum + (Number.isFinite(lot.tons) ? lot.tons : 0), 0);
}

export function addCargo(cargo: readonly CargoLot[], lot: CargoLot): CargoLot[] {
    return cargo.concat(lot);
}

export function removeCargo(cargo: readonly CargoLot[], index: number): CargoLot[] {
    if (!Number.isInteger(index) || index < 0 || index >= cargo.length) return cargo.slice();
    return cargo.filter((_, at) => at !== index);
}

export function cargoView(cargo: readonly CargoLot[]): ManifestView<CargoLot> {
    return { rows: cargo.slice(0, MANIFEST_ROWS), more: Math.max(0, cargo.length - MANIFEST_ROWS) };
}

/** "and N more" when lots sit past the sheet. Empty when the sheet holds them all. */
export function cargoMore(cargo: readonly CargoLot[]): string {
    const more = cargo.length - MANIFEST_ROWS;
    return more > 0 ? 'and ' + more + ' more' : '';
}

function writeRow(values: SheetValues, names: readonly [string, string, string], lot: { label: string; second: string; note: string } | null): void {
    values[names[0]] = lot ? lot.label : '';
    values[names[1]] = lot ? lot.second : '';
    values[names[2]] = lot ? lot.note : '';
}

/** Sheet values with the first sixteen lots written into the Cargo rows. Lots already past sixteen stay off the sheet. */
export function sheetFromCargo(values: SheetValues, cargo: readonly CargoLot[]): SheetValues {
    const next: SheetValues = { ...values };
    for (let i = 0; i < MANIFEST_ROWS; i += 1) {
        const n = i + 1;
        const lot = cargo[i];
        writeRow(next, ['Cargo Type ' + n, 'Cargo Tons ' + n, 'Cargo Notes ' + n], lot
            ? { label: lot.label, second: String(lot.tons), note: lot.note ?? '' }
            : null);
    }
    return next;
}

/** The lots named by the sixteen Cargo rows. `kept` supplies itemId, value, origin and destination for that row. */
export function cargoFromSheet(values: SheetValues, kept: readonly CargoLot[] = []): CargoLot[] {
    const lots: CargoLot[] = [];
    for (let i = 0; i < MANIFEST_ROWS; i += 1) {
        const n = i + 1;
        const label = text(values, 'Cargo Type ' + n);
        const tonsRaw = text(values, 'Cargo Tons ' + n);
        const note = text(values, 'Cargo Notes ' + n);
        if (!label && !tonsRaw && !note) continue;
        const prior = kept[i];
        const lot: CargoLot = { label, tons: tonsOf(tonsRaw) };
        if (prior?.itemId) lot.itemId = prior.itemId;
        if (prior?.value != null) lot.value = prior.value;
        if (prior?.origin) lot.origin = prior.origin;
        if (prior?.destination) lot.destination = prior.destination;
        if (note) lot.note = note;
        lots.push(lot);
    }
    return lots.concat(kept.slice(MANIFEST_ROWS));
}

export function addPassenger(passengers: readonly PassengerLot[], lot: PassengerLot): PassengerLot[] {
    return passengers.concat(lot);
}

export function removePassenger(passengers: readonly PassengerLot[], index: number): PassengerLot[] {
    if (!Number.isInteger(index) || index < 0 || index >= passengers.length) return passengers.slice();
    return passengers.filter((_, at) => at !== index);
}

export function passengerView(passengers: readonly PassengerLot[]): ManifestView<PassengerLot> {
    return { rows: passengers.slice(0, MANIFEST_ROWS), more: Math.max(0, passengers.length - MANIFEST_ROWS) };
}

export function passengerMore(passengers: readonly PassengerLot[]): string {
    const more = passengers.length - MANIFEST_ROWS;
    return more > 0 ? 'and ' + more + ' more' : '';
}

export function sheetFromPassengers(values: SheetValues, passengers: readonly PassengerLot[]): SheetValues {
    const next: SheetValues = { ...values };
    for (let i = 0; i < MANIFEST_ROWS; i += 1) {
        const n = i + 1;
        const lot = passengers[i];
        writeRow(next, ['Passenger Name ' + n, 'Passage ' + n, 'Passenger Notes ' + n], lot
            ? { label: lot.label, second: lot.class, note: lot.note ?? '' }
            : null);
    }
    return next;
}

export function passengersFromSheet(values: SheetValues, kept: readonly PassengerLot[] = []): PassengerLot[] {
    const lots: PassengerLot[] = [];
    for (let i = 0; i < MANIFEST_ROWS; i += 1) {
        const n = i + 1;
        const label = text(values, 'Passenger Name ' + n);
        const passage = text(values, 'Passage ' + n);
        const note = text(values, 'Passenger Notes ' + n);
        if (!label && !passage && !note) continue;
        const prior = kept[i];
        const lot: PassengerLot = { label, class: passage };
        if (prior?.personId) lot.personId = prior.personId;
        if (note) lot.note = note;
        lots.push(lot);
    }
    return lots.concat(kept.slice(MANIFEST_ROWS));
}
