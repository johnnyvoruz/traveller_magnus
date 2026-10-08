/**
 * Sharing one character by a link, and who already has it.
 * The link's token is returned once, from makeInvite. A claim makes the signed-in
 * account an editor. The owner can revoke a link, remove an editor, or hand
 * ownership over.
 */
import { characters, noteRole } from './store.ts';
import type { CharacterAccessRow, CharacterInvite, IssuedInvite } from './types.ts';
import { parseAccess, parseClaim, parseInvite, parseIssued, parseRole } from './types.ts';
import { request } from './transport.ts';

function quiet(status: number): boolean {
    if (status !== 401) return false;
    characters.items = [];
    characters.status = 'signed-out';
    characters.error = '';
    return true;
}

function fail(message: string): void {
    characters.error = message;
}

/** The owner makes a link. The url is shown once. One claim, editor, 14 days. */
export async function makeInvite(id: string): Promise<IssuedInvite | null> {
    characters.error = '';
    const res = await request('/api/characters/' + encodeURIComponent(id) + '/invites', { method: 'POST' });
    if (quiet(res.status)) return null;
    const issued = res.ok ? parseIssued(res.data) : null;
    if (!issued) {
        fail(res.message || 'The link could not be made.');
        return null;
    }
    return issued;
}

/** Links the owner has made. The token is never among them. */
export async function listInvites(id: string): Promise<CharacterInvite[] | null> {
    characters.error = '';
    const res = await request('/api/characters/' + encodeURIComponent(id) + '/invites');
    if (quiet(res.status)) return null;
    if (!res.ok || !Array.isArray(res.data)) {
        fail(res.message || 'The links could not be loaded.');
        return null;
    }
    return res.data.flatMap((row) => {
        const invite = parseInvite(row);
        return invite ? [invite] : [];
    });
}

export async function revokeInvite(id: string, inviteId: string): Promise<boolean> {
    characters.error = '';
    const res = await request(
        '/api/characters/' + encodeURIComponent(id) + '/invites/' + encodeURIComponent(inviteId),
        { method: 'DELETE' },
    );
    if (quiet(res.status)) return false;
    if (!res.ok) {
        fail(res.message || 'The link could not be revoked.');
        return false;
    }
    return true;
}

/** Who has the character. Owners and editors both see this. */
export async function listAccess(id: string): Promise<CharacterAccessRow[] | null> {
    characters.error = '';
    const res = await request('/api/characters/' + encodeURIComponent(id) + '/access');
    if (quiet(res.status)) return null;
    if (!res.ok || !Array.isArray(res.data)) {
        fail(res.message || 'The people with access could not be loaded.');
        return null;
    }
    return res.data.flatMap((row) => {
        const access = parseAccess(row);
        return access ? [access] : [];
    });
}

/** The owner removes an editor. That person's open sheets are closed by the server. */
export async function removeAccess(id: string, userId: string): Promise<boolean> {
    characters.error = '';
    const res = await request(
        '/api/characters/' + encodeURIComponent(id) + '/access/' + encodeURIComponent(userId),
        { method: 'DELETE' },
    );
    if (quiet(res.status)) return false;
    if (!res.ok) {
        fail(res.message || 'That person could not be removed.');
        return false;
    }
    return true;
}

/** The owner makes an editor the owner. One owner. */
export async function giveOwnership(id: string, userId: string): Promise<boolean> {
    characters.error = '';
    const res = await request('/api/characters/' + encodeURIComponent(id) + '/owner', {
        method: 'POST',
        body: JSON.stringify({ userId }),
    });
    if (quiet(res.status)) return false;
    if (!res.ok) {
        fail(res.message || 'Ownership could not be handed over.');
        return false;
    }
    const row = res.data && typeof res.data === 'object' ? res.data as { role?: unknown } : null;
    const role = row ? parseRole(row.role) : null;
    if (role) noteRole(id, role);
    return true;
}

/** The signed-in account claims a link and becomes an editor. */
export async function claim(token: string): Promise<{ characterId: string } | null> {
    characters.error = '';
    const res = await request('/api/characters/claim', {
        method: 'POST',
        body: JSON.stringify({ token }),
    });
    if (quiet(res.status)) return null;
    const claimed = res.ok ? parseClaim(res.data) : null;
    if (!claimed) {
        fail(res.message || 'The link could not be claimed.');
        return null;
    }
    return claimed;
}
