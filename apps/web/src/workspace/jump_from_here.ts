/**
 * Jump to the destination from the vessel page (Lane D's DT7; Johnny's 126: "make sure the UX is intuitive and
 * that the numbers work for the ship's thrust"). A docked ship, the destination Find passengers and freight
 * chose, the sheet's Manoeuvre Drive Output: the two legs the orbit view would write, the flight from the world
 * to its 100-diameter limit and the jump with the file's rolled hours, and the words that say them before the
 * press. The flight's hours are the dossier's own tile for that G (the body's stored `journeyTimes`, the engine's
 * figure for 100 diameters at that thrust) or, where a body stores none, the same sum from its diameter
 * (orbit/estimates.ts flightHours over 100 × diamKm: the engine's formula, checked by the test). The jump's
 * hours are rules/mgt2e_space_travel.json's roll (campaign/travel.ts rollJumpHours). No rule of its own.
 * Pure, but for the session's targets, which are a reactive map.
 */
import { reactive } from 'vue';
import type { CampaignAnchor, TrackLeg } from '@voyage/shared';
import { HOUR } from '../orbit/clock.ts';
import { planMainworldKey, realPositionAu } from '../orbit/distance.ts';
import { flightHours, hoursWords, rollWords, type JumpRoll } from '../orbit/estimates.ts';
import { bodyOf, hundredDau, type Plan } from '../orbit/layout.ts';
import { ACCEL_CHOICES, flightLeg, jumpLeg, pointAnchor } from '../orbit/ship_list.ts';
import type { SheetValues } from './sheet_fields.ts';
import { stardate } from './stardate.ts';

export const THRUST_FIELD = 'Manoeuvre Drive Output';

/** The destination Find passengers and freight chose for a vessel: the world's hex, its name and the parsecs to it. */
export type TradeTarget = { hexKey: string; name: string; parsecs: number };

/** Each vessel's chosen destination, this session; cleared when the choice is. */
export const tradeTargets = reactive<Record<string, TradeTarget | null>>({});

export function setTradeTarget(vesselId: string, target: TradeTarget | null): void {
    tradeTargets[vesselId] = target;
}

export function tradeTargetOf(vesselId: string): TradeTarget | null {
    return tradeTargets[vesselId] ?? null;
}

export const NO_THRUST = 'Write Manoeuvre Drive Output on the ship sheet first.';
export const NOT_DOCKED = 'Under way, or holding at a point: the orbit view plots the next course.';
export const NO_TARGET = 'Choose a destination on Find passengers and freight to jump to it from here.';
export const NO_PICTURE = 'The orbit view plots this one: the picture has no 100-diameter figure for where the ship is.';
export const READING = 'Reading the system…';

/** The sheet's thrust as a whole G the console offers (1 to 6); null for anything else, and the button says why. */
export function thrustOf(values: SheetValues | null | undefined): number | null {
    const raw = values ? values[THRUST_FIELD] : undefined;
    if (typeof raw !== 'string' || !raw.trim()) return null;
    const match = raw.replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
    if (!match) return null;
    const n = Number(match[0]);
    return ACCEL_CHOICES.includes(n as (typeof ACCEL_CHOICES)[number]) ? n : null;
}

export type LimitFlight = {
    /** The flight's hours at the thrust. */
    hours: number;
    /** 100 diameters of the body, in km. */
    km: number;
    /** The point on the 100-diameter circle, in AU from the primary, straight out from the body. */
    point: { x: number; y: number };
    label: string;
    /** True when the hours are the body's stored tile; false when they were summed from its diameter. */
    fromTile: boolean;
};

/**
 * The flight from the body the ship is at (a bare system anchor is the mainworld, as the orbit view and C's
 * CF11 read it) to its 100-diameter limit, at `accelG`. Null when the picture has no such body, no diameter,
 * or no absolute place for it (a moon), and the orbit view is the plotter.
 */
export function limitFlight(plan: Plan, atKey: string | null, departs: number, accelG: number): LimitFlight | null {
    const key = atKey ?? planMainworldKey(plan);
    if (!key) return null;
    const body = bodyOf(plan, key);
    if (!body) return null;
    const diamKm = typeof body.diamKm === 'number' && body.diamKm > 0 ? body.diamKm : null;
    if (diamKm === null) return null;
    const km = 100 * diamKm;
    const times = Array.isArray(body.journeyTimes) ? body.journeyTimes as unknown[] : null;
    const tile = times && typeof times[accelG - 1] === 'number' && (times[accelG - 1] as number) > 0 ? times[accelG - 1] as number : null;
    const hours = tile ?? flightHours(km, accelG);
    if (hours === null) return null;
    const at = realPositionAu(plan, key, departs);
    if (!at) return null;
    const r = Math.hypot(at.x, at.y);
    const ux = r > 0 ? at.x / r : 1;
    const uy = r > 0 ? at.y / r : 0;
    const ring = hundredDau(diamKm);
    return {
        hours,
        km,
        point: { x: at.x + ux * ring, y: at.y + uy * ring },
        label: '100D limit of ' + String(body.name || plan.name || 'the world'),
        fromTile: tile !== null,
    };
}

export type JumpPlan = { flight: TrackLeg; jump: TrackLeg; roll: JumpRoll; parsecs: number; accelG: number };

/** The two legs: the flight to the limit, then the jump from that point, the rolled hours after the flight arrives. */
export function jumpFromHere(hexKey: string, from: CampaignAnchor, limit: LimitFlight, target: TradeTarget, departs: number, accelG: number, roll: JumpRoll): JumpPlan | null {
    const point = pointAnchor(hexKey, limit.point, limit.label);
    const flight = flightLeg(from, point, departs, limit.hours, accelG);
    if (!flight) return null;
    const to: CampaignAnchor = { kind: 'system', hexKey: target.hexKey, locationLabel: target.name };
    const jump = jumpLeg(point, to, flight.arrives, roll.hours);
    if (!jump) return null;
    return { flight, jump, roll, parsecs: target.parsecs, accelG };
}

function parsecWords(parsecs: number): string {
    return parsecs + (parsecs === 1 ? ' parsec' : ' parsecs');
}

/** "Flight to the jump limit, 1 G, about 6.3 h · Jump 1 parsec, 182 h (148 + 34) · arrives 023-1105". */
export function jumpWords(plan: JumpPlan): string {
    const flightH = (plan.flight.arrives - plan.flight.departs) / HOUR;
    return 'Flight to the jump limit, ' + plan.accelG + ' G, ' + hoursWords(flightH)
        + ' · Jump ' + parsecWords(plan.parsecs) + ', ' + plan.roll.hours + ' h (' + rollWords(plan.roll).replace(/ = .*$/, '') + ')'
        + ' · arrives ' + stardate(plan.jump.arrives).date;
}

/** The toast after the press. */
export function jumpedWords(plan: JumpPlan, shipName: string, destination: string): string {
    return shipName + ': flight to the jump limit, then jump to ' + destination + ', arrives ' + stardate(plan.jump.arrives).date + '.';
}
