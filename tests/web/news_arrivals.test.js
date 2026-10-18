/**
 * XA2. A chain of three systems. 0101–0104 is a bare X-boat leg of three
 * parsecs, outside the off-network range, so a station hold stays on that
 * leg. 0104–0106 is two parsecs and is the off-network leg. 0101–0106 is
 * five parsecs and has no direct edge.
 * The 3 × 3 block cannot be built here. The other eight sectors' raw files
 * are not in git, so that size stays a report measurement.
 */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { parseMetadataXml, parseT5Tab } from '@voyage/shared';
import { newsArrivals } from '../../apps/web/src/news/arrivals.ts';
import { buildNewsGraph } from '../../apps/web/src/news/graph.ts';
import { NEWS_PARAMS } from '../../apps/web/src/news/params.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function chain() {
    return buildNewsGraph([{
        slug: 'Fix',
        x: 0,
        y: 0,
        hexes: { '0101': {}, '0104': {}, '0106': {} },
        metadata: { routes: [{ Start: '0101', End: '0104' }] },
    }], [], { ...NEWS_PARAMS, offNetworkWaitHours: 0 });
}

function day(hours) {
    return hours / 24;
}

function row(result, key) {
    const found = result.arrivals.get(key);
    assert.ok(found, key);
    return found;
}

test('hold and wait move the hand-computed days, and earliest stays under latest', () => {
    const graph = chain();
    assert.equal(graph.xboatEdges, 1);
    assert.equal(graph.offEdges, 1);

    const plain = newsArrivals(graph, NEWS_PARAMS, 'Fix/0101', {
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    assert.equal(row(plain, 'Fix/0101').likely, 0);
    assert.equal(row(plain, 'Fix/0104').likely, day(169));
    assert.equal(row(plain, 'Fix/0106').likely, day(169) + day(169));
    assert.equal(row(plain, 'Fix/0104').earliest, day(154));
    assert.equal(row(plain, 'Fix/0106').earliest, day(154) + day(154));
    assert.equal(row(plain, 'Fix/0104').latest, day(184));
    assert.equal(row(plain, 'Fix/0106').latest, day(184) + day(184));

    const held = newsArrivals(graph, NEWS_PARAMS, 'Fix/0101', {
        stationHoldHours: 24,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    assert.equal(row(held, 'Fix/0104').likely, day(193));
    assert.equal(row(held, 'Fix/0106').likely, day(193) + day(169));

    const waited = newsArrivals(graph, NEWS_PARAMS, 'Fix/0101', {
        stationHoldHours: 0,
        offNetworkWaitHours: 48,
        horizonDays: null,
    });
    assert.equal(row(waited, 'Fix/0104').likely, day(169));
    assert.equal(row(waited, 'Fix/0106').likely, day(169) + day(48 + 169));

    for (const result of [plain, held, waited]) {
        for (const days of result.arrivals.values()) {
            assert.ok(days.earliest !== null && days.likely !== null && days.latest !== null);
            assert.ok(days.earliest <= days.likely && days.likely <= days.latest);
        }
    }
    assert.deepEqual(plain.wanted, [
        { sx: -1, sy: -1 },
        { sx: -1, sy: 0 },
        { sx: 0, sy: -1 },
    ]);
});

test('a horizon leaves the rest unreached, and an unknown source does not throw', () => {
    const graph = chain();
    const stopped = newsArrivals(graph, NEWS_PARAMS, 'Fix/0101', {
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: 1,
    });
    assert.equal(row(stopped, 'Fix/0101').earliest, 0);
    assert.equal(row(stopped, 'Fix/0101').likely, 0);
    assert.equal(row(stopped, 'Fix/0101').latest, 0);
    assert.equal(row(stopped, 'Fix/0104').earliest, null);
    assert.equal(row(stopped, 'Fix/0104').likely, null);
    assert.equal(row(stopped, 'Fix/0104').latest, null);
    assert.equal(row(stopped, 'Fix/0106').likely, null);

    const missing = newsArrivals(graph, NEWS_PARAMS, 'Fix/0199', { horizonDays: null });
    assert.equal(missing.arrivals.size, 3);
    for (const days of missing.arrivals.values()) {
        assert.equal(days.earliest, null);
        assert.equal(days.likely, null);
        assert.equal(days.latest, null);
    }
    assert.deepEqual(missing.wanted, []);
});

test('reverse mode equals forward mode on a two-way graph, and walks a one-way arc backwards', () => {
    const graph = chain();
    const forward = newsArrivals(graph, NEWS_PARAMS, 'Fix/0101', {
        mode: 'from',
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    const back = newsArrivals(graph, NEWS_PARAMS, 'Fix/0101', {
        mode: 'to',
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    assert.deepEqual([...back.arrivals], [...forward.arrivals]);

    const oneWay = {
        nodes: [
            { key: 'Fix/0101', slug: 'Fix', hex: '0101', q: 0, r: 0, loaded: true },
            { key: 'Fix/0102', slug: 'Fix', hex: '0102', q: 0, r: 1, loaded: true },
        ],
        offsets: Uint32Array.from([0, 1, 1]),
        targets: Uint32Array.from([1]),
        kinds: Uint8Array.from([0]),
        weights: Float32Array.from([0]),
        xboatEdges: 1,
        offEdges: 0,
    };
    const out = newsArrivals(oneWay, NEWS_PARAMS, 'Fix/0101', {
        mode: 'from',
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    const into = newsArrivals(oneWay, NEWS_PARAMS, 'Fix/0101', {
        mode: 'to',
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    assert.equal(row(out, 'Fix/0102').likely, day(169));
    assert.equal(row(into, 'Fix/0102').likely, null);
    const intoFar = newsArrivals(oneWay, NEWS_PARAMS, 'Fix/0102', {
        mode: 'to',
        stationHoldHours: 0,
        offNetworkWaitHours: 0,
        horizonDays: null,
    });
    assert.equal(row(intoFar, 'Fix/0101').likely, day(169));
});

test('Spinward Marches from 1910, with no horizon, finishes in under 25 ms', () => {
    const tsv = fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.tsv'), 'utf8');
    const xml = fs.readFileSync(path.join(ROOT, 'universe/raw/Spinward_Marches.xml'), 'utf8');
    const rows = parseT5Tab(tsv);
    const meta = parseMetadataXml(xml);
    const hexes = {};
    for (const [hex, row] of rows) {
        if (row.type !== 'SYSTEM_PRESENT') continue;
        hexes[hex] = { name: row.name };
    }
    const graph = buildNewsGraph([{
        slug: 'Spinward_Marches',
        x: -4,
        y: -1,
        hexes,
        metadata: { routes: meta.routes },
    }], [], NEWS_PARAMS);
    const started = performance.now();
    const result = newsArrivals(graph, NEWS_PARAMS, 'Spinward_Marches/1910', { horizonDays: null });
    const elapsed = performance.now() - started;
    assert.equal(row(result, 'Spinward_Marches/1910').likely, 0);
    let reached = 0;
    for (const days of result.arrivals.values()) {
        if (days.likely !== null) reached += 1;
        if (days.earliest !== null && days.likely !== null && days.latest !== null) {
            assert.ok(days.earliest <= days.likely && days.likely <= days.latest);
        }
    }
    assert.ok(reached > 1);
    // A quiet walk is a few milliseconds. The suite runs this file beside the others, so 5 ms fails on a busy machine.
    assert.ok(elapsed < 25, 'arrivals took ' + elapsed);
});
