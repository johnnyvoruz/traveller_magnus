/**
 * Text the Player Pack is allowed to show. The words come from the players
 * projection (`redactString`): a fence is dropped, a hidden record's token
 * becomes "a record", a players record's token becomes its name, a hex token
 * keeps the label the referee wrote or the hex key, and a bare hidden id is
 * replaced. The mention count is the pack's own: the projection does not count.
 */
import { redactString, stripRefereeBlocks, type CampaignRecord } from '@voyage/shared';
import { bodyParts } from '../workspace/journal/body.ts';

export type RedactCounts = { mentions: number };

function hiddenIds(records: Readonly<Record<string, CampaignRecord>>): string[] {
    const ids: string[] = [];
    for (const record of Object.values(records)) {
        if (!record || record.deleted || record.visibility !== 'players') ids.push(record.id);
    }
    return ids;
}

/** Hidden record tokens in text that has already had its referee fences removed. */
function hiddenMentions(open: string, records: Readonly<Record<string, CampaignRecord>>): number {
    let n = 0;
    for (const part of bodyParts(open, () => null)) {
        if (part.kind !== 'record') continue;
        const found = records[part.id];
        if (!found || found.deleted || found.visibility !== 'players') n += 1;
    }
    return n;
}

/**
 * The text a player may read. `counts.mentions` grows by each hidden record
 * token. A hex token is not a mention.
 */
export function redactText(
    text: string,
    records: Readonly<Record<string, CampaignRecord>>,
    counts: RedactCounts,
): string {
    const open = stripRefereeBlocks(text);
    counts.mentions += hiddenMentions(open, records);
    return redactString(text, Object.values(records), hiddenIds(records));
}
