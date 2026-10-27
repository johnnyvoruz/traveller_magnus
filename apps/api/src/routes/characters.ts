import { Hono } from 'hono';
import { originAllowed, requireUser, type AppContext } from '../auth/session';
import { catalogueDb } from '../character/d1';
import { requestOrigin } from '../character/origin';
import { claimRateLimited } from '../character/rate';
import { campaignReferee } from '../character/referee';
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
        return fail(c, 400, 'validation', 'That request could not be read. Try again.');
    }
}

/** Void and accept allow an empty body. A present body must be an object. */
async function readOptionalJson(c: AppContext): Promise<unknown | Response> {
    const text = await c.req.text();
    if (!text) return {};
    try {
        const parsed: unknown = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            return fail(c, 400, 'validation', 'That request could not be read. Try again.');
        }
        return parsed;
    } catch {
        return fail(c, 400, 'validation', 'That request could not be read. Try again.');
    }
}

async function actor(c: AppContext, mutate: boolean) {
    if (mutate && !originAllowed(c)) return fail(c, 403, 'forbidden', 'That request was blocked. Reload the page and try again.');
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

charactersRoute.get('/:id/ledger', async (c) => {
    const user = await actor(c, false);
    if (user instanceof Response) return user;
    const raw = c.req.query('after');
    const after = raw == null || raw === '' ? 0 : Number(raw);
    return respond(c, await service(c).ledgerRead(user, c.req.param('id'), after));
});

charactersRoute.post('/:id/ledger/:lineId/void', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readOptionalJson(c);
    if (body instanceof Response) return body;
    return respond(c, await service(c).ledgerVoid(user, c.req.param('id'), c.req.param('lineId')));
});

charactersRoute.post('/:id/ledger/:lineId/accept', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readOptionalJson(c);
    if (body instanceof Response) return body;
    const id = c.req.param('id');
    const referee = () => campaignReferee(catalogueDb(c.env.DB), c.env, user.id, id);
    return respond(c, await service(c).ledgerAccept(user, id, c.req.param('lineId'), referee));
});

charactersRoute.post('/:id/ledger/mode', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const credits = body && typeof body === 'object' && !Array.isArray(body)
        ? (body as Record<string, unknown>).credits
        : undefined;
    return respond(c, await service(c).ledgerMode(user, c.req.param('id'), credits));
});

charactersRoute.post('/:id/ledger', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const body = await readJson(c);
    if (body instanceof Response) return body;
    const id = c.req.param('id');
    const referee = () => campaignReferee(catalogueDb(c.env.DB), c.env, user.id, id);
    const record = body && typeof body === 'object' && !Array.isArray(body) ? body as Record<string, unknown> : {};
    return respond(c, await service(c).ledgerPost(user, id, {
        kind: record.kind,
        amount: record.amount,
        memo: record.memo,
        whenDay: record.whenDay,
        linkId: record.linkId,
    }, referee));
});

charactersRoute.get('/:id/live', async (c) => {
    const user = await actor(c, true);
    if (user instanceof Response) return user;
    const gate = await service(c).live(user, c.req.param('id'));
    if (!gate.ok) return respond(c, gate);
    const data = gate.data as { role: 'owner' | 'editor'; name: string };
    return openSocket(c.env, c.req.param('id'), c.req.raw, user.id, data.name, data.role);
});
