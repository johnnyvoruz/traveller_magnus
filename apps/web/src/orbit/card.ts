/**
 * The hover card's contents: the legacy tooltip (js/system_viewer.js:4789-4873), one branch
 * per kind of body, plus the first delighters (temperatures in both scales, the season
 * line). Every value is a field of the document shown as it is; nothing is derived from a
 * rule. A ring has no card, as in the legacy view. Pure.
 */
import { formatTemp, kelvinNote } from '../design/units.ts';
import { formatDisplayNumber, formatTradeCodes, formatUwpDigit } from '../dossier/labels.ts';
import type { HitKind, Plan, PlanMoon, PlanWorld } from './layout.ts';
import { bodyAngle, starCompanionAU } from './maths.ts';
import { seasonLine, SEASON_HELP, type SeasonLine } from './seasons.ts';
import { rotationText } from './system.ts';

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
};

export type BodyCardModel = {
    title: string;
    /** The parenthesis after the title: the body's type or role. */
    sub: string;
    lines: CardLine[];
    season: SeasonLine | null;
    seasonHelp: string;
};

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

/** Diameter, rotation, mass, gravity and temperature: the block worlds and moons share. */
function physical(lines: CardLine[], body: Bag): void {
    if (body.diamKm != null) lines.push({ label: 'Diameter', value: formatDisplayNumber(body.diamKm, 0, 'km'), gap: true });
    // 4325-4331.
    const rotation = rotationText(body);
    if (rotation === 'Tidally locked') lines.push({ label: 'Rotation', value: 'tidally locked' });
    else if (rotation) lines.push({ label: 'Sidereal day', value: rotation });
    if (body.mass != null) lines.push({ label: 'Mass', value: formatDisplayNumber(body.mass, 3, 'M⊕') });
    if (body.gravity != null) lines.push({ label: 'Gravity', value: formatDisplayNumber(body.gravity, 2, 'G') });
    temperature(lines, body);
}

/** §7.5: the band as the document names it, then the mean in both scales; the high and the low beneath. */
function temperature(lines: CardLine[], body: Bag): void {
    const mean = formatTemp(body.meanTempK);
    if (mean) {
        const band = typeof body.tempBand === 'string' && body.tempBand ? body.tempBand + ' · ' : '';
        lines.push({ label: 'Temperature', value: band + mean, hint: kelvinNote('Mean', body.meanTempK) });
    }
    const high = formatTemp(body.highTempK);
    if (high) lines.push({ label: 'High', value: high, hint: kelvinNote('High', body.highTempK) });
    const low = formatTemp(body.lowTempK);
    if (low) lines.push({ label: 'Low', value: low, hint: kelvinNote('Low', body.lowTempK) });
}

function starCard(body: Bag): BodyCardModel {
    const lines: CardLine[] = [];
    lines.push({ label: 'Type', value: String(body.sType ?? '') + String(body.subType ?? '') + ' ' + String(body.sClass ?? '') });
    const temp = formatTemp(body.temp);
    if (temp) lines.push({ label: 'Temperature', value: temp, hint: kelvinNote('Surface', body.temp) });
    if (body.mass != null) lines.push({ label: 'Mass', value: formatDisplayNumber(body.mass, 3, 'M☉') });
    if (body.diam != null) lines.push({ label: 'Diameter', value: formatDisplayNumber(body.diam, 3, 'D☉') });
    if (body.lum != null) lines.push({ label: 'Luminosity', value: formatDisplayNumber(body.lum, 3, 'L☉') });
    if (body.separation) lines.push({ label: 'Separation', value: String(body.separation) });
    if (body.role !== 'Primary') {
        const au = starCompanionAU(body);
        if (au != null) lines.push({ label: 'Distance', value: formatDisplayNumber(au, 3, 'AU') });
    }
    return { title: String(body.name || ''), sub: String(body.role || 'Primary'), lines, season: null, seasonHelp: '' };
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
    physical(lines, w);
    if (world.moons.length) lines.push({ label: 'Moons', value: String(world.moons.length), gap: true });
    const displayType = w.ggType ? w.type + ' ' + w.ggType : (w.worldType || w.type);
    return {
        title: String(w.name || w.type || ''),
        sub: w.name ? String(displayType || '') : '',
        lines,
        season: worldSeason(world, days),
        seasonHelp: SEASON_HELP,
    };
}

function beltCard(world: PlanWorld): BodyCardModel {
    const body = world.body;
    const lines: CardLine[] = [];
    if (body.orbitId != null) lines.push({ label: 'Orbit #', value: formatDisplayNumber(body.orbitId, 2) });
    if (body.au != null) lines.push({ label: 'Distance', value: formatDisplayNumber(body.au, 3, 'AU') });
    profile(lines, body, true);
    if (body.resourceRating != null) lines.push({ label: 'Resource', value: String(body.resourceRating), gap: true });
    return { title: String(body.name || ''), sub: 'Planetoid Belt', lines, season: null, seasonHelp: '' };
}

function moonCard(moon: PlanMoon, parent: PlanWorld, days: number): BodyCardModel {
    const m = moon.body;
    const lines: CardLine[] = [];
    if (m.pd != null) lines.push({ label: 'Orbit', value: formatDisplayNumber(m.pd, 2, 'PD') + ' from parent' });
    profile(lines, m, false);
    physical(lines, m);
    if (m.size != null) push(lines, 'Size', String(m.size));
    return {
        title: String(m.name || (moon.mainworld ? 'Mainworld (Moon)' : 'Moon')),
        sub: moon.mainworld ? 'Mainworld Satellite' : 'Satellite',
        lines,
        season: moonSeason(moon, parent, days),
        seasonHelp: SEASON_HELP,
    };
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
