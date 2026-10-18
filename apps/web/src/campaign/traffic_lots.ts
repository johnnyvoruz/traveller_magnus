/**
 * Freight and passengers available at a world (Epic T, step T6). Pure. No screen.
 * Every table is read from rules/mgt2e_trade.json, or from a chosen trade table set
 * through trade.ts `tradeTables` (the same resolver as the trade procedure). Each
 * result carries `cites`: the `_src` lines of the rows it used, which point at
 * assets/trade.txt. Dice come from `face`, a function returning 1 to 6.
 *
 * Read by the caller, not here: both worlds' starport, population code, tech level
 * and zone; the parsecs of the jump; the Effect of the Broker, Carouse or Streetwise
 * check; the highest Steward skill aboard; whether the ship is armed; the highest
 * Naval or Scout rank and SOC DM. A DM label this file cannot read is returned in
 * `unread`, never guessed.
 */
import type { TableSetData } from '@voyage/shared';
import { parseDice, tradeTables, type DmLine, type TradeWorld } from './trade.ts';

type Src = string | string[];
type LabeledDm = { label: string; dm: number | string; _src?: Src };
type WorldDm = { label: string; dm: number; _src?: Src };
type TrafficRow = { roll: string; dice: string; _src?: Src };
type Traffic = {
    _src?: Src;
    roll: string;
    rolls: string[];
    dms: LabeledDm[];
    worldDms: { appliesTo?: string; _src?: Src; rows: WorldDm[] };
    table: TrafficRow[];
};
type Passage = {
    name: string;
    requires: { stateroom?: number; cargoTons?: number; cargoKg?: number; stewardLevelsPer?: number; spareTons?: number; lowBerth?: number; baggageKg?: number };
    _src?: Src;
};
export type FareRow = { parsecs: number; high: number; middle: number; basic: number; low: number; freightPerTon: number; _src?: Src };
type Lot = { name: string; tons: string; _src?: Src };
type MailRules = {
    _src?: Src;
    roll: string;
    dms: LabeledDm[];
    target: number;
    containerTons: number;
    payPerContainer: number;
    containers: string;
    allOrNone: boolean;
};

/** The parts of the trade file this procedure reads. mail may be absent from a set. */
export type TrafficRules = {
    passengers: { _src?: Src; passages: Passage[]; traffic: Traffic };
    fares: { _src?: Src; perJump?: boolean; rows: FareRow[] };
    freight: { _src?: Src; lots: Lot[]; traffic: Traffic; late?: { label: string; reduction: string; _src?: Src } };
    mail?: MailRules;
};

export function trafficTables(set?: TableSetData | null): TrafficRules {
    return tradeTables(set) as unknown as TrafficRules;
}

function cites(...srcs: (Src | undefined)[]): string[] {
    const out: string[] = [];
    for (const src of srcs) {
        if (src === undefined) continue;
        for (const one of Array.isArray(src) ? src : [src]) if (!out.includes(one)) out.push(one);
    }
    return out;
}

function rollD(count: number, face: () => number, dice: number[]): number {
    let total = 0;
    for (let i = 0; i < count; i++) {
        const rolled = face();
        dice.push(rolled);
        total += rolled;
    }
    return total;
}

/** "2D" only: the traffic and mail rolls. */
function rollSpec(spec: string, face: () => number, dice: number[]): number | null {
    const parsed = parseDice(spec);
    if (!parsed || parsed.unit) return null;
    return rollD(parsed.count, face, dice) * parsed.times;
}

/**
 * Does a printed world-DM label describe this world? null: a label this file cannot
 * read (a chosen set's own wording), returned to the caller in `unread`.
 */
export function worldDmApplies(label: string, world: TradeWorld): boolean | null {
    let m: RegExpExecArray | null;
    const pop = world.population;
    const tl = world.techLevel ?? null;
    if ((m = /^World Population (\d+) or less$/.exec(label))) return pop <= Number(m[1]);
    if ((m = /^World Population (\d+) or more$/.exec(label))) return pop >= Number(m[1]);
    if ((m = /^World Population (\d+)-(\d+)$/.exec(label))) return pop >= Number(m[1]) && pop <= Number(m[2]);
    if ((m = /^Starport ([A-EX])$/.exec(label))) return world.starport.toUpperCase() === m[1];
    if ((m = /^Tech Level (\d+) or less$/.exec(label))) return tl !== null && tl <= Number(m[1]);
    if ((m = /^Tech Level (\d+) or more$/.exec(label))) return tl !== null && tl >= Number(m[1]);
    if (label === 'Amber Zone') return world.zone === 'amber';
    if (label === 'Red Zone') return world.zone === 'red';
    return null;
}

const PARSEC_LABEL = 'Each parsec of destination past the first';

export type TrafficQuery = {
    from: TradeWorld;
    to: TradeWorld;
    /** Parsecs of this one jump, 1 or more. */
    parsecs: number;
    /** The Effect of the Average (8+) Broker, Carouse or Streetwise check; 0 if none was made. */
    effect?: number;
    /** The highest Steward skill aboard (passengers only). */
    steward?: number;
    face: () => number;
    set?: TableSetData | null;
};

export type TrafficRoll = {
    kind: string;
    dice: number[];
    roll: number;
    dms: DmLine[];
    total: number;
    /** The table row the total landed on, as printed ("1 or less", "7", "20 or more"). */
    row: string;
    /** The row's dice ("0", "3D"). */
    rowDice: string;
    countDice: number[];
    /** Passengers or lots available. */
    count: number;
    cites: string[];
};

export type TrafficResult = {
    rolls: TrafficRoll[];
    /** The DM every roll shares: the check, the steward, both worlds, the distance. */
    sharedDm: number;
    sharedDms: DmLine[];
    unread: string[];
    cites: string[];
};

function rowFor(table: readonly TrafficRow[], total: number): TrafficRow | null {
    for (const row of table) {
        let m: RegExpExecArray | null;
        if ((m = /^(-?\d+) or less$/.exec(row.roll)) && total <= Number(m[1])) return row;
        if ((m = /^(-?\d+) or more$/.exec(row.roll)) && total >= Number(m[1])) return row;
        if (/^-?\d+$/.test(row.roll) && total === Number(row.roll)) return row;
    }
    return null;
}

function sharedDms(traffic: Traffic, q: TrafficQuery, unread: string[]): { lines: DmLine[]; perKind: Map<string, DmLine> } {
    const lines: DmLine[] = [];
    const perKind = new Map<string, DmLine>();
    for (const row of traffic.dms) {
        const kind = /^Rolling for (\w+) (?:Passengers|Cargo)$/.exec(row.label);
        if (kind && typeof row.dm === 'number') {
            perKind.set(kind[1] as string, { label: row.label, dm: row.dm, cites: cites(row._src) });
            continue;
        }
        if (row.dm === 'Effect') {
            lines.push({ label: row.label, dm: q.effect ?? 0, cites: cites(row._src) });
            continue;
        }
        if (row.label === 'Chief Steward') {
            lines.push({ label: row.label, dm: q.steward ?? 0, cites: cites(row._src) });
            continue;
        }
        if (typeof row.dm === 'number') { lines.push({ label: row.label, dm: row.dm, cites: cites(row._src) }); continue; }
        unread.push(row.label);
    }
    for (const [side, world] of [['source', q.from], ['destination', q.to]] as const) {
        for (const row of traffic.worldDms.rows) {
            if (row.label === PARSEC_LABEL) continue;
            const applies = worldDmApplies(row.label, world);
            if (applies === null) { if (side === 'source') unread.push(row.label); continue; }
            if (applies) lines.push({ label: `${row.label} (${side})`, dm: row.dm, cites: cites(traffic.worldDms._src, row._src) });
        }
    }
    const parsec = traffic.worldDms.rows.find((row) => row.label === PARSEC_LABEL);
    if (parsec && q.parsecs > 1) {
        lines.push({ label: `${parsec.label} (${q.parsecs - 1})`, dm: parsec.dm * (q.parsecs - 1), cites: cites(parsec._src) });
    }
    return { lines, perKind };
}

function rollTraffic(traffic: Traffic, q: TrafficQuery, section: Src | undefined, steward: boolean): TrafficResult {
    if (!Number.isInteger(q.parsecs) || q.parsecs < 1) throw new Error('parsecs must be a whole number, 1 or more');
    const unread: string[] = [];
    const query = steward ? q : { ...q, steward: 0 };
    const { lines, perKind } = sharedDms(traffic, query, unread);
    const shared = lines.reduce((sum, line) => sum + line.dm, 0);
    const rolls: TrafficRoll[] = [];
    for (const kind of traffic.rolls) {
        const dice: number[] = [];
        const roll = rollSpec(traffic.roll, q.face, dice);
        if (roll === null) throw new Error(`unreadable traffic roll ${traffic.roll}`);
        const own = perKind.get(kind);
        const dms = own ? [...lines, own] : [...lines];
        const total = roll + dms.reduce((sum, line) => sum + line.dm, 0);
        const row = rowFor(traffic.table, total);
        if (!row) throw new Error(`no traffic row for ${total}`);
        const countDice: number[] = [];
        let count = 0;
        if (row.dice !== '0') {
            const n = rollSpec(row.dice, q.face, countDice);
            if (n === null) throw new Error(`unreadable traffic dice ${row.dice}`);
            count = n;
        }
        rolls.push({
            kind, dice, roll, dms, total, row: row.roll, rowDice: row.dice, countDice, count,
            cites: cites(section, traffic._src, ...dms.flatMap((d) => d.cites), row._src),
        });
    }
    return { rolls, sharedDm: shared, sharedDms: lines, unread: [...new Set(unread)], cites: cites(section, traffic._src) };
}

/** Passengers wanting this jump: four rolls, Low, Basic, Middle, High (assets/trade.txt:89-112). */
export function passengerTraffic(q: TrafficQuery): TrafficResult {
    const rules = trafficTables(q.set);
    return rollTraffic(rules.passengers.traffic, q, rules.passengers._src, true);
}

export type FreightLot = { kind: string; tons: number; dice: number[]; cites: string[] };
export type FreightResult = TrafficResult & { lots: FreightLot[] };

/** Freight lots for this jump: three rolls, Incidental, Minor, Major, then each lot's tons. */
export function freightTraffic(q: TrafficQuery): FreightResult {
    const rules = trafficTables(q.set);
    const result = rollTraffic(rules.freight.traffic, q, rules.freight._src, false);
    const lots: FreightLot[] = [];
    for (const roll of result.rolls) {
        const lot = rules.freight.lots.find((one) => one.name === roll.kind);
        if (!lot) { result.unread.push(`lot size for ${roll.kind}`); continue; }
        for (let i = 0; i < roll.count; i++) {
            const dice: number[] = [];
            const tons = rollSpec(lot.tons, q.face, dice);
            if (tons === null) throw new Error(`unreadable lot size ${lot.tons}`);
            lots.push({ kind: roll.kind, tons, dice, cites: cites(lot._src) });
        }
    }
    return { ...result, lots };
}

export type Passenger = 'high' | 'middle' | 'basic' | 'low';

function fareRow(rules: TrafficRules, parsecs: number): FareRow | null {
    return rules.fares.rows.find((row) => row.parsecs === parsecs) ?? null;
}

/** One passenger's fare for one jump of this many parsecs. null past the table. */
export function fare(parsecs: number, passage: Passenger, set?: TableSetData | null): { credits: number; cites: string[] } | null {
    const rules = trafficTables(set);
    const row = fareRow(rules, parsecs);
    if (!row) return null;
    return { credits: row[passage], cites: cites(rules.fares._src, row._src) };
}

/** What a freight lot pays on time for one jump. */
export function freightPay(parsecs: number, tons: number, set?: TableSetData | null): { perTon: number; credits: number; cites: string[] } | null {
    const rules = trafficTables(set);
    const row = fareRow(rules, parsecs);
    if (!row) return null;
    return { perTon: row.freightPerTon, credits: row.freightPerTon * tons, cites: cites(rules.fares._src, row._src) };
}

/** The late-delivery cut, "1D+4 x 10%": a percentage off the payment, at most 100. */
export function lateReduction(face: () => number, set?: TableSetData | null): { dice: number[]; percent: number; cites: string[] } | null {
    const late = trafficTables(set).freight.late;
    if (!late) return null;
    const m = /^(\d+)D\+(\d+) x (\d+)%$/.exec(late.reduction);
    if (!m) return null;
    const dice: number[] = [];
    const rolled = rollD(Number(m[1]), face, dice) + Number(m[2]);
    return { dice, percent: Math.min(100, rolled * Number(m[3])), cites: cites(late._src) };
}

export type MailQuery = {
    /** The total DM that applied to the Freight Traffic roll (Johnny, ZT0 Q8): FreightResult.sharedDm. */
    freightDm: number;
    armed: boolean;
    /** The world the mail leaves from. */
    world: TradeWorld;
    navalOrScoutRank?: number;
    socDm?: number;
    face: () => number;
    set?: TableSetData | null;
};

export type MailResult = {
    dice: number[];
    roll: number;
    dms: DmLine[];
    total: number;
    target: number;
    offered: boolean;
    containers: number;
    containerDice: number[];
    tons: number;
    credits: number;
    allOrNone: boolean;
    unread: string[];
    cites: string[];
};

function bandApplies(label: string, dm: number): boolean | null {
    let m: RegExpExecArray | null;
    if ((m = /^Freight Traffic DM ?([+-]?\d+) or less$/.exec(label))) return dm <= Number(m[1]);
    if ((m = /^Freight Traffic DM ?([+-]?\d+) or more$/.exec(label))) return dm >= Number(m[1]);
    if ((m = /^Freight Traffic DM ?([+-]?\d+) to ([+-]?\d+)$/.exec(label))) return dm >= Number(m[1]) && dm <= Number(m[2]);
    return null;
}

/** Is there mail for this jump (assets/trade.txt:267-293)? null when the set has no mail table. */
export function mailOffer(q: MailQuery): MailResult | null {
    const mail = trafficTables(q.set).mail;
    if (!mail) return null;
    const unread: string[] = [];
    const dms: DmLine[] = [];
    for (const row of mail.dms) {
        const band = bandApplies(row.label, q.freightDm);
        if (band !== null) {
            if (band && typeof row.dm === 'number') dms.push({ label: row.label, dm: row.dm, cites: cites(row._src) });
            continue;
        }
        if (row.label === "Travellers' ship is armed") { if (q.armed && typeof row.dm === 'number') dms.push({ label: row.label, dm: row.dm, cites: cites(row._src) }); continue; }
        const tl = /^World is TL of (\d+) or less$/.exec(row.label);
        if (tl) {
            const level = q.world.techLevel ?? null;
            if (level !== null && level <= Number(tl[1]) && typeof row.dm === 'number') dms.push({ label: row.label, dm: row.dm, cites: cites(row._src) });
            continue;
        }
        if (row.dm === 'rank') { dms.push({ label: row.label, dm: q.navalOrScoutRank ?? 0, cites: cites(row._src) }); continue; }
        if (row.dm === 'SOC DM') { dms.push({ label: row.label, dm: q.socDm ?? 0, cites: cites(row._src) }); continue; }
        unread.push(row.label);
    }
    const dice: number[] = [];
    const roll = rollSpec(mail.roll, q.face, dice);
    if (roll === null) throw new Error(`unreadable mail roll ${mail.roll}`);
    const total = roll + dms.reduce((sum, line) => sum + line.dm, 0);
    const offered = total >= mail.target;
    const containerDice: number[] = [];
    let containers = 0;
    if (offered) {
        const n = rollSpec(mail.containers, q.face, containerDice);
        if (n === null) throw new Error(`unreadable mail containers ${mail.containers}`);
        containers = n;
    }
    return {
        dice, roll, dms, total, target: mail.target, offered, containers, containerDice,
        tons: containers * mail.containerTons, credits: containers * mail.payPerContainer,
        allOrNone: mail.allOrNone, unread, cites: cites(mail._src, ...dms.flatMap((d) => d.cites)),
    };
}

export type PassengerCounts = Partial<Record<Passenger, number>>;
export type PassageNeeds = { staterooms: number; cargoTons: number; spareTons: number; lowBerths: number; stewardLevels: number; cites: string[] };

/**
 * What carrying these passengers asks of the ship (assets/trade.txt:51-79). Steward
 * levels are summed per passage class, each rounded up (one per 10 High, one per 100
 * Middle): a reading, filed as a question.
 */
export function passageNeeds(counts: PassengerCounts, set?: TableSetData | null): PassageNeeds {
    const rules = trafficTables(set);
    const out: PassageNeeds = { staterooms: 0, cargoTons: 0, spareTons: 0, lowBerths: 0, stewardLevels: 0, cites: [] };
    const srcs: (Src | undefined)[] = [];
    for (const passage of rules.passengers.passages) {
        const n = counts[passage.name.toLowerCase() as Passenger] ?? 0;
        if (n <= 0) continue;
        const r = passage.requires;
        out.staterooms += (r.stateroom ?? 0) * n;
        out.cargoTons += (r.cargoTons ?? 0) * n + ((r.cargoKg ?? 0) * n) / 1000;
        out.spareTons += (r.spareTons ?? 0) * n;
        out.lowBerths += (r.lowBerth ?? 0) * n;
        if (r.stewardLevelsPer) out.stewardLevels += Math.ceil(n / r.stewardLevelsPer);
        srcs.push(passage._src);
    }
    out.cargoTons = Math.round(out.cargoTons * 1000) / 1000;
    out.cites = cites(...srcs);
    return out;
}