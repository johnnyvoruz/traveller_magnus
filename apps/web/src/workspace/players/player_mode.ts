/**
 * The player's campaign panel (players_build_plan.md P6): who is looking, the player's one way to
 * write (a players note), and which notes are their own to edit. The store already holds only the
 * projection for a player (A's P3), and refuses any other change (campaign/commit.ts).
 */
import { computed, reactive } from 'vue';
import type { CampaignEntry } from '@voyage/shared';
import { draftNote, saveEntry } from '../../campaign/journal.ts';
import { campaign } from '../../campaign/store.ts';
import { justMade } from '../journal/create.ts';

/** The panel is a player's: theirs as a member, or the referee viewing as players. */
export const isPlayerView = computed(() => campaign.role === 'player');

export const BUILD_REFEREE = "Build is the referee's.";

/** Notes this player made in this session: theirs before the server has given them a revision. */
const madeHere = reactive(new Set<string>());

/**
 * A player's own note: a players note they wrote. The server sends `rev` only on the caller's own
 * notes (contract, member read), so a revision marks it; a note made in this session counts at once.
 */
export function ownNote(entry: Pick<CampaignEntry, 'id' | 'kind' | 'author' | 'visibility' | 'rev'> | null | undefined): boolean {
    if (!entry || entry.kind !== 'note' || entry.author !== 'players' || entry.visibility !== 'players') return false;
    return entry.rev > 0 || madeHere.has(entry.id);
}

/** The note a player may write: kind note, by the players, for the players, with no images. */
export function playerNoteDraft(): CampaignEntry {
    const { images: _images, ...draft } = draftNote();
    return { ...draft, author: 'players', visibility: 'players' };
}

/** "Add a note": a new players note, opened on its body. Null when the campaign is not open. */
export function createPlayerNote(): string | null {
    const entry = playerNoteDraft();
    if (!saveEntry(entry)) return null;
    madeHere.add(entry.id);
    justMade.value = { id: entry.id, focus: 'body' };
    return entry.id;
}
