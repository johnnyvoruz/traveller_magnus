/**
 * A random passenger (Epic T, step T3b). Pure.
 * The published table is the generated wrapper of rules/mgt2e_random_passenger.json.
 * usePassengerTable is the one place a chosen table replaces it. This file is the
 * only import of that wrapper.
 * The table's dice field is D66. The backlog step reads that as two six-sided dice,
 * tens and units, which is how the entries are numbered. A sub-roll and a skill
 * use the code written on that entry: "1D" or "1D-1". No other code is read.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import published from '../../../../packages/engines/src/generated/rules/mgt2e_random_passenger.js';
import { validateTableSet, type TableSetData } from '@voyage/shared';
import { cryptoFace } from '../dice/roll.ts';

export type PassengerOutcome = {
    range: readonly [number, number];
    text: string;
};

export type PassengerEntry = {
    roll: string;
    text: string;
    sub?: {
        dice: string;
        outcomes: readonly PassengerOutcome[];
    };
    skills?: readonly { name: string; dice: string }[];
};

/** The shape a later chosen table must have. The published file is one of these. */
export type PassengerTable = {
    dice: string;
    entries: readonly PassengerEntry[];
};

export type RolledSkill = { name: string; level: number };

export type RolledPassenger = {
    roll: string;
    text: string;
    subText?: string;
    skills?: RolledSkill[];
    dice: number[];
};

let table = published as PassengerTable;

/** The table rollPassenger reads. A caller replaces it; nothing else imports the wrapper. */
export function passengerTable(): PassengerTable {
    return table;
}

/**
 * Installs the table rollPassenger reads.
 * Null, or a set that fails its checks, is the official file.
 * A bare table (the one-row stand-in the tests use) is installed as given.
 */
export function usePassengerTable(next: PassengerTable | TableSetData | null): void {
    if (next == null) {
        table = published as PassengerTable;
        return;
    }
    if ('schemaVersion' in next) {
        const checked = validateTableSet(next);
        if (checked.ok && checked.set?.kind === 'randomPassenger') table = checked.set.tables as PassengerTable;
        else table = published as PassengerTable;
        return;
    }
    table = next;
}

function rollSpec(spec: string, face: () => number, dice: number[]): number | null {
    if (spec === '1D') {
        const rolled = face();
        dice.push(rolled);
        return rolled;
    }
    if (spec === '1D-1') {
        const rolled = face();
        dice.push(rolled);
        return rolled - 1;
    }
    return null;
}

/**
 * One passenger from the current table, or from a table passed for this roll.
 * A function as the first argument is the face source, which is how existing callers roll.
 * Null when the table is not D66, or the two dice are not one of its entries.
 */
export function rollPassenger(tableOrFace?: PassengerTable | (() => number), face: () => number = cryptoFace): RolledPassenger | null {
    const passed = tableOrFace != null && typeof tableOrFace !== 'function';
    const current = passed ? tableOrFace : passengerTable();
    const rollFace = typeof tableOrFace === 'function' ? tableOrFace : face;
    if (current.dice !== 'D66') return null;
    const dice: number[] = [];
    const tens = rollFace();
    const units = rollFace();
    dice.push(tens, units);
    const roll = String(tens) + String(units);
    const entry = current.entries.find((row) => row.roll === roll);
    if (!entry) return null;
    const result: RolledPassenger = { roll, text: entry.text, dice };
    if (entry.sub) {
        const rolled = rollSpec(entry.sub.dice, rollFace, dice);
        const hit = rolled == null ? undefined : entry.sub.outcomes.find((outcome) => rolled >= outcome.range[0] && rolled <= outcome.range[1]);
        if (hit) result.subText = hit.text;
    }
    if (entry.skills && entry.skills.length > 0) {
        const skills: RolledSkill[] = [];
        for (const skill of entry.skills) {
            const level = rollSpec(skill.dice, rollFace, dice);
            if (level == null) continue;
            skills.push({ name: skill.name, level });
        }
        if (skills.length > 0) result.skills = skills;
    }
    return result;
}
