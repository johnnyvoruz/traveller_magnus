/**
 * Orrery maths copied from js/system_viewer.js. Each function names its
 * legacy line range. A function that read closed-over viewer state takes
 * that state as an argument (linearScale). Nothing else in the formula changes.
 */
import { ORBIT_AU } from './orbit_au.ts';

/** js/system_viewer.js:140 */
const SUN_DIAM_KM = 1392700;
/** js/system_viewer.js:144 */
const SOL_RADIUS_PX = 34;
/** js/system_viewer.js:145 */
const SIZE_EXP = 0.42;

/** js/system_viewer.js:179-182. Non-positive diamKm returns null. */
export function pxFromDiamKm(diamKm: number | null | undefined): number | null {
    if (diamKm == null || !(diamKm > 0)) return null;
    return SOL_RADIUS_PX * Math.pow(diamKm / SUN_DIAM_KM, SIZE_EXP);
}

/** js/system_viewer.js:185-199. Clamp 4..58. */
export function starBasePx(s: { diam?: number | null; sClass?: string | null; sType?: string | null } | null | undefined): number {
    const solar = s && typeof s.diam === 'number' && s.diam > 0 ? s.diam : 0;
    const fromDiam = pxFromDiamKm(solar === 0 ? 0 : solar * SUN_DIAM_KM);
    let r = fromDiam;
    if (r == null) {
        const cls = (s && s.sClass) || 'V';
        r = 28;
        if (cls === 'Ia' || cls === 'Ib') r = 52;
        else if (cls === 'II' || cls === 'III') r = 40;
        else if (cls === 'IV') r = 32;
        else if (s && s.sType === 'BD') r = 12;
        else if (s && s.sType === 'D') r = 8;
        else if (s && s.sType === 'M') r = 18;
        else if (s && s.sType === 'K') r = 22;
    }
    return Math.max(4, Math.min(58, r));
}

/** js/system_viewer.js:202-213. Clamp 2.4..22. */
export function worldBasePx(w: { diamKm?: number | null; type?: string | null; ggType?: string | null; worldType?: string | null } | null | undefined): number {
    let r = pxFromDiamKm(w && w.diamKm);
    if (r == null) {
        r = 4.5;
        if (w && w.type === 'Gas Giant') {
            if (w.ggType === 'GL') r = 14;
            else if (w.ggType === 'GM') r = 10;
            else r = 8;
        } else if (w && w.type === 'Mainworld') r = 6;
        else if (w && w.worldType === 'Worldlet') r = 3;
    }
    return Math.max(2.4, Math.min(22, r));
}

/** js/system_viewer.js:216-220. Clamp 2..10. */
export function moonBasePx(m: { diamKm?: number | null; type?: string | null } | null | undefined): number {
    const isMainworld = m && m.type === 'Mainworld';
    let r = pxFromDiamKm(m && m.diamKm);
    if (r == null) r = isMainworld ? 4.2 : 2.6;
    return Math.max(2, Math.min(10, r));
}

/**
 * js/system_viewer.js:304-312.
 * The table is ORBIT_AU. The legacy fallback (148-150) is not used. The
 * viewer does not read the page's MgT2EData global.
 */
export function orbitToAU(orbitId: number): number {
    const tbl = ORBIT_AU;
    const idx = Math.floor(orbitId);
    const frac = orbitId - idx;
    const max = tbl.length - 1;
    const lo = tbl[Math.min(idx, max)];
    const hi = idx < max ? tbl[idx + 1] : lo;
    return lo + frac * (hi - lo);
}

/** js/system_viewer.js:317-320. */
export function starCompanionAU(s: { orbitAU?: number | null; orbitId?: number | null }): number {
    return (s.orbitAU !== undefined && s.orbitAU !== null)
        ? s.orbitAU
        : orbitToAU(s.orbitId || 0.5);
}

/**
 * js/system_viewer.js:325-328.
 * linearScale is the closed-over _linearScale flag, passed in by the caller.
 */
export function unitT(au: number, maxAU: number, linearScale: boolean): number {
    if (!(au > 0) || !(maxAU > 0)) return 0;
    if (linearScale) return Math.min(1, au / maxAU);
    return Math.log(1 + au) / Math.log(1 + maxAU);
}

/** js/system_viewer.js:334-339. linearScale is forwarded to unitT. */
export function scaleR(au: number, maxAU: number, maxPx: number, holePx: number, linearScale: boolean): number {
    const hole = Math.max(0, holePx || 0);
    const outer = Math.max(maxPx || 0, hole > 0 ? hole / 0.58 : 0);
    const span = outer - hole;
    if (span <= 0) return hole;
    return hole + span * unitT(au, maxAU, linearScale);
}

/**
 * js/system_viewer.js:355-366. FNV-1a then the MurmurHash3 finalizer.
 * Callers pass the new hex key (`Spinward_Marches/1910`) where the legacy
 * code used its hex id (`_hexId + ':star:'`, 2862; worlds 3186; moons 4579).
 * Positions therefore differ from the legacy app for the same world. That is
 * the same recorded deviation as the generation seeds (slice_0_foundation.md,
 * deviations table).
 */
export function hashEpoch(key: string): number {
    let h = 2166136261;
    for (let i = 0; i < key.length; i++) {
        h ^= key.charCodeAt(i);
        h = Math.imul(h, 16777619) >>> 0;
    }
    h ^= h >>> 16;
    h = Math.imul(h, 0x85ebca6b) >>> 0;
    h ^= h >>> 13;
    h = Math.imul(h, 0xc2b2ae35) >>> 0;
    h ^= h >>> 16;
    return (h / 0x100000000) * 2 * Math.PI;
}

/** js/system_viewer.js:372-374. Kepler's third law, years. au <= 0 or starMass <= 0 returns 1. */
export function keplerYears(au: number, starMass: number): number {
    if (au <= 0 || starMass <= 0) return 1;
    return Math.sqrt(Math.pow(au, 3) / starMass);
}

/** js/system_viewer.js:378-380. */
export function worldPeriodYears(w: { periodYears?: number | null; au?: number | null }, starMass: number): number {
    if (w.periodYears && w.periodYears > 0) return w.periodYears;
    return keplerYears(w.au || 1, starMass || 1);
}

/** js/system_viewer.js:385-394. periodHrs wins when it is > 0. */
export function moonPeriodYears(
    m: { periodHrs?: number | null; pd?: number | null },
    parentWorld: { mass?: number | null; diamKm?: number | null },
): number {
    if (m.periodHrs && m.periodHrs > 0) return m.periodHrs / (365.25 * 24);
    const G = 6.674e-11;
    const M_EARTH_KG = 5.972e24;
    const parentMassKg = (parentWorld.mass || 1) * M_EARTH_KG;
    const parentDiamKm = parentWorld.diamKm || 12742;
    const pd = m.pd || 20;
    const r_m = pd * parentDiamKm * 1000;
    const T_sec = 2 * Math.PI * Math.sqrt(Math.pow(r_m, 3) / (G * parentMassKg));
    return T_sec / (365.25 * 24 * 3600);
}

/**
 * Body angle at a time. js/system_viewer.js:2851 and 2860 (companions),
 * 3186 (worlds), 4579 (moons).
 * elapsedYears = totalDays / 365.25. angle = epoch + 2π × elapsedYears / period.
 */
export function bodyAngle(epoch: number, periodYears: number, totalDays: number): number {
    const elapsedYears = totalDays / 365.25;
    return epoch + (2 * Math.PI / periodYears) * elapsedYears;
}
