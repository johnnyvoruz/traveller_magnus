import {
    sha256Hex,
    CHARACTER_LIMITS,
    CHARACTER_SCHEMA,
    Character,
    CharacterAccessRemoved,
    CharacterAccessRow,
    CharacterClaim,
    CharacterClaimResult,
    CharacterCreate,
    CharacterFieldsResult,
    CharacterFieldsWrite,
    CharacterHeld,
    CharacterInvite,
    CharacterInviteCreate,
    CharacterListItem,
    CharacterOpen,
    CharacterOwnerChange,
    CharacterPatch,
} from '@voyage/shared';
import type { CharacterDocData } from './sheet.ts';

const INVITE_MS = 14 * 24 * 60 * 60 * 1000;

export type CatalogueDb = {
    all(query: string, ...params: Array<string | number | null>): Promise<Array<Record<string, unknown>>>;
    get(query: string, ...params: Array<string | number | null>): Promise<Record<string, unknown> | null>;
    run(query: string, ...params: Array<string | number | null>): Promise<number>;
    batch(statements: Array<{ query: string; params: Array<string | number | null> }>): Promise<void>;
};

export type RoomDoc = CharacterDocData;

export type RoomApply =
    | { ok: true; doc: RoomDoc; applied: Array<{ field: string; rev: number; value: string | boolean }> }
    | { ok: false; why: string; field: string };

export interface CharacterRooms {
    ensure(id: string): Promise<void>;
    read(id: string): Promise<RoomDoc>;
    apply(id: string, sets: Array<{ field: string; value: string | boolean }>, by: string): Promise<RoomApply>;
    replace(id: string, boxes: Array<{ name: string; value: string | boolean }>, by: string): Promise<void>;
    meta(id: string, name: string, summary: string): Promise<void>;
    closeUser(id: string, userId: string): Promise<void>;
    closeAll(id: string): Promise<void>;
    retell(id: string, roles: Record<string, 'owner' | 'editor'>): Promise<void>;
}

export type Actor = { id: string };

export type Outcome =
    | { ok: true; status: 200 | 201; data: unknown }
    | { ok: false; status: 400 | 403 | 404; code: string; message: string; details?: unknown };

function good(data: unknown, status: 200 | 201 = 200): Outcome {
    return { ok: true, status, data };
}

function bad(status: 400 | 403 | 404, code: string, message: string, details?: unknown): Outcome {
    return details === undefined
        ? { ok: false, status, code, message }
        : { ok: false, status, code, message, details };
}

function newId(prefix: 'ch' | 'ci'): string {
    return `${prefix}_${crypto.randomUUID()}`;
}

export function copiedName(source: string, limit = CHARACTER_LIMITS.name): string {
    const match = /^(.*) \(copy(?: (\d+))?\)$/.exec(source);
    const base = match ? match[1] : source;
    const n = match ? (match[2] ? Number(match[2]) + 1 : 2) : 1;
    const suffix = n === 1 ? ' (copy)' : ` (copy ${n})`;
    const room = Math.max(1, limit - suffix.length);
    return `${base.slice(0, room)}${suffix}`;
}

type Access = { role: 'owner' | 'editor' };

function characterOf(row: Record<string, unknown>) {
    return Character.parse({
        id: row.id,
        ownerId: row.owner_id,
        name: row.name,
        summary: row.summary,
        schema: row.schema,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
        deletedAt: row.deleted_at ?? null,
    });
}

async function personName(db: CatalogueDb, userId: string): Promise<string> {
    const profile = await db.get(`SELECT display_name AS name FROM profile WHERE user_id = ?`, userId);
    if (profile?.name) return String(profile.name);
    const account = await db.get(`SELECT name, email FROM user WHERE id = ?`, userId);
    if (account?.name) return String(account.name);
    if (account?.email) return String(account.email);
    return userId;
}

async function accessFor(db: CatalogueDb, characterId: string, userId: string): Promise<{ row: Record<string, unknown>; role: Access['role'] } | null> {
    const row = await db.get(
        `SELECT c.id, c.owner_id, c.name, c.summary, c.schema, c.created_at, c.updated_at, c.deleted_at, a.role
         FROM characters c
         JOIN character_access a ON a.character_id = c.id AND a.user_id = ?
         WHERE c.id = ? AND c.deleted_at IS NULL`,
        userId,
        characterId,
    );
    if (!row) return null;
    const role = row.role === 'owner' ? 'owner' : row.role === 'editor' ? 'editor' : null;
    if (!role) return null;
    return { row, role };
}

async function dropCharacter(db: CatalogueDb, id: string): Promise<void> {
    await db.batch([
        { query: `DELETE FROM character_access WHERE character_id = ?`, params: [id] },
        { query: `DELETE FROM characters WHERE id = ?`, params: [id] },
    ]);
}

export function characterService(db: CatalogueDb, rooms: CharacterRooms, clock: () => Date = () => new Date()) {
    async function held(row: Record<string, unknown>, role: Access['role']): Promise<Outcome> {
        return good(CharacterHeld.parse({ character: characterOf(row), role }));
    }

    return {
        async list(actor: Actor): Promise<Outcome> {
            const rows = await db.all(
                `SELECT c.id, c.owner_id, c.name, c.summary, c.schema, c.created_at, c.updated_at, c.deleted_at, a.role
                 FROM character_access a
                 JOIN characters c ON c.id = a.character_id
                 WHERE a.user_id = ? AND c.deleted_at IS NULL
                 ORDER BY c.created_at`,
                actor.id,
            );
            const items = [];
            for (const row of rows) {
                const role = row.role === 'owner' ? 'owner' : 'editor';
                items.push(CharacterListItem.parse({
                    character: characterOf(row),
                    role,
                    ownerName: await personName(db, String(row.owner_id)),
                }));
            }
            return good(items);
        },

        async create(actor: Actor, body: unknown): Promise<Outcome> {
            const parsed = CharacterCreate.safeParse(body);
            if (!parsed.success) return bad(400, 'validation', 'Invalid request.', parsed.error.flatten());
            let name = parsed.data.name ?? '';
            let boxes: Array<{ name: string; value: string | boolean }> = [];
            if (parsed.data.from) {
                const source = await accessFor(db, parsed.data.from, actor.id);
                if (!source) return bad(404, 'not_found', 'No such character.');
                if (!parsed.data.name) name = copiedName(String(source.row.name));
                const doc = await rooms.read(parsed.data.from);
                boxes = Object.entries(doc.fields).map(([field, value]) => ({ name: field, value }));
            } else if (!name) {
                return bad(400, 'validation', 'Invalid request.');
            }
            const id = newId('ch');
            const now = clock().toISOString();
            await db.batch([
                {
                    query: `INSERT INTO characters (id, owner_id, name, summary, schema, created_at, updated_at, deleted_at)
                            VALUES (?, ?, ?, '', ?, ?, ?, NULL)`,
                    params: [id, actor.id, name, CHARACTER_SCHEMA, now, now],
                },
                {
                    query: `INSERT INTO character_access (character_id, user_id, role, granted_by, created_at)
                            VALUES (?, ?, 'owner', ?, ?)`,
                    params: [id, actor.id, actor.id, now],
                },
            ]);
            try {
                await rooms.ensure(id);
                if (boxes.length) await rooms.replace(id, boxes, actor.id);
            } catch (err) {
                await dropCharacter(db, id);
                throw err;
            }
            const row = await db.get(`SELECT * FROM characters WHERE id = ?`, id);
            if (!row) return bad(404, 'not_found', 'No such character.');
            return good(CharacterHeld.parse({ character: characterOf(row), role: 'owner' }), 201);
        },

        async open(actor: Actor, id: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            const doc = await rooms.read(id);
            return good(CharacterOpen.parse({ character: characterOf(access.row), role: access.role, doc }));
        },

        async patch(actor: Actor, id: string, body: unknown): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const parsed = CharacterPatch.safeParse(body);
            if (!parsed.success) return bad(400, 'validation', 'Invalid request.', parsed.error.flatten());
            const name = parsed.data.name ?? String(access.row.name);
            const summary = parsed.data.summary ?? String(access.row.summary);
            const now = clock().toISOString();
            await db.run(
                `UPDATE characters SET name = ?, summary = ?, updated_at = ? WHERE id = ?`,
                name,
                summary,
                now,
                id,
            );
            await rooms.meta(id, name, summary);
            const row = await db.get(`SELECT * FROM characters WHERE id = ?`, id);
            if (!row) return bad(404, 'not_found', 'No such character.');
            return held(row, 'owner');
        },

        async remove(actor: Actor, id: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const now = clock().toISOString();
            await db.run(`UPDATE characters SET deleted_at = ?, updated_at = ? WHERE id = ?`, now, now, id);
            await rooms.closeAll(id);
            const row = await db.get(`SELECT * FROM characters WHERE id = ?`, id);
            if (!row) return bad(404, 'not_found', 'No such character.');
            return held(row, 'owner');
        },

        async writeFields(actor: Actor, id: string, body: unknown): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            const parsed = CharacterFieldsWrite.safeParse(body);
            if (!parsed.success) return bad(400, 'validation', 'Invalid request.', parsed.error.flatten());
            const result = await rooms.apply(id, parsed.data.sets, actor.id);
            if (!result.ok) return bad(400, 'validation', 'Invalid field.', { field: result.field, why: result.why });
            return good(CharacterFieldsResult.parse({ doc: result.doc, applied: result.applied }));
        },

        async access(actor: Actor, id: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            const rows = await db.all(
                `SELECT character_id, user_id, role, granted_by, created_at
                 FROM character_access WHERE character_id = ? ORDER BY created_at`,
                id,
            );
            const list = [];
            for (const row of rows) {
                list.push(CharacterAccessRow.parse({
                    characterId: row.character_id,
                    userId: row.user_id,
                    role: row.role,
                    grantedBy: row.granted_by,
                    name: await personName(db, String(row.user_id)),
                    createdAt: row.created_at,
                }));
            }
            return good(list);
        },

        async removeAccess(actor: Actor, id: string, userId: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const target = await db.get(
                `SELECT role FROM character_access WHERE character_id = ? AND user_id = ?`,
                id,
                userId,
            );
            if (!target) return bad(404, 'not_found', 'No such character.');
            if (target.role === 'owner') return bad(400, 'validation', 'Hand ownership over before the owner leaves.');
            await db.run(`DELETE FROM character_access WHERE character_id = ? AND user_id = ?`, id, userId);
            await rooms.closeUser(id, userId);
            return good(CharacterAccessRemoved.parse({ userId }));
        },

        async giveOwner(actor: Actor, id: string, body: unknown): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const parsed = CharacterOwnerChange.safeParse(body);
            if (!parsed.success) return bad(400, 'validation', 'Invalid request.', parsed.error.flatten());
            if (parsed.data.userId === actor.id) return bad(400, 'validation', 'That account already owns this character.');
            const target = await db.get(
                `SELECT role FROM character_access WHERE character_id = ? AND user_id = ?`,
                id,
                parsed.data.userId,
            );
            if (!target || target.role !== 'editor') return bad(400, 'validation', 'Ownership goes to an editor.');
            const now = clock().toISOString();
            await db.batch([
                {
                    query: `UPDATE character_access SET role = 'editor' WHERE character_id = ? AND user_id = ?`,
                    params: [id, actor.id],
                },
                {
                    query: `UPDATE character_access SET role = 'owner', granted_by = ? WHERE character_id = ? AND user_id = ?`,
                    params: [actor.id, id, parsed.data.userId],
                },
                {
                    query: `UPDATE characters SET owner_id = ?, updated_at = ? WHERE id = ?`,
                    params: [parsed.data.userId, now, id],
                },
            ]);
            await rooms.retell(id, { [actor.id]: 'editor', [parsed.data.userId]: 'owner' });
            const row = await db.get(`SELECT * FROM characters WHERE id = ?`, id);
            if (!row) return bad(404, 'not_found', 'No such character.');
            return held(row, 'editor');
        },

        async makeInvite(actor: Actor, id: string, origin: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const tokenBytes = crypto.getRandomValues(new Uint8Array(32));
            let binary = '';
            for (const byte of tokenBytes) binary += String.fromCharCode(byte);
            const token = btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
            const tokenHash = await sha256Hex(token);
            const inviteId = newId('ci');
            const now = clock();
            const expiresAt = new Date(now.getTime() + INVITE_MS).toISOString();
            await db.run(
                `INSERT INTO character_invites (id, token_hash, character_id, role, created_by, expires_at, claimed_by, claimed_at, revoked_at)
                 VALUES (?, ?, ?, 'editor', ?, ?, NULL, NULL, NULL)`,
                inviteId,
                tokenHash,
                id,
                actor.id,
                expiresAt,
            );
            const url = `${origin}/claim/${token}`;
            return good(CharacterInviteCreate.parse({ id: inviteId, url, expiresAt }), 201);
        },

        async listInvites(actor: Actor, id: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const rows = await db.all(
                `SELECT id, character_id, role, created_by, expires_at, claimed_by, claimed_at, revoked_at
                 FROM character_invites WHERE character_id = ? ORDER BY expires_at`,
                id,
            );
            return good(rows.map((row) => CharacterInvite.parse({
                id: row.id,
                characterId: row.character_id,
                role: 'editor',
                createdBy: row.created_by,
                expiresAt: row.expires_at,
                claimedBy: row.claimed_by ?? null,
                claimedAt: row.claimed_at ?? null,
                revokedAt: row.revoked_at ?? null,
            })));
        },

        async revokeInvite(actor: Actor, id: string, inviteId: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            if (access.role !== 'owner') return bad(403, 'forbidden', 'The owner does that.');
            const existing = await db.get(
                `SELECT id FROM character_invites WHERE id = ? AND character_id = ?`,
                inviteId,
                id,
            );
            if (!existing) return bad(404, 'not_found', 'No such character.');
            const now = clock().toISOString();
            await db.run(
                `UPDATE character_invites SET revoked_at = ? WHERE id = ? AND revoked_at IS NULL`,
                now,
                inviteId,
            );
            const row = await db.get(
                `SELECT id, character_id, role, created_by, expires_at, claimed_by, claimed_at, revoked_at
                 FROM character_invites WHERE id = ?`,
                inviteId,
            );
            if (!row) return bad(404, 'not_found', 'No such character.');
            return good(CharacterInvite.parse({
                id: row.id,
                characterId: row.character_id,
                role: 'editor',
                createdBy: row.created_by,
                expiresAt: row.expires_at,
                claimedBy: row.claimed_by ?? null,
                claimedAt: row.claimed_at ?? null,
                revokedAt: row.revoked_at ?? null,
            }));
        },

        async claim(actor: Actor, body: unknown): Promise<Outcome> {
            const parsed = CharacterClaim.safeParse(body);
            if (!parsed.success) return bad(400, 'validation', 'Invalid request.', parsed.error.flatten());
            const tokenHash = await sha256Hex(parsed.data.token);
            const invite = await db.get(
                `SELECT i.id, i.character_id, i.created_by, i.expires_at, i.claimed_at, i.revoked_at, c.deleted_at
                 FROM character_invites i
                 LEFT JOIN characters c ON c.id = i.character_id
                 WHERE i.token_hash = ?`,
                tokenHash,
            );
            if (!invite || invite.deleted_at) return bad(404, 'not_found', 'No such character.');
            if (invite.revoked_at) return bad(400, 'validation', 'This link was revoked.', { reason: 'revoked' });
            if (invite.claimed_at) return bad(400, 'validation', 'This link was already used.', { reason: 'claimed' });
            const now = clock().toISOString();
            if (String(invite.expires_at) <= now) return bad(400, 'validation', 'This link has expired.', { reason: 'expired' });
            const changes = await db.run(
                `UPDATE character_invites
                 SET claimed_by = ?, claimed_at = ?
                 WHERE id = ? AND claimed_at IS NULL AND revoked_at IS NULL AND expires_at > ?`,
                actor.id,
                now,
                String(invite.id),
                now,
            );
            if (changes !== 1) {
                const again = await db.get(`SELECT revoked_at, claimed_at, expires_at FROM character_invites WHERE id = ?`, String(invite.id));
                if (again?.revoked_at) return bad(400, 'validation', 'This link was revoked.', { reason: 'revoked' });
                if (again?.claimed_at) return bad(400, 'validation', 'This link was already used.', { reason: 'claimed' });
                return bad(400, 'validation', 'This link has expired.', { reason: 'expired' });
            }
            const existing = await db.get(
                `SELECT role FROM character_access WHERE character_id = ? AND user_id = ?`,
                String(invite.character_id),
                actor.id,
            );
            if (!existing) {
                await db.run(
                    `INSERT INTO character_access (character_id, user_id, role, granted_by, created_at)
                     VALUES (?, ?, 'editor', ?, ?)`,
                    String(invite.character_id),
                    actor.id,
                    String(invite.created_by),
                    now,
                );
            }
            return good(CharacterClaimResult.parse({ characterId: String(invite.character_id) }));
        },

        async live(actor: Actor, id: string): Promise<Outcome> {
            const access = await accessFor(db, id, actor.id);
            if (!access) return bad(404, 'not_found', 'No such character.');
            return good({ role: access.role, name: await personName(db, actor.id) });
        },
    };
}

