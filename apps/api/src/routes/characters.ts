import { Hono } from 'hono';
import { originAllowed, requireUser, type AppContext } from '../auth/session';
import { catalogueDb } from '../character/d1';
import { requestOrigin } from '../character/origin';
import { claimRateLimited } from '../character/rate';
import { characterRooms, openSocket } from '../character/rooms';
import { characterService, type Outcome } from '../character/service';
import type { AppEnv } from '../env';
import { fail, ok } from '../http';

export { claimRateLimited };

export const charactersRoute = new Hono<AppEnv>();

function service(c: AppContext) {
    return characterService(catalogueDb(c.env.DB), characterRooms(c.env));
}

function respond(c: AppContext, outcome: Outcome) {
    if (outcome.ok) return ok(c, outcome.data, outcome.status);
    return fail(c, outcome.status, outcome.code, outcome.message, outcome.details);
}

async function readJson(c: AppContext): Promise<unknown | Response> {
    try {
        return await c.req.json();
    } catch {
        return fail(c, 400, 'validation', 'Invalid JSON.');
    }
}

async function actor(c: AppContext, mutate: boolean) {
    if (mutate && !originAllowed(c)) return fail(c, 403, 'forbidden', 'Origin check failed.');
    return requireUser(c);
}

charactersRoute.get('/', async (c) => {
    const user = await actor(c, false);
    if (user instanceof Response) return user;
    return respond(c, await service(c).list(user));
});

charactersRoute.post('/', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    return respond(c, await service(c).create(user, body));
});

charactersRoute.post('/claim', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    if (claimRateLimited(user.id)) {
        c.header('retry-after', '10');
        return fail(c, 429, 'rate_limited', 'Too many requests.');
    }
    const body = await readJson(c);
    if (body instanceof Response) return body;
    return respond(c, await service(c).claim(user, body));
});

charactersRoute.get('/:id', async (c) => {
    const user = await actor(c, false);
    if (user instanceof Response) return user;
    return respond(c, await service(c).open(user, c.req.param('id')));
});

charactersRoute.patch('/:id', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    return respond(c, await service(c).patch(user, c.req.param('id'), body));
});

charactersRoute.delete('/:id', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    return respond(c, await service(c).remove(user, c.req.param('id')));
});

charactersRoute.post('/:id/fields', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    return respond(c, await service(c).writeFields(user, c.req.param('id'), body));
});

charactersRoute.get('/:id/access', async (c) => {
    const user = await actor(c, false);
    if (user instanceof Response) return user;
    return respond(c, await service(c).access(user, c.req.param('id')));
});

charactersRoute.delete('/:id/access/:userId', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    return respond(c, await service(c).removeAccess(user, c.req.param('id'), c.req.param('userId')));
});

charactersRoute.post('/:id/owner', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    return respond(c, await service(c).giveOwner(user, c.req.param('id'), body));
});

charactersRoute.post('/:id/invites', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    return respond(c, await service(c).makeInvite(user, c.req.param('id'), requestOrigin(c.req.raw)));
});

charactersRoute.get('/:id/invites', async (c) => {
    const user = await actor(c, false);
    if (user instanceof Response) return user;
    return respond(c, await service(c).listInvites(user, c.req.param('id')));
});

charactersRoute.delete('/:id/invites/:inviteId', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    return respond(c, await service(c).revokeInvite(user, c.req.param('id'), c.req.param('inviteId')));
});

charactersRoute.get('/:id/live', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const gate = await service(c).live(user, c.req.param('id'));
    if (!gate.ok) return respond(c, gate);
    const data = gate.data as { role: 'owner' | 'editor'; name: string };
    return openSocket(c.env, c.req.param('id'), c.req.raw, user.id, data.name, data.role);
});
