/**
 * "Today's" temperature: the mean, raised or lowered by where the world is in its year.
 * Johnny approved the formula as written (directives/questions_for_johnny.md A3, 2026-10-04):
 *
 *   today (north) = meanTempK × (1 + tiltPart × sin(angle) / (1 + pressureBar)) ^ 0.25
 *   today (south) = the same with −sin(angle)
 *
 * tiltPart is the axial-tilt term of the engine's temperature variance, copied below and held
 * to the engine's own lines by tests/web/orbit_today_temp.test.js. The
 * angle is the body's drawn orbit angle from the northern spring equinox (orbit/seasons.ts),
 * the parent planet's for a moon. Day and night, geography and the orbit's eccentricity are
 * left out, so this is a hemisphere's average for the season: an estimate, and labelled one.
 * Pure.
 */
import { seasonPhase } from './seasons.ts';

/**
 * The axial-tilt term of the variance, copied from
 * packages/engines/src/mgt2e_world_engine.js:1757-1759 (the web app may not import the
 * engines): the sine of the tilt, halved for a year under 36.5 days and raised by half for a
 * year over two of 8,760 hours.
 */
export function tiltPart(axialTilt: number, yearHours: number): number {
    let tfactor = Math.abs(Math.sin((axialTilt || 0) * Math.PI / 180));
    if (yearHours < (36.5 * 24)) tfactor /= 2;
    if (yearHours > (2 * 8760)) tfactor *= 1.5;
    return tfactor;
}

export type TodayInput = {
    meanTempK: number | null;
    /** Degrees, as the document gives it. */
    axialTilt: number | null;
    pressureBar: number | null;
    /** The year round the star in hours (the document's yearHours; a moon's is its planet's). */
    yearHours: number | null;
    /** The drawn orbit angle in radians: the body's own, or its parent planet's for a moon. */
    angle: number;
};

export type Today = {
    northK: number;
    southK: number;
    /** The tilt term used, and the orbit angle from the spring equinox in degrees: for the tooltip. */
    tiltPart: number;
    phaseDeg: number;
};

function known(value: number | null): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/**
 * The estimate for both hemispheres, or null when the document lacks an input. Null also
 * when the formula has no answer: the tilt term can reach or exceed 1 + pressure (a tilt near
 * 90°, a long year, almost no air), which leaves nothing, or less than nothing, under the
 * root. Ruled 2026-10-04 (directives/handoff.md §59): when the bracket under the root is not
 * positive, there is no line.
 */
export function todayTemp(input: TodayInput): Today | null {
    const { meanTempK, axialTilt, pressureBar, yearHours } = input;
    if (!known(meanTempK) || !known(axialTilt) || !known(pressureBar) || !known(yearHours)) return null;
    if (!(yearHours > 0) || pressureBar < 0) return null;
    const part = tiltPart(axialTilt, yearHours);
    const phaseDeg = seasonPhase(input.angle);
    const swing = part * Math.sin(phaseDeg * Math.PI / 180) / (1 + pressureBar);
    if (!(1 + swing > 0) || !(1 - swing > 0)) return null;
    return {
        northK: meanTempK * Math.pow(1 + swing, 0.25),
        southK: meanTempK * Math.pow(1 - swing, 0.25),
        tiltPart: part,
        phaseDeg,
    };
}
