/**
 * How the Characters screens read (character MVP). Pure. The list, the share panel and the
 * claim page are decided here; the components only draw the result.
 */
import { toneFor } from '../types.ts';

export type CharacterRole = 'owner' | 'editor';

export type CharacterWho = { id: string; name: string; colour: number; field: string | null };

export type CharacterCard = {
    id: string;
    ownerId: string;
    name: string;
    summary: string;
    schema: string;
};

/** One row of GET /api/characters. `who` is present only when the list already knows. */
export type CharacterListItem = {
    character: CharacterCard;
    role: CharacterRole;
    ownerName: string;
    who?: readonly CharacterWho[];
};

export type RowFace = {
    id: string;
    name: string;
    /** The summary's first line. Empty when the summary is blank. */
    summary: string;
    /** The owner's name on a shared row. Null on one of mine. */
    owner: string | null;
    /** Who is on it right now, when the list knows. Empty otherwise. */
    here: string;
};

export type SharePerson = { userId: string; name: string; role: CharacterRole };
export type ShareInvite = { id: string; expiresAt: string };

export type ShareFace = {
    /** An editor sees the people and cannot change them. */
    readOnly: boolean;
    canInvite: boolean;
    fresh: { url: string; note: string } | null;
    invites: { id: string; line: string }[];
    people: { userId: string; name: string; role: CharacterRole; remove: boolean; own: boolean }[];
};

export type ClaimOutcome = 'ready' | 'claimed' | 'used' | 'expired' | 'revoked' | 'missing';
export type ClaimState = 'signed-out' | 'ready' | 'claimed' | 'refused';

export type ClaimFace = { state: ClaimState; title: string; line: string };

export const NAME_MAX = 200;
export const PREGEN_MIN = 2;
export const PREGEN_MAX = 12;

export const LINK_NOTE = 'One person can claim this link. They can edit the sheet. It lasts 14 days.';

export const EMPTY_ALL = 'A Character is a sheet you own, with or without a campaign, and you can share it by a link.';
export const EMPTY_MINE = 'You have not made a character yet.';
export const EMPTY_SHARED = 'Characters other people share with you are listed here.';

/** The screen's mark for a presence colour. The same token the sheet's adapter uses. */
export function presenceTone(colour: number): string {
    return toneFor(colour);
}

export function firstLine(text: string): string {
    for (const line of text.split('\n')) {
        const trimmed = line.trim();
        if (trimmed) return trimmed;
    }
    return '';
}

export function rowFace(item: CharacterListItem): RowFace {
    const name = item.character.name.trim() || 'Untitled character';
    const here = (item.who ?? []).map((person) => person.name.trim()).filter((person) => person.length > 0);
    return {
        id: item.character.id,
        name,
        summary: firstLine(item.character.summary || ''),
        owner: item.role === 'owner' ? null : (item.ownerName.trim() || 'Someone'),
        here: here.join(', '),
    };
}

/** Mine, then shared with me. The order inside each group is the list's order. */
export function characterGroups(items: readonly CharacterListItem[]): { mine: RowFace[]; shared: RowFace[] } {
    const mine: RowFace[] = [];
    const shared: RowFace[] = [];
    for (const item of items) {
        const face = rowFace(item);
        if (item.role === 'owner') mine.push(face);
        else shared.push(face);
    }
    return { mine, shared };
}

/** A duplicate's name. Pregens are "Ada 1" … for the count asked, from 2 up to 12. */
export function duplicateName(name: string): string {
    const base = name.trim() || 'Untitled character';
    return base + ' copy';
}

export function pregenCount(raw: number): number | null {
    if (!Number.isInteger(raw) || raw < PREGEN_MIN || raw > PREGEN_MAX) return null;
    return raw;
}

export function pregenName(name: string, n: number): string {
    const base = name.trim() || 'Untitled character';
    return base + ' ' + n;
}

function when(expiresAt: string): string {
    const at = Date.parse(expiresAt);
    if (!Number.isFinite(at)) return 'Outstanding';
    const day = new Date(at).toISOString().slice(0, 10);
    return 'Expires ' + day;
}

/** What the share section shows. A fresh link is shown once, by whoever just made it. */
export function shareFace(input: {
    role: CharacterRole;
    people: readonly SharePerson[];
    invites: readonly ShareInvite[];
    freshUrl: string | null;
}): ShareFace {
    const owner = input.role === 'owner';
    return {
        readOnly: !owner,
        canInvite: owner,
        fresh: owner && input.freshUrl ? { url: input.freshUrl, note: LINK_NOTE } : null,
        invites: owner ? input.invites.map((invite) => ({ id: invite.id, line: when(invite.expiresAt) })) : [],
        people: input.people.map((person) => ({
            userId: person.userId,
            name: person.name.trim() || 'Someone',
            role: person.role,
            remove: owner && person.role !== 'owner',
            own: owner && person.role === 'editor',
        })),
    };
}

const REFUSED: Record<Exclude<ClaimOutcome, 'ready' | 'claimed'>, string> = {
    used: 'This link has already been used.',
    expired: 'This link has expired.',
    revoked: 'This link has been revoked.',
    missing: 'This link cannot be used.',
};

/** The claim page's four states: signed out, ready, claimed, or a link that will not open. */
export function claimFace(signedIn: boolean, outcome: ClaimOutcome): ClaimFace {
    if (!signedIn) {
        return {
            state: 'signed-out',
            title: 'A character has been shared with you',
            line: 'Sign in to claim it. You come back to this page, and one press gives you edit access.',
        };
    }
    if (outcome === 'ready') {
        return {
            state: 'ready',
            title: 'Claim this character',
            line: 'One press gives you edit access. The person who made it stays the owner.',
        };
    }
    if (outcome === 'claimed') {
        return { state: 'claimed', title: 'You can edit this character', line: 'Opening it.' };
    }
    return { state: 'refused', title: 'This link will not open', line: REFUSED[outcome] };
}

/** A refused claim, from the server's code and message. Anything else is a link that cannot be used. */
export function claimRefusal(code: string, message: string): Exclude<ClaimOutcome, 'ready' | 'claimed'> {
    const hay = (code + ' ' + message).toLowerCase();
    if (hay.includes('expir')) return 'expired';
    if (hay.includes('revok')) return 'revoked';
    if (hay.includes('used') || hay.includes('already')) return 'used';
    return 'missing';
}
