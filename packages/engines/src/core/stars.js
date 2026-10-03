import { hashString, masterSeed, mulberry32 } from './rng.js';

/**
 * Place Close / Near / Far orbits on parsed stars.
 * Dice match the legacy homestar slots (Close: 1D-1, Near: 5+1D, Far: 11+1D).
 * The draws come from a local rng, so the engine stream is unchanged.
 */
export function placeCompanionOrbits(stars, hexKey) {
    if (!stars || !stars.length) return stars;
    const local = mulberry32(hashString(masterSeed + '-' + (hexKey || '0000') + '-stars'));
    const roll1D = () => Math.floor(local() * 6) + 1;
    for (const star of stars) {
        if (!star) continue;
        if (star.role === 'Close') star.orbitID = roll1D() - 1;
        else if (star.role === 'Near') star.orbitID = 5 + roll1D();
        else if (star.role === 'Far') star.orbitID = 11 + roll1D();
    }
    return stars;
}
