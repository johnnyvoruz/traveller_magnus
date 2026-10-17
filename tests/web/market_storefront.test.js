/**
 * The marketplace as a storefront (prompts/d_storefront.md): the kind table and the cover
 * addresses (marketplace/covers.ts), the featured row, chips, facts and what a package page
 * lists (workspace/market/storefront.ts), the cover on the wire (F17), and a new package's
 * cover sent once the package exists.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { session } from '../../apps/web/src/account/session.ts';
import { campaign } from '../../apps/web/src/campaign/store.ts';
import { coverForm, marketWire, publicRecords, versionContents } from '../../apps/web/src/marketplace/catalogue.ts';
import { defaultCoverUrl, FAMILIES, FAMILY_WORDS, KIND_FAMILIES, kindFamily, objectUrl, shownCover, sourceWords } from '../../apps/web/src/marketplace/covers.ts';
import { COVER_LIMITS, prepareCover } from '../../apps/web/src/workspace/market/cover_image.ts';
import { fakeMarketStore } from '../../apps/web/src/workspace/market/fake_store.ts';
import { closePublish, coverDraft, coverMissed, marketUi, publish, useCoverSender, useMarketStore } from '../../apps/web/src/workspace/market/market.ts';
import {
    cardFacts, featured, galleryImages, hexesInside, kindWords, moreBy, recordGroups, sectorNames, updatedWords,
} from '../../apps/web/src/workspace/market/storefront.ts';

const H = (n) => String(n).repeat(64).slice(0, 64);
const CDN = 'https://cdn.traveller.voyage';

function card(over = {}) {
    return {
        id: 'pk_1', title: 'A', authorHandle: 'varn', kind: 'system', truthVersion: 'v10', edition: 'MgT2E', hexCount: 1, tags: [],
        latestVersion: 1, installs: 0, updatedAt: '2026-10-15T08:00:00.000Z', hidden: false, cover: null, ...over,
    };
}

test('the kind table: first match, case-insensitive, anywhere in the kind; everything else is other', () => {
    const cases = {
        sector: 'map', Subsector: 'map', 'sector piece': 'map', 'Trade MAP': 'map', region: 'map',
        system: 'system', Systems: 'system',
        ships: 'ship', ship: 'ship', vessel: 'ship', 'Merchant fleet': 'ship',
        people: 'people', contacts: 'people', NPCs: 'people', crew: 'people', characters: 'people',
        patrons: 'patrons', jobs: 'patrons', mission: 'patrons', 'adventure hooks': 'patrons',
        organization: 'organization', organisation: 'organization', faction: 'organization', corporation: 'organization', 'noble house': 'organization',
        adventure: 'adventure', scenario: 'adventure', event: 'adventure', campaign: 'adventure',
        hexes: 'other', '': 'other', 'odds and ends': 'other',
    };
    for (const [kind, family] of Object.entries(cases)) assert.equal(kindFamily(kind), family, kind);
    // First match wins: a sector of ships is a map; a ship's crew is a ship.
    assert.equal(kindFamily('sector of ships'), 'map');
    assert.equal(kindFamily('ship crew'), 'ship');
    assert.deepEqual(KIND_FAMILIES.map((row) => row.family), ['map', 'system', 'ship', 'people', 'patrons', 'organization', 'adventure']);
    assert.deepEqual(FAMILIES, ['map', 'system', 'ship', 'people', 'patrons', 'organization', 'adventure', 'other']);
    for (const family of FAMILIES) assert.ok(FAMILY_WORDS[family]);
});

test('every family has its two default files in apps/web/public/covers', () => {
    for (const family of FAMILIES) {
        for (const thumb of [true, false]) {
            const url = defaultCoverUrl(family, thumb);
            assert.ok(readFileSync(new URL('../../apps/web/public' + url, import.meta.url)).byteLength > 0, url);
        }
    }
    assert.equal(defaultCoverUrl('ship', true), '/covers/ship_640.webp');
    assert.equal(defaultCoverUrl('ship', false), '/covers/ship.webp');
});

test('the cover shown: the server cover by its hashes on the CDN, else the default for the family', () => {
    const upload = shownCover(card({ kind: 'ships', cover: { hash: H(1), thumbHash: H(2), source: 'upload' } }), CDN + '/');
    assert.deepEqual(upload, { thumb: CDN + '/objects/' + H(2), full: CDN + '/objects/' + H(1), source: 'upload', family: 'ship' });
    assert.equal(shownCover(card({ cover: { hash: H(3), thumbHash: H(4), source: 'record' } }), CDN).source, 'record');
    const none = shownCover(card({ kind: 'sector piece', cover: null }), CDN);
    assert.deepEqual(none, { thumb: '/covers/map_640.webp', full: '/covers/map.webp', source: 'default', family: 'map' });
    // A card from a server before F17 has no field at all.
    const older = card();
    delete older.cover;
    assert.equal(shownCover(older, CDN).source, 'default');
    assert.equal(objectUrl('http://127.0.0.1:9000/', 'abc'), 'http://127.0.0.1:9000/objects/abc');
    assert.equal(sourceWords('upload'), 'Your upload');
    assert.equal(sourceWords('record'), 'From your records');
    assert.equal(sourceWords('default'), 'Default for its kind');
});

test('the featured row: the three most imported, hidden below six packages', () => {
    const five = [1, 2, 3, 4, 5].map((n) => card({ id: 'pk_' + n, installs: n }));
    assert.deepEqual(featured(five).cards, []);
    const six = [...five, card({ id: 'pk_6', installs: 9 })];
    assert.equal(featured(six).heading, 'Most imported');
    assert.deepEqual(featured(six).cards.map((item) => item.id), ['pk_6', 'pk_5', 'pk_4']);
    const tied = [...six, card({ id: 'pk_7', installs: 9, updatedAt: '2026-10-16T00:00:00.000Z' })];
    assert.deepEqual(featured(tied).cards.map((item) => item.id), ['pk_7', 'pk_6', 'pk_5']);
});

test('a card: facts in priority order, and Updated as a relative date', () => {
    assert.equal(cardFacts(card({ kind: 'sector piece', hexCount: 6, installs: 1 })), 'Sector piece · 6 hexes · 1 import');
    assert.equal(kindWords('ships'), 'Ships');
    const now = Date.parse('2026-10-15T12:00:00.000Z');
    assert.equal(updatedWords('2026-10-15T01:00:00.000Z', now), 'Updated today');
    assert.equal(updatedWords('2026-10-14T11:00:00.000Z', now), 'Updated yesterday');
    assert.equal(updatedWords('2026-10-10T12:00:00.000Z', now), 'Updated 5 days ago');
    assert.equal(updatedWords('2026-09-24T12:00:00.000Z', now), 'Updated 3 weeks ago');
    assert.equal(updatedWords('2026-06-15T12:00:00.000Z', now), 'Updated 4 months ago');
    assert.equal(updatedWords('2024-10-01T12:00:00.000Z', now), 'Updated 2 years ago');
    assert.equal(updatedWords('not a date', now), '');
});

test("what's inside: the sectors the hexes fall in, own sectors counted", () => {
    assert.deepEqual(sectorNames(['Spinward_Marches/2005'], []), ['Spinward Marches']);
    assert.equal(hexesInside(['Spinward_Marches/2005'], []), '1 hex in Spinward Marches');
    assert.equal(hexesInside(['Spinward_Marches/2005', 'Deneb/0101', 'Deneb/0102'], []), '3 hexes in Spinward Marches and Deneb');
    assert.equal(hexesInside(['s_own/0101', 's_own/0102'], ['s_own']), '2 hexes in an own sector');
    assert.equal(hexesInside(['A/0101', 'B/0101', 'C/0101', 'D/0101'], []), '4 hexes in 4 sectors');
});

test('records by kind with avatars, the gallery once per image, more by the author', () => {
    const img = (n, caption) => ({ hash: H(n), thumbHash: H(n + 1), width: 10, height: 10, bytes: 1, ...(caption ? { caption } : {}) });
    const rows = publicRecords([
        { id: 'r1', name: 'Zed', type: 'person', images: [img(1)] },
        { id: 'r2', name: 'Anna', type: 'person' },
        { id: 'r3', name: 'Beowulf', type: 'vessel', images: [img(3, 'Docked'), img(1)] },
        { id: 'r4', name: 'Gone', type: 'note', deleted: true },
        { name: 'no id' },
        'junk',
    ]);
    assert.deepEqual(rows.map((row) => row.id), ['r1', 'r2', 'r3']);
    const groups = recordGroups(rows);
    assert.deepEqual(groups.map((group) => [group.words, group.items.map((item) => item.name)]), [['People', ['Anna', 'Zed']], ['Ships', ['Beowulf']]]);
    assert.equal(groups[0].items[1].thumbHash, H(2));
    assert.equal(groups[0].items[0].thumbHash, null);
    const gallery = galleryImages(rows);
    assert.deepEqual(gallery.map((image) => [image.hash, image.caption]), [[H(1), 'Zed'], [H(3), 'Docked']]);
    const cards = [card({ id: 'a', authorHandle: 'varn', installs: 1 }), card({ id: 'b', authorHandle: 'varn', installs: 5 }), card({ id: 'c', authorHandle: 'other' }), card({ id: 'd', authorHandle: 'varn', hidden: true }), card({ id: 'e' }), card({ id: 'f' }), card({ id: 'g' })];
    assert.deepEqual(moreBy(cards, 'varn', 'a').map((item) => item.id), ['b', 'e', 'f', 'g']);
});

test('version contents: the manifest, then the records list by its hash; null when the manifest is missing', async () => {
    const asked = [];
    const fake = async (url) => {
        asked.push(url);
        if (url.endsWith('/manifest.json')) return new Response(JSON.stringify({ hexes: { 'B/0101': {}, 'A/0101': {} }, ownSectors: { B: { x: 0, y: 0 } }, records: { contentHash: 'rh' } }));
        if (url.endsWith('/objects/rh')) return new Response(JSON.stringify([{ id: 'r1', name: 'One', type: 'person', images: [] }]));
        return new Response('', { status: 404 });
    };
    const got = await versionContents(fake, CDN + '/', 'pk_1', 2);
    assert.deepEqual(asked, [CDN + '/packages/pk_1/2/manifest.json', CDN + '/objects/rh']);
    assert.deepEqual(got, { keys: ['A/0101', 'B/0101'], ownSectors: ['B'], records: [{ id: 'r1', name: 'One', type: 'person', images: [] }] });
    assert.equal(await versionContents(async () => new Response('', { status: 404 }), CDN, 'pk_1', 2), null);
    const noRecords = async (url) => (url.endsWith('manifest.json') ? new Response(JSON.stringify({ hexes: { 'A/0101': {} }, records: { contentHash: 'gone' } })) : new Response('', { status: 404 }));
    assert.equal((await versionContents(noRecords, CDN, 'pk_1', 1)).records, null);
});

test('the cover on the wire: one multipart form with image, thumb, hash and thumbHash (F17)', async () => {
    const upload = { image: new Uint8Array([1, 2, 3]), thumb: new Uint8Array([4]), hash: H(1), thumbHash: H(2) };
    const form = coverForm(upload);
    assert.equal(form.get('hash'), H(1));
    assert.equal(form.get('thumbHash'), H(2));
    assert.equal(form.get('image').type, 'image/webp');
    assert.equal(form.get('image').size, 3);
    assert.equal(form.get('thumb').size, 1);
    const calls = [];
    const fake = async (url, init) => {
        calls.push({ url, init });
        return new Response(JSON.stringify({ ok: true, data: { cover: init.method === 'PUT' ? { hash: H(1), thumbHash: H(2), source: 'upload' } : null } }), { status: 200 });
    };
    const wire = marketWire(fake);
    assert.deepEqual(await wire.putCover('pk 1', upload), { hash: H(1), thumbHash: H(2), source: 'upload' });
    assert.equal(calls[0].url, '/api/packages/pk%201/cover');
    assert.equal(calls[0].init.method, 'PUT');
    assert.ok(calls[0].init.body instanceof FormData);
    // No JSON content type: the browser writes the multipart boundary.
    assert.equal(new Headers(calls[0].init.headers).get('content-type'), null);
    assert.equal(calls[0].init.credentials, 'same-origin');
    assert.equal(await wire.dropCover('pk 1'), null);
    assert.equal(calls[1].init.method, 'DELETE');
    const refused = marketWire(async () => new Response(JSON.stringify({ ok: false, error: { code: 'too_large', message: 'A cover is at most 2 MB.' } }), { status: 400 }));
    await assert.rejects(refused.putCover('pk_1', upload), /A cover is at most 2 MB\./);
});

test('a cover is read at the limits, the quality stepping down until it fits', async () => {
    const seen = [];
    const encode = async (_file, longest, quality) => {
        seen.push([longest, quality]);
        const big = longest === COVER_LIMITS.side ? (quality > 0.8 ? COVER_LIMITS.bytes + 1 : 1000) : 100;
        return { bytes: new Uint8Array(big), width: longest, height: Math.round(longest * 9 / 16) };
    };
    const file = { type: 'image/png', size: 5000, name: 'shot.png' };
    const made = await prepareCover(file, encode);
    assert.equal(made.ok, true);
    assert.deepEqual(seen, [[1600, 0.85], [1600, 0.72], [640, 0.85]]);
    assert.match(made.cover.hash, /^[0-9a-f]{64}$/);
    assert.match(made.cover.thumbHash, /^[0-9a-f]{64}$/);
    assert.equal(made.cover.bytes, 1000);
    const never = await prepareCover(file, async (_f, longest) => ({ bytes: new Uint8Array(COVER_LIMITS.bytes + 1), width: longest, height: 1 }));
    assert.deepEqual(never, { ok: false, message: 'This image is too detailed to fit in 2 MB. Try a smaller picture.' });
    assert.deepEqual(await prepareCover({ type: 'text/plain', size: 1, name: 'a.txt' }, encode), { ok: false, message: 'a.txt is not an image.' });
    assert.deepEqual(await prepareCover(file, async () => null), { ok: false, message: 'This browser cannot encode WebP.' });
});

test("a new package's cover goes up once the package exists; a refusal is kept for its page", async () => {
    const queue = [];
    const store = fakeMarketStore({ schedule: (fn) => queue.push(fn) });
    useMarketStore(store);
    closePublish();
    Object.assign(marketUi, { target: 'new', title: 'Hollow Verge', kind: 'sector piece', description: '', tags: '', left: [], busy: false, error: '', madeId: '' });
    session.user = { id: 'me', email: null, role: 'user', profile: { handle: 'varn' } };
    campaign.universes = [{ id: 'u1', ownerId: 'me' }];
    const sent = [];
    useCoverSender(async (packageId, cover) => { sent.push([packageId, cover.hash]); });
    coverDraft.value = { image: new Uint8Array([1]), thumb: new Uint8Array([2]), hash: H(1), thumbHash: H(2) };
    const path = await publish({ id: 'u1', truthVersion: 'v5' }, ['A/0101'], []);
    const id = store.listings()[0].id;
    assert.equal(path, '/packages/' + id + '?version=1');
    assert.deepEqual(sent, [[id, H(1)]]);
    assert.equal(coverDraft.value, null);
    assert.equal(coverMissed.value, null);

    // A refusal does not stop the publish: the page says it.
    Object.assign(marketUi, { target: 'new', title: 'Second', kind: 'ships' });
    useCoverSender(async () => { throw new Error('A cover is a WebP image.'); });
    coverDraft.value = { image: new Uint8Array([1]), thumb: new Uint8Array([2]), hash: H(3), thumbHash: H(4) };
    assert.ok(await publish({ id: 'u1', truthVersion: 'v5' }, ['A/0102'], []));
    assert.deepEqual(coverMissed.value, { packageId: store.listings()[0].id, message: 'A cover is a WebP image.' });

    // A new version of an existing package sends no cover from the form.
    sent.length = 0;
    useCoverSender(async (packageId) => { sent.push(packageId); });
    Object.assign(marketUi, { target: id });
    coverDraft.value = { image: new Uint8Array([1]), thumb: new Uint8Array([2]), hash: H(5), thumbHash: H(6) };
    assert.ok(await publish({ id: 'u1', truthVersion: 'v5' }, ['A/0101'], []));
    assert.deepEqual(sent, []);
    useCoverSender(null);
    useMarketStore(null);
    coverMissed.value = null;
    session.user = null;
});

test('the store chrome stays neutral: no money words, cyan only for actions', () => {
    const files = ['PackagesView.vue', 'ProductPage.vue', 'StoreCard.vue', 'CoverEditor.vue', 'storefront.ts']
        .map((name) => readFileSync(new URL('../../apps/web/src/workspace/market/' + name, import.meta.url), 'utf8'));
    for (const text of files) {
        const shown = text.replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '').replace(/<!--[\s\S]*?-->/g, '');
        assert.doesNotMatch(shown, /\b(price|prices|cart|checkout|buy now|purchase|\$\d|free)\b/i);
    }
    const card = files[2];
    // The one thing over the art is the badge, and it carries no colour of its own.
    assert.match(card, /\.mk-badge \{[\s\S]*?background: var\(--store-badge\);/);
    assert.doesNotMatch(card, /\.mk-cover[^{]*\{[^}]*var\(--signal/);
});
