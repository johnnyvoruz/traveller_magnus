/**
 * How the join page reads (players_build_plan.md P4). Pure. The page only draws the result.
 * The four claim-page refusals keep that page's sentences. An owner archive adds its own.
 */
export const JOIN_BAR = '/join';

/** Survives the sign-in redirect. The address bar never holds the token after mount. */
export const JOIN_TOKEN_KEY = 'voyage.join.token';

export type JoinState = 'signed-out' | 'ready' | 'choose' | 'refused';

export type JoinFace = { state: JoinState; title: string; line: string };

const USED = 'This link has already been used.';
const EXPIRED = 'This link has expired.';
const REVOKED = 'This link has been revoked.';
const MISSING = 'This link cannot be used.';
const ARCHIVED = 'The referee archived you from this campaign.';
const FULL = 'This campaign has 255 players, the most it can have.';

/** The token from the address, or the one kept for the return from sign-in. */
export function heldJoinToken(param: string, stored: string | null): string {
    const fromPath = param.trim();
    if (fromPath) return fromPath;
    return (stored ?? '').trim();
}

/**
 * A refused join, from the server's code and message.
 * Expired, revoked, used, and missing use the claim page's sentences.
 */
export function joinRefusal(code: string, message: string): string {
    const hay = (code + ' ' + message).toLowerCase();
    if (hay.includes('archiv')) return ARCHIVED;
    if (hay.includes('expir')) return EXPIRED;
    if (hay.includes('revok')) return REVOKED;
    if (hay.includes('used') || hay.includes('already')) return USED;
    if (code === 'campaign_full' || hay.includes('255')) return FULL;
    if (hay.includes('not_found') || hay.includes('no such') || hay.includes('missing')) return MISSING;
    const said = message.trim();
    return said || MISSING;
}

/** The join page's four states: signed out, ready to join, choosing a person, or refused. */
export function joinFace(input: {
    signedIn: boolean;
    refused: boolean;
    chosen: boolean;
    name: string;
    ownerHandle: string;
    refusal: string;
    people: readonly { id: string; name: string }[];
}): JoinFace {
    if (input.refused) {
        return {
            state: 'refused',
            title: 'This link will not open',
            line: input.refusal.trim() || MISSING,
        };
    }
    const name = input.name.trim();
    const handle = input.ownerHandle.trim();
    const title = name ? "You're invited to " + name : "You're invited";
    if (!input.signedIn) {
        const who = handle ? handle + ' runs this campaign. ' : '';
        return {
            state: 'signed-out',
            title,
            line: who + 'Sign in to join. You come back to this page.',
        };
    }
    if (input.chosen) {
        return {
            state: 'choose',
            title: 'Which one is you?',
            line: input.people.length === 0
                ? 'There is nobody in the party yet. Select Not yet.'
                : 'Select the person you play, or select Not yet.',
        };
    }
    return {
        state: 'ready',
        title,
        line: handle ? handle + ' runs this campaign. Select Join to enter.' : 'Select Join to enter.',
    };
}
