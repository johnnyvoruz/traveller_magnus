/**
 * Display rules copied from the legacy default filters (filter_engine.js:44-62)
 * and the base / gas-giant reads the chart uses. A '?' in a character a rule
 * reads makes that rule false. Nothing here gives a code a Traveller meaning.
 */

const WATER_ATM = '23456789DE';
const WATER_HYDRO = '123456789A';

/** Size character is 0. Decides the shape. */
export function worldIsBelt(uwp: string): boolean {
    const size = uwp.length > 1 ? uwp.charAt(1) : '';
    if (size === '' || size === '?') return false;
    return size === '0';
}

/** Atmosphere and hydrographics characters of the default wet-world rule. Decides the colour. */
export function worldHasWater(uwp: string): boolean {
    const atm = uwp.length > 2 ? uwp.charAt(2) : '';
    const hydro = uwp.length > 3 ? uwp.charAt(3) : '';
    if (atm === '' || hydro === '' || atm === '?' || hydro === '?') return false;
    return WATER_ATM.includes(atm) && WATER_HYDRO.includes(hydro);
}

/** uwp[0] as written. */
export function starport(uwp: string): string {
    return uwp.length > 0 ? uwp.charAt(0) : '';
}

/** Third PBG character is 1-9 or a letter. */
export function hasGasGiant(pbg: string): boolean {
    const ch = pbg.length > 2 ? pbg.charAt(2) : '';
    if (ch === '' || ch === '?') return false;
    if (ch >= '1' && ch <= '9') return true;
    return (ch >= 'A' && ch <= 'Z') || (ch >= 'a' && ch <= 'z');
}

/**
 * Naval when the string contains N, scout when it contains S.
 * text is the whole string when any character is neither N nor S.
 */
export function baseMarks(bases: string): { naval: boolean; scout: boolean; text: string } {
    let other = false;
    for (let i = 0; i < bases.length; i++) {
        const ch = bases.charAt(i);
        if (ch !== 'N' && ch !== 'S') {
            other = true;
            break;
        }
    }
    return {
        naval: bases.includes('N'),
        scout: bases.includes('S'),
        text: other ? bases : '',
    };
}
