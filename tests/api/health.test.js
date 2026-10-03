import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import test from 'node:test';
import { withDevServer, wranglerBin } from './server.js';

if (process.env.RUN_API_TESTS !== '1') {
    test('health envelopes', { skip: 'set RUN_API_TESTS=1' }, () => {});
} else if (!existsSync(wranglerBin)) {
    test('health envelopes', { skip: 'wrangler is absent' }, () => {});
} else {
    test('health envelopes', { timeout: 180000 }, async () => {
        await withDevServer(async (base) => {
            const health = await fetch(`${base}/api/health`);
            assert.equal(health.ok, true);
            const healthBody = await health.json();
            assert.equal(healthBody.ok, true);
            assert.equal(healthBody.data.db, 'ok');
            assert.equal(typeof healthBody.data.version, 'string');
            assert.equal(typeof healthBody.data.engineVersion, 'string');
            assert.ok('truthVersion' in healthBody.data);

            const nope = await fetch(`${base}/api/nope`);
            assert.equal(nope.status, 404);
            const nopeBody = await nope.json();
            assert.equal(nopeBody.ok, false);
            assert.equal(nopeBody.error.code, 'not_found');

            const me = await fetch(`${base}/api/me`);
            assert.equal(me.status, 401);
            const meBody = await me.json();
            assert.equal(meBody.ok, false);
            assert.equal(meBody.error.code, 'unauthenticated');

            const start = await fetch(`${base}/api/auth/sign-in/social`, {
                method: 'POST',
                headers: { 'content-type': 'application/json' },
                body: JSON.stringify({ provider: 'twitter' }),
            });
            assert.equal(start.status, 404);
            const startBody = await start.json();
            assert.equal(startBody.code, 'PROVIDER_NOT_FOUND');
        });
    });
}
