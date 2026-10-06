/**
 * The hover card's contents: the legacy tooltip (js/system_viewer.js:4789-4873), one branch
 * per kind of body, plus the first delighters (temperatures in both scales, the season
 * line). Every value is a field of the document shown as it is; nothing is derived from a
 * rule. A ring has no card, as in the legacy view. Pure.
 */
import { formatKelvin, formatTemp, kelvinNote } from '../design/units.ts';
import { formatDisplayNumber, formatTradeCodes, formatUwpDigit } from '../dossier/labels.ts';
import { dayNightFor } from './daynight.ts';
import type { HitKind, Plan, PlanMoon, PlanWorld } from './layout.ts';
import { bodyAngle, starCompanionAU } from './maths.ts';
import { seasonLine, SEASON_HELP, type SeasonLine } from './seasons.ts';
import { rotationText } from './system.ts';
import { todayTemp } from './today_temp.ts';

type Bag = Record<string, any>;

export type CardLine = {
    label: string;
    value: string;
    /** The UWP is set strong, as legacy. */
    strong?: boolean;
    /** A little space above, where the legacy card has a gap. */
    gap?: boolean;
    /** Tooltip text for the line. */
    hint?: string;
    /**
     * now: orbit, distance, today's temperatures, daylight (the clock).
     * survey: UWP, starport, tech, codes, zone, diameter, rotation, gravity, survey temperatures.
     */
    group?: 'now' | 'survey';
};

export type BodyCardModel = {
    title: string;
    /** The parenthesis after the title: the body's type or role. */
    sub: string;
    /** Every line, in the order the card has always shown. */
    lines: CardLine[];
    /** The clock: orbit, distance, today's temperatures, daylight. The season sits beside these. */
    now?: CardLine[];
    /** The survey the dossier already shows when it is open on this body. */
    survey?: CardLine[];
    season: SeasonLine | null;
    seasonHelp: string;
};

function groupFor(label: string): 'now' | 'survey' {
    if (label === 'Orbit #' || label === 'Orbit' || label === 'Distance') return 'now';
    if (label.startsWith('Today,')) return 'now';
    if (label === 'Solar day' || label === 'Day and night' || label.startsWith('Daylight ')) return 'now';
    return 'survey';
}

function pack(model: { title: string; sub: string; lines: CardLine[]; season: SeasonLine | null; seasonHelp: string }): BodyCardModel {
    const lines = model.lines.map((line) => ({ ...line, group: line.group ?? groupFor(line.label) }));
    return {
        title: model.title,
        sub: model.sub,
        lines,
        now: lines.filter((line) => line.group === 'now'),
        survey: lines.filter((line) => line.group === 'survey'),
        season: model.season,
        seasonHelp: model.seasonHelp,
    };
}

function num(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function push(lines: CardLine[], label: string, value: string, extra: Partial<CardLine> = {}): void {
    if (value !== '') lines.push({ label, value, ...extra });
}

/** UWP, starport, TL, codes and zone: the block worlds, moons and belts share. */
function profile(lines: CardLine[], body: Bag, belt: boolean): void {
    if (body.uwp) lines.push({ label: 'UWP', value: String(body.uwp), strong: true, gap: true });
    if (body.starport) {
        if (belt) lines.push({ label: 'Spaceport', value: String(body.starport) });
        else lines.push({ label: 'Starport', value: formatUwpDigit('starport', body.starport) });
    }
    if (body.tl != null) lines.push({ label: 'TL', value: String(body.tl) });
    if (Array.isArray(body.tradeCodes) && body.tradeCodes.length) {
        lines.push({ label: 'Codes', value: belt ? body.tradeCodes.join(' ') : formatTradeCodes(body.tradeCodes) });
    }
    if (body.travelZone && body.travelZone !== 'G') lines.push({ label: 'Zone', value: String(body.travelZone) });
}

const DAYLIGHT_HINT = 'Geometry only: the share of the solar day the star is above the horizon, from the axial tilt. No refraction, eclipses or terrain.';

/** Diameter, rotation, mass, gravity and temperature: the block worlds and moons share. */
function physical(lines: CardLine[], body: Bag, parent: Bag | null, angle: number): void {
    if (body.diamKm != null) lines.push({ label: 'Diameter', value: formatDisplayNumber(body.diamKm, 0, 'km'), gap: true });
    // 4325-4331.
    const rotation = rotationText(body);
    if (rotation === 'Tidally locked') lines.push({ label: 'Rotation', value: 'tidally locked' });
    else if (rotation) lines.push({ label: 'Sidereal day', value: rotation });
    // The day and night cycle: the solar day, and how the daylight ranges over the year.
    for (const line of dayNightFor(body, parent)) {
        if (line.label === 'At the equator' || line.label === 'Polar day and night') continue;
        const label = line.label === 'Solar day' || line.label === 'Day and night'
            ? line.label
            : 'Daylight ' + line.label.charAt(0).toLowerCase() + line.label.slice(1);
        // The card is narrow: "9.5 h to 10.1 h", not the dossier's full sentence.
        lines.push({ label, value: line.value.replace(' of light over the year', '').replace(' of light all year', ' all year'), hint: DAYLIGHT_HINT });
    }
    if (body.mass != null) lines.push({ label: 'Mass', value: formatDisplayNumber(body.mass, 3, 'M⊕') });
    if (body.gravity != null) lines.push({ label: 'Gravity', value: formatDisplayNumber(body.gravity, 2, 'G') });
    temperature(lines, body);
    today(lines, body, parent, angle);
}

/** §7.5: the band as the document names it, then the mean in both scales; the high and the low beneath. */
function temperature(lines: CardLine[], body: Bag): void {
    const mean = formatTemp(body.meanTempK);
    const high = formatTemp(body.highTempK);
    const low = formatTemp(body.lowTempK);
    let first = true;
    const add = (label: string, value: string, hint?: string): void => {
        lines.push({ label, value, gap: first, hint });
        first = false;
    };
    if (typeof body.tempBand === 'string' && body.tempBand && mean) add('Climate', body.tempBand);
    if (mean) add('Mean temp.', mean, kelvinNote('Mean', body.meanTempK));
    if (high) add('High temp.', high, kelvinNote('High', body.highTempK));
    if (low) add('Low temp.', low, kelvinNote('Low', body.lowTempK));
}

/**
 * "Today's" temperature in each hemisphere (orbit/today_temp.ts; Johnny, A3). Left out, with
 * no placeholder, without a mean, a tilt, a pressure or a year length, and for gas giants.
 * A planet locked to its star has no line (ruled 2026-10-04, directives/handoff.md §59): one face
 * always has the star, and its tilt term is about nothing. A moon locked to its planet still has one.
 */
function today(lines: CardLine[], body: Bag, parent: Bag | null, angle: number): void {
    if (body.type === 'Gas Giant' || body.size === 'R') return;
    if (!parent && (body.tidallyLocked === true || body.isTwilightZone === true)) return;
    const found = todayTemp({
        meanTempK: num(body.meanTempK),
        axialTilt: num(body.axialTilt),
        pressureBar: num(body.pressureBar),
        yearHours: num(body.yearHours),
        angle,
    });
    if (!found) return;
    const hint = 'Estimate for the season from: mean ' + formatTemp(body.meanTempK)
        + ', axial tilt ' + formatDisplayNumber(body.axialTilt, 1) + '\u00B0'
        + ', pressure ' + formatDisplayNumber(body.pressureBar, 2, 'bar')
        + ', orbit angle ' + Math.round(found.phaseDeg) % 360 + '\u00B0 past the northern spring equinox'
        + (parent ? ' (the parent planet\u2019s)' : '')
        + '. Day and night, geography and orbital eccentricity are not included.';
    lines.push({ label: 'Today, north (est.)', value: formatTemp(found.northK), gap: true, hint });
    lines.push({ label: 'Today, south (est.)', value: formatTemp(found.southK), hint });
}

function starCard(body: Bag): BodyCardModel {
    const lines: CardLine[] = [];
    lines.push({ label: 'Type', value: String(body.sType ?? '') + String(body.subType ?? '') + ' ' + String(body.sClass ?? '') });
    const temp = formatKelvin(body.temp);
    if (temp) lines.push({ label: 'Surface temp.', value: temp });
    if (body.mass != null) lines.push({ label: 'Mass', value: formatDisplayNumber(body.mass, 3, 'M☉') });
    if (body.diam != null) lines.push({ label: 'Diameter', value: formatDisplayNumber(body.diam, 3, 'D☉') });
    if (body.lum != null) lines.push({ label: 'Luminosity', value: formatDisplayNumber(body.lum, 3, 'L☉') });
    if (body.separation) lines.push({ label: 'Separation', value: String(body.separation) });
    if (body.role !== 'Primary') {
        const au = starCompanionAU(body);
        if (au != null) lines.push({ label: 'Distance', value: formatDisplayNumber(au, 3, 'AU') });
    }
    return pack({ title: String(body.name || ''), sub: String(body.role || 'Primary'), lines, season: null, seasonHelp: '' });
}

function worldSeason(world: PlanWorld, days: number): SeasonLine | null {
    if (world.belt) return null;
    const body = world.body;
    return seasonLine({
        moon: false,
        tilt: num(body.axialTilt),
        parentTilt: null,
        parentName: '',
        yearDays: num(body.periodDays),
        lockedToStar: body.tidallyLocked === true,
        angle: bodyAngle(world.epoch, world.period, days),
        eccentricity: num(body.eccentricity),
    });
}

function moonSeason(moon: PlanMoon, parent: PlanWorld, days: number): SeasonLine | null {
    if (moon.ring) return null;
    return seasonLine({
        moon: true,
        tilt: num(moon.body.axialTilt),
        parentTilt: num(parent.body.axialTilt),
        parentName: parent.name,
        yearDays: num(parent.body.periodDays),
        lockedToStar: false,
        angle: bodyAngle(parent.epoch, parent.period, days),
        eccentricity: num(parent.body.eccentricity),
    });
}

function worldCard(world: PlanWorld, days: number): BodyCardModel {
    const w = world.body;
    const lines: CardLine[] = [];
    if (w.orbitId != null) lines.push({ label: 'Orbit #', value: formatDisplayNumber(w.orbitId, 2) });
    if (w.au != null) lines.push({ label: 'Distance', value: formatDisplayNumber(w.au, 3, 'AU') });
    if (w.eccentricity != null) lines.push({ label: 'Eccentricity', value: formatDisplayNumber(w.eccentricity, 3) });
    profile(lines, w, false);
    physical(lines, w, null, bodyAngle(world.epoch, world.period, days));
    if (world.moons.length) lines.push({ label: 'Moons', value: String(world.moons.length), gap: true });
    const displayType = w.ggType ? w.type + ' ' + w.ggType : (w.worldType || w.type);
    return pack({
        title: String(w.name || w.type || ''),
        sub: w.name ? String(displayType || '') : '',
        lines,
        season: worldSeason(world, days),
        seasonHelp: SEASON_HELP,
    });
}

function beltCard(world: PlanWorld): BodyCardModel {
    const body = world.body;
    const lines: CardLine[] = [];
    if (body.orbitId != null) lines.push({ label: 'Orbit #', value: formatDisplayNumber(body.orbitId, 2) });
    if (body.au != null) lines.push({ label: 'Distance', value: formatDisplayNumber(body.au, 3, 'AU') });
    profile(lines, body, true);
    if (body.resourceRating != null) lines.push({ label: 'Resource', value: String(body.resourceRating), gap: true });
    return pack({ title: String(body.name || ''), sub: 'Planetoid Belt', lines, season: null, seasonHelp: '' });
}

function moonCard(moon: PlanMoon, parent: PlanWorld, days: number): BodyCardModel {
    const m = moon.body;
    const lines: CardLine[] = [];
    if (m.pd != null) lines.push({ label: 'Orbit', value: formatDisplayNumber(m.pd, 2, 'PD') + ' from parent' });
    profile(lines, m, false);
    physical(lines, m, parent.body, bodyAngle(parent.epoch, parent.period, days));
    if (m.size != null) push(lines, 'Size', String(m.size));
    return pack({
        title: String(m.name || (moon.mainworld ? 'Mainworld (Moon)' : 'Moon')),
        sub: moon.mainworld ? 'Mainworld Satellite' : 'Satellite',
        lines,
        season: moonSeason(moon, parent, days),
        seasonHelp: SEASON_HELP,
    });
}

/** The card for the body under the pointer, or null (a ring, or a key the plan does not hold). */
export function cardFor(plan: Plan, kind: HitKind, key: string, days: number): BodyCardModel | null {
    if (kind === 'ring') return null;
    if (kind === 'star') {
        const star = plan.stars.find((s) => s.key === key);
        return star ? starCard(star.body) : null;
    }
    for (const world of plan.worlds) {
        if (world.key === key) {
            // 3217: a mainworld belt is a 'world' hit and gets the world's card.
            return kind === 'belt' ? beltCard(world) : worldCard(world, days);
        }
        for (const moon of world.moons) if (moon.key === key) return moonCard(moon, world, days);
    }
    return null;
}
