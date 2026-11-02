/**
 * Set up the ship (Lane D's DU45, DW3 round 1 note 2): the eleven sheet boxes the trade loop reads, on one
 * card above the vessel page's sections, each with its one-line why, until every one holds a number; then
 * one folded line. The names are the PDF's own (rules/mgt2e_ship_sheet_fields.json), the same fields the
 * sheet edits; a write goes through the sheet's own save, so the card and the sheet never disagree. Pure.
 */
import type { CampaignRecord } from '@voyage/shared';
import { UPKEEP_FIELDS } from '../campaign/ship_finance.ts';
import { formatCredits } from '../campaign/money.ts';
import type { SheetValues } from './sheet_fields.ts';
import { sheetWithFields } from './ship_sheet.ts';
import { editedSheet, isManifestField } from './vessel_trade.ts';

type Status = ReturnType<typeof editedSheet>['status'];

export type SetupField = { name: string; why: string; row: 'ship' | 'cost' };

/** The six boxes about the ship, then the five monthly costs (ship_finance's list, in its order). */
export const SETUP_FIELDS: readonly SetupField[] = [
    { name: 'Jump Drive Output', why: 'The worlds Find passengers and freight lists, and the jump ring on the chart.', row: 'ship' },
    { name: 'Manoeuvre Drive Output', why: 'The ship\'s thrust, in G.', row: 'ship' },
    { name: 'Fuel Capacity', why: 'The Fuel gauge, and what Refuel takes on.', row: 'ship' },
    { name: 'Cargo Capacity', why: 'The hold\'s gauge, and the free tons for freight.', row: 'ship' },
    { name: 'Staterooms', why: 'How many High, Middle and Basic passengers fit.', row: 'ship' },
    { name: 'Low Berths', why: 'How many Low passengers fit.', row: 'ship' },
    ...UPKEEP_FIELDS.map((name): SetupField => ({ name, why: 'A month\'s upkeep; Post this month\'s upkeep posts it.', row: 'cost' })),
];

/** The first number in a box, commas allowed (the gauges read a box the same way); null for none. */
export function setupNumber(raw: string | boolean | undefined): number | null {
    if (typeof raw !== 'string' || !raw) return null;
    const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return Number.isFinite(n) ? n : null;
}

/** Each box's number, by name. */
export function setupNumbers(values: SheetValues | null | undefined): Record<string, number | null> {
    const out: Record<string, number | null> = {};
    for (const field of SETUP_FIELDS) out[field.name] = setupNumber(values ? values[field.name] : undefined);
    return out;
}

/** True once every box holds a number: the card folds. */
export function setupDone(numbers: Record<string, number | null>): boolean {
    return SETUP_FIELDS.every((field) => numbers[field.name] !== null);
}

/** How many boxes still want a number. */
export function setupLeft(numbers: Record<string, number | null>): number {
    return SETUP_FIELDS.filter((field) => numbers[field.name] === null).length;
}

/** "Set up: J-2, 1 G, 41 t fuel, 64 t hold, 10 staterooms, 6 low berths, Cr201,200 a month". */
export function setupLine(numbers: Record<string, number | null>): string {
    const n = (name: string): number => numbers[name] ?? 0;
    const upkeep = UPKEEP_FIELDS.reduce((sum, name) => sum + Math.max(0, n(name)), 0);
    return 'Set up: J-' + n('Jump Drive Output') + ', ' + n('Manoeuvre Drive Output') + ' G, ' + n('Fuel Capacity') + ' t fuel, ' + n('Cargo Capacity') + ' t hold, '
        + n('Staterooms') + (n('Staterooms') === 1 ? ' stateroom, ' : ' staterooms, ') + n('Low Berths') + (n('Low Berths') === 1 ? ' low berth, ' : ' low berths, ')
        + formatCredits(upkeep) + ' a month';
}

/**
 * The sheet's own save for one box, as ShipSheet.vue's `store` does it: a vessel whose manifest has moved
 * into its status saves the sheet alone; one from before the manifest saves sheet and status together, so
 * the rows still on its sheet move over as they do on any sheet edit.
 */
export function setupSave(record: CampaignRecord, values: SheetValues, name: string, value: string): { kind: 'record'; sheet: Record<string, unknown> } | { kind: 'trade'; sheet: Record<string, unknown>; status: Status } {
    const next: SheetValues = { ...values };
    if (value.trim()) next[name] = value.trim();
    else delete next[name];
    const status = record.status && typeof record.status === 'object' ? record.status as Record<string, unknown> : {};
    const moved = Array.isArray(status.cargo) && Array.isArray(status.passengers);
    if (!moved) return { kind: 'trade', ...editedSheet(record, next) };
    const own: SheetValues = {};
    for (const [key, held] of Object.entries(next)) if (!isManifestField(key)) own[key] = held;
    return { kind: 'record', sheet: sheetWithFields(record.sheet, own) };
}
