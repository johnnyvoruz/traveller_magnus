/**
 * Replies under a journal entry (streams/D.md DU30; contracts/b_players.md "Replies"). Pure: the
 * thread from the campaign read with `parent`, what a post sends, and the words. A reply is a
 * players note whose `parent` is a live entry. The list never shows one as an entry; the thread
 * under the entry does, oldest first, one level under a reply and no deeper.
 */
import { mentionsOf } from '@voyage/shared/campaign_core';
import { CAMPAIGN_LIMITS, type CampaignEntry, type EntryChange } from '@voyage/shared';

/** One reply as the thread shows it: the row, who wrote it, and how many live replies it has. */
export type Reply = CampaignEntry & {
    /** The author's handle, '' when the account has none or the read did not say. */
    authorName: string;
    replies: number;
};

/** "No replies yet", "1 reply", "3 replies". */
export function replyWords(count: number): string {
    if (count <= 0) return 'No replies yet';
    return count === 1 ? '1 reply' : count + ' replies';
}

/** The campaign read for the rows under a parent. Records and links come back empty on it. */
export function threadPath(universeId: string, parentId: string, limit = 1000): string {
    return '/api/universes/' + encodeURIComponent(universeId) + '/campaign?after=0&limit=' + limit + '&parent=' + encodeURIComponent(parentId);
}

/** The campaign write: a reply posts and deletes through the same road an entry takes. */
export function changesPath(universeId: string): string {
    return '/api/universes/' + encodeURIComponent(universeId) + '/campaign/changes';
}

function oldestFirst(a: Reply, b: Reply): number {
    if (a.createdAt !== b.createdAt) return a.createdAt < b.createdAt ? -1 : 1;
    if (a.id < b.id) return -1;
    if (a.id > b.id) return 1;
    return 0;
}

/**
 * The thread from a read's journal rows: tombstones dropped, oldest first. `authorName` rides on
 * the row (the handle; the owner read and the member read both say it) and is lifted off before
 * the parse, as the store does. A row the parse refuses is left out. `rev` is 0 when the read
 * leaves it off (a member reads it only on their own notes).
 */
export function readThread(rows: readonly unknown[], parse: (row: Record<string, unknown>) => CampaignEntry): Reply[] {
    const out: Reply[] = [];
    for (const raw of rows) {
        if (!raw || typeof raw !== 'object' || Array.isArray(raw)) continue;
        const row = { ...(raw as Record<string, unknown>) };
        const authorName = typeof row.authorName === 'string' ? row.authorName : '';
        delete row.authorName;
        if (typeof row.rev !== 'number') row.rev = 0;
        let entry: CampaignEntry;
        try {
            entry = parse(row);
        } catch {
            continue;
        }
        if (entry.deleted) continue;
        out.push({ ...entry, authorName, replies: entry.replies ?? 0 });
    }
    return out.sort(oldestFirst);
}

/** The words a box sends: trimmed, within an entry's body. Null when there is nothing to post. */
export function replyText(typed: string): string | null {
    const text = typed.replace(/\r\n?/g, '\n').replace(/[ \t]+\n/g, '\n').trim();
    if (!text) return null;
    return text.slice(0, CAMPAIGN_LIMITS.entryBody);
}

/** The note a post sends: a players note under the parent, at rev 0. The id and the stamp are the caller's. */
export function replyChange(parentId: string, body: string, id: string, stamp: string): EntryChange {
    return {
        id,
        kind: 'note',
        title: '',
        body,
        when: null,
        realDate: null,
        sequence: null,
        author: 'players',
        visibility: 'players',
        anchor: null,
        mentions: mentionsOf(body),
        parent: parentId,
        rev: 0,
        createdAt: stamp,
        updatedAt: stamp,
        deleted: false,
        baseRev: 0,
    };
}

/** The reply a post made, as the thread shows it once the server has applied it at `rev`. */
export function postedReply(change: EntryChange, rev: number, authorName: string): Reply | null {
    if (!('kind' in change)) return null;
    const { baseRev, ...entry } = change;
    void baseRev;
    return { ...entry, rev, authorName, replies: 0 };
}

/** The tombstone a delete sends, on the revision held. */
export function deleteChange(reply: Pick<Reply, 'id' | 'rev'>): EntryChange {
    return { id: reply.id, baseRev: reply.rev, deleted: true };
}

/** The row again, as it was, on the revision the delete left. Undo sends this. */
export function restoreChange(reply: Reply, rev: number, stamp: string): EntryChange {
    const { authorName, replies, ...entry } = reply;
    void authorName;
    void replies;
    return { ...entry, mentions: [...entry.mentions], updatedAt: stamp, deleted: false, rev, baseRev: rev };
}

export const POST_FAILED = 'The reply wasn’t posted. Try again.';
export const READ_FAILED = 'The replies couldn’t be read. Try again.';
export const DELETE_FAILED = 'The reply wasn’t deleted. Try again.';

/**
 * The sentence a refusal shows: the server's own (a deleted parent, a rate limit, a note too many),
 * else the fallback. The server's word is the envelope's `error.message`.
 */
export function refusalWords(body: unknown, fallback: string): string {
    if (body && typeof body === 'object') {
        const error = (body as { error?: { message?: unknown } }).error;
        if (error && typeof error === 'object' && typeof error.message === 'string' && error.message.trim()) return error.message.trim();
    }
    return fallback;
}

/** What an open thread knows when the poll brings a count. */
export type ThreadState = {
    open: boolean;
    /** The rows read, null before the first read. */
    held: number | null;
    /** A read, a post or a delete is on its way. */
    busy: boolean;
};

/**
 * The poll moved the count (DF21): someone else posted or deleted under this parent, so an open
 * thread reads itself again. A thread that is closed, unread or busy waits; a post or a delete made
 * here has already set the count to the rows, so a count that matches reads nothing and nothing loops.
 */
export function threadStale(state: ThreadState, count: number): boolean {
    if (!state.open || state.held === null || state.busy) return false;
    return count !== state.held;
}

/** Who may delete a reply: the referee any, a player their own (the read sends `rev` only on those). */
export function mayDelete(reply: Pick<Reply, 'rev'>, role: 'owner' | 'player' | null, madeHere: boolean): boolean {
    if (role === 'owner') return true;
    if (role === 'player') return reply.rev > 0 || madeHere;
    return false;
}

/** The name over a reply: the handle, else "Players" (a players note is all a reply can be). */
export function authorWords(reply: Pick<Reply, 'authorName'>): string {
    const name = reply.authorName.trim();
    return name || 'Players';
}

/** "18 Oct 2026" from the reply's stamp, in the reader's own calendar. */
export function dateWords(iso: string): string {
    const time = Date.parse(iso);
    if (Number.isNaN(time)) return '';
    const d = new Date(time);
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    return d.getDate() + ' ' + months[d.getMonth()] + ' ' + d.getFullYear();
}
