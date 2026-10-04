/**
 * Day and night: how a world turns under its star, from fields the document already carries
 * (`siderealHours`, `solarDayHours`, `axialTilt`, `tidallyLocked`, `isTwilightZone`). The
 * orbit view sees every world pole-on, so a world's turning is one angle in the system
 * frame; the same angle gives the point on its surface that has the star overhead. That
 * point, with the season's declination, is all a surface map needs to draw the day side and
 * the season in step with the orbit view. Pure geometry; nothing here is a Traveller rule.
 *
 * The spin is the legacy one (js/system_viewer.js:3505-3512): a turn every sidereal day,
 * backwards when the axial tilt is past 90°. One difference, from Johnny's decision of
 * 2026-10-03 (Q1): `tidallyLocked` means locked to the body it orbits, so only a *planet*
 * so marked keeps one face to the star; a locked moon turns once per orbit of its planet
 * (its `siderealHours` is that period) and the star rises and sets on it.
 */

export type Turning = {
    /** Hours for one turn against the stars, or null when the document has none. */
    siderealHours: number | null;
    /** Hours from noon to noon, or null when there is no cycle or the document has none. */
    solarDayHours: number | null;
    /** The axial tilt is past 90°: the world turns backwards. */
    retrograde: boolean;
    /** A planet locked to its star: one face always points at it. */
    lockedToStar: boolean;
};

function positive(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

/** Reads a body's turning. `moon` says whether it orbits a planet rather than a star. */
export function turningOf(body: Record<string, any> | null | undefined, moon: boolean): Turning {
    const b = body || {};
    return {
        siderealHours: positive(typeof b.siderealHours === 'number' ? Math.abs(b.siderealHours) : null),
        solarDayHours: positive(b.solarDayHours),
        retrograde: typeof b.axialTilt === 'number' && b.axialTilt > 90,
        lockedToStar: !moon && (b.tidallyLocked === true || b.isTwilightZone === true),
    };
}

/**
 * The angle, in radians in the system frame, that the world's prime meridian points along on
 * a date. starAngle is the direction from the world to its star.
 */
export function spinAngle(turning: Turning, days: number, starAngle: number): number {
    if (turning.lockedToStar) return starAngle;
    if (!turning.siderealHours) return 0;
    return (turning.retrograde ? -1 : 1) * ((days * 24) / turning.siderealHours) * 2 * Math.PI;
}

function wrap180(degrees: number): number {
    const wrapped = ((degrees + 180) % 360 + 360) % 360 - 180;
    return wrapped === -180 ? 180 : wrapped;
}

/**
 * The longitude with the star overhead, in degrees from the prime meridian, positive in the
 * direction the world turns when it is not retrograde; in (−180, 180].
 */
export function subsolarLongitude(turning: Turning, days: number, starAngle: number): number {
    return wrap180((starAngle - spinAngle(turning, days, starAngle)) * 180 / Math.PI);
}

/**
 * The latitude with the star overhead at noon: the season's declination. tiltDeg is the
 * effective tilt (orbit/seasons.ts effectiveTilt), phaseDeg the orbit angle from the spring
 * equinox (seasonPhase): 0 at the equinox, +tilt at the northern summer solstice.
 */
export function subsolarLatitude(tiltDeg: number, phaseDeg: number): number {
    const rad = Math.PI / 180;
    return Math.asin(Math.sin(tiltDeg * rad) * Math.sin(phaseDeg * rad)) / rad;
}

/**
 * The star's height above the horizon at a place, in degrees: positive by day, negative by
 * night, 0 on the terminator.
 */
export function sunElevation(latDeg: number, lonDeg: number, subLatDeg: number, subLonDeg: number): number {
    const rad = Math.PI / 180;
    const sine = Math.sin(latDeg * rad) * Math.sin(subLatDeg * rad)
        + Math.cos(latDeg * rad) * Math.cos(subLatDeg * rad) * Math.cos((lonDeg - subLonDeg) * rad);
    return Math.asin(Math.max(-1, Math.min(1, sine))) / rad;
}

/**
 * The time of day at a longitude as a share of the solar day: 0 at midnight, 0.5 at noon.
 * Null on a world that keeps one face to its star.
 */
export function dayFraction(turning: Turning, days: number, starAngle: number, lonDeg: number): number | null {
    if (turning.lockedToStar) return null;
    const ahead = (lonDeg - subsolarLongitude(turning, days, starAngle)) / 360;
    const fraction = 0.5 + (turning.retrograde ? -ahead : ahead);
    return ((fraction % 1) + 1) % 1;
}

// ---- How long the day is, and how it changes over the year --------------------------------

/** The latitude the daylight range is quoted for. A display choice, in one place. */
export const DAYLIGHT_LATITUDE = 45;
/** A yearly swing in daylight smaller than this share of the solar day is given as one figure. */
export const DAYLIGHT_FLAT_SHARE = 0.02;
/** The document writes a day that never ends as a very large number; past this there is no cycle to describe. */
export const SOLAR_DAY_LIMIT_HOURS = 999999;

/**
 * The share of a solar day the star is above the horizon at a latitude, when it stands
 * overhead at declination declDeg: 0.5 at an equinox, 1 in polar day, 0 in polar night.
 * Geometry of a sphere only: no refraction, and the star is a point.
 */
export function daylightFraction(latDeg: number, declDeg: number): number {
    const rad = Math.PI / 180;
    const x = -Math.tan(latDeg * rad) * Math.tan(declDeg * rad);
    if (x <= -1) return 1;
    if (x >= 1) return 0;
    return Math.acos(x) / Math.PI;
}

export type DayNightInput = {
    turning: Turning;
    /** The effective axial tilt in degrees (orbit/seasons.ts effectiveTilt), or null when unknown. */
    tiltDeg: number | null;
    /** The tilt is the parent planet's, used for a moon that has none of its own. */
    derived: boolean;
};

export type DayNightLine = { label: string; value: string };

function hours(value: number): string {
    return String(Number(value.toFixed(1))) + ' h';
}

/**
 * The day and night cycle in words: the solar day, the daylight and the dark at the equator,
 * and the shortest and longest daylight of the year at DAYLIGHT_LATITUDE. Empty when the
 * document gives no solar day.
 */
export function dayNightLines(input: DayNightInput): DayNightLine[] {
    const { turning, tiltDeg } = input;
    if (turning.lockedToStar) return [{ label: 'Day and night', value: 'None: one face always points at the star' }];
    const day = turning.solarDayHours;
    if (day === null || !(day < SOLAR_DAY_LIMIT_HOURS)) return [];
    const lines: DayNightLine[] = [
        { label: 'Solar day', value: hours(day) + (turning.retrograde ? ', the star rises in the west' : '') },
        { label: 'At the equator', value: hours(day / 2) + ' light, ' + hours(day / 2) + ' dark, all year' },
    ];
    if (tiltDeg === null) return lines;
    const at = 'At ' + DAYLIGHT_LATITUDE + '\u00B0' + (input.derived ? ' (parent\u2019s tilt)' : '');
    const shortest = daylightFraction(DAYLIGHT_LATITUDE, -tiltDeg) * day;
    const longest = daylightFraction(DAYLIGHT_LATITUDE, tiltDeg) * day;
    // Under a fiftieth of the day between midwinter and midsummer is no range worth quoting.
    if (longest - shortest < day * DAYLIGHT_FLAT_SHARE) {
        lines.push({ label: at, value: hours((shortest + longest) / 2) + ' of light all year' });
    } else if (shortest <= 0 && longest >= day) {
        lines.push({ label: at, value: 'from no light in winter to ' + hours(day) + ' in summer' });
    } else {
        lines.push({ label: at, value: hours(shortest) + ' to ' + hours(longest) + ' of light over the year' });
    }
    // Beyond this latitude the star does not set in summer or rise in winter.
    if (tiltDeg >= 0.05) lines.push({ label: 'Polar day and night', value: 'beyond ' + String(Number((90 - tiltDeg).toFixed(1))) + '\u00B0 latitude' });
    return lines;
}

/**
 * The day and night lines for a body of a system document, named by its dossier key. The
 * tilt follows Johnny's Q1 order: the body's own; for a moon without one, its parent's.
 */
export function dayNightFor(
    body: Record<string, any> | null | undefined, parent: Record<string, any> | null | undefined,
): DayNightLine[] {
    if (!body) return [];
    const own = typeof body.axialTilt === 'number' && Number.isFinite(body.axialTilt) ? body.axialTilt : null;
    const fromParent = parent && typeof parent.axialTilt === 'number' && Number.isFinite(parent.axialTilt) ? parent.axialTilt : null;
    const tilt = own ?? fromParent;
    return dayNightLines({
        turning: turningOf(body, !!parent),
        tiltDeg: tilt === null ? null : (tilt > 90 ? 180 - tilt : tilt),
        derived: own === null && fromParent !== null,
    });
}
