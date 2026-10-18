/**
 * Stable callsigns for one system (ZC1; brief 5A). Seeded by (hexKey, truthVersion)
 * only, so the same ships live here on every day and every revisit. The names are
 * the prototype's list (engine/chatterProcedural.ts `actors`).
 */
import { hashString, mulberry32 } from '@voyage/shared';

const BASES = [
    'Lark', 'Second Wind', 'Tern', 'Odd Job', 'Morrow', 'Peregrine',
    'Eighth Day', 'Cassia', 'Blackcap', 'June', 'Nightingale', 'Leda',
    'Quiet Hours', 'Trinity', 'Kiln', 'Long Haul', 'Barley', 'Mica',
    'Road Home', 'Wayward', 'Nettle', 'Hannah', 'Common Cause', 'Gannet',
] as const;

export const ROSTER_SIZE = 12;

export type Rng = () => number;

/** One seeded draw source. Every comms module seeds through here. */
export function seeded(key: string): Rng {
    return mulberry32(hashString(key));
}

export function pick<T>(r: Rng, xs: readonly T[]): T {
    return xs[Math.floor(r() * xs.length)] as T;
}

export function between(r: Rng, min: number, max: number): number {
    return Math.floor(r() * (max - min + 1)) + min;
}

/** Twelve distinct resident callsigns, the same for a (hexKey, truthVersion). */
export function rosterFor(hexKey: string, truthVersion: string): string[] {
    const r = seeded(`${hexKey}|${truthVersion}|residents`);
    const out: string[] = [];
    let guard = 0;
    while (out.length < ROSTER_SIZE && guard < 500) {
        guard += 1;
        const name = `${pick(r, BASES)} ${between(r, 2, 79)}`;
        if (!out.includes(name)) out.push(name);
    }
    return out;
}

/** Two different residents for one event. */
export function pairFrom(roster: readonly string[], r: Rng): { ship: string; other: string } {
    const first = between(r, 0, roster.length - 1);
    const second = (first + between(r, 1, roster.length - 1)) % roster.length;
    return { ship: roster[first] as string, other: roster[second] as string };
}