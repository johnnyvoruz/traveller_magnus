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
 * back after a reload (DU33) with its uses count (DU33b); a read without the count shows the date alone.
 */
export type InviteShown = { url: string; expiresAt: string; uses?: number };

/** The line under the link: when it stops working, and how often it has been used (left out when the body does not say). */
export function inviteLine(invite: { expiresAt: string; uses?: number }): string {
    const date = realDate(invite.expiresAt);
    const until = date ? 'Works until ' + date : 'Works for 30 days';
    return invite.uses === undefined ? until : until + ' · ' + usesWords(invite.uses);
}

export type MemberRow = {
    userId: string;
    handle: string;
    personId: string | null;
    /** The member's characters in the referee's order (BM2a). An older answer without it reads `personId` alone. */
    personIds?: string[];
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

// ---- BM2c: a member's characters (Johnny 141; findings/member_characters_plan.md) -------------------------

/** The characters a member plays, in order: the list, else the one id, else none. */
export function tiedIds(member: Pick<MemberRow, 'personId' | 'personIds'>): string[] {
    if (member.personIds && member.personIds.length) return [...member.personIds];
    return member.personId ? [member.personId] : [];
}

/** The list with one character ticked on or off. A new one goes last; the order of the others stays. */
export function toggledIds(ids: readonly string[], personId: string, on: boolean): string[] {
    if (on) return ids.includes(personId) ? [...ids] : [...ids, personId];
    return ids.filter((id) => id !== personId);
}

/** Under a member with no character on the Players list. */
export const NO_CHARACTER = 'No character yet';

/** On a player's ship page when they play no character in this campaign (Johnny 141). */
export const PLAYER_NO_CHARACTER = 'You do not play a character in this campaign yet, so you cannot trade on this ship. Ask the referee to choose yours.';

function joined(names: readonly string[]): string {
    if (names.length <= 1) return names[0] ?? '';
    if (names.length === 2) return names[0] + ' and ' + names[1];
    return names.slice(0, -1).join(', ') + ', and ' + names[names.length - 1];
}

/**
 * The server's `moved` as one sentence: "Ara Silt moved from mara." Several from one player share it;
 * from several players: "Ara Silt moved from mara, and Ysa Quen from ivo." Empty when nothing moved.
 */
export function movedSentence(
    moved: readonly { personId: string; fromUserId: string }[],
    nameOf: (personId: string) => string,
    handleOf: (userId: string) => string,
): string {
    if (!moved.length) return '';
    const groups: { from: string; names: string[] }[] = [];
    for (const item of moved) {
        const from = handleOf(item.fromUserId) || 'another player';
        const name = nameOf(item.personId) || 'A character';
        const group = groups.find((one) => one.from === from);
        if (group) group.names.push(name);
        else groups.push({ from, names: [name] });
    }
    const head = joined(groups[0].names) + ' moved from ' + groups[0].from;
    const rest = groups.slice(1).map((group) => joined(group.names) + ' from ' + group.from);
    return [head, ...rest].join(', and ') + '.';
}
