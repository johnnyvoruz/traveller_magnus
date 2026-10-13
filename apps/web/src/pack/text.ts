/**
 * Text the Player Pack is allowed to show. A token is read with the journal's
 * splitter. A hidden record becomes the words "a record", and the label stored
 * in the token is ignored. A hex token keeps the label the referee wrote, or
 * the hex key when that label is empty. Nothing here looks up a world's name.
 */
import type { CampaignRecord } from '@voyage/shared';
import { bodyParts } from '../workspace/journal/body.ts';

const TOKEN = /\[\[(cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|hex:[^/\]|]+\/\d{4})(?:\|([^\]]*))?\]\]/gi;

export type RedactCounts = { mentions: number };

function playersRecord(records: Readonly<Record<string, CampaignRecord>>, id: string): CampaignRecord | null {
    const found = records[id];
    if (!found || found.deleted || found.visibility !== 'players') return null;
    return found;
}

/** Written hex labels, in the order the tokens appear. An empty string means the token had none. */
function hexLabels(text: string): string[] {
    const labels: string[] = [];
    for (const match of text.matchAll(TOKEN)) {
        const target = match[1] ?? '';
        if (!target.startsWith('hex:')) continue;
        labels.push(match[2] ? match[2].trim() : '');
    }
    return labels;
}

/**
 * The text a player may read. `nameOf` inside the journal splitter returns a
 * player record's current name, and null for a hex and for anything hidden.
 */
export function redactText(
    text: string,
    records: Readonly<Record<string, CampaignRecord>>,
    counts: RedactCounts,
): string {
    const parts = bodyParts(text, (target) => {
        if (target.startsWith('hex:')) return null;
        const found = playersRecord(records, target);
        return found ? found.name : null;
    });
    const labels = hexLabels(text);
    let hexAt = 0;
    let out = '';
    for (const part of parts) {
        if (part.kind === 'text') {
            out += part.text;
            continue;
        }
        if (part.kind === 'hex') {
            const written = labels[hexAt] ?? '';
            hexAt += 1;
            out += written || part.hexKey;
            continue;
        }
        if (playersRecord(records, part.id)) out += playersRecord(records, part.id)!.name;
        else {
            out += 'a record';
            counts.mentions += 1;
        }
    }
    return out;
}
