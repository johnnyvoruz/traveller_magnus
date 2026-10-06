/**
 * What the screens do to a track: the last leg removed on the vessel's page, and the party's
 * ship docked somewhere from "Move the party", each said in a toast that undoes it. The
 * writes are campaign/track.ts's (removeLastLeg, appendLeg); this adds the words.
 */
import type { CampaignAnchor } from '@voyage/shared';
import { appendLeg, removeLastLeg, trackOf } from '../campaign/track.ts';
import { campaign } from '../campaign/store.ts';
import { whenWords } from '../orbit/ship_list.ts';
import { showToast } from '../shell/toast.ts';
import { dockedLeg, moveRefusal } from './party_where.ts';
import { anchorName, legWords, trackRows } from './track_rows.ts';

/** Removes the vessel's last leg. Undo appends the same leg again. */
export function removeLastTrackLeg(recordId: string): boolean {
    const record = campaign.records[recordId];
    const legs = record && !record.deleted ? trackOf(record) : null;
    if (!record || !legs || !legs.length) return false;
    const leg = legs[legs.length - 1];
    const rows = trackRows(legs, campaign.records);
    const result = removeLastLeg(recordId);
    if (!result.ok) {
        showToast(result.message);
        return false;
    }
    showToast('Removed the last leg of ' + record.name + ': ' + legWords(rows[rows.length - 1]) + '.', {
        action: {
            label: 'Undo',
            run: () => {
                const back = appendLeg(recordId, leg);
                if (!back.ok) showToast(back.message);
            },
        },
    });
    return true;
}

/**
 * "Move the party" for a ship that has a track: one docked leg at the place, at the campaign
 * date. A track that cannot take it (a later leg, the ship still under way, nowhere to dock)
 * says why and what to do, and nothing is written. Undo removes the leg.
 */
export function dockShipAt(recordId: string, anchor: CampaignAnchor, days: number): boolean {
    const record = campaign.records[recordId];
    const legs = record && !record.deleted ? trackOf(record) : null;
    if (!record || !legs) return false;
    if (!anchor) {
        showToast(record.name + ' has a track, so it cannot be nowhere. Pick a place, or remove its legs on the ship’s page.');
        return false;
    }
    const refusal = moveRefusal(record.name, legs, days);
    if (refusal) {
        showToast(refusal);
        return false;
    }
    const result = appendLeg(recordId, dockedLeg(anchor, days));
    if (!result.ok) {
        showToast(result.message);
        return false;
    }
    showToast(record.name + ' docked at ' + anchorName(anchor, campaign.records) + ', ' + whenWords(days) + '.', {
        action: {
            label: 'Undo',
            run: () => {
                const back = removeLastLeg(recordId);
                if (!back.ok) showToast(back.message);
            },
        },
    });
    return true;
}
