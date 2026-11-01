/**
 * Passengers with fares (streams/D.md DT3; backlog Epic T, step T3). Pure: it runs under Node.
 *
 * The passage classes are the rules file's, rules/mgt2e_trade.json `passengers.passages` (High, Middle,
 * Basic, Low; assets/trade.txt:51-79), and a fare is that file's `fares` row for the jump's parsecs
 * (assets/trade.txt:159-166), read through Lane A's campaign/traffic_lots.ts `fare`, the same table the
 * Passenger Traffic roll reads. Nothing here is a number of its own.
 *
 * A passenger lot's `class` is the ship sheet's Passage box, free text: a class the file names has a
 * fare; any other word has none. Board posts the fare to the ship's ledger as income, dated the campaign
 * day, and keeps it on the lot as `fareCr`, so a boarded passenger reads as boarded and is not boarded
 * twice. Taking it back is a plain remove of the ledger line (CRUD, no undo; DT3c): the line's memo and
 * amount say which lot it boarded, and that lot's fare goes with the line, so Board comes back.
 *
 * The jump's parsecs are the form's to choose; when the ship's track has a jump ahead between two system
 * hexes, the form starts on that leg's distance (DT3d), one hex one parsec on the chart, and says so.
 */
import type { CampaignAnchor, LedgerLine, PassengerLot, TableSetData, TrackLeg } from '@voyage/shared';
import type { SectorAt } from '../campaign/markets.ts';
import { fare, trafficTables, type Passenger } from '../campaign/traffic_lots.ts';
import { parsecsBetween } from '../map/geometry.ts';

export type PassageClass = { name: string; key: Passenger };

/** The keys the fares table has a column for. A passage the file names outside these has no fare. */
const FARE_KEYS: readonly Passenger[] = ['high', 'middle', 'basic', 'low'];

function keyOf(name: string): Passenger | null {
    const word = name.trim().toLowerCase();
    return (FARE_KEYS as readonly string[]).includes(word) ? word as Passenger : null;
}

/** The passage classes the rules file names, in its order, each with the fares table's key. */
export function passageClasses(set?: TableSetData | null): PassageClass[] {
    const out: PassageClass[] = [];
    for (const passage of trafficTables(set).passengers.passages) {
        const key = keyOf(passage.name);
        if (key) out.push({ name: passage.name, key });
    }
    return out;
}

/** The fares table's key for a Passage word ("High", "middle"), or null when the file names no such class. */
export function passageKey(className: string, set?: TableSetData | null): Passenger | null {
    const key = keyOf(className);
    return key && passageClasses(set).some((one) => one.key === key) ? key : null;
}

/** The jumps the fares table prices, in parsecs, in its order. */
export function fareParsecs(set?: TableSetData | null): number[] {
    return trafficTables(set).fares.rows.map((row) => row.parsecs);
}

/** The fare for a passenger of this class over a jump of this many parsecs, or null (no such class, or past the table). */
export function fareFor(className: string, parsecs: number, set?: TableSetData | null): { credits: number; cites: string[] } | null {
    const key = passageKey(className, set);
    return key ? fare(parsecs, key, set) : null;
}

/** "Fare: Ada Voss, High passage, 2 parsecs". The class is written as the file names it. */
export function fareMemo(label: string, className: string, parsecs: number, set?: TableSetData | null): string {
    const key = passageKey(className, set);
    const named = key ? passageClasses(set).find((one) => one.key === key) : null;
    const who = label.trim() || 'a passenger';
    return 'Fare: ' + who + ', ' + (named ? named.name : className.trim()) + ' passage, ' + parsecs + (parsecs === 1 ? ' parsec' : ' parsecs');
}

/** The ledger line Board posts: the fare as income, dated the campaign day. */
export function fareLine(label: string, className: string, parsecs: number, credits: number, when: LedgerLine['when'], set?: TableSetData | null): LedgerLine {
    return { when, amount: Math.abs(credits), memo: fareMemo(label, className, parsecs, set), kind: 'income' };
}

/** True once a fare was posted for the lot. */
export function isBoarded(lot: Pick<PassengerLot, 'fareCr'>): boolean {
    return typeof lot.fareCr === 'number';
}

/** The passengers with lot `index` boarded: its class as chosen and the fare kept on it. The others untouched. */
export function boarded(passengers: readonly PassengerLot[], index: number, className: string, fareCr: number): PassengerLot[] {
    return passengers.map((lot, at) => (at === index ? { ...lot, class: className, fareCr } : lot));
}

/** The passengers with lot `index` given this Passage word. */
export function withClass(passengers: readonly PassengerLot[], index: number, className: string): PassengerLot[] {
    return passengers.map((lot, at) => (at === index ? { ...lot, class: className } : lot));
}

/** The fare the sheet's Passage box stands for ("Passage 3" is the third lot), or null when none was posted. */
export function fareOfPassageField(passengers: readonly PassengerLot[], fieldName: string): number | null {
    const row = /^Passage (\d+)$/.exec(fieldName);
    if (!row) return null;
    const lot = passengers[Number(row[1]) - 1];
    return lot && typeof lot.fareCr === 'number' ? lot.fareCr : null;
}

/**
 * The passengers with the lot a removed fare line boarded unboarded (DT3c): the first lot whose kept fare
 * is the line's amount and whose name and class open the line's memo as `fareMemo` writes it. A line that
 * boarded no one on the list leaves the passengers as they are.
 */
export function unboarded(passengers: readonly PassengerLot[], line: Pick<LedgerLine, 'memo' | 'amount' | 'kind'>, nameOf: (lot: PassengerLot) => string, set?: TableSetData | null): PassengerLot[] {
    if (line.kind !== 'income') return passengers.slice();
    const at = passengers.findIndex((lot) => lot.fareCr === line.amount && line.memo.startsWith(fareMemo(nameOf(lot), lot.class, 1, set).replace(/ 1 parsec$/, ' ')));
    if (at < 0) return passengers.slice();
    return passengers.map((lot, i) => {
        if (i !== at) return lot;
        const { fareCr: _gone, ...rest } = lot;
        return rest;
    });
}

/** The ship's next jump: the leg's two ends and the parsecs between their hexes. */
export type NextJump = { from: CampaignAnchor; to: CampaignAnchor; parsecs: number };

/**
 * The next jump on a track (DT3d): the first jump leg that has not arrived by `days`, when both its ends
 * are system anchors on a sector the grid places. No track, no jump ahead, an end that is a record or
 * nowhere, or a sector off the grid: null, and the form's jump stays as it was.
 */
export function nextJump(track: readonly TrackLeg[] | null, days: number, sectorAt: SectorAt): NextJump | null {
    if (!track) return null;
    const leg = track.find((one) => one.mode === 'jump' && one.arrives > days);
    if (!leg || !leg.from || !leg.to || leg.from.kind !== 'system' || leg.to.kind !== 'system') return null;
    const parsecs = parsecsBetween(leg.from.hexKey, leg.to.hexKey, sectorAt);
    return parsecs === null ? null : { from: leg.from, to: leg.to, parsecs };
}

/** What the Board form's jump starts on: the next jump's parsecs when the fares table has that row, else nothing. */
export function boardStart(next: NextJump | null, parsecs: readonly number[] = fareParsecs()): string {
    return next && parsecs.includes(next.parsecs) ? String(next.parsecs) : '';
}
