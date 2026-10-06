/**
 * The estimates a course shows while it is plotted (K12, the measuring pass): a flight's time
 * and its reaction-drive fuel, a jump's rolled time in words, its parsecs and its fuel. Every
 * figure is campaign/travel.ts's, which reads rules/; nothing here is a rule or a number of
 * one. Nothing is deducted from a ship and nothing refuses: these are words beside a field.
 * Pure: it runs under Node.
 */
import {
    ASSUMED_HULL_TONS, MANOEUVRE_DRIVE_USES_FUEL, jumpFuelTons, jumpParsecsCounted, reactionFuelTons, transitSeconds,
} from '../campaign/travel.ts';
import { DAY_SECONDS, HOUR } from './clock.ts';

const HOUR_SECONDS = DAY_SECONDS * HOUR;
const DAY_HOURS = Math.round(1 / HOUR);

export type JumpRoll = { hours: number; dice: number[] };

/** A whole number with thousands separators. */
function grouped(value: number): string {
    return String(Math.round(value)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** Tons as an estimate reads: whole above ten, one decimal under it. */
export function tonsWords(tons: number): string {
    if (tons >= 10) return grouped(tons);
    return String(Math.round(tons * 10) / 10);
}

/** The roll as the book writes it: "148 + 23 = 171 h". The base is the total less the dice. */
export function rollWords(roll: JumpRoll): string {
    let sum = 0;
    for (const face of roll.dice) sum += face;
    return (roll.hours - sum) + ' + ' + sum + ' = ' + roll.hours + ' h';
}

/** "2 parsecs · about 20 tons · 100-ton hull assumed", from the hexes between the two systems. */
export function jumpEstimateWords(parsecs: number): string {
    const counted = jumpParsecsCounted(parsecs);
    const fuel = jumpFuelTons(ASSUMED_HULL_TONS, parsecs);
    return counted + (counted === 1 ? ' parsec' : ' parsecs') + ' · about ' + tonsWords(fuel) + ' tons · ' + ASSUMED_HULL_TONS + '-ton hull assumed';
}

/** A flight's hours over a distance at a G, or null where there is no distance to cross. */
export function flightHours(distanceKm: number | null, accelG: number): number | null {
    if (distanceKm === null || !Number.isFinite(distanceKm) || distanceKm <= 0) return null;
    return transitSeconds(distanceKm, accelG) / HOUR_SECONDS;
}

/** The estimate as the hours field holds it: to a tenth of an hour, and never nothing. */
export function fieldHours(hours: number): number {
    return Math.max(0.1, Math.round(hours * 10) / 10);
}

/** "about 4.3 h" under two days, "about 3 d 5 h" from there. */
export function hoursWords(hours: number): string {
    if (hours < 2 * DAY_HOURS) return 'about ' + fieldHours(hours) + ' h';
    const whole = Math.round(hours);
    const days = Math.floor(whole / DAY_HOURS);
    const rest = whole - days * DAY_HOURS;
    return 'about ' + grouped(days) + ' d' + (rest ? ' ' + rest + ' h' : '');
}

/**
 * The reaction drive's line. When the sum comes to more than the assumed hull itself, the
 * figure says nothing useful, and the line says so in its place (the orchestrator's pick,
 * 2026-10-06; Johnny may change it). Nothing warns: it is still an estimate beside a field.
 */
export function reactionFuelWords(accelG: number, hours: number): string {
    const tons = reactionFuelTons(ASSUMED_HULL_TONS, accelG, hours);
    if (tons > ASSUMED_HULL_TONS) return 'Reaction drive: more than the ship’s tonnage';
    return 'Reaction drive: about ' + tonsWords(tons) + ' tons · ' + ASSUMED_HULL_TONS + '-ton hull assumed';
}

/**
 * The flight's two fuel lines: the app does not know which drive a ship has. The manoeuvre
 * line is said only while rules/ says that drive burns none.
 */
export function flightFuelWords(accelG: number, hours: number | null): { manoeuvre: string; reaction: string } | null {
    if (hours === null || !Number.isFinite(hours) || hours <= 0) return null;
    return {
        manoeuvre: MANOEUVRE_DRIVE_USES_FUEL ? '' : 'Manoeuvre drive: no fuel',
        reaction: reactionFuelWords(accelG, hours),
    };
}
