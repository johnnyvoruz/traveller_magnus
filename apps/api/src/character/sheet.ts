import { characterBoxLimit, CharacterClientMessage } from '@voyage/shared';
import { widgetKind } from './widgets.ts';

export type CharacterDocData = {
    fields: Record<string, string | boolean>;
    revs: Record<string, number>;
    seq: number;
};

/**
 * One statement per call. SELECT returns rows; other statements return none.
 * `transaction` runs `fn` as one unit.
 */
export interface Sql {
    exec(query: string, ...params: Array<string | number | null>): Array<Record<string, unknown>>;
    transaction<T>(fn: () => T): T;
}

export type SheetAttachment = {
    userId: string;
    name: string;
    role: 'owner' | 'editor';
    colour: number;
    field: string | null;
};

export type SheetSocket = {
    send(text: string): void;
    close(): void;
    attachment(): SheetAttachment;
    setAttachment(next: SheetAttachment): void;
};

export type AppliedSet = {
    field: string;
    value: string | boolean;
    rev: number;
    seq: number;
};

export type ApplyOutcome =
    | { ok: true; applied: AppliedSet[]; doc: CharacterDocData }
    | { ok: false; why: string; field: string };

export function colourFor(userId: string): number {
    let hash = 0;
    for (let i = 0; i < userId.length; i++) hash = (Math.imul(hash, 33) + userId.charCodeAt(i)) >>> 0;
    return hash % 8;
}

export function installSheet(sql: Sql): void {
    sql.exec(`CREATE TABLE IF NOT EXISTS fields (
        name TEXT PRIMARY KEY,
        value TEXT NOT NULL,
        rev INTEGER NOT NULL,
        updated_by TEXT NOT NULL,
        updated_at TEXT NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS field_rev (
        name TEXT PRIMARY KEY,
        rev INTEGER NOT NULL
    )`);
    sql.exec(`CREATE TABLE IF NOT EXISTS meta (
        key TEXT PRIMARY KEY,
        value TEXT NOT NULL
    )`);
}

export function rejectValue(field: string, value: unknown): string | null {
    const kind = widgetKind(field);
    if (!kind) return 'unknown_field';
    if (kind === 'text') {
        if (typeof value !== 'string') return 'wrong_type';
        if (value.length > characterBoxLimit(field)) return 'too_long';
        return null;
    }
    if (typeof value !== 'boolean') return 'wrong_type';
    return null;
}

function parseStored(raw: unknown): string | boolean | null {
    if (typeof raw !== 'string') return null;
    try {
        const value: unknown = JSON.parse(raw);
        if (typeof value === 'string' || typeof value === 'boolean') return value;
    } catch {
        return null;
    }
    return null;
}

export function readDoc(sql: Sql): CharacterDocData {
    const fields: Record<string, string | boolean> = {};
    const revs: Record<string, number> = {};
    for (const row of sql.exec(`SELECT name, value, rev FROM fields ORDER BY name`)) {
        const value = parseStored(row.value);
        if (value === null || typeof row.name !== 'string') continue;
        fields[row.name] = value;
        revs[row.name] = Number(row.rev);
    }
    const seqRow = sql.exec(`SELECT value FROM meta WHERE key = 'seq'`);
    const seq = seqRow.length ? Number(seqRow[0].value) : 0;
    return { fields, revs, seq };
}

function bumpRev(sql: Sql, name: string): number {
    const rows = sql.exec(`SELECT rev FROM field_rev WHERE name = ?`, name);
    const next = (rows.length ? Number(rows[0].rev) : 0) + 1;
    sql.exec(
        `INSERT INTO field_rev (name, rev) VALUES (?, ?)
         ON CONFLICT(name) DO UPDATE SET rev = excluded.rev`,
        name,
        next,
    );
    return next;
}

function bumpSeq(sql: Sql): number {
    const rows = sql.exec(`SELECT value FROM meta WHERE key = 'seq'`);
    const next = (rows.length ? Number(rows[0].value) : 0) + 1;
    sql.exec(
        `INSERT INTO meta (key, value) VALUES ('seq', ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
        String(next),
    );
    return next;
}

export function applySets(
    sql: Sql,
    sets: Array<{ field: string; value: string | boolean }>,
    by: string,
    at: string,
): ApplyOutcome {
    for (const set of sets) {
        const why = rejectValue(set.field, set.value);
        if (why) return { ok: false, why, field: set.field };
    }
    return sql.transaction(() => {
        const applied: AppliedSet[] = [];
        for (const set of sets) {
            const rev = bumpRev(sql, set.field);
            const seq = bumpSeq(sql);
            if (set.value === '' || set.value === false) {
                sql.exec(`DELETE FROM fields WHERE name = ?`, set.field);
            } else {
                sql.exec(
                    `INSERT INTO fields (name, value, rev, updated_by, updated_at) VALUES (?, ?, ?, ?, ?)
                     ON CONFLICT(name) DO UPDATE SET
                        value = excluded.value,
                        rev = excluded.rev,
                        updated_by = excluded.updated_by,
                        updated_at = excluded.updated_at`,
                    set.field,
                    JSON.stringify(set.value),
                    rev,
                    by,
                    at,
                );
            }
            applied.push({ field: set.field, value: set.value, rev, seq });
        }
        return { ok: true, applied, doc: readDoc(sql) };
    });
}

export function replaceBoxes(
    sql: Sql,
    boxes: Array<{ name: string; value: string | boolean }>,
    by: string,
    at: string,
): void {
    for (const box of boxes) {
        const why = rejectValue(box.name, box.value);
        if (why) throw new Error(why);
        if (box.value === '' || box.value === false) throw new Error('empty');
    }
    sql.transaction(() => {
        sql.exec(`DELETE FROM fields`);
        sql.exec(`DELETE FROM field_rev`);
        let seq = 0;
        for (const box of boxes) {
            seq += 1;
            sql.exec(`INSERT INTO field_rev (name, rev) VALUES (?, 1)`, box.name);
            sql.exec(
                `INSERT INTO fields (name, value, rev, updated_by, updated_at) VALUES (?, ?, 1, ?, ?)`,
                box.name,
                JSON.stringify(box.value),
                by,
                at,
            );
        }
        sql.exec(
            `INSERT INTO meta (key, value) VALUES ('seq', ?)
             ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
            String(seq),
        );
    });
}

function presenceOf(sockets: SheetSocket[]) {
    const byUser = new Map<string, SheetAttachment>();
    for (const socket of sockets) {
        const attachment = socket.attachment();
        const prior = byUser.get(attachment.userId);
        if (!prior || attachment.field) byUser.set(attachment.userId, attachment);
    }
    return [...byUser.values()].map((attachment) => ({
        id: attachment.userId,
        name: attachment.name,
        colour: attachment.colour,
        field: attachment.field,
    }));
}

export class SheetRoom {
    private sql: Sql;
    private sockets: SheetSocket[];

    constructor(sql: Sql, sockets: SheetSocket[]) {
        this.sql = sql;
        this.sockets = sockets;
    }

    /** The socket is already in `sockets`, so `who` includes it. */
    connect(socket: SheetSocket): void {
        const you = socket.attachment();
        socket.send(JSON.stringify({
            t: 'hello',
            you: { id: you.userId, name: you.name, colour: you.colour, role: you.role },
            doc: readDoc(this.sql),
            who: presenceOf(this.sockets),
        }));
        this.broadcastWho(socket);
    }

    receive(socket: SheetSocket, raw: string, at: string): void {
        let body: unknown;
        try {
            body = JSON.parse(raw);
        } catch {
            return;
        }
        const parsed = CharacterClientMessage.safeParse(body);
        if (!parsed.success) {
            const id = body && typeof body === 'object' && 'id' in body ? String((body as { id: unknown }).id) : '';
            if (id) socket.send(JSON.stringify({ t: 'no', id, why: 'bad_message' }));
            return;
        }
        if (parsed.data.t === 'focus') {
            socket.setAttachment({ ...socket.attachment(), field: parsed.data.field });
            this.broadcastWho();
            return;
        }
        const result = applySets(this.sql, [{ field: parsed.data.field, value: parsed.data.value }], socket.attachment().userId, at);
        if (!result.ok) {
            socket.send(JSON.stringify({ t: 'no', id: parsed.data.id, why: result.why }));
            return;
        }
        const applied = result.applied[0];
        if (!applied) return;
        socket.send(JSON.stringify({ t: 'ack', id: parsed.data.id, rev: applied.rev }));
        this.broadcastSet(applied, socket.attachment().userId);
    }

    broadcastSet(applied: AppliedSet, by: string): void {
        const message = JSON.stringify({
            t: 'set',
            field: applied.field,
            value: applied.value,
            rev: applied.rev,
            seq: applied.seq,
            by,
        });
        for (const socket of this.sockets) socket.send(message);
    }

    broadcastWho(except?: SheetSocket): void {
        const message = JSON.stringify({ t: 'who', who: presenceOf(this.sockets) });
        for (const socket of this.sockets) {
            if (socket !== except) socket.send(message);
        }
    }

    broadcastMeta(name: string, summary: string): void {
        const message = JSON.stringify({ t: 'meta', name, summary });
        for (const socket of this.sockets) socket.send(message);
    }

    leave(socket: SheetSocket): void {
        const index = this.sockets.indexOf(socket);
        if (index >= 0) this.sockets.splice(index, 1);
        this.broadcastWho();
    }

    closeUser(userId: string): void {
        const doomed = this.sockets.filter((socket) => socket.attachment().userId === userId);
        const keep = this.sockets.filter((socket) => socket.attachment().userId !== userId);
        this.sockets.length = 0;
        this.sockets.push(...keep);
        for (const socket of doomed) {
            socket.send(JSON.stringify({ t: 'gone', why: 'removed' }));
            socket.close();
        }
        this.broadcastWho();
    }

    closeAll(): void {
        const doomed = [...this.sockets];
        this.sockets.length = 0;
        for (const socket of doomed) {
            socket.send(JSON.stringify({ t: 'gone', why: 'deleted' }));
            socket.close();
        }
    }

    retell(roles: Record<string, 'owner' | 'editor'>): void {
        for (const socket of this.sockets) {
            const attachment = socket.attachment();
            const role = roles[attachment.userId];
            if (role && role !== attachment.role) socket.setAttachment({ ...attachment, role });
            const you = socket.attachment();
            socket.send(JSON.stringify({
                t: 'hello',
                you: { id: you.userId, name: you.name, colour: you.colour, role: you.role },
                doc: readDoc(this.sql),
                who: presenceOf(this.sockets),
            }));
        }
    }
}
