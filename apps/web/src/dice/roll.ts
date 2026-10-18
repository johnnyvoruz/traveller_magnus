/**
 * Six-sided dice only. A roll is 1, 2 or 3 dice.
 * Boon and Bane, Johnny, 2026-10-17 15:15 (directives/streams/A.md):
 * "Boon rolls 3D keeps best two, bane keeps worst two."
 * With either on, three dice are thrown and one is dropped.
 * D66, assets/dice_conventions.txt lines 29 to 34: two dice, the first the
 * tens and the second the units, a number from 11 to 66. That text gives
 * D66 no DM.
 * A DM, lines 14 to 18: add or subtract the number shown to the total rolled.
 * D3, lines 19 to 26: divide the face by two and round up. 2D3 does that
 * to each die, then adds them.
 */

export type DiceCount = 1 | 2 | 3;

export type RollMode = 'plain' | 'boon' | 'bane' | 'd66' | 'd3' | '2d3';

export type KeepMode = 'plain' | 'boon' | 'bane';

export type Rolled = {
    mode: RollMode;
    dice: number[];
    /** Parallel to dice. A dropped die is false. */
    kept: boolean[];
    /** The dice total, before a DM. D66 is the two-digit number. */
    total: number;
    /** Added to total except on D66. Zero when the roll has no DM. */
    dm: number;
};

/** One face, from 1 to 6, using crypto.getRandomValues. */
export function cryptoFace(): number {
    const sides = 6;
    const span = 0x100000000;
    const limit = span - (span % sides);
    const buf = new Uint32Array(1);
    let value = limit;
    while (value >= limit) {
        crypto.getRandomValues(buf);
        value = buf[0] ?? limit;
    }
    return (value % sides) + 1;
}

function sumKept(dice: readonly number[], kept: readonly boolean[]): number {
    return dice.reduce((sum, face, index) => sum + (kept[index] ? face : 0), 0);
}

/**
 * Throws the dice. Plain adds every face. Boon drops the lowest. Bane drops the highest.
 * A tie drops the earliest of the tied faces for Boon, and the latest for Bane.
 */
export function rollSix(count: DiceCount, mode: KeepMode, face: () => number = cryptoFace): Rolled {
    const thrown = mode === 'plain' ? count : 3;
    const dice: number[] = [];
    for (let i = 0; i < thrown; i++) dice.push(face());
    if (mode === 'plain') {
        const kept = dice.map(() => true);
        return { mode, dice, kept, total: sumKept(dice, kept), dm: 0 };
    }
    const order = dice.map((value, index) => ({ value, index }));
    order.sort((a, b) => a.value - b.value || a.index - b.index);
    const drop = mode === 'boon' ? order[0].index : order[order.length - 1].index;
    const kept = dice.map((_, index) => index !== drop);
    return { mode, dice, kept, total: sumKept(dice, kept), dm: 0 };
}

/** assets/dice_conventions.txt lines 19 to 23: 1–2 is 1, 3–4 is 2, 5–6 is 3. */
export function d3Face(face: number): number {
    return Math.ceil(face / 2);
}

/** D66. The first face is the tens digit. assets/dice_conventions.txt lines 29 to 34. */
export function rollD66(face: () => number = cryptoFace): Rolled {
    const tens = face();
    const units = face();
    return { mode: 'd66', dice: [tens, units], kept: [true, true], total: tens * 10 + units, dm: 0 };
}

/** One die (D3) or two (2D3). The total is the sum of the halved faces. */
export function rollD3(count: 1 | 2, face: () => number = cryptoFace): Rolled {
    const dice: number[] = [];
    for (let i = 0; i < count; i++) dice.push(face());
    const total = dice.reduce((sum, value) => sum + d3Face(value), 0);
    return { mode: count === 1 ? 'd3' : '2d3', dice, kept: dice.map(() => true), total, dm: 0 };
}
