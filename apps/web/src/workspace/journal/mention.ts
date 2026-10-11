/**
 * Typing @ in a journal body (campaign gap audit step 4). Pure: the token is the one
 * mentionsOf already reads, `[[cr_<uuid>|label]]`. Nothing here writes the store.
 */

export type MentionSource = {
    id: string;
    name: string;
    summary: string;
    tags: readonly string[];
    type: string;
    deleted: boolean;
};

/** How many rows the list holds. The picker's list is one screenful; this matches that cap's visible intent. */
export const MENTION_CAP = 8;

const WORD = /[0-9A-Za-z_]/;

function isSpace(char: string): boolean {
    return /\s/.test(char);
}

/**
 * The @ being typed at the caret, when it starts a word. An @ after a letter
 * (an email address) is not one. `start` is the index of the @.
 */
export function mentionQuery(text: string, caret: number): { start: number; query: string } | null {
    if (caret < 0 || caret > text.length) return null;
    let start = caret;
    while (start > 0 && !isSpace(text.charAt(start - 1))) start -= 1;
    if (start >= text.length || text.charAt(start) !== '@') return null;
    if (start > 0 && WORD.test(text.charAt(start - 1))) return null;
    return { start, query: text.slice(start + 1, caret) };
}

/** The token mentionsOf parses, plus the label the chip falls back to. `]` and `|` cannot sit in a label. */
export function mentionToken(id: string, name: string): string {
    const label = name.replace(/[\]|\r\n]/g, '').trim();
    return label ? '[[' + id + '|' + label + ']]' : '[[' + id + ']]';
}

const TOKEN_BEFORE = /\[\[(cr_[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}|hex:[^/\]|]+\/\d{4})(?:\|[^\]]*)?\]\] ?$/i;

/**
 * When the caret is straight after a mention token, or after the space that
 * follows it, Backspace removes the whole token. Returns the range to delete.
 */
export function mentionBackspace(text: string, caret: number): { from: number; to: number } | null {
    if (caret <= 0 || caret > text.length) return null;
    const before = text.slice(0, caret);
    const match = TOKEN_BEFORE.exec(before);
    if (!match || match.index == null) return null;
    return { from: match.index, to: caret };
}

/** Live records whose name, summary, or tags contain every word, soonest in the alphabet first. */
export function filterMentions<T extends MentionSource>(
    records: Readonly<Record<string, T>>,
    query: string,
    cap: number = MENTION_CAP,
): T[] {
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);
    const out: T[] = [];
    for (const record of Object.values(records)) {
        if (record.deleted) continue;
        const hay = (record.name + '\n' + record.summary + '\n' + record.tags.join('\n')).toLowerCase();
        if (!words.every((word) => hay.includes(word))) continue;
        out.push(record);
    }
    out.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base', numeric: true }) || (a.id < b.id ? -1 : 1));
    return out.slice(0, cap);
}
