/**
 * "What season is it here?" (campaign_manager_plan.md §7.4, with Johnny's decisions of
 * 2026-10-03, Q1 and Q2). Geometry over fields the document already carries; nothing here is
 * a Traveller rule. Pure.
 *
 * The convention, held in one constant: the northern spring equinox is at orbit angle 0° in
 * the system frame, measured along the direction of motion; 90° is the northern summer
 * solstice, 180° the autumn equinox, 270° the winter solstice; the south is the reverse. For
 * a moon the parent planet's angle round the star is used. The angle is the body's place on
 * its orbit, so it does not change with the camera. The convention holds whatever the
 * orbit's eccentricity.
 *
 * A world locked to its star has no day and night and no seasons. A moon locked to its
 * parent planet has a day equal to its orbital period, and seasons set by the parent's year
 * and the moon's effective tilt.
 *
 * "Today's" temperature (Q3) is not computed: the decision makes it valid only if the
 * document's high and low are seasonal extremes, and the engine builds them from the tilt,
 * the rotation (day and night), the geography and the eccentricity together
 * (js/mgt2e_world_engine.js:1758-1791). Reported to Johnny; left out until he rules.
 */

/** The orbit angle, in radians, of the northern spring equinox. */
export const SPRING_EQUINOX_ANGLE = 0;
/** An effective tilt under this many degrees gives "negligible seasons". */
export const NEGLIGIBLE_TILT_DEG = 3;
/** At this eccentricity and above the orbit itself drives a whole-world season (§7.4). */
export const ORBIT_SEASON_ECCENTRICITY = 0.1;

export const SEASON_HELP = 'Seasons are measured from a fixed reference: the northern spring equinox occurs when the world '
    + '(or its parent planet, for a moon) is at orbit angle 0° in the system view. This is a display convention, not canon data.';

const NORTH = ['spring', 'summer', 'autumn', 'winter'] as const;
const SOUTH = ['autumn', 'winter', 'spring', 'summer'] as const;

export type SeasonInput = {
    moon: boolean;
    /** The body's own axialTilt in degrees, or null when the document has none. */
    tilt: number | null;
    /** A moon's parent planet: its tilt, its name, and its year in days. */
    parentTilt: number | null;
    parentName: string;
    yearDays: number | null;
    /** The body is a planet marked tidallyLocked: locked to its star. */
    lockedToStar: boolean;
    /** Orbit angle in radians in the system frame: the planet's own, or the parent planet's for a moon. */
    angle: number;
    /** Eccentricity of that orbit round the star, or null. */
    eccentricity: number | null;
};

export type SeasonLine = {
    text: string;
    /** The same words as `text`, one statement to a line. */
    lines: string[];
    /** A second line when the orbit itself drives a season, else empty. */
    orbit: string;
    /** The inputs, for the `?`: `tilt 23.4° · e 0.02 · orbit angle 147°`. */
    inputs: string;
};

function finite(value: number | null): value is number {
    return typeof value === 'number' && Number.isFinite(value);
}

/** The orbit angle from the equinox, in degrees, in [0, 360). */
export function seasonPhase(angle: number): number {
    const degrees = (angle - SPRING_EQUINOX_ANGLE) * 180 / Math.PI;
    const wrapped = ((degrees % 360) + 360) % 360;
    // A value a rounding error under 360 is 0.
    return wrapped >= 360 ? 0 : wrapped;
}

/** A tilt over 90° is a retrograde spin: the seasons are those of 180° − tilt. */
export function effectiveTilt(tilt: number): number {
    return tilt > 90 ? 180 - tilt : tilt;
}

/** §7.4: mild under 15°, marked to 35°, severe to 60°, extreme beyond. */
export function seasonStrength(tiltDeg: number): string {
    if (tiltDeg < 15) return 'mild';
    if (tiltDeg < 35) return 'marked';
    if (tiltDeg <= 60) return 'severe';
    return 'extreme';
}

function degrees(value: number): string {
    return String(Number(value.toFixed(1))) + '°';
}

function daysText(days: number): string {
    return String(Math.round(days)).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + ' days';
}

function yearNote(input: SeasonInput): string {
    const owner = input.parentName ? input.parentName + '’s year' : 'parent’s year';
    return finite(input.yearDays) ? owner + ' (' + daysText(input.yearDays) + ')' : owner;
}

/** The season line for a world on a date, or null when the document gives nothing to say. */
export function seasonLine(input: SeasonInput): SeasonLine | null {
    let tilt: number | null = finite(input.tilt) ? input.tilt : null;
    let derived = false;
    if (input.moon && tilt === null) {
        if (finite(input.parentTilt)) {
            tilt = input.parentTilt;
            derived = true;
        } else {
            // Neither the moon nor its parent has a tilt: the year only, no hemisphere text.
            return said(['Year: ' + yearNote(input)], '', '');
        }
    }
    if (tilt === null) return null;

    const phase = seasonPhase(input.angle);
    const parts = ['tilt ' + degrees(tilt) + (derived ? ' (parent’s, derived)' : '')];
    if (finite(input.eccentricity)) parts.push('e ' + String(Number(input.eccentricity.toFixed(3))));
    parts.push('orbit angle ' + String(Math.round(phase) % 360) + '°');
    const inputs = parts.join(' · ');

    if (!input.moon && input.lockedToStar) {
        return said(['No seasons: one face always points at the star'], '', inputs);
    }
    const effective = effectiveTilt(tilt);
    const tail = input.moon ? ['by ' + yearNote(input)] : [];
    let orbit = '';
    const e = input.eccentricity;
    if (finite(e) && e >= ORBIT_SEASON_ECCENTRICITY && e < 1) {
        const ratio = Math.pow((1 + e) / (1 - e), 2);
        orbit = 'Orbit-driven: whole-world warm and cool seasons, flux ratio ' + ratio.toFixed(1);
    }
    if (effective < NEGLIGIBLE_TILT_DEG) {
        return said(['Negligible seasons (tilt ' + degrees(tilt) + (derived ? ', derived' : '') + ')', ...tail], orbit, inputs);
    }
    const quarter = Math.min(3, Math.floor(phase / 90));
    const statements = ['Northern ' + NORTH[quarter] + ', ' + seasonStrength(effective), 'southern ' + SOUTH[quarter]];
    if (tilt > 90) statements.push('retrograde');
    if (derived) statements.push('tilt derived from ' + (input.parentName || 'the parent'));
    return said([...statements, ...tail], orbit, inputs);
}

/** The line, and the same statements one to a line, each beginning with a capital. */
function said(statements: string[], orbit: string, inputs: string): SeasonLine {
    return {
        text: statements.join(' · '),
        lines: statements.map((part) => part.charAt(0).toUpperCase() + part.slice(1)),
        orbit,
        inputs,
    };
}
