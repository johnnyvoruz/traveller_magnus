import { Hono } from 'hono';
import type { AppEnv, Env } from './env';
import { requestContext } from './http';
import { createAuth } from './auth/auth';
import { linkRefusal, signOutRequest } from './auth/auth_http';
import { detectPasskeyColumns } from './auth/passkey_schema';
import { PASSKEY_UNAVAILABLE } from './auth/passkey_words';
import { health } from './routes/health';
import { me } from './routes/auth';
import { generate } from './routes/generate';
import { truth } from './routes/truth';
import { admin } from './routes/admin';
import { adminPackagesRoute } from './routes/admin_packages';
import { installsRoute } from './routes/installs';
import { packagesRoute } from './routes/packages';
import { universesRoute } from './routes/universes';
import { getPublicGames } from './routes/public_games';
import { getPublicShip } from './routes/public_ships';
import { charactersRoute } from './routes/characters';
import { deadLetterConsumer } from './jobs/dead_letter';
import { generateConsumer } from './jobs/generate_queue';
import { publishConsumer } from './jobs/publish_queue';
import { truthBuildConsumer } from './jobs/truth_build';
import { fail, ok } from './http';
export { UniverseDO } from './universe/UniverseDO';
export { CharacterRoom } from './character/CharacterRoom';

function passkeySurface(path: string): boolean {
    return path.startsWith('/api/auth/passkey')
        || path === '/api/auth/username'
        || path.startsWith('/api/auth/recovery')
        || path === '/api/auth/is-username-available';
}

const app = new Hono<AppEnv>();
app.use('*', requestContext);
app.on(['GET', 'POST'], '/api/auth/*', async (c) => {
    const ready = await detectPasskeyColumns(c.env.DB);
    if (!ready && passkeySurface(c.req.path)) {
        return c.json({ code: 'passkey_unavailable', message: PASSKEY_UNAVAILABLE }, 503);
    }
    const response = await createAuth(c.env).handler(signOutRequest(c.req.raw));
    return linkRefusal(response);
});
app.route('/api', health);
app.get('/api/me', me);
app.get('/api/providers', (c) => ok(c, {
    twitter: Boolean(c.env.TWITTER_CLIENT_ID && c.env.TWITTER_CLIENT_SECRET),
    discord: Boolean(c.env.DISCORD_CLIENT_ID && c.env.DISCORD_CLIENT_SECRET),
    google: Boolean(c.env.GOOGLE_CLIENT_ID && c.env.GOOGLE_CLIENT_SECRET),
}));
app.route('/api', generate);
app.route('/api/truth', truth);
app.route('/api/admin/packages', adminPackagesRoute);
app.route('/api/admin', admin);
app.route('/api/universes', installsRoute);
app.route('/api/universes', universesRoute);
app.get('/api/public-games', getPublicGames);
app.get('/api/public-ships/:mark', getPublicShip);
app.route('/api/packages', packagesRoute);
app.route('/api/characters', charactersRoute);
app.onError((err, c) => { console.error(JSON.stringify({ requestId: c.get('requestId'), err: String(err), stack: (err as Error).stack })); return fail(c, 500, 'internal', 'Something went wrong.', { requestId: c.get('requestId') }); });
app.notFound((c) => c.req.path.startsWith('/api/') ? fail(c, 404, 'not_found', 'No such route.') : c.env.ASSETS.fetch(c.req.raw));

export default {
    fetch: app.fetch,
    async queue(batch: MessageBatch, env: Env) {
        if (batch.queue === 'voyage-truth-build') await truthBuildConsumer(batch, env);
        else if (batch.queue === 'voyage-generate') await generateConsumer(batch, env);
        else if (batch.queue === 'voyage-publish') await publishConsumer(batch, env);
        else if (batch.queue === 'voyage-dlq') await deadLetterConsumer(batch, env);
        else batch.ackAll();
    },
    async scheduled() { /* slice 2: snapshots and GC */ }
};
