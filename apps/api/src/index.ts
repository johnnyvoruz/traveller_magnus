import { Hono } from 'hono';
import type { Env } from './env';
import { requestContext } from './http';
import { createAuth } from './auth/auth';
import { health } from './routes/health';
import { me } from './routes/auth';
import { generate } from './routes/generate';
import { truth } from './routes/truth';
import { admin } from './routes/admin';
import { truthBuildConsumer } from './jobs/truth_build';
import { fail } from './http';
export { UniverseDO } from './universe/UniverseDO';

const app = new Hono<{ Bindings: Env }>();
app.use('*', requestContext);
app.on(['GET', 'POST'], '/api/auth/*', (c) => createAuth(c.env).handler(c.req.raw));
app.route('/api', health);
app.get('/api/me', me);
app.route('/api', generate);
app.route('/api/truth', truth);
app.route('/api/admin', admin);
app.onError((err, c) => { console.error(JSON.stringify({ requestId: c.get('requestId'), err: String(err), stack: (err as Error).stack })); return fail(c, 500, 'internal', 'Something went wrong.', { requestId: c.get('requestId') }); });
app.notFound((c) => c.req.path.startsWith('/api/') ? fail(c, 404, 'not_found', 'No such route.') : c.env.ASSETS.fetch(c.req.raw));

export default {
    fetch: app.fetch,
    async queue(batch: MessageBatch, env: Env) {
        if (batch.queue === 'voyage-truth-build') await truthBuildConsumer(batch, env);
        else batch.ackAll();
    },
    async scheduled() { /* slice 2: snapshots and GC */ }
};
