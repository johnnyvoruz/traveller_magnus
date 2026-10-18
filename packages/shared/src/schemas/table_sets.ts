/**
 * Table sets (findings/trade_tables_design.md §9, Johnny 20:39: the ten
 * recommendations). One envelope per kind. `tables` is the rules file itself.
 * Dice strings are the forms printed in rules/mgt2e_trade.json and
 * rules/mgt2e_random_passenger.json: `0`, `ND`, `ND x M`, `1D-1`, `ND days`,
 * `ND hours`. A set is at most 256 KB.
 */
import { z } from 'zod';

export const TABLE_SET_BYTES = 256 * 1024;

export const TableKind = z.enum(['randomPassenger', 'trade']);
export type TableKind = z.infer<typeof TableKind>;

const Outcome = z.object({
    range: z.tuple([z.number().finite(), z.number().finite()]),
    text: z.string(),
}).passthrough();

/** The random-passenger file: D66 rows, plus the sub-roll and skills the roller already reads. */
export const RandomPassengerTables = z.object({
    dice: z.string(),
    entries: z.array(z.object({
        roll: z.string(),
        text: z.string(),
        sub: z.object({
            dice: z.string(),
            outcomes: z.array(Outcome),
        }).passthrough().optional(),
        skills: z.array(z.object({
            name: z.string(),
            dice: z.string(),
        }).passthrough()).optional(),
    }).passthrough()),
}).passthrough();

const Traffic = z.object({
    roll: z.string(),
    table: z.array(z.unknown()),
}).passthrough();

/** The trade file's sections the procedure reads. mail, localBrokers and illegalGoods may be absent. */
export const TradeTables = z.object({
    passengers: z.object({
        passages: z.array(z.unknown()),
        traffic: Traffic,
    }).passthrough(),
    fares: z.object({
        rows: z.array(z.unknown()),
    }).passthrough(),
    freight: z.object({
        lots: z.array(z.unknown()),
        traffic: Traffic,
    }).passthrough(),
    supplier: z.object({}).passthrough(),
    goods: z.object({
        table: z.array(z.unknown()),
        availability: z.unknown(),
    }).passthrough(),
    purchase: z.object({ roll: z.string() }).passthrough(),
    sale: z.object({ roll: z.string() }).passthrough(),
    modifiedPrice: z.object({
        rows: z.array(z.unknown()),
    }).passthrough(),
}).passthrough();

export const TableSet = z.object({
    schemaVersion: z.literal(1),
    kind: TableKind,
    id: z.string().min(1),
    name: z.string().trim().min(1).max(80),
    basedOn: z.string().nullable(),
    edition: z.string(),
    tables: z.unknown(),
}).strict();
export type TableSetData = z.infer<typeof TableSet>;

export type TableProblem = { path: string; words: string };

export type TableCheck = {
    ok: boolean;
    problems: TableProblem[];
    set: TableSetData | null;
};

type Band = { low: number; high: number; openLow: boolean; openHigh: boolean; label: string };

const PRINTED_DICE = /^(?:0|[1-9]\d*D(?:-[1-9]\d*)?(?: x [1-9]\d*)?(?: days| hours)?)$/;

/** True when the string is a dice form printed in the official files. */
export function printedDice(value: string): boolean {
    return PRINTED_DICE.test(value);
}

export const TABLE_KINDS = {
    randomPassenger: { official: 'mgt2e_random_passenger', schema: RandomPassengerTables },
    trade: { official: 'mgt2e_trade', schema: TradeTables },
} as const;

function problem(path: string, words: string): TableProblem {
    return { path, words };
}

function asRecord(value: unknown): Record<string, unknown> | null {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    return value as Record<string, unknown>;
}

function bandOf(label: string): Band | null {
    const less = /^(-?\d+) or less$/.exec(label);
    if (less) {
        const n = Number(less[1]);
        return { low: n, high: n, openLow: true, openHigh: false, label };
    }
    const more = /^(-?\d+) or more$/.exec(label);
    if (more) {
        const n = Number(more[1]);
        return { low: n, high: n, openLow: false, openHigh: true, label };
    }
    const plus = /^(-?\d+)\+$/.exec(label);
    if (plus) {
        const n = Number(plus[1]);
        return { low: n, high: n, openLow: false, openHigh: true, label };
    }
    const exact = /^(-?\d+)$/.exec(label);
    if (exact) {
        const n = Number(exact[1]);
        return { low: n, high: n, openLow: false, openHigh: false, label };
    }
    return null;
}

function coverBands(labels: string[], path: string, problems: TableProblem[], openEnds: boolean): void {
    const bands: Band[] = [];
    for (const label of labels) {
        const band = bandOf(label);
        if (!band) {
            problems.push(problem(path, `"${label}" is not a result band.`));
            return;
        }
        bands.push(band);
    }
    bands.sort((a, b) => a.low - b.low || a.high - b.high);
    for (let i = 1; i < bands.length; i++) {
        const prev = bands[i - 1];
        const next = bands[i];
        if (next.low <= prev.high) {
            problems.push(problem(path, `"${next.label}" overlaps "${prev.label}".`));
        } else if (next.low !== prev.high + 1) {
            problems.push(problem(path, `A gap sits between "${prev.label}" and "${next.label}".`));
        }
    }
    if (!openEnds || bands.length === 0) return;
    if (!bands[0].openLow) problems.push(problem(path, 'The first band is not open at the low end.'));
    if (!bands[bands.length - 1].openHigh) problems.push(problem(path, 'The last band is not open at the high end.'));
}

function coverRange(ranges: readonly (readonly [number, number])[], low: number, high: number, path: string, problems: TableProblem[]): void {
    const seen = new Map<number, number>();
    for (const [from, to] of ranges) {
        if (to < from) {
            problems.push(problem(path, `The range ${from} to ${to} runs backwards.`));
            continue;
        }
        for (let n = from; n <= to; n++) seen.set(n, (seen.get(n) ?? 0) + 1);
    }
    for (let n = low; n <= high; n++) {
        const count = seen.get(n) ?? 0;
        if (count === 0) problems.push(problem(path, `${n} is not covered.`));
        if (count > 1) problems.push(problem(path, `${n} is covered more than once.`));
    }
}

function d66Once(rolls: string[], path: string, problems: TableProblem[]): void {
    const counts = new Map<string, number>();
    for (const roll of rolls) counts.set(roll, (counts.get(roll) ?? 0) + 1);
    for (let tens = 1; tens <= 6; tens++) {
        for (let units = 1; units <= 6; units++) {
            const roll = String(tens) + String(units);
            const count = counts.get(roll) ?? 0;
            if (count !== 1) problems.push(problem(path, `${roll} is present ${count} times.`));
            counts.delete(roll);
        }
    }
    for (const extra of counts.keys()) problems.push(problem(path, `${extra} is not a D66 result.`));
}

function money(value: unknown, path: string, problems: TableProblem[]): void {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        problems.push(problem(path, 'A price or percent is a finite number, 0 or more.'));
    }
}

function integerDm(value: unknown, path: string, problems: TableProblem[]): void {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
        problems.push(problem(path, 'A DM is an integer.'));
    }
}

function diceField(value: unknown, path: string, problems: TableProblem[]): void {
    if (typeof value !== 'string' || !printedDice(value)) {
        problems.push(problem(path, 'That dice string is not one the roller reads.'));
    }
}

function dmRecord(value: unknown, path: string, problems: TableProblem[]): void {
    if (value == null) return;
    const row = asRecord(value);
    if (!row) {
        problems.push(problem(path, 'Purchase and sale DMs are a map of names to integers.'));
        return;
    }
    for (const [name, dm] of Object.entries(row)) {
        if (name.startsWith('_')) continue;
        integerDm(dm, `${path}.${name}`, problems);
    }
}

function validatePassenger(tables: z.infer<typeof RandomPassengerTables>, problems: TableProblem[]): void {
    if (tables.dice !== 'D66') problems.push(problem('tables.dice', 'Random passengers are rolled on D66.'));
    const rolls: string[] = [];
    tables.entries.forEach((entry, index) => {
        const path = `tables.entries[${index}]`;
        rolls.push(entry.roll);
        if (entry.text.trim() === '') problems.push(problem(`${path}.text`, 'The text is empty.'));
        if (entry.sub) {
            const spec = entry.sub.dice;
            diceField(spec, `${path}.sub.dice`, problems);
            const span = spec === '1D' ? [1, 6] : spec === '1D-1' ? [0, 5] : null;
            if (span) {
                coverRange(entry.sub.outcomes.map((outcome) => outcome.range), span[0], span[1], `${path}.sub.outcomes`, problems);
            }
            entry.sub.outcomes.forEach((outcome, at) => {
                if (outcome.text.trim() === '') problems.push(problem(`${path}.sub.outcomes[${at}].text`, 'The text is empty.'));
            });
        }
        entry.skills?.forEach((skill, at) => {
            if (skill.name.trim() === '') problems.push(problem(`${path}.skills[${at}].name`, 'The skill name is empty.'));
            diceField(skill.dice, `${path}.skills[${at}].dice`, problems);
        });
    });
    d66Once(rolls, 'tables.entries', problems);
}

function rowList(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) return [];
    return value.map((item) => asRecord(item)).filter((item): item is Record<string, unknown> => item !== null);
}

function validateTrade(tables: z.infer<typeof TradeTables>, problems: TableProblem[]): void {
    diceField(tables.passengers.traffic.roll, 'tables.passengers.traffic.roll', problems);
    diceField(tables.freight.traffic.roll, 'tables.freight.traffic.roll', problems);
    diceField(tables.purchase.roll, 'tables.purchase.roll', problems);
    diceField(tables.sale.roll, 'tables.sale.roll', problems);

    const passengerBands = rowList(tables.passengers.traffic.table).map((row, index) => {
        const path = `tables.passengers.traffic.table[${index}]`;
        if (typeof row.roll !== 'string') problems.push(problem(`${path}.roll`, 'A traffic row needs a result.'));
        diceField(row.dice, `${path}.dice`, problems);
        return typeof row.roll === 'string' ? row.roll : '';
    });
    coverBands(passengerBands.filter((label) => label !== ''), 'tables.passengers.traffic.table', problems, true);

    const freightBands = rowList(tables.freight.traffic.table).map((row, index) => {
        const path = `tables.freight.traffic.table[${index}]`;
        if (typeof row.roll !== 'string') problems.push(problem(`${path}.roll`, 'A traffic row needs a result.'));
        diceField(row.dice, `${path}.dice`, problems);
        return typeof row.roll === 'string' ? row.roll : '';
    });
    coverBands(freightBands.filter((label) => label !== ''), 'tables.freight.traffic.table', problems, true);

    rowList(tables.freight.lots).forEach((lot, index) => {
        diceField(lot.tons, `tables.freight.lots[${index}].tons`, problems);
    });

    const parsecs: number[] = [];
    rowList(tables.fares.rows).forEach((row, index) => {
        const path = `tables.fares.rows[${index}]`;
        if (typeof row.parsecs === 'number' && Number.isInteger(row.parsecs)) parsecs.push(row.parsecs);
        else problems.push(problem(`${path}.parsecs`, 'A fare row needs an integer parsec.'));
        for (const key of ['high', 'middle', 'basic', 'low', 'freightPerTon']) money(row[key], `${path}.${key}`, problems);
    });
    parsecs.sort((a, b) => a - b);
    parsecs.forEach((value, index) => {
        if (value !== index + 1) problems.push(problem('tables.fares.rows', `Parsec ${index + 1} is missing.`));
    });

    const goods = rowList(tables.goods.table);
    const rolls: string[] = [];
    goods.forEach((row, index) => {
        const path = `tables.goods.table[${index}]`;
        if (typeof row.d66 === 'string') rolls.push(row.d66);
        else problems.push(problem(`${path}.d66`, 'A goods row needs a D66 result.'));
        if (row.tons != null) diceField(row.tons, `${path}.tons`, problems);
        if (row.basePrice != null) money(row.basePrice, `${path}.basePrice`, problems);
        dmRecord(row.purchaseDM, `${path}.purchaseDM`, problems);
        dmRecord(row.saleDM, `${path}.saleDM`, problems);
    });
    d66Once(rolls, 'tables.goods.table', problems);

    const prices = rowList(tables.modifiedPrice.rows);
    const results: string[] = [];
    prices.forEach((row, index) => {
        const path = `tables.modifiedPrice.rows[${index}]`;
        if (typeof row.result === 'string') results.push(row.result);
        else problems.push(problem(`${path}.result`, 'A price row needs a result.'));
        money(row.purchasePercent, `${path}.purchasePercent`, problems);
        money(row.salePercent, `${path}.salePercent`, problems);
    });
    coverBands(results, 'tables.modifiedPrice.rows', problems, true);

    const supplier = asRecord(tables.supplier);
    const checks = supplier ? rowList(supplier.checks) : [];
    checks.forEach((check, index) => {
        if (typeof check.time === 'string') diceField(check.time, `tables.supplier.checks[${index}].time`, problems);
    });
}

function zodProblems(error: z.ZodError): TableProblem[] {
    return error.issues.map((issue) => problem(issue.path.join('.'), issue.message));
}

export function validateTableSet(value: unknown): TableCheck {
    const problems: TableProblem[] = [];
    let encoded = '';
    try {
        encoded = JSON.stringify(value);
    } catch {
        encoded = '';
    }
    if (encoded.length > TABLE_SET_BYTES) {
        problems.push(problem('', 'A table set is at most 256 KB.'));
        return { ok: false, problems, set: null };
    }
    const raw = asRecord(value);
    if (raw && typeof raw.kind === 'string' && !TableKind.safeParse(raw.kind).success) {
        problems.push(problem('kind', 'This app has no roller for that table.'));
        return { ok: false, problems, set: null };
    }
    const envelope = TableSet.safeParse(value);
    if (!envelope.success) {
        problems.push(...zodProblems(envelope.error));
        return { ok: false, problems, set: null };
    }
    const kind = TABLE_KINDS[envelope.data.kind];
    const tables = kind.schema.safeParse(envelope.data.tables);
    if (!tables.success) {
        problems.push(...zodProblems(tables.error).map((item) => problem(item.path ? `tables.${item.path}` : 'tables', item.words)));
        return { ok: false, problems, set: envelope.data };
    }
    if (envelope.data.kind === 'randomPassenger') validatePassenger(tables.data as z.infer<typeof RandomPassengerTables>, problems);
    else validateTrade(tables.data as z.infer<typeof TradeTables>, problems);
    return { ok: problems.length === 0, problems, set: envelope.data };
}
