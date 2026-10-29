import type { Hono } from 'hono';
import { detectPlayers } from '../auth/players_schema';
import { requireUser, ulid, type AppContext } from '../auth/session';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';
import { privateNoStore } from '../universe/door_headers';
import { loadHandles, memberUniverse, originBlocked, ownedUniverse, type MemberUniverse } from '../universe/forward';
import { joinLimited, joinPreviewLimited } from '../universe/player_rate';
import { JoinBody, PlayerPerson, PlayerStatus } from '../../../../packages/shared/src/schemas/players.ts';

const PLAYERS_UNAVAILABLE = 'Players are not available yet.';
const INVALID = 'Invalid request.';
const NOT_UNIVERSE = 'No such universe.';
const ARCHIVED = 'You are not in this campaign.';
const OWNER_ARCHIVED = 'The referee archived you from this campaign.';
const FULL = 'This campaign has 255 players, the most it can have.';
const EXPIRED = 'This invite has expired.';
const REVOKED = 'This invite was revoked.';
const NO_INVITE = 'No such invite.';
const FORBIDDEN = 'You cannot change that.';
const SEAT_CAP = 255;
const INVITE_MS = 30 * 24 * 60 * 60 * 1000;

function unavailable(c: AppContext): Response {
    return fail(c, 503, 'players_unavailable', PLAYERS_UNAVAILABLE);
}

function held(c: AppContext, data: unknown, status: 200 | 201 = 200): Response {
    return privateNoStore(ok(c, data, status));
}

async function sha256Hex(token: string): Promise<string> {
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token));
    let hex = '';
    for (const byte of new Uint8Array(digest)) hex += byte.toString(16).padStart(2, '0');
    return hex;
}

function makeToken(): string {
    const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
    let binary = '';
    for (const byte of tokenBytes) binary += String.fromCharCode(byte);
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

type InviteRow = {
    id: string;
    universeId: string;
    token: string | null;
    expiresAt: string;
    revokedAt: string | null;
    uses: number;
    name: string;
    ownerId: string;
    deletedAt: string | null;
    ownerHandle: string | null;
};

async function inviteByHash(db: D1Database, tokenHash: string): Promise<InviteRow | null> {
    return db.prepare(
        `SELECT i.id AS id, i.universe_id AS universeId, i.token AS token, i.expires_at AS expiresAt,
                i.revoked_at AS revokedAt, i.uses AS uses, u.name AS name, u.owner_id AS ownerId,
                u.deleted_at AS deletedAt, p.handle AS ownerHandle
         FROM universe_invites i
         JOIN universes u ON u.id = i.universe_id
         LEFT JOIN profile p ON p.user_id = u.owner_id
         WHERE i.token_hash = ?`,
    ).bind(tokenHash).first<InviteRow>();
}

function inviteState(row: InviteRow, now: number): 'revoked' | 'expired' | 'live' | 'gone' {
    if (row.deletedAt) return 'gone';
    if (row.revokedAt) return 'revoked';
    if (Date.parse(row.expiresAt) <= now) return 'expired';
    return 'live';
}

function refuseInvite(c: AppContext, state: 'revoked' | 'expired' | 'gone'): Response {
    if (state === 'revoked') return fail(c, 400, 'invite_revoked', REVOKED, { reason: 'invite_revoked' });
    if (state === 'expired') return fail(c, 400, 'invite_expired', EXPIRED, { reason: 'invite_expired' });
    return fail(c, 404, 'not_found', NO_INVITE);
}

async function partyIds(c: AppContext, access: MemberUniverse, memberId: string): Promise<Set<string>> {
    const door = new URL('https://universe.local/campaign/players?after=0&limit=1');
    const handles = await loadHandles(c.env.DB, access.row.id, access.row.ownerId);
    const response = await access.forward(new Request(door), {
        'x-voyage-member': memberId,
        'x-voyage-handles': JSON.stringify(handles),
    });
    if (!response.ok) return new Set();
    const body = await response.json() as { data?: { settings?: { party?: { memberIds?: string[] } } | null } };
    return new Set(body.data?.settings?.party?.memberIds ?? []);
}

type MemberRow = {
    userId: string;
    status: string;
    archivedBy: string | null;
    personId: string | null;
};

async function memberRow(db: D1Database, universeId: string, userId: string): Promise<MemberRow | null> {
    return db.prepare(
        `SELECT user_id AS userId, status AS status, archived_by AS archivedBy, person_id AS personId
         FROM universe_members WHERE universe_id = ? AND user_id = ?`,
    ).bind(universeId, userId).first<MemberRow>();
}

function invitePayload(origin: string, token: string, expiresAt: string, uses: number) {
    return { url: `${origin}/join/${token}`, expiresAt, role: 'player' as const, uses: Number(uses) };
}

export function mountPlayerRoutes(route: Hono<AppEnv>): void {
    route.post('/:id/players/invite', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const now = new Date();
        const nowIso = now.toISOString();
        const live = await c.env.DB.prepare(
            `SELECT token AS token, expires_at AS expiresAt, uses AS uses
             FROM universe_invites
             WHERE universe_id = ? AND revoked_at IS NULL AND token IS NOT NULL AND expires_at > ?`,
        ).bind(owned.row.id, nowIso).first<{ token: string; expiresAt: string; uses: number }>();
        if (live?.token) {
            return held(c, invitePayload(new URL(c.req.url).origin, live.token, live.expiresAt, live.uses));
        }
        const token = makeToken();
        const tokenHash = await sha256Hex(token);
        const expiresAt = new Date(now.getTime() + INVITE_MS).toISOString();
        await c.env.DB.batch([
            c.env.DB.prepare(
                `UPDATE universe_invites SET revoked_at = ?, token = NULL WHERE universe_id = ? AND revoked_at IS NULL`,
            ).bind(nowIso, owned.row.id),
            c.env.DB.prepare(
                `INSERT INTO universe_invites (id, universe_id, token, token_hash, role, expires_at, revoked_at, uses, created_at)
                 VALUES (?, ?, ?, ?, 'player', ?, NULL, 0, ?)`,
            ).bind(`ui_${ulid()}`, owned.row.id, token, tokenHash, expiresAt, nowIso),
        ]);
        return held(c, invitePayload(new URL(c.req.url).origin, token, expiresAt, 0));
    });

    route.get('/:id/invite', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const live = await c.env.DB.prepare(
            `SELECT token AS token, created_at AS createdAt, expires_at AS expiresAt
             FROM universe_invites
             WHERE universe_id = ? AND revoked_at IS NULL AND token IS NOT NULL AND expires_at > ?`,
        ).bind(owned.row.id, new Date().toISOString()).first<{ token: string; createdAt: string; expiresAt: string }>();
        if (!live?.token) return held(c, { link: null });
        return held(c, {
            link: {
                url: `${new URL(c.req.url).origin}/join/${live.token}`,
                createdAt: live.createdAt,
                expiresAt: live.expiresAt,
            },
        });
    });

    route.delete('/:id/players/invite', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        await c.env.DB.prepare(
            `UPDATE universe_invites SET revoked_at = ?, token = NULL WHERE universe_id = ? AND revoked_at IS NULL`,
        ).bind(new Date().toISOString(), owned.row.id).run();
        return held(c, { revoked: true });
    });

    route.get('/:id/players', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return privateNoStore(owned);
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const listed = await c.env.DB.prepare(
            `SELECT m.user_id AS userId, COALESCE(p.handle, '') AS handle, m.person_id AS personId,
                    m.created_at AS joined, m.status AS status, m.archived_at AS archivedAt, m.archived_by AS archivedBy
             FROM universe_members m
             LEFT JOIN profile p ON p.user_id = m.user_id
             WHERE m.universe_id = ?
             ORDER BY m.created_at`,
        ).bind(owned.row.id).all<{
            userId: string;
            handle: string;
            personId: string | null;
            joined: string;
            status: 'active' | 'archived';
            archivedAt: string | null;
            archivedBy: 'owner' | 'self' | null;
        }>();
        const rows = listed.results ?? [];
        return held(c, {
            playing: rows.filter((row) => row.status === 'active'),
            archived: rows.filter((row) => row.status !== 'active'),
        });
    });

    route.patch('/:id/players/me', async (c) => {
        const access = await memberUniverse(c);
        if (access instanceof Response) return access;
        if (access.role === 'archived') return fail(c, 403, 'not_a_member', ARCHIVED);
        if (access.role !== 'member') return fail(c, 404, 'not_found', NOT_UNIVERSE);
        const blocked = originBlocked(c);
        if (blocked) return blocked;
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const parsed = PlayerPerson.safeParse(await readBody(c));
        if (!parsed.success) return fail(c, 400, 'validation', INVALID);
        if (parsed.data.personId !== null && !await personInParty(c, access, access.actor.id, parsed.data.personId)) {
            return fail(c, 400, 'validation', INVALID);
        }
        await c.env.DB.prepare(
            `UPDATE universe_members SET person_id = ? WHERE universe_id = ? AND user_id = ?`,
        ).bind(parsed.data.personId, access.row.id, access.actor.id).run();
        return held(c, { personId: parsed.data.personId });
    });

    route.patch('/:id/players/:userId', async (c) => {
        const owned = await ownedUniverse(c);
        if (owned instanceof Response) return owned;
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const userId = c.req.param('userId') ?? '';
        const row = await memberRow(c.env.DB, owned.row.id, userId);
        if (!row) return fail(c, 404, 'not_found', NOT_UNIVERSE);
        const body = await readBody(c);
        const person = PlayerPerson.safeParse(body);
        const status = PlayerStatus.safeParse(body);
        if (person.success === status.success) return fail(c, 400, 'validation', INVALID);
        if (!person.success) {
            await c.env.DB.prepare(
                `UPDATE universe_members SET status = 'active', archived_at = NULL, archived_by = NULL
                 WHERE universe_id = ? AND user_id = ?`,
            ).bind(owned.row.id, userId).run();
            return held(c, { status: 'active' as const });
        }
        if (person.data.personId !== null) {
            const access: MemberUniverse = {
                row: owned.row,
                actor: owned.actor,
                role: 'owner',
                forward: owned.forward,
            };
            if (!await personInParty(c, access, userId, person.data.personId)) return fail(c, 400, 'validation', INVALID);
        }
        await c.env.DB.prepare(
            `UPDATE universe_members SET person_id = ? WHERE universe_id = ? AND user_id = ?`,
        ).bind(person.data.personId, owned.row.id, userId).run();
        return held(c, { personId: person.data.personId });
    });

    route.delete('/:id/players/:userId', async (c) => {
        const access = await memberUniverse(c);
        if (access instanceof Response) return access;
        const userId = c.req.param('userId') ?? '';
        const allowed = access.role === 'owner' || (access.role === 'member' && userId === access.actor.id);
        if (!allowed) return fail(c, 404, 'not_found', NOT_UNIVERSE);
        const blocked = originBlocked(c);
        if (blocked) return blocked;
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const row = await memberRow(c.env.DB, access.row.id, userId);
        if (!row) return fail(c, 404, 'not_found', NOT_UNIVERSE);
        if (row.status !== 'archived') {
            await c.env.DB.prepare(
                `UPDATE universe_members SET status = 'archived', archived_at = ?, archived_by = ?
                 WHERE universe_id = ? AND user_id = ?`,
            ).bind(new Date().toISOString(), access.role === 'owner' ? 'owner' : 'self', access.row.id, userId).run();
        }
        return held(c, { status: 'archived' });
    });
}

async function readBody(c: AppContext): Promise<unknown> {
    try {
        return await c.req.json();
    } catch {
        return null;
    }
}

async function personInParty(c: AppContext, access: MemberUniverse, memberId: string, personId: string): Promise<boolean> {
    const ids = await partyIds(c, access, memberId);
    return ids.has(personId);
}

export function mountAccountPlayerRoutes(app: Hono<AppEnv>): void {
    app.post('/api/join', async (c) => {
        const actor = await requireUser(c);
        if (actor instanceof Response) return actor;
        const blocked = originBlocked(c);
        if (blocked) return blocked;
        if (joinLimited(actor.id)) {
            c.header('retry-after', '10');
            return fail(c, 429, 'rate_limited', 'Too many requests.');
        }
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const parsed = JoinBody.safeParse(await readBody(c));
        if (!parsed.success) return fail(c, 400, 'validation', INVALID);
        const row = await inviteByHash(c.env.DB, await sha256Hex(parsed.data.token));
        if (!row) return fail(c, 404, 'not_found', NO_INVITE);
        const state = inviteState(row, Date.now());
        if (state !== 'live') return refuseInvite(c, state);
        if (row.ownerId === actor.id) return fail(c, 403, 'forbidden', FORBIDDEN);
        const existing = await memberRow(c.env.DB, row.universeId, actor.id);
        if (existing?.status === 'archived' && existing.archivedBy === 'owner') {
            return fail(c, 403, 'not_a_member', OWNER_ARCHIVED, { reason: 'archived' });
        }
        const claim = { universeId: row.universeId, name: row.name, role: 'player' as const };
        if (existing?.status === 'active') return held(c, claim);
        const seats = await c.env.DB.prepare(
            `SELECT COUNT(*) AS n FROM universe_members WHERE universe_id = ? AND status = 'active'`,
        ).bind(row.universeId).first<{ n: number }>();
        if (Number(seats?.n ?? 0) >= SEAT_CAP) {
            return fail(c, 400, 'campaign_full', FULL, { reason: 'campaign_full' });
        }
        const nowIso = new Date().toISOString();
        const memberWrite = existing
            ? c.env.DB.prepare(
                `UPDATE universe_members SET status = 'active', archived_at = NULL, archived_by = NULL
                 WHERE universe_id = ? AND user_id = ?`,
            ).bind(row.universeId, actor.id)
            : c.env.DB.prepare(
                `INSERT INTO universe_members (universe_id, user_id, role, person_id, status, archived_at, archived_by, created_at)
                 VALUES (?, ?, 'player', NULL, 'active', NULL, NULL, ?)`,
            ).bind(row.universeId, actor.id, nowIso);
        await c.env.DB.batch([
            memberWrite,
            c.env.DB.prepare(`UPDATE universe_invites SET uses = uses + 1 WHERE id = ?`).bind(row.id),
        ]);
        return held(c, claim);
    });

    app.get('/api/join/:token', async (c) => {
        const ip = c.req.header('cf-connecting-ip') || 'local';
        if (joinPreviewLimited(ip)) return fail(c, 429, 'rate_limited', 'Too many requests.');
        if (!await detectPlayers(c.env.DB)) return unavailable(c);
        const token = c.req.param('token') ?? '';
        if (!token) return fail(c, 404, 'not_found', NO_INVITE);
        const row = await inviteByHash(c.env.DB, await sha256Hex(token));
        if (!row) return fail(c, 404, 'not_found', NO_INVITE);
        const state = inviteState(row, Date.now());
        if (state !== 'live') return refuseInvite(c, state);
        return held(c, { name: row.name, ownerHandle: row.ownerHandle ?? '', expiresAt: row.expiresAt });
    });

    app.get('/api/me/playing', async (c) => {
        const actor = await requireUser(c);
        if (actor instanceof Response) return privateNoStore(actor);
        if (!await detectPlayers(c.env.DB)) return held(c, { items: [] });
        const listed = await c.env.DB.prepare(
            `SELECT u.id AS id, u.name AS name, COALESCE(p.handle, '') AS ownerHandle, u.truth_version AS truthVersion
             FROM universe_members m
             JOIN universes u ON u.id = m.universe_id
             LEFT JOIN profile p ON p.user_id = u.owner_id
             WHERE m.user_id = ? AND m.status = 'active' AND u.deleted_at IS NULL`,
        ).bind(actor.id).all<{ id: string; name: string; ownerHandle: string; truthVersion: string | null }>();
        return held(c, { items: listed.results ?? [] });
    });
}
