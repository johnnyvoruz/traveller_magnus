/**
 * Find passengers and freight (DT6; backlog T6, D's screen half): what the screen needs around Z's
 * `campaign/traffic_lots.ts`, which holds every roll, read from rules/mgt2e_trade.json. Which worlds a
 * jump can reach, the typed inputs as the query wants them, the words for a roll (its dice, each DM by
 * the file's own label, the row it landed on), what the taken passengers ask of the ship, and the lots
 * and fare lines a take writes (DT3's lot and line). Freight (DT6b): a rolled lot as cargo with the pay
 * owed on delivery, and the income line Deliver posts, less the file's late cut when the referee says
 * the delivery was late (what "on time" means is the referee's, the file does not say). Mail (DT6c): the
 * offer in words and the one cargo lot it makes, all containers or none, paid on delivery as freight is.
 * No rule of its own; no number from memory.
 */
import type { CargoLot, LedgerLine, PassengerLot } from '@voyage/shared';
import { MARKET_RANGES, type MarketRange, type MarketRow } from '../campaign/markets.ts';
import { formatCredits } from '../campaign/money.ts';
import type { FreightLot, MailResult, PassageNeeds, PassengerCounts, TrafficRoll } from '../campaign/traffic_lots.ts';
import { fareLine } from './passenger_fare.ts';
import { stardate } from './stardate.ts';
import { diceWords, dmWords } from './trade_here.ts';

/** The markets range that covers a jump of this many parsecs: the first of 2, 4, 6 at or past it; past 6, 6. */
export function rangeFor(parsecs: number): MarketRange {
    return MARKET_RANGES.find((range) => range >= parsecs) ?? MARKET_RANGES[MARKET_RANGES.length - 1];
}

/** The worlds one jump reaches: within the ship's parsecs, not the world it is at, in the rows' order (nearest first). */
export function reachable(rows: readonly MarketRow[], parsecs: number): MarketRow[] {
    return rows.filter((row) => row.parsecs > 0 && row.parsecs <= parsecs);
}

/** A typed whole number; blank is `empty`; anything else is null. */
function wholeOf(text: string, empty: number | undefined): number | undefined | null {
    const typed = text.trim();
    if (!typed) return empty;
    return /^-?\d+$/.test(typed) ? Number(typed) : null;
}

/**
 * The highest Steward skill aboard as typed. Blank is nobody: the query leaves `steward` off and the roll
 * takes the untrained row (A's AT2, Johnny's question 102). A whole number 0 or more is that level, 0 a
 * trained one. Anything else is null, an error to show.
 */
export function stewardOf(text: string): number | undefined | null {
    const level = wholeOf(text, undefined);
    return level === null || level === undefined ? level : level >= 0 ? level : null;
}

/** The Effect of the Broker, Carouse or Streetwise check as typed: blank is 0, no check made; else a whole number, or null. */
export function effectOf(text: string): number | null {
    const effect = wholeOf(text, 0);
    return effect === undefined ? 0 : effect;
}

/** "2D: 4, 3 · Chief Steward +1 · Starport A (source) +2 = 11 → row 11, 2D: 3, 5 = 8" or "… → row 1 or less: none". */
export function rollWords(roll: TrafficRoll): string {
    const head = diceWords(roll.dice, '2D') + (roll.dms.length ? ' · ' + dmWords(roll.dms) : '') + ' = ' + roll.total + ' → row ' + roll.row;
    if (roll.rowDice === '0') return head + ': none';
    return head + ', ' + diceWords(roll.countDice, roll.rowDice) + ' = ' + roll.count;
}

/** "6 passengers", "1 passenger", "No passengers". */
export function passengerWords(count: number): string {
    if (count <= 0) return 'No passengers';
    return count === 1 ? '1 passenger' : count + ' passengers';
}

/** A typed take: a whole number from 0 to the roll's count; blank is 0; anything else is null. */
export function takeOf(text: string, count: number): number | null {
    const n = wholeOf(text, 0);
    return n === undefined || n === null || n < 0 || n > count ? (n === undefined ? 0 : null) : n;
}

/** The counts a take asks for, by the fares table's key ("High" is `high`). Zero and unknown classes are left out. */
export function countsOf(taking: Readonly<Record<string, number>>): PassengerCounts {
    const out: PassengerCounts = {};
    for (const [kind, n] of Object.entries(taking)) {
        const key = kind.trim().toLowerCase();
        if (n > 0 && (key === 'high' || key === 'middle' || key === 'basic' || key === 'low')) out[key] = n;
    }
    return out;
}

function plural(n: number, one: string, many: string): string {
    return n + ' ' + (n === 1 ? one : many);
}

/** "6 staterooms, 1 steward level, 0.6 t of baggage" from what the file says each passage needs; blank when nothing is asked. */
export function needsWords(needs: PassageNeeds): string {
    const parts: string[] = [];
    if (needs.staterooms > 0) parts.push(plural(needs.staterooms, 'stateroom', 'staterooms'));
    if (needs.lowBerths > 0) parts.push(plural(needs.lowBerths, 'low berth', 'low berths'));
    if (needs.stewardLevels > 0) parts.push(plural(needs.stewardLevels, 'steward level', 'steward levels'));
    if (needs.spareTons > 0) parts.push(needs.spareTons + ' t spare');
    if (needs.cargoTons > 0) parts.push(needs.cargoTons + ' t of baggage');
    return parts.join(', ');
}

/** The sheet's boxes the taken passengers are compared with (A's AS8b, Johnny's question 120): a whole number typed there is the count. */
export const STATEROOMS_FIELD = 'Staterooms';
export const LOW_BERTHS_FIELD = 'Low Berths';

export type BerthLine = { field: string; has: number; need: number; short: number; words: string };

/**
 * "The sheet has 10 staterooms: 14 short" or "The sheet has 30 staterooms: enough" (DT6d). Null when nothing
 * of the kind is needed, or when the box is empty or not a whole number 0 or more: then nothing is compared.
 */
export function berthLine(typed: unknown, need: number, field: string, one: string, many: string): BerthLine | null {
    if (need <= 0) return null;
    const has = typeof typed === 'string' ? wholeOf(typed, undefined) : null;
    if (has === undefined || has === null || has < 0) return null;
    const short = Math.max(0, need - has);
    return { field, has, need, short, words: 'The sheet has ' + plural(has, one, many) + ': ' + (short > 0 ? short + ' short' : 'enough') };
}

/**
 * The comparison lines for a take, staterooms then low berths, and one sentence for the boxes still to write:
 * "Write Staterooms and Low Berths on the ship sheet to compare." (once, not per class). Steward levels are
 * words only: the sheet has no crew skills.
 */
export function berthWords(sheet: Readonly<Record<string, unknown>> | null, needs: PassageNeeds): { lines: BerthLine[]; missing: string } {
    const lines: BerthLine[] = [];
    const missing: string[] = [];
    const boxes: [string, number, string, string][] = [[STATEROOMS_FIELD, needs.staterooms, 'stateroom', 'staterooms'], [LOW_BERTHS_FIELD, needs.lowBerths, 'low berth', 'low berths']];
    for (const [field, need, one, many] of boxes) {
        if (need <= 0) continue;
        const line = berthLine(sheet ? sheet[field] : undefined, need, field, one, many);
        if (line) lines.push(line);
        else missing.push(field);
    }
    return { lines, missing: missing.length ? 'Write ' + missing.join(' and ') + ' on the ship sheet to compare.' : '' };
}

/** The lots a take adds: n unnamed passengers of the class, each boarded with the fare on it (DT3's lot). */
export function takenLots(n: number, className: string, fareCr: number): PassengerLot[] {
    const out: PassengerLot[] = [];
    for (let i = 0; i < n; i += 1) out.push({ label: '', class: className, fareCr });
    return out;
}

/** The fare lines a take posts: one per passenger, DT3's line ("Fare: a passenger, High passage, 2 parsecs"), income, dated the campaign day. */
export function takenLines(n: number, className: string, parsecs: number, credits: number, when: LedgerLine['when']): LedgerLine[] {
    const out: LedgerLine[] = [];
    for (let i = 0; i < n; i += 1) out.push(fareLine('', className, parsecs, credits, when));
    return out;
}

/** "Took 6 High and 2 Low passengers; 8 fares posted, Cr86,600." */
export function tookWords(taken: ReadonlyArray<{ kind: string; n: number }>, fares: number, creditsWords: string): string {
    const parts = taken.filter((one) => one.n > 0).map((one) => one.n + ' ' + one.kind);
    if (!parts.length) return '';
    const list = parts.length === 1 ? parts[0] : parts.slice(0, -1).join(', ') + ' and ' + parts[parts.length - 1];
    const total = taken.reduce((sum, one) => sum + one.n, 0);
    return 'Took ' + list + (total === 1 ? ' passenger; ' : ' passengers; ') + plural(fares, 'fare', 'fares') + ' posted, ' + creditsWords + '.';
}

// ---- Freight (DT6b) ----------------------------------------------------------------------------------------

/** "3 lots", "1 lot", "No lots". */
export function lotWords(count: number): string {
    if (count <= 0) return 'No lots';
    return count === 1 ? '1 lot' : count + ' lots';
}

function tonsWords(tons: number): string {
    return (Number.isInteger(tons) ? String(tons) : tons.toFixed(1)) + ' t';
}

/** A rolled lot as cargo: "Freight, Major lot", its tons, from here to there, the pay owed on delivery; the note says so for the sheet. */
export function freightLot(lot: Pick<FreightLot, 'kind' | 'tons'>, payCr: number, origin: string, destination: string): CargoLot {
    const out: CargoLot = { label: 'Freight, ' + lot.kind + ' lot', tons: lot.tons, payCr, note: formatCredits(payCr) + ' on delivery' };
    if (origin) out.origin = origin;
    if (destination) out.destination = destination;
    return out;
}

/** True for a lot carried for pay on delivery. */
export function isFreight(lot: Pick<CargoLot, 'payCr'>): boolean {
    return typeof lot.payCr === 'number';
}

/** "40 t (1D x 10: 4) · Cr40,000 on delivery, Cr1,000 a ton"; past the fares table, the tons and that there is no row. */
export function freightWords(lot: Pick<FreightLot, 'tons' | 'dice'>, spec: string, pay: { perTon: number; credits: number } | null): string {
    const dice = lot.dice.length ? ' (' + (spec || lot.dice.length + 'D') + ': ' + lot.dice.join(', ') + ')' : '';
    const tons = tonsWords(lot.tons) + dice;
    return pay ? tons + ' · ' + formatCredits(pay.credits) + ' on delivery, ' + formatCredits(pay.perTon) + ' a ton' : tons + ' · the fares table has no freight rate for this jump';
}

/** Words when a lot is larger than the free hold (the file says a lot cannot be broken up, assets/trade.txt:263); blank when it fits or the hold is unknown. */
export function holdWords(tons: number, free: number | null): string {
    if (free === null || tons <= free) return '';
    return 'Larger than the free hold by ' + tonsWords(tons - free) + '. A lot cannot be broken up.';
}

/**
 * The income line Deliver posts: the pay owed, or with the file's late cut taken off when the referee marked
 * the delivery late ("1D+4 x 10%", assets/trade.txt:264-266, rolled by `lateReduction`). Whole credits.
 */
export function deliveredLine(lot: Pick<CargoLot, 'label' | 'tons' | 'payCr' | 'destination'>, when: LedgerLine['when'], late: { dice: number[]; percent: number } | null, at?: string): LedgerLine {
    const pay = lot.payCr ?? 0;
    const paid = late ? Math.round((pay * (100 - late.percent)) / 100) : pay;
    const place = at || lot.destination;
    const where = place ? ' at ' + place : '';
    const lateWords = late ? '; late, 1D+4 x 10% (1D: ' + late.dice.join(', ') + ') = ' + late.percent + '% off' : '';
    return { when, amount: paid, memo: 'Delivered ' + (lot.label || 'a lot') + ' (' + tonsWords(lot.tons) + ')' + where + lateWords, kind: 'income' };
}

// ---- Mail (DT6c) --------------------------------------------------------------------------------------------

/** A typed rank: blank is 0 (nobody holds one); a whole number 0 or more; anything else null. */
export function rankOf(text: string): number | null {
    const rank = wholeOf(text, 0);
    return rank === undefined ? 0 : rank === null || rank < 0 ? null : rank;
}

/** "2D: 3, 3 · Freight Traffic DM 5 to 9 +1 · Travellers' ship is armed +2 = 12, 12 or more needed: mail offered" or "…: no mail". */
export function mailWords(mail: Pick<MailResult, 'dice' | 'dms' | 'total' | 'target' | 'offered'>): string {
    return diceWords(mail.dice, '2D') + (mail.dms.length ? ' · ' + dmWords(mail.dms) : '') + ' = ' + mail.total + ', ' + mail.target + ' or more needed: ' + (mail.offered ? 'mail offered' : 'no mail');
}

/** "4 containers (1D: 4), 20 t, Cr100,000 on delivery; all or none." */
export function mailOfferWords(mail: Pick<MailResult, 'containers' | 'containerDice' | 'tons' | 'credits' | 'allOrNone'>): string {
    const n = mail.containers;
    const dice = mail.containerDice.length ? ' (1D: ' + mail.containerDice.join(', ') + ')' : '';
    return n + (n === 1 ? ' container' : ' containers') + dice + ', ' + tonsWords(mail.tons) + ', ' + formatCredits(mail.credits) + ' on delivery' + (mail.allOrNone ? '; all or none.' : '.');
}

/** The mail as one cargo lot: every container, its tons, the pay on delivery (Deliver on the cargo row posts it as freight's). */
export function mailLot(mail: Pick<MailResult, 'containers' | 'tons' | 'credits' | 'allOrNone'>, origin: string, destination: string): CargoLot {
    const n = mail.containers;
    const out: CargoLot = { label: 'Mail, ' + n + (n === 1 ? ' container' : ' containers'), tons: mail.tons, payCr: mail.credits, note: formatCredits(mail.credits) + ' on delivery' + (mail.allOrNone ? ', all or none' : '') };
    if (origin) out.origin = origin;
    if (destination) out.destination = destination;
    return out;
}

/** How many rolled lots the list shows before the rest fold away (DU37), as the track folds its earlier legs. */
export const LOTS_SHOWN = 10;

/** How many rows a long list shows before the rest fold away (DU38: the Ledger and the Passengers list, as the lots). */
export const ROWS_SHOWN = 10;

/** The rows on show: all of them, or the first `limit` with the count of those folded away. */
export function shownRows(count: number, all: boolean, limit = ROWS_SHOWN): { shown: number; more: number } {
    if (all || count <= limit) return { shown: count, more: 0 };
    return { shown: limit, more: count - limit };
}

/** The lots on show: all of them, or the first LOTS_SHOWN with the count of those folded away. */
export function shownLots(count: number, all: boolean): { shown: number; more: number } {
    return shownRows(count, all, LOTS_SHOWN);
}

/** The day groups cut to their first `shown` lines, in the order given (newest first on the Ledger); a group left empty goes. */
export function periodsShown<L, P extends { lines: readonly L[] }>(periods: readonly P[], shown: number): P[] {
    const out: P[] = [];
    let left = shown;
    for (const period of periods) {
        if (left <= 0) break;
        const lines = period.lines.length <= left ? period.lines : period.lines.slice(0, left);
        left -= lines.length;
        if (lines.length) out.push(lines === period.lines ? period : { ...period, lines });
    }
    return out;
}

// ---- Arrival (DW3 round 5) ----------------------------------------------------------------------------------

/** The list without the boarded passengers (every one, or the one at `at`): they have left the ship. The fare lines stay on the Ledger. */
export function disembarked(passengers: readonly PassengerLot[], at?: number): PassengerLot[] {
    if (at !== undefined) return passengers.filter((_, i) => i !== at);
    return passengers.filter((one) => typeof one.fareCr !== 'number');
}

/** "16 passengers disembarked at Ruie." */
export function disembarkWords(count: number, where: string): string {
    return passengerWords(count).replace(/^No passengers$/, '0 passengers') + ' disembarked' + (where ? ' at ' + where : '') + '.';
}

// ---- Fit to the sheet (DU40; Johnny's 125) ----------------------------------------------------------------

/** The sheet's Staterooms and Low Berths boxes as counts; null where a box is empty or not a whole number 0 or more. */
export function berthBoxes(sheet: Readonly<Record<string, unknown>> | null): { staterooms: number | null; lowBerths: number | null } {
    const read = (field: string): number | null => {
        const typed = sheet ? sheet[field] : undefined;
        const n = typeof typed === 'string' ? wholeOf(typed, undefined) : null;
        return n === undefined || n === null || n < 0 ? null : n;
    };
    return { staterooms: read(STATEROOMS_FIELD), lowBerths: read(LOW_BERTHS_FIELD) };
}

/** The passages in the order the fit fills them: the dearest fares first, then the low berths. */
export const FIT_ORDER: readonly string[] = ['High', 'Middle', 'Basic', 'Low'];

/**
 * The take that fits the ship: the rolled counts filled in FIT_ORDER, each class as far as the needs the file
 * states for the whole take (needsOf, the same reading as the needs line) stay within the sheet's staterooms
 * and low berths, and within the hold's free tons when they are known (Basic passage asks spare tons). Null
 * without both boxes. The referee may edit the boxes afterwards; no rule is read here.
 */
export function fitTake(
    rolls: readonly { kind: string; count: number }[],
    boxes: { staterooms: number | null; lowBerths: number | null },
    freeTons: number | null,
    needsOf: (counts: PassengerCounts) => PassageNeeds,
): Record<string, number> | null {
    if (boxes.staterooms === null || boxes.lowBerths === null) return null;
    const taken: Record<string, number> = {};
    for (const roll of rolls) taken[roll.kind] = 0;
    const fits = (counts: Record<string, number>): boolean => {
        const needs = needsOf(countsOf(counts));
        return needs.staterooms <= boxes.staterooms! && needs.lowBerths <= boxes.lowBerths! && (freeTons === null || needs.spareTons + needs.cargoTons <= freeTons);
    };
    const order = [...rolls].sort((a, b) => {
        const ia = FIT_ORDER.indexOf(a.kind);
        const ib = FIT_ORDER.indexOf(b.kind);
        return (ia === -1 ? FIT_ORDER.length : ia) - (ib === -1 ? FIT_ORDER.length : ib);
    });
    for (const roll of order) {
        let n = 0;
        while (n < roll.count && fits({ ...taken, [roll.kind]: n + 1 })) n += 1;
        taken[roll.kind] = n;
    }
    return taken;
}

// ---- The payment's next due day (DU42) --------------------------------------------------------------------

/** Today plus `every` days, as a day and year (the year's days as the clock counts them); null unless `every` is a whole number above 0. */
export function dueFrom(today: { year: number; day: number }, every: number): { year: number; day: number } | null {
    if (!Number.isInteger(every) || every <= 0) return null;
    const date = stardate(today.year * 365 + (today.day - 1) + every);
    return { year: date.year, day: date.day };
}

// ---- When the upkeep was last posted (DU43) ---------------------------------------------------------------

/** A ledger day as a count, for comparing two days; the clock's own reckoning (365 days a year). */
function dayCount(when: LedgerLine['when']): number {
    return when.year * 365 + (when.day - 1);
}

/** The newest recurring line whose memo is one of the cost boxes: the last time the upkeep was posted; null when never. */
export function lastUpkeep(ledger: readonly LedgerLine[], fields: readonly string[]): LedgerLine['when'] | null {
    let last: LedgerLine['when'] | null = null;
    for (const line of ledger) {
        if (line.kind !== 'recurring' || !fields.includes(line.memo)) continue;
        if (!last || dayCount(line.when) > dayCount(last)) last = line.when;
    }
    return last;
}

/** "Last posted on 351-1104, 28 days ago." / ", today." / ", 1 day ago."; a day after today is named alone; "Not posted yet." when none. */
export function upkeepPostedWords(last: LedgerLine['when'] | null, today: LedgerLine['when']): string {
    if (!last) return 'Not posted yet.';
    const date = String(last.day).padStart(3, '0') + '-' + last.year;
    const ago = dayCount(today) - dayCount(last);
    if (ago < 0) return 'Last posted on ' + date + '.';
    if (ago === 0) return 'Last posted on ' + date + ', today.';
    return 'Last posted on ' + date + ', ' + ago + (ago === 1 ? ' day ago.' : ' days ago.');
}
