/**
 * The four ways an entry starts (journal design §3). The session and the note come from the
 * store's drafts. A handout starts for the players; a rumour stays with the referee.
 * The screen clears a session's title: the store's draft names it "Session N", and the row
 * already says that from the number when the title is empty.
 */
import { ref } from 'vue';
import type { CampaignEntryKind } from '@voyage/shared';
import { draftNote, draftSession, saveEntry } from '../../campaign/journal.ts';

/** The entry just made, so its page opens on the title or the body. */
export const justMade = ref<{ id: string; focus: 'title' | 'body' } | null>(null);

function commitNew(entry: Parameters<typeof saveEntry>[0], focus: 'title' | 'body'): string | null {
    if (!saveEntry(entry)) return null;
    justMade.value = { id: entry.id, focus };
    return entry.id;
}

export function createSession(): string | null {
    const draft = draftSession();
    return commitNew({ ...draft, title: '' }, 'title');
}

export function createNote(): string | null {
    return commitNew(draftNote(), 'body');
}

export function createHandout(): string | null {
    const draft = draftNote();
    return commitNew({ ...draft, kind: 'handout', visibility: 'players' }, 'title');
}

export function createRumour(): string | null {
    const draft = draftNote();
    return commitNew({ ...draft, kind: 'rumor' }, 'title');
}

export function createEntry(kind: CampaignEntryKind): string | null {
    if (kind === 'session') return createSession();
    if (kind === 'note') return createNote();
    if (kind === 'handout') return createHandout();
    return createRumour();
}
