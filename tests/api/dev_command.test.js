import assert from 'node:assert/strict';
import test from 'node:test';
import { API_PORT, DEV_PERSIST, PAGE, WEB_PORT, apiArgs, localTruth, newestReleasedAt, pinStatements, secretPresent, webEnv, withdrawNewerStatement } from '../../scripts/dev.mjs';

test('the dev command keeps the page origin and does not edit wrangler.toml', () => {
    const args = apiArgs();
    assert.equal(PAGE, `http://localhost:${WEB_PORT}`);
    assert.ok(args.includes('--host'));
    assert.ok(args.includes(`localhost:${WEB_PORT}`));
    assert.ok(args.includes('--local-upstream'));
    assert.ok(args.includes('--var'));
    assert.ok(args.includes(`BETTER_AUTH_URL:${PAGE}`));
    assert.equal(args.includes('--config'), false);
    assert.equal(String(API_PORT), '8787');
    const persist = args.indexOf('--persist-to');
    assert.ok(persist !== -1);
    assert.equal(args[persist + 1], DEV_PERSIST);
    assert.equal(DEV_PERSIST, '.wrangler/dev');
});

test('the chart comes from production unless --local-truth', () => {
    const remote = webEnv(['node', 'dev.mjs'], { VOYAGE_TRUTH_API: 'http://leftover' });
    assert.equal(remote.VOYAGE_TRUTH_API, 'https://traveller.voyage');
    assert.equal(remote.VOYAGE_KEEP_ORIGIN, '1');
    assert.equal(remote.VOYAGE_API, 'http://127.0.0.1:8787');
    const local = webEnv(['node', 'dev.mjs', '--local-truth'], { VOYAGE_TRUTH_API: 'http://leftover' });
    assert.equal(localTruth(['--local-truth']), true);
    assert.equal('VOYAGE_TRUTH_API' in local, false);
});

test('a released chart version can be pinned in the local catalogue', () => {
    const lines = pinStatements([
        { version: 'v10', engineVersion: '1.2.0', state: 'released', releasedAt: '2026-10-14T15:11:06.248Z', sectorsTotal: 0, sectorsDone: 0 },
        { version: 'drop me', state: 'released', releasedAt: '2026-10-14T15:11:06.248Z' },
        { version: 'v2', state: 'building', releasedAt: '2026-10-03T18:15:16.370Z' },
    ]);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /'v10'/);
    assert.match(lines[0], /INSERT OR IGNORE/);
});

test('a local released row newer than production is withdrawn', () => {
    const newest = newestReleasedAt([
        { state: 'released', releasedAt: '2026-10-14T15:11:06.248Z', version: 'v10' },
        { state: 'released', releasedAt: '2026-10-03T18:15:16.370Z', version: 'v2' },
        { state: 'building', releasedAt: '2026-10-17T00:00:00.000Z', version: 'v11' },
    ]);
    assert.equal(newest, '2026-10-14T15:11:06.248Z');
    const sql = withdrawNewerStatement(newest);
    assert.match(sql, /SET state = 'withdrawn'/);
    assert.match(sql, /released_at > '2026-10-14T15:11:06.248Z'/);
    assert.equal(withdrawNewerStatement(''), null);
    assert.equal(withdrawNewerStatement('vtest'), null);
});

test('a missing auth secret is noticed without reading the value aloud', () => {
    assert.equal(secretPresent(''), false);
    assert.equal(secretPresent('BETTER_AUTH_SECRET=\n'), false);
    assert.equal(secretPresent('BETTER_AUTH_SECRET=""\n'), false);
    assert.equal(secretPresent('# BETTER_AUTH_SECRET=nope\n'), false);
    assert.equal(secretPresent('BETTER_AUTH_SECRET="present"\n'), true);
});
