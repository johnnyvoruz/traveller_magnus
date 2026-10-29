/**
 * "Roll dice" in the command palette, and on R when no other command has that key.
 * The line that calls offerDice is in shell/registry.ts. The last 20 rolls stay here
 * for the page, not stored. Boon and Bane follow Johnny, 2026-10-17 15:15
 * (directives/streams/A.md): "Boon rolls 3D keeps best two, bane keeps worst two."
 *
 * Dice at the table (streams/D.md DU8; backlog U8): a roll may come from a box on the character
 * sheet. It is 2D with the DM that box says, and the roll keeps the box's name. Nothing is read
 * into it: no target number, no effect (campaign_manager_plan.md §10 Q6: plain dice, no
 * interpretation). Roll again throws the last roll's dice once more.
 */
import { reactive } from 'vue';
import type { Command } from '../shell/registry.ts';
import { cryptoFace, roll3dd, rollD3, rollD66, rollSix, type DiceCount, type RollMode, type Rolled } from './roll.ts';

const KEPT = 20;
/** The strip shows the last eight. */
export const HISTORY = 8;
/** assets/dice_conventions.txt lines 14 to 18 give the DM; the roller's range is −6 to +6. */
const DM_RANGE = 6;

export type KeptRoll = Rolled & {
    id: number;
    /** The box this roll came from ("Strength", "Pilot (spacecraft)"); null for a roll from the roller. */
    from: string | null;
};

let nextId = 1;

export const diceAsk = reactive({
    count: 2 as DiceCount,
    mode: 'plain' as RollMode,
    /** assets/dice_conventions.txt lines 14 to 18. Presentation range is −6 to +6. */
    dm: 0,
    rolls: [] as KeptRoll[],
    /** Bumps on every roll so the tray can play it. */
    played: 0,
    /** The palette roller. Count, Boon and Bane, signed in or out. */
    open: false,
});

export function clearRolls(): void {
    diceAsk.rolls.splice(0);
    diceAsk.count = 2;
    diceAsk.mode = 'plain';
    diceAsk.dm = 0;
    diceAsk.played = 0;
    diceAsk.open = false;
}

/** Shows the count, Boon and Bane buttons. The palette uses this signed out. */
export function openRoller(): void {
    diceAsk.open = true;
}

export function closeRoller(): void {
    diceAsk.open = false;
}

function withDm(rolled: Rolled): Rolled {
    if (rolled.mode === 'd66' || rolled.mode === '3dd') return rolled;
    return { ...rolled, dm: diceAsk.dm };
}

function keep(rolled: Rolled, from: string | null = null): Rolled {
    diceAsk.rolls.unshift({ ...rolled, kept: [...rolled.kept], dice: [...rolled.dice], id: nextId, from });
    nextId += 1;
    if (diceAsk.rolls.length > KEPT) diceAsk.rolls.pop();
    diceAsk.played += 1;
    return rolled;
}

/** Rolls the count and mode currently chosen. D66 reads tens then units. */
export function makeRoll(face: () => number = cryptoFace): Rolled {
    if (diceAsk.mode === 'd66') return keep(rollD66(face));
    if (diceAsk.mode === '3dd') return keep(roll3dd(face));
    if (diceAsk.mode === 'd3') return keep(withDm(rollD3(1, face)));
    if (diceAsk.mode === '2d3') return keep(withDm(rollD3(2, face)));
    return keep(withDm(rollSix(diceAsk.count, diceAsk.mode, face)));
}

/**
 * A count button. While Boon or Bane is on, 1D and 3D do nothing and 2D throws
 * three dice kept to two. Orchestrator 15:30: the toggle is a setting, and 2D stays the throw.
 */
export function rollCount(count: DiceCount, face: () => number = cryptoFace): void {
    if (diceAsk.mode === 'boon' || diceAsk.mode === 'bane') {
        if (count !== 2) return;
        makeRoll(face);
        return;
    }
    diceAsk.mode = 'plain';
    diceAsk.count = count;
    makeRoll(face);
}

/** The D66 pick. It rolls at once and turns Boon and Bane off. No DM. */
export function rollD66Pick(face: () => number = cryptoFace): void {
    diceAsk.mode = 'd66';
    keep(rollD66(face));
}

/** 3DD. Three dice times ten. It rolls at once. No DM, no Boon, no Bane. */
export function roll3ddPick(face: () => number = cryptoFace): void {
    diceAsk.mode = '3dd';
    keep(roll3dd(face));
}

/** D3 or 2D3. It rolls at once. assets/dice_conventions.txt lines 19 to 26. */
export function rollD3Pick(count: 1 | 2, face: () => number = cryptoFace): void {
    diceAsk.mode = count === 1 ? 'd3' : '2d3';
    keep(withDm(rollD3(count, face)));
}

/** The DM stepper. It does not roll. Stops at −6 and +6. */
export function stepDm(delta: number): void {
    const next = diceAsk.dm + delta;
    if (next < -6 || next > 6) return;
    diceAsk.dm = next;
}

/** Boon and Bane. Turning one on turns the other off. It does not roll. */
export function setMode(mode: 'boon' | 'bane'): void {
    diceAsk.mode = diceAsk.mode === mode ? 'plain' : mode;
    if (diceAsk.mode !== 'plain') diceAsk.count = 2;
}

/** Palette Boon or Bane. Turns that one on. It does not toggle and it does not roll. */
export function chooseMode(mode: 'boon' | 'bane'): void {
    diceAsk.mode = mode;
    diceAsk.count = 2;
}

/** The last eight rolls, newest first: the strip. */
export function recentRolls(): KeptRoll[] {
    return diceAsk.rolls.slice(0, HISTORY);
}

/**
 * A DM as a box on the sheet holds it: "+1", "-2", "0", "2", with spaces around. Anything else
 * (empty, "1/2", a word) is null: the roll then takes no DM. The sheet stores text and computes
 * nothing; this reads a number the person typed and nothing more.
 */
export function parseDm(text: string | boolean | null | undefined): number | null {
    if (typeof text !== 'string') return null;
    const found = /^\s*([+\-−]?)\s*(\d{1,2})\s*$/.exec(text);
    if (!found) return null;
    const value = Number(found[2]);
    return found[1] === '-' || found[1] === '−' ? -value : value;
}

/**
 * A roll from a box on the sheet: 2D, the DM that box says (within the roller's range, else 0),
 * the box's name on the roll. The roller opens on it. It interprets nothing (Q6).
 */
export function rollFrom(from: string, dm: number | null, face: () => number = cryptoFace): Rolled {
    openRoller();
    diceAsk.mode = 'plain';
    diceAsk.count = 2;
    diceAsk.dm = dm !== null && Math.abs(dm) <= DM_RANGE ? dm : 0;
    const name = from.replace(/\s+/g, ' ').trim();
    return keep(withDm(rollSix(2, 'plain', face)), name || null);
}

/** Throws the last roll's dice once more: the same count, mode, DM and origin. Null when nothing has been rolled. */
export function rollAgain(face: () => number = cryptoFace): Rolled | null {
    const last = diceAsk.rolls[0];
    if (!last) return null;
    diceAsk.mode = last.mode;
    if (last.mode !== 'd66' && last.mode !== '3dd') diceAsk.dm = last.dm;
    if (last.mode === 'd66') return keep(rollD66(face), last.from);
    if (last.mode === '3dd') return keep(roll3dd(face), last.from);
    if (last.mode === 'd3') return keep(withDm(rollD3(1, face)), last.from);
    if (last.mode === '2d3') return keep(withDm(rollD3(2, face)), last.from);
    const count = (last.mode === 'plain' ? last.dice.length : 2) as DiceCount;
    diceAsk.count = count;
    return keep(withDm(rollSix(count, last.mode, face)), last.from);
}

/** One roll in a few characters: "2D+1 = 9", "Boon 8", "D66 34", "3DD 120", "2D3 4". */
export function rollLine(roll: Rolled): string {
    if (roll.mode === 'd66') return 'D66 ' + roll.total;
    if (roll.mode === '3dd') return '3DD ' + roll.total;
    const name = roll.mode === 'boon' ? 'Boon' : roll.mode === 'bane' ? 'Bane' : roll.mode === 'd3' ? 'D3' : roll.mode === '2d3' ? '2D3' : roll.dice.length + 'D';
    if (roll.dm === 0) return name + ' ' + roll.total;
    const sign = roll.dm > 0 ? '+' : '−';
    return name + sign + Math.abs(roll.dm) + ' = ' + (roll.total + roll.dm);
}

/** The palette and the R key: 2D at once, or Boon or Bane when that toggle is on. */
export function rollDefault(face: () => number = cryptoFace): void {
    if (diceAsk.mode === 'd66' || diceAsk.mode === 'd3' || diceAsk.mode === '2d3' || diceAsk.mode === '3dd') diceAsk.mode = 'plain';
    if (diceAsk.mode === 'plain') diceAsk.count = 2;
    makeRoll(face);
}

export function offerDice(register: (command: Command) => () => void, rTaken: () => boolean = () => false): () => void {
    const drop: Array<() => void> = [];
    drop.push(register({
        id: 'roll-dice',
        name: 'Roll dice',
        keys: ['r'],
        runnable: () => !rTaken(),
        run: () => {
            openRoller();
            rollDefault();
        },
    }));
    drop.push(register({
        id: 'dice-boon',
        name: 'Boon',
        runnable: () => true,
        run: () => {
            openRoller();
            chooseMode('boon');
            makeRoll();
        },
    }));
    drop.push(register({
        id: 'dice-bane',
        name: 'Bane',
        runnable: () => true,
        run: () => {
            openRoller();
            chooseMode('bane');
            makeRoll();
        },
    }));
    drop.push(register({
        id: 'dice-d3',
        name: 'Roll D3',
        runnable: () => true,
        run: () => {
            openRoller();
            rollD3Pick(1);
        },
    }));
    drop.push(register({
        id: 'dice-2d3',
        name: 'Roll 2D3',
        runnable: () => true,
        run: () => {
            openRoller();
            rollD3Pick(2);
        },
    }));
    drop.push(register({
        id: 'dice-3dd',
        name: 'Roll 3DD',
        runnable: () => true,
        run: () => {
            openRoller();
            roll3ddPick();
        },
    }));
    drop.push(register({
        id: 'dice-d66',
        name: 'Roll D66',
        runnable: () => true,
        run: () => {
            openRoller();
            rollD66Pick();
        },
    }));
    return () => {
        for (const undo of drop) undo();
    };
}
