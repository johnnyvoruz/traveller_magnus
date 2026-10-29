/**
 * The referee's players screens, the words and the small rules (players_build_plan.md P5;
 * contracts/b_players.md "Words for the screens"). Pure: it runs under Node.
 */
import { playersView, type CampaignRead } from '@voyage/shared';

/** The most active players one campaign can have (the contract's `campaign_full`). */
export const PLAYERS_CAP = 255;
export const PLAYERS_FULL = 'This campaign has 255 players, the most it can have.';

export function isFull(playing: number): boolean {
    return playing >= PLAYERS_CAP;
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

/** A real-world date from the server, as "November 16, 2026". Empty when it cannot be read. */
export function realDate(iso: string): string {
    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) return '';
    return MONTHS[at.getUTCMonth()] + ' ' + at.getUTCDate() + ', ' + at.getUTCFullYear();
}

/** How often the link has been used. */
export function usesWords(uses: number): string {
    if (uses <= 0) return 'Not used yet';
    return uses === 1 ? 'Used once' : 'Used ' + uses + ' times';
}

/**
 * The link as the Players section shows it: what the invite write answers, or what the read brings
 * back after a reload (DU33), which has no uses count.
 */
export type InviteShown = { url: string; expiresAt: string; uses?: number };

/** The line under the link: when it stops working, and how often it has been used (left out when the read does not say). */
export function inviteLine(invite: { expiresAt: string; uses?: number }): string {
    const date = realDate(invite.expiresAt);
    const until = date ? 'Works until ' + date : 'Works for 30 days';
    return invite.uses === undefined ? until : until + ' · ' + usesWords(invite.uses);
}

export type MemberRow = {
    userId: string;
    handle: string;
    personId: string | null;
    joined: string;
    status: 'active' | 'archived';
    archivedAt: string | null;
    archivedBy: 'owner' | 'self' | null;
};

/** The line under a player's name: when they joined, or when and how they stopped playing. */
export function memberLine(member: MemberRow): string {
    if (member.status === 'archived') {
        const date = member.archivedAt ? realDate(member.archivedAt) : '';
        const how = member.archivedBy === 'self' ? 'Left' : 'Archived';
        return date ? how + ' on ' + date : how;
    }
    const date = realDate(member.joined);
    return date ? 'Joined ' + date : 'Playing';
}

/**
 * The people a player can be ("Which one"): the party's people as players see the campaign, by
 * name. The server accepts no one else (contract: a person in the projected party).
 */
export function partyPeople(read: CampaignRead): { id: string; name: string }[] {
    const view = playersView(read);
    const ids = view.settings && Array.isArray(view.settings.party.memberIds) ? view.settings.party.memberIds : [];
    const people: { id: string; name: string }[] = [];
    for (const id of ids) {
        const record = view.records.find((row) => row.id === id && !row.deleted && row.type === 'person');
        if (record && !people.some((item) => item.id === id)) people.push({ id, name: record.name });
    }
    return people.sort((a, b) => a.name.localeCompare(b.name));
}
