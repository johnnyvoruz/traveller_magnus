/**
 * Space travel figures from rules/mgt2e_space_travel.json, through the generated wrapper.
 * Pure. Every rule number is read from that module.
 */
// @ts-expect-error -- the generated wrapper is JavaScript with no declaration.
import generated from '../../../../packages/engines/src/generated/rules/mgt2e_space_travel.js';
import { randomUnit } from '../platform/browser.ts';

type SpaceTravel = {
    jump: {
        fuelHullFractionPerParsec: number;
        minimumParsecsCounted: number;
        durationHours: { base: number; dice: number };
    };
    travel: {
        metresPerSecond2PerG: number;
    };
    manoeuvre: {
        manoeuvreDriveFuel: string;
        reactionDriveHullFractionPerThrustPerHour: number;
    };
};

const rules = generated as SpaceTravel;

/** Johnny, 2026-10-06, a stand-in for the MVP until a ship's own fields are read. */
export const ASSUMED_HULL_TONS = 100;

/** The formula takes metres. A kilometre is a thousand of them. */
const METRES_PER_KILOMETRE = 1000;

function assertPositive(name: string, value: number): void {
    if (!Number.isFinite(value) || value <= 0) {
        throw new Error(name + ' must be finite and positive.');
    }
}

/** Seconds, from rest to rest: accelerate to the midpoint, then decelerate. */
export function transitSeconds(distanceKm: number, accelG: number): number {
    assertPositive('Distance', distanceKm);
    assertPositive('Acceleration', accelG);
    const metres = distanceKm * METRES_PER_KILOMETRE;
    const accel = accelG * rules.travel.metresPerSecond2PerG;
    return 2 * Math.sqrt(metres / accel);
}

/** Parsecs a jump is counted as. A shorter jump still counts as the minimum. */
export function jumpParsecsCounted(parsecs: number): number {
    return Math.max(rules.jump.minimumParsecsCounted, parsecs);
}

/** Fuel in tons: the hull fraction per counted parsec. */
export function jumpFuelTons(hullTons: number, parsecs: number): number {
    return rules.jump.fuelHullFractionPerParsec * hullTons * jumpParsecsCounted(parsecs);
}

/** A manoeuvre drive burns fuel only when the rules say it does. "none" does not. */
export const MANOEUVRE_DRIVE_USES_FUEL = rules.manoeuvre.manoeuvreDriveFuel !== 'none';

function assertFiniteNonNegative(name: string, value: number): void {
    if (!Number.isFinite(value) || value < 0) {
        throw new Error(name + ' must be finite and not negative.');
    }
}

/** Reaction-drive fuel in tons. Zero hours burns nothing. */
export function reactionFuelTons(hullTons: number, thrust: number, hours: number): number {
    assertFiniteNonNegative('Hull', hullTons);
    assertFiniteNonNegative('Thrust', thrust);
    assertFiniteNonNegative('Hours', hours);
    if (hours === 0) return 0;
    return rules.manoeuvre.reactionDriveHullFractionPerThrustPerHour * hullTons * thrust * hours;
}

/**
 * The book's D. roll1D in packages/engines/src/core/rng.js is
 * floor(unit * 6) + 1, here on the caller's unit interval.
 */
function roll1D(random: () => number): number {
    return Math.floor(random() * 6) + 1;
}

/** Jump duration: the base hours plus that many six-sided dice, and the faces. */
export function rollJumpHours(random: () => number = randomUnit): { hours: number; dice: number[] } {
    const dice: number[] = [];
    const count = rules.jump.durationHours.dice;
    for (let i = 0; i < count; i++) dice.push(roll1D(random));
    let hours = rules.jump.durationHours.base;
    for (const face of dice) hours += face;
    return { hours, dice };
}
