/**
 * Where the star stands over a world on a date: the subsolar point, from the world's turning
 * (orbit/daynight.ts), its tilt and its season (orbit/seasons.ts). The same arithmetic the
 * Day and night strip and the orbit view use, so the surface map, the strip and the orbit
 * view agree. Longitude is counted from the starport, eastward, as daynight.ts counts it.
 */
import { dayFraction, subsolarLatitude, subsolarLongitude, turningOf, type Turning } from './daynight.ts';
import { effectiveTilt, seasonPhase } from './seasons.ts';

export type Subsolar = {
    /** Degrees north. The season's declination. */
    readonly latDeg: number;
    /** Degrees east of the starport's meridian, in (−180, 180]. 0 on a world locked to its star. */
    readonly lonFromPortDeg: number;
    /** One face always to the star: the map draws a still shadow from its own substellar point. */
    readonly locked: boolean;
    /** Hours from noon to noon, or null. */
    readonly solarDayHours: number | null;
    /** Time of day at the starport as a share of the solar day (0 midnight, 0.5 noon), or null. */
    readonly portDayFraction: number | null;
    readonly turning: Turning;
};

/**
 * starAngle: direction from the world to its star in the system frame (the orbit angle plus π;
 * a moon takes its planet's). The season phase is measured from the world's own orbit angle.
 */
export function subsolarOn(body: Record<string, unknown> | null | undefined, moon: boolean, days: number, starAngle: number): Subsolar {
    const turning = turningOf(body as Record<string, any> | null | undefined, moon);
    const tilt = body && typeof body.axialTilt === 'number' && Number.isFinite(body.axialTilt) ? body.axialTilt : 0;
    const latDeg = turning.lockedToStar ? 0 : subsolarLatitude(effectiveTilt(tilt), seasonPhase(starAngle - Math.PI));
    return {
        latDeg,
        lonFromPortDeg: subsolarLongitude(turning, days, starAngle),
        locked: turning.lockedToStar,
        solarDayHours: turning.solarDayHours,
        portDayFraction: dayFraction(turning, days, starAngle, 0),
        turning,
    };
}

/** The starport's local time, HH:MM of the world's own day, or null. */
export function portTimeText(sun: Subsolar): string | null {
    if (sun.portDayFraction === null || !sun.solarDayHours) return null;
    const dayMinutes = Math.max(1, Math.round(sun.solarDayHours * 60));
    let minutes = Math.round(sun.portDayFraction * sun.solarDayHours * 60);
    if (minutes >= dayMinutes) minutes = 0;
    return String(Math.floor(minutes / 60)).padStart(2, '0') + ':' + String(minutes % 60).padStart(2, '0');
}

/** Local days that pass per real second at a clock rate (days per second). */
export function localDaysPerSecond(rate: number, solarDayHours: number | null): number {
    if (!solarDayHours || !(solarDayHours > 0)) return 0;
    return Math.abs(rate) * 24 / solarDayHours;
}

/** Past this many local days a second the map shows day-averaged shading, not a terminator. */
export const AVERAGED_ABOVE_DAYS_PER_SECOND = 1;
