/**
 * Trade here (DT5; backlog T5, D's half): what the screen needs around Z's `campaign/trade.ts`, which
 * holds every rule. The world as the trade procedure reads it, from the sector index; the words for a
 * roll (its dice, each DM by the file's own label, its sources); which trade good a cargo lot is; the
 * cargo lot and the ledger line a purchase or a sale writes. No rule of its own.
 */
import { mentionsOf, type CampaignEntry, type CargoLot, type LedgerLine, type SectorHex } from '@voyage/shared';
import { mentionToken } from './journal/mention.ts';
import { formatCredits } from '../campaign/money.ts';
import { tradeGood, type DmLine, type TradeGood, type TradeRules, type TradeWorld } from '../campaign/trade.ts';
import { starport } from '../map/uwp.ts';

/** The digits after 9, as dossier/labels.ts writes them (I and O are not used). */
const EHEX_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

/** One UWP character as a number; null for '?', a blank or anything else. */
export function uwpDigit(ch: string): number | null {
    const c = ch.trim().toUpperCase();
    if (/^[0-9]$/.test(c)) return Number(c);
    const at = EHEX_CHARS.indexOf(c);
    return c.length === 1 && at >= 0 ? 10 + at : null;
}

/**
 * The world as the trade procedure reads it. The UWP's places as the dossier's ribbon reads them: the
 * starport first, population fifth, law seventh, tech level after the dash. The zone from the index's
 * A or R. Null when the UWP has no population to read.
 */
export function tradeWorldOf(entry: Pick<SectorHex, 'uwp' | 'tradeCodes' | 'zone'>): TradeWorld | null {
    const uwp = entry.uwp.trim();
    const population = uwp.length > 4 ? uwpDigit(uwp.charAt(4)) : null;
    if (population === null) return null;
    const dash = uwp.indexOf('-');
    return {
        tradeCodes: entry.tradeCodes.slice(),
        starport: starport(uwp),
        population,
        lawLevel: uwp.length > 6 ? uwpDigit(uwp.charAt(6)) : null,
        techLevel: dash >= 0 && uwp.length > dash + 1 ? uwpDigit(uwp.charAt(dash + 1)) : null,
        zone: entry.zone === 'A' ? 'amber' : entry.zone === 'R' ? 'red' : null,
    };
}

/** "+2", "−1", "+0": a DM as the book prints it, with a true minus. */
export function signed(dm: number): string {
    return dm < 0 ? '−' + String(-dm) : '+' + String(dm);
}

/** "2D: 4, 3": the dice as they fell. */
export function diceWords(dice: readonly number[], spec: string): string {
    return spec + ': ' + dice.join(', ');
}

/** "Broker skill +1 · EDU or SOC DM +1 · Class A +6": each DM by the file's label. */
export function dmWords(dms: readonly DmLine[]): string {
    return dms.map((line) => line.label + ' ' + signed(line.dm)).join(' · ');
}

/** "assets/trade.txt:311-335, …" as "trade.txt 311-335 · 503-513": where the rows came from. */
export function citeWords(cites: readonly string[]): string {
    const lines: string[] = [];
    let file = '';
    for (const cite of cites) {
        const match = /^(?:.*\/)?([^/:]+):(.+)$/.exec(cite);
        if (!match) continue;
        if (!file) file = match[1];
        if (!lines.includes(match[2])) lines.push(match[2]);
    }
    return file ? file + ' ' + lines.join(' · ') : '';
}

/** The note a bought lot carries, so a sale finds its good even after the label is changed. */
export function goodNote(good: TradeGood): string {
    return 'Trade good ' + good.d66;
}

/** Which trade good a cargo lot is: its note's D66 first, then its label as the good's type. */
export function goodOfLot(lot: CargoLot, tables: TradeRules): TradeGood | null {
    const noted = lot.note ? /Trade good (\d\d)/.exec(lot.note) : null;
    if (noted) {
        const found = tradeGood(noted[1], tables);
        if (found) return found;
    }
    const label = lot.label.trim().toLowerCase();
    return tables.goods.table.find((good) => good.type.toLowerCase() === label) ?? null;
}

/** A purchase as a cargo lot: the good's type, the tons, what was paid, where. */
export function boughtLot(good: TradeGood, tons: number, paid: number, worldName: string): CargoLot {
    return { label: good.type, tons, value: paid, origin: worldName, note: goodNote(good) };
}

function tonsText(tons: number): string {
    return (Number.isInteger(tons) ? String(tons) : tons.toFixed(1)) + ' t';
}

/** The ledger line a purchase posts: an expense, on the campaign's day. */
export function boughtLine(good: TradeGood, tons: number, paid: number, worldName: string, when: LedgerLine['when']): LedgerLine {
    return { when, amount: -paid, memo: 'Bought ' + good.type + ' (' + tonsText(tons) + ') at ' + worldName, kind: 'expense' };
}

/** The ledger line a sale posts: income, on the campaign's day. */
export function soldLine(lot: CargoLot, received: number, worldName: string, when: LedgerLine['when']): LedgerLine {
    return { when, amount: received, memo: 'Sold ' + lot.label + ' (' + tonsText(lot.tons) + ') at ' + worldName, kind: 'income' };
}

/** "Cr7,500 a ton, Cr150,000 for 20 t". */
export function priceWords(perTon: number, tons: number): string {
    return formatCredits(perTon) + ' a ton, ' + formatCredits(perTon * tons) + ' for ' + tonsText(tons);
}

/**
 * A hired broker's fee as its own expense (DT5b): "Broker's fee, 10% (Common Electronics at Lanth)". The
 * percent and what it is of are the file's (`localBrokers`); the amount is Z's `brokerFee`, scaled to the
 * tons actually traded.
 */
export function brokerFeeLine(name: string, feePercent: number, lotLabel: string, fee: number, worldName: string, when: LedgerLine['when']): LedgerLine {
    return { when, amount: -fee, memo: name + "'s fee, " + feePercent + '% (' + lotLabel + ' at ' + worldName + ')', kind: 'expense' };
}

/** This device's "Log it" choice, one per campaign. Absent means off. */
export const TRADE_LOG_PREFIX = 'voyage.trade.log.';

/** On only when this campaign has stored '1' on this device. No campaign means off. */
export function tradeLogOn(universeId: string | null, read: (key: string) => string | null): boolean {
    if (!universeId) return false;
    return read(TRADE_LOG_PREFIX + universeId) === '1';
}

/** Remembers the tick for this campaign. No campaign writes nothing. */
export function tradeLogSave(universeId: string | null, on: boolean, write: (key: string, value: string) => void): void {
    if (!universeId) return;
    write(TRADE_LOG_PREFIX + universeId, on ? '1' : '0');
}

/**
 * The journal note a ticked buy or sell writes: kind note, the ledger line's own words, mentioning
 * the world and the ship. Players see it only when the vessel is visible to them. Off writes nothing.
 */
export function tradeLogEntry(args: {
    on: boolean;
    memo: string;
    vessel: { id: string; name: string; visibility: string };
    hexKey: string | null;
    worldName: string;
    when: { year: number; day: number } | null;
    id: string;
    whenReal: string;
}): (CampaignEntry & { baseRev: number }) | null {
    if (!args.on) return null;
    const tokens: string[] = [];
    if (args.hexKey) tokens.push(mentionToken('hex:' + args.hexKey, args.worldName));
    if (args.vessel.id) tokens.push(mentionToken(args.vessel.id, args.vessel.name));
    const body = tokens.length ? args.memo + '\n\n' + tokens.join(' ') : args.memo;
    return {
        id: args.id,
        kind: 'note',
        title: '',
        body,
        when: args.when ? { year: args.when.year, day: args.when.day } : null,
        realDate: null,
        sequence: null,
        author: 'referee',
        visibility: args.vessel.visibility === 'players' ? 'players' : 'referee',
        anchor: null,
        mentions: mentionsOf(body),
        rev: 0,
        createdAt: args.whenReal,
        updatedAt: args.whenReal,
        deleted: false,
        baseRev: 0,
    };
}

/** "8 ÷ 3 = 2.67": a third that is not whole, as the file leaves it (question 88 is open). */
export function thirdWords(total: number, third: number): string {
    const shown = Number.isInteger(third) ? String(third) : third.toFixed(2);
    return total + ' ÷ 3 = ' + shown;
}
