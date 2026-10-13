/**
 * Overview dots: one fetch per page of 32, then If-None-Match for a sector that changed.
 */
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { cellIndex, dotPages } from '../../apps/web/src/builder/dots.ts';
import { openMap } from '../../apps/web/src/builder/store.ts';

const KEY = 'spin/1910';
const STAMP = 'ab'.repeat(32);
const HASH = 'cd'.repeat(32);

function emptyCells() {
    return '.'.repeat(1280);
}

function withChar(cells, local, ch) {
    const at = cellIndex(local);
    return cells.slice(0, at) + ch + cells.slice(at + 1);
}

function page(slugs, cells) {
    return {
        ok: true,
        data: {
            sectors: slugs.map((sector) => ({ sector, cells, stamp: STAMP })),
            stamp: STAMP,
        },
    };
}

function fake(handler) {
    const calls = [];
    const fetchImpl = async (url, init = {}) => {
        const body = init.body ? JSON.parse(init.body) : null;
        const headers = init.headers && typeof init.headers.get === 'function'
            ? init.headers.get('If-None-Match')
            : '';
        const call = { url, method: init.method, body, match: headers || '' };
        calls.push(call);
        return handler(call);
    };
    fetchImpl.calls = calls;
    return fetchImpl;
}

function json(data, status = 200) {
    return { ok: status >= 200 && status < 300, status, json: async () => ({ ok: true, data }) };
}

function open(fetchImpl) {
    return openMap({
        fetch: fetchImpl,
        truthVersion: 'v9',
        universeId: 'uni-1',
        universeName: 'Mine',
        seed: 'TravellerMagnus',
        settings: { generationPopMax: 1 },
    });
}

test('cell index is the overview order, and pages hold 32', () => {
    assert.equal(cellIndex('0101'), 0);
    assert.equal(cellIndex('1910'), (19 - 1) * 40 + (10 - 1));
    assert.equal(cellIndex('3240'), 1279);
    assert.equal(cellIndex('0141'), null);
    const slugs = [];
    for (let i = 0; i < 40; i += 1) slugs.push('s' + i);
    const pages = dotPages(slugs);
    assert.equal(pages.length, 2);
    assert.equal(pages[0].length, 32);
    assert.equal(pages[1].length, 8);
});

test('a cold view of 40 sectors is two requests, and a second look asks for nothing', async () => {
    const slugs = [];
    for (let i = 0; i < 40; i += 1) slugs.push('s' + i);
    const fetchImpl = fake((call) => {
        assert.equal(call.match, '');
        const list = new URL('http://local' + call.url).searchParams.get('sectors').split(',');
        return json(page(list, emptyCells()).data);
    });
    const map = open(fetchImpl);
    const chart = new Map(slugs.map((slug) => [slug, emptyCells()]));
    const first = await map.noteDots(slugs, chart);
    assert.equal(first.requests, 2);
    assert.equal(fetchImpl.calls[0].url.includes('/hexes/dots?sectors='), true);
    assert.equal(fetchImpl.calls[0].url.split('sectors=')[1].split(',').length, 32);
    assert.equal(fetchImpl.calls[1].url.split('sectors=')[1].split(',').length, 8);
    assert.ok(first.bytes > 40 * 1280);
    const again = await map.noteDots(slugs, chart);
    assert.deepEqual(again, { requests: 0, bytes: 0 });
    assert.equal(fetchImpl.calls.length, 2);
    assert.equal(map.dotOverlay().get('s0'), emptyCells());
    map.close();
});

test('a written hex shows at once, a removed chart dot goes, and Undo puts the chart character back', async () => {
    const chartCells = withChar(emptyCells(), '1910', 'A');
    let cells = chartCells;
    const fetchImpl = fake((call) => {
        if (call.url.includes('/dots')) {
            if (call.url.includes('sectors=')) return json({ sectors: [{ sector: 'spin', cells, stamp: STAMP }], stamp: STAMP });
            assert.equal(call.match, '"' + STAMP + '"');
            return json({ cells, stamp: STAMP });
        }
        if (call.url.endsWith('/generate')) {
            cells = withChar(cells, '1911', 'C');
            return json({
                rows: [{
                    hexKey: 'spin/1911',
                    state: 'override',
                    treeHash: HASH,
                    baseHash: null,
                    roll: 0,
                    rev: 1,
                    updatedAt: '2026-10-11T00:00:00.000Z',
                    entry: {
                        tree: HASH, type: 'SYSTEM_PRESENT', name: 'New', uwp: 'C766666-6',
                        allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null,
                    },
                }],
                skipped: [],
                leftEmpty: 0,
            });
        }
        if (call.url.endsWith('/remove')) {
            return json({
                hexKey: KEY, state: 'removed', treeHash: null, baseHash: HASH, roll: 0, rev: 2,
                updatedAt: '2026-10-11T00:00:00.000Z',
            });
        }
        if (call.url.endsWith('/revert')) {
            const parts = call.url.split('/');
            const local = parts[parts.length - 2];
            const hexKey = 'spin/' + local;
            cells = chartCells;
            // The generated hex had no row before. Undo returns it to the chart.
            if (local === '1911') {
                return json({ hexKey, state: 'truth', treeHash: null, baseHash: null, roll: 0, rev: 0 });
            }
            return json({
                hexKey, state: 'override', treeHash: HASH, baseHash: null, roll: 0, rev: 3,
                updatedAt: '2026-10-11T00:00:00.000Z',
                entry: {
                    tree: HASH, type: 'SYSTEM_PRESENT', name: 'Regina', uwp: 'A788899-C',
                    allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null,
                },
            });
        }
        throw new Error('unexpected ' + call.method + ' ' + call.url);
    });
    const map = open(fetchImpl);
    await map.noteDots(['spin'], new Map([['spin', chartCells]]));
    assert.equal(map.dotOverlay().get('spin').charAt(cellIndex('1910')), 'A');
    const made = await map.generate({
        hexKeys: ['spin/1911'], edition: 'MgT2E', generator: 'top-down', roll: 0, filledToo: false,
    }).finished;
    assert.equal(map.dotOverlay().get('spin').charAt(cellIndex('1911')), 'C');
    const token = map.remove([KEY], () => ({
        tree: HASH, type: 'SYSTEM_PRESENT', name: 'Regina', uwp: 'A788899-C',
        allegiance: '', zone: '', bases: '', tradeCodes: [], pbg: '', ix: 0, partial: null,
    }));
    assert.equal(map.dotOverlay().get('spin').charAt(cellIndex('1910')), '.');
    await map.undo(token);
    assert.equal(map.dotOverlay().get('spin').charAt(cellIndex('1910')), 'A');
    await map.undo(made.undo);
    assert.equal(map.dotOverlay().get('spin').charAt(cellIndex('1911')), '.');
    const started = Date.now();
    while (fetchImpl.calls.filter((call) => call.url.endsWith('/spin/dots')).length < 1) {
        if (Date.now() - started > 1000) throw new Error('the changed sector was not asked again');
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    assert.equal(fetchImpl.calls.some((call) => call.url.includes('sectors=') && call.match !== ''), false);
    map.close();
});
