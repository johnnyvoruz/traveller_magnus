import { DurableObject } from 'cloudflare:workers';
import type { Env } from '../env';
import {
    applySets,
    colourFor,
    installSheet,
    readDoc,
    replaceBoxes,
    SheetRoom,
    type SheetAttachment,
    type SheetSocket,
    type Sql,
} from './sheet.ts';

type LiveSocket = SheetSocket & { ws: WebSocket };

function json(data: unknown, status = 200): Response {
    return Response.json({ ok: true, data }, { status });
}

function problem(status: 400 | 401, code: string, message: string, details?: unknown): Response {
    const error: { code: string; message: string; details?: unknown } = { code, message };
    if (details !== undefined) error.details = details;
    return Response.json({ ok: false, error }, { status });
}

export class CharacterRoom extends DurableObject<Env> {
    constructor(ctx: DurableObjectState, env: Env) {
        super(ctx, env);
        ctx.blockConcurrencyWhile(async () => {
            installSheet(this.sql());
        });
    }

    private sql(): Sql {
        return {
            exec: (query, ...params) => this.ctx.storage.sql.exec(query, ...params).toArray() as ReturnType<Sql['exec']>,
            transaction: (fn) => this.ctx.storage.transactionSync(fn),
        };
    }

    private wrap(ws: WebSocket): LiveSocket {
        return {
            ws,
            send: (text) => ws.send(text),
            close: () => ws.close(1000, 'gone'),
            attachment: () => ws.deserializeAttachment() as SheetAttachment,
            setAttachment: (next) => ws.serializeAttachment(next),
        };
    }

    private sockets(except?: WebSocket): LiveSocket[] {
        return this.ctx.getWebSockets().filter((ws) => ws !== except).map((ws) => this.wrap(ws));
    }

    private room(sockets: LiveSocket[]): SheetRoom {
        return new SheetRoom(this.sql(), sockets);
    }

    async fetch(request: Request): Promise<Response> {
        const url = new URL(request.url);
        // The worker forwards the public request, whose path is /api/characters/<id>/live.
        if (request.method === 'GET' && (url.pathname === '/live' || url.pathname.endsWith('/live'))) return this.join(request);
        if (request.method === 'GET' && url.pathname === '/doc') return json(readDoc(this.sql()));
        let body: unknown = null;
        if (request.method === 'POST') {
            try {
                body = await request.json();
            } catch {
                return problem(400, 'validation', 'Invalid JSON.');
            }
        }
        const record = body && typeof body === 'object' ? body as Record<string, unknown> : {};
        if (request.method === 'POST' && url.pathname === '/apply') {
            const sets = Array.isArray(record.sets) ? record.sets as Array<{ field: string; value: string | boolean }> : [];
            const by = typeof record.by === 'string' ? record.by : '';
            const result = applySets(this.sql(), sets, by, new Date().toISOString());
            if (!result.ok) return problem(400, 'validation', 'Invalid field.', { field: result.field, why: result.why });
            const room = this.room(this.sockets());
            for (const applied of result.applied) room.broadcastSet(applied, by);
            return json({
                doc: result.doc,
                applied: result.applied.map(({ field, rev, value }) => ({ field, rev, value })),
            });
        }
        if (request.method === 'POST' && url.pathname === '/replace') {
            const boxes = Array.isArray(record.boxes) ? record.boxes as Array<{ name: string; value: string | boolean }> : [];
            const by = typeof record.by === 'string' ? record.by : '';
            replaceBoxes(this.sql(), boxes, by, new Date().toISOString());
            return json({ seq: readDoc(this.sql()).seq });
        }
        if (request.method === 'POST' && url.pathname === '/meta') {
            const name = typeof record.name === 'string' ? record.name : '';
            const summary = typeof record.summary === 'string' ? record.summary : '';
            this.room(this.sockets()).broadcastMeta(name, summary);
            return json({ name, summary });
        }
        if (request.method === 'POST' && url.pathname === '/close-user') {
            const userId = typeof record.userId === 'string' ? record.userId : '';
            this.room(this.sockets()).closeUser(userId);
            return json({ userId });
        }
        if (request.method === 'POST' && url.pathname === '/close-all') {
            this.room(this.sockets()).closeAll();
            return json({ closed: true });
        }
        if (request.method === 'POST' && url.pathname === '/retell') {
            const roles = record.roles && typeof record.roles === 'object'
                ? record.roles as Record<string, 'owner' | 'editor'>
                : {};
            this.room(this.sockets()).retell(roles);
            return json({ roles });
        }
        return problem(400, 'not_found', 'No such route.');
    }

    private join(request: Request): Response {
        if (request.headers.get('upgrade')?.toLowerCase() !== 'websocket') {
            return problem(400, 'validation', 'WebSocket required.');
        }
        const userId = request.headers.get('x-voyage-user-id') ?? '';
        const role = request.headers.get('x-voyage-role');
        if (!userId || (role !== 'owner' && role !== 'editor')) return problem(401, 'unauthenticated', 'Sign in required.');
        let name = userId;
        try {
            name = decodeURIComponent(request.headers.get('x-voyage-user-name') ?? '') || userId;
        } catch {
            name = userId;
        }
        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];
        this.ctx.acceptWebSocket(server);
        const attachment: SheetAttachment = {
            userId,
            name,
            role,
            colour: colourFor(userId),
            field: null,
        };
        server.serializeAttachment(attachment);
        const sockets = this.sockets();
        const mine = sockets.find((socket) => socket.ws === server);
        if (mine) this.room(sockets).connect(mine);
        return new Response(null, { status: 101, webSocket: client });
    }

    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
        const text = typeof message === 'string' ? message : new TextDecoder().decode(message);
        const sockets = this.sockets();
        const mine = sockets.find((socket) => socket.ws === ws);
        if (!mine) return;
        this.room(sockets).receive(mine, text, new Date().toISOString());
    }

    webSocketClose(ws: WebSocket): void {
        const sockets = this.sockets();
        const mine = sockets.find((socket) => socket.ws === ws);
        if (!mine) {
            this.room(sockets).broadcastWho();
            return;
        }
        this.room(sockets).leave(mine);
    }

    webSocketError(ws: WebSocket): void {
        this.webSocketClose(ws);
    }
}
