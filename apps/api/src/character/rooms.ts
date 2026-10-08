import type { Env } from '../env';
import type { CharacterRooms, RoomDoc } from './service.ts';

function stub(env: Env, id: string) {
    return env.CHARACTER.get(env.CHARACTER.idFromName(id));
}

async function call(env: Env, id: string, path: string, body?: unknown): Promise<Response> {
    return stub(env, id).fetch(new Request(`https://character.internal${path}`, {
        method: body === undefined ? 'GET' : 'POST',
        headers: body === undefined ? undefined : { 'content-type': 'application/json' },
        body: body === undefined ? undefined : JSON.stringify(body),
    }));
}

async function payload<T>(response: Response): Promise<T> {
    const body = await response.json() as { ok?: boolean; data?: T; error?: { message?: string } };
    if (!response.ok || !body.ok) throw new Error(body.error?.message || `character room ${response.status}`);
    return body.data as T;
}

export function characterRooms(env: Env): CharacterRooms {
    return {
        async ensure(id) {
            await payload(await call(env, id, '/doc'));
        },
        async read(id) {
            return payload<RoomDoc>(await call(env, id, '/doc'));
        },
        async apply(id, sets, by) {
            const response = await call(env, id, '/apply', { sets, by });
            const body = await response.json() as {
                ok?: boolean;
                data?: { doc: RoomDoc; applied: Array<{ field: string; rev: number; value: string | boolean }> };
                error?: { details?: { why?: string; field?: string } };
            };
            if (response.status === 400 && body.error?.details?.why) {
                return { ok: false, why: body.error.details.why, field: body.error.details.field ?? '' };
            }
            if (!response.ok || !body.ok || !body.data) throw new Error('character room apply failed');
            const data = body.data as { doc: RoomDoc; applied: Array<{ field: string; rev: number; value: string | boolean }> };
            return { ok: true, doc: data.doc, applied: data.applied };
        },
        async replace(id, boxes, by) {
            await payload(await call(env, id, '/replace', { boxes, by }));
        },
        async meta(id, name, summary) {
            await payload(await call(env, id, '/meta', { name, summary }));
        },
        async closeUser(id, userId) {
            await payload(await call(env, id, '/close-user', { userId }));
        },
        async closeAll(id) {
            await payload(await call(env, id, '/close-all', {}));
        },
        async retell(id, roles) {
            await payload(await call(env, id, '/retell', { roles }));
        },
    };
}

export async function openSocket(env: Env, id: string, request: Request, userId: string, name: string, role: 'owner' | 'editor'): Promise<Response> {
    const headers = new Headers(request.headers);
    headers.set('x-voyage-user-id', userId);
    headers.set('x-voyage-user-name', encodeURIComponent(name));
    headers.set('x-voyage-role', role);
    return stub(env, id).fetch(new Request(request, { headers }));
}
