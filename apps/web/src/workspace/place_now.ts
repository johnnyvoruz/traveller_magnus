/**
 * Where a record is now, in words (streams/D.md DF14). A ship on its track is where the track puts it
 * at the campaign date, in the Party tab's words when under way; anything else is where its anchor
 * says. The record card, the record page's header, the records list and the relationship web all
 * say the same place, as the Where block does.
 */
import type { CampaignRecord } from '@voyage/shared';
import { campaign } from '../campaign/store.ts';
import { campaignDays, vesselWhere } from './party_where.ts';
import { placeLine } from './records.ts';

export function placeNow(record: CampaignRecord): string {
    if (record.type !== 'vessel') return placeLine(record, campaign.records);
    // The tracks are indexed outside the reactive rows: the sequence is what changes when one does.
    void campaign.seq;
    const at = vesselWhere(record, campaign.records, campaignDays(campaign.clock));
    return at.underway ? at.underway.text : placeLine({ ...record, anchor: at.anchor }, campaign.records);
}
