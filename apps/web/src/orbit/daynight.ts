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
 * direction the world turns when it is not retrograde; in (−180, 180]. The starport stands
 * on the prime meridian: longitude 0 is the starport's longitude.
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
 *
 * The Day and night strip's local-time tick is this share at the starport. The starport
 * stands on the prime meridian, so the tick is dayFraction at longitude 0. A referee pin
 * on the surface map, once the map takes pins, overrides that place.
 */
export function dayFraction(turning: Turning, days: number, starAngle: number, lonDeg: number): number | null {
    if (turning.lockedToStar) return null;
    const ahead = (lonDeg - subsolarLongitude(turning, days, starAngle)) / 360;
    const fraction = 0.5 + (turning.retrograde ? -ahead : ahead);
    return ((fraction % 1) + 1) % 1;
}

export type StarportTick = {
    /** Share of the strip from the left: 0 at sunrise, 1 at the next sunrise. */
    at: number;
    /** Local time at the starport, hours and minutes of the world's own day. */
    time: string;
};

/**
 * The starport tick on the sunrise-to-sunrise strip. dayFraction is 0 at midnight and
 * 0.5 at noon; the strip's left edge is sunrise, which on an even day is a quarter of
 * a day before noon. Null when the world keeps one face to its star.
 * The starport stands on the prime meridian, so this is dayFraction at longitude 0.
 */
export function starportTick(turning: Turning, days: number, starAngle: number): StarportTick | null {
    const fraction = dayFraction(turning, days, starAngle, 0);
    const day = turning.solarDayHours;
    if (fraction === null || day === null) return null;
    const at = (fraction - 0.25 + 1) % 1;
    const dayMinutes = Math.max(1, Math.round(day * 60));
    let minutes = Math.round(fraction * day * 60);
    if (minutes >= dayMinutes) minutes = 0;
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    const hourText = hours >= 100
        ? String(hours).replace(/\B(?=(\d{3})+(?!\d))/g, ',')
        : String(hours).padStart(2, '0');
    return { at, time: hourText + ':' + String(mins).padStart(2, '0') };
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

// ---- The day as a picture: something to hold a 2,000-hour day against --------------------

/** The clock's day and year, the yardsticks a long day is measured in (orbit/clock.ts). */
const CLOCK_DAY_HOURS = 24;
const CLOCK_YEAR_DAYS = 365;

function grouped(value: number, decimals: number): string {
    return String(Number(value.toFixed(decimals))).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** A length of time in hours: "19.6 hours", "4,911 hours". */
export function hoursText(spanHours: number): string {
    const text = grouped(spanHours, spanHours >= 100 ? 0 : 1);
    return text + (text === '1' ? ' hour' : ' hours');
}

/**
 * A long stretch of hours restated in the clock's units, so it can be held against a life
 * lived in 24-hour days: "205 standard days", "13.4 standard years". Null under two days,
 * where hours already say it. "Standard" here means the clock's day of 24 hours and its year
 * of 365 of them (orbit/clock.ts); the word is this view's, not a rules term.
 */
export function standardText(spanHours: number): string | null {
    if (spanHours < 2 * CLOCK_DAY_HOURS) return null;
    const days = spanHours / CLOCK_DAY_HOURS;
    if (days < 2 * CLOCK_YEAR_DAYS) return grouped(days, days >= 100 ? 0 : 1) + ' standard days';
    const years = days / CLOCK_YEAR_DAYS;
    return grouped(years, years >= 100 ? 0 : 1) + ' standard years';
}

/** The stretch in the unit a person would say it in: hours when short, standard days or years when long. */
export function spanText(spanHours: number): string {
    return standardText(spanHours) ?? hoursText(spanHours);
}

export type Ruler = {
    /** Hours between marks. */
    everyHours: number;
    /** What one mark is, in words. */
    label: string;
    /** Marks across one solar day (not a whole number). */
    count: number;
};

const RULER_STEPS: [number, string][] = [
    [1, '1 hour'], [6, '6 hours'], [24, '1 standard day'], [240, '10 standard days'], [2400, '100 standard days'],
    [CLOCK_YEAR_DAYS * 24, '1 standard year'], [CLOCK_YEAR_DAYS * 240, '10 standard years'], [CLOCK_YEAR_DAYS * 2400, '100 standard years'],
];
/** The most marks a strip carries before the next coarser step is used. */
export const RULER_MAX_MARKS = 48;

/** The finest step that puts no more than RULER_MAX_MARKS marks across a day of this length. */
export function rulerFor(dayHours: number): Ruler {
    for (const [every, label] of RULER_STEPS) {
        if (dayHours / every <= RULER_MAX_MARKS) return { everyHours: every, label, count: dayHours / every };
    }
    const last = RULER_STEPS[RULER_STEPS.length - 1] as [number, string];
    return { everyHours: last[0], label: last[1], count: dayHours / last[0] };
}

export type DayNightFigure = {
    /** A planet locked to its star: one side is always lit, there is no cycle. */
    locked: boolean;
    /** The solar day in hours; 0 when locked. */
    dayHours: number;
    /** The solar day in hours, in words: "4,911 hours". */
    span: string;
    /** The same in 24-hour days or 365-day years, or null when hours already say it. */
    standard: string | null;
    /** The backwards spin: the star rises in the west. */
    retrograde: boolean;
    /** Light and dark at the equator, in hours: half and half all year. */
    equator: { light: number; dark: number };
    /** At DAYLIGHT_LATITUDE: the least and most daylight of the year, or null without a tilt. */
    mid: { latitude: number; shortest: number; longest: number; derived: boolean } | null;
    /** Polar day and night happen beyond this latitude; null without a tilt worth the name. */
    polarBeyond: number | null;
    ruler: Ruler;
};

/**
 * The day and night cycle as numbers a picture can be drawn from, or null when the document
 * gives no solar day. The same geometry as dayNightLines; the tilt follows Q1 (a moon
 * without one takes its parent's).
 */
export function dayNightFigure(
    body: Record<string, any> | null | undefined, parent: Record<string, any> | null | undefined,
): DayNightFigure | null {
    if (!body) return null;
    const turning = turningOf(body, !!parent);
    if (turning.lockedToStar) {
        return { locked: true, dayHours: 0, span: '', standard: null, retrograde: false, equator: { light: 0, dark: 0 }, mid: null, polarBeyond: null, ruler: rulerFor(1) };
    }
    const day = turning.solarDayHours;
    if (day === null || !(day < SOLAR_DAY_LIMIT_HOURS)) return null;
    const own = typeof body.axialTilt === 'number' && Number.isFinite(body.axialTilt) ? body.axialTilt : null;
    const fromParent = parent && typeof parent.axialTilt === 'number' && Number.isFinite(parent.axialTilt) ? parent.axialTilt : null;
    const raw = own ?? fromParent;
    const tilt = raw === null ? null : (raw > 90 ? 180 - raw : raw);
    return {
        locked: false,
        dayHours: day,
        span: hoursText(day),
        standard: standardText(day),
        retrograde: turning.retrograde,
        equator: { light: day / 2, dark: day / 2 },
        mid: tilt === null ? null : {
            latitude: DAYLIGHT_LATITUDE,
            shortest: daylightFraction(DAYLIGHT_LATITUDE, -tilt) * day,
            longest: daylightFraction(DAYLIGHT_LATITUDE, tilt) * day,
            derived: own === null,
        },
        polarBeyond: tilt !== null && tilt >= 0.05 ? Number((90 - tilt).toFixed(1)) : null,
        ruler: rulerFor(day),
    };
}

// ---- The year, said so it cannot be misread ------------------------------------------------

export type YearFigure = {
    /** The year in standard (24-hour) days: "6,943 standard days". */
    days: string;
    /** The same in standard years, when it is two or more: "19 standard years". Else null. */
    years: string | null;
    /** How many of the world's own days (sunrise to sunrise) fit in its year: "8,501 local days". Else null. */
    localDays: string | null;
};

/**
 * A body's year round its star, from the document's yearHours (a moon's is its planet's) and
 * solarDaysInYear. Null when the document gives no year length. The tile used to read
 * "19 yr", which says neither what a year is measured in nor how many days it holds.
 */
export function yearFigure(body: Record<string, any> | null | undefined): YearFigure | null {
    if (!body) return null;
    const hours = positive(body.yearHours);
    if (hours === null) return null;
    const days = hours / CLOCK_DAY_HOURS;
    const years = days / CLOCK_YEAR_DAYS;
    const local = typeof body.solarDaysInYear === 'number' && Number.isFinite(body.solarDaysInYear) ? Math.abs(body.solarDaysInYear) : null;
    return {
        days: grouped(days, days >= 100 ? 0 : 1) + ' standard days',
        years: years >= 2 ? grouped(years, years >= 100 ? 0 : 1) + ' standard years' : null,
        localDays: local !== null && local > 0 ? grouped(local, local >= 100 ? 0 : 1) + ' local days' : null,
    };
}
