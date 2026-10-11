/**
 * MgT2E orbit distances for the hand picker.
 * Copied from rules/mgt2e_data.js stellar.orbitAu (lines 394 to 396).
 * The same array is packages/engines/src/core/constants.js MGT2E_ORBIT_AU (lines 125 to 127).
 * This file imports nothing. The browser must not import the engines.
 */
export const MGT2E_ORBIT_AU: readonly number[] = [
    0, 0.4, 0.7, 1.0, 1.6, 2.8, 5.2, 10, 20, 40, 77, 154, 308, 615, 1230, 2500, 4900, 9800, 19500, 39500, 78700,
];

/**
 * Orbit number to AU.
 * packages/engines/src/mgt2e_stellar_engine.js lines 1817 to 1825.
 * An orbit number below 0 has no table entry and returns NaN.
 */
export function mgt2eOrbitToAu(orbitId: number): number {
    const auInt = Math.floor(orbitId);
    const auFrac = orbitId - auInt;
    const table = MGT2E_ORBIT_AU;
    const maxIdx = table.length - 1;
    const limitIdx = Math.min(auInt, maxIdx);
    const auTarget = table[limitIdx];
    if (auTarget === undefined) return Number.NaN;
    const next = table[limitIdx + 1];
    const auDiff = limitIdx < maxIdx && next !== undefined ? next - auTarget : auTarget;
    return auTarget + (auFrac * auDiff);
}

/**
 * AU to orbit number.
 * packages/engines/src/mgt2e_stellar_engine.js convertAuToOrbit, lines 189 to 197.
 * An AU outside the table returns 20.
 */
export function mgt2eAuToOrbit(au: number): number {
    const table = MGT2E_ORBIT_AU;
    for (let i = 0; i < table.length - 1; i++) {
        const lo = table[i];
        const hi = table[i + 1];
        if (lo === undefined || hi === undefined) continue;
        if (au >= lo && au < hi) return i + (au - lo) / (hi - lo);
    }
    return 20;
}
