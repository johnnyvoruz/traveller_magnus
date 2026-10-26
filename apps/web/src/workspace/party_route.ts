/**
 * Your own ships' routes on the map (prompts/d_store_3.md item 3; Johnny, 2026-10-16: "draw your
 * own ships' routes the same way"). While the Party tab is open, the lead ship's route; while one of
 * the party's ships is open as a record (pressed in the Party tab or on the map), that ship's. The
 * legs come from the campaign's records at the campaign date through the same shared functions the
 * server uses for the public card, so the two drawings agree. The referee sees the course ahead
 * whatever "Publish my ships' course" says: that switch is about the public card only.
 *
 * Pure: it runs under Node. The two shared leg functions read a track with the zod schemas, which load
 * with the campaign (platform/schemas.ts, ZP2): a vessel record is only here once that load is done.
 */
import type { CampaignRecord } from '@voyage/shared';
import { schemas } from '../platform/schemas.ts';
import type { Pane } from '../shell/pane.ts';
import { leadVesselId } from './party.ts';

export type PartyRoute = { legs: { from: string; to: string }[]; course: { from: string; to: string }[] };

/** The ship whose route shows, or null: a party ship open as a record, else the lead while the Party tab is open. */
export function routeShipId(pane: Pane, party: { vesselIds?: readonly string[] | null } | null): string | null {
    if (!party) return null;
    const ids = Array.isArray(party.vesselIds) ? party.vesselIds : [];
    if (pane.kind === 'campaign' && pane.record && ids.includes(pane.record)) return pane.record;
    if (pane.kind === 'party') return leadVesselId(party);
    return null;
}

/** That ship's finished legs and course ahead at `days`; null when it has neither on the chart. */
export function partyRoute(vesselId: string | null, records: Readonly<Record<string, CampaignRecord>>, days: number): PartyRoute | null {
    if (!vesselId) return null;
    const vessel = records[vesselId];
    if (!vessel || vessel.deleted || vessel.type !== 'vessel') return null;
    // A track is in time order (the Track schema refuses any other), so the legs chain as stored.
    const ends = (leg: { from: string; to: string }) => ({ from: leg.from, to: leg.to });
    const { publicCourseLegs, publicFinishedLegs } = schemas();
    const legs = publicFinishedLegs(vessel, records, days).map(ends);
    const course = publicCourseLegs(vessel, records, days).map(ends);
    return legs.length > 0 || course.length > 0 ? { legs, course } : null;
}
