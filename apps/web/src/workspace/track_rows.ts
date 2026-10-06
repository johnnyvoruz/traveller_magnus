/**
 * A vessel's track as its record page lists it (K12, the track as a record): each leg as a
 * row of words, the oldest first, and the commands the section's controls run. Pure: it runs
 * under Node. The legs are campaign/track.ts's; nothing here is a travel rule.
 */
import type { CampaignAnchor, CampaignRecord, TrackLeg } from '@voyage/shared';
import { whenWords } from '../orbit/ship_list.ts';
import { resolveAnchor } from './party.ts';
import { placeWords } from './places.ts';

export type TrackRow = {
    /** The leg's place in the track, from 1. */
    n: number;
    mode: TrackLeg['mode'];
    modeWords: string;
    /** "Regina A-I → Regina A-IV", or the one place of a leg that goes nowhere. */
    from: string;
    to: string;
    moves: boolean;
    departs: string;
    arrives: string;
    /** "2 G" for a flight that says its acceleration, else empty. */
    accel: string;
    note: string;
};

const MODE_WORDS: Record<TrackLeg['mode'], string> = {
    flight: 'Flight',
    jump: 'Jump',
    docked: 'Docked',
    orbit: 'In orbit',
};

/** The section's commands: registered while a vessel's page is open, each named by one control. */
export const TRACK_COMMANDS = [
    { id: 'track-remove-last', name: 'Remove the last leg of the track' },
    { id: 'track-orbit', name: 'Plot a course in the orbit view' },
] as const;

/** How many legs the page shows before the earlier ones fold away. */
export const TRACK_SHOWN = 8;

/** An end of a leg in words: the body or the system, as the Where block says a place. */
export function anchorName(anchor: CampaignAnchor, records: Readonly<Record<string, CampaignRecord>>): string {
    const place = resolveAnchor(anchor, records);
    return place ? placeWords(place)[0] : 'Nowhere';
}

export function trackRows(legs: readonly TrackLeg[], records: Readonly<Record<string, CampaignRecord>>): TrackRow[] {
    return legs.map((leg, at) => {
        const from = anchorName(leg.from, records);
        const to = anchorName(leg.to, records);
        return {
            n: at + 1,
            mode: leg.mode,
            modeWords: MODE_WORDS[leg.mode],
            from,
            to,
            moves: from !== to,
            departs: whenWords(leg.departs),
            arrives: whenWords(leg.arrives),
            accel: leg.mode === 'flight' && leg.accelG ? leg.accelG + ' G' : '',
            note: leg.note ?? '',
        };
    });
}

/** The rows on show: all of them, or the last TRACK_SHOWN with the count of those folded away. */
export function shownRows(rows: readonly TrackRow[], all: boolean): { rows: readonly TrackRow[]; earlier: number } {
    if (all || rows.length <= TRACK_SHOWN) return { rows, earlier: 0 };
    return { rows: rows.slice(rows.length - TRACK_SHOWN), earlier: rows.length - TRACK_SHOWN };
}

/** A leg in one line, for the toast that says it went. */
export function legWords(row: TrackRow): string {
    return row.moves ? row.from + ' → ' + row.to : row.modeWords + ' at ' + row.to;
}
