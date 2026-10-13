/**
 * Sign of the unlocked latitude term on the hybrid sheet.
 * hybrid/model.ts multiplies its amplitude by this factor:
 * tiltE is the axial tilt folded through 90 degrees, and the factor is
 * clamp((54 - tiltE) / 9, -1, 1). It is +1 when tiltE is 45 or less,
 * 0 at 54, and -1 when tiltE is 63 or more. Above 54 the cold place is
 * the equator. A locked world does not use this factor.
 */
export function latitudeTiltFactor(tiltDeg: number): number {
    const tiltE = tiltDeg > 90 ? 180 - tiltDeg : tiltDeg;
    return Math.max(-1, Math.min(1, (54 - tiltE) / 9));
}

/** True when the disc bake must scale its latitude term. A factor of 1 keeps the original shader. */
export function latitudeTermScales(tiltDeg: number, locked: boolean): boolean {
    if (locked) return false;
    return latitudeTiltFactor(tiltDeg) < 0.999;
}
