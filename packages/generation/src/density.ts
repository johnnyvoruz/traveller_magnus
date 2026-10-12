/**
 * Whether a generate request writes a system in one hex.
 * `buildSector` does not do this: it builds rows that are already `SYSTEM_PRESENT`.
 * The roll is the legacy `autoPopulate` (`js/macro_orchestrator.js` 534 to 536):
 * `setRandomSeed(universeSeed)`, `reseedForHex(hexKey)`, `roll1D()`, keep when the
 * roll is at or under the chance. The chances are `js/ui_menus.js` 66 to 68.
 * `generateHex` then seeds from `generationSeed`, so this roll is not that seed.
 */
import { masterSeed, reseedForHex, roll1D, setRandomSeed } from '@voyage/engines';
import type { GenerateDensity } from '@voyage/shared';

const CHANCE = { sparse: 2, standard: 3, dense: 4 } as const;

export function rollHoldsSystem(universeSeed: string, hexKey: string, chanceOutOfSix: number): boolean {
    const previous = masterSeed;
    setRandomSeed(universeSeed);
    reseedForHex(hexKey);
    const roll = roll1D();
    setRandomSeed(previous);
    return roll <= chanceOutOfSix;
}

export function densityKeeps(input: {
    universeSeed: string;
    hexKey: string;
    density: GenerateDensity;
    alone: boolean;
    holds: boolean;
    filledToo: boolean;
}): 'write' | 'skip' | 'empty' {
    if (input.holds && !input.filledToo) return 'skip';
    if (input.holds || input.alone || input.density === 'every') return 'write';
    const chance = CHANCE[input.density];
    return rollHoldsSystem(input.universeSeed, input.hexKey, chance) ? 'write' : 'empty';
}
