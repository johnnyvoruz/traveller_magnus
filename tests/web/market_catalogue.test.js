/**
 * catalogue.ts against a fake fetch (phase 4b): the URL, method and body of every call, and
 * server sentences passed through unchanged.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cataloguePath, installBody, MarketError, marketWire, READ_FAILED, versionKeys } from '../../apps/web/src/marketplace/catalogue.ts';

const PK = 'pk_0123456789ABCDEFGHJKMNPQRS';
const U = 'u_1';

function fake(reply = () => ({ status: 200, body: { ok: true, data: { items: [] } } })) {
    const calls = [];
    const impl = async (url, init = {}) => {
        calls.push({ url, method: init.method, body: init.body === undefined ? undefined : JSON.parse(init.body), type: new Headers(init.headers).get('content-type') });
        const r = reply(url, init);
        return new Response(typeof r.body === 'string' ? r.body : JSON.stringify(r.body), { status: r.status });
    };
    return { calls, impl };
}

test('cataloguePath leaves empty fields out and keeps mine, hidden and the cursor', () => {
    assert.equal(cataloguePath({}), '/api/packages?sort=updated');
    assert.equal(cataloguePath({ q: '  regina ', kind: 'subsector', tag: 'lanth', sort: 'installs' }), '/api/packages?q=regina&kind=subsector&tag=lanth&sort=installs');
    assert.equal(cataloguePath({ q: ' ', kind: '', mine: true }), '/api/packages?sort=updated&mine=1');
    assert.equal(cataloguePath({ hidden: true, sort: 'title', cursor: 'abc' }), '/api/packages?sort=title&hidden=1&cursor=abc');
});

test('every call goes to the right route with the right method and body', async () => {
    const { calls, impl } = fake();
    const wire = marketWire(impl);
    await wire.catalogue({ tag: 'x y' });
    await wire.page(PK);
    await wire.report(PK, 'Spam.');
    await wire.takedown(PK, 'Spam.');
    await wire.restore(PK);
    await wire.installs(U);
    await wire.preview(U, { packageId: PK, version: 2 });
    await wire.preview(U, { packageId: PK, version: 2, placement: { anchor: 'spin/0101', to: 'troj/3205' } });
    await wire.preview(U, { packageId: PK, version: 3, installId: 'in_1', placement: { anchor: 'a/0101', to: 'b/0101' } });
    const ask = { packageId: PK, version: 2, resolutions: { 'spin/0101': 'mine' }, recordResolutions: {}, conflicts: 1 };
    await wire.install(U, ask);
    await wire.install(U, { ...ask, placement: { anchor: 'spin/0101', to: 'troj/3205' } });
    await wire.install(U, { ...ask, installId: 'in_1', placement: { anchor: 'a/0101', to: 'b/0101' } });
    await wire.remove(U, 'in_1');
    const seen = calls.map((c) => [c.method, c.url, c.body]);
    const body = { packageId: PK, version: 2, resolutions: { 'spin/0101': 'mine' }, recordResolutions: {}, expect: { conflicts: 1 } };
    assert.deepEqual(seen, [
        ['GET', '/api/packages?tag=x+y&sort=updated', undefined],
        ['GET', `/api/packages/${PK}`, undefined],
        ['POST', `/api/packages/${PK}/report`, { reason: 'Spam.' }],
        ['POST', `/api/admin/packages/${PK}/takedown`, { reason: 'Spam.' }],
        ['POST', `/api/admin/packages/${PK}/restore`, {}],
        ['GET', '/api/universes/u_1/installs', undefined],
        ['GET', `/api/universes/u_1/install/preview?packageId=${PK}&version=2`, undefined],
        ['GET', `/api/universes/u_1/install/preview?packageId=${PK}&version=2&anchor=spin%2F0101&to=troj%2F3205`, undefined],
        ['GET', `/api/universes/u_1/install/preview?packageId=${PK}&version=3&installId=in_1`, undefined],
        ['POST', '/api/universes/u_1/install', body],
        ['POST', '/api/universes/u_1/install', { ...body, placement: { anchor: 'spin/0101', to: 'troj/3205' } }],
        ['POST', '/api/universes/u_1/install', { ...body, installId: 'in_1' }],
        ['DELETE', '/api/universes/u_1/installs/in_1', undefined],
    ]);
    assert.equal(calls[2].type, 'application/json');
    assert.deepEqual(installBody(ask), body);
});

test('server sentences pass through unchanged, with the status and details', async () => {
    const { impl } = fake(() => ({ status: 409, body: { ok: false, error: { code: 'conflict', message: 'This package is already imported here.', details: { installId: 'in_1' } } } }));
    const wire = marketWire(impl);
    for (const run of [() => wire.install(U, { packageId: PK, version: 1, resolutions: {}, recordResolutions: {}, conflicts: 0 }), () => wire.remove(U, 'in_1'), () => wire.page(PK)]) {
        await assert.rejects(run(), (err) => err instanceof MarketError && err.message === 'This package is already imported here.' && err.status === 409 && err.details.installId === 'in_1');
    }
    const odd = marketWire(fake(() => ({ status: 200, body: 'not json' })).impl);
    await assert.rejects(odd.page(PK), (err) => err.message === READ_FAILED);
    const thrown = marketWire(async () => { throw new Error('Network down.'); });
    await assert.rejects(thrown.page(PK), (err) => err.message === 'Network down.');
});

test('versionKeys reads the manifest from the CDN and is null when it cannot', async () => {
    const { calls, impl } = fake(() => ({ status: 200, body: { hexes: { 'b/0102': {}, 'a/0101': {} } } }));
    assert.deepEqual(await versionKeys(impl, 'https://cdn.example/', PK, 2), ['a/0101', 'b/0102']);
    assert.equal(calls[0].url, `https://cdn.example/packages/${PK}/2/manifest.json`);
    assert.equal(await versionKeys(fake(() => ({ status: 404, body: {} })).impl, '', PK, 2), null);
});
