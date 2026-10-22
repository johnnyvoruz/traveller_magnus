/**
 * The season line the dossier shows.
 * The words are seasonHere (orbit/season_here.ts). The inputs match the orbit card
 * (orbit/card.ts worldSeason and moonSeason). A belt and a ring have no line.
 * No tilt leaves the season empty, and this returns null: the card shows nothing.
 */
import type { PlanMoon, PlanWorld } from './layout.ts';
import { bodyAngle } from './maths.ts';
import { seasonHere, type SeasonHere } from './season_here.ts';

function num(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export type SeasonShown = {
    /** The season line's first statement. */
    season: string;
    /** The climate word, or null when the tree has no mean. */
    band: string | null;
    /** The orbit-driven second line, or empty. */
    orbit: string;
};

function shown(here: SeasonHere): SeasonShown | null {
    if (!here.season) return null;
    return { season: here.season, band: here.band, orbit: here.orbit };
}

/** The world's season at `days`, or null when it has no tilt to read. */
export function seasonOnWorld(world: PlanWorld, days: number): SeasonShown | null {
    if (world.belt) return null;
    const body = world.body;
    return shown(seasonHere({
        moon: false,
        tilt: num(body.axialTilt),
        parentTilt: null,
        parentName: '',
        yearDays: num(body.periodDays),
        lockedToStar: body.tidallyLocked === true,
        angle: bodyAngle(world.epoch, world.period, days),
        eccentricity: num(body.eccentricity),
    }, num(body.meanTempK)));
}

/** A moon's season at `days`, from its tilt or its parent's. Null when neither has a tilt. */
export function seasonOnMoon(moon: PlanMoon, parent: PlanWorld, days: number): SeasonShown | null {
    if (moon.ring || moon.belt) return null;
    return shown(seasonHere({
        moon: true,
        tilt: num(moon.body.axialTilt),
        parentTilt: num(parent.body.axialTilt),
        parentName: parent.name,
        yearDays: num(parent.body.periodDays),
        lockedToStar: false,
        angle: bodyAngle(parent.epoch, parent.period, days),
        eccentricity: num(parent.body.eccentricity),
    }, num(moon.body.meanTempK)));
}
