/**
 * What the vessel page does to a track: the last leg removed, said in a toast that puts it
 * back. The writes are campaign/track.ts's (removeLastLeg, appendLeg); this adds the words.
 */
import { appendLeg, removeLastLeg, trackOf } from '../campaign/track.ts';
import { campaign } from '../campaign/store.ts';
import { showToast } from '../shell/toast.ts';
import { legWords, trackRows } from './track_rows.ts';

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
