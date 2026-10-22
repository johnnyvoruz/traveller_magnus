/**
 * The trade procedure (Epic T, step T5). Pure. No screen.
 * Every table is read from rules/mgt2e_trade.json (the generated wrapper) or from a
 * chosen trade table set handed in by the caller (campaign/table_sets.ts `setFor`).
 * Each result carries `cites`: the `_src` lines of the rows it used, which point at
 * assets/trade.txt. Dice come from `face`, a function returning 1 to 6, so a test
 * can seed them.
 *
 * Read by the caller, not here: the world's trade codes, starport, population code,
 * tech level, law level and travel zone; a Traveller's skill and characteristic DM;
 * the Law Level a good is banned at. This file computes no rule of its own.
 *
 * Trade-code names: the goods table prints names, not codes, in several spellings.
 * TRADE_CODE_NAMES is the name-to-code table Johnny approved for this module
 * (directives/decisions.md:57, "names as printed with an approved name-to-code
 * table in the module"; the list is directives/reports/z_stream.md:228-236).
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import published from '../../../../packages/engines/src/generated/rules/mgt2e_trade.js';
import { validateTableSet, type TableSetData } from '@voyage/shared';
import { setFor, type TableChoice } from './table_sets.ts';

type Src = string | string[];

type Dm = { label: string; dm: number; _src?: Src };

type SupplierCheck = {
    name: string;
    difficulty: string;
    skill: string;
    time: string;
    characteristic: string[];
    worlds?: string;
    _src?: Src;
};

export type TradeGood = {
    d66: string;
    type: string;
    availability: string[] | null;
    tons: string | null;
    basePrice: number | null;
    purchaseDM: Record<string, number> | null;
    saleDM: Record<string, number> | null;
    examples?: string;
    illegal: boolean | null;
    _src?: Src;
};

type PriceRow = { result: string; purchasePercent: number; salePercent: number; _src?: Src };

type Modifier = { label: string; sign: '+' | '-'; assumed?: number; _src?: Src };

type BrokerKind = {
    name: string;
    skill: string;
    skillRoll: string;
    feePercent: number;
    of: string;
    negotiationDm: number;
    goods?: string;
    _src?: Src;
};

type AvailabilityRule = { text?: string; label?: string; dm?: number; appliesTo?: string; _src?: Src };

/** The parts of the trade file this procedure reads. */
export type TradeRules = {
    supplier: {
        _src?: Src;
        repeatAttemptDm: Dm;
        checks: SupplierCheck[];
        starportDms: Dm[];
    };
    goods: {
        _src?: Src;
        availability: { _src?: Src; rules: AvailabilityRule[] };
        table: TradeGood[];
    };
    purchase: { _src?: Src; roll: string; modifiers: Modifier[] };
    sale: { _src?: Src; roll: string; modifiers: Modifier[] };
    modifiedPrice: { _src?: Src; rows: PriceRow[] };
    localBrokers?: { _src?: Src; kinds: BrokerKind[] };
    illegalGoods?: { _src?: Src };
};

const OFFICIAL = published as TradeRules;

/** The published file in the envelope `setFor` stores for `official:trade`. */
const OFFICIAL_SET: TableSetData = {
    schemaVersion: 1,
    kind: 'trade',
    id: 'official:trade',
    name: 'Official trade',
    basedOn: null,
    edition: 'MgT2E',
    tables: published,
};

/** What Trade here says when the roll used the published file. */
export const OFFICIAL_TRADE_LABEL = 'Official trade tables';

/**
 * The tables to roll on. A trade set that passes its checks is used; anything else,
 * including null, is the official file. `setFor('trade', ...)` gives the set.
 */
export function tradeTables(set?: TableSetData | null): TradeRules {
    if (!set) return OFFICIAL;
    const checked = validateTableSet(set);
    if (checked.ok && checked.set?.kind === 'trade') return checked.set.tables as TradeRules;
    return OFFICIAL;
}

/**
 * The campaign's trade set. `settings` is the campaign's `tableSets`.
 * `ownSets` is the account's trade sets already loaded. A missing or unreadable
 * choice rolls the official file.
 */
export function tradeChoice(settings: TableChoice | null, ownSets: readonly TableSetData[] = []): {
    tables: TradeRules;
    label: string;
    words: string | null;
} {
    const resolved = setFor('trade', settings, ownSets, { trade: OFFICIAL_SET });
    const set = resolved.set;
    return {
        tables: tradeTables(set),
        label: set && set.id !== 'official:trade' ? set.name : OFFICIAL_TRADE_LABEL,
        words: resolved.words,
    };
}

/** Approved name-to-code table (decisions.md:57). Every printed spelling of each code. */
export const TRADE_CODE_NAMES: Readonly<Record<string, readonly string[]>> = {
    Ag: ['Agricultural'],
    As: ['Asteroid'],
    De: ['Desert'],
    Fl: ['Fluid Oceans'],
    Ga: ['Garden'],
    Hi: ['High Pop', 'High Population'],
    Ht: ['High Tech', 'High-Tech'],
    Ic: ['Ice Capped', 'Ice-Capped'],
    In: ['Industrial'],
    Lo: ['Low Pop', 'Low Population'],
    Lt: ['Low Tech'],
    Na: ['Non-Agricultural'],
    Ni: ['Non-Industrial'],
    Po: ['Poor'],
    Ri: ['Rich'],
    Wa: ['Water World'],
};

/** Not trade codes (z_stream.md:235): every world, and the two travel zones. */
export const ALL_WORLDS = 'All';
export const ZONE_NAMES = { amber: 'Amber Zone', red: 'Red Zone' } as const;

export type TradeWorld = {
    /** Trade codes as the index carries them, e.g. ["In", "Ht"]. */
    tradeCodes: readonly string[];
    /** The starport class letter. */
    starport: string;
    /** The population code as a number. */
    population: number;
    techLevel?: number | null;
    lawLevel?: number | null;
    zone?: 'amber' | 'red' | null;
};

export type DmLine = { label: string; dm: number; cites: string[] };

function cites(...srcs: (Src | undefined)[]): string[] {
    const out: string[] = [];
    for (const src of srcs) {
        if (src === undefined) continue;
        for (const one of Array.isArray(src) ? src : [src]) if (!out.includes(one)) out.push(one);
    }
    return out;
}

/** The printed names that describe this world: its codes' names, and its zone. */
export function worldNames(world: TradeWorld): Set<string> {
    const names = new Set<string>();
    for (const code of world.tradeCodes) for (const name of TRADE_CODE_NAMES[code] ?? []) names.add(name);
    if (world.zone) names.add(ZONE_NAMES[world.zone]);
    return names;
}

type ParsedDice = { count: number; times: number; unit: string | null };

/** The printed forms: `ND`, `ND x M`, `ND days`, `ND hours`. Null for any other form. */
export function parseDice(spec: string): ParsedDice | null {
    const match = /^([1-9]\d*)D(?: x ([1-9]\d*))?(?: (days|hours))?$/.exec(spec);
    if (!match) return null;
    return { count: Number(match[1]), times: match[2] ? Number(match[2]) : 1, unit: match[3] ?? null };
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

function target(difficulty: string): number | null {
    const match = /\((\d+)\+\)/.exec(difficulty);
    return match ? Number(match[1]) : null;
}

// ---- 1. Find a supplier or buyer (assets/trade.txt 311-335, 492-493) ----

export type SupplierKind = 'supplier' | 'blackMarket' | 'online';

const CHECK_NAMES: Record<SupplierKind, RegExp> = {
    supplier: /^Finding a Supplier or Broker$/,
    blackMarket: /Black Market/,
    online: /Online/,
};

export type SupplierAsk = {
    kind: SupplierKind;
    world: TradeWorld;
    /** The Traveller's level in the check's skill (Broker, Streetwise or Admin). */
    skill: number;
    /** The DM of the characteristic the Traveller uses (EDU or SOC; EDU online). */
    characteristicDm: number;
    /** Earlier attempts on this planet this month. */
    previousAttempts?: number;
};

export type SupplierResult = {
    check: string;
    allowed: boolean;
    words: string | null;
    dice: number[];
    dms: DmLine[];
    total: number;
    target: number | null;
    found: boolean;
    effect: number;
    time: { dice: number[]; amount: number; unit: string | null } | null;
    cites: string[];
};

/** The starport's DM to finding a supplier. Zero for a class the file lists no row for. */
export function starportDm(world: TradeWorld, tables: TradeRules = OFFICIAL): DmLine {
    const row = tables.supplier.starportDms.find((item) => item.label === `Class ${world.starport}`);
    if (!row) return { label: `Class ${world.starport}: no starport DM listed`, dm: 0, cites: cites(tables.supplier.starportDms.map((item) => item._src).flat().filter((s): s is string => typeof s === 'string')) };
    return { label: row.label, dm: row.dm, cites: cites(row._src) };
}

/**
 * One search for a supplier, black market supplier or online supplier. Finding a
 * buyer is the same roll (line 492-493). 2D plus skill, characteristic, the
 * starport DM and DM-1 per earlier attempt this month, against the check's number.
 */
export function findSupplier(ask: SupplierAsk, face: () => number, tables: TradeRules = OFFICIAL): SupplierResult {
    const check = tables.supplier.checks.find((item) => CHECK_NAMES[ask.kind].test(item.name));
    const empty: SupplierResult = { check: check?.name ?? ask.kind, allowed: false, words: null, dice: [], dms: [], total: 0, target: null, found: false, effect: 0, time: null, cites: cites(tables.supplier._src) };
    if (!check) return { ...empty, words: 'The trade table has no such check.' };
    const tlMatch = check.worlds ? /TL(\d+)\+/.exec(check.worlds) : null;
    if (tlMatch) {
        const needed = Number(tlMatch[1]);
        if (ask.world.techLevel == null) return { ...empty, words: `Only on ${check.worlds?.replace(' only', '')}; this world's tech level is not known.`, cites: cites(check._src) };
        if (ask.world.techLevel < needed) return { ...empty, words: `Only on ${check.worlds?.replace(' only', '')}.`, cites: cites(check._src) };
    }
    const dms: DmLine[] = [
        { label: `${check.skill} skill`, dm: ask.skill, cites: cites(check._src) },
        { label: `${check.characteristic.join(' or ')} DM`, dm: ask.characteristicDm, cites: cites(check._src) },
        starportDm(ask.world, tables),
    ];
    const attempts = ask.previousAttempts ?? 0;
    if (attempts > 0) {
        const repeat = tables.supplier.repeatAttemptDm;
        dms.push({ label: `${attempts} x DM${repeat.dm} ${repeat.label}`, dm: attempts * repeat.dm, cites: cites(repeat._src) });
    }
    const dice: number[] = [];
    const rolled = rollD(2, face, dice);
    const total = rolled + dms.reduce((sum, line) => sum + line.dm, 0);
    const number = target(check.difficulty);
    const found = number != null && total >= number;
    let time: SupplierResult['time'] = null;
    const spec = parseDice(check.time);
    if (spec) {
        const timeDice: number[] = [];
        const amount = rollD(spec.count, face, timeDice) * spec.times;
        time = { dice: timeDice, amount, unit: spec.unit };
    }
    return {
        check: check.name,
        allowed: true,
        words: null,
        dice,
        dms,
        total,
        target: number,
        found,
        effect: number == null ? 0 : total - number,
        time,
        cites: cites(check._src, ...dms.flatMap((line) => line.cites)),
    };
}

// ---- 2. Determine goods available (assets/trade.txt 336-352, 395-422) ----

export type GoodsLot = {
    d66: string;
    type: string;
    /** How the supplier came to have it. A type rolled again adds a lot. */
    from: ('common' | 'tradeCode' | 'random')[];
    tons: number;
    tonsRolls: { dice: number[]; dm: number; tons: number }[];
    basePrice: number | null;
    illegal: boolean | null;
    cites: string[];
};

export type ExoticRoll = { d66: string; type: string; words: string; cites: string[] };

export type GoodsResult = {
    lots: GoodsLot[];
    /** A random roll that landed on a row outside the normal rules (Exotics). */
    exotics: ExoticRoll[];
    quantityDm: DmLine | null;
    randomRolls: { dice: number[]; d66: string; rerolled: boolean }[];
    cites: string[];
};

function isCommon(good: TradeGood): boolean {
    return (good.availability ?? []).includes(ALL_WORLDS);
}

function matches(good: TradeGood, names: Set<string>): boolean {
    return (good.availability ?? []).some((name) => names.has(name));
}

/** DM to the quantity roll from the population code (lines 344-349). Null when none applies. */
export function quantityDm(world: TradeWorld, tables: TradeRules = OFFICIAL): DmLine | null {
    for (const rule of tables.goods.availability.rules) {
        if (rule.dm === undefined || !rule.label) continue;
        const low = /Population (\d+)-/.exec(rule.label);
        if (low && world.population <= Number(low[1])) return { label: rule.label, dm: rule.dm, cites: cites(rule._src) };
        const high = /Population (\d+)\+/.exec(rule.label);
        if (high && world.population >= Number(high[1])) return { label: rule.label, dm: rule.dm, cites: cites(rule._src) };
    }
    return null;
}

/**
 * Tons of one lot: the row's dice, the quantity DM on the dice, then the multiplier.
 * Zero or less is none available (line 346-347).
 */
export function rollTons(good: TradeGood, dm: number, face: () => number): { dice: number[]; dm: number; tons: number } | null {
    if (!good.tons) return null;
    const spec = parseDice(good.tons);
    if (!spec || spec.unit) return null;
    const dice: number[] = [];
    const rolled = rollD(spec.count, face, dice) + dm;
    return { dice, dm, tons: Math.max(0, rolled) * spec.times };
}

export type GoodsAsk = {
    world: TradeWorld;
    /** A black market supplier (lines 401-406). */
    blackMarket?: boolean;
};

/**
 * What one supplier has. A supplier: all Common Goods, the legal Trade Goods matching
 * the world's codes, and as many random rolls as the population code, re-rolling 61-65.
 * A black market supplier: the illegal goods matching the world's codes, and as many
 * random rolls on 1D with 6 as the leading digit.
 */
export function goodsAvailable(ask: GoodsAsk, face: () => number, tables: TradeRules = OFFICIAL): GoodsResult {
    const names = worldNames(ask.world);
    const dm = quantityDm(ask.world, tables);
    const rules = tables.goods.availability;
    const lots = new Map<string, GoodsLot>();
    const exotics: ExoticRoll[] = [];
    const randomRolls: GoodsResult['randomRolls'] = [];
    const add = (good: TradeGood, from: GoodsLot['from'][number]): void => {
        const tons = rollTons(good, dm?.dm ?? 0, face);
        const lot = lots.get(good.d66) ?? {
            d66: good.d66,
            type: good.type,
            from: [],
            tons: 0,
            tonsRolls: [],
            basePrice: good.basePrice,
            illegal: good.illegal,
            cites: cites(good._src),
        };
        lot.from.push(from);
        if (tons) {
            lot.tonsRolls.push(tons);
            lot.tons += tons.tons;
        }
        lots.set(good.d66, lot);
    };
    const black = ask.blackMarket === true;
    for (const good of tables.goods.table) {
        if (good.availability == null || good.illegal == null) continue;
        if (black) {
            if (good.illegal && matches(good, names)) add(good, 'tradeCode');
        } else if (!good.illegal) {
            if (isCommon(good)) add(good, 'common');
            else if (matches(good, names)) add(good, 'tradeCode');
        }
    }
    const count = Math.max(0, Math.floor(ask.world.population));
    for (let i = 0; i < count; i++) {
        let d66 = '';
        let dice: number[] = [];
        let rerolled = false;
        for (let tries = 0; tries < 100; tries++) {
            dice = [];
            if (black) {
                d66 = '6' + String(rollD(1, face, dice));
            } else {
                const tens = rollD(1, face, dice);
                const units = rollD(1, face, dice);
                d66 = String(tens) + String(units);
            }
            if (black || !/^6[1-5]$/.test(d66)) break;
            rerolled = true;
        }
        randomRolls.push({ dice, d66, rerolled });
        const good = tables.goods.table.find((row) => row.d66 === d66);
        if (!good) continue;
        if (good.availability == null || good.tons == null) {
            exotics.push({ d66, type: good.type, words: (good as { text?: string }).text ?? 'Outside the normal trade rules; the referee decides.', cites: cites(good._src) });
            continue;
        }
        add(good, 'random');
    }
    const all = [...lots.values()].sort((a, b) => a.d66.localeCompare(b.d66));
    return {
        lots: all,
        exotics,
        quantityDm: dm,
        randomRolls,
        cites: cites(tables.goods._src, rules._src, ...(dm ? dm.cites : [])),
    };
}

// ---- 3. Purchase and sale price (assets/trade.txt 423-436, 457-499) ----

/** The largest DM in one column that this world's names reach (line 431-432). */
export function columnDm(column: Record<string, number> | null, world: TradeWorld): { dm: number; name: string | null } {
    if (!column) return { dm: 0, name: null };
    const names = worldNames(world);
    let best: { dm: number; name: string | null } = { dm: 0, name: null };
    for (const [name, dm] of Object.entries(column)) {
        if (name.startsWith('_') || !names.has(name)) continue;
        if (best.name === null || dm > best.dm) best = { dm, name };
    }
    return best;
}

/**
 * The Sale DM of a good on this world. The column's largest, or, for a good banned
 * locally, the world's Law Level less the Law Level it is banned at; the higher of the
 * two (lines 444-452). `bannedAtLaw` is the referee's number; this file has no ban list.
 */
export function saleDm(good: TradeGood, world: TradeWorld, bannedAtLaw: number | null = null, tables: TradeRules = OFFICIAL): DmLine {
    const column = columnDm(good.saleDM, world);
    const line: DmLine = { label: column.name ? `Sale DM, ${column.name}` : 'Sale DM, none', dm: column.dm, cites: cites(good._src) };
    if (bannedAtLaw != null && world.lawLevel != null && world.lawLevel >= bannedAtLaw) {
        const local = world.lawLevel - bannedAtLaw;
        if (local > line.dm) {
            return { label: `Sale DM, banned at Law ${bannedAtLaw} on a Law ${world.lawLevel} world`, dm: local, cites: cites(good._src, tables.illegalGoods?._src) };
        }
    }
    return line;
}

export function purchaseDm(good: TradeGood, world: TradeWorld): DmLine {
    const column = columnDm(good.purchaseDM, world);
    return { label: column.name ? `Purchase DM, ${column.name}` : 'Purchase DM, none', dm: column.dm, cites: cites(good._src) };
}

function bandMatch(label: string, total: number): boolean {
    const less = /^(-?\d+) or less$/.exec(label);
    if (less) return total <= Number(less[1]);
    const plus = /^(-?\d+)\+$/.exec(label);
    if (plus) return total >= Number(plus[1]);
    const exact = /^(-?\d+)$/.exec(label);
    return exact != null && total === Number(exact[1]);
}

/** The Modified Price row for a result. */
export function modifiedPriceRow(total: number, tables: TradeRules = OFFICIAL): PriceRow | null {
    return tables.modifiedPrice.rows.find((row) => bandMatch(row.result, total)) ?? null;
}

export type BrokerHire = {
    /** 'legal' is the local broker; 'illegal' is the broker or fixer for illegal goods. */
    kind: 'legal' | 'illegal';
    /** The broker's skill level as the referee settled it from the 2D/3 roll. */
    skill: number;
};

export type PriceAsk = {
    good: TradeGood;
    world: TradeWorld;
    tons: number;
    /** The Traveller's Broker skill. Not used when a local broker is hired. */
    brokerSkill: number;
    /** The other side's Broker skill. Absent means the file's assumed value. */
    otherSkill?: number;
    broker?: BrokerHire | null;
    /** Sale only: the Law Level the good is banned at on this world, if it is. */
    bannedAtLaw?: number | null;
};

export type PriceResult = {
    side: 'purchase' | 'sale';
    allowed: boolean;
    words: string | null;
    dice: number[];
    dms: DmLine[];
    total: number;
    percent: number | null;
    perTon: number | null;
    price: number | null;
    brokerFee: number | null;
    cites: string[];
};

function brokerKind(hire: BrokerHire, tables: TradeRules): BrokerKind | null {
    const kinds = tables.localBrokers?.kinds ?? [];
    return kinds.find((kind) => (hire.kind === 'illegal' ? kind.goods === 'illegal goods' : kind.goods === undefined)) ?? null;
}

function price(side: 'purchase' | 'sale', ask: PriceAsk, face: () => number, tables: TradeRules): PriceResult {
    const section = side === 'purchase' ? tables.purchase : tables.sale;
    const none: PriceResult = { side, allowed: false, words: null, dice: [], dms: [], total: 0, percent: null, perTon: null, price: null, brokerFee: null, cites: cites(section._src) };
    if (ask.good.basePrice == null || ask.good.purchaseDM == null || ask.good.saleDM == null) {
        return { ...none, words: 'Outside the normal trade rules; the referee decides.', cites: cites(ask.good._src) };
    }
    const spec = parseDice(section.roll);
    if (!spec || spec.unit || spec.times !== 1) return { ...none, words: 'The trade table\'s price roll is not one this roller reads.' };
    const other = section.modifiers.find((mod) => mod.assumed !== undefined);
    const dms: DmLine[] = [];
    const hire = ask.broker ? brokerKind(ask.broker, tables) : null;
    if (ask.broker && !hire) return { ...none, words: 'The trade table has no local broker of that kind.' };
    const ownSkill = section.modifiers.find((mod) => /Broker skill/.test(mod.label) && mod.sign === '+');
    if (hire && ask.broker) {
        dms.push({ label: `${hire.name}'s ${hire.skill} skill`, dm: ask.broker.skill, cites: cites(hire._src) });
        dms.push({ label: `${hire.name} on negotiations`, dm: hire.negotiationDm, cites: cites(hire._src) });
    } else if (side === 'purchase') {
        dms.push({ label: 'Traveller\'s Broker skill', dm: ask.brokerSkill, cites: cites(ownSkill?._src) });
    } else {
        // Line 491: selling works just like purchasing, so the Traveller's Broker skill is added.
        dms.push({ label: 'Traveller\'s Broker skill', dm: ask.brokerSkill, cites: cites(tables.sale._src, tables.purchase.modifiers.find((mod) => /Broker skill/.test(mod.label) && mod.sign === '+')?._src) });
    }
    const buy = purchaseDm(ask.good, ask.world);
    const sell = side === 'sale' ? saleDm(ask.good, ask.world, ask.bannedAtLaw ?? null, tables) : (() => {
        const column = columnDm(ask.good.saleDM, ask.world);
        return { label: column.name ? `Sale DM, ${column.name}` : 'Sale DM, none', dm: column.dm, cites: cites(ask.good._src) };
    })();
    const plusCol = side === 'purchase' ? buy : sell;
    const minusCol = side === 'purchase' ? sell : buy;
    dms.push({ ...plusCol, cites: cites(...plusCol.cites, section.modifiers.find((mod) => mod.sign === '+' && /DM/.test(mod.label))?._src) });
    dms.push({ ...minusCol, dm: -minusCol.dm, cites: cites(...minusCol.cites, section.modifiers.find((mod) => mod.sign === '-' && mod.assumed === undefined)?._src) });
    const otherSkill = ask.otherSkill ?? other?.assumed ?? 0;
    dms.push({ label: other ? other.label : 'the other side\'s Broker skill', dm: -otherSkill, cites: cites(other?._src) });
    const dice: number[] = [];
    const total = rollD(spec.count, face, dice) + dms.reduce((sum, line) => sum + line.dm, 0);
    const row = modifiedPriceRow(total, tables);
    if (!row) return { ...none, allowed: true, words: 'No Modified Price row for that result.', dice, dms, total };
    const percent = side === 'purchase' ? row.purchasePercent : row.salePercent;
    const perTon = (ask.good.basePrice * percent) / 100;
    const gross = perTon * ask.tons;
    const brokerFee = hire ? (gross * hire.feePercent) / 100 : null;
    return {
        side,
        allowed: true,
        words: null,
        dice,
        dms,
        total,
        percent,
        perTon,
        price: gross,
        brokerFee,
        cites: cites(section._src, ...dms.flatMap((line) => line.cites), tables.modifiedPrice._src, row._src),
    };
}

/** The purchase price of `tons` of a good (lines 423-436). */
export function purchasePrice(ask: PriceAsk, face: () => number, tables: TradeRules = OFFICIAL): PriceResult {
    return price('purchase', ask, face, tables);
}

/** The sale price (lines 490-499): Sale DMs added, Purchase DMs subtracted. */
export function salePrice(ask: PriceAsk, face: () => number, tables: TradeRules = OFFICIAL): PriceResult {
    return price('sale', ask, face, tables);
}

// ---- 4. Local brokers (assets/trade.txt 354-372) ----

export type BrokerRoll = {
    name: string;
    dice: number[];
    total: number;
    /** The 2D total divided by three, unrounded. The file does not say how to round. */
    third: number;
    feePercent: number;
    /** A natural 2 on the fixer's roll: an informer, agent or double-crosser (lines 367-372). */
    informer: boolean;
    cites: string[];
};

/** Rolls a local broker's skill. `kind` 'illegal' is the broker or fixer for illegal goods. */
export function rollLocalBroker(kind: 'legal' | 'illegal', face: () => number, tables: TradeRules = OFFICIAL): BrokerRoll | null {
    const hire = brokerKind({ kind, skill: 0 }, tables);
    if (!hire) return null;
    const match = /^(\d+)D\/(\d+)$/.exec(hire.skillRoll);
    if (!match) return null;
    const dice: number[] = [];
    const total = rollD(Number(match[1]), face, dice);
    const natural = dice.length === 2 && total === 2;
    return {
        name: hire.name,
        dice,
        total,
        third: total / Number(match[2]),
        feePercent: hire.feePercent,
        informer: kind === 'illegal' && natural,
        cites: cites(hire._src, kind === 'illegal' ? (tables.localBrokers as { notes?: { _src?: Src }[] } | undefined)?.notes?.[0]?._src : undefined),
    };
}

/** A good by its D66 number. */
export function tradeGood(d66: string, tables: TradeRules = OFFICIAL): TradeGood | null {
    return tables.goods.table.find((row) => row.d66 === d66) ?? null;
}