/**
 * Who is offered "Publish records", and what the publish dialog says first. One gate for the
 * campaign's records list (CampaignList.vue) and a record's own page (RecordPage.vue), so the two
 * agree: the open campaign's owner, signed in, with the page not read-only and a record to publish.
 * The owner test is the one the store's own publish checks use (ownUniverse in market.ts).
 */
import { ownUniverse, REFEREE_ONLY_NOTE, signedIn } from './market.ts';

/** Publish records is offered: not read-only, at least one record, signed in, and the open campaign is the person's own. */
export function canPublishRecords(readOnly: boolean, records: number): boolean {
    return !readOnly && records > 0 && signedIn() && ownUniverse() !== null;
}

/**
 * The line that leads the Publish records dialog when some chosen record is referee-only. One record:
 * the sentence. More: the count, then the same promise said of each. Either way it says the whole record
 * goes out (its referee-only text, its player notes and its sheet), not only the "For players" text.
 */
export function refereeLead(count: number): string {
    if (count <= 1) return REFEREE_ONLY_NOTE;
    return count + ' of the chosen records are referee-only. Publishing sends each whole record: its referee-only text, its player notes and its sheet.';
}
