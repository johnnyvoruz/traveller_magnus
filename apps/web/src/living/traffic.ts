/**
 * Background ships for one system (spec_living_systems.md §3.4 and §3.5).
 * A day bucket builds a schedule of ShipTracks. Nothing is stored.
 * Placement stays in placeShips. The travel times are the generated
 * space-travel formula at the dial acceleration, and jump hours are the
 * generated jump duration.
 */
import { hashString, mulberry32, shipNameFor, type CampaignAnchor, type ChatterLineData } from '@voyage/shared';
import { positionAt } from '../campaign/track.ts';
import { rollJumpHours, transitSeconds } from '../campaign/travel.ts';
import { eligible } from './chatter.ts';
import { resolveSlots } from './comms/corpus_events.ts';
import type { SystemFacts } from './facts.ts';
import {
    DOCK_HOURS_MAX, DOCK_HOURS_MIN, EDGE_MARGIN, FAST_DAYS_PER_SECOND, FLIGHT_G, ROLE_SHAPE, SKIM_SHARE,
    roleCounts, roleWord, type RoleCounts, type TrafficProfile, type TrafficRole,
} from './roles.ts';
import type { ShipTrack } from '../orbit/ships.ts';
import { AU_KM } from '../orbit/layout.ts';

export { FAST_DAYS_PER_SECOND };

const HOUR = 1 / 24;
const DAY_SECONDS = 86400;
/** A jump's other end is not this system, so the arrival bubble is the edge point. */
const AWAY_HEX = 'Jump/0000';

export type TrafficBody = {
    key: string;
    x: number;
    y: number;
    jumpAU: number;
    mainworld: boolean;
    gasGiant: boolean;
    belt: boolean;
};

export type TrafficShip = ShipTrack & {
    roleWord: string;
    line: string;
};

export type TrafficInput = {
    hexKey: string;
    truthVersion: string;
    profile: TrafficProfile;
    bodies: readonly TrafficBody[];
    facts?: SystemFacts | null;
    lines?: readonly ChatterLineData[];
};

type Point = { x: number; y: number };

function away(): CampaignAnchor {
    return { kind: 'system', hexKey: AWAY_HEX };
}

function atBody(hexKey: string, key: string): CampaignAnchor {
    return { kind: 'system', hexKey, bodyKey: key };
}

function atPoint(hexKey: string, point: Point): CampaignAnchor {
    return { kind: 'system', hexKey, point: { x: point.x, y: point.y } };
}

function kmBetween(a: Point, b: Point): number {
    return Math.hypot(a.x - b.x, a.y - b.y) * AU_KM;
}

/** Days from rest to rest. A zero distance is one hour, so a leg still has a length. */
function flightDays(km: number): number {
    if (!Number.isFinite(km) || km <= 0) return HOUR;
    return transitSeconds(km, FLIGHT_G) / DAY_SECONDS;
}

function mainOf(bodies: readonly TrafficBody[]): TrafficBody | null {
    return bodies.find((body) => body.mainworld) ?? null;
}

function shipLine(id: string, name: string, facts: SystemFacts | null | undefined, lines: readonly ChatterLineData[] | undefined): string {
    if (!facts || !lines || lines.length === 0) return '';
    const pool = lines.filter((line) => line.category === 'ship' && eligible(line, facts) && resolveSlots(line.text, facts, [name, name]) !== null);
    if (pool.length === 0) return '';
    const pick = pool[Math.floor(mulberry32(hashString(id + '|line'))() * pool.length)];
    return resolveSlots(pick.text, facts, [name, name]) ?? '';
}

type Leg = ShipTrack['legs'][number];

function push(legs: Leg[], from: CampaignAnchor, to: CampaignAnchor, departs: number, days: number, mode: Leg['mode']): number {
    const arrives = departs + Math.max(days, HOUR / 60);
    legs.push({ from, to, departs, arrives, mode, ...(mode === 'flight' ? { accelG: FLIGHT_G } : {}) });
    return arrives;
}

function buildOne(
    input: TrafficInput,
    bucket: number,
    index: number,
    role: TrafficRole,
    main: TrafficBody,
    gas: TrafficBody | null,
    belt: TrafficBody | null,
): TrafficShip {
    const id = 'traffic:' + bucket + ':' + index;
    const rng = mulberry32(hashString(input.hexKey + '|' + input.truthVersion + '|' + bucket + '|' + index));
    const name = shipNameFor(Math.floor(rng() * 0x100000000));
    const arrivalHour = rng() * 24;
    const dockHours = DOCK_HOURS_MIN + rng() * (DOCK_HOURS_MAX - DOCK_HOURS_MIN);
    const skim = rng() < SKIM_SHARE;
    const bearing = rng() * Math.PI * 2;
    const jumpDays = rollJumpHours(rng).hours / 24;
    const hold = dockHours / 24;
    const radius = Math.max(main.jumpAU, 0) * EDGE_MARGIN;
    const edge = { x: main.x + radius * Math.cos(bearing), y: main.y + radius * Math.sin(bearing) };
    const hex = input.hexKey;
    const world = atBody(hex, main.key);
    const edgeAnchor = atPoint(hex, edge);
    const legs: Leg[] = [];
    let t = bucket;

    if (role === 'shuttle') {
        for (let hop = 0; hop < 24; hop += 1) t = push(legs, world, world, t, HOUR, 'flight');
    } else if (role === 'patrol') {
        t = push(legs, world, world, t, hold, 'orbit');
        t = push(legs, world, edgeAnchor, t, flightDays(kmBetween(main, edge)), 'flight');
        t = push(legs, edgeAnchor, world, t, flightDays(kmBetween(edge, main)), 'flight');
        if (t < bucket + 1) t = push(legs, world, world, t, bucket + 1 - t, 'orbit');
    } else if (role === 'scout') {
        if (belt) {
            t = push(legs, world, atBody(hex, belt.key), t, flightDays(kmBetween(main, belt)), 'flight');
            t = push(legs, atBody(hex, belt.key), atBody(hex, belt.key), t, hold, 'docked');
            t = push(legs, atBody(hex, belt.key), world, t, flightDays(kmBetween(belt, main)), 'flight');
        }
        if (t < bucket + 1) push(legs, world, world, t, bucket + 1 - t, 'docked');
    } else if (role === 'xboat' || role === 'trader' || role === 'liner') {
        t = bucket + arrivalHour / 24;
        t = push(legs, away(), edgeAnchor, t - jumpDays, jumpDays, 'jump');
        t = push(legs, edgeAnchor, world, t, flightDays(kmBetween(edge, main)), 'flight');
        t = push(legs, world, world, t, hold, 'docked');
        const goSkim = role === 'trader' && skim && gas !== null;
        if (goSkim && gas) {
            t = push(legs, world, atBody(hex, gas.key), t, flightDays(kmBetween(main, gas)), 'flight');
            t = push(legs, atBody(hex, gas.key), atBody(hex, gas.key), t, hold, 'docked');
            t = push(legs, atBody(hex, gas.key), edgeAnchor, t, flightDays(kmBetween(gas, edge)), 'flight');
        } else {
            t = push(legs, world, edgeAnchor, t, flightDays(kmBetween(main, edge)), 'flight');
        }
        push(legs, edgeAnchor, away(), t, jumpDays, 'jump');
    }

    const word = roleWord(role, (hashString(id) & 1) === 1);
    return {
        id,
        name,
        kind: 'traffic',
        shape: ROLE_SHAPE[role],
        legs,
        roleWord: word,
        line: shipLine(id, name, input.facts, input.lines),
    };
}

function rolesOf(counts: RoleCounts): TrafficRole[] {
    const roles: TrafficRole[] = [];
    const order: TrafficRole[] = ['liner', 'patrol', 'scout', 'xboat', 'trader', 'shuttle'];
    for (const role of order) {
        for (let i = 0; i < counts[role]; i += 1) roles.push(role);
    }
    return roles;
}

function bucketShips(input: TrafficInput, bucket: number): TrafficShip[] {
    const main = mainOf(input.bodies);
    if (!main) return [];
    const gas = input.bodies.find((body) => body.gasGiant) ?? null;
    const belt = input.bodies.find((body) => body.belt) ?? null;
    return rolesOf(roleCounts(input.profile)).map((role, index) => buildOne(input, bucket, index, role, main, gas, belt));
}

/**
 * Ships for the buckets around `day`: the one they arrive in, and the day
 * on either side, so a leg that crosses midnight is the same ship.
 */
export function trafficSchedule(input: TrafficInput, day: number): TrafficShip[] {
    const bucket = Math.floor(day);
    const ships: TrafficShip[] = [];
    for (const at of [bucket - 1, bucket, bucket + 1]) ships.push(...bucketShips(input, at));
    return ships;
}

/** True when the ship is docked, in orbit, or holding, not in flight and not in jump. */
export function trafficAtRest(track: ShipTrack, days: number): boolean {
    const at = positionAt(track.legs, days);
    if (!at) return false;
    return !('fraction' in at);
}

/** The edge point of a jump leg, in AU from the primary's frame the caller used. */
export function jumpEdge(track: ShipTrack, hexKey: string): { x: number; y: number } | null {
    for (const leg of track.legs) {
        if (leg.mode !== 'jump') continue;
        const point = edgePoint(leg.to, hexKey) ?? edgePoint(leg.from, hexKey);
        if (point) return point;
    }
    return null;
}

function edgePoint(anchor: CampaignAnchor, hexKey: string): { x: number; y: number } | null {
    if (!anchor || anchor.kind !== 'system' || anchor.hexKey !== hexKey || !anchor.point) return null;
    return anchor.point;
}
